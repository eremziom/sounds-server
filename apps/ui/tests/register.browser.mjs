import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

let mode = "duplicate";
let calls = 0;
const secret = "Secret123!";
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/me") {
    if (req.headers.authorization !== "Bearer header.payload.signature")
      return res.writeHead(401).end(JSON.stringify({ code: "AUTH_REQUIRED" }));
    return res.end(JSON.stringify(authSession().user));
  }
  if (req.url !== "/auth/register") return res.writeHead(404).end();
  calls++;
  let body = "";
  for await (const chunk of req) body += chunk;
  assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ["email", "password", "username"]);
  if (mode === "slow") await delay(1200);
  if (mode === "success") return res.writeHead(201).end(JSON.stringify(authSession()));
  if (mode === "invalid") return res.writeHead(201).end(JSON.stringify({ accessToken: "private-bad-token" }));
  if (mode === "validation") return res.writeHead(400).end(JSON.stringify({ code: "VALIDATION_FAILED", fieldErrors: [{ field: "username", code: "LENGTH", params: { min: 3, max: 30 } }] }));
  if (mode === "failure") return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR", message: "private details" }));
  return res.writeHead(409).end(JSON.stringify({ code: "EMAIL_ALREADY_IN_USE", message: secret }));
});
api.listen(0, "127.0.0.1");
await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, fill, submit, choose, open, origin }) => {
    for (const locale of ["en", "pl", "es"]) {
      const m = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
      mode = "duplicate";
      await open(locale);
      await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });
      assert.equal(await evaluate("document.querySelector('form').noValidate"), true);
      assert.equal(await evaluate("document.querySelector('input[name=password]').autocomplete"), "new-password");
      const before = calls;
      await submit();
      await waitFor("document.querySelector('input[name=username]').getAttribute('aria-invalid')==='true'");
      assert.equal(calls, before);
      assert.equal(await evaluate("document.activeElement.name"), "username");
      assert.ok((await evaluate("document.querySelector('form').innerText")).includes(m.validation.required));
      await fill({ username: "Tester", email: "bad", password: secret, confirmPassword: "wrong" });
      await submit();
      await waitFor(`document.querySelector('form').innerText.includes(${JSON.stringify(m.validation.passwordMismatch)})`);
      assert.equal(await evaluate("document.activeElement.name"), "email");
      assert.equal(calls, before);
      const screenshotDirectory = new URL("../.tmp/registration/", import.meta.url);
      await mkdir(screenshotDirectory, { recursive: true });
      const screenshot = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(new URL(`${locale}.png`, screenshotDirectory), Buffer.from(screenshot.data, "base64"));
      await fill({ email: "test@example.com", confirmPassword: secret });
      await evaluate("document.querySelector('button[aria-controls$=password]').click()");
      assert.equal(await evaluate("document.querySelector('input[name=password]').type"), "text");
      await submit();
      await waitFor(`document.querySelector('[role=alert]')?.textContent.includes(${JSON.stringify(m.errors.emailAlreadyInUse)})`);
      assert.equal(calls, before + 1);
      assert.equal(await evaluate("document.querySelector('input[name=username]').value"), "Tester");
      assert.equal(await evaluate("document.querySelector('input[name=password]').value"), "");
      assert.equal(await evaluate("document.activeElement.getAttribute('role')"), "alert");
      assert.ok(!(await evaluate("document.body.innerText")).includes(secret));
      const other = locale === "en" ? "pl" : "en";
      await choose(other);
      assert.equal(await evaluate("!!document.querySelector('[role=alert]')"), false);
      assert.equal(calls, before + 1, "Language change must not repeat registration");
      await choose(locale);
      assert.equal(await evaluate("!!document.querySelector('[role=alert]')"), false, "Discarded errors must not reappear");
      await fill({ password: secret, confirmPassword: secret });
      await choose(other);
      assert.equal(await evaluate("document.querySelector('input[name=password]').value"), secret);
      await choose(locale);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
      for (const [nextMode, expected] of [["validation", m.errors.invalidInput], ["invalid", m.errors.unexpected], ["failure", m.errors.serviceUnavailable]]) {
        mode = nextMode;
        await fill({ password: secret, confirmPassword: secret });
        await submit();
        await waitFor(`document.querySelector('[role=alert]')?.textContent.includes(${JSON.stringify(expected)})`);
        if (mode === "validation") assert.equal(await evaluate("document.activeElement.name"), "username");
      }
      mode = "slow";
      await fill({ password: secret, confirmPassword: secret });
      const pendingCalls = calls;
      await submit();
      await waitFor("document.querySelector('form').getAttribute('aria-busy')==='true'");
      assert.equal(await evaluate("document.querySelector('button[type=submit]').disabled"), true);
      await choose(other);
      await waitFor("document.querySelector('form').getAttribute('aria-busy')==='false'");
      assert.equal(calls, pendingCalls + 1);
      assert.equal(await evaluate("!!document.querySelector('[role=alert]')"), false, "Old-language action error must be hidden");
      await choose(locale);
      mode = "success";
      await fill({ password: secret, confirmPassword: secret });
      await submit();
      await waitFor("location.pathname==='/' && document.querySelector('h1')?.textContent.includes('Sounds')");
      const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
      assert.equal(cookies.find((cookie) => cookie.name === "locale").value, locale);
      for (const name of ["accessToken", "refreshToken"]) {
        const cookie = cookies.find((entry) => entry.name === name);
        assert.ok(cookie.httpOnly && cookie.secure && cookie.sameSite === "Lax");
      }
      assert.ok(!(await evaluate("document.cookie")).includes("Token"));
      await send("Page.reload");
      await waitFor("location.pathname==='/' && document.querySelector('h1')?.textContent.includes('Sounds')");
      console.log(`Registration ${locale}: validation, focus, API errors, pending, language changes, cookies and protected page OK`);
    }
  });
} finally {
  await new Promise((resolve) => api.close(resolve));
}
