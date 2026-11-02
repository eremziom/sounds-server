import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const sampleRate = 44100, duration = 8;
const wav = Buffer.alloc(44 + sampleRate * duration * 2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < duration * sampleRate; i++) {
  const time = i / sampleRate, phase = (time - 0.5) % 0.5;
  const value = time >= 0.5 && phase < 0.08 ? 0.8 * Math.sin(2 * Math.PI * 80 * time) * Math.sin(Math.PI * phase / 0.08) : 0;
  wav.writeInt16LE(Math.round(32767 * value), 44 + i * 2);
}
const session = authSession();
const track = { id: 1, ownerId: 1, author: "User", hasAudio: true, title: "Test pulses", description: null, genre: null, subgenre: null, publicationDate: "2026-01-01", bpm: null };
let mode = "ok", audioRequests = 0;
const api = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.headers.authorization !== `Bearer ${session.accessToken}`) return res.writeHead(401).end('{}');
  if (req.url === "/auth/me") return res.end(JSON.stringify({ ...session.user, permissions: ["tracks:read"], sessionExpiresAt: session.refreshTokenExpiresAt }));
  if (req.url === "/tracks") return res.end(JSON.stringify([track, { ...track, id: 2, title: "No audio", hasAudio: false }]));
  if (req.url === "/tracks/1") return res.end(JSON.stringify(track));
  if (req.url === "/tracks/1/audio") {
    audioRequests++;
    if (mode === "denied") return res.writeHead(403).end('{"code":"ACCESS_DENIED"}');
    if (mode === "missing") return res.writeHead(404).end('{"code":"AUDIO_NOT_FOUND"}');
    if (mode === "expired") return res.writeHead(401).end('{"code":"AUTH_SESSION_INVALID"}');
    res.setHeader("Content-Type", "audio/wav");
    if (mode === "slow") {
      let offset = 0;
      const timer = setInterval(() => {
        res.write(wav.subarray(offset, offset + 1024)); offset += 1024;
        if (offset >= wav.length) { clearInterval(timer); res.end(); }
      }, 50);
      res.on("close", () => clearInterval(timer));
      return;
    }
    const bytes = mode === "invalid" ? Buffer.from("invalid audio") : wav;
    res.setHeader("Content-Length", bytes.length);
    return res.end(bytes);
  }
  res.writeHead(404).end('{}');
});
api.listen(0, "127.0.0.1");
await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, origin, choose }) => {
    for (const locale of ["en", "pl", "es"]) {
      const t = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")).app.analysis;
      await send("Network.setCookies", { cookies: [
        { name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true },
        { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
        { name: "locale", value: locale, url: origin, path: "/" },
      ] });
      await send("Page.navigate", { url: `${origin}/library` });
      await waitFor("document.querySelector('[data-track-id=\"1\"] a[href=\"/library/1/analysis\"]')");
      assert.equal(await evaluate("!!document.querySelector('[data-track-id=\"2\"] a')"), false);
      await evaluate("document.querySelector('[data-track-id=\"1\"] a').click()");
      await waitFor(`document.querySelector('[data-analysis-start]') && location.pathname==='/library/1/analysis' && document.querySelector('[data-audio-analysis] h1')?.textContent===${JSON.stringify(t.title)}`);
      assert.equal(await evaluate("document.querySelector('[data-audio-analysis] h1').textContent"), t.title);
      assert.equal(await evaluate("document.querySelector('[data-persistent-media] audio').paused"), true);
      const before = audioRequests;
      mode = "ok";
      await evaluate("document.querySelector('[data-analysis-start]').click()");
      await waitFor("document.querySelector('[data-analysis-result]')");
      assert.equal(audioRequests, before + 1);
      assert.ok(await evaluate("document.querySelectorAll('[data-analysis-event=bassOnset]').length >= 12"));
      assert.equal(await evaluate("document.querySelector('[data-persistent-media] audio').paused"), true, "Analysis never plays the recording");
      // Capture the exported artifact, while retaining real blob URLs for metadata decoding.
      await evaluate(`window.originalObjectURL=URL.createObjectURL; URL.createObjectURL=blob=>{if(blob.type==='application/json')window.exportedAnalysis=blob.text();return originalObjectURL(blob)}; document.querySelector('[data-analysis-export]').click()`);
      await waitFor("window.exportedAnalysis");
      const exported = JSON.parse(await evaluate("window.exportedAnalysis"));
      assert.equal(exported.trackId, 1); assert.equal(exported.version, 1);
      assert.equal(exported.timeline.length, 80);
      assert.ok(exported.tempo && Math.abs(exported.tempo.bpm - 120) < 4);
      await evaluate("URL.createObjectURL=originalObjectURL; const select=document.querySelector('[data-analysis-view]'); select.value='timeline'; select.dispatchEvent(new Event('change',{bubbles:true}))");
      await waitFor("document.querySelectorAll('[data-analysis-result] tbody tr').length===50");
      assert.ok(await evaluate("document.querySelector('[data-analysis-result] tbody').textContent.includes('00:00.100')"));
      // A language update preserves computed data and does not download audio again.
      const nextLocale = locale === "en" ? "pl" : "en";
      const requestsBeforeLocale = audioRequests;
      await choose(nextLocale);
      await waitFor("document.querySelector('[data-analysis-result]')");
      assert.equal(audioRequests, requestsBeforeLocale);
      await choose(locale);

      for (const failure of ["denied", "missing", "invalid"]) {
        mode = failure;
        await evaluate("document.querySelector('[data-analysis-start]').click()");
        const expected = failure === "invalid" ? t.failed : t[failure];
        await waitFor(`document.querySelector('[data-analysis-panel] [role=alert]')?.textContent===${JSON.stringify(expected)}`);
        assert.equal(await evaluate("!!document.querySelector('[data-analysis-result]')"), false);
      }
      mode = "slow";
      await evaluate("document.querySelector('[data-analysis-start]').click()");
      await waitFor("document.querySelector('[data-analysis-cancel]')");
      await evaluate("document.querySelector('[data-analysis-cancel]').click()");
      await waitFor("!document.querySelector('[data-analysis-start]').disabled && !document.querySelector('[data-analysis-cancel]')");
      mode = "ok";
      await evaluate("document.querySelector('[data-analysis-start]').click()");
      await waitFor("document.querySelector('[data-analysis-result]')");
      if (locale === "pl") {
        await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
        assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), "Analysis fits a 320px viewport");
        await send("Emulation.clearDeviceMetricsOverride");
      }
      console.log(`Audio analysis ${locale}: full-file Web Audio decoding, worker DSP, timestamps, JSON, locale changes, errors and cancellation passed.`);
    }
    mode = "expired";
    await evaluate("document.querySelector('[data-analysis-start]').click()");
    await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]')");
    assert.equal(await evaluate("!!document.querySelector('[data-analysis-result]')"), false, "A rejected session clears analysis and ends the runtime");
  });
} finally {
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
}
