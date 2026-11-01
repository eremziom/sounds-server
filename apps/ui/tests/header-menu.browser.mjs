import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const session = authSession();
let failure = false;
let logoutCalls = 0;
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/me") {
    return res.end(JSON.stringify({ ...session.user, sessionExpiresAt: session.refreshTokenExpiresAt }));
  }
  if (req.url === "/auth/logout") {
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).refreshToken, session.refreshToken);
    logoutCalls++;
    return failure ? res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR" })) : res.writeHead(204).end();
  }
  res.writeHead(404).end();
});
api.listen(0, "127.0.0.1");
await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, origin }) => {
    for (const locale of ["pl", "en", "es"]) {
      const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
      for (failure of [false, true]) {
        await send("Network.setCookies", { cookies: [
          { name: "locale", value: locale, url: origin, path: "/" },
          { name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true },
          { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
        ] });
        await send("Page.navigate", { url: `${origin}/` });
        await waitFor("document.querySelector('[data-slot=dropdown-menu-trigger]')");
        assert.equal(await evaluate("!!document.querySelector('form[data-auth-logout] button')"), true, "Existing toolbar logout remains available");
        await waitFor("document.querySelector('[data-user-menu-logout-item]') || (document.querySelector('[data-slot=dropdown-menu-trigger]').click(), false)");
        assert.equal(await evaluate("document.querySelector('[data-user-menu-logout-item]').textContent.trim()"), messages.auth.logout.action);
        assert.equal(await evaluate("!!document.querySelector('[data-user-menu-logout-item] svg[aria-hidden=true]')"), true);
        const previousCalls = logoutCalls;
        await evaluate("document.querySelector('[data-user-menu-logout-item]').click()");
        await waitFor("location.pathname === '/logout' && document.querySelector('[data-logout-result]')");
        assert.equal(logoutCalls, previousCalls + 1);
        assert.equal(await evaluate("new URL(location.href).searchParams.get('status')"), failure ? "local" : "success");
        const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
        assert.equal(cookies.some(cookie => ["accessToken", "refreshToken"].includes(cookie.name)), false, "Menu logout clears both tokens even when API fails");
      }
    }
  });
  console.log("User menu logout passed in pl/en/es: icon, toolbar retained, server logout and local fallback.");
} finally {
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
}
