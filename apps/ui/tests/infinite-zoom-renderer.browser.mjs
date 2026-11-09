import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import ts from "typescript";
import { startChromium } from "./helpers/chromium.mjs";

// A standalone module harness exercises actual TS + installed Three in WebGL2.
// It adds no product route, build output, alternate renderer or app audio graph.
const engineRoot = new URL("../src/engines/infinite-zoom/", import.meta.url);
const publicRoot = new URL("../public/", import.meta.url);
const threeRoot = new URL("../node_modules/three/build/", import.meta.url);
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end(`<script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script><script type="module" src="/fixture.mjs"></script><script type="module" src="/transition-fixture.mjs"></script><script type="module" src="/samples-fixture.mjs"></script><script type="module" src="/embedded-fixture.mjs"></script><script type="module" src="/chain-fixture.mjs"></script><script type="module" src="/phase2-fixture.mjs"></script><script type="module" src="/pilot-fixture.mjs"></script>`);
      return;
    }
    let source;
    if(pathname==="/infinite-zoom/samples/foundation/precision-test.svg"){
      response.setHeader("Content-Type","image/svg+xml");response.end('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><path fill="#303030" d="M0 0h16v9H0z"/></svg>');return;
    }
    if (/^\/adapter\/(rim-lighting|scene-reveal)\.ts$/.test(pathname)) {
      source=ts.transpileModule(await readFile(new URL(`../src/components/infinite-zoom/${pathname.split("/").at(-1)}`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,verbatimModuleSyntax:true}}).outputText;
    } else if (/^\/engine\/(?:[a-z-]+\/)*[a-z-]+\.ts$/.test(pathname)) {
      const filename = new URL(pathname.slice("/engine/".length), engineRoot);
      source = ts.transpileModule(await readFile(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true },
      }).outputText;
    } else if (/^\/three\/three\.(module|core)\.js$/.test(pathname)) {
      source = await readFile(new URL(pathname.slice("/three/".length), threeRoot));
    } else if (pathname === "/fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/transition-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-transition-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/samples-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-samples-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/pilot-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-pilot-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/layered-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-layered-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/clockwork-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-clockwork-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/insectoid-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-insectoid-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/sky-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-sky-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/lava-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-lava-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/rims-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-rims-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/reveal-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-reveal-browser-fixture.mjs", import.meta.url));
    } else if (/^\/infinite-zoom\/samples\/(forest-pilot|forest-layered|clockwork|insectoid-planet)\/[a-zA-Z0-9-]+\.(json|svg|png)$/.test(pathname)) {
      response.setHeader("Content-Type",pathname.endsWith(".json")?"application/json":pathname.endsWith(".png")?"image/png":"image/svg+xml");
      response.end(await readFile(new URL(pathname.slice(1),publicRoot)));return;
    } else if (pathname === "/phase2-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-phase2-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/phase2-data.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-phase2-data.mjs", import.meta.url));
    } else if (pathname === "/chain-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-chain-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/embedded-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-embedded-browser-fixture.mjs", import.meta.url));
    } else if (/^\/infinite-zoom\/samples\/(forest|nebula|underwater-cavern)\/(manifest\.json|backdrop\.png|foreground\.png|influence\.svg)$/.test(pathname)) {
      response.setHeader("Content-Type", pathname.endsWith(".json") ? "application/json" : pathname.endsWith(".png") ? "image/png" : "image/svg+xml");
      const bytes=await readFile(new URL(pathname.slice(1),publicRoot));response.setHeader("Content-Length",bytes.length);response.end(bytes);
      return;
    } else if (/^\/infinite-zoom\/samples\/foundation\/(manifest\.json|motion-manifest\.json|destination\.json|destination-backdrop\.svg|destination-foreground\.svg|backdrop\.svg|foreground\.svg|influence\.svg)$/.test(pathname)) {
      response.setHeader("Content-Type", pathname.endsWith(".json") ? "application/json" : "image/svg+xml");
      const bytes=await readFile(new URL(pathname.slice(1),publicRoot));response.setHeader("Content-Length",bytes.length);response.end(bytes);
      return;
    } else { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", "text/javascript");
    response.end(source);
  } catch (error) { response.writeHead(500).end(String(error)); }
});

