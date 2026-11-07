import assert from "node:assert/strict";
import { readFile,writeFile,mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { serveBehaviorAtlasPreview, previewFile } from "../scripts/preview-behavior-atlas.mjs";
import { startChromium } from "./helpers/chromium.mjs";
import { parseArtworkPackage } from "../src/engines/infinite-zoom/artwork/artwork-package.ts";

const root=new URL("../public/infinite-zoom/samples/behavior-atlas/",import.meta.url);
const manifest=parseArtworkPackage(JSON.parse(await readFile(new URL("manifest.json",root),"utf8")));
assert.equal(manifest.schemaVersion,2);assert.equal(manifest.layers.length,13);
assert.equal(new Set(manifest.layers.flatMap(layer=>layer.behaviors.map(b=>b.kind))).size,12);
const {server,url}=await serveBehaviorAtlasPreview();let browser;
try {
  browser=await startChromium();const {send,listeners}=browser,errors=[],requests=[];
  listeners.set("Runtime.exceptionThrown",error=>errors.push(error));
  listeners.set("Network.requestWillBeSent",event=>{if(/^https?:/.test(event.request.url))requests.push(event.request.url);});
  await send("Page.enable");await send("Runtime.enable");await send("Network.enable");
  const evaluate=async expression=>{const result=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value;};
  const waitFor=async expression=>{for(let i=0;i<300;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(50);}assert.fail(`Timed out: ${expression}; ${JSON.stringify(errors)}`);};
  await send("Page.bringToFront");await send("Emulation.setFocusEmulationEnabled",{enabled:true});
  await send("Page.navigate",{url});await waitFor("window.behaviorAtlas?.getSnapshot().status==='ready'");
  assert.deepEqual(errors,[]);
  assert.equal(await evaluate("document.querySelectorAll('canvas').length"),1);
  assert.equal(await evaluate("behaviorAtlas.getDiagnostics().artworks"),1);
  assert.ok(await evaluate("behaviorAtlas.getDiagnostics().estimatedTextureBytes < 80*1024*1024"));
  await evaluate(`window.panelHashes=()=>{
    behaviorAtlas.renderForTest();
    const canvas=behaviorAtlas.getCanvas(),gl=canvas.getContext('webgl2'),bytes=new Uint8Array(canvas.width*canvas.height*4);
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    const result={};
    for(const panel of atlasData.panels){let h=0;const left=Math.floor((panel.x+30)/3),right=Math.floor((panel.x+panel.width-30)/3),top=Math.floor((panel.y+130)/3),bottom=Math.floor((panel.y+panel.height-30)/3);
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const i=((canvas.height-1-y)*canvas.width+x)*4;h=Math.imul(h^bytes[i],16777619);h=Math.imul(h^bytes[i+1],16777619);h=Math.imul(h^bytes[i+2],16777619);}
      result[panel.id]=h>>>0;
    }return result;
  };`);
  const initial=await evaluate("panelHashes()");
  const animated=await evaluate("(()=>{for(let tick=1;tick<=90;tick++)behaviorAtlas.stepForTest(tick);return panelHashes();})()");
  for(const [kind,value] of Object.entries(initial))if(kind!=="parallax")assert.notEqual(animated[kind],value,`${kind} visibly changes its authored panel`);
  // Parallax is camera-relative, with three authored depth bands.
  await evaluate("document.querySelector('#camera').checked=true");
  await evaluate("for(let tick=91;tick<=570;tick++)behaviorAtlas.stepForTest(tick)");
  assert.notDeepEqual(await evaluate("behaviorAtlas.getCamera().pose"),{x:1920,y:1080,rotation:0,logScale:0});
  assert.notEqual((await evaluate("panelHashes()")).parallax,initial.parallax);
  const cameraPose=await evaluate("behaviorAtlas.getCamera().pose");assert.ok(Math.abs(cameraPose.x-1920)>250);
  await evaluate(`document.querySelector('#camera').checked=false;behaviorAtlas.cameraForTest(${JSON.stringify(cameraPose)});document.querySelector('#strength').value='0';behaviorAtlas.stepForTest(571)`);
  const neutralParallax=(await evaluate("panelHashes()")).parallax;
  await evaluate("document.querySelector('#strength').value='1';behaviorAtlas.stepForTest(572)");
  assert.notEqual((await evaluate("panelHashes()")).parallax,neutralParallax,"Depth changes parallax pixels with exactly the same camera pose");
  assert.deepEqual(await evaluate("behaviorAtlas.getCamera().pose"),cameraPose);
  await evaluate("behaviorAtlas.resetForTest()");
  assert.deepEqual(await evaluate("panelHashes()"),initial,"Reset restores exact initial pixels");
  await evaluate("document.querySelector('#play').click()");await waitFor("behaviorAtlas.getSnapshot().session.tick>10");
  await evaluate("document.querySelector('#play').click()");await waitFor("behaviorAtlas.getSnapshot().status==='paused'");
  const paused=await evaluate("behaviorAtlas.getSnapshot().session.tick");await delay(200);assert.equal(await evaluate("behaviorAtlas.getSnapshot().session.tick"),paused);
  await evaluate("document.querySelector('#focus').value='wave';document.querySelector('#focus').dispatchEvent(new Event('change'))");
  const visible=await evaluate("behaviorAtlas.getArtwork().layers.filter(l=>l.opacity===1).map(l=>l.id)");assert.deepEqual(visible,["background","wave"]);
  const master=await evaluate("behaviorAtlas.exportMaster()");const png=Buffer.from(master.split(",")[1],"base64");
  assert.equal(png.readUInt32BE(16),3840);assert.equal(png.readUInt32BE(20),2160);await writeFile(new URL("master.png",root),png);
  const screenshot=await send("Page.captureScreenshot",{format:"png"});const reportRoot=new URL("../../../.tmp/infinite-zoom-behavior-atlas/",import.meta.url);await mkdir(reportRoot,{recursive:true});
  await writeFile(new URL("preview.png",reportRoot),Buffer.from(screenshot.data,"base64"));
  assert.deepEqual(errors,[]);assert.ok(requests.every(request=>new URL(request).origin===url),"Preview makes no external network requests");
  await send("Page.navigate",{url:previewFile.href});
  await waitFor("window.behaviorAtlas?.getSnapshot().status==='ready'");
  assert.deepEqual(errors,[],"Self-contained file preview loads without browser errors");
  console.log(JSON.stringify({offlinePreview:true,panels:12,animatedPanels:11,cameraRelativeParallax:true,pause:true,reset:true,isolation:true,nativePng:[3840,2160],noExternalRequests:true}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
