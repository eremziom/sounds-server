import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const session = authSession({ accessToken: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature` });
const tracks = [100, 150].map((bpm, index) => ({ id: index + 1, ownerId: 1, author: "Kick QA", title: `${bpm} BPM`, bpm,
  genre: null, subgenre: null, description: null, publicationDate: "2026-01-01", hasAudio: true }));
function kickWav(bpm) {
  const rate = 44100, samples = rate * 20, wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const time = i / rate, phase = (time + 0.1) % (60 / bpm);
    const envelope = phase < 0.22 ? Math.min(1, phase / 0.003) * Math.exp(-phase / 0.055) : 0;
    const sample = Math.sin(2 * Math.PI * 80 * phase) * envelope * 0.75;
    wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return wav;
}
const files = tracks.map(track => kickWav(track.bpm));
const api = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/refresh") return res.end(JSON.stringify(session));
  if (req.url === "/auth/me") return res.end(JSON.stringify({ ...session.user, roles: [{ key: "USER" }], permissions: [], sessionExpiresAt: session.refreshTokenExpiresAt }));
  // No tempo metadata: the preview must derive its timing from actual audio.
  if (req.url === "/tracks") return res.end(JSON.stringify(tracks.map(track => ({ ...track, bpm: null }))));
  const track = /^\/tracks\/([12])\/audio$/.exec(req.url);
  if (track) {
    const wav = files[Number(track[1]) - 1], range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    res.setHeader("Content-Type", "audio/wav"); res.setHeader("Accept-Ranges", "bytes");
    if (range) { res.statusCode = 206; res.setHeader("Content-Range", `bytes ${start}-${end}/${wav.length}`); }
    res.setHeader("Content-Length", end - start + 1);
    return res.end(req.method === "HEAD" ? undefined : wav.subarray(start, end + 1));
  }
  res.writeHead(404).end("{}");
});
api.listen(0, "127.0.0.1"); await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, origin }) => {
    await send("Page.bringToFront");
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.kickGraphs=0;window.kickSources=0;
      const Original=AudioContext, source=Original.prototype.createMediaElementSource;
      window.AudioContext=class extends Original { constructor(...args){super(...args);kickGraphs++;} };
      Original.prototype.createMediaElementSource=function(...args){kickSources++;return source.apply(this,args);};
    ` });
    await send("Network.setCookies", { cookies: [
      { name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true },
      { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
      { name: "locale", value: "en", url: origin, path: "/" },
    ] });
    const audio = "document.querySelector('[data-persistent-media] audio')";
    const monitor = "document.querySelector('[data-iz-kick]')";
    const click = expression => send("Runtime.evaluate", { userGesture: true, expression: `${expression}.click()` });
    const evidence = [];
    for (const track of tracks) {
      if (track.id === 1) await send("Page.navigate", { url: `${origin}/library` });
      else await evaluate("window.next.router.push('/library')");
      await waitFor(`document.querySelector('[data-track-id="${track.id}"] button')`);
      await waitFor("document.querySelector('[data-infinite-zoom-canvas]')?.dataset.visualStatus==='ready' || document.querySelector('[data-infinite-zoom-canvas]')?.dataset.visualStatus==='paused'");
      await click(`document.querySelector('[data-track-id="${track.id}"] button')`);
      await waitFor(`!${audio}.paused && document.querySelector('[data-infinite-zoom-canvas]').dataset.visualStatus==='running'`);
      await evaluate("window.next.router.push('/animations')");
      await waitFor(monitor);
      await waitFor(`Number(${monitor}.dataset.kickCount)>=8`);
      const interval = await evaluate("parseInt(document.querySelector('[data-iz-kick-interval]').textContent,10)");
      assert.ok(Math.abs(interval - 60000 / track.bpm) < 85, `${track.bpm} BPM observed ${interval} ms`);
      evidence.push({ bpm: track.bpm, intervalMs: interval });
      if (track.id === 1) {
        // Inspect the real engine's exported fixed-step recording as well as
        // the UI preview. Suppress the download, keeping the product handler.
        await evaluate(`(() => {
          const create=URL.createObjectURL, click=HTMLAnchorElement.prototype.click;
          URL.createObjectURL=function(blob){blob.text().then(text=>{window.kickRecording=JSON.parse(text);});return create.call(this,blob);};
          HTMLAnchorElement.prototype.click=function(){if(!this.download)return click.call(this);};
          document.querySelector('[data-iz-diagnostics]').open=true;
        })()`);
        await click("document.querySelector('[data-iz-export-replay]')");
        await waitFor("window.kickRecording?.frames.some(frame=>frame.signals?.kick>0.5)");
        assert.ok(await evaluate("kickRecording.frames.some(frame=>frame.signals?.kick===0)"), "Engine receives distinct peaks and silence");
      }
      await click("document.querySelector('[data-player-toggle]')");
      await waitFor(`${audio}.paused && Number(${monitor}.dataset.kickValue)===0`);
      assert.equal(await evaluate("document.querySelector('[data-iz-kick-interval]').textContent"), "—");
    }
    assert.deepEqual(await evaluate("[kickGraphs,kickSources,document.querySelectorAll('[data-infinite-zoom-canvas]').length]"), [1, 1, 1]);
    // Disable and seek: no cached transient should remain visible or restart music.
    await click("document.querySelector('[data-iz-modulation]')");
    await evaluate(`${audio}.currentTime=2`); await delay(250);
    assert.equal(await evaluate(`${audio}.paused && Number(${monitor}.dataset.kickValue)===0`), true);
    await click("document.querySelector('[data-player-toggle]')");
    await waitFor(`!${audio}.paused`); await delay(700);
    assert.equal(await evaluate(`!${audio}.paused && Number(${monitor}.dataset.kickValue)===0`), true, "Disabling modulation never stops music");
    await click("document.querySelector('[data-iz-modulation]')");
    await waitFor(`Number(${monitor}.dataset.kickCount)>=2`);
    await click("document.querySelector('[data-player-toggle]')");
    await waitFor(`${audio}.paused && Number(${monitor}.dataset.kickValue)===0`);
    console.log(JSON.stringify({ kickAudioEvidence: evidence, graph: "one", pauseAndSeek: "pass" }));
  });
} finally { await new Promise(resolve => api.close(resolve)); }
