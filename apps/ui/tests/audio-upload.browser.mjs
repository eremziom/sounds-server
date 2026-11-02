import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

// Keep the recording larger than the initial media buffer to exercise real Range requests.
const rate = 8000, samples = rate * 90;
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 500), 44 + i * 2);

let session, tracks, uploaded, rangeFailure, refreshFailure, refreshCalls;
const requests = [];
const uploadId = "00000000-0000-4000-8000-000000000001";
const profile = () => ({ ...session.user, roles: [{ key: "ARTIST" }], permissions: ["tracks:create", "tracks:read"], sessionExpiresAt: session.refreshTokenExpiresAt });
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/refresh") {
    refreshCalls++;
    if (refreshFailure) return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR" }));
    return res.end(JSON.stringify(session));
  }
  if (req.url.startsWith("/auth/logout")) return res.writeHead(204).end();
  if (req.headers.authorization !== `Bearer ${session.accessToken}`) return res.writeHead(401).end('{}');
  if (req.url === "/auth/me") return res.end(JSON.stringify(profile()));
  if (req.url === "/tracks") return res.end(JSON.stringify(tracks));
  if (req.url === "/tracks/upload-config") return res.end(JSON.stringify({ maxFileBytes: wav.length + 1024, formats: [{ extension: ".wav", mimeType: "audio/wav" }] }));
  if (req.url === "/tracks/uploads") {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    assert.ok(body.includes(Buffer.from('name="file"')));
    assert.ok(body.includes(wav), "the uploaded WAV reaches the API unchanged");
    uploaded = true;
    return res.writeHead(201).end(JSON.stringify({ uploadId, expiresAt: new Date(Date.now() + 86400000).toISOString() }));
  }
  if (req.url === `/tracks/uploads/${uploadId}/complete`) {
    assert.ok(uploaded);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const metadata = JSON.parse(Buffer.concat(chunks));
    tracks.push({ author: "Artist", description: null, genre: null, subgenre: null, bpm: null, ...metadata, id: 1, ownerId: 1, hasAudio: true });
    return res.writeHead(201).end(JSON.stringify(tracks[0]));
  }
  if (req.url === "/tracks/1/audio") {
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    const start = range ? Number(range[1]) : 0;
    const status = rangeFailure && (start > 0 || req.method === "HEAD") ? rangeFailure : 0;
    requests.push({ method: req.method, start, status });
    if (status) return res.writeHead(status).end(JSON.stringify({ code: status === 401 ? "AUTH_SESSION_INVALID" : "ACCESS_DENIED" }));
    res.setHeader("Content-Type", "audio/wav"); res.setHeader("Accept-Ranges", "bytes");
    if (req.method === "HEAD") { res.setHeader("Content-Length", wav.length); return res.end(); }
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    if (start > end) return res.writeHead(416, { "Content-Range": `bytes */${wav.length}` }).end();
    if (range) { res.statusCode = 206; res.setHeader("Content-Range", `bytes ${start}-${end}/${wav.length}`); }
    res.setHeader("Content-Length", end - start + 1);
    let offset = start;
    const timer = setInterval(() => {
      const next = Math.min(offset + 8192, end + 1);
      res.write(wav.subarray(offset, next)); offset = next;
      if (offset > end) { clearInterval(timer); res.end(); }
    }, 50);
    res.on("close", () => clearInterval(timer));
    return;
  }
  res.writeHead(404).end('{}');
});
api.listen(0, "127.0.0.1"); await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, fill, origin, choose, signOut }) => {
    const audio = "document.querySelector('[data-persistent-media] audio')";
    const row = "document.querySelector('[data-track-id=\"1\"] button')";
    const toggle = "document.querySelector('[data-player-toggle]')";
    const click = expression => send("Runtime.evaluate", { userGesture: true, expression: `${expression}.click()` });
    async function key(key, code = key, windowsVirtualKeyCode) {
      const text = key === "Enter" ? "\r" : undefined;
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, text, unmodifiedText: text });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
    }
    async function enter(locale, path = "/library", lifetime = 86400000) {
      rangeFailure = 0; refreshFailure = false; refreshCalls = 0; requests.length = 0;
      const expiry = Math.floor(Date.now() / 1000) + 900;
      session = authSession({ accessToken: `header.${Buffer.from(JSON.stringify({ exp: expiry })).toString("base64url")}.signature`, accessTokenExpiresAt: new Date(expiry * 1000).toISOString(), refreshTokenExpiresAt: new Date(Date.now() + lifetime).toISOString() });
      await send("Network.setCookies", { cookies: [
        { name: "locale", value: locale, url: origin, path: "/" },
        { name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true },
        { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
      ] });
      await send("Page.navigate", { url: `${origin}${path}` });
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active' && document.querySelector('[data-application-background] canvas')");
    }
    async function play() {
      await waitFor(row); await click(row);
      await waitFor(`${audio}.readyState>=3 && !${audio}.paused`);
      await evaluate(`void(window.savedAudio=${audio})`);
    }
    async function stopped() {
      await waitFor("savedAudio.paused && !savedAudio.hasAttribute('src')");
    }
    for (const locale of ["en", "pl", "es"]) {
      const t = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")).app;
      tracks = []; uploaded = false;
      await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
      await enter(locale);
      await waitFor("document.querySelector('[data-library]')");
      await evaluate(`void(window.originalAudio=${audio})`);
      await evaluate("document.querySelector('[data-header-user-menu] [data-slot=dropdown-menu-trigger]').click()");
      await waitFor("document.querySelector('[data-user-menu-upload]')");
      await click("document.querySelector('[data-user-menu-upload]')");
      await waitFor("document.querySelector('#audio-file')");
      // Use real file bytes, then keyboard input and Enter to submit the form.
      await evaluate(`(() => {const data=new DataTransfer(); data.items.add(new File([Uint8Array.from(atob(${JSON.stringify(wav.toString("base64"))}), c=>c.charCodeAt(0))], 'recording.wav', {type:'audio/wav'})); const input=document.querySelector('#audio-file'); input.files=data.files; input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await waitFor("document.querySelector('[name=title]')");
      await fill({ title: `Integration ${locale}` });
      await waitFor("!document.querySelector('[data-upload-form] button[type=submit]').disabled");
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
      await evaluate("document.querySelector('[data-upload-form] button[type=submit]').focus()");
      await key("Enter", "Enter", 13);
      await waitFor(`document.querySelector('[data-upload-success] [role=status]')?.textContent===${JSON.stringify(t.upload.success)}`);
      assert.equal(tracks.length, 1);
      await click("document.querySelector('[data-upload-success] a[href=\"/library\"]')");
      await waitFor(row);
      assert.equal(await evaluate(`originalAudio===${audio}`), true);
      await play();
      assert.ok((await evaluate("document.querySelector('[data-audio-player]').textContent")).includes(`Integration ${locale}`));
      await evaluate("document.querySelector('[data-audio-player] input').focus()");
      await key("End", "End", 35);
      await waitFor(`${audio}.ended`);
      await key("ArrowLeft", "ArrowLeft", 37);
      await waitFor(`${audio}.currentTime>80 && ${audio}.currentTime<89 && !${audio}.seeking`);
      assert.ok(requests.some(request => request.start > 0 && request.status === 0));
      await key("Home", "Home", 36);
      await waitFor(`${audio}.currentTime<5 && !${audio}.seeking`);
      await click(toggle); await waitFor(`!${audio}.paused`);
      await evaluate("window.next.router.push('/animations')");
      await waitFor("location.pathname==='/animations'");
      await choose({ en: "pl", pl: "es", es: "en" }[locale]);
      assert.equal(await evaluate(`savedAudio===${audio} && !savedAudio.paused`), true);
      await choose(locale);
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
      await signOut(); await waitFor("location.pathname==='/login'"); await stopped();

      // Deny a subsequent unbuffered Range, rather than the initial play request.
      for (const status of [403, 401]) {
        await enter(locale); await play(); rangeFailure = status;
        await evaluate("document.querySelector('[data-audio-player] input').focus()");
        await key("End", "End", 35);
        await waitFor(`${audio}.ended`);
        await key("ArrowLeft", "ArrowLeft", 37);
        if (status === 403) {
          await waitFor(`document.querySelector('[data-audio-player] [role=alert]')?.textContent===${JSON.stringify(t.player.denied)}`);
          assert.equal(await evaluate("document.querySelector('[data-application-runtime]').dataset.sessionStatus"), "active");
          assert.equal(await evaluate("savedAudio.paused"), true);
          rangeFailure = 0;
          await click("document.querySelector('[data-audio-player] button:last-child')");
          await waitFor(`${toggle}.getAttribute('aria-pressed')==='true' && ${audio}.readyState>=3`);
        } else { await waitFor("location.pathname==='/login'"); await stopped(); }
        assert.ok(requests.some(request => request.start > 0 && request.status === status), `subsequent Range denied with ${status}`);
        assert.ok(requests.some(request => request.method === "HEAD" && request.status === status));
      }

      // The real absolute-deadline timer interrupts playback while the JWT remains valid.
      await enter(locale, "/library", 4000); await play();
      await waitFor("location.pathname==='/login'"); await stopped();
      assert.equal(refreshCalls, 0);

      // An unavailable refresh stops media; explicit recovery never resumes it automatically.
      await enter(locale); await play(); refreshFailure = true;
      await evaluate(`void(window.originalNow=Date.now); Date.now=()=>${Date.parse(session.accessTokenExpiresAt) - 59000}; window.dispatchEvent(new Event('focus'))`);
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='unavailable'");
      await stopped(); assert.equal(refreshCalls, 1);
      await evaluate("Date.now=originalNow"); refreshFailure = false;
      await click("document.querySelector('[data-session-recovery] button')");
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active'");
      assert.equal(refreshCalls, 2); await stopped();
      await click(toggle); await waitFor(`${audio}.readyState>=3 && !${audio}.paused`);
      await signOut(); await waitFor("location.pathname==='/login'"); await stopped();
      await send("Emulation.clearDeviceMetricsOverride");
      console.log(`Audio integration ${locale}: upload/list/play/Range, keyboard at 320px, navigation/language, logout, Range 403/401, deadline and refresh recovery OK`);
    }
  });
} finally {
  api.closeAllConnections(); await new Promise(resolve => api.close(resolve));
}
