import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {parseArtworkPackage} from "../src/engines/infinite-zoom/artwork/artwork-package.ts";
import {artworkTextureBytes} from "../src/engines/infinite-zoom/resources/texture-budget.ts";
import {STUDIO_ARTWORKS} from "../src/engines/infinite-zoom/artwork/pilot-controls.ts";
import {createArtworkInstance} from "../src/engines/infinite-zoom/artwork/artwork-instance.ts";
import {MEMBRANES,membraneMasks,heatMasks} from "../scripts/create-insectoid-planet.mjs";
import {SMOKE_PIN_Y} from "../scripts/lib/insectoid-volcano-smoke.mjs";
import {extractChitinRims,RIM_EXCLUSIONS,insideRimPolygon,RIM_PERIOD} from "../scripts/lib/insectoid-chitin-rims.mjs";
import {setRimLightingVisibility} from "../src/components/infinite-zoom/rim-lighting.ts";
const root=new URL("../public/infinite-zoom/samples/insectoid-planet/",import.meta.url);
const manifest=parseArtworkPackage(JSON.parse(await readFile(new URL("manifest.json",root),"utf8")));
test("rejected fiber overlay is absent from the active artwork package",()=>{
  assert.equal(manifest.layers.some(l=>l.id.startsWith("fiber-")),false);
  assert.equal(manifest.assets.some(a=>a.id.startsWith("fiber-")),false);
});
test("new rim lighting uses original plate pixels and protects glass with textured material masks",async()=>{
  const layers=manifest.layers.filter(l=>l.id.startsWith("chitin-light-"));assert.equal(layers.length,4);
  for(const layer of layers){assert.equal(layer.imageAssetId,"plate");assert.equal(layer.regions.length,12);}
  const maps=await extractChitinRims(new URL("source.png",root));let support=0;
  for(let y=0;y<maps.height;y++)for(let x=0;x<maps.width;x++){
    const i=y*maps.width+x,sx=(x+.5)*1672/maps.width,sy=(y+.5)*941/maps.height;
    if(RIM_EXCLUSIONS.some(p=>insideRimPolygon(sx,sy,p)))assert.equal(maps.material[i],0,"Protected glazing cannot be lit");
    if(maps.material[i])support++;
  }
  assert.ok(support>10000&&support<30000);assert.ok(new Set(maps.material).size>150,"Facets/shadows must survive in the mask");
  assert.ok(artworkTextureBytes(manifest)<64*1024*1024);
});
test("rim travel repeats in order on the fixed clock and visibility preserves its phase",()=>{
  const instance=createArtworkInstance("rims",manifest),peaks=[];
  for(let tick=0;tick<=RIM_PERIOD*60;tick++){
    if(tick)instance.stepBehaviors({dt:1/60});
    if(tick%45===0){const values=instance.getSnapshot().layers.filter(l=>l.id.startsWith("chitin-light-")).flatMap(l=>l.groups.slice(1).map(g=>g.effects[0].amount));peaks.push(values.indexOf(Math.max(...values)));}
  }
  assert.deepEqual(peaks,[0,6,12,18,24,30,36,42,0]);
  const before=instance.getSnapshot();setRimLightingVisibility(instance,false);setRimLightingVisibility(instance,true);
  assert.deepEqual(instance.getSnapshot(),before);assert.throws(()=>setRimLightingVisibility(instance,1));
});
test("insectoid artwork validates local lighting, pinned membranes and bounded resources",async()=>{
  assert.equal(manifest.id,STUDIO_ARTWORKS.alien);assert.equal(manifest.portal,undefined);
  assert.equal(manifest.layers[0].behaviors.length,0);
  assert.equal(manifest.layers.filter(l=>l.behaviors.some(b=>b.kind==="scale")).length,3);
  assert.equal(manifest.layers.filter(l=>l.id.startsWith("storm-")).length,3);
  assert.equal(manifest.layers.filter(l=>l.behaviors.some(b=>b.kind==="wave")).length,1);
  assert.equal(manifest.layers.filter(l=>l.behaviors.some(b=>b.kind==="opacity")).length,3);
  for(const layer of manifest.layers.slice(1))assert.ok(layer.maskAssetId,"Every overlay must preserve earlier material overlays");
  for(const asset of manifest.assets)await readFile(new URL(asset.uri.split("/").at(-1),root));
  assert.ok(artworkTextureBytes(manifest)+3840*2160*4<256*1024*1024);
  const production=JSON.parse(await readFile(new URL("production.json",root),"utf8"));
  const source=await readFile(new URL("source.png",root));
  assert.equal(production.sources[0].sha256,createHash("sha256").update(source).digest("hex"));
  assert.equal(production.runtimeTexture.native4K,false);
  for(const recorded of production.sources){const bytes=await readFile(new URL(recorded.file,root));
    assert.equal(recorded.width,bytes.readUInt32BE(16));assert.equal(recorded.height,bytes.readUInt32BE(20));
    assert.equal(recorded.sha256,createHash("sha256").update(bytes).digest("hex"));
  }
});
test("heat refraction cannot sample outside its atmospheric pockets at maximum strength",()=>{
  const {visibility,influence,distance,maximumTravel}=heatMasks();let moving=0;
  for(let i=0;i<distance.length;i++){
    const w=influence[i]/255;if(!w)continue;moving++;
    assert.ok(visibility[i]>0);assert.ok(maximumTravel*w+2<distance[i],"Both wave extrema retain a sampling guard");
  }
  assert.ok(moving>3000&&moving<20000,"Heat stays confined to small authored pockets");
});
test("vapor fades stay within valid alpha and edits preserve simulation phase",()=>{
  const instance=createArtworkInstance("vapor-test",manifest);let min=1,max=0;
  for(let i=0;i<900;i++){
    instance.stepBehaviors({dt:1/60},{strength:1,intensity:1.25});
    for(const layer of instance.getSnapshot().layers.filter(l=>l.id.startsWith("vapor-"))){
      const value=layer.groups[0].effects.find(e=>e.kind==="opacity").opacity;
      assert.ok(value>=0&&value<=1);min=Math.min(min,value);max=Math.max(max,value);
    }
  }
  assert.ok(min<.001&&max>.999,"Full cycles reach both fade extrema");
  const before=instance.getSnapshot();
  for(const kind of ["wave","opacity"]){instance.setBehaviorStrength(kind,0);instance.setBehaviorStrength(kind,1);}
  assert.deepEqual(instance.getSnapshot(),before,"Changing controls cannot restart or advance the animation");
});
test("one distant plume uses independent alpha, pinned flow/bend and bounded fading",()=>{
  const plume=manifest.layers.find(l=>l.id==="distant-volcano-smoke");
  assert.deepEqual(new Set(plume.behaviors.map(b=>b.kind)),new Set(["flow","bend","glow","opacity"]));
  assert.equal(plume.maskAssetId,"visible-volcano-smoke");
  for(const kind of ["flow","bend","opacity"])assert.equal(plume.behaviors.find(b=>b.kind===kind).influenceMaskAssetId,"influence-volcano-smoke");
  assert.notEqual(plume.behaviors.find(b=>b.kind==="glow").influenceMaskAssetId,plume.maskAssetId);
  assert.equal(SMOKE_PIN_Y,197);
  const instance=createArtworkInstance("smoke-test",manifest);let minAlpha=1,maxAlpha=0;
  for(let i=0;i<900;i++){
    instance.stepBehaviors({dt:1/60});
    const effects=instance.getSnapshot().layers.find(l=>l.id===plume.id).groups[0].effects;
    const alpha=effects.find(e=>e.kind==="opacity").opacity;
    assert.ok(alpha>=.62-1e-10&&alpha<=.94+1e-10);minAlpha=Math.min(minAlpha,alpha);maxAlpha=Math.max(maxAlpha,alpha);
  }
  assert.ok(minAlpha<.621&&maxAlpha>.939);
  const before=instance.getSnapshot();
  for(const kind of ["flow","bend"]){instance.setBehaviorStrength(kind,0);instance.setBehaviorStrength(kind,.5);instance.setBehaviorStrength(kind,1);}
  assert.deepEqual(instance.getSnapshot(),before);
});
test("all membrane samples stay within guarded interiors at both scale extrema including modulation",()=>{
  for(const m of MEMBRANES){
    const {visibility,influence,distance,width,height}=membraneMasks(m);let moving=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x,w=influence[i]/255;if(!w)continue;moving++;
      assert.ok(visibility[i]>0);
      for(const sign of [-1,1]){
        const sx=1+sign*.06*1.25*w,sy=1+sign*.045*1.25*w;
        const px=m.pivot[0]*width/1672,py=m.pivot[1]*height/941;
        const dx=(x-px)/sx+px-x,dy=(y-py)/sy+py-y;
        assert.ok(Math.hypot(dx,dy)+2<distance[i],`${m.id} motion must not reach a rib or neighbor`);
      }
    }
    assert.ok(moving>2000);
  }
});
