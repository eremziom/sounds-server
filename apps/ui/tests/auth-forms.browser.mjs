import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const catalogs = Object.fromEntries(await Promise.all(["en", "pl", "es"].map(async (locale) => [
  locale, JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")),
])));
const calls = { login: 0, register: 0, refresh: 0 };
let sessionMode = "normal";
let operationMode = "held-success";
let releaseOperation;
let operationGate;
function holdOperation() {
  operationGate = new Promise((resolve) => { releaseOperation = resolve; });
}
const secret = "Secret123!";
const roles = [{ key: "USER" }, { key: "ADMIN" }];
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/me") {
    if (sessionMode === "401" || req.headers.authorization !== "Bearer header.payload.signature")
      return res.writeHead(401).end(JSON.stringify({ code: "AUTH_REQUIRED" }));
    if (sessionMode === "403") return res.writeHead(403).end(JSON.stringify({ code: "ACCESS_DENIED" }));
    if (sessionMode === "failure") return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR", message: "private backend details" }));
    if (sessionMode === "malformed") return res.end("private non-JSON session");
    return res.end(JSON.stringify({ ...authSession().user, sessionExpiresAt: authSession().refreshTokenExpiresAt, roles }));
  }
  if (req.url === "/auth/refresh") {
    calls.refresh++;
    return res.writeHead(401).end();
  }
  const flow = req.url === "/auth/login" ? "login" : req.url === "/auth/register" ? "register" : null;
  if (!flow) return res.writeHead(404).end();
  calls[flow]++;
  const requestMode = operationMode;
  let body = "";
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body);
  assert.equal(input.password, secret);
  assert.deepEqual(Object.keys(input).sort(), flow === "login" ? ["login", "password"] : ["email", "password", "username"]);
  if (requestMode === "held-success") await operationGate;
  if (requestMode === "validation") {
    return res.writeHead(400).end(JSON.stringify({
      code: "VALIDATION_FAILED", message: "private validation details",
      fieldErrors: [
        { field: flow === "login" ? "login" : "username", code: "LENGTH", params: { min: 3, max: flow === "login" ? 100 : 30 } },
        { field: "password", code: "LENGTH", params: { min: 8, max: 50 } },
        { field: "password", code: "PASSWORD_COMPLEXITY", value: secret },
      ],
    }));
  }
  const session = authSession();
  session.user.roles = roles;
  res.writeHead(201).end(JSON.stringify(session));
});
api.listen(0, "127.0.0.1");
await once(api, "listening");

