import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

let mode = "success", session, refreshCalls = 0, sequence = 0;
let gate, release;
function newSession() {
  const expiry = Math.floor((Date.now() + 900_000) / 1000) * 1000;
  return authSession({
    accessToken: `header.${Buffer.from(JSON.stringify({ exp: expiry / 1000, jti: ++sequence })).toString("base64url")}.signature`,
    refreshToken: sequence.toString(16).padStart(64, "0"),
    accessTokenExpiresAt: new Date(expiry).toISOString(),
  });
}
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/refresh") {
    refreshCalls++;
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).refreshToken, session.refreshToken);
    if (gate) await gate;
    if (mode === "invalid") return res.writeHead(401).end(JSON.stringify({ code: "AUTH_SESSION_INVALID" }));
    if (mode === "outage") return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR" }));
    if (mode === "limited") return res.writeHead(429).end(JSON.stringify({ code: "AUTH_RATE_LIMITED" }));
    session = newSession();
    return res.end(JSON.stringify(session));
  }
  if (req.url === "/auth/me" && req.headers.authorization === `Bearer ${session.accessToken}` && mode !== "me-invalid") {
    return res.end(JSON.stringify({ ...session.user, roles: [{ key: mode === "denied" ? "USER" : "ADMIN" }] }));
  }
  res.writeHead(401).end(JSON.stringify({ code: "AUTH_SESSION_INVALID" }));
});
api.listen(0, "127.0.0.1");
await once(api, "listening");

try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, origin }) => {
    for (const locale of ["en", "pl", "es"]) {
      const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
      async function enter(nextMode, target = "/admin?view=users", expired = false) {
        mode = nextMode;
        session = newSession();
        refreshCalls = 0;
        gate = nextMode === "pending" ? new Promise((resolve) => { release = resolve; }) : undefined;
        await send("Network.deleteCookies", { name: "accessToken", url: origin });
        await send("Network.setCookies", { cookies: [
          { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
          { name: "locale", value: locale, url: origin, path: "/" },
          ...(expired ? [{ name: "accessToken", value: "expired.token.signature", url: origin, path: "/", httpOnly: true }] : []),
        ] });
        await send("Page.navigate", { url: `${origin}${target}` });
      }

      await enter("pending");
      await waitFor("document.querySelector('[data-session-resume]')");
      assert.equal(await evaluate("!!document.querySelector('[data-application-runtime], [data-persistent-media]')"), false);
      release();
      await waitFor("document.querySelector('[data-application-runtime]') && location.search==='?view=users'");

      for (const expired of [false, true]) {
        await enter("success", "/admin?view=users", expired);
        await waitFor("document.querySelector('[data-application-runtime]') && location.pathname==='/admin' && location.search==='?view=users'");
        assert.equal(refreshCalls, 1);
        assert.equal(await evaluate("document.documentElement.lang"), locale);
        assert.equal(await evaluate("document.cookie.includes('Token')"), false);
        const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
        assert.equal(cookies.find((c) => c.name === "accessToken").value, session.accessToken);
        assert.equal(cookies.find((c) => c.name === "refreshToken").value, session.refreshToken);
      }

      for (const failure of ["outage", "limited"]) {
        await enter(failure);
        await waitFor("document.querySelector('[data-session-resume] button:not(:disabled)')");
        assert.equal(refreshCalls, 1);
        assert.equal(await evaluate("!!document.querySelector('[data-application-runtime], [data-persistent-media]')"), false);
        const message = failure === "limited" ? messages.errors.rateLimited : messages.auth.session.unavailable;
        assert.equal(await evaluate("document.querySelector('[data-session-resume] [role=alert]').textContent"), message);
        const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
        assert.equal(cookies.find((c) => c.name === "refreshToken").value, session.refreshToken);
        mode = "success";
        await evaluate("document.querySelector('[data-session-resume] button').click()");
        await waitFor("document.querySelector('[data-application-runtime]') && location.search==='?view=users'");
        assert.equal(refreshCalls, 2);
      }

      await enter("invalid");
      await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]')");
      assert.equal(refreshCalls, 1);
      assert.equal((await send("Network.getCookies", { urls: [origin] })).cookies.some((c) => c.name === "refreshToken"), false);

      await enter("denied");
      await waitFor("location.pathname==='/access-denied'");
      assert.equal(refreshCalls, 1);
      assert.equal(await evaluate("!!document.querySelector('[data-application-runtime]')"), false);

      await enter("success", "/admin?__session_resumed=1");
      await waitFor("location.pathname==='/login'");
      assert.equal(refreshCalls, 0, "A rejected destination after recovery never retries automatically");

      // Caller-supplied destination headers cannot override the real URL.
      const response = await fetch(`${origin}/admin?view=users`, {
        redirect: "manual", headers: { Cookie: `refreshToken=${session.refreshToken}`, "x-sounds-request-target": "//evil.test" },
      });
      const body = await response.text();
      assert.ok(response.headers.get("location")?.includes("returnTo=%2Fadmin%3Fview%3Dusers") || body.includes("returnTo=%2Fadmin%3Fview%3Dusers"));
    }
  });
  console.log("Session entry recovery passed in en/pl/es: expired/missing access, outages, rate limits, retries, invalid refresh, roles and loop prevention.");
} finally {
  release?.();
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
}
