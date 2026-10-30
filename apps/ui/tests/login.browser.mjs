import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

let mode = "credentials";
let roles = ["USER"];
let calls = 0;
const secret = "Secret123!";
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/me") {
    if (req.headers.authorization !== "Bearer header.payload.signature")
      return res.writeHead(401).end(JSON.stringify({ code: "AUTH_REQUIRED" }));
    return res.end(JSON.stringify({ ...authSession().user, sessionExpiresAt: authSession().refreshTokenExpiresAt, roles: roles.map((key) => ({ key })) }));
  }
  if (req.url !== "/auth/login") return res.writeHead(404).end();
  calls++;
  let body = "";
  for await (const chunk of req) body += chunk;
  assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ["login", "password"]);
  if (mode === "slow") await delay(1200);
  if (mode === "timeout") await delay(5500);
  if (mode === "network") return req.socket.destroy();
  if (mode === "success") {
    const session = authSession();
    session.user.roles = roles.map((key) => ({ key }));
    return res.writeHead(201).end(JSON.stringify(session));
  }
  if (mode === "invalid") return res.writeHead(201).end(JSON.stringify({ accessToken: "private-token" }));
  if (mode === "validation") return res.writeHead(400).end(JSON.stringify({ code: "VALIDATION_FAILED", fieldErrors: [{ field: "login", code: "LENGTH", params: { min: 3, max: 100 } }] }));
  if (mode === "failure") return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR", message: "private details" }));
  if (mode === "unknown") return res.writeHead(401).end(JSON.stringify({ code: "UNKNOWN", message: secret }));
  if (mode === "forbidden") return res.writeHead(403).end(JSON.stringify({ code: "ACCESS_DENIED" }));
  if (mode === "malformed") return res.writeHead(401).end("private non-JSON response");
  return res.writeHead(401).end(JSON.stringify({ code: "AUTH_INVALID_CREDENTIALS", message: secret }));
});
api.listen(0, "127.0.0.1");
await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, fill, submit, choose, open, origin }) => {
    for (const locale of ["en", "pl", "es"]) {
      const m = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
      const other = locale === "en" ? "pl" : "en";
      mode = "credentials";
      await open(locale, "/login?returnTo=https%3A%2F%2Fexample.com");
      await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });
      assert.equal(await evaluate("document.querySelector('form').noValidate"), true);
      assert.equal(await evaluate("document.querySelector('input[name=login]').type"), "text");
      assert.equal(await evaluate("document.querySelector('input[name=login]').autocomplete"), "username");
      assert.equal(await evaluate("document.querySelector('input[name=password]').autocomplete"), "current-password");
      const before = calls;
      await submit();
      await waitFor("document.querySelector('input[name=login]').getAttribute('aria-invalid')==='true'");
      assert.equal(await evaluate("document.activeElement.name"), "login");
      assert.ok((await evaluate("document.querySelector('form').innerText")).includes(m.validation.required));
      await fill({ login: "aa", password: "short" });
      await submit();
      await waitFor(`document.querySelector('form').innerText.includes(${JSON.stringify(m.validation.length.replace("{min}", "3").replace("{max}", "100"))})`);
      await fill({ login: "Tester", password: "lowercase123!" });
      await submit();
      await waitFor(`document.querySelector('form').innerText.includes(${JSON.stringify(m.validation.passwordComplexity)})`);
      assert.equal(await evaluate("document.activeElement.name"), "password");
      assert.equal(await evaluate("document.activeElement.getAttribute('aria-describedby').split(' ').length"), 2);
      await choose(other);
      assert.equal(await evaluate("document.querySelector('input[name=password]').value"), "lowercase123!");
      assert.equal(calls, before, "Local validation and locale changes must not call API");
      await choose(locale);
      await fill({ password: secret });
      await evaluate("document.querySelector('button[aria-controls$=password]').click()");
      assert.equal(await evaluate("document.querySelector('input[name=password]').type"), "text");
      await submit();
      await waitFor(`document.querySelector('[role=alert]')?.textContent.includes(${JSON.stringify(m.errors.invalidCredentials)})`);
      assert.equal(calls, before + 1);
      assert.equal(await evaluate("document.querySelector('input[name=login]').value"), "Tester");
      assert.equal(await evaluate("document.querySelector('input[name=password]').value"), "");
      assert.equal(await evaluate("document.activeElement.getAttribute('role')"), "alert");
      assert.ok(!(await evaluate("document.body.innerText")).includes(secret));
      const screenshotDirectory = new URL("../.tmp/login/", import.meta.url);
      await mkdir(screenshotDirectory, { recursive: true });
      const shot = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(new URL(`${locale}.png`, screenshotDirectory), Buffer.from(shot.data, "base64"));
      await choose(other);
      assert.equal(await evaluate("!!document.querySelector('[role=alert]')"), false);
      await choose(locale);
      assert.equal(await evaluate("!!document.querySelector('[role=alert]')"), false);
      assert.equal(calls, before + 1, "Language change must not replay login");
      const cases = [
        ["validation", m.errors.invalidInput], ["invalid", m.errors.unexpected],
        ["unknown", m.errors.unexpected], ["malformed", m.errors.unexpected],
        ["failure", m.errors.serviceUnavailable], ["network", m.errors.serviceUnavailable],
        ["forbidden", m.errors.accessDenied.description],
      ];
      if (locale === "en") cases.push(["timeout", m.errors.timeout]);
      for (const [nextMode, expected] of cases) {
        mode = nextMode;
        await fill({ password: secret });
        await submit();
        await waitFor(`document.querySelector('[role=alert]')?.textContent.includes(${JSON.stringify(expected)})`);
        if (mode === "validation") assert.equal(await evaluate("document.activeElement.name"), "login");
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
      }
      mode = "slow";
      await fill({ password: secret });
      const pendingCalls = calls;
      await submit();
      await waitFor("document.querySelector('form').getAttribute('aria-busy')==='true'");
      assert.equal(await evaluate("document.querySelector('button[type=submit]').disabled"), true);
      await evaluate("document.querySelector('form').requestSubmit()");
      await choose(other);
      await waitFor("document.querySelector('form').getAttribute('aria-busy')==='false'");
      assert.equal(calls, pendingCalls + 1);
      assert.equal(await evaluate("!!document.querySelector('[role=alert]')"), false);

      for (const [nextRoles, target] of [
        [["USER"], "/"], [["ARTIST"], "/"], [["ADMIN"], "/admin"],
        [["ADMIN", "USER", "ARTIST"], "/"], [[], "/access-denied"], [["OTHER"], "/access-denied"],
      ]) {
        await open(locale, "/login?returnTo=%2F%2Fexample.com");
        roles = nextRoles;
        mode = "success";
        await fill({ login: nextRoles.includes("ADMIN") ? "test@example.com" : "Tester", password: secret });
        await submit();
        const heading = target === "/" ? m.app.home.title
          : target === "/admin" ? m.admin.home.title : m.errors.accessDenied.title;
        await waitFor(`location.pathname===${JSON.stringify(target)} && document.querySelector('h1')?.textContent===${JSON.stringify(heading)} && document.documentElement.lang===${JSON.stringify(locale)}`);
        const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
        assert.equal(cookies.find((cookie) => cookie.name === "locale").value, locale);
        for (const name of ["accessToken", "refreshToken"]) {
          const cookie = cookies.find((entry) => entry.name === name);
          assert.ok(cookie.httpOnly && cookie.secure && cookie.sameSite === "Lax");
          assert.ok(!(await evaluate("document.documentElement.outerHTML")).includes(cookie.value));
        }
        await send("Page.reload");
        await waitFor(`location.pathname===${JSON.stringify(target)} && document.querySelector('h1')?.textContent===${JSON.stringify(heading)} && document.documentElement.lang===${JSON.stringify(locale)}`);
        await send("Page.navigate", { url: `${origin}/login` });
        await waitFor(`location.pathname===${JSON.stringify(target)} && document.querySelector('h1')?.textContent===${JSON.stringify(heading)}`);
        assert.equal(await evaluate("!!document.querySelector('input[name=login]')"), false);
        if (target === "/access-denied") assert.equal(await evaluate("document.querySelectorAll('a, button, select, header').length"), 0);
        await open(locale, "/login");
        await evaluate("document.querySelector('a[href=\"/register\"]').click()");
        await waitFor("location.pathname==='/register' && document.querySelector('input[name=username]')");
        await evaluate("document.querySelector('a[href=\"/login\"]').click()");
        await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]')");
      }
      console.log(`Login ${locale}: validation, API errors, focus, pending, locale changes, secure cookies, role redirects and reload OK`);
    }
  });
} finally {
  await new Promise((resolve) => api.close(resolve));
}
