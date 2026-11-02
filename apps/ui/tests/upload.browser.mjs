import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

let roles = ["ARTIST"], permission = true, mode = "success", active = true;
let uploadCalls = 0, completeCalls = 0, cancelCalls = 0, configCalls = 0, refreshCalls = 0;
let abortedUploads = 0;
let sequence = 0, gate, release;
let tracks = [];
const uploads = new Map();
const session = authSession({ accessToken: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature` });
const config = { maxFileBytes: 1024, formats: [{ extension: ".mp3", mimeType: "audio/mpeg" }, { extension: ".wav", mimeType: "audio/wav" }] };
const profile = () => ({ ...session.user, roles: roles.map(key => ({ key })), permissions: permission ? ["tracks:create", "tracks:read"] : ["tracks:read"], sessionExpiresAt: session.refreshTokenExpiresAt });
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/refresh") { refreshCalls++; return res.end(JSON.stringify({ ...session, user: profile() })); }
  if (req.url === "/auth/logout") { active = false; return res.writeHead(204).end(); }
  if (!active || req.headers.authorization !== `Bearer ${session.accessToken}`) return res.writeHead(401).end(JSON.stringify({ code: "AUTH_REQUIRED" }));
  if (req.url === "/auth/me") return res.end(JSON.stringify(profile()));
  if (req.url === "/tracks") return res.end(JSON.stringify(tracks));
  if (req.url === "/tracks/upload-config") {
    configCalls++;
    return permission ? res.end(JSON.stringify(config)) : res.writeHead(403).end(JSON.stringify({ code: "ACCESS_DENIED" }));
  }
  if (req.method === "DELETE") { cancelCalls++; uploads.delete(req.url.split("/").at(-1)); return res.writeHead(204).end(); }
  if (!permission) return res.writeHead(403).end(JSON.stringify({ code: "ACCESS_DENIED" }));
  if (req.url === "/tracks/uploads") {
    uploadCalls++;
    res.on("close", () => { if (!res.writableEnded) abortedUploads++; });
    let body = ""; for await (const chunk of req) body += chunk;
    assert.ok(body.includes('name="file"')); assert.ok(!body.includes('name="metadata"'));
    if (gate) await gate;
    if (mode === "invalidFile") return res.writeHead(400).end(JSON.stringify({ code: "AUDIO_FILE_INVALID" }));
    if (mode === "unsupported") return res.writeHead(415).end(JSON.stringify({ code: "AUDIO_FORMAT_UNSUPPORTED" }));
    const uploadId = `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
    const value = { uploadId, expiresAt: new Date(Date.now() + (mode === "ttl" ? 1000 : 86400000)).toISOString() };
    uploads.set(uploadId, value);
    return res.writeHead(201).end(JSON.stringify(value));
  }
  if (req.url.endsWith("/complete")) {
    completeCalls++;
    let body = ""; for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    const id = req.url.split("/").at(-2);
    assert.ok(uploads.has(id));
    if (gate) await gate;
    if (mode === "validation") return res.writeHead(400).end(JSON.stringify({ code: "VALIDATION_FAILED", fieldErrors: [{ field: "title", code: "LENGTH", params: { min: 3, max: 50 } }] }));
    if (mode === "network") return req.socket.destroy();
    if (mode === "expired") return res.writeHead(410).end(JSON.stringify({ code: "AUDIO_UPLOAD_EXPIRED" }));
    const track = { ...data, id: tracks.length + 1, ownerId: 1, hasAudio: true };
    tracks.push(track); uploads.delete(id);
    return res.writeHead(201).end(JSON.stringify(track));
  }
  res.writeHead(404).end('{}');
});
api.listen(0, "127.0.0.1"); await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, listeners, evaluate, waitFor, fill, origin, signOut }) => {
    async function enter(locale, path = "/upload", nextRoles = ["ARTIST"], allowed = true, access = true) {
      roles = nextRoles; permission = allowed; active = true; mode = "success"; gate = undefined;
      await send("Network.deleteCookies", { name: "accessToken", url: origin });
      await send("Network.setCookies", { cookies: [
        { name: "locale", value: locale, url: origin, path: "/" },
        { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
        ...(access ? [{ name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true }] : []),
      ] });
      const loaded = new Promise(resolve => listeners.set("Page.loadEventFired", resolve));
      await send("Page.navigate", { url: `${origin}${path}` });
      await loaded;
      listeners.delete("Page.loadEventFired");
    }
    async function file(name = "sample.wav", size = 100) {
      await evaluate(`(() => {
        const input=document.querySelector('#audio-file'), data=new DataTransfer();
        data.items.add(new File([new Uint8Array(${size})], ${JSON.stringify(name)}, {type:'audio/wav'}));
        input.files=data.files; input.dispatchEvent(new Event('change', {bubbles:true}));
      })()`);
    }
    async function details() {
      await fill({ title: "New recording", bpmFrom: "90", bpmTo: "120" });
      await evaluate("document.querySelector('textarea').focus()");
      await send("Input.insertText", { text: "A new description" });
      await evaluate("(() => {const input=document.querySelector('[name=releaseDate]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2026-11-01');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()");
    }
    const clickSave = () => evaluate("document.querySelector('[data-upload-form] button[type=submit]').click()");
    const stay = async () => { await waitFor("document.querySelector('[role=alertdialog]')"); await evaluate("document.querySelector('[data-slot=alert-dialog-cancel]').click()"); await waitFor("!document.querySelector('[role=alertdialog]')"); };
    const leave = async () => { await waitFor("document.querySelector('[role=alertdialog]')"); await evaluate("document.querySelector('[data-slot=alert-dialog-action]').click()"); };
    for (const locale of ["en", "pl", "es"]) {
      const catalog = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
      const t = catalog.app.upload;
      for (const [roleKeys, allowed] of [[["USER"], false], [["ADMIN"], false], [["ARTIST"], true], [["ADMIN", "ARTIST"], true], [["USER"], true]]) {
        const before = configCalls;
        await enter(locale, "/upload", roleKeys, allowed);
        if (!allowed) { await waitFor("location.pathname==='/access-denied'"); assert.equal(configCalls, before); }
        else { await waitFor("document.querySelector('#audio-file')"); assert.equal(configCalls, before + 1); }
      }
      const beforeRefresh = refreshCalls;
      await enter(locale, "/upload?from=menu", ["ARTIST"], true, false);
      await waitFor("document.querySelector('#audio-file') && location.search==='?from=menu'");
      assert.equal(refreshCalls, beforeRefresh + 1);
      assert.equal(await evaluate("!!document.querySelector('[name=title]')"), false);
      const beforeUpload = uploadCalls;
      for (const [name, size, error] of [["large.wav", 1025, t.fileTooLarge], ["empty.wav", 0, t.fileEmpty], ["other.txt", 50, t.fileUnsupported]]) {
        await file(name, size);
        await waitFor(`document.querySelector('[data-upload-form] [role=alert]')?.textContent===${JSON.stringify(error)}`);
      }
      assert.equal(uploadCalls, beforeUpload);

      // Visit Library first so completion must invalidate its existing RSC cache.
      await evaluate("document.querySelector('a[href=\"/library\"]').click()");
      await waitFor("document.querySelector('[data-library]')");
      await evaluate("document.querySelector('[data-header-user-menu] [data-slot=dropdown-menu-trigger]').click()");
      await waitFor("document.querySelector('[data-user-menu-upload]')");
      await evaluate("document.querySelector('[data-user-menu-upload]').click()");
      await waitFor("document.querySelector('#audio-file')");

      gate = new Promise(resolve => { release = resolve; });
      await file();
      await waitFor("document.querySelector('[name=title]') && document.querySelector('[data-upload-form]').getAttribute('aria-busy')==='true'");
      await details();
      await fill({ title: "ab", bpmFrom: "201" });
      await waitFor(`document.querySelector('#title-error')?.textContent===${JSON.stringify(t.lengthTitle)} && document.querySelector('#bpmFrom-error')?.textContent===${JSON.stringify(t.bpmInvalid)}`);
      await fill({ title: "New recording", bpmFrom: "90" });
      await waitFor("!document.querySelector('#title-error') && !document.querySelector('#bpmFrom-error')");
      assert.equal(await evaluate("document.querySelector('[data-upload-form] button[type=submit]').disabled"), true);
      await evaluate("void(window.mediaIdentity=document.querySelector('[data-persistent-media]'))");
      release(); gate = undefined;
      await waitFor("!document.querySelector('[data-upload-form] button[type=submit]').disabled");
      const beforeComplete = completeCalls;
      gate = new Promise(resolve => { release = resolve; });
      await clickSave(); await clickSave();
      await waitFor("document.querySelector('[data-upload-form]').getAttribute('aria-busy')==='true'");
      release(); gate = undefined;
      await waitFor(`document.querySelector('[data-upload-form] [role=status]')?.textContent===${JSON.stringify(t.success)}`);
      assert.equal(completeCalls, beforeComplete + 1);
      assert.equal(await evaluate("!!document.querySelector('[name=title]')"), false);
      await evaluate("document.querySelector('[data-upload-form] a[href=\"/library\"]').click()");
      await waitFor("document.querySelector('[data-library] [data-track-id]')");
      assert.equal(await evaluate("window.mediaIdentity===document.querySelector('[data-persistent-media]')"), true);
      assert.ok((await evaluate("document.querySelector('[data-library]').innerText")).includes("New recording"));

      // Open through the fourth menu entry, then preserve fields on server errors.
      await evaluate("document.querySelector('[data-header-user-menu] [data-slot=dropdown-menu-trigger]').click()");
      await waitFor("document.querySelector('[data-user-menu-upload]')");
      await evaluate("document.querySelector('[data-user-menu-upload]').click()");
      await waitFor("document.querySelector('#audio-file')");
      await file("sample.mp3"); await waitFor("document.querySelector('[name=title]')"); await details();
      await waitFor("!document.querySelector('[data-upload-form] button[type=submit]').disabled");
      mode = "validation"; await clickSave();
      await waitFor("document.querySelector('#title-error')");
      assert.equal(await evaluate("document.querySelector('[name=title]').value"), "New recording");
      assert.equal(await evaluate("document.querySelector('textarea[name=description]').value"), "A new description");

      // Links and history keep the current editor on Stay, cancel it on Leave.
      await evaluate("document.querySelector('a[href=\"/library\"]').click()"); await stay();
      assert.equal(await evaluate("location.pathname"), "/upload");
      await evaluate("history.back()"); await stay();
      assert.equal(await evaluate("location.pathname"), "/upload");
      const beforeCancel = cancelCalls;
      await evaluate("history.back()"); await leave();
      await waitFor("location.pathname==='/library' && document.querySelector('[data-library]')");
      assert.equal(cancelCalls, beforeCancel + 1);
      await evaluate("history.forward()"); await waitFor("document.querySelector('#audio-file')");
      assert.equal(await evaluate("!!document.querySelector('[name=title]')"), false);
      await evaluate("document.querySelector('a[href=\"/library\"]').click()");
      await waitFor("document.querySelector('[data-library]')");
      await evaluate("history.back()"); await waitFor("document.querySelector('#audio-file')");

      // Language changes require the same confirmation and preserve the runtime.
      mode = "success"; await file(); await waitFor("document.querySelector('[name=title]')");
      await evaluate("history.forward()"); await stay();
      assert.equal(await evaluate("location.pathname"), "/upload");
      await evaluate(`(() => {if(document.querySelector('[data-language-trigger]').getAttribute('aria-expanded')!=='true') document.querySelector('[data-language-trigger]').click();document.querySelector('[data-locale=${locale === "en" ? "pl" : "en"}]').click()})()`);
      await stay(); assert.equal(await evaluate("document.documentElement.lang"), locale);
      assert.equal(await evaluate("(() => {const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()"), true);
      await evaluate(`(() => {if(document.querySelector('[data-language-trigger]').getAttribute('aria-expanded')!=='true') document.querySelector('[data-language-trigger]').click();document.querySelector('[data-locale=${locale === "en" ? "pl" : "en"}]').click()})()`);
      await leave();
      await waitFor(`document.documentElement.lang===${JSON.stringify(locale === "en" ? "pl" : "en")}`);
      await waitFor("document.querySelector('#audio-file') && !document.querySelector('[name=title]')");
      // After confirming a locale change, this upload must not be reused.
      await enter(locale);
      await waitFor("document.querySelector('#audio-file')");
      mode = "ttl"; await file(); await waitFor("document.querySelector('[name=title]')"); await details();
      await waitFor(`document.querySelector('[role=alert]')?.textContent===${JSON.stringify(t.expired)}`);
      assert.equal(await evaluate("document.querySelector('[data-upload-form] button[type=submit]').disabled"), true);
      assert.equal(await evaluate("document.querySelector('[name=title]').value"), "New recording");
      await evaluate("document.querySelector('[data-upload-form] a').click()"); await leave(); await waitFor("location.pathname==='/library'");

      await enter(locale); await waitFor("document.querySelector('#audio-file')");
      await file(); await waitFor("document.querySelector('[name=title]')"); await details(); await waitFor("!document.querySelector('[data-upload-form] button[type=submit]').disabled");
      mode = "network"; const beforeUnknown = completeCalls; await clickSave();
      await waitFor(`document.querySelector('[role=alert]')?.textContent===${JSON.stringify(t.unknownResult)}`);
      await delay(200); assert.equal(completeCalls, beforeUnknown + 1);
      assert.equal(await evaluate("document.querySelector('[data-upload-form] button[type=submit]').disabled"), true);
      // Logout takes priority over the dirty editor and never opens its leave dialog.
      await signOut(); await waitFor("location.pathname==='/logout'");
      assert.equal(await evaluate("!!document.querySelector('[data-upload-form]')"), false);

      // A file rejection preserves the metadata editor and allows explicit reselection.
      await enter(locale); await waitFor("document.querySelector('#audio-file')");
      mode = "invalidFile"; await file();
      await waitFor(`document.querySelector('[role=alert]')?.textContent===${JSON.stringify(catalog.errors.audioFileInvalid)}`);
      await evaluate(`Array.from(document.querySelectorAll('[data-upload-form] button')).find(b=>b.textContent===${JSON.stringify(t.chooseAnother)}).click()`);
      await waitFor("!document.querySelector('[data-upload-form] [role=alert]')");
      mode = "success"; await file(); await waitFor("document.querySelector('[name=title]')"); await details();
      await waitFor("!document.querySelector('[data-upload-form] button[type=submit]').disabled");
      permission = false; const beforeDenied = completeCalls;
      await clickSave();
      await waitFor(`document.querySelector('[role=alert]')?.textContent===${JSON.stringify(catalog.errors.accessDenied.description)}`);
      assert.equal(completeCalls, beforeDenied);
      assert.equal(await evaluate("document.querySelector('[name=title]').value"), "New recording");
      await evaluate("document.querySelector('[data-upload-form] a').click()"); await leave(); await waitFor("location.pathname==='/library'");

      // Leaving during an active transfer aborts its HTTP connection.
      await enter(locale); await waitFor("document.querySelector('#audio-file')");
      gate = new Promise(resolve => { release = resolve; });
      const beforeAbort = abortedUploads;
      await file(); await waitFor("document.querySelector('[name=title]')");
      await evaluate("document.querySelector('[data-upload-form] a').click()"); await stay();
      assert.equal(abortedUploads, beforeAbort);
      await evaluate("document.querySelector('[data-upload-form] a').click()"); await leave();
      await waitFor("location.pathname==='/library'");
      for (let i = 0; i < 40 && abortedUploads === beforeAbort; i++) await delay(50);
      assert.equal(abortedUploads, beforeAbort + 1);
      release(); gate = undefined;

      // Session termination cancels a transfer without a leave confirmation.
      await enter(locale); await waitFor("document.querySelector('#audio-file')");
      gate = new Promise(resolve => { release = resolve; });
      const beforeSessionAbort = abortedUploads;
      await file(); await waitFor("document.querySelector('[name=title]')");
      await signOut(); await waitFor("location.pathname==='/logout'");
      for (let i = 0; i < 40 && abortedUploads === beforeSessionAbort; i++) await delay(50);
      assert.equal(abortedUploads, beforeSessionAbort + 1);
      release(); gate = undefined;
      console.log(`Upload: ${locale} passed`);
    }
  });
} finally { release?.(); await new Promise(resolve => api.close(resolve)); }
