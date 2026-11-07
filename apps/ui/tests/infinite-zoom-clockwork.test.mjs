import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {parseArtworkPackage} from "../src/engines/infinite-zoom/artwork/artwork-package.ts";
import {artworkTextureBytes} from "../src/engines/infinite-zoom/resources/texture-budget.ts";
import {STUDIO_ARTWORKS} from "../src/engines/infinite-zoom/artwork/pilot-controls.ts";

const root=new URL("../public/infinite-zoom/samples/clockwork/",import.meta.url);
const manifest=parseArtworkPackage(JSON.parse(await readFile(new URL("manifest.json",root),"utf8")));
test("clockwork authors five independent rigid rotors, fixed bearings and a complete backing within budget",()=>{
  assert.equal(manifest.id,STUDIO_ARTWORKS.clockwork);assert.equal(manifest.layers.filter(l=>l.spin).length,5);
  assert.equal(manifest.layers[0].spin,undefined);assert.equal(manifest.portal,undefined);
  const wheels=manifest.layers.filter(l=>l.spin);assert.equal(wheels[0].spin.turnsPerSecond,-wheels[1].spin.turnsPerSecond);
  assert.equal(new Set(wheels.map(l=>l.imageAssetId)).size,5);
  for(const layer of wheels){assert.ok(layer.behaviors.every(b=>b.kind==="glow"&&b.influenceMaskAssetId),"Only masked specular glints can affect rotating metal");}
  assert.ok(manifest.layers.find(l=>l.id==="fixed-axles").maskAssetId);
  const pulsing=manifest.layers.filter(l=>l.behaviors.some(b=>b.kind==="pulse"));
  assert.equal(pulsing.length,3);assert.ok(pulsing.every(l=>l.maskAssetId&&!l.spin));
  assert.equal(artworkTextureBytes(manifest),47520000);
  assert.ok(artworkTextureBytes(manifest)+3840*2160*4<256*1024*1024);
});
test("clockwork retains original raster source provenance and actual delivered dimensions",async()=>{
  const provenance=JSON.parse(await readFile(new URL("production.json",root),"utf8"));assert.equal(provenance.runtimeTexture.native4K,false);
  for(const source of provenance.sources){const data=await readFile(new URL(source.file,root));
    assert.equal(source.width,data.readUInt32BE(16));assert.equal(source.height,data.readUInt32BE(20));
    assert.equal(source.sha256,createHash("sha256").update(data).digest("hex"));
  }
});
