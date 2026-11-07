import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir,writeFile } from "node:fs/promises";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const session = authSession({ accessToken: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+900 })).toString("base64url")}.signature` });
const rate = 8000, samples = rate * 120, wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length-8,4); wav.write("WAVEfmt ",8);
wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
wav.write("data",36); wav.writeUInt32LE(samples*2,40);
for (let i=0;i<samples;i++) wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*100/rate)*8000),44+i*2);
const tracks = [1,2].map(id => ({ id, ownerId:1, author:"IZ", title:`IZ recording ${id}`, genre:null, subgenre:null, description:null, publicationDate:"2026-01-01", bpm:null, hasAudio:true }));
const api = createServer((req,res) => {
  res.setHeader("Content-Type","application/json");
  if (req.url === "/auth/refresh") return res.end(JSON.stringify(session));
  if (req.url.startsWith("/auth/logout")) return res.writeHead(204).end();
  if (req.url === "/auth/me") return res.end(JSON.stringify({ ...session.user, roles:[{key:"USER"}], permissions:[], sessionExpiresAt:session.refreshTokenExpiresAt }));
  if (req.url === "/tracks") return res.end(JSON.stringify(tracks));
  if (/^\/tracks\/[12]\/audio$/.test(req.url)) {
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
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({send,listeners,evaluate,waitFor,origin,signOut}) => {
    const canvas = "document.querySelector('[data-infinite-zoom-canvas]')";
    const audio = "document.querySelector('[data-persistent-media] audio')";
    const toggle = "document.querySelector('[data-player-toggle]')";
    const row = id => `document.querySelector('[data-track-id="${id}"] button')`;
    const click = expression => send("Runtime.evaluate",{userGesture:true,expression:`${expression}.click()`});
    const tick = () => evaluate(`Number(${canvas}.dataset.simulationTick)`);
    await send("Page.bringToFront");
    await send("Emulation.setFocusEmulationEnabled",{enabled:true});
    await send("Page.addScriptToEvaluateOnNewDocument",{source:`
      (() => {
      // Reproduce a browser profile whose disk-backed response Blob storage
      // fails. Critical PNGs and pilot SVGs must still prepare and play music.
      const responseBlob=Response.prototype.blob;
      Response.prototype.blob=function(...args) {
        if(this.url.includes('/infinite-zoom/')) return Promise.reject(new TypeError('Failed to fetch: profile Blob storage unavailable'));
        return responseBlob.apply(this,args);
      };
      window.izGraphs=0; window.izSources=0; window.izGain=1;
      const Original=window.AudioContext;
      window.AudioContext=class extends Original { constructor(...args) { super(...args); izGraphs++; } };
      const connect=Original.prototype.createMediaElementSource;
      Original.prototype.createMediaElementSource=function(...args) { izSources++; return connect.apply(this,args); };
      const names=new WeakMap(), proto=WebGL2RenderingContext.prototype, location=proto.getUniformLocation, scalar=proto.uniform1f;
      proto.getUniformLocation=function(program,name) { const value=location.call(this,program,name); if(value) names.set(value,name); return value; };
      proto.uniform1f=function(location,value) { if(names.get(location)==='audioGain') izGain=value; return scalar.call(this,location,value); };
      })();
    `});
    await send("Network.setCookies",{cookies:[{name:"accessToken",value:session.accessToken,url:origin,path:"/",httpOnly:true},{name:"refreshToken",value:session.refreshToken,url:origin,path:"/",httpOnly:true},{name:"locale",value:"en",url:origin,path:"/"}]});
    const held = [];
    listeners.set("Fetch.requestPaused",event => { held.push(event.requestId); });
    await send("Fetch.enable",{patterns:[{urlPattern:"*/infinite-zoom/samples/underwater-cavern/backdrop.png",requestStage:"Request"}]});
    await send("Page.navigate",{url:`${origin}/library`}); await waitFor(row(1)); await waitFor(canvas);
    for(let i=0;i<100 && !held.length;i++) await delay(25);
    assert.ok(held.length,"Third artwork is requested before initial readiness");
    await click(row(1)); await delay(150);
    assert.equal(await evaluate(`${audio}.paused`),true,"Audio waits for critical artwork"); assert.equal(await tick(),0);
    await click(row(1)); // cancel pending Play
    for(const requestId of held) await send("Fetch.continueRequest",{requestId});
    await send("Fetch.disable");
    await waitFor(`${canvas}.dataset.visualStatus==='ready'`);
    await delay(100); assert.equal(await evaluate(`${audio}.paused`),true,"Cancelled Play never starts late");
    assert.equal(await tick(),0);
    const lateArtworkLoads = [];
    listeners.set("Network.requestWillBeSent",event => {
      if (new URL(event.request.url).pathname.startsWith("/infinite-zoom/")) lateArtworkLoads.push(event.request.url);
    });

    await click(row(1)); await waitFor(`!${audio}.paused && ${canvas}.dataset.visualStatus==='running'`);
    await waitFor(`window.izGain>1.01`);
    assert.deepEqual(await evaluate("[izGraphs,izSources]"),[1,1],"Reuse one Web Audio graph/source");
    await evaluate(`void(window.izAudio=${audio}); void(window.izCanvas=${canvas})`);
    await click(toggle); await waitFor(`${canvas}.dataset.visualStatus==='paused'`);
    const paused = await tick(); await delay(250); assert.equal(await tick(),paused);
    await evaluate("window.next.router.push('/animations')"); await waitFor("document.querySelector('[data-infinite-zoom-controls]')");
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"forest","Forest is the initial scene");
    assert.equal(await evaluate(`${canvas}===izCanvas && ${audio}===izAudio`),true);
    const selectScene=async name=>{
      await evaluate(`(()=>{const select=document.querySelector('[data-iz-scene]');select.value=${JSON.stringify(name)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await waitFor(`document.querySelector('[data-iz-scene]').value===${JSON.stringify(name)} && !document.querySelector('[data-iz-scene]').disabled`);
    };
    const sceneTick=await tick();
    await evaluate("void(window.izGl=izCanvas.getContext('webgl2'))");
    await selectScene("pilot");
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"forest-pilot");
    assert.equal(await tick(),sceneTick,"Selecting a pilot cannot advance paused simulation");
    assert.equal(await evaluate(`${audio}.paused && izCanvas.getContext('webgl2')===izGl`),true,"Selection preserves audio pause and context");
    assert.equal(await evaluate("document.querySelectorAll('[data-iz-pilot] [data-iz-behavior]').length"),12);
    await click("document.querySelector('[data-iz-behavior=wave] [data-iz-solo]')");
    assert.equal(await evaluate("document.querySelectorAll('[data-iz-behavior-enabled]:checked').length"),1,"Solo enables only its operator");
    await evaluate(`(()=>{const input=document.querySelector('[data-iz-behavior=wave] [data-iz-behavior-strength]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0.25');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor("document.querySelector('[data-iz-behavior=wave] output').textContent==='25%'");
    await click("document.querySelector('[data-iz-preset=all]')");
    assert.equal(await evaluate("[...document.querySelectorAll('[data-iz-behavior] output')].every(o=>o.textContent==='100%')"),true,"Maximum test preset restores every slider to full strength");
    await click("document.querySelector('[data-iz-behavior=wave] [data-iz-solo]')");
    assert.equal(await evaluate("document.querySelector('[data-iz-behavior=wave] output').textContent"),"100%","Solo shows its effect at full test strength");
    assert.equal(await tick(),sceneTick,"Live effect controls preserve audio pause");
    await selectScene("layered");
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"forest-layered");
    assert.equal(await evaluate("document.querySelectorAll('[data-iz-pilot] [data-iz-behavior]').length"),12);
    assert.equal(await tick(),sceneTick,"Layered artwork selection preserves paused simulation");
    assert.equal(await evaluate(`${audio}===izAudio && ${audio}.paused && izCanvas.getContext('webgl2')===izGl`),true,"Layered artwork retains the audio element and renderer");
    if(process.argv.includes("--layered-ui")) {
      await click("document.querySelector('[data-iz-preset=all]')");
      await click("document.querySelector('[data-iz-immersive]')");
      await waitFor("document.querySelector('[data-iz-immersive-pilot]')");
      const report=new URL("../../../.tmp/infinite-zoom-artwork/",import.meta.url);await mkdir(report,{recursive:true});
      const screenshot=await send("Page.captureScreenshot",{format:"png"});await writeFile(new URL("forest-layered-app.png",report),Buffer.from(screenshot.data,"base64"));
      console.log("Layered artwork UI: three scenes, twelve controls, paused audio, immersive and one canvas/context OK");return;
    }
    await selectScene("alien");
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"insectoid-planet");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-iz-behavior]')].map(e=>e.dataset.izBehavior)"),["scale","bend","wave","flow","pulse","opacity","colorShift","glow"]);
    assert.equal(await evaluate(`${audio}.paused && ${canvas}===izCanvas && izCanvas.getContext('webgl2')===izGl`),true,"Alien selection preserves paused audio, canvas and context");
    for(const kind of ["wave","flow","bend","opacity"]){
      await click(`document.querySelector('[data-iz-behavior=${kind}] [data-iz-solo]')`);
      assert.equal(await evaluate(`document.querySelector('[data-iz-behavior=${kind}] [data-iz-behavior-enabled]').checked`),true);
      assert.equal(await evaluate("document.querySelectorAll('[data-iz-behavior-enabled]:checked').length"),1,"New authored effects support Solo");
    }
    await click("document.querySelector('[data-iz-behavior=colorShift] [data-iz-solo]')");
    assert.equal(await evaluate("document.querySelectorAll('[data-iz-behavior-enabled]:checked').length"),1);
    await selectScene("clockwork");
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"clockwork");
    assert.equal(await evaluate("document.querySelectorAll('[data-iz-pilot] [data-iz-behavior]').length"),3,"Mechanical scene shows only applicable controls");
    await evaluate(`(()=>{const input=document.querySelector('[data-iz-behavior=rotate] [data-iz-behavior-strength]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0.5');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor("document.querySelector('[data-iz-behavior=rotate] output').textContent==='50%'");
    assert.equal(await tick(),sceneTick,"Clockwork selection and speed changes preserve paused time");
    assert.equal(await evaluate(`${audio}===izAudio && ${audio}.paused && izCanvas.getContext('webgl2')===izGl`),true);
    await click("document.querySelector('[data-iz-preset=all]')");
    if(process.argv.includes("--clockwork-ui")) {
      await click("document.querySelector('[data-iz-immersive]')");await waitFor("document.querySelector('[data-iz-immersive-pilot]')");
      const report=new URL("../../../.tmp/infinite-zoom-artwork/",import.meta.url);await mkdir(report,{recursive:true});
      const screenshot=await send("Page.captureScreenshot",{format:"png"});await writeFile(new URL("clockwork-app.png",report),Buffer.from(screenshot.data,"base64"));
      console.log("Clockwork UI: selector, three applicable controls, speed slider, paused audio, immersive and same context OK");return;
    }
    await selectScene("pilot");
    await click("document.querySelector('[data-iz-immersive]')");
    await waitFor("document.querySelector('[data-iz-immersive-pilot]')");
    await click("document.querySelector('[data-iz-immersive-pilot] summary')");
    assert.equal(await evaluate("document.querySelector('[data-iz-immersive-pilot]').open"),true,"Pilot has visible immersive controls");
    if(process.argv.includes("--pilot-ui")) {
      await click("document.querySelector('[data-iz-immersive-pilot] [data-iz-preset=subtle]')");
      await delay(250);
      const report=new URL("../../../.tmp/infinite-zoom-artwork/",import.meta.url);await mkdir(report,{recursive:true});
      const screenshot=await send("Page.captureScreenshot",{format:"png"});await writeFile(new URL("forest-pilot-app-controls.png",report),Buffer.from(screenshot.data,"base64"));
      console.log("Pilot UI: selector, twelve controls, solo/strength, pause and immersive panel OK");return;
    }
    await click("document.querySelector('[data-iz-exit]')");
    await selectScene("journey");
    assert.equal(await tick(),sceneTick);assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"forest");
    lateArtworkLoads.length=0; // Pilot's first preparation legitimately reads its shared forest assets.

    await click("document.querySelector('[data-iz-immersive]')");
    await waitFor("document.querySelector('[data-infinite-zoom-layout]').dataset.mode==='immersive'");
    assert.equal(await evaluate(`${canvas}===izCanvas && ${audio}===izAudio && ${audio}.paused`),true);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.site-header')).display"),"none");
    assert.equal(await evaluate("document.activeElement===document.querySelector('[data-iz-exit]')"),true);
    await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
    await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
    await waitFor("document.querySelector('[data-infinite-zoom-layout]').dataset.mode==='background'");
    assert.equal(await tick(),paused,"Mode switch cannot resume a user pause");
    assert.equal(await evaluate("document.activeElement===document.querySelector('[data-iz-immersive]')"),true);

    // Browser playback rejection leaves the journey frozen and is retriable.
    await evaluate("void(window.izOriginalPlay=izAudio.play); void(izAudio.play=()=>Promise.reject(new DOMException('blocked','NotAllowedError')))");
    await click(toggle); await waitFor("document.querySelector('[data-audio-player] [role=alert]')?.textContent.includes('blocked')");
    assert.equal(await tick(),paused);
    await evaluate("void(izAudio.play=izOriginalPlay)"); await click(toggle);
    await waitFor(`${canvas}.dataset.visualStatus==='running'`);
    await click("document.querySelector('[data-iz-transition]')");
    await waitFor("document.querySelector('[data-iz-state]').dataset.transition==='approaching'");
    await click("document.querySelector('[data-iz-immersive]')");
    assert.equal(await evaluate(`${canvas}===izCanvas && !${audio}.paused`),true);
    await click("document.querySelector('[data-iz-exit]')");
    // Observe a middle camera pose before waiting for the slower final handoff;
    // each wait remains within the harness's bounded polling interval.
    await waitFor("JSON.parse(document.querySelector('[data-iz-diagnostic-snapshot]').textContent).camera.pose.logScale>1.5");
    await waitFor("document.querySelector('[data-iz-state]').dataset.transition==='committed'");
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"nebula");
    const musicBeforePilot=await evaluate("izAudio.currentTime");
    await selectScene("clockwork");await delay(200);
    assert.equal(await evaluate("izAudio.paused"),false);assert.ok(await evaluate("izAudio.currentTime")>musicBeforePilot,"Clockwork keeps already playing music progressing");
    await selectScene("layered");await delay(250);
    assert.equal(await evaluate("izAudio.paused"),false);assert.ok(await evaluate("izAudio.currentTime")>musicBeforePilot,"Artwork selection never pauses or seeks playing music");
    await selectScene("journey");
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"nebula","Journey artwork is preserved across the pilot");
    assert.equal(await evaluate("izCanvas.getContext('webgl2')===izGl && document.querySelectorAll('[data-infinite-zoom-canvas]').length===1"),true,"Artwork selection keeps one application canvas/context");
    const afterTransition = await tick();
    await evaluate("izAudio.currentTime=119.9"); await waitFor(`${audio}.ended`);
    await waitFor(`${canvas}.dataset.visualStatus==='stopped'`);
    const ended = await tick(); await delay(200); assert.equal(await tick(),ended); assert.ok(ended>=afterTransition);
    await evaluate("window.next.router.push('/library')"); await waitFor(row(2)); await click(row(2));
    await waitFor(`!${audio}.paused && ${canvas}.dataset.visualStatus==='running'`);
    assert.ok(await tick()>=ended,"New track preserves logical time");
    assert.deepEqual(await evaluate("[izGraphs,izSources]"),[1,1]);
    await evaluate("window.next.router.push('/animations')"); await waitFor("document.querySelector('[data-iz-state]')");
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"nebula","New track does not reset artwork");
    assert.equal(await evaluate("document.querySelector('[data-iz-transition]').disabled"),false,"Nebula has the next authored portal ready");
    await click("document.querySelector('[data-iz-transition]')");
    await waitFor("document.querySelector('[data-iz-state]').dataset.transition==='approaching'");
    await waitFor("JSON.parse(document.querySelector('[data-iz-diagnostic-snapshot]').textContent).camera.pose.logScale>1.5");
    await waitFor("document.querySelector('[data-iz-state]').dataset.artwork==='underwater-cavern'");
    assert.equal(await evaluate("document.querySelector('[data-iz-transition]').disabled"),false,"C has an authored return portal to A");
    assert.equal(await evaluate(`${canvas}===izCanvas && ${audio}===izAudio && !${audio}.paused`),true,"Both transitions preserve canvas and playing audio");
    const nativeScale = await evaluate("JSON.parse(document.querySelector('[data-iz-diagnostic-snapshot]').textContent).camera.pose.logScale");
    assert.ok(Math.abs(nativeScale)<1e-8,"C stops at full frame");
    await click("document.querySelector('[data-iz-loop]')");
    await waitFor("document.querySelector('[data-iz-loop]').getAttribute('aria-pressed')==='true'");
    await waitFor("document.querySelector('[data-iz-state]').dataset.transition==='approaching'");
    await click("document.querySelector('[data-iz-loop]')");
    await waitFor("document.querySelector('[data-iz-loop]').getAttribute('aria-pressed')==='false'");
    const stoppedCamera=await evaluate("JSON.parse(document.querySelector('[data-iz-diagnostic-snapshot]').textContent).camera");
    await delay(350);
    assert.deepEqual(await evaluate("JSON.parse(document.querySelector('[data-iz-diagnostic-snapshot]').textContent).camera"),stoppedCamera,"Stop Loop freezes camera while music plays");
    assert.equal(await evaluate(`${audio}.paused`),false);
    await click("document.querySelector('[data-iz-loop]')");
    await waitFor("JSON.parse(document.querySelector('[data-iz-diagnostic-snapshot]').textContent).camera.pose.logScale>1.5");
    await waitFor("document.querySelector('[data-iz-state]').dataset.artwork==='forest'");
    await waitFor("document.querySelector('[data-iz-state]').dataset.transition==='approaching'");
    await click(toggle); await waitFor(`${canvas}.dataset.visualStatus==='paused'`);
    const loopPaused=await tick();await delay(250);assert.equal(await tick(),loopPaused,"Audio pause freezes Loop");
    assert.equal(await evaluate("document.querySelector('[data-iz-loop]').getAttribute('aria-pressed')"),"true","Loop intent survives audio pause");
    await click("document.querySelector('[data-iz-reset]')");
    assert.equal(await evaluate("document.querySelector('[data-iz-loop]').getAttribute('aria-pressed')"),"false","Reset disables Loop");
    await waitFor(`${canvas}.dataset.simulationTick==='0'`); assert.equal(await evaluate(`${audio}.paused`),true);
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"forest");
    await waitFor("document.querySelector('[data-iz-state]').dataset.transition==='prepared'");
    assert.equal(await evaluate("document.querySelector('[data-iz-transition]').disabled"),false,"Reset restores the embedded portal without another load");
    assert.deepEqual(lateArtworkLoads.filter(url=>!url.includes("/forest-pilot/")), [], "Travel, track changes and explicit reset use the initially prepared chain without network loads");
    await click(toggle); await waitFor(`${canvas}.dataset.visualStatus==='running'`);
    // Throw inside the actual IZ context; failure must not touch music.
    const beforeFailure = await evaluate("izAudio.currentTime");
    await evaluate(`(() => { const gl=izCanvas.getContext('webgl2'), original=gl.drawElements; gl.drawElements=function(...args) { gl.drawElements=original; throw new Error('injected visual failure'); }; })()`);
    await waitFor(`${canvas}.dataset.visualStatus==='error'`);
    await delay(200); assert.equal(await evaluate("izAudio.paused"),false); assert.ok(await evaluate("izAudio.currentTime")>beforeFailure);
    await signOut(); await waitFor("!document.querySelector('[data-application-runtime]') || document.querySelector('[data-application-runtime]').dataset.sessionStatus==='ended'");
    assert.equal(await evaluate("izAudio.paused"),true);
    await waitFor("location.pathname==='/login'");
    console.log("Infinite Zoom app: readiness/cancel, graph reuse, pause/end/next-track, modes/Escape/focus, transition, reset and audio failure isolation OK");

    // A new authenticated runtime: failed critical readiness must block the
    // first Play and recover from a fresh explicit Play, without late autoplay.
    await send("Network.setCacheDisabled",{cacheDisabled:true});
    listeners.set("Fetch.requestPaused",event => send("Fetch.fulfillRequest",{requestId:event.requestId,responseCode:404,body:""}));
    await send("Fetch.enable",{patterns:[{urlPattern:"*/infinite-zoom/samples/underwater-cavern/backdrop.png",requestStage:"Request"}]});
    await send("Network.setCookies",{cookies:[{name:"accessToken",value:session.accessToken,url:origin,path:"/",httpOnly:true},{name:"refreshToken",value:session.refreshToken,url:origin,path:"/",httpOnly:true}]});
    await send("Page.navigate",{url:`${origin}/library`}); await waitFor(row(1));
    await waitFor(`${canvas}?.dataset.visualStatus==='error'`);
    await click(row(1));
    await waitFor("document.querySelector('[data-audio-player] [role=alert]')?.textContent.includes('visualization is not ready')");
    assert.equal(await evaluate(`${audio}.paused`),true); assert.equal(await tick(),0);
    await send("Fetch.disable");
    await click(toggle);
    await waitFor(`!${audio}.paused && ${canvas}.dataset.visualStatus==='running'`);
    assert.deepEqual(await evaluate("[izGraphs,izSources]"),[1,1],"Readiness retry reuses audio graph");
    await signOut(); await waitFor("location.pathname==='/login'");
    console.log("Infinite Zoom first Play: critical load failure blocks music; explicit retry prepares visuals and starts once OK");
  });
} finally { await new Promise(resolve=>api.close(resolve)); }