let browser;
try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  browser = await startChromium({profileRoot:fileURLToPath(new URL("../../../.tmp/browser-profiles/",import.meta.url))});
  const { send, listeners } = browser;
  const errors = [], networkFailures = [], requests = new Map();
  await send("Network.enable");
  listeners.set("Network.requestWillBeSent",event=>requests.set(event.requestId,event.request.url));
  listeners.set("Network.loadingFailed",event=>networkFailures.push({url:requests.get(event.requestId),networkError:event.errorText}));
  listeners.set("Runtime.exceptionThrown", event => errors.push(event));
  listeners.set("Runtime.consoleAPICalled", event => { if (event.type === "error") errors.push(event); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}` });
  let loaded = false;
  for (let i = 0; i < 100; i++) {
    loaded = (await send("Runtime.evaluate", { expression: "typeof window.runFoundationRenderer === 'function' && typeof window.runTransitionRenderer === 'function' && typeof window.runSampleArtwork === 'function' && typeof window.runDemoChain === 'function' && typeof window.runForestPilot === 'function'", returnByValue: true })).result.value;
    if (loaded) break;
    await delay(50);
  }
  assert.ok(loaded, JSON.stringify(errors));
  const reportDirectory = new URL("../../../.tmp/infinite-zoom-artwork/", import.meta.url);
  await mkdir(reportDirectory, {recursive:true});
  async function runLayered(){
    await send("Runtime.evaluate",{expression:"import('/layered-fixture.mjs')",awaitPromise:true});
    const result=await send("Runtime.evaluate",{expression:"window.runLayeredArtwork()",awaitPromise:true,returnByValue:true});
    assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));assert.deepEqual(errors,[]);
    console.log("Infinite Zoom layered artwork:",JSON.stringify(result.result.value));
    const names=await send("Runtime.evaluate",{expression:"Object.keys(window.layeredCaptures)",returnByValue:true});
    for(const name of names.result.value){const frame=await send("Runtime.evaluate",{expression:`window.layeredCaptures[${JSON.stringify(name)}]`,returnByValue:true});await writeFile(new URL(`forest-layered-${name}.png`,reportDirectory),Buffer.from(frame.result.value.split(",")[1],"base64"));}
  }
  async function runClockwork(){
    await send("Runtime.evaluate",{expression:"import('/clockwork-fixture.mjs')",awaitPromise:true});
    const result=await send("Runtime.evaluate",{expression:"window.runClockworkArtwork()",awaitPromise:true,returnByValue:true});
    assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));assert.deepEqual(errors,[]);
    console.log("Infinite Zoom clockwork:",JSON.stringify(result.result.value));
    const names=await send("Runtime.evaluate",{expression:"Object.keys(window.clockworkCaptures)",returnByValue:true});
    for(const name of names.result.value){const frame=await send("Runtime.evaluate",{expression:`window.clockworkCaptures[${JSON.stringify(name)}]`,returnByValue:true});await writeFile(new URL(`clockwork-${name}.png`,reportDirectory),Buffer.from(frame.result.value.split(",")[1],"base64"));}
  }
  async function runInsectoid(){
    await send("Runtime.evaluate",{expression:"import('/insectoid-fixture.mjs')",awaitPromise:true});
    let result;
    {
      await send("Runtime.evaluate",{expression:`void window.runInsectoidArtwork(${process.argv.includes("--insectoid-motion")}).then(value=>window.insectoidRunResult=value).catch(error=>window.insectoidRunError=String(error.stack)).finally(()=>window.insectoidRunDone=true)`});
      let done=false;
      for(let i=0;i<360;i++){
        done=(await send("Runtime.evaluate",{expression:"!!window.insectoidRunDone",returnByValue:true})).result.value;
        if(done)break;await delay(250);
      }
      assert.ok(done,"Insectoid artwork verification completes");
      const error=await send("Runtime.evaluate",{expression:"window.insectoidRunError",returnByValue:true});
      assert.equal(error.result.value,undefined,error.result.value);
      result=await send("Runtime.evaluate",{expression:"window.insectoidRunResult",returnByValue:true});
    }
    assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));assert.deepEqual(errors,[]);
    console.log("Infinite Zoom insectoid planet:",JSON.stringify(result.result.value));
    await writeFile(new URL("insectoid-qa.json",reportDirectory),JSON.stringify(result.result.value,null,2));
    const names=await send("Runtime.evaluate",{expression:"Object.keys(window.insectoidCaptures)",returnByValue:true});
    for(const name of names.result.value){const frame=await send("Runtime.evaluate",{expression:`window.insectoidCaptures[${JSON.stringify(name)}]`,returnByValue:true});await writeFile(new URL(`insectoid-${name}.png`,reportDirectory),Buffer.from(frame.result.value.split(",")[1],"base64"));}
    if(process.argv.includes("--insectoid-motion")){
      for(const[property,filename]of [["insectoidMotionData","insectoid-motion.webm"],["insectoidSmokeMotionData","insectoid-smoke-motion.webm"]]){
      const length=(await send("Runtime.evaluate",{expression:`window.${property}.length`,returnByValue:true})).result.value;
      const parts=[];
      for(let i=0;i<length;i+=262144)parts.push((await send("Runtime.evaluate",{expression:`window.${property}.slice(${i},${i+262144})`,returnByValue:true})).result.value);
      await writeFile(new URL(filename,reportDirectory),Buffer.from(parts.join("").split(",")[1],"base64"));
      }
    }
  }
  async function runRims(){
    await send("Runtime.evaluate",{expression:"import('/rims-fixture.mjs')",awaitPromise:true});
    await send("Runtime.evaluate",{expression:`void window.runChitinRims(${process.argv.includes("--rims-motion")}).then(value=>window.rimResult=value).catch(error=>window.rimError=String(error.stack)).finally(()=>window.rimDone=true)`});
    let done=false;for(let i=0;i<360;i++){done=(await send("Runtime.evaluate",{expression:"!!window.rimDone",returnByValue:true})).result.value;if(done)break;await delay(250);}
    assert.ok(done,"Rim review completes");const error=(await send("Runtime.evaluate",{expression:"window.rimError",returnByValue:true})).result.value;assert.equal(error,undefined,error);
    const result=(await send("Runtime.evaluate",{expression:"window.rimResult",returnByValue:true})).result.value;assert.deepEqual(errors,[]);
    console.log("Infinite Zoom chitin rim lighting:",JSON.stringify(result));await writeFile(new URL("chitin-rims-qa.json",reportDirectory),JSON.stringify(result,null,2));
    const names=(await send("Runtime.evaluate",{expression:"Object.keys(window.rimCaptures)",returnByValue:true})).result.value;
    for(const name of names){
      const expression=`window.rimCaptures[${JSON.stringify(name)}]`,length=(await send("Runtime.evaluate",{expression:`${expression}.length`,returnByValue:true})).result.value,parts=[];
      for(let i=0;i<length;i+=262144)parts.push((await send("Runtime.evaluate",{expression:`${expression}.slice(${i},${i+262144})`,returnByValue:true})).result.value);
      await writeFile(new URL(`chitin-rims-${name}.png`,reportDirectory),Buffer.from(parts.join("").split(",")[1],"base64"));
    }
    if(process.argv.includes("--rims-motion")){
      const length=(await send("Runtime.evaluate",{expression:"window.rimMotionData.length",returnByValue:true})).result.value,parts=[];
      for(let i=0;i<length;i+=262144)parts.push((await send("Runtime.evaluate",{expression:`window.rimMotionData.slice(${i},${i+262144})`,returnByValue:true})).result.value);
      await writeFile(new URL("chitin-rims-motion.webm",reportDirectory),Buffer.from(parts.join("").split(",")[1],"base64"));
    }
  }
  async function runReveal(){
    await send("Runtime.evaluate",{expression:"import('/reveal-fixture.mjs')",awaitPromise:true});
    await send("Runtime.evaluate",{expression:"void window.runSceneReveal().then(value=>window.revealResult=value).catch(error=>window.revealError=String(error.stack)).finally(()=>window.revealDone=true)"});
    let done=false;for(let i=0;i<480;i++){done=(await send("Runtime.evaluate",{expression:"!!window.revealDone",returnByValue:true})).result.value;if(done)break;await delay(250);}
    assert.ok(done,"Reveal review completes");
    assert.equal((await send("Runtime.evaluate",{expression:"window.revealError",returnByValue:true})).result.value,undefined);
    assert.deepEqual(errors,[]);
    const result=(await send("Runtime.evaluate",{expression:"window.revealResult",returnByValue:true})).result.value;
    console.log("Infinite Zoom scene reveal:",JSON.stringify(result));
    await writeFile(new URL("scene-reveal-qa.json",reportDirectory),JSON.stringify(result,null,2));
    const names=(await send("Runtime.evaluate",{expression:"Object.keys(window.revealCaptures)",returnByValue:true})).result.value;
    for(const [expression,filename] of [...names.map(name=>[`window.revealCaptures[${JSON.stringify(name)}]`,`scene-reveal-${name}.png`]),["window.revealMotionData","scene-reveal-motion.webm"]]){
      const length=(await send("Runtime.evaluate",{expression:`${expression}.length`,returnByValue:true})).result.value,parts=[];
      for(let i=0;i<length;i+=262144)parts.push((await send("Runtime.evaluate",{expression:`${expression}.slice(${i},${i+262144})`,returnByValue:true})).result.value);
      await writeFile(new URL(filename,reportDirectory),Buffer.from(parts.join("").split(",")[1],"base64"));
    }
  }
  if (process.argv.includes("--sky-only") || process.argv.includes("--lava-only")) {
    const review=process.argv.includes("--lava-only")?"lava":"sky";
    await send("Runtime.evaluate",{expression:`import('/${review}-fixture.mjs')`,awaitPromise:true});
    await send("Runtime.evaluate",{expression:`void window.${review==="lava"?"runLavaLighting":"runSkyLighting"}(${process.argv.includes("--sky-high-precision")}).then(value=>window.skyResult=value).catch(error=>window.skyError=String(error.stack)).finally(()=>window.skyDone=true)`});
    let done=false;for(let i=0;i<240;i++){done=(await send("Runtime.evaluate",{expression:"!!window.skyDone",returnByValue:true})).result.value;if(done)break;await delay(250);}
    assert.ok(done,`${review} motion review completes`);assert.equal((await send("Runtime.evaluate",{expression:"window.skyError",returnByValue:true})).result.value,undefined);
    assert.deepEqual(errors,[]);const result=(await send("Runtime.evaluate",{expression:"window.skyResult",returnByValue:true})).result.value;console.log(`${review} lighting:`,JSON.stringify(result));
    await writeFile(new URL(`${review}-qa.json`,reportDirectory),JSON.stringify(result,null,2));
    const names=(await send("Runtime.evaluate",{expression:"Object.keys(window.skyCaptures)",returnByValue:true})).result.value;
    for(const [expression,file]of [...names.map(name=>[`window.skyCaptures[${JSON.stringify(name)}]`,`${review}-${name}.png`]),["window.skyMotionData",`${review}-motion.webm`]]){
      const length=(await send("Runtime.evaluate",{expression:`${expression}.length`,returnByValue:true})).result.value,parts=[];
      for(let i=0;i<length;i+=262144)parts.push((await send("Runtime.evaluate",{expression:`${expression}.slice(${i},${i+262144})`,returnByValue:true})).result.value);
      await writeFile(new URL(file,reportDirectory),Buffer.from(parts.join("").split(",")[1],"base64"));
    }
  } else if (process.argv.includes("--reveal-only")) {
    await runReveal();
  } else if (process.argv.includes("--rims-only")) {
    await runRims();
  } else if (process.argv.includes("--insectoid-only")) {
    await runInsectoid();
  } else if (process.argv.includes("--clockwork-only")) {
    await runClockwork();
  } else if (process.argv.includes("--layered-only")) {
    await runLayered();
  } else if (process.argv.includes("--pilot-only")) {
    const pilot=await send("Runtime.evaluate",{expression:"window.runForestPilot()",awaitPromise:true,returnByValue:true});
    assert.equal(pilot.exceptionDetails,undefined,JSON.stringify(pilot.exceptionDetails));
    assert.deepEqual(errors,[]);console.log("Infinite Zoom forest pilot:",JSON.stringify(pilot.result.value));
    const captures=await send("Runtime.evaluate",{expression:"Object.keys(window.forestPilotCaptures)",returnByValue:true});
    for(const name of captures.result.value){const frame=await send("Runtime.evaluate",{expression:`window.forestPilotCaptures[${JSON.stringify(name)}]`,returnByValue:true});await writeFile(new URL(`forest-pilot-${name}.png`,reportDirectory),Buffer.from(frame.result.value.split(",")[1],"base64"));}
  } else {
  const result = await send("Runtime.evaluate", { expression: "window.runFoundationRenderer()", awaitPromise: true, returnByValue: true });
  assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
  assert.deepEqual(errors, [], "No browser errors or shader failures");
  assert.equal(result.result.value.contextRecovery, true);
  console.log("Infinite Zoom WebGL2:", JSON.stringify(result.result.value));
  const transition = await send("Runtime.evaluate", { expression: "window.runTransitionRenderer()", awaitPromise: true, returnByValue: true });
  assert.equal(transition.exceptionDetails, undefined, JSON.stringify(transition.exceptionDetails));
  assert.deepEqual(errors, [], "No transition browser/shader errors");
  assert.equal(transition.result.value.transitions, true);
  console.log("Infinite Zoom zoomThrough:", JSON.stringify(transition.result.value));
  const samples = [];

  for (const name of ["forest", "nebula", "underwater-cavern"]) {
    const sample = await send("Runtime.evaluate", { expression: `window.runSampleArtwork(${JSON.stringify(name)})`, awaitPromise: true, returnByValue: true });
    assert.equal(sample.exceptionDetails, undefined, JSON.stringify({exception:sample.exceptionDetails,errors,networkFailures}));
    assert.deepEqual(errors, [], "No sample artwork browser/shader errors");
    console.log("Infinite Zoom sample:", JSON.stringify(sample.result.value));
    samples.push(sample.result.value);
    const captures = await send("Runtime.evaluate", { expression: `window.sampleArtworkCaptures[${JSON.stringify(name)}]`, returnByValue: true });
    for (const [stage, data] of Object.entries(captures.result.value)) {
      await writeFile(new URL(`${name}-${stage}.png`, reportDirectory), Buffer.from(data.split(",")[1], "base64"));
    }
  }
  const embedded = await send("Runtime.evaluate", { expression: "window.runEmbeddedPortal()", awaitPromise: true, returnByValue: true });
  assert.equal(embedded.exceptionDetails, undefined, JSON.stringify(embedded.exceptionDetails));
  assert.deepEqual(errors, [], "No embedded portal shader/browser errors");
  console.log("Infinite Zoom authored portal:", JSON.stringify(embedded.result.value));
  const frameNames = await send("Runtime.evaluate", { expression: "Object.keys(window.embeddedPortalCaptures)", returnByValue: true });
  for (const stage of frameNames.result.value) {
    const frame = await send("Runtime.evaluate", { expression: `window.embeddedPortalCaptures[${JSON.stringify(stage)}]`, returnByValue: true });
    await writeFile(new URL(`portal-${stage}.png`, reportDirectory), Buffer.from(frame.result.value.split(",")[1], "base64"));
  }
  const chain = await send("Runtime.evaluate", { expression: "window.runDemoChain()", awaitPromise: true, returnByValue: true });
  assert.equal(chain.exceptionDetails, undefined, JSON.stringify(chain.exceptionDetails));
  assert.deepEqual(errors, [], "No three-world chain shader/browser errors");
  console.log("Infinite Zoom three-world demo:", JSON.stringify(chain.result.value));
  const chainFrames = await send("Runtime.evaluate", { expression: "window.demoChainCaptures", returnByValue: true });
  for (const [name, data] of Object.entries(chainFrames.result.value)) {
    await writeFile(new URL(`chain-${name}.png`, reportDirectory), Buffer.from(data.split(",")[1], "base64"));
  }
  const loop = await send("Runtime.evaluate", { expression: "window.runDemoLoop()", awaitPromise: true, returnByValue: true });
  assert.equal(loop.exceptionDetails, undefined, JSON.stringify(loop.exceptionDetails));
  assert.deepEqual(errors, [], "No loop shader/browser errors");
  assert.equal(loop.result.value.sequence.length, 9);
  console.log("Infinite Zoom loop:", JSON.stringify(loop.result.value));
  const loopFrames = await send("Runtime.evaluate", { expression: "window.demoLoopCaptures", returnByValue: true });
  for (const [name, data] of Object.entries(loopFrames.result.value)) {
    await writeFile(new URL(`loop-${name}.png`, reportDirectory), Buffer.from(data.split(",")[1], "base64"));
  }
  const phase2 = await send("Runtime.evaluate", { expression: "window.runPhase2Renderer()", awaitPromise: true, returnByValue: true });
  assert.equal(phase2.exceptionDetails, undefined, JSON.stringify(phase2.exceptionDetails));
  assert.deepEqual(errors, [], "No Phase 2 shader/browser errors");
  assert.equal(phase2.result.value.operators.length,12);
  console.log("Infinite Zoom Phase 2:",JSON.stringify(phase2.result.value));
  const pilot = await send("Runtime.evaluate", { expression:"window.runForestPilot()",awaitPromise:true,returnByValue:true });
  assert.equal(pilot.exceptionDetails,undefined,JSON.stringify(pilot.exceptionDetails));
  assert.deepEqual(errors,[],"No pilot shader/browser errors");
  console.log("Infinite Zoom forest pilot:",JSON.stringify(pilot.result.value));
  const pilotFrames=await send("Runtime.evaluate",{expression:"Object.keys(window.forestPilotCaptures)",returnByValue:true});
  for(const name of pilotFrames.result.value){const frame=await send("Runtime.evaluate",{expression:`window.forestPilotCaptures[${JSON.stringify(name)}]`,returnByValue:true});await writeFile(new URL(`forest-pilot-${name}.png`,reportDirectory),Buffer.from(frame.result.value.split(",")[1],"base64"));}
  await writeFile(new URL("verification.json", reportDirectory), JSON.stringify({ pilot:pilot.result.value, phase2:phase2.result.value, samples, loop: loop.result.value, chain: chain.result.value, embedded: embedded.result.value, browser: await send("Browser.getVersion") }, null, 2));
  await runLayered();
  await runClockwork();
  await runInsectoid();
  await runRims();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
