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
  assert.ok(manifest.layers.every(l=>!l.id.startsWith('tower-')),'No withdrawn tower layers remain');
  assert.deepEqual(manifest.layers.filter(l=>l.behaviors.some(b=>b.params.attackWave)).map(l=>l.id),['dome-ribs'],'Only the existing dome/tower mask reacts to bass');
  assert.ok(artworkTextureBytes(manifest)<48*1024*1024);
  for(const asset of manifest.assets){
    const bytes=await readFile(new URL(asset.uri.split('/').at(-1),root));
    const m=await sharp(bytes).metadata();assert.equal(m.width,asset.width);assert.equal(m.height,asset.height);
  }
  for(const layer of manifest.layers.slice(2)){
    assert.deepEqual(layer.behaviors.map(b=>b.kind),layer.id==='dome-ribs'?['colorShift','glow']:['colorShift','colorShift','colorShift','glow']);
    assert.equal(layer.imageAssetId,layer.id==='dome-ribs'?'turquoise-material':'diagnostic-material');
    if(layer.id!=='dome-ribs')assert.equal(layer.behaviors[0].params.hue+layer.behaviors[1].params.hue,2*Math.PI);
    assert.notEqual(layer.maskAssetId,layer.behaviors.at(-1).influenceMaskAssetId);
    const mask=await sharp(fileURLToPath(new URL(`${layer.maskAssetId}.png`,root))).extractChannel(0).raw().toBuffer();
    assert.ok(mask.filter(v=>v>25).length>20000,'Many source-material light pixels in every group');
  }
});

test('one unchanged mask launches independent color waves on each bass event and other colors remain cyclic',()=>{
  const manifest=parseArtworkPackage(raw),idle=createArtworkInstance('idle',manifest),hit=createArtworkInstance('hit',manifest);
  const layer=(instance,id)=>instance.getSnapshot().layers.find(l=>l.id===id);
  const waves=instance=>layer(instance,'dome-ribs').groups[0].effects[0].waves;
  assert.equal(waves(idle).length,0);
  const hits=[];let token=0;
  for(let tick=0;tick<180;tick++){
    const kick=tick===20||tick===100?1:0;
    if(kick)token=1-token;
    idle.stepBehaviors({dt:1/60},{strength:1,intensity:1,signals:{kick:0,kickEvent:0}});
    hit.stepBehaviors({dt:1/60},{strength:1,intensity:1,signals:{kick,kickEvent:token}});
    assert.equal(waves(idle).length,0,'No waves before an event');
    if(kick)hits.push(waves(hit).at(-1).color);
    for(const id of ['rear-wheel','front-wheel','body-panels','road-cyan','city-amber'])assert.deepEqual(layer(hit,id),layer(idle,id),'Other masks preserve existing cycles');
  }
  assert.notDeepEqual(hits[0],hits[1],'Each bass hit chooses the next color');assert.equal(waves(hit).length,0,'Waves finish after crossing the mask');
  const paused=hit.getSnapshot();assert.deepEqual(hit.getSnapshot(),paused);hit.reset();assert.equal(waves(hit).length,0);
  const selected=manifest.layers.find(l=>l.id==='dome-ribs');assert.equal(selected.maskAssetId,'visible-dome-ribs');
  for(const b of selected.behaviors.filter(b=>b.kind==='colorShift'))assert.equal(b.params.frequencyHz,0);
});

test('bass waves use contrasting colors, travel upward in 0.3 seconds and remain only 0.1 seconds at each point',()=>{
  const wave=raw.layers.find(l=>l.id==='dome-ribs').behaviors[0].params.attackWave;
  assert.equal(wave.travelSeconds,.3);assert.equal(wave.pulseSeconds,.1);assert.ok(wave.startY>wave.endY);assert.equal(wave.baseIntensity,.85);
  for(const [r,g,b]of wave.palette){
    const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
    if(delta<.1){assert.ok(min>.8,'Neutral impulses must contrast through bright white');continue;}
    let hue=(max===r?(g-b)/delta:max===g?(b-r)/delta+2:(r-g)/delta+4)*60;hue=(hue+360)%360;
    assert.ok(hue<150||hue>285,`Avoid cyan, blue and nearby violet against the blue base: ${hue}`);
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
