import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";
import { authSession } from "./helpers/auth-fixtures.mjs";

const token = (expiresAt) => `header.${Buffer.from(JSON.stringify({ exp: Math.floor(expiresAt / 1000) })).toString("base64url")}.signature`;

let userId = 1;
let mode = "active";
let gate;
let release;
let refreshCalls = 0;
let rotated;
const api = createServer(async (req, res) => {
  if (req.url === "/auth/refresh") {
    refreshCalls++;
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.match(JSON.parse(body).refreshToken, /^[a-f0-9]{64}$/);
    const expiresAt = Math.floor((Date.now() + (refreshCalls % 2 === 1 ? 120_000 : 600_000)) / 1000) * 1000;
    rotated = authSession({
      accessToken: token(expiresAt),
      accessTokenExpiresAt: new Date(expiresAt).toISOString(),
      refreshToken: refreshCalls.toString(16).padStart(64, "0"),
      user: { id: userId, username: "User", email: "user@example.com", isActive: true, roles: [{ key: "USER" }, { key: "ADMIN" }] },
    });
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(rotated));
  }
  if (req.url !== "/auth/me") return res.writeHead(404).end();
  if (mode === "held") await gate;
  if (mode === "ended" || !req.headers.authorization) {
    return res.writeHead(401).end(JSON.stringify({ code: "AUTH_REQUIRED" }));
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ id: userId, isActive: true, roles: [{ key: "USER" }, { key: "ADMIN" }] }));
});
api.listen(0, "127.0.0.1");
await once(api, "listening");

