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
test('digital test package validates actual assets, six original lighting groups and one separated aircraft',async()=>{
  const manifest=parseArtworkPackage(raw);assert.equal(STUDIO_ARTWORKS.digital,manifest.id);
  assert.equal(manifest.portal,undefined);assert.equal(manifest.layers.length,11);
  assert.ok(manifest.layers.every(l=>!l.id.startsWith('tower-')),'No withdrawn tower layers remain');
  assert.deepEqual(manifest.layers.filter(l=>l.behaviors.some(b=>b.params.attackWave)).map(l=>l.id),['dome-ribs'],'Only the existing dome/tower mask reacts to bass');
  assert.ok(artworkTextureBytes(manifest)<64*1024*1024);
  for(const asset of manifest.assets){
    const bytes=await readFile(new URL(asset.uri.split('/').at(-1),root));
    const m=await sharp(bytes).metadata();assert.equal(m.width,asset.width);assert.equal(m.height,asset.height);
  }
  for(const layer of manifest.layers.slice(2).filter(l=>!l.id.startsWith('sky-aircraft'))){
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


test('aircraft makes one constant-speed two-minute journey after 30 seconds, freezes and resets',()=>{
  const manifest=parseArtworkPackage(raw),instance=createArtworkInstance('flight',manifest);
  const flight=()=>instance.getSnapshot().layers.find(l=>l.id==='sky-aircraft');
  const initial=flight();assert.equal(initial.opacity,0);
  const advance=n=>{for(let i=0;i<n*60;i++)instance.stepBehaviors({dt:1/60});};
  advance(29);assert.equal(flight().opacity,0);assert.equal(flight().x,0);
  advance(1);assert.equal(flight().opacity,1);assert.equal(flight().x,0);
  advance(30);assert.ok(Math.abs(flight().x-563.4)<1e-8);
  const paused=flight();assert.deepEqual(flight(),paused);
  advance(30);assert.ok(Math.abs(flight().x-1126.8)<1e-8);
  advance(60);assert.equal(flight().opacity,0);assert.equal(flight().x,2253.6);
  advance(20);assert.equal(flight().opacity,0);assert.equal(flight().x,2253.6);
  instance.reset();assert.deepEqual(flight(),initial);
  const descriptor=manifest.layers.find(l=>l.id==='sky-aircraft');
  assert.equal(descriptor.occlusionMaskAssetId,'occlusion-skyline');
  assert.deepEqual(descriptor.behaviors,[],'Hull has no color or brightness operators');
  const wake=manifest.layers.find(l=>l.id==='sky-aircraft-wake');
  const beacon=manifest.layers.find(l=>l.id==='sky-aircraft-beacon');
  assert.deepEqual(wake.travel,descriptor.travel);assert.deepEqual(beacon.travel,descriptor.travel);
  assert.equal(beacon.behaviors[0].params.pulseSeconds,.1);
  assert.equal(beacon.behaviors[0].params.frequencyHz,.2);
  const bike=manifest.layers.find(l=>l.id==='body-panels');
  for(let i=0;i<3;i++){
    const {delayMapAssetId:a,...actual}=wake.behaviors[i].params;
    const {delayMapAssetId:b,...expected}=bike.behaviors[i].params;
    assert.deepEqual(actual,expected);
  }
});

test('travel and stationary occlusion reject unsafe coverage and malformed package data',()=>{
  for(const mutate of [
    v=>v.schemaVersion=1,
    v=>v.layers[0].travel={startSeconds:0,durationSeconds:1,x:1,y:0},
    v=>v.layers[0].occlusionMaskAssetId='occlusion-skyline',
    v=>v.layers.at(-1).travel.durationSeconds=0,
    v=>v.layers.at(-1).travel.x=Infinity,
    v=>v.layers.at(-1).travel.startSeconds=-1,
    v=>v.layers.at(-1).travel.extra=1,
    v=>v.layers.at(-1).occlusionMaskAssetId='plate',
    v=>v.layers.at(-1).spin={pivotX:0,pivotY:0,turnsPerSecond:0},
  ]){const value=structuredClone(raw);mutate(value);assert.throws(()=>parseArtworkPackage(value));}
});


test('navigation flash is a 100ms signal every five seconds, with exact darkness between signals',()=>{
  const instance=createArtworkInstance('beacon',parseArtworkPackage(raw));
  const amount=()=>instance.getSnapshot().layers.find(l=>l.id==='sky-aircraft-beacon').groups[0].effects[0].amount;
  const peaks=[],lit=[];
  for(let tick=0;tick<=660;tick++){
    if(tick>0)instance.stepBehaviors({dt:1/60});
    if(amount()>1e-8)lit.push(tick);
    if(amount()>.999)peaks.push(tick);
    if(tick%300>6)assert.equal(amount(),0);
  }
  assert.deepEqual(peaks,[3,303,603]);
  assert.deepEqual(lit,Array.from({length:3},(_,n)=>[1,2,3,4,5].map(t=>n*300+t)).flat());
  const paused=instance.getSnapshot();assert.deepEqual(instance.getSnapshot(),paused);
  instance.reset();assert.equal(amount(),0);
});
