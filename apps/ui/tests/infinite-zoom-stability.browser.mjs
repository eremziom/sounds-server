import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

// Real wall-time audio, without fast-forwarding the simulation or audio clock.
// The smoke option exercises interruptions quickly; acceptance uses 330s.
const duration = process.argv.includes("--smoke") ? 25 : 330;
const session = authSession({ accessToken: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+1200 })).toString("base64url")}.signature` });
const rate = 8000, samples = rate * 45, wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length-8,4); wav.write("WAVEfmt ",8);
wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
wav.write("data",36); wav.writeUInt32LE(samples*2,40);
for (let i=0;i<samples;i++) wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*100/rate)*8000),44+i*2);
const tracks = [1,2,3].map(id => ({ id, ownerId:1, author:"IZ", title:`Stability ${id}`, genre:null, subgenre:null, description:null, publicationDate:"2026-01-01", bpm:null, hasAudio:true }));
const api = createServer((req,res) => {
  res.setHeader("Content-Type","application/json");
  if (req.url === "/auth/refresh") return res.end(JSON.stringify(session));
  if (req.url.startsWith("/auth/logout")) return res.writeHead(204).end();
  if (req.url === "/auth/me") return res.end(JSON.stringify({ ...session.user, roles:[{key:"USER"}], permissions:[], sessionExpiresAt:session.refreshTokenExpiresAt }));
  if (req.url === "/tracks") return res.end(JSON.stringify(tracks));
  if (/^\/tracks\/[123]\/audio$/.test(req.url)) {
    res.setHeader("Content-Type","audio/wav"); res.setHeader("Accept-Ranges","bytes");
    const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    const start = match ? Number(match[1]) : 0, end = match?.[2] ? Math.min(Number(match[2]),wav.length-1) : wav.length-1;
    if (match) { res.statusCode=206; res.setHeader("Content-Range",`bytes ${start}-${end}/${wav.length}`); }
    res.setHeader("Content-Length",end-start+1);
    return res.end(req.method === "HEAD" ? undefined : wav.subarray(start,end+1));
  }
  res.writeHead(404).end("{}");
});
api.listen(0,"127.0.0.1"); await once(api,"listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({send,evaluate,waitFor,origin,signOut}) => {
    const canvas = "document.querySelector('[data-infinite-zoom-canvas]')", audio = "document.querySelector('[data-persistent-media] audio')";
    const click = selector => send("Runtime.evaluate",{userGesture:true,expression:`document.querySelector(${JSON.stringify(selector)}).click()`});
    const tick = () => evaluate(`Number(${canvas}.dataset.simulationTick)`);
    const snapshot = () => evaluate("JSON.parse(document.querySelector('[data-iz-diagnostic-snapshot]').textContent)");
    await send("Page.bringToFront"); await send("Emulation.setFocusEmulationEnabled",{enabled:true});
    await send("Emulation.setDeviceMetricsOverride",{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await send("Page.addScriptToEvaluateOnNewDocument",{source:`(() => {
      window.izGraphs=0; window.izSources=0; window.izResources={Texture:new Set(),Buffer:new Set(),Program:new Set()}; window.izBitmaps=new Set();
      const Original=AudioContext; window.AudioContext=class extends Original { constructor(...args) { super(...args); izGraphs++; } };
      const source=Original.prototype.createMediaElementSource; Original.prototype.createMediaElementSource=function(...args) { izSources++; return source.apply(this,args); };
      for(const kind of Object.keys(izResources)) {
        const proto=WebGL2RenderingContext.prototype, create=proto['create'+kind], remove=proto['delete'+kind];
        proto['create'+kind]=function(...args) { const value=create.apply(this,args); if(value) izResources[kind].add(value); return value; };
        proto['delete'+kind]=function(value) { izResources[kind].delete(value); return remove.call(this,value); };
      }
      const bitmap=createImageBitmap, close=ImageBitmap.prototype.close;
      window.createImageBitmap=async function(...args) { const value=await bitmap.apply(this,args); izBitmaps.add(value); return value; };
      ImageBitmap.prototype.close=function() { izBitmaps.delete(this); return close.call(this); };
    })();`});
    await send("Network.setCookies",{cookies:[{name:"accessToken",value:session.accessToken,url:origin,path:"/",httpOnly:true},{name:"refreshToken",value:session.refreshToken,url:origin,path:"/",httpOnly:true},{name:"locale",value:"en",url:origin,path:"/"}]});
    await send("Page.navigate",{url:`${origin}/library`}); await waitFor("document.querySelector('[data-track-id=\"1\"] button')");
    await waitFor(`${canvas}?.dataset.visualStatus==='ready'`);
    await click('[data-track-id="1"] button'); await waitFor(`${canvas}.dataset.visualStatus==='running'`);
    await evaluate(`void(window.izAudio=${audio}); void(window.izCanvas=${canvas}); void(window.izGl=izCanvas.getContext('webgl2'));
      izCanvas.addEventListener('webglcontextlost',()=>{ for(const set of Object.values(izResources)) set.clear(); })`);
    await evaluate("window.next.router.push('/animations')"); await waitFor("document.querySelector('[data-iz-diagnostic-snapshot]')");
    const machine = { cpu:cpus()[0]?.model, platform:platform(), arch:arch(), browser:await send("Browser.getVersion"),
      graphics:await evaluate(`(() => { const gl=izCanvas.getContext('webgl2'), info=gl.getExtension('WEBGL_debug_renderer_info'); return {renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio}; })()`) };
    const started = Date.now(), initial = await snapshot(), checkpoints = [];

    // Emulated media buffering: canplay alone cannot release the suspension.
    await evaluate("izAudio.dispatchEvent(new Event('waiting'))"); await waitFor(`${canvas}.dataset.visualStatus==='suspended'`);
    let frozen = await tick(); await delay(300); assert.equal(await tick(),frozen);
    await evaluate("izAudio.dispatchEvent(new Event('canplay'))"); await delay(150); assert.equal(await tick(),frozen);
    await evaluate("izAudio.dispatchEvent(new Event('playing'))"); await waitFor(`${canvas}.dataset.visualStatus==='running'`);
    // Visibility is emulated through the document event/property, without
    // throttling the media process; it tests the integration listener itself.
    await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange'))");
    await waitFor(`${canvas}.dataset.visualStatus==='suspended'`); frozen = await tick(); await delay(300); assert.equal(await tick(),frozen);
    const resumeStarted = Date.now();
    await evaluate("delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))");
    await waitFor(`${canvas}.dataset.visualStatus==='running'`);
    const resumed = await tick();
    assert.ok(resumed-frozen <= Math.ceil((Date.now()-resumeStarted)*60/1000)+2,"Only visible elapsed time advances, including the UI polling delay");

    // Actual WEBGL_lose_context during A/B; restore the same logical session.
    await click('[data-iz-transition]'); await waitFor("document.querySelector('[data-iz-state]').dataset.transition==='revealing'");
    await evaluate("void(window.izLose=izCanvas.getContext('webgl2').getExtension('WEBGL_lose_context')); izLose.loseContext()");
    await waitFor(`${canvas}.dataset.visualStatus==='suspended'`); frozen = await tick();
    await delay(300); assert.equal(await tick(),frozen); assert.equal(await evaluate("izAudio.paused"),false);
    await evaluate("izLose.restoreContext()"); await waitFor(`${canvas}.dataset.visualStatus==='running'`);
    await waitFor("document.querySelector('[data-iz-state]').dataset.transition==='committed'");
    assert.ok((await snapshot()).events.some(event=>event.code==='CONTEXT_RESTORED'));
    // Restoration cannot override a user pause.
    await click('[data-player-toggle]'); await waitFor(`${canvas}.dataset.visualStatus==='paused'`); frozen = await tick();
    await evaluate("izLose.loseContext()"); await delay(300); await evaluate("izLose.restoreContext()"); await delay(300);
    assert.equal(await tick(),frozen); assert.equal(await evaluate("izAudio.paused"),true);
    await click('[data-player-toggle]'); await waitFor(`${canvas}.dataset.visualStatus==='running'`);
    await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
    await delay(300); assert.equal(await evaluate(`${canvas}===izCanvas && ${audio}===izAudio`),true);
    await send("Emulation.setDeviceMetricsOverride",{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await click('[data-iz-immersive]'); await delay(200); await click('[data-iz-exit]');

    if (duration<300) {
      // Deliberately delay rAF delivery in the smoke test only. This is not part
      // of the hardware calibration. Preserve the original monotonic rAF stamps.
      const beforeFallback = await evaluate("({width:izCanvas.width,tick:Number(izCanvas.dataset.simulationTick)})");
      await evaluate("void(window.izNativeRAF=window.requestAnimationFrame); void(window.requestAnimationFrame=callback=>izNativeRAF(time=>setTimeout(()=>callback(time),30)))");
      try { await waitFor("izCanvas.dataset.qualityProfile==='Balanced'"); }
      finally { await evaluate("void(window.requestAnimationFrame=izNativeRAF)"); }
      assert.ok(await evaluate("izCanvas.width")<beforeFallback.width,"Fallback reduces actual target dimensions");
      assert.ok(await tick()>beforeFallback.tick,"Fallback preserves logical progress");
      assert.equal(await evaluate("izAudio.paused"),false);
      assert.ok((await snapshot()).events.some(event=>event.code==='QUALITY_PROFILE_CHANGED'));
    }

    let switches = 0, transitions = 1, nextTransitionAt = 25, nextReportAt = 30, previousTick = await tick(), playedSeconds = 0;
    await evaluate("void(window.izPlaybackSeconds=0); void(window.izPreviousAudioTime=izAudio.currentTime)");
    while ((Date.now()-started)/1000 < duration) {
      await delay(1000);
      const state = await evaluate(`({ended:izAudio.ended,paused:izAudio.paused,status:izCanvas.dataset.visualStatus,tick:Number(izCanvas.dataset.simulationTick),time:izAudio.currentTime,same:${canvas}===izCanvas && ${audio}===izAudio})`);
      assert.ok(state.same);
      assert.notEqual(state.status,"error",await evaluate("izCanvas.dataset.visualError"));
      assert.ok(state.tick>=previousTick); previousTick=state.tick;
      await evaluate("if(izAudio.currentTime>=izPreviousAudioTime) izPlaybackSeconds+=izAudio.currentTime-izPreviousAudioTime; izPreviousAudioTime=izAudio.currentTime");
      if (state.ended) {
        frozen = await tick(); await delay(150); assert.equal(await tick(),frozen);
        switches++; await evaluate("window.next.router.push('/library')"); await waitFor("document.querySelector('[data-track-id=\"1\"] button')");
        await click(`[data-track-id="${switches%3+1}"] button`); await waitFor(`${canvas}.dataset.visualStatus==='running'`);
        assert.ok(await tick()>=frozen);
        await evaluate("void(window.izPreviousAudioTime=izAudio.currentTime); window.next.router.push('/animations')");
        await waitFor("document.querySelector('[data-iz-state]')");
      } else assert.equal(state.paused,false);
      const elapsed = (Date.now()-started)/1000;
      if (elapsed>=nextTransitionAt && !['preparing','prepared','revealing','rollingBack'].includes(await evaluate("document.querySelector('[data-iz-state]').dataset.transition"))) {
        await click('[data-iz-transition]'); transitions++; nextTransitionAt=elapsed+25;
      }
      if (elapsed>=nextReportAt) {
        const current = await snapshot(); checkpoints.push({elapsed,...current}); nextReportAt+=30;
        assert.ok(current.resources.artworks<=2); assert.ok(current.resources.textures<=7); assert.ok(current.events.length<=128); assert.ok(current.retainedFrames<=600);
        console.log(`IZ stability ${Math.round(elapsed)}s: ${current.quality.profile}, p95=${current.frameMsP95.toFixed(1)}ms, textures=${current.resources.textures}`);
      }
    }
    playedSeconds = await evaluate("izPlaybackSeconds");
    if (duration>=300) { assert.ok(playedSeconds>=300,`Actual played seconds: ${playedSeconds}`); assert.ok(switches>=6); }
    const final = await snapshot();
    assert.deepEqual(await evaluate("[izGraphs,izSources]"),[1,1]);
    assert.equal(final.events.some(event=>event.severity==='error'),false);
    await signOut(); await waitFor("location.pathname==='/login'");
    const cleanup = await evaluate("({gpu:Object.fromEntries(Object.entries(izResources).map(([key,value])=>[key,[...value].filter(resource=>izGl['is'+key](resource)).length])),bitmaps:izBitmaps.size,audioPaused:izAudio.paused})");
    assert.deepEqual(cleanup,{gpu:{Texture:0,Buffer:0,Program:0},bitmaps:0,audioPaused:true});
    const report = { durationSeconds:(Date.now()-started)/1000, playedSeconds, switches, transitions, machine, initial, checkpoints, final, cleanup,
      caveats:["Headless browser calibration, hardware-dependent; frame intervals are not GPU timer queries.","Buffering and visibility events emulated; context loss uses actual WEBGL_lose_context.","GPU bytes are raw RGBA8 estimates, excluding driver overhead and the browser default framebuffer."] };
    const directory = new URL("../../../.tmp/",import.meta.url); await mkdir(directory,{recursive:true});
    const reportPath = new URL(`infinite-zoom-stability${duration<300?'-smoke':''}.json`,directory); await writeFile(reportPath,JSON.stringify(report,null,2));
    console.log(`IZ stability passed: ${playedSeconds.toFixed(1)}s audio, ${switches} track switches, ${transitions} transitions; report ${reportPath.pathname}`);
  });
} finally { await new Promise(resolve=>api.close(resolve)); }