try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, choose, origin }) => {
    const catalogs = Object.fromEntries(await Promise.all(["en", "pl", "es"].map(async (locale) => [
      locale, JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")),
    ])));
    await send("Page.navigate", { url: `${origin}/` });
    await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]')");
    assert.equal(await evaluate("!!document.querySelector('[data-application-runtime]')"), false);

    for (const locale of ["en", "pl", "es"]) {
      const callsBefore = refreshCalls;
      mode = "active";
      userId = 1;
      await send("Network.setCookies", { cookies: [
        { name: "accessToken", value: token(Date.now() + 65_000), url: origin, path: "/", httpOnly: true },
        { name: "refreshToken", value: "a".repeat(64), url: origin, path: "/", httpOnly: true },
        { name: "locale", value: locale, url: origin, path: "/" },
      ] });
      await send("Page.navigate", { url: `${origin}/admin` });
      await waitFor("document.querySelector('[data-application-runtime]') && window.next?.router");
      // A real, silent WAV and Web Animation stand in for the future player and
      // engine. The test exercises the actual persistent audio/animation hosts.
      const started = await send("Runtime.evaluate", { userGesture: true, awaitPromise: true, returnByValue: true, expression: `
        (async () => {
          window.runtimeDocument = {};
          window.runtimeRoot = document.querySelector('[data-application-runtime]');
          window.runtimeAudio = document.querySelector('[data-persistent-media] audio');
          window.runtimeStage = document.querySelector('[data-animation-host]');
          window.runtimeAnimation = runtimeStage.animate([{opacity: 0.99}, {opacity: 1}], {duration: 30000, iterations: Infinity});
          const buffer = new ArrayBuffer(44 + 8000 * 60 * 2);
          const view = new DataView(buffer);
          const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
          text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE');
          text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
          view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
          view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, buffer.byteLength - 44, true);
          window.runtimeAudioUrl = URL.createObjectURL(new Blob([buffer], {type: 'audio/wav'}));
          runtimeAudio.src = runtimeAudioUrl;
          await runtimeAudio.play();
          return true;
        })()
      ` });
      assert.equal(started.result.value, true, JSON.stringify(started.exceptionDetails));
      await waitFor("runtimeAudio.currentTime>0");
      await waitFor("/^\\d{2}:\\d{2}$/.test(document.querySelector('[data-session-countdown]')?.textContent)");
      assert.ok((await evaluate("document.querySelector('[data-session-footer]').textContent")).includes(catalogs[locale].auth.session.expiresIn));
      await evaluate("window.initialCountdown=document.querySelector('[data-session-countdown]').textContent");
      await waitFor("document.querySelector('[data-session-countdown]').textContent!==initialCountdown");
      assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-session-footer]')).fontSize"), "12px");

      async function assertContinuous(before) {
        assert.equal(await evaluate("runtimeRoot===document.querySelector('[data-application-runtime]')"), true);
        assert.equal(await evaluate("runtimeAudio===document.querySelector('[data-persistent-media] audio')"), true);
        assert.equal(await evaluate("runtimeStage===document.querySelector('[data-animation-host]')"), true);
        assert.equal(await evaluate("runtimeAnimation.playState"), "running");
        assert.equal(await evaluate("runtimeAudio.paused"), false);
        assert.ok(await evaluate(`runtimeAudio.currentTime>=${before}`));
        assert.equal(await evaluate("document.querySelector('[data-application-runtime]').dataset.sessionStatus"), "active");
      }

      async function waitForRotation(expectedCalls) {
        for (let attempt = 0; attempt < 120; attempt++) {
          const { cookies } = await send("Network.getCookies", { urls: [origin] });
          if (refreshCalls === expectedCalls && cookies.find((cookie) => cookie.name === "refreshToken")?.value === rotated.refreshToken) {
            assert.equal(cookies.find((cookie) => cookie.name === "accessToken")?.value, rotated.accessToken);
            assert.ok(cookies.filter((cookie) => ["accessToken", "refreshToken"].includes(cookie.name)).every((cookie) => cookie.httpOnly));
            assert.equal(cookies.find((cookie) => cookie.name === "locale")?.value, locale);
            await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active'");
            return;
          }
          await delay(100);
        }
        assert.fail(`Expected refresh ${expectedCalls}, got ${refreshCalls}`);
      }

      // Actual background POST, cookie rotation and RSC re-render preserve media.
      const beforeRenewal = await evaluate("runtimeAudio.currentTime");
      await waitForRotation(callsBefore + 1);
      await waitFor("document.querySelector('[data-session-countdown]')?.textContent.startsWith('01:')");
      await assertContinuous(beforeRenewal);
      // Model a suspended tab: advance only its wall clock, then send the real
      // visibility event. The server and cookie expiration keep their real clock.
      await evaluate("window.runtimeRealNow=Date.now; Date.now=()=>runtimeRealNow()+61000; document.dispatchEvent(new Event('visibilitychange'))");
      await waitForRotation(callsBefore + 2);
      await evaluate("Date.now=runtimeRealNow; window.dispatchEvent(new Event('focus'))");
      await waitFor("/^0[89]:/.test(document.querySelector('[data-session-countdown]')?.textContent)");
      await assertContinuous(beforeRenewal);
      await delay(150);
      assert.equal(refreshCalls, callsBefore + 2, "Fresh tokens need no extra rotation on focus");

      // Test-only Next router access drives real client transitions without
      // introducing navigation controls or test routes into the product.
      const beforeNavigation = await evaluate("runtimeAudio.currentTime");
      await evaluate("window.next.router.push('/')");
      await waitFor(`location.pathname==='/' && document.querySelector('h1')?.textContent===${JSON.stringify(catalogs[locale].app.home.title)}`);
      await assertContinuous(beforeNavigation);
      await evaluate("window.next.router.push('/admin')");
      await waitFor(`location.pathname==='/admin' && document.querySelector('h1')?.textContent===${JSON.stringify(catalogs[locale].admin.home.title)}`);
      await assertContinuous(beforeNavigation);

      // Replacing a token cookie and writing locale re-render server layouts,
      // while a slow guard exercises Suspense without remounting media.
      await send("Network.setCookie", { name: "accessToken", value: "replacement-cookie-only", url: origin, path: "/", httpOnly: true });
      mode = "held";
      gate = new Promise((resolve) => { release = resolve; });
      const nextLocale = { en: "pl", pl: "es", es: "en" }[locale];
      const change = choose(nextLocale);
      await waitFor("document.querySelector('select[name=locale]').getAttribute('aria-disabled')==='true'");
      await delay(300);
      await assertContinuous(beforeNavigation);
      mode = "active";
      release();
      await change;
      await assertContinuous(beforeNavigation);
      assert.ok((await evaluate("document.querySelector('[data-session-footer]').textContent")).includes(catalogs[nextLocale].auth.session.expiresIn));

      // Switching accounts must intentionally discard the previous account's
      // runtime even if the route and document remain unchanged.
      userId = 2;
      await choose(locale);
      await waitFor("runtimeAudio!==document.querySelector('[data-persistent-media] audio')");
      assert.equal(await evaluate("runtimeAudio.paused && !runtimeAudio.hasAttribute('src')"), true);
      assert.equal(await evaluate("runtimeAnimation.playState"), "idle");
      assert.equal(await evaluate("!!window.runtimeDocument"), true);

      mode = "ended";
      await evaluate("window.next.router.refresh()");
      await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]')");
      assert.equal(await evaluate("!!document.querySelector('[data-application-runtime]')"), false);
      assert.equal(await evaluate("!!window.runtimeDocument"), true);
      await evaluate("URL.revokeObjectURL(runtimeAudioUrl)");
      assert.equal(refreshCalls, callsBefore + 2, "Only the scheduled and resume renewals should run");
      console.log(`Application runtime ${locale}: timer/resume rotate cookies without resetting audio/animation; navigation, account reset and session end OK`);
    }
  });
} finally {
  release?.();
  await new Promise((resolve) => api.close(resolve));
}
