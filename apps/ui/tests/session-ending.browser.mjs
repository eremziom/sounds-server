import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

let session;
let active = true;
let mode = "active";
let refreshCalls = 0;
let logoutCalls = 0;
let sequence = 0;
let allowPreviousLogout = false;
let refreshGate, releaseRefresh, logoutGate, releaseLogout;
function newSession(lifetime = 900_000) {
  const expiry = Math.floor((Date.now() + lifetime) / 1000) * 1000;
  sequence++;
  return authSession({
    accessToken: `header.${Buffer.from(JSON.stringify({ exp: expiry / 1000, jti: sequence })).toString("base64url")}.signature`,
    refreshToken: sequence.toString(16).padStart(64, "0"),
    accessTokenExpiresAt: new Date(expiry).toISOString(),
  });
}
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.url === "/auth/refresh") {
    refreshCalls++;
    assert.equal(JSON.parse(body).refreshToken, session.refreshToken);
    if (mode === "unavailable") return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR" }));
    if (mode === "rate-limited") return res.writeHead(429).end(JSON.stringify({ code: "AUTH_RATE_LIMITED" }));
    if (mode === "invalid" || !active) return res.writeHead(401).end(JSON.stringify({ code: "AUTH_SESSION_INVALID" }));
    session = newSession();
    const result = session;
    if (refreshGate) await refreshGate;
    return res.end(JSON.stringify(result));
  }
  if (req.url === "/auth/logout" || req.url === "/auth/logout-all") {
    logoutCalls++;
    if (req.url === "/auth/logout") {
      if (!allowPreviousLogout) assert.equal(JSON.parse(body).refreshToken, session.refreshToken);
    } else assert.equal(req.headers.authorization, `Bearer ${session.accessToken}`);
    if (logoutGate) await logoutGate;
    if (mode === "logout-error") return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR" }));
    active = false;
    return res.writeHead(204).end();
  }
  if (req.url === "/auth/me" && active) {
    return res.end(JSON.stringify({ ...session.user, roles: [{ key: "USER" }, { key: "ADMIN" }] }));
  }
  res.writeHead(401).end(JSON.stringify({ code: "AUTH_SESSION_INVALID" }));
});
api.listen(0, "127.0.0.1");
await once(api, "listening");

// Short looping silent WAV, used to verify actual audio cleanup.
const wav = Buffer.alloc(44 + 1600);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(1600, 40);

