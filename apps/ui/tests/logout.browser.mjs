import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const sessions = [];
const calls = { current: 0, all: 0, refresh: 0 };
let mode = "normal";
let releaseOperation;
let gate;
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (req.url === "/auth/me") {
    const session = sessions.find((session) => session.accessToken === token && session.active);
    return session ? res.end(JSON.stringify({ ...session.user, sessionExpiresAt: session.refreshTokenExpiresAt }))
      : res.writeHead(401).end(JSON.stringify({ code: "AUTH_REQUIRED" }));
  }
  if (req.url === "/auth/refresh") { calls.refresh++; return res.writeHead(401).end(); }
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.url === "/auth/login" || req.url === "/auth/register") {
    const session = authSession({ accessToken: `header.payload${sessions.length + 1}.signature`, refreshToken: (sessions.length + 1).toString(16).padStart(64, "0") });
    sessions.push({ ...session, active: true });
    return res.writeHead(201).end(JSON.stringify(session));
  }
  const scope = req.url === "/auth/logout" ? "current" : req.url === "/auth/logout-all" ? "all" : null;
  if (!scope) return res.writeHead(404).end();
  calls[scope]++;
  const requestMode = mode;
  if (scope === "current") {
    assert.deepEqual(Object.keys(JSON.parse(body)), ["refreshToken"]);
    assert.equal(token, undefined);
  } else { assert.equal(body, ""); assert.ok(token); }
  if (requestMode.startsWith("held")) await gate;
  if (requestMode.endsWith("failure")) return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR", message: "private backend failure" }));
  if (scope === "all") {
    const session = sessions.find((session) => session.accessToken === token && session.active);
    if (!session) return res.writeHead(401).end(JSON.stringify({ code: "AUTH_REQUIRED" }));
    for (const candidate of sessions) if (candidate.user.id === session.user.id) candidate.active = false;
  } else {
    const session = sessions.find((session) => session.refreshToken === JSON.parse(body).refreshToken);
    if (session) session.active = false;
  }
  res.writeHead(204).end();
});
api.listen(0, "127.0.0.1");
await once(api, "listening");

