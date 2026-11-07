import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const engineRoot=new URL("../src/engines/infinite-zoom/",import.meta.url);
const assetRoot=new URL("../public/infinite-zoom/samples/behavior-atlas/",import.meta.url);
export const previewFile=new URL("../../../.tmp/infinite-zoom-behavior-atlas/index.html",import.meta.url);

/** Offline import map of actual engine modules. The preview has one engine and
 * renderer, uses no API/CDN, and can also be opened as a standalone HTML file. */
export async function buildBehaviorAtlasPreview() {
  const imports={},seen=new Set();
  async function module(url,key) {
    if(seen.has(key))return;seen.add(key);
    let source=await readFile(url,"utf8");
    if(url.pathname.endsWith(".ts"))source=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,verbatimModuleSyntax:true}}).outputText;
    const dependencies=[];
    source=source.replace(/(\bfrom\s*|\bimport\s*)(["'])([^"']+)\2/g,(match,prefix,quote,specifier)=>{
      if(!specifier.startsWith("."))return match;
      const next=new URL(specifier,url);
      const alias=key.startsWith("iz:engine/")?`iz:engine/${fileURLToPath(next).slice(fileURLToPath(engineRoot).length).replaceAll("\\","/")}`:`iz:${next.pathname.split("/").at(-1)}`;
      dependencies.push([next,alias]);return `${prefix}${quote}${alias}${quote}`;
    });
    imports[key]=`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
    for(const [next,alias] of dependencies)await module(next,alias);
  }
  await module(new URL("artwork/prepare-artwork.ts",engineRoot),"iz:engine/artwork/prepare-artwork.ts");
  await module(new URL("core/infinite-zoom-controller.ts",engineRoot),"iz:engine/core/infinite-zoom-controller.ts");
  await module(new URL("artwork/artwork-loader.ts",engineRoot),"iz:engine/artwork/artwork-loader.ts");
  await module(new URL("../node_modules/three/build/three.module.js",import.meta.url),"three");
  const manifest=JSON.parse(await readFile(new URL("manifest.json",assetRoot),"utf8"));
  const panels=JSON.parse(await readFile(new URL("panels.json",assetRoot),"utf8"));
  const assets={};for(const asset of manifest.assets)assets[asset.uri]=await readFile(new URL(asset.uri.split("/").at(-1),assetRoot),"utf8");
  const master=await readFile(new URL("master.svg",assetRoot),"utf8");
  const runtime=await readFile(new URL("./helpers/behavior-atlas-preview.mjs",import.meta.url),"utf8");
  const json=value=>JSON.stringify(value).replaceAll("<","\\u003c");
  const html=`<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Infinite Zoom — test 12 zachowań</title><style>
  *{box-sizing:border-box}body{margin:0;background:#080f1a;color:#e7f0ff;font:15px system-ui,sans-serif}main{max-width:1600px;margin:0 auto;padding:24px}
  h1{margin:0 0 8px;font-size:25px}p{color:#9eb1c9;line-height:1.5;margin:8px 0 16px}.controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:16px 0}
  button,select{font:inherit;border:1px solid #3d5573;border-radius:8px;padding:10px 16px;background:#14243a;color:#ecf5ff;cursor:pointer}button:disabled{opacity:.45;cursor:wait}button.primary{background:#73dcc3;color:#08221d;border:0;font-weight:650}
  button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #a9a1ff;outline-offset:3px}label{display:flex;align-items:center;gap:8px}input{accent-color:#73dcc3}
  .stage{width:100%;aspect-ratio:16/9;border:1px solid #2a405a;border-radius:14px;overflow:hidden;background:#0b1220}canvas{display:block;width:100%;height:100%}
  .foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}output{color:#9edbc9}#error{color:#ff9c9c}a{color:#73dcc3}
  </style><main><h1>Test 12 zachowań animacji</h1><p>Jedna plansza 3840 × 2160. Każdy panel pokazuje osobny efekt. Włącz ruch kamery, aby porównać trzy poziomy głębi w panelu parallax.</p>
  <div class="controls"><button class="primary" id="play" disabled>Start</button><button id="reset" disabled>Reset</button>
  <label>Obserwuj <select id="focus"><option value="all">Wszystkie efekty</option>${panels.map(p=>`<option value="${p.id}">${p.id} — ${p.label}</option>`).join("")}</select></label>
  <label><input id="camera" type="checkbox">Ruch kamery</label><label>Siła efektów <input id="strength" type="range" min="0" max="1" step="0.05" value="1"></label>
  <button id="download">Pobierz planszę PNG 4K</button></div>
  <div class="stage"><canvas id="canvas" aria-label="Plansza testowa dwunastu zachowań Infinite Zoom"></canvas></div>
  <div class="foot"><p>Glow: lokalna emisja światła. Flow: ograniczona deformacja według mapy kierunków.</p><p><output id="status" role="status">Przygotowywanie grafik…</output></p></div><p id="error" role="alert" hidden></p></main>
  <script type="importmap">${json({imports})}</script><script>window.atlasData=${json({manifest,panels,assets,master})};</script><script type="module">${runtime}</script></html>`;
  await mkdir(new URL("./",previewFile),{recursive:true});await writeFile(previewFile,html);
  return html;
}

export async function serveBehaviorAtlasPreview(port=0) {
  const html=await buildBehaviorAtlasPreview();
  const server=createServer((request,response)=>{
    if(request.url!=="/"&&request.url!=="/index.html"){response.writeHead(404).end();return;}
    response.setHeader("Content-Type","text/html; charset=utf-8");response.setHeader("Cache-Control","no-store");response.end(html);
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve);});
  return {server,url:`http://127.0.0.1:${server.address().port}`};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const {url}=await serveBehaviorAtlasPreview(Number(process.argv[2]??4174));
  console.log(`Behavior atlas preview: ${url}`);console.log(`Offline copy: ${fileURLToPath(previewFile)}`);
}