try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, fill, submit, choose, open, origin }) => {
    async function key(key, code, windowsVirtualKeyCode) {
      const text = key === "Enter" ? "\r" : key === " " ? " " : undefined;
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, text, unmodifiedText: text });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
    }
    async function assertFocus(selector) {
      assert.equal(await evaluate(`document.activeElement.matches(${JSON.stringify(selector)})`), true, selector);
      assert.equal(await evaluate("document.activeElement.matches(':focus-visible')"), true, "Keyboard focus must be visible");
      assert.equal(await evaluate("(() => { const style=getComputedStyle(document.activeElement); return style.outlineStyle!=='none' || style.boxShadow!=='none'; })()"), true);
    }
    async function assertAccessibility(messages, flow, fields, { pending = false, alert = false } = {}) {
      const { nodes } = await send("Accessibility.getFullAXTree");
      const exposed = nodes.filter((node) => !node.ignored);
      assert.ok(exposed.some((node) => node.role?.value === "form" && node.name?.value === messages.auth[flow].title));
      for (const field of fields) {
        assert.ok(exposed.some((node) => node.role?.value === "textbox" && node.name?.value === messages.auth.fields[field]), `Accessible field label: ${field}`);
      }
      for (const field of fields.filter((field) => field === "password" || field === "confirmPassword")) {
        assert.ok(exposed.some((node) => node.role?.value === "button"
          && node.name?.value === messages.auth.password.show
          && node.description?.value === messages.auth.fields[field]), `Password toggle description: ${field}`);
      }
      const status = exposed.find((node) => node.role?.value === "status");
      assert.ok(status?.properties?.some((property) => property.name === "live" && property.value.value === "polite"));
      assert.ok(status.properties.some((property) => property.name === "atomic" && property.value.value === true));
      assert.equal(await evaluate("document.querySelector('[role=status]').closest('[aria-busy=true]') === null"), true, "Busy form must not suppress the status announcement");
      if (pending) {
        assert.equal(await evaluate("document.querySelector('[role=status]').textContent.trim()"), messages.auth[flow].pending);
        assert.equal(await evaluate("document.querySelector('form').getAttribute('aria-busy')"), "true");
      }
      if (alert) {
        const summary = exposed.find((node) => node.role?.value === "alert");
        assert.ok(summary?.properties?.some((property) => property.name === "live" && property.value.value === "assertive"));
        assert.equal(await evaluate("document.querySelector('[role=alert]').getAttribute('aria-atomic')"), "true");
      }
      assert.equal(await evaluate(`(() => {
        return [...document.querySelectorAll('form input')].every(input => {
          if (input.getAttribute('aria-invalid') !== 'true') return true;
          const ids = input.getAttribute('aria-describedby')?.split(' ') ?? [];
          return ids.length > 0 && ids.every(id => document.getElementById(id)?.textContent.trim());
        });
      })()`), true, "Invalid fields must reference existing error descriptions");
    }
    async function rsc(path) {
      return evaluate(`fetch(${JSON.stringify(path)}, {headers:{RSC:'1'},cache:'no-store'}).then(async response => ({
        status:response.status, type:response.headers.get('content-type'), cache:response.headers.get('cache-control'), body:await response.text()
      }))`);
    }
    const screenshotDirectory = new URL("../.tmp/auth-forms/", import.meta.url);
    await mkdir(screenshotDirectory, { recursive: true });
    await send("Accessibility.enable");

    for (const locale of ["en", "pl", "es"]) {
      const messages = catalogs[locale];
      const nextLocale = { en: "pl", pl: "es", es: "en" }[locale];
      const nextMessages = catalogs[nextLocale];
      for (const flow of ["login", "register"]) {
        sessionMode = "normal";
        operationMode = "held-success";
        holdOperation();
        const fields = flow === "login" ? ["login", "password"] : ["username", "email", "password", "confirmPassword"];
        await open(locale, `/${flow}`);
        await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });
        const before = { ...calls };
        await evaluate("window.stage5Form=document.querySelector('form'); document.querySelector('select[name=locale]').focus()");
        await key("Tab", "Tab", 9);
        await assertFocus(`input[name=${fields[0]}]`);
        await key("Enter", "Enter", 13);
        await waitFor("document.querySelector('input[aria-invalid=true]')");
        await assertFocus(`input[name=${fields[0]}]`);
        await assertAccessibility(messages, flow, fields, { alert: true });
        assert.deepEqual(calls, before, "Required validation must not send a request");

        await choose(nextLocale);
        assert.equal(await evaluate("window.stage5Form === document.querySelector('form')"), true);
        assert.equal(await evaluate("document.querySelector('form li').textContent"), nextMessages.validation.required);
        await choose(locale);
        assert.equal(await evaluate("document.querySelector('form li').textContent"), messages.validation.required);
        await evaluate(`document.querySelector('input[name=${fields[0]}]').focus()`);

        // Type with browser keyboard events and follow the natural tab order.
        for (const field of fields) {
          await assertFocus(`input[name=${field}]`);
          await send("Input.insertText", { text: field === "email" ? "keyboard@example.com"
            : field === "password" || field === "confirmPassword" ? secret : "KeyboardTester" });
          await key("Tab", "Tab", 9);
          if (field === "password" || field === "confirmPassword") {
            await assertFocus("button[aria-controls]");
            assert.equal(await evaluate("document.getElementById(document.activeElement.getAttribute('aria-describedby')).textContent"), messages.auth.fields[field]);
            await key(" ", "Space", 32);
            assert.equal(await evaluate(`document.querySelector('input[name=${field}]').type`), "text");
            assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), messages.auth.password.hide);
            await key(" ", "Space", 32);
            assert.equal(await evaluate(`document.querySelector('input[name=${field}]').type`), "password");
            await key("Tab", "Tab", 9);
          }
        }
        await assertFocus("button[type=submit]");
        await key("Enter", "Enter", 13);
        await waitFor("document.querySelector('form').getAttribute('aria-busy')==='true'");
        await assertAccessibility(messages, flow, fields, { pending: true });
        assert.equal(await evaluate("document.querySelector('button[type=submit]').disabled"), true);
        assert.equal(await evaluate("[...document.querySelectorAll('form input')].every(input=>input.readOnly)"), true);
        await evaluate("document.querySelector('form').requestSubmit()");

        // Locale actions are queued behind the auth action. Request the change
        // while auth is still held, then release success and wait for both.
        const preferenceChange = choose(nextLocale);
        await waitFor("document.querySelector('select[name=locale]').getAttribute('aria-disabled')==='true'");
        releaseOperation();
        await preferenceChange;
        await waitFor(`location.pathname==='/' && document.querySelector('h1')?.textContent===${JSON.stringify(nextMessages.app.home.title)}`);
        assert.equal(calls[flow], before[flow] + 1, "Language change and repeated submit must not replay auth");
        assert.equal(calls.refresh, 0, "Stage 5 must not rotate refresh tokens");
        const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
        assert.equal(cookies.find((cookie) => cookie.name === "locale").value, nextLocale);
        for (const name of ["accessToken", "refreshToken"]) assert.ok(cookies.find((cookie) => cookie.name === name)?.httpOnly);

        // Fresh cookies must work for RSC reads as well as full document reloads.
        for (const [path, heading] of [["/", nextMessages.app.home.title], ["/admin", nextMessages.admin.home.title],
          ["/login", nextMessages.auth.login.title], ["/register", nextMessages.auth.register.title]]) {
          const response = await rsc(`${path}?stage5=${flow}`);
          assert.equal(response.status, 200);
          assert.match(response.type, /text\/x-component/);
          assert.match(response.cache, /private/);
          assert.match(response.cache, /no-store/);
          assert.ok(response.body.includes(JSON.stringify(heading)), `${flow}: RSC ${path}`);
          assert.ok(!response.body.includes("header.payload.signature"));
        }
        await send("Page.reload");
        await waitFor(`document.querySelector('h1')?.textContent===${JSON.stringify(nextMessages.app.home.title)}`);
        await send("Page.navigate", { url: `${origin}/login` });
        await waitFor("document.querySelector('input[name=login]')");
        await evaluate("window.stage5Document=true; document.querySelector('a[href=\"/\"]').click()");
        await waitFor(`location.pathname==='/' && document.querySelector('h1')?.textContent===${JSON.stringify(nextMessages.app.home.title)}`);
        assert.equal(await evaluate("window.stage5Document"), true, "Protected Link navigation must preserve the document");

        // With refresh cookies, rejected guards first attempt entry recovery; API outages
        // must fail closed and must not leak either protected page content.
        for (const mode of ["401", "403", "failure", "malformed"]) {
          sessionMode = mode;
          const response = await rsc(`/admin?stage5=${flow}-${mode}`);
          assert.ok(!response.body.includes(nextMessages.admin.home.placeholder));
          assert.ok(!response.body.includes("private backend details"));
          assert.ok(!response.body.includes("private non-JSON session"));
          if (mode === "401" || mode === "403") assert.ok(response.body.includes("NEXT_REDIRECT;replace;/resume?returnTo="));
          else assert.ok(response.body.includes('"digest"'), "API failures must produce a rendering error, never grant access");
        }
        sessionMode = "normal";
        assert.equal(calls[flow], before[flow] + 1);

        // Multiple long field errors and the summary must fit at 320px and
        // expose translated relationships in Chrome's accessibility tree.
        operationMode = "validation";
        await open(locale, `/${flow}`);
        await fill(flow === "login" ? { login: "KeyboardTester", password: secret }
          : { username: "KeyboardTester", email: "keyboard@example.com", password: secret, confirmPassword: secret });
        await submit();
        await waitFor("document.querySelector('input[name=password]').getAttribute('aria-invalid')==='true'");
        await assertAccessibility(messages, flow, fields, { alert: true });
        assert.equal(await evaluate("document.activeElement.name"), fields[0]);
        assert.equal(await evaluate("document.querySelectorAll('input[name=password]')[0].value"), "");
        assert.equal(await evaluate("document.querySelector('input[name=login],input[name=username]').value"), "KeyboardTester");
        assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
        assert.ok((await evaluate("document.querySelector('form').innerText")).includes(messages.validation.passwordComplexity));
        const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
        await writeFile(new URL(`${flow}-${locale}.png`, screenshotDirectory), Buffer.from(screenshot.data, "base64"));
        console.log(`Stage 5 ${flow}/${locale}: keyboard, accessibility tree, successful locale race, fresh-cookie RSC, guards and 320px OK`);
      }
    }
  });
} finally {
  releaseOperation?.();
  await new Promise((resolve) => api.close(resolve));
}
