import assert from "node:assert/strict";
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
      response.end(`<script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script><script type="module" src="/fixture.mjs"></script><script type="module" src="/transition-fixture.mjs"></script><script type="module" src="/samples-fixture.mjs"></script><script type="module" src="/embedded-fixture.mjs"></script><script type="module" src="/chain-fixture.mjs"></script>`);
      return;
    }
    let source;
    if (/^\/engine\/(?:[a-z-]+\/)*[a-z-]+\.ts$/.test(pathname)) {
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
    } else if (pathname === "/chain-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-chain-browser-fixture.mjs", import.meta.url));
    } else if (pathname === "/embedded-fixture.mjs") {
      source = await readFile(new URL("./helpers/infinite-zoom-embedded-browser-fixture.mjs", import.meta.url));
    } else if (/^\/infinite-zoom\/samples\/(forest|nebula|underwater-cavern)\/(manifest\.json|backdrop\.png|foreground\.png|influence\.svg)$/.test(pathname)) {
      response.setHeader("Content-Type", pathname.endsWith(".json") ? "application/json" : pathname.endsWith(".png") ? "image/png" : "image/svg+xml");
      response.end(await readFile(new URL(pathname.slice(1), publicRoot)));
      return;
    } else if (/^\/infinite-zoom\/samples\/foundation\/(manifest\.json|motion-manifest\.json|destination\.json|destination-backdrop\.svg|destination-foreground\.svg|backdrop\.svg|foreground\.svg|influence\.svg)$/.test(pathname)) {
      response.setHeader("Content-Type", pathname.endsWith(".json") ? "application/json" : "image/svg+xml");
      response.end(await readFile(new URL(pathname.slice(1), publicRoot)));
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
  browser = await startChromium();
  const { send, listeners } = browser;
  const errors = [];
  listeners.set("Runtime.exceptionThrown", event => errors.push(event));
  listeners.set("Runtime.consoleAPICalled", event => { if (event.type === "error") errors.push(event); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}` });
  let loaded = false;
  for (let i = 0; i < 100; i++) {
    loaded = (await send("Runtime.evaluate", { expression: "typeof window.runFoundationRenderer === 'function' && typeof window.runTransitionRenderer === 'function' && typeof window.runSampleArtwork === 'function' && typeof window.runDemoChain === 'function'", returnByValue: true })).result.value;
    if (loaded) break;
    await delay(50);
  }
  assert.ok(loaded, JSON.stringify(errors));
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
  const reportDirectory = new URL("../../../.tmp/infinite-zoom-artwork/", import.meta.url);
  await mkdir(reportDirectory, { recursive: true });
  for (const name of ["forest", "nebula", "underwater-cavern"]) {
    const sample = await send("Runtime.evaluate", { expression: `window.runSampleArtwork(${JSON.stringify(name)})`, awaitPromise: true, returnByValue: true });
    assert.equal(sample.exceptionDetails, undefined, JSON.stringify(sample.exceptionDetails));
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
  await writeFile(new URL("verification.json", reportDirectory), JSON.stringify({ samples, loop: loop.result.value, chain: chain.result.value, embedded: embedded.result.value, browser: await send("Browser.getVersion") }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