try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, listeners, evaluate, waitFor, fill, submit, choose, open, origin }) => {
    const actionRequests = [];
    listeners.set("Network.requestWillBeSent", ({ request }) => {
      const actionId = Object.entries(request.headers).find(([key]) => key.toLowerCase() === "next-action")?.[1];
      if (request.method === "POST" && actionId) actionRequests.push({ id: actionId, url: request.url });
    });
    const readCookies = async () => (await send("Network.getCookies", { urls: [origin] })).cookies;
    async function signIn(locale) {
      mode = "normal";
      await open(locale, "/login");
      await fill({ login: "Tester", password: "Secret123!" });
      await submit();
      await waitFor("location.pathname==='/' && document.querySelector('h1') && document.querySelector('form[data-auth-logout]')");
      const cookies = await readCookies();
      return sessions.find((session) => session.accessToken === cookies.find((cookie) => cookie.name === "accessToken").value);
    }
    async function clickLogout(scope) {
      await evaluate(`document.querySelector('form[data-auth-logout] button[data-logout-scope=${scope}]').click()`);
    }
    async function assertSignedOut(locale, notice) {
      const m = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
      await waitFor(`document.documentElement.lang===${JSON.stringify(locale)} && (document.querySelector('[data-logout-result]') || document.querySelector('input[name=login]')) && !document.querySelector('form[data-auth-logout]')`);
      if (await evaluate("location.pathname==='/logout'")) {
        const text = notice === "local" ? m.auth.logout.localOnly
          : notice === "all-unconfirmed" ? m.auth.logoutAll.localOnly : m.auth.logout.success;
        await waitFor(`document.querySelector('[data-logout-result]').innerText.includes(${JSON.stringify(text)})`);
        assert.equal(await evaluate("new URL(location.href).searchParams.get('status')"), notice ?? "success");
        assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
        if (notice) {
          await delay(2300);
          assert.equal(await evaluate("location.pathname"), "/logout", "Failure stays visible until acknowledged");
          assert.equal(await evaluate("document.querySelector('[data-logout-result] button').textContent.trim()"), m.auth.logout.ok);
          await evaluate("document.querySelector('[data-logout-result] button').click()");
        } else {
          assert.equal(await evaluate("!!document.querySelector('[data-logout-result] button')"), false);
          await delay(1000);
          assert.equal(await evaluate("location.pathname"), "/logout", "Success must remain visible before the timer expires");
        }
      } else {
        assert.equal(notice, undefined, "A failure must show the result screen");
      }
      await waitFor(`location.pathname==='/login' && document.documentElement.lang===${JSON.stringify(locale)} && document.querySelector('input[name=login]') && !document.querySelector('form[data-auth-logout]')`);
      const cookies = await readCookies();
      assert.equal(cookies.find((cookie) => cookie.name === "locale").value, locale);
      assert.ok(!cookies.some((cookie) => ["accessToken", "refreshToken"].includes(cookie.name)));
      assert.equal(await evaluate("!!document.querySelector('form[data-auth-logout]')"), false);
      assert.equal(await evaluate("location.search"), "");
      assert.ok(!(await evaluate("document.body.innerText")).includes(m.auth.logout.localOnly));
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
      for (const path of ["/", "/admin"]) {
        const response = await evaluate(`fetch(${JSON.stringify(`${path}?logout-check=1`)}, {headers:{RSC:'1'},cache:'no-store'}).then(response=>response.text())`);
        assert.ok(response.includes("NEXT_REDIRECT;replace;/login;"));
        assert.ok(!response.includes(m.app.home.title));
        assert.ok(!response.includes(m.admin.home.placeholder));
      }
      assert.equal(calls.refresh, 0);
    }

    let logoutActionId;
    for (const locale of ["en", "pl", "es"]) {
      const m = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
      await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });
      const session = await signIn(locale);
      assert.equal(await evaluate("document.querySelector('form[data-auth-logout] button[data-logout-scope=current]').textContent.trim()"), m.auth.logout.action);
      assert.equal(await evaluate("document.querySelector('form[data-auth-logout] button[data-logout-scope=all]').textContent.trim()"), m.auth.logoutAll.action);
      const beforeGet = calls.current;
      await evaluate("fetch('/login?logout=local').then(response=>response.text())");
      assert.equal(calls.current, beforeGet, "GET must not mutate the session");
      assert.ok(session.active);
      await clickLogout("current");
      await assertSignedOut(locale);
      assert.equal(session.active, false);
      logoutActionId ??= actionRequests.at(-1)?.id;
      assert.ok(logoutActionId, "Logout must issue a Server Action POST");

      // Going back must revalidate rather than restoring usable protected routes.
      const navigated = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error("Back navigation did not occur")), 10000);
        const finish = () => { clearTimeout(timer); resolve(); };
        listeners.set("Page.navigatedWithinDocument", finish);
        listeners.set("Page.frameNavigated", finish);
      });
      await evaluate("history.back()");
      await navigated;
      listeners.delete("Page.navigatedWithinDocument");
      listeners.delete("Page.frameNavigated");
      await assertSignedOut(locale);
      await send("Page.navigate", { url: `${origin}/admin` });
      await assertSignedOut(locale);

      const expiredAccess = await signIn(locale);
      await send("Network.deleteCookies", { name: "accessToken", url: origin });
      await send("Page.navigate", { url: `${origin}/login` });
      await waitFor("document.querySelector('form[data-auth-logout] button[data-logout-scope=current]')");
      assert.equal(await evaluate("!!document.querySelector('form[data-auth-logout] button[data-logout-scope=all]')"), false);
      await clickLogout("current");
      await assertSignedOut(locale);
      assert.equal(expiredAccess.active, false, "Refresh token alone must revoke the session");

      for (const scope of ["current", "all"]) {
        const nextLocale = { en: "pl", pl: "es", es: "en" }[locale];
        for (const outcome of ["success", "failure"]) {
          const active = await signIn(locale);
          // A second independent session proves the scope of backend revocation.
          const secondResponse = await fetch(`http://127.0.0.1:${api.address().port}/auth/login`, { method: "POST", body: "{}" });
          const secondData = await secondResponse.json();
          const second = sessions.find((session) => session.accessToken === secondData.accessToken);
          mode = `held-${outcome}`;
          gate = new Promise((resolve) => { releaseOperation = resolve; });
          const previousCalls = calls[scope];
          await clickLogout(scope);
          await waitFor("document.querySelector('form[data-auth-logout] [aria-busy=true]')");
          assert.equal(await evaluate("[...document.querySelectorAll('form[data-auth-logout] button')].every(button=>button.disabled)"), true);
          assert.equal(await evaluate(`document.querySelector('form[data-auth-logout] button[data-logout-scope=${scope}]').textContent.trim()`), m.auth.logout.pending);
          assert.ok((await evaluate("document.querySelector('form[data-auth-logout]').textContent")).includes(m.auth.logout.pending));
          const change = choose(nextLocale);
          await waitFor("document.querySelector('[data-language-switcher]').getAttribute('aria-busy')==='true'");
          releaseOperation();
          await change;
          const notice = outcome === "failure" ? scope === "current" ? "local" : "all-unconfirmed" : undefined;
          await assertSignedOut(nextLocale, notice);
          assert.equal(calls[scope], previousCalls + 1, "Language change must not replay logout");
          assert.equal(active.active, outcome === "failure");
          assert.equal(second.active, outcome === "failure" || scope === "current");
          assert.ok(!(await evaluate("document.body.innerText")).includes("private backend failure"));
          if (outcome === "failure") {
            const shots = new URL("../.tmp/logout/", import.meta.url);
            await mkdir(shots, { recursive: true });
            const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
            await writeFile(new URL(`${scope}-${nextLocale}.png`, shots), Buffer.from(shot.data, "base64"));
          }
        }
      }

      // Use a captured public action ID with an unrelated Origin. Next's own
      // Origin/Host check must reject it before the backend operation runs.
      const protectedSession = await signIn(locale);
      const cookies = await readCookies();
      const beforeCsrf = calls.current;
      const response = await fetch(origin, {
        method: "POST", headers: {
          "Next-Action": logoutActionId, "Content-Type": "text/plain;charset=UTF-8",
          Origin: "https://untrusted.example", Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
        }, body: "[]", redirect: "manual",
      });
      await response.text();
      assert.ok(response.status >= 400, "Cross-origin action must be rejected");
      assert.equal(calls.current, beforeCsrf);
      assert.equal(protectedSession.active, true);
      const trusted = await fetch(origin, {
        method: "POST", headers: {
          "Next-Action": logoutActionId, "Content-Type": "text/plain;charset=UTF-8",
          Origin: origin, Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
        }, body: "[]", redirect: "manual",
      });
      await trusted.text();
      assert.ok([200, 303].includes(trusted.status), "The same action and payload must work with a trusted Origin");
      assert.equal(calls.current, beforeCsrf + 1);
      assert.equal(protectedSession.active, false);
      console.log(`Logout ${locale}: POST, expired access, local/all revocation, outage notice, pending locale changes, back/RSC and Origin protection OK`);
    }
  });
} finally {
  releaseOperation?.();
  await new Promise((resolve) => api.close(resolve));
}
