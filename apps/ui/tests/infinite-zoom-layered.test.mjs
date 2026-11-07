import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {parseArtworkPackage} from "../src/engines/infinite-zoom/artwork/artwork-package.ts";
import {artworkTextureBytes} from "../src/engines/infinite-zoom/resources/texture-budget.ts";
import {BEHAVIOR_KINDS} from "../src/engines/infinite-zoom/artwork/pilot-controls.ts";
import {createRiverMasks} from "../scripts/lib/forest-river-masks.mjs";

const root=new URL("../public/infinite-zoom/samples/forest-layered/",import.meta.url);
const manifest=parseArtworkPackage(JSON.parse(await readFile(new URL("manifest.json",root),"utf8")));
test("painted layered scene binds all twelve operators to real shared raster regions within budget",()=>{
  assert.deepEqual([...new Set(manifest.layers.flatMap(l=>l.behaviors.map(b=>b.kind)))].sort(),[...BEHAVIOR_KINDS].sort());
  assert.equal(manifest.layers.length,7);assert.equal(manifest.portal,undefined);
  const river=manifest.layers.find(l=>l.id==="river");
  assert.equal(river.imageAssetId,manifest.layers[0].imageAssetId);
  assert.ok(river.maskAssetId);assert.ok(river.behaviors.every(b=>b.influenceMaskAssetId&&b.influenceMaskAssetId!==river.maskAssetId));
  for(const id of ["left-ferns","right-ferns"]){const layer=manifest.layers.find(l=>l.id===id);assert.equal(layer.imageAssetId,"foliage");assert.ok(layer.behaviors.every(b=>b.influenceMaskAssetId==="leaf-influence"));}
  assert.equal(artworkTextureBytes(manifest),34560000);
  assert.ok(artworkTextureBytes(manifest)+3840*2160*4<256*1024*1024);
});
test("generated raster originals retain recorded hashes and truthful native dimensions",async()=>{
  const provenance=JSON.parse(await readFile(new URL("production.json",root),"utf8"));
  assert.equal(provenance.runtimeTexture.native4K,false);
  for(const source of provenance.sources){
    const bytes=await readFile(new URL(source.file,root));
    assert.equal(bytes.readUInt32BE(16),source.width);assert.equal(bytes.readUInt32BE(20),source.height);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),source.sha256);
    const container=await readFile(new URL(`${source.id}.svg`,root),"utf8");
    assert.ok(container.includes(`data:image/png;base64,${bytes.toString("base64")}`));
  }
});

test("river motion excludes exposed rocks/banks and cannot sample them at full composed strength",()=>{
  const maps=createRiverMasks(),{width,height,water,influence,maximumTravel}=maps;
  const at=(x,y)=>Math.floor(y*height/941)*width+Math.floor(x*width/1672);
  for(const[x,y]of [[783,435],[648,615],[868,380],[450,600],[580,830],[1400,520]]){
    assert.equal(water[at(x,y)],0,`Stationary source point ${x},${y}`);
    assert.equal(influence[at(x,y)],0);
  }
  let moving=0;
  // Independently probe worst-case displacement directions, including the
  // bilinear footprint, instead of only inspecting the distance-map formula.
  for(let y=2;y<height-2;y+=3)for(let x=2;x<width-2;x+=3){
    const strength=influence[y*width+x]/255;if(!strength)continue;moving++;
    for(let angle=0;angle<16;angle++){
      const px=x+Math.cos(angle*Math.PI/8)*maximumTravel*strength,py=y+Math.sin(angle*Math.PI/8)*maximumTravel*strength;
      const sx=Math.floor(px),sy=Math.floor(py);
      for(const dx of [0,1])for(const dy of [0,1])assert.equal(water[(sy+dy)*width+sx+dx],1,`Sampling reached land from ${x},${y}`);
    }
  }
  assert.ok(moving>15000,"The guard preserves a substantial moving water area");
});
