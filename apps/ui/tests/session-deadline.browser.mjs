import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

let session, deadline, mode, sequence = 0, refreshCalls = 0, gate, release;
function newSession(accessLifetime) {
  const expiry = Math.floor((Date.now() + accessLifetime) / 1000) * 1000;
  return authSession({
    accessToken: `header.${Buffer.from(JSON.stringify({ exp: expiry / 1000, jti: ++sequence })).toString("base64url")}.signature`,
    refreshToken: sequence.toString(16).padStart(64, "0"),
    accessTokenExpiresAt: new Date(expiry).toISOString(),
    refreshTokenExpiresAt: new Date(deadline).toISOString(),
  });
}
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/refresh") {
    refreshCalls++;
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).refreshToken, session.refreshToken);
    if (mode === "outage") return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR" }));
    if (gate) await gate;
    session = newSession(900_000);
    return res.end(JSON.stringify(session));
  }
  if (req.url === "/auth/me" && req.headers.authorization === `Bearer ${session?.accessToken}` && Date.now() < deadline) {
    return res.end(JSON.stringify({ ...session.user, sessionExpiresAt: session.refreshTokenExpiresAt, roles: [{ key: "USER" }, { key: "ADMIN" }] }));
  }
  res.writeHead(401).end(JSON.stringify({ code: "AUTH_SESSION_INVALID" }));
});
api.listen(0, "127.0.0.1");
await once(api, "listening");

// Real looping audio and a real Web Animation verify cleanup, not only text.
const wav = Buffer.alloc(44 + 1600);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(1600, 40);

try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, origin }) => {
    async function enter(locale, lifetime = 180_000, accessLifetime = 120_000) {
      mode = "active";
      gate = undefined;
      refreshCalls = 0;
      deadline = Date.now() + lifetime;
      session = newSession(accessLifetime);
      await send("Network.setCookies", { cookies: [
        { name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true },
        { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
        { name: "locale", value: locale, url: origin, path: "/" },
      ] });
      await send("Page.navigate", { url: `${origin}/admin` });
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active'");
      const result = await send("Runtime.evaluate", {
        userGesture: true, awaitPromise: true, returnByValue: true,
        expression: `(async()=>{
          window.originalNow=Date.now;
          Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});
          window.deadlineAudio=document.querySelector('[data-persistent-media] audio');
          window.deadlineAnimation=document.querySelector('[data-animation-host]').animate([{opacity:0.9},{opacity:1}],{duration:30000,iterations:Infinity});
          deadlineAudio.src=${JSON.stringify(`data:audio/wav;base64,${wav.toString("base64")}`)};
          deadlineAudio.loop=true; await deadlineAudio.play(); return true;
        })()`,
      });
      assert.equal(result.exceptionDetails, undefined);
      assert.equal(result.result.value, true);
    }
    async function advanceTo(timestamp, event = "focus") {
      await evaluate(`Date.now=()=>${timestamp}; ${event === "visibilitychange" ? "document" : "window"}.dispatchEvent(new Event(${JSON.stringify(event)}))`);
    }
    async function assertFinished(locale) {
      await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]')");
      assert.equal(await evaluate("deadlineAudio.paused && !deadlineAudio.hasAttribute('src') && deadlineAnimation.playState==='idle'"), true);
      assert.equal(await evaluate("!!document.querySelector('[data-application-runtime], [data-persistent-media]')"), false);
      const { cookies } = await send("Network.getCookies", { urls: [origin] });
      assert.equal(cookies.some((c) => ["accessToken", "refreshToken"].includes(c.name)), false);
      assert.equal(cookies.find((c) => c.name === "locale")?.value, locale);
      assert.equal(await evaluate("document.documentElement.lang"), locale);
      await evaluate("Date.now=originalNow");
    }

    for (const locale of ["en", "pl", "es"]) {
      // The actual deadline timer ends idle playback while JWT is still valid.
      await enter(locale, 3_000, 900_000);
      await assertFinished(locale);
      assert.equal(refreshCalls, 0);

      // Renewal gives a longer-lived JWT, while the absolute session stays fixed.
      await enter(locale);
      const originalDeadline = session.refreshTokenExpiresAt;
      await advanceTo(Date.parse(session.accessTokenExpiresAt) - 59_000);
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active' && document.querySelector('[data-session-countdown]')?.textContent.startsWith('1')");
      assert.equal(refreshCalls, 1);
      assert.equal(session.refreshTokenExpiresAt, originalDeadline);
      assert.ok(Date.parse(session.accessTokenExpiresAt) > deadline);
      await advanceTo(deadline + 1, "visibilitychange");
      await assertFinished(locale);
      assert.equal(refreshCalls, 1, "Deadline must not attempt another refresh");

      // Focus must check the deadline even when an outage has blocked recovery.
      await enter(locale);
      mode = "outage";
      await advanceTo(Date.parse(session.accessTokenExpiresAt) - 59_000);
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='unavailable'");
      assert.equal(refreshCalls, 1);
      await advanceTo(deadline + 1);
      await assertFinished(locale);
      assert.equal(refreshCalls, 1);

      // Cleanup queues behind in-flight refresh. Its late cookie writes cannot
      // leave tokens behind or restore media after the local deadline has passed.
      await enter(locale);
      gate = new Promise((resolve) => { release = resolve; });
      await advanceTo(Date.parse(session.accessTokenExpiresAt) - 59_000);
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='refreshing'");
      await advanceTo(deadline + 1, "pageshow");
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='ended'");
      assert.equal(await evaluate("deadlineAudio.paused && deadlineAnimation.playState==='idle'"), true);
      assert.equal(await evaluate("!!document.querySelector('[data-application-page]')"), false);
      await evaluate("Date.now=originalNow");
      release();
      await assertFinished(locale);
      assert.equal(refreshCalls, 1);
      console.log(`Session deadline ${locale}: idle timer, fixed deadline after renewal, unavailable resume and late refresh cleanup passed`);
    }
  });
} finally {
  release?.();
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
}
