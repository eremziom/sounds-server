import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {parseArtworkPackage} from '../src/engines/infinite-zoom/artwork/artwork-package.ts';
import {createArtworkInstance} from '../src/engines/infinite-zoom/artwork/artwork-instance.ts';
import {artworkTextureBytes} from '../src/engines/infinite-zoom/resources/texture-budget.ts';
import {STUDIO_ARTWORKS} from '../src/engines/infinite-zoom/artwork/pilot-controls.ts';
const require=createRequire(import.meta.url),sharp=createRequire(require.resolve('next/package.json'))('sharp');
const root=new URL('../public/infinite-zoom/samples/digital-grid/',import.meta.url);
const raw=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
test('digital test package validates actual assets, six local lighting groups and fixed geometry',async()=>{
  const manifest=parseArtworkPackage(raw);assert.equal(STUDIO_ARTWORKS.digital,manifest.id);
  assert.equal(manifest.portal,undefined);assert.equal(manifest.layers.length,8);
  assert.ok(artworkTextureBytes(manifest)<48*1024*1024);
  for(const asset of manifest.assets){
    const bytes=await readFile(new URL(asset.uri.split('/').at(-1),root));
    const m=await sharp(bytes).metadata();assert.equal(m.width,asset.width);assert.equal(m.height,asset.height);
  }
  for(const layer of manifest.layers.slice(2)){
    assert.deepEqual(layer.behaviors.map(b=>b.kind),['colorShift','colorShift','colorShift','glow']);
    assert.equal(layer.imageAssetId,'diagnostic-material');
    assert.equal(layer.behaviors[0].params.hue+layer.behaviors[1].params.hue,2*Math.PI);
    assert.notEqual(layer.maskAssetId,layer.behaviors[3].influenceMaskAssetId);
    const mask=await sharp(fileURLToPath(new URL(`${layer.maskAssetId}.png`,root))).extractChannel(0).raw().toBuffer();
    assert.ok(mask.filter(v=>v>25).length>20000,'Many source-material light pixels in every group');
  }
});
test('blackout variant preserves identical animated lights and supports smooth reveal by existing opacity strength',async()=>{
  const dark=parseArtworkPackage(JSON.parse(await readFile(new URL('blackout-manifest.json',root),'utf8')));
  assert.deepEqual(dark.layers.slice(2),parseArtworkPackage(raw).layers.slice(2));
  const instance=createArtworkInstance('digital-dark',dark);
  const opacity=()=>instance.getSnapshot().layers.find(l=>l.id==='environment').groups[0].effects[0].opacity;
  assert.equal(opacity(),0);
  for(const strength of [1,.75,.5,.25,0]){instance.setBehaviorStrength('opacity',strength);assert.equal(opacity(),1-strength);}
  instance.setBehaviorStrength('opacity',1);const initial=instance.getSnapshot();
  for(let tick=1;tick<=120;tick++)instance.stepBehaviors({dt:1/60,tick,timeSeconds:tick/60,random:()=>.5});
  assert.notDeepEqual(instance.getSnapshot().layers.slice(2),initial.layers.slice(2));assert.equal(opacity(),0);
  const paused=instance.getSnapshot();assert.deepEqual(instance.getSnapshot(),paused);
  instance.reset();assert.deepEqual(instance.getSnapshot(),initial);
});
