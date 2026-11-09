import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const session = authSession({ accessToken: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature` });
const tracks = [100, 150].map((bpm, index) => ({ id: index + 1, ownerId: 1, author: "Kick QA", title: `${bpm} BPM`, bpm,
  genre: null, subgenre: null, description: null, publicationDate: "2026-01-01", hasAudio: true }));
tracks.push({ ...tracks[1], id: 3, title: "High attacks only", highOnly: true });
tracks.push({ ...tracks[0], id: 4, title: "Mid attacks only", midOnly: true });
function kickWav(bpm, highOnly = false, midOnly = false) {
  const rate = 44100, samples = rate * 20, wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const short = highOnly || midOnly;
    const time = i / rate, phase = (time + 0.1) % (60 / bpm / (short ? 2 : 1));
    // A Hann-windowed 700 Hz burst stays near the middle of the configured
    // band. Abrupt 1 kHz bursts leak into the finite high-band filter skirt.
    const envelope = midOnly ? (phase < 0.12 ? Math.sin(Math.PI * phase / 0.12) ** 2 : 0)
      : phase < (short ? 0.08 : 0.22) ? Math.min(1, phase / 0.003) * Math.exp(-phase / (short ? 0.025 : 0.055)) : 0;
    const sample = Math.sin(2 * Math.PI * (highOnly ? 6000 : midOnly ? 700 : 80) * phase) * envelope * 0.75;
    wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return wav;
}
const files = tracks.map(track => kickWav(track.bpm, track.highOnly, track.midOnly));
const api = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/refresh") return res.end(JSON.stringify(session));
  if (req.url === "/auth/me") return res.end(JSON.stringify({ ...session.user, roles: [{ key: "USER" }], permissions: [], sessionExpiresAt: session.refreshTokenExpiresAt }));
  // No tempo metadata: the preview must derive its timing from actual audio.
  if (req.url === "/tracks") return res.end(JSON.stringify(tracks.map(track => ({ ...track, bpm: null }))));
  const track = /^\/tracks\/([1234])\/audio$/.exec(req.url);
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
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, origin, fill }) => {
    await send("Page.bringToFront");
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      (()=>{
      window.kickGraphs=0;window.kickSources=0;
      const Original=AudioContext, source=Original.prototype.createMediaElementSource;
      window.AudioContext=class extends Original { constructor(...args){super(...args);kickGraphs++;} };
      Original.prototype.createMediaElementSource=function(...args){kickSources++;return source.apply(this,args);};
      window.membraneFrames=[];window.skyFrames=[];
      const proto=WebGL2RenderingContext.prototype, location=proto.getUniformLocation, uniform=proto.uniform4fv, names=new WeakMap();
      const skyUniforms=new WeakSet();
      proto.getUniformLocation=function(program,name){const result=location.call(this,program,name);if(result){names.set(result,name);
        if(name==='effect_0_0'&&this.getAttachedShaders(program).some(shader=>this.getShaderSource(shader).includes('0.72000000')))skyUniforms.add(result);
      }return result;};
      proto.uniform4fv=function(location,data,...rest){
        const [x,y,z,w]=data;
        if(names.get(location)==='effect_0_0' && Math.abs(z-2778.9473684210525)<.1 && Math.abs(w-1411.6896918172158)<.1 && membraneFrames.length<5000)
          membraneFrames.push({time:performance.now(),x,y});
        if(skyUniforms.has(location)&&skyFrames.length<5000)skyFrames.push({time:performance.now(),amount:x});
        return uniform.call(this,location,data,...rest);
      };
      })();
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
    for (const track of tracks.filter(track => track.id <= 2)) {
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
          URL.createObjectURL=function(blob){if(blob.type==='application/json')blob.text().then(text=>{window.kickRecording=JSON.parse(text);});return create.call(this,blob);};
          HTMLAnchorElement.prototype.click=function(){if(!this.download)return click.call(this);};
          document.querySelector('[data-iz-diagnostics]').open=true;
        })()`);
        await click("document.querySelector('[data-iz-export-replay]')");
        await waitFor("window.kickRecording?.frames.some(frame=>frame.signals?.kick>0.5)");
        assert.ok(await evaluate("kickRecording.frames.some(frame=>frame.signals?.kick===0)"), "Engine receives distinct peaks and silence");
      }
      await evaluate(`(() => {const select=document.querySelector('[data-iz-scene]');select.value='alien';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await waitFor("document.querySelector('[data-iz-state]').dataset.artwork==='insectoid-planet' && !document.querySelector('[data-iz-scene]').disabled");
      await evaluate("window.membraneFrames=[]");
      const initialCount = await evaluate(`Number(${monitor}.dataset.kickCount)`);
      await waitFor(`Number(${monitor}.dataset.kickCount)>=${initialCount + 6}`);
      const breath = await evaluate(`(() => {
        const samples=membraneFrames.filter((f,i,a)=>!i || f.x!==a[i-1].x);
        const peaks=samples.filter((f,i,a)=>i>0&&i<a.length-1&&f.x>a[i-1].x&&f.x>a[i+1].x&&f.x>1.01);
        const intervals=peaks.slice(1).map((p,i)=>p.time-peaks[i].time).sort((a,b)=>a-b);
        return {peaks:peaks.length,intervalMs:intervals[Math.floor(intervals.length/2)],maximum:Math.max(...samples.map(f=>f.x))};
      })()`);
      assert.ok(breath.peaks >= 4, `Actual GPU membrane breathes: ${JSON.stringify(breath)}`);
      assert.ok(Math.abs(breath.intervalMs - 60000 / track.bpm) < 85, `Actual GPU breath timing: ${JSON.stringify(breath)}`);
      assert.ok(breath.maximum > 1.01 && breath.maximum <= 1.06);
      evidence.at(-1).breath = breath;
      await click("document.querySelector('[data-player-toggle]')");
      await waitFor(`${audio}.paused && Number(${monitor}.dataset.kickValue)===0`);
      assert.equal(await evaluate("document.querySelector('[data-iz-kick-interval]').textContent"), "—");
      const frozen = await evaluate("JSON.stringify(membraneFrames.at(-1))"); await delay(100);
      assert.equal(await evaluate("JSON.stringify(membraneFrames.at(-1))"), frozen, "Pause freezes the rendered membrane deformation");
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
    // High-only transients must drive their own preview without bass hits or
    // membrane breaths, through the same graph and source as both kick tracks.
    await evaluate("window.next.router.push('/library')");
    await waitFor("document.querySelector('[data-track-id=\"3\"] button')");
    await click("document.querySelector('[data-track-id=\"3\"] button')");
    await waitFor(`!${audio}.paused`);
    await evaluate("window.next.router.push('/animations')");
    const highMonitor = "document.querySelector('[data-iz-high-attack]')";
    await waitFor(`Number(${highMonitor}?.dataset.highAttackCount)>=8`);
    const highInterval = await evaluate("parseInt(document.querySelector('[data-iz-high-attack-interval]').textContent,10)");
    assert.ok(Math.abs(highInterval - 200) < 60, `High-only attacks every 200 ms: ${highInterval}`);
    assert.equal(await evaluate(`Number(${monitor}.dataset.kickCount)`), 0, "High attacks do not fabricate kicks");
    await evaluate("window.skyFrames=[]");
    const highCount=await evaluate(`Number(${highMonitor}.dataset.highAttackCount)`);
    await waitFor(`Number(${highMonitor}.dataset.highAttackCount)>=${highCount+5}`);
    const sky=await evaluate(`(()=>{const peaks=skyFrames.filter((f,i,a)=>i>0&&i<a.length-1&&f.amount>a[i-1].amount&&f.amount>a[i+1].amount&&f.amount>.2);const intervals=peaks.slice(1).map((p,i)=>p.time-peaks[i].time).sort((a,b)=>a-b);return{peaks:peaks.length,intervalMs:intervals[Math.floor(intervals.length/2)]};})()`);
    assert.ok(sky.peaks>=3&&Math.abs(sky.intervalMs-200)<60,`Real audio drives sky emission: ${JSON.stringify(sky)}`);
    assert.deepEqual(await evaluate(`['bass','mid','high'].map(band=>['fromHz','toHz'].map(edge=>Number(document.querySelector('input[name="iz-band-'+band+'-'+edge+'"]').value)))`),[[20,250],[250,2000],[2000,16000]]);
    await fill({"iz-band-bass-fromHz":"40","iz-band-bass-toHz":"180","iz-band-mid-fromHz":"900","iz-band-mid-toHz":"1100"});
    // Move the high detector away from the playing 6 kHz fixture. Keep enough
    // distance from the finite filter skirt to test a clear rejection.
    await fill({"iz-band-high-toHz":"19000","iz-band-high-fromHz":"17000"});
    await evaluate("document.querySelector('input[name=iz-band-high-fromHz]').blur()");
    await delay(800);
    assert.equal(await evaluate(`Number(${highMonitor}.dataset.highAttackCount)`),0,"Edited high range rejects the 6 kHz attacks");
    assert.equal(await evaluate(`${audio}.paused`),false,"Frequency edits preserve playback");
    await click("document.querySelector('[data-iz-band-range=high] [data-iz-band-reset]')");
    await waitFor(`Number(${highMonitor}.dataset.highAttackCount)>=3`);
    assert.deepEqual(await evaluate(`['bass','mid','high'].map(band=>['fromHz','toHz'].map(edge=>Number(document.querySelector('input[name="iz-band-'+band+'-'+edge+'"]').value)))`),[[40,180],[900,1100],[2000,16000]],"Per-band reset preserves other configured ranges");
    await fill({"iz-band-high-fromHz":"20000"});
    await evaluate("document.querySelector('input[name=iz-band-high-fromHz]').blur()");
    assert.equal(await evaluate("document.querySelector('input[name=iz-band-high-fromHz]').value"),"2000","Invalid range reverts on blur");
    await click("document.querySelector('[data-iz-band-range=bass] [data-iz-band-reset]')");
    await click("document.querySelector('[data-iz-band-range=mid] [data-iz-band-reset]')");
    // Check both the engine sample and preview. Returning to journey starts a
    // fresh recording only on explicit Reset, preserving the existing contract.
    await evaluate(`(() => {const select=document.querySelector('[data-iz-scene]');select.value='journey';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor("document.querySelector('[data-iz-state]').dataset.artwork==='forest' && !document.querySelector('[data-iz-scene]').disabled");
    await click("document.querySelector('[data-iz-reset]')");
    await waitFor(`Number(${highMonitor}.dataset.highAttackCount)>=4`);
    await evaluate("window.kickRecording=null");
    await click("document.querySelector('[data-iz-export-replay]')");
    await waitFor("window.kickRecording?.frames.some(frame=>frame.signals?.highAttack>0.3)");
    await click("document.querySelector('[data-iz-modulation]')");
    await waitFor(`Number(${highMonitor}.dataset.highAttackValue)===0`);
    assert.equal(await evaluate(`${audio}.paused`), false, "High monitor cannot stop audio");
    await click("document.querySelector('[data-iz-modulation]')");
    await waitFor(`Number(${highMonitor}.dataset.highAttackCount)>=2`);
    await click("document.querySelector('[data-player-toggle]')");
    await waitFor(`${audio}.paused && Number(${highMonitor}.dataset.highAttackValue)===0`);
    await evaluate(`${audio}.currentTime=2`); await delay(200);
    assert.equal(await evaluate(`Number(${highMonitor}.dataset.highAttackCount)`), 0);
    assert.deepEqual(await evaluate("[kickGraphs,kickSources,document.querySelectorAll('[data-infinite-zoom-canvas]').length]"), [1, 1, 1]);
    await evaluate("window.next.router.push('/library')");
    await waitFor("document.querySelector('[data-track-id=\"4\"] button')");
    await click("document.querySelector('[data-track-id=\"4\"] button')");
    await waitFor(`!${audio}.paused`);
    await evaluate("window.next.router.push('/animations')");
    const midMonitor = "document.querySelector('[data-iz-mid-attack]')";
    await waitFor(`Number(${midMonitor}?.dataset.midAttackCount)>=8`);
    const midInterval = await evaluate("parseInt(document.querySelector('[data-iz-mid-attack-interval]').textContent,10)");
    assert.ok(Math.abs(midInterval - 300) < 60, `Mid-only attacks every 300 ms: ${midInterval}`);
    assert.equal(await evaluate(`Number(${monitor}.dataset.kickCount)`), 0, "Mid attacks do not fabricate kicks");
    assert.equal(await evaluate(`Number(${highMonitor}.dataset.highAttackCount)`), 0, "Mid attacks do not fabricate high attacks");
    await click("document.querySelector('[data-iz-reset]')");
    const midCount = await evaluate(`Number(${midMonitor}.dataset.midAttackCount)`);
    await waitFor(`Number(${midMonitor}.dataset.midAttackCount)>=${midCount + 3}`);
    await evaluate("window.kickRecording=null");
    await click("document.querySelector('[data-iz-export-replay]')");
    await waitFor("window.kickRecording?.frames.some(frame=>frame.signals?.midAttack>0.3)");
    await click("document.querySelector('[data-iz-modulation]')");
    await waitFor(`Number(${midMonitor}.dataset.midAttackValue)===0`);
    assert.equal(await evaluate(`${audio}.paused`), false, "Mid monitor cannot stop audio");
    await click("document.querySelector('[data-iz-modulation]')");
    await waitFor(`Number(${midMonitor}.dataset.midAttackCount)>=2`);
    await click("document.querySelector('[data-player-toggle]')");
    await waitFor(`${audio}.paused && Number(${midMonitor}.dataset.midAttackValue)===0`);
    await evaluate(`${audio}.currentTime=2`); await delay(200);
    assert.equal(await evaluate(`Number(${midMonitor}.dataset.midAttackCount)`), 0);
    assert.deepEqual(await evaluate("[kickGraphs,kickSources,document.querySelectorAll('[data-infinite-zoom-canvas]').length]"), [1, 1, 1]);
    console.log(JSON.stringify({ kickAudioEvidence: evidence, highAttackIntervalMs: highInterval, sky, midAttackIntervalMs: midInterval, graph: "one", pauseAndSeek: "pass" }));
  });
} finally { await new Promise(resolve => api.close(resolve)); }
