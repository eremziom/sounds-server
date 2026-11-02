import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const sampleRate = 44100, duration = 16;
const wav = Buffer.alloc(44 + sampleRate * duration * 4);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < duration * sampleRate; i++) {
  const time = i / sampleRate;
  const phase = time % 0.5;
  const sample = time < 3 ? 0.5 * Math.sin(2 * Math.PI * 100 * time)
    : time < 6 ? 0.25 * Math.sin(2 * Math.PI * 4000 * time)
    : time < 9 ? 0 : phase < 0.15 ? 0.8 * Math.sin(2 * Math.PI * 80 * time) * Math.sin(Math.PI * phase / 0.15) : 0;
  const value = Math.round(32767 * sample);
  wav.writeInt16LE(value, 44 + i * 4); wav.writeInt16LE(-value, 46 + i * 4);
}
const session = authSession();
const track = { id: 1, ownerId: 1, author: "User", hasAudio: true, title: "Stereo phases", description: null, genre: null, subgenre: null, publicationDate: "2026-01-01", bpm: null };
const api = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url.startsWith("/auth/logout")) return res.writeHead(204).end();
  if (req.headers.authorization !== `Bearer ${session.accessToken}`) return res.writeHead(401).end('{"code":"AUTH_REQUIRED"}');
  if (req.url === "/auth/me") return res.end(JSON.stringify({ ...session.user, permissions: ["tracks:read"], sessionExpiresAt: session.refreshTokenExpiresAt }));
  if (req.url === "/tracks") return res.end(JSON.stringify([track, { ...track, id: 2, title: "Other track" }]));
  if (req.url === "/tracks/1") return res.end(JSON.stringify(track));
  if (/^\/tracks\/[12]\/audio$/.test(req.url)) {
    res.setHeader("Content-Type", "audio/wav"); res.setHeader("Accept-Ranges", "bytes");
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    if (range) { res.statusCode = 206; res.setHeader("Content-Range", `bytes ${start}-${end}/${wav.length}`); }
    res.setHeader("Content-Length", end - start + 1);
    return res.end(req.method === "HEAD" ? undefined : wav.subarray(start, end + 1));
  }
  res.writeHead(404).end('{"code":"NOT_FOUND"}');
});
api.listen(0, "127.0.0.1"); await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, origin, choose, signOut }) => {
    const value = key => `document.querySelector('[data-live-value="${key}"]').value`;
    const audio = "document.querySelector('[data-persistent-media] audio')";
    const click = selector => send("Runtime.evaluate", { userGesture: true, expression: `document.querySelector(${JSON.stringify(selector)}).click()` });
    const allValues = "Array.from(document.querySelectorAll('[data-live-value]'), input=>input.value)";
    for (const locale of ["en", "pl", "es"]) {
      const t = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")).app.liveAnalysis;
      await send("Network.setCookies", { cookies: [
        { name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true },
        { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
        { name: "locale", value: locale, url: origin, path: "/" },
      ] });
      await send("Page.navigate", { url: `${origin}/library/1/analysis` });
      await waitFor("document.querySelector('[data-live-start]') && document.querySelector('header a[href=\"/library\"]')");
      await evaluate("window.sourceCreations=0; window.originalSource=AudioContext.prototype.createMediaElementSource; AudioContext.prototype.createMediaElementSource=function(...args){sourceCreations++;return originalSource.apply(this,args)}");
      await evaluate("window.fastReads=0; window.originalRead=AnalyserNode.prototype.getFloatTimeDomainData; AnalyserNode.prototype.getFloatTimeDomainData=function(...args){if(this.fftSize===1024)fastReads++;return originalRead.apply(this,args)}");
      await click("[data-live-start]");
      await waitFor(`${value("bass")} !== '—' && parseFloat(${value("bass")}.replace(',','.'))>95`);
      assert.ok(await evaluate(`parseFloat(${value("rms")}.replace(',','.')) > -10`), "Opposite stereo phases retain their actual RMS");
      assert.ok(await evaluate("Number(document.querySelector('[data-bass-visual]').dataset.bassEnergy)>0"), "Sustained bass enlarges the orb");
      assert.equal(await evaluate("document.querySelector('[data-bass-pulse]').getAnimations().length"), 0, "A steady bass tone does not produce false flashes");
      assert.equal(await evaluate("document.querySelector('[data-live-status]').textContent"), t.running);
      assert.equal(await evaluate("!!document.querySelector('[data-analysis-result]')"), false, "Live mode does not read or compute an offline table");
      assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-live-value]')).every(input=>input.readOnly)"), true);
      const firstTime = await evaluate(value("time"));
      const readsBeforeUiUpdate = await evaluate("fastReads");
      await waitFor(`${value("time")} !== ${JSON.stringify(firstTime)}`);
      assert.ok((await evaluate("fastReads")) - readsBeforeUiUpdate >= 8, "Short signal windows are read several times between numeric UI updates");
      await click("[data-player-toggle]");
      await waitFor("document.querySelector('[data-live-analysis]').dataset.liveState==='paused'");
      const frozen = await evaluate(allValues); await delay(250);
      assert.deepEqual(await evaluate(allValues), frozen, "Pause freezes all fields");
      assert.equal(await evaluate("document.querySelector('[data-bass-pulse]').getAnimations().length"), 0, "Pause cancels the pulse animation");
      await click("[data-player-toggle]");
      await evaluate(`${audio}.currentTime=4.1`);
      await waitFor(`parseFloat(${value("upper")}.replace(',','.'))>95`);
      const expectedHz = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.round(4000 * 4096 / sampleRate) * sampleRate / 4096);
      assert.equal(await evaluate(value("dominant")), `${expectedHz} Hz`);
      assert.equal(await evaluate(value("bassTime")), "—", "Seeking clears previous detections");
      await evaluate(`${audio}.currentTime=6.5`);
      await waitFor(`${value("silence")}===${JSON.stringify(t.yes)}`);
      assert.ok(await evaluate(`${value("rms")}==='-120'`));
      await evaluate(`window.hitTimes=[]; window.hitObserver=new MutationObserver(()=>{const time=Number(document.querySelector('[data-bass-visual]').dataset.bassLastPulse); if(time>0 && hitTimes.at(-1)!==time) hitTimes.push(time)}); hitObserver.observe(document.querySelector('[data-bass-visual]'),{attributes:true,attributeFilter:['data-bass-last-pulse']}); ${audio}.currentTime=9.2`);
      await waitFor(`${value("bassTime")}!=='—' && ${value("bassStrength")}!=='—'`);
      await waitFor("hitTimes.length>=3");
      const hits = await evaluate("hitTimes.slice(0,3)");
      hits.forEach((time, i) => {
        assert.ok(Math.abs(time - Math.round(time / 0.5) * 0.5) < 0.1, `Attack timing ${time}`);
        if (i) assert.ok(time - hits[i - 1] > 0.4 && time - hits[i - 1] < 0.6, "One visual event per synthetic bass hit");
      });
      await evaluate("hitObserver.disconnect()");
      await waitFor("document.querySelector('[data-bass-pulse]').getAnimations().some(animation=>animation.playState==='running')");
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      const lastPulse = await evaluate("document.querySelector('[data-bass-visual]').dataset.bassLastPulse");
      await waitFor(`document.querySelector('[data-bass-visual]').dataset.bassLastPulse!==${JSON.stringify(lastPulse)}`);
      assert.equal(await evaluate("document.querySelector('[data-bass-pulse]').getAnimations().length"), 0, "Reduced motion keeps detection but disables animated flashes");
      assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-bass-orb]')).transform"), "none");
      await send("Emulation.setEmulatedMedia", { features: [] });
      // Actual keyboard input exercises all three range controls and React state.
      for (const selector of ["[data-bass-sensitivity]", "[data-bass-interval]", "[data-bass-decay]"]) {
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End", windowsVirtualKeyCode: 35 });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "End", code: "End", windowsVirtualKeyCode: 35 });
      }
      assert.equal(await evaluate("document.querySelector('[data-bass-sensitivity]').value"), "3");
      assert.equal(await evaluate("document.querySelector('[data-bass-interval]').value"), "600");
      await waitFor("document.querySelector('[data-bass-pulse]').getAnimations().some(animation=>animation.effect.getTiming().duration===600)");
      await click("[data-bass-reset]");
      assert.equal(await evaluate("document.querySelector('[data-bass-sensitivity]').value"), "1");
      assert.equal(await evaluate("document.querySelector('[data-bass-interval]').value"), "180");
      assert.equal(await evaluate("document.querySelector('[data-bass-decay]').value"), "220");
      await click("[data-live-stop]");
      await waitFor("document.querySelector('[data-live-analysis]').dataset.liveState==='idle'");
      assert.equal(await evaluate(`${audio}.paused`), false, "Stopping analysis leaves playback running");
      await evaluate(`${audio}.currentTime=0.3`);
      await click("[data-live-start]");
      await waitFor(`parseFloat(${value("bass")}.replace(',','.'))>95`);
      assert.equal(await evaluate("sourceCreations"), 1, "Restart reuses the media source node");
      await choose(locale === "en" ? "pl" : "en");
      await waitFor("document.querySelector('[data-live-analysis]').dataset.liveState==='running'");
      await choose(locale);
      await evaluate(`void(window.savedLiveAudio=${audio})`);
      await click("a[href='/library']");
      await waitFor("document.querySelector('[data-library]')");
      assert.equal(await evaluate(`savedLiveAudio===${audio} && !savedLiveAudio.paused`), true, "Navigation retains audible playback");
      await click("[data-track-id='2'] button");
      await waitFor(`${audio}.getAttribute('src')==='/api/tracks/2/audio' && !${audio}.paused`);
      await click("[data-track-id='1'] a");
      await waitFor("document.querySelector('[data-live-start]')");
      await click("[data-live-start]");
      await waitFor(`parseFloat(${value("bass")}.replace(',','.'))>95`);
      assert.equal(await evaluate("sourceCreations"), 1, "Page remount and track changes reuse the source node");
      if (locale === "pl") {
        await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
        assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
        await send("Emulation.clearDeviceMetricsOverride");
      }
      await evaluate(`${audio}.currentTime=${duration - 0.2}`);
      await waitFor("document.querySelector('[data-live-analysis]').dataset.liveState==='ended'");
      const ended = await evaluate(allValues); await delay(150);
      assert.deepEqual(await evaluate(allValues), ended, "End of track freezes fields");
      await signOut();
      await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]')");
      assert.equal(await evaluate("savedLiveAudio.paused && !savedLiveAudio.hasAttribute('src')"), true);
      console.log(`Live audio ${locale}: real stereo measurements, changing fields, pause, seek, pulses, silence, restart, navigation, track switching, end and logout passed.`);
    }
  });
} finally { api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); }
