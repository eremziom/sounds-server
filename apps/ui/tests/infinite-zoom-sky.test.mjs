import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {extractSkyLighting,safeSky} from "../scripts/lib/insectoid-sky-lighting.mjs";
import {parseArtworkPackage,createArtworkInstance} from "../src/engines/infinite-zoom/artwork/index.ts";
import {withSceneReveal,createSceneReveal} from "../src/components/infinite-zoom/scene-reveal.ts";
const root=new URL("../public/infinite-zoom/samples/insectoid-planet/",import.meta.url);
const raw=JSON.parse(await readFile(new URL("manifest.json",root),"utf8"));

test("sky detail is source-derived, distributed across the sky and protected by a separate stencil",async()=>{
  const maps=await extractSkyLighting(new URL("source.png",root)),sectors=Array(8).fill(0);
  let selected=0,weightedLuma=0;
  for(let y=0;y<maps.height;y++)for(let x=0;x<maps.width;x++){
    const i=y*maps.width+x;
    if(maps.visibility[i])assert.ok(safeSky((x+.5)*1672/maps.width,(y+.5)*941/maps.height));
    if(maps.visibility[i]*maps.material[i]>255*255*.03){selected++;sectors[Math.floor(x*8/maps.width)]++;weightedLuma+=(.2126*maps.rgb[i*3]+.7152*maps.rgb[i*3+1]+.0722*maps.rgb[i*3+2])/255;}
  }
  assert.ok(sectors.every(value=>value>5000));assert.ok(selected>150000&&selected<250000);
  assert.ok(weightedLuma/selected>.15);assert.ok(new Set(maps.material).size>200);
  for(const [sx,sy]of [[386,80],[312,170],[489,220],[310,280],[790,260],[1250,225],[1220,100],[1487,220],[1200,600],[100,600]]){
    const i=Math.floor(sy*maps.height/941)*maps.width+Math.floor(sx*maps.width/1672);assert.equal(maps.visibility[i],0,`Protected landmark ${sx},${sy}`);
  }
  // Source-inspected clear sky: the previous broad rectangles/convex arch
  // approximations withheld these pixels even though no static material is here.
  for(const [sx,sy]of [[400,80],[485,170],[150,100],[200,120],[420,200],[110,155]]){
    const i=Math.floor(sy*maps.height/941)*maps.width+Math.floor(sx*maps.width/1672);
    assert.ok(maps.visibility[i]>240,`Clear sky restored at ${sx},${sy}`);
  }
  const {sharp}=await import("../scripts/lib/insectoid-chitin-rims.mjs");
  const packaged=await sharp(fileURLToPath(new URL("visible-sky.png",root))).extractChannel(0).raw().toBuffer();
  assert.ok(packaged.equals(Buffer.from(maps.visibility)),"Packaged sky visibility matches the reproducible contours");
});

test("emission-only layers validate conservatively and cannot replace opaque coverage",()=>{
  const manifest=parseArtworkPackage(raw),sky=manifest.layers.find(l=>l.id==="sky-high-attack");
  assert.equal(sky.blendMode,"additive-emission");assert.equal(sky.behaviors[0].modulation[0].signal,"highAttack");
  const clone=()=>JSON.parse(JSON.stringify(raw));
  const base=clone();base.layers[0].blendMode="additive-emission";assert.throws(()=>parseArtworkPackage(base),/Coverage/);
  const invalid=clone();invalid.layers.at(-1).blendMode="screen";assert.throws(()=>parseArtworkPackage(invalid),/blend/);
  const spatial=clone();spatial.layers.at(-1).behaviors=[raw.layers.find(l=>l.id==="near-membrane").behaviors[0]];assert.throws(()=>parseArtworkPackage(spatial),/glow/);
  const legacy=clone();legacy.schemaVersion=1;assert.throws(()=>parseArtworkPackage(legacy));
});

test("highAttack drives only sky emission, freezes, relaxes and works above complete blackout",()=>{
  const manifest=parseArtworkPackage(withSceneReveal(raw)),instance=createArtworkInstance("sky-test",manifest),reveal=createSceneReveal();
  const sky=()=>instance.getSnapshot().layers.find(l=>l.id==="sky-high-attack").groups[0].effects[0].amount;
  assert.equal(sky(),0);reveal.setEnabled(true,instance);
  assert.equal(instance.getSnapshot().layers.find(l=>l.id==="reveal-curtain").opacity,1);
  assert.ok(manifest.layers.find(l=>l.id==="sky-high-attack").zIndex>manifest.layers.find(l=>l.id==="reveal-curtain").zIndex);
  for(let i=0;i<4;i++)instance.stepBehaviors({dt:1/60},{strength:1,intensity:1,signals:{highAttack:1}});
  assert.ok(sky()>2.8&&sky()<=3);const frozen=instance.getSnapshot();assert.deepEqual(instance.getSnapshot(),frozen);
  for(let i=0;i<120;i++)instance.stepBehaviors({dt:1/60});assert.ok(sky()<1e-12);
  instance.setBehaviorStrength("glow",0);instance.stepBehaviors({dt:1/60},{strength:1,intensity:1,signals:{highAttack:1}});assert.equal(sky(),0);
  instance.reset();assert.equal(sky(),0);
});
