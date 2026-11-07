import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {withSceneReveal,createSceneReveal} from "../src/components/infinite-zoom/scene-reveal.ts";
import {parseArtworkPackage} from "../src/engines/infinite-zoom/artwork/artwork-package.ts";
import {createArtworkInstance} from "../src/engines/infinite-zoom/artwork/artwork-instance.ts";
import {artworkTextureBytes} from "../src/engines/infinite-zoom/resources/texture-budget.ts";
const raw=JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/insectoid-planet/manifest.json",import.meta.url),"utf8"));
test("optional reveal preserves the authored package, lighting and opaque coverage",()=>{
  const original=JSON.stringify(raw),manifest=parseArtworkPackage(withSceneReveal(raw));
  assert.equal(JSON.stringify(raw),original);
  assert.equal(manifest.coverage.baseLayerId,"fixed-world");
  assert.ok(artworkTextureBytes(manifest)<64*1024*1024);
  const curtain=manifest.layers.find(l=>l.id==="reveal-curtain");
  assert.ok(manifest.layers.filter(l=>l.id.startsWith("chitin-light-")).every(l=>l.zIndex>curtain.zIndex));
  const instance=createArtworkInstance("reveal",manifest),reveal=createSceneReveal();
  reveal.apply(instance);
  const before=instance.getSnapshot();reveal.setEnabled(true,instance);
  const transform=id=>instance.getSnapshot().layers.find(l=>l.id===id);
  assert.equal(transform("fixed-world").opacity,1);
  assert.equal(transform("reveal-curtain").opacity,.995);
  for(let i=0;i<3599;i++)reveal.step(instance);
  assert.ok(transform("reveal-curtain").opacity>0);
  reveal.step(instance);assert.equal(transform("reveal-curtain").opacity,0);
  assert.deepEqual(instance.getSnapshot(),before,"At exactly 60 seconds the normal layer state is restored");
  reveal.restart(instance);assert.equal(transform("reveal-curtain").opacity,.995);
  reveal.setEnabled(false,instance);assert.deepEqual(instance.getSnapshot(),before);
});
test("pause, presentation calls and parked scenes cannot advance the reveal",async()=>{
  const instance=createArtworkInstance("reveal",parseArtworkPackage(withSceneReveal(raw))),reveal=createSceneReveal();
  reveal.setEnabled(true,instance);for(let i=0;i<1800;i++)reveal.step(instance);
  const state=reveal.getSnapshot();for(let i=0;i<60;i++)reveal.apply(instance);
  assert.deepEqual(reveal.getSnapshot(),state);
  const forest=createArtworkInstance("parked",parseArtworkPackage(JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/forest/manifest.json",import.meta.url),"utf8"))));
  for(let i=0;i<60;i++)reveal.step(forest);
  assert.deepEqual(reveal.getSnapshot(),state);
  instance.reset();reveal.restart(instance);
  assert.equal(reveal.getSnapshot().progress,0);
  assert.equal(instance.getSnapshot().layers.find(l=>l.id==="reveal-curtain").opacity,.995);
});
test("lava visible in darkness retains the original color, pulse and glow phases",()=>{
  const manifest=parseArtworkPackage(withSceneReveal(raw)),instance=createArtworkInstance("lava",manifest);
  const reveal=createSceneReveal();reveal.setEnabled(true,instance);
  const lava=manifest.layers.find(l=>l.id==="lava-seams"),protectedLava=manifest.layers.find(l=>l.id==="reveal-lava");
  assert.deepEqual(protectedLava.behaviors,lava.behaviors);
  instance.setBehaviorStrength("colorShift",1);
  for(let tick=0;tick<3600;tick++){
    if(tick)instance.stepBehaviors({dt:1/60});
    if(tick%30===0){const layers=instance.getSnapshot().layers;assert.deepEqual(layers.find(l=>l.id==="reveal-lava").groups,layers.find(l=>l.id==="lava-seams").groups);}
  }
});
