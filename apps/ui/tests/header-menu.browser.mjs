import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const session = authSession();
let failure = false;
let unavailable = false;
let logoutCalls = 0;
let gate, release;
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/me") {
    if (unavailable) return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR" }));
    return res.end(JSON.stringify({ ...session.user, permissions: [], sessionExpiresAt: session.refreshTokenExpiresAt }));
  }
  if (req.url === "/auth/refresh") return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR" }));
  if (req.url === "/auth/logout") {
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).refreshToken, session.refreshToken);
    logoutCalls++;
    if (gate) await gate;
    return failure ? res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR" })) : res.writeHead(204).end();
  }
  res.writeHead(404).end();
});
api.listen(0, "127.0.0.1");
await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, listeners, evaluate, waitFor, origin }) => {
    const openMenu = () => waitFor(`(() => {
      const trigger = document.querySelector('[data-slot=dropdown-menu-trigger]');
      if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      return !!document.querySelector('[data-slot=dropdown-menu-content][data-open] [data-user-menu-logout-item]');
    })()`);
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
        await waitFor("document.querySelector('[data-application-runtime]')");
        await waitFor("document.querySelector('form[data-auth-logout] button').getClientRects().length === 0");
        await openMenu();
        assert.equal(await evaluate("document.querySelector('[data-user-menu-logout-item]').textContent.trim()"), messages.auth.logout.action);
        assert.equal(await evaluate("!!document.querySelector('[data-user-menu-logout-item] svg[aria-hidden=true]')"), true);
        const previousCalls = logoutCalls;
        await evaluate("document.querySelector('[data-user-menu-logout-item]').click()");
        await waitFor("document.querySelector('[role=alertdialog]')");
        assert.equal(logoutCalls, previousCalls, "Opening confirmation must not log out");
        assert.equal(await evaluate("document.querySelector('[data-slot=alert-dialog-title]').textContent"), messages.auth.logoutConfirm.title);
        assert.equal(await evaluate("document.querySelector('[data-slot=alert-dialog-description]').textContent"), messages.auth.logoutConfirm.description);
        await waitFor("document.activeElement === document.querySelector('[data-slot=alert-dialog-cancel]')");
        await evaluate("document.querySelector('[data-slot=alert-dialog-cancel]').click()");
        await waitFor("!document.querySelector('[role=alertdialog]')");
        await waitFor("document.activeElement === document.querySelector('[data-slot=dropdown-menu-trigger]')");
        assert.equal(logoutCalls, previousCalls, "Cancel preserves the session");
        assert.equal(await evaluate("document.querySelector('[data-application-runtime]').dataset.sessionStatus"), "active");
        await openMenu();
        await evaluate("document.querySelector('[data-user-menu-logout-item]').click()");
        await waitFor("document.querySelector('[role=alertdialog]')");
        gate = new Promise(resolve => { release = resolve; });
        await evaluate("document.querySelector('[data-slot=alert-dialog-action]').click()");
        await waitFor("document.querySelector('[role=alertdialog][aria-busy=true]')");
        assert.equal(await evaluate("[...document.querySelectorAll('[role=alertdialog] button')].every(button => button.disabled)"), true);
        assert.equal(await evaluate("document.querySelector('[data-slot=alert-dialog-action]').textContent"), messages.auth.logout.pending);
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        assert.equal(await evaluate("!!document.querySelector('[role=alertdialog]')"), true, "Confirmation stays open while signing out");
        release();
        gate = undefined;
        await waitFor("location.pathname === '/logout' && document.querySelector('[data-logout-result]')");
        assert.equal(logoutCalls, previousCalls + 1);
        assert.equal(await evaluate("new URL(location.href).searchParams.get('status')"), failure ? "local" : "success");
        const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
        assert.equal(cookies.some(cookie => ["accessToken", "refreshToken"].includes(cookie.name)), false, "Menu logout clears both tokens even when API fails");
      }
    }
    const toolbarVisible = "!!document.querySelector('header form[data-auth-logout] button')?.getClientRects().length";
    await send("Network.setCookies", { cookies: [
      { name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true },
      { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
    ] });
    // Rendering this deliberate API failure logs the expected server error.
    const consoleListener = listeners.get("Runtime.consoleAPICalled");
    listeners.delete("Runtime.consoleAPICalled");
    unavailable = true;
    await send("Page.navigate", { url: `${origin}/` });
    await waitFor("document.querySelector('[data-page-error]')");
    await waitFor(toolbarVisible);
    unavailable = false;
    await evaluate("document.querySelector('[data-page-error] button').click()");
    await waitFor("document.querySelector('[data-application-runtime]')");
    assert.equal(await evaluate(toolbarVisible), false, "Successful retry hides toolbar logout without a reload");
    listeners.set("Runtime.consoleAPICalled", consoleListener);
    await send("Page.navigate", { url: `${origin}/resume` });
    await waitFor("document.querySelector('[data-session-resume] button:not(:disabled)')");
    await waitFor(toolbarVisible);
    failure = true;
    const previousCalls = logoutCalls;
    await evaluate("document.querySelector('header form[data-auth-logout] button').click()");
    await waitFor("location.pathname === '/logout' && document.querySelector('[data-logout-result]')");
    assert.equal(logoutCalls, previousCalls + 1, "Recovery toolbar logout still runs directly");
    assert.equal(await evaluate("new URL(location.href).searchParams.get('status')"), "local");
    assert.equal(await evaluate(toolbarVisible), false);
    const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
    assert.equal(cookies.some(cookie => ["accessToken", "refreshToken"].includes(cookie.name)), false);
  });
  console.log("User menu logout passed in pl/en/es: confirmation, cancellation, focus, pending state, server logout and local fallback.");
} finally {
  release?.();
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
}