try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, origin }) => {
    async function enter(locale) {
      mode = "active";
      allowPreviousLogout = false;
      active = true;
      refreshGate = logoutGate = undefined;
      session = newSession(180_000);
      await send("Network.setCookies", { cookies: [
        { name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true },
        { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
        { name: "locale", value: locale, url: origin, path: "/" },
      ] });
      await send("Page.navigate", { url: `${origin}/admin` });
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active'");
      await startMedia();
    }
    async function startMedia(targetSession) {
      const played = await send("Runtime.evaluate", {
        userGesture: true, awaitPromise: true, returnByValue: true,
        expression: `(async()=>{
          window.endingRoot=document.querySelector('[data-application-runtime]');
          window.endingAudio=document.querySelector('[data-persistent-media] audio');
          window.endingAnimation=document.querySelector('[data-animation-host]').animate([{opacity:0.9},{opacity:1}],{duration:30000,iterations:Infinity});
          endingAudio.src=${JSON.stringify(`data:audio/wav;base64,${wav.toString("base64")}`)};
          endingAudio.loop=true; await endingAudio.play(); return true;
        })()`,
      }, targetSession);
      assert.equal(played.exceptionDetails, undefined);
      assert.equal(played.result.value, true);
    }
    const triggerRefresh = () => evaluate(`window.realNow=Date.now; Date.now=()=>${Date.parse(session.accessTokenExpiresAt) + 1000}; window.dispatchEvent(new Event('focus'))`);
    async function assertStopped() {
      assert.equal(await evaluate("endingAudio.paused && !endingAudio.hasAttribute('src')"), true);
      assert.equal(await evaluate("endingAnimation.playState"), "idle");
    }
    async function assertCookiesCleared(locale) {
      const { cookies } = await send("Network.getCookies", { urls: [origin] });
      assert.ok(!cookies.some((cookie) => ["accessToken", "refreshToken"].includes(cookie.name)));
      assert.equal(cookies.find((cookie) => cookie.name === "locale")?.value, locale);
    }

    for (const locale of ["en", "pl", "es"]) {
      const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
      await enter(locale);
      mode = "invalid";
      const before = refreshCalls;
      await triggerRefresh();
      await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]')");
      assert.equal(refreshCalls, before + 1, "Expired access first attempts renewal");
      await assertStopped();
      await assertCookiesCleared(locale);

      await enter(locale);
      mode = "unavailable";
      const originalRefresh = session.refreshToken;
      await triggerRefresh();
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='unavailable'");
      assert.equal(await evaluate("endingRoot===document.querySelector('[data-application-runtime]')"), true);
      assert.equal(await evaluate("document.querySelector('[data-session-recovery] [role=alert]').textContent"), messages.auth.session.unavailable);
      assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-application-page]')).display"), "none");
      await assertStopped();
      const { cookies } = await send("Network.getCookies", { urls: [origin] });
      assert.equal(cookies.find((cookie) => cookie.name === "refreshToken")?.value, originalRefresh);
      const failedCalls = refreshCalls;
      await evaluate("window.dispatchEvent(new Event('focus')); document.querySelector('header a[href=\"/admin\"]').click()");
      await delay(150);
      assert.equal(refreshCalls, failedCalls, "Unknown outcome is not retried by focus/navigation");
      mode = "active";
      await evaluate("Date.now=realNow; document.querySelector('[data-session-recovery] button').click()");
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active' && !document.querySelector('[data-session-recovery]')");
      assert.equal(await evaluate("endingRoot===document.querySelector('[data-application-runtime]')"), true);
      assert.equal(await evaluate("endingAudio===document.querySelector('[data-persistent-media] audio')"), true);

      await enter(locale);
      mode = "rate-limited";
      const rateLimitedRefresh = session.refreshToken;
      await triggerRefresh();
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='unavailable'");
      assert.equal(await evaluate("document.querySelector('[data-session-recovery] [role=alert]').textContent"), messages.errors.rateLimited);
      assert.equal((await send("Network.getCookies", { urls: [origin] })).cookies.find((cookie) => cookie.name === "refreshToken")?.value, rateLimitedRefresh);

      for (const scope of ["current", "all"]) {
        await enter(locale);
        refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
        logoutGate = new Promise((resolve) => { releaseLogout = resolve; });
        const beforeLogout = logoutCalls;
        await triggerRefresh();
        await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='refreshing'");
        await evaluate(`document.querySelector('form[data-auth-logout] button[data-logout-scope=${scope}]').click()`);
        await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='ended'");
        await assertStopped();
        assert.equal(logoutCalls, beforeLogout, "Logout waits behind the in-flight refresh action");
        await evaluate("Date.now=realNow");
        releaseRefresh();
        for (let attempt = 0; logoutCalls === beforeLogout; attempt++) {
          assert.ok(attempt < 100, "Logout must dispatch after refresh");
          await delay(100);
        }
        assert.equal(await evaluate("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus"), "ended", "Late refresh must not reactivate runtime");
        releaseLogout();
        await waitFor("location.pathname==='/logout' && document.querySelector('[data-logout-result]')");
        await assertCookiesCleared(locale);
        await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]')");
        await assertCookiesCleared(locale);
      }
      for (const scope of locale === "en" ? ["current", "all", "local", "race"] : ["current", "all", "local"]) {
        await enter(locale);
        const { targetId } = await send("Target.createTarget", { url: `${origin}/admin` });
        const { sessionId: peer } = await send("Target.attachToTarget", { targetId, flatten: true });
        await send("Runtime.enable", {}, peer);
        const peerEvaluate = async (expression) => {
          const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, peer);
          assert.equal(response.exceptionDetails, undefined);
          return response.result.value;
        };
        const peerWait = async (expression) => {
          for (let attempt = 0; ; attempt++) {
            if (await peerEvaluate(expression)) return;
            assert.ok(attempt < 100, `Peer timeout: ${expression}`);
            await delay(100);
          }
        };
        try {
          await peerWait("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active'");
          await startMedia(peer);
          await peerEvaluate("window.logoutMessages=[]; window.observer=new BroadcastChannel('sounds:auth'); observer.onmessage=e=>logoutMessages.push(e.data)");
          if (scope === "race") {
            allowPreviousLogout = true;
            refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
            await peerEvaluate(`Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'}); window.realNow=Date.now; Date.now=()=>${Date.parse(session.accessTokenExpiresAt) + 1000}; window.dispatchEvent(new Event('focus'))`);
            await peerWait("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='refreshing'");
            await delay(100);
          }
          logoutGate = new Promise((resolve) => { releaseLogout = resolve; });
          const beforeLogout = logoutCalls;
          await evaluate(`document.querySelector('form[data-auth-logout] button[data-logout-scope=${scope === "all" ? "all" : "current"}]').click()`);
          for (let attempt = 0; logoutCalls === beforeLogout; attempt++) {
            assert.ok(attempt < 100);
            await delay(100);
          }
          assert.equal(await peerEvaluate("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus"), scope === "race" ? "refreshing" : "active", "Do not broadcast before the source action reads cookies");
          if (scope === "local") mode = "logout-error";
          releaseLogout();
          if (scope === "race") {
            await peerWait("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='ended'");
            assert.equal(await peerEvaluate("endingAudio.paused && endingAnimation.playState==='idle'"), true);
            await peerEvaluate("Date.now=realNow");
            releaseRefresh();
          }
          await peerWait("location.pathname==='/login' && !!document.querySelector('input[name=login]')");
          assert.equal(await peerEvaluate("endingAudio.paused && !endingAudio.hasAttribute('src') && endingAnimation.playState==='idle'"), true);
          await assertCookiesCleared(locale);
          await delay(150);
          assert.deepEqual(await peerEvaluate("logoutMessages"), ["logout"], "No tokens or echo messages");
          if (scope === "local") {
            await waitFor("document.querySelector('[data-logout-result] button')");
            await evaluate("document.querySelector('[data-logout-result] button').click()");
          }
          await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]')");
          await assertCookiesCleared(locale);
          if (locale === "en" && scope === "current") {
            await enter(locale);
            await send("Page.navigate", { url: `${origin}/admin` }, peer);
            await peerWait("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active'");
            await peerEvaluate("window.logoutMessages=[]; window.observer=new BroadcastChannel('sounds:auth'); observer.onmessage=e=>logoutMessages.push(e.data)");
            await waitFor("window.next?.router");
            await evaluate("window.next.router.push('/logout?status=success')");
            await waitFor("!!document.querySelector('[data-logout-result]')");
            await delay(200);
            assert.equal(await peerEvaluate("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus"), "active", "Revisiting a result page must not end a newer session");
            assert.deepEqual(await peerEvaluate("logoutMessages"), []);
          }
          await peerEvaluate("observer.close()");
        } finally {
          releaseRefresh?.();
          releaseLogout?.();
          await send("Target.closeTarget", { targetId });
        }
      }
      console.log(`Session end ${locale}: rejected refresh cleans cookies; outage blocks/retries without sign-out; current/all logout wins over late refresh OK`);
      console.log(`Cross-tab logout ${locale}: current/all/local sign-out stops peer media, clears cookies and redirects without tokens or echoes OK`);
    }
  });
} finally {
  releaseRefresh?.();
  releaseLogout?.();
  await new Promise((resolve) => api.close(resolve));
}
