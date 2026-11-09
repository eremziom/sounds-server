import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {extractVolcanoLava,volcanoDelayPng,VOLCANO_LAVA_DOMAINS} from "../scripts/lib/insectoid-volcano-lava.mjs";
import {sharp,insideRimPolygon} from "../scripts/lib/insectoid-chitin-rims.mjs";
import {parseArtworkPackage,createArtworkInstance} from "../src/engines/infinite-zoom/artwork/index.ts";
import {withSceneReveal,createSceneReveal} from "../src/components/infinite-zoom/scene-reveal.ts";
import {createBehaviorEvaluator} from "../src/engines/infinite-zoom/behaviors/behavior-evaluator.ts";
import {parseBehaviors} from "../src/engines/infinite-zoom/behaviors/behavior-contract.ts";
const root=new URL("../public/infinite-zoom/samples/insectoid-planet/",import.meta.url);
const raw=JSON.parse(await readFile(new URL("manifest.json",root),"utf8"));

test("volcanic material masks follow source lava on three cone faces and carry separate downhill timing",async()=>{
  const m=await extractVolcanoLava(new URL("source.png",root));assert.ok(m.counts.every(n=>n>200));
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){
    const i=y*m.width+x;if(!m.visibility[i])continue;
    const sx=(x+.5)*1672/m.width,sy=(y+.5)*941/m.height;
    assert.ok(VOLCANO_LAVA_DOMAINS.some(d=>insideRimPolygon(sx,sy,d.points)));
    assert.ok(m.rgb[i*3]>m.rgb[i*3+1]&&m.rgb[i*3]>m.rgb[i*3+2],"Only warm source material is recolored");
  }
  for(const id of ["visible-volcano-lava","delay-volcano-lava"]){
    const packaged=await sharp(fileURLToPath(new URL(`${id}.png`,root))).extractChannel(0).raw().toBuffer();
    const expected=id.startsWith("visible")?Buffer.from(m.visibility):await sharp(await volcanoDelayPng(m)).extractChannel(0).raw().toBuffer();
    assert.ok(packaged.equals(expected));
  }
  for(const [x,y]of [[1200,100],[600,100],[400,300],[1250,600],[100,600],[1100,250]]){
    assert.equal(m.visibility[Math.floor(y*m.height/941)*m.width+Math.floor(x*m.width/1672)],0);
  }
});

test("traveling color starts orange everywhere, advances downhill and wraps smoothly after startup",()=>{
  const descriptor=raw.layers.find(l=>l.id==="volcano-lava").behaviors[0];
  const evaluator=createBehaviorEvaluator([{id:"layer",behaviors:parseBehaviors([descriptor])}]);
  const weight=delay=>{const e=evaluator.getSnapshot()[0].effects[0];return .5-.5*Math.cos(Math.max(0,e.travelPhase-delay*e.travelRadians));};
  assert.deepEqual([weight(0),weight(.5),weight(1)],[0,0,0]);
  for(let i=0;i<120;i++)evaluator.step(1/60);
  assert.ok(weight(0)>.24);assert.equal(weight(.5),0);assert.equal(weight(1),0);
  for(let i=0;i<240;i++)evaluator.step(1/60);
  assert.ok(weight(0)>.99);assert.ok(weight(.5)>weight(1));assert.ok(weight(1)>0);
  const before=evaluator.getSnapshot();assert.deepEqual(evaluator.getSnapshot(),before);
  for(let i=0;i<660;i++)evaluator.step(1/60);
  const boundary=weight(.3);evaluator.step(1/60);assert.ok(Math.abs(weight(.3)-boundary)<.01);
  evaluator.setBehaviorStrength("colorShift",0);assert.ok(evaluator.getSnapshot()[0].effects[0].hue===0);
  evaluator.reset();assert.equal(weight(0),0);
});

test("color travel validates paired fields and critical mask references, and stays animated in blackout",()=>{
  const descriptor=raw.layers.find(l=>l.id==="volcano-lava").behaviors[0];
  for(const patch of [{travelSeconds:undefined},{delayMapAssetId:undefined},{travelSeconds:-1},{travelSeconds:Infinity},{frequencyHz:0}]){
    assert.throws(()=>parseBehaviors([{...descriptor,params:{...descriptor.params,...patch}}]));
  }
  for(const patch of [{kind:"image"},{critical:false}]){
    const copy=structuredClone(raw);Object.assign(copy.assets.find(a=>a.id==="delay-volcano-lava"),patch);assert.throws(()=>parseArtworkPackage(copy));
  }
  const manifest=parseArtworkPackage(withSceneReveal(raw)),instance=createArtworkInstance("volcano",manifest),reveal=createSceneReveal();
  reveal.setEnabled(true,instance);assert.equal(instance.getSnapshot().layers.find(l=>l.id==="reveal-volcano-lava").opacity,1);
  for(let tick=0;tick<900;tick++){
    instance.stepBehaviors({dt:1/60});
    if(tick%60===0){const layers=instance.getSnapshot().layers;assert.deepEqual(layers.find(l=>l.id==="volcano-lava").groups,layers.find(l=>l.id==="reveal-volcano-lava").groups);}
  }
  reveal.setEnabled(false,instance);assert.equal(instance.getSnapshot().layers.find(l=>l.id==="reveal-volcano-lava").opacity,0);
});
