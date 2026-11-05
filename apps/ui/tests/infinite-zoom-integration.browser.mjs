import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const session = authSession({ accessToken: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+900 })).toString("base64url")}.signature` });
const rate = 8000, samples = rate * 30, wav = Buffer.alloc(44 + samples * 2);
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
    await send("Fetch.enable",{patterns:[{urlPattern:"*/infinite-zoom/samples/foundation/backdrop.svg",requestStage:"Request"}]});
    await send("Page.navigate",{url:`${origin}/library`}); await waitFor(row(1)); await waitFor(canvas);
    for(let i=0;i<100 && !held.length;i++) await delay(25);
    assert.ok(held.length,"Critical visual request intercepted");
    await click(row(1)); await delay(150);
    assert.equal(await evaluate(`${audio}.paused`),true,"Audio waits for critical artwork"); assert.equal(await tick(),0);
    await click(row(1)); // cancel pending Play
    for(const requestId of held) await send("Fetch.continueRequest",{requestId});
    await send("Fetch.disable");
    await waitFor(`${canvas}.dataset.visualStatus==='ready'`);
    await delay(100); assert.equal(await evaluate(`${audio}.paused`),true,"Cancelled Play never starts late");
    assert.equal(await tick(),0);

    await click(row(1)); await waitFor(`!${audio}.paused && ${canvas}.dataset.visualStatus==='running'`);
    await waitFor(`window.izGain>1.01`);
    assert.deepEqual(await evaluate("[izGraphs,izSources]"),[1,1],"Reuse one Web Audio graph/source");
    await evaluate(`void(window.izAudio=${audio}); void(window.izCanvas=${canvas})`);
    await click(toggle); await waitFor(`${canvas}.dataset.visualStatus==='paused'`);
    const paused = await tick(); await delay(250); assert.equal(await tick(),paused);
    await evaluate("window.next.router.push('/animations')"); await waitFor("document.querySelector('[data-infinite-zoom-controls]')");
    assert.equal(await evaluate(`${canvas}===izCanvas && ${audio}===izAudio`),true);
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
    await waitFor("document.querySelector('[data-iz-state]').dataset.transition==='revealing'");
    await click("document.querySelector('[data-iz-immersive]')");
    assert.equal(await evaluate(`${canvas}===izCanvas && !${audio}.paused`),true);
    await click("document.querySelector('[data-iz-exit]')");
    await waitFor("document.querySelector('[data-iz-state]').dataset.transition==='committed'");
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"foundation-destination");
    const afterTransition = await tick();
    await evaluate("izAudio.currentTime=29.9"); await waitFor(`${audio}.ended`);
    await waitFor(`${canvas}.dataset.visualStatus==='stopped'`);
    const ended = await tick(); await delay(200); assert.equal(await tick(),ended); assert.ok(ended>=afterTransition);
    await evaluate("window.next.router.push('/library')"); await waitFor(row(2)); await click(row(2));
    await waitFor(`!${audio}.paused && ${canvas}.dataset.visualStatus==='running'`);
    assert.ok(await tick()>=ended,"New track preserves logical time");
    assert.deepEqual(await evaluate("[izGraphs,izSources]"),[1,1]);
    await evaluate("window.next.router.push('/animations')"); await waitFor("document.querySelector('[data-iz-state]')");
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"foundation-destination","New track does not reset artwork");
    await click(toggle); await waitFor(`${canvas}.dataset.visualStatus==='paused'`);
    await click("document.querySelector('[data-iz-reset]')");
    await waitFor(`${canvas}.dataset.simulationTick==='0'`); assert.equal(await evaluate(`${audio}.paused`),true);
    assert.equal(await evaluate("document.querySelector('[data-iz-state]').dataset.artwork"),"foundation-motion");
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
    await send("Fetch.enable",{patterns:[{urlPattern:"*/infinite-zoom/samples/foundation/backdrop.svg",requestStage:"Request"}]});
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
