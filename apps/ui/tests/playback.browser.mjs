import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const session = authSession({ accessToken: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature` });
// A long WAV ensures seeking outside the initial buffer needs another Range.
const rate = 8000, samples = rate * 90;
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 500), 44 + i * 2);
const tracks = [1, 2].map(id => ({ id, ownerId: 1, author: id === 1 ? "Artist" : null, title: `Recording ${id}`, genre: null, subgenre: null, description: null, publicationDate: "2026-01-01", bpm: null, hasAudio: true }));
let failure = 0;
const requests = [];
const api = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/refresh") return res.end(JSON.stringify(session));
  if (req.url.startsWith("/auth/logout")) return res.writeHead(204).end();
  if (req.url === "/auth/me") return res.end(JSON.stringify({ ...session.user, roles: [{ key: "USER" }], permissions: [], sessionExpiresAt: session.refreshTokenExpiresAt }));
  if (req.headers.authorization !== `Bearer ${session.accessToken}`) return res.writeHead(401).end('{}');
  if (req.url === "/tracks") return res.end(JSON.stringify(tracks));
  if (/^\/tracks\/[12]\/audio$/.test(req.url)) {
    requests.push({ method: req.method, range: req.headers.range });
    if (failure) return res.writeHead(failure).end(JSON.stringify({ code: "AUDIO_NOT_FOUND" }));
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Accept-Ranges", "bytes");
    if (req.method === "HEAD") { res.setHeader("Content-Length", wav.length); return res.end(); }
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    if (range) { res.statusCode = 206; res.setHeader("Content-Range", `bytes ${start}-${end}/${wav.length}`); }
    res.setHeader("Content-Length", end - start + 1);
    // Send slowly so the seek really leaves the buffered region.
    let offset = start;
    const timer = setInterval(() => {
      const next = Math.min(offset + 8192, end + 1);
      res.write(wav.subarray(offset, next)); offset = next;
      if (offset > end) { clearInterval(timer); res.end(); }
    }, 30);
    res.on("close", () => clearInterval(timer));
    return;
  }
  res.writeHead(404).end('{}');
});
api.listen(0, "127.0.0.1");
await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, origin, signOut, choose }) => {
    const audio = "document.querySelector('[data-persistent-media] audio')";
    const row = id => `document.querySelector('[data-track-id="${id}"] button')`;
    const toggle = "document.querySelector('[data-player-toggle]')";
    const volume = "document.querySelector('[data-player-volume]')";
    const mute = "document.querySelector('[data-player-mute]')";
    const click = expression => send("Runtime.evaluate", { userGesture: true, expression: `${expression}.click()` });
    const volumeKey = async (key, windowsVirtualKeyCode) => {
      await evaluate(`${volume}.focus()`);
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode });
    };
    for (const locale of ["en", "pl", "es"]) {
      failure = 0;
      const t = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")).app.player;
      await send("Network.setCookies", { cookies: [
        { name: "locale", value: locale, url: origin, path: "/" },
        { name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true },
        { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
      ] });
      await send("Page.navigate", { url: `${origin}/library` });
      await waitFor(row(1));
      await waitFor("document.querySelector('[data-application-background] canvas') && document.querySelector('header a[href=\"/library\"]')");
      assert.equal(await evaluate("!!document.querySelector('[data-audio-player]')"), false);
      await evaluate(`(() => {
        window.playerBounds = [];
        function measure() {
          const panel = document.querySelector('[data-audio-player]');
          if (panel) {
            const bounds = panel.getBoundingClientRect();
            const slider = panel.querySelector('input').getBoundingClientRect();
            playerBounds.push([bounds.top, bounds.height, slider.left, slider.width]);
          }
          window.playerFrame = requestAnimationFrame(measure);
        }
        measure();
      })()`);
      await click(row(1));
      await waitFor(`${toggle}?.getAttribute('aria-pressed')==='true' && ${audio}.readyState>=3`);
      assert.equal(await evaluate(`${volume}.getAttribute('aria-label')`), t.volume);
      await volumeKey("Home", 36);
      await waitFor(`${audio}.volume===0 && ${mute}.getAttribute('aria-label')===${JSON.stringify(t.unmute)}`);
      await click(mute);
      await waitFor(`${audio}.volume===1 && !${audio}.muted && ${volume}.value==='100'`);
      await volumeKey("ArrowLeft", 37);
      await waitFor(`${audio}.volume===0.99 && ${volume}.value==='99'`);
      await click(mute);
      await waitFor(`${audio}.muted && ${volume}.value==='0'`);
      await click(mute);
      await waitFor(`!${audio}.muted && ${audio}.volume===0.99 && ${volume}.value==='99'`);
      await click(mute);
      await volumeKey("ArrowRight", 39);
      await waitFor(`!${audio}.muted && ${audio}.volume===0.01`);
      // Changes from the media element must also update the visible controls.
      await evaluate(`${audio}.volume=0.4`);
      await waitFor(`${volume}.value==='40'`);
      await evaluate(`${audio}.dispatchEvent(new Event('waiting'))`);
      await waitFor(`document.querySelector('[data-audio-player] [role=status]')?.textContent===${JSON.stringify(t.waiting)}`);
      await evaluate(`${audio}.dispatchEvent(new Event('playing'))`);
      assert.equal(await evaluate(`${row(1)}.getAttribute('aria-pressed')`), "true");
      assert.equal(await evaluate("document.querySelector('[data-audio-player]').getAttribute('aria-label')"), t.label);
      await evaluate(`void(window.savedAudio=${audio})`);
      await click(toggle);
      await waitFor(`${row(1)}.getAttribute('aria-pressed')==='false'`);
      assert.equal(await evaluate(`${audio}.paused`), true);
      await click(row(1));
      await waitFor(`${toggle}.getAttribute('aria-pressed')==='true'`);
      // Keyboard input on the accessible seek control causes a real media seek.
      await evaluate("document.querySelector('[data-audio-player] input').focus()");
      assert.equal(await evaluate("document.activeElement===document.querySelector('[data-audio-player] input')"), true);
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End", windowsVirtualKeyCode: 35 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "End", code: "End", windowsVirtualKeyCode: 35 });
      await waitFor(`${audio}.currentTime>80`);
      await waitFor(`${audio}.ended`);
      await waitFor(`document.querySelector('[data-audio-player] [role=status]')?.textContent===${JSON.stringify(t.ended)}`);
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
      await waitFor(`${audio}.currentTime>=84 && ${audio}.currentTime<89 && !${audio}.seeking`);
      assert.ok(requests.some(request => request.range && !request.range.startsWith("bytes=0-")), "seek sends a subsequent Range");
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End", windowsVirtualKeyCode: 35 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "End", code: "End", windowsVirtualKeyCode: 35 });
      await waitFor(`${audio}.ended`);
      await click(toggle);
      await waitFor(`${audio}.currentTime<5 && !${audio}.paused`);
      await click(row(2));
      await waitFor(`${row(2)}.getAttribute('aria-pressed')==='true' && ${audio}.readyState>=3`);
      assert.equal(await evaluate(`${audio}.volume`), 0.4);
      await evaluate("cancelAnimationFrame(playerFrame)");
      const bounds = await evaluate("playerBounds");
      assert.ok(bounds.length > 1);
      assert.deepEqual([...new Set(bounds.map(value => JSON.stringify(value)))], [JSON.stringify(bounds[0])],
        "panel and seek slider stay still during startup, buffering, seeking, ended and switching to a track without an author");
      assert.equal(await evaluate(`${row(1)}.getAttribute('aria-pressed')`), "false");
      await evaluate("window.next.router.push('/animations')");
      await waitFor("location.pathname==='/animations' && document.querySelector('[data-background-controls]') || location.pathname==='/animations' && document.querySelector('main')");
      assert.equal(await evaluate(`savedAudio===${audio} && !savedAudio.paused`), true);
      assert.ok((await evaluate("document.querySelector('[data-audio-player]').textContent")).includes("Recording 2"));
      await choose({ en: "pl", pl: "es", es: "en" }[locale]);
      assert.equal(await evaluate(`savedAudio===${audio} && !savedAudio.paused`), true);
      await choose(locale);
      assert.equal(await evaluate(`${audio}.volume===0.4 && ${volume}.value==='40'`), true);
      await evaluate("window.next.router.push('/library')");
      await waitFor(row(2));
      await waitFor(`${row(2)}.getAttribute('aria-pressed')==='true'`);
      // A browser policy rejection is recoverable by an explicit click.
      await click(toggle);
      await evaluate(`void(window.realPlay=savedAudio.play); void(savedAudio.play=()=>Promise.reject(new DOMException('blocked','NotAllowedError')))`);
      await click(toggle);
      await waitFor(`document.querySelector('[data-audio-player] [role=alert]')?.textContent===${JSON.stringify(t.blocked)}`);
      await evaluate("void(savedAudio.play=realPlay)");
      await click("document.querySelector('[data-audio-player] button:last-child')");
      await waitFor(`${toggle}.getAttribute('aria-pressed')==='true'`);
      // Actual HTTP errors classify without ending a valid session or auto retry.
      failure = 403;
      await click(row(1));
      await waitFor(`document.querySelector('[data-audio-player] [role=alert]')?.textContent===${JSON.stringify(t.denied)}`);
      assert.equal(await evaluate("document.querySelector('[data-application-runtime]').dataset.sessionStatus"), "active");
      assert.ok(requests.some(request => request.method === "HEAD"));
      failure = 0;
      await click("document.querySelector('[data-audio-player] button:last-child')");
      await waitFor(`${row(1)}.getAttribute('aria-pressed')==='true'`);
      for (const [status, label] of [[500, t.failed], [404, t.missing]]) {
        failure = status;
        await click(row(2));
        await waitFor(`document.querySelector('[data-audio-player] [role=alert]')?.textContent===${JSON.stringify(label)}`);
        assert.equal(await evaluate("document.querySelector('[data-application-runtime]').dataset.sessionStatus"), "active");
        failure = 0;
        await click(row(1));
        await waitFor(`${row(1)}.getAttribute('aria-pressed')==='true'`);
      }
      await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
      await evaluate("document.querySelector('main').style.minHeight='1600px'; window.scrollTo(0,document.body.scrollHeight)");
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
      assert.equal(await evaluate("document.querySelector('[data-application-footer]').getBoundingClientRect().bottom<=innerHeight+1"), true);
      assert.equal(await evaluate("document.querySelector('main').getBoundingClientRect().bottom<=document.querySelector('[data-application-footer]').getBoundingClientRect().top+1"), true);
      await send("Emulation.clearDeviceMetricsOverride");
      await signOut();
      await waitFor("location.pathname==='/login'");
      assert.equal(await evaluate("savedAudio.paused && !savedAudio.hasAttribute('src')"), true);
      console.log(`Playback ${locale}: shared controls, keyboard/Range, ended/replay, switching, navigation, policy/HTTP errors, retry, mobile footer, logout OK`);
    }
  });
} finally {
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
}
