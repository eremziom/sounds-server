import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathDelay,selectMaterials} from './pilot-materials.mjs';
import {correctedManifest} from './corrected-package.mjs';
import {createArtworkInstance} from '../../apps/ui/src/engines/infinite-zoom/artwork/artwork-instance.ts';
import {travelTransform} from '../../apps/ui/src/engines/infinite-zoom/artwork/rigid-travel.ts';

test('delay follows a bent material path by distance, not global screen height',()=>{
  const paths=[[[2,2],[8,2],[8,10]]];
  assert.equal(pathDelay(2,2,paths).delay,0);
  assert.equal(pathDelay(8,2,paths).delay,6/14);
  assert.equal(pathDelay(8,10,paths).delay,1);
  assert.equal(pathDelay(5,2,paths).delay,3/14);
  assert.throws(()=>pathDelay(1,1,[[[0,0],[0,0]]]),/positive length/);
});
test('material selection rejects stone faces, dark gaps and protected pixels',()=>{
  const w=12,h=9,rgb=new Uint8Array(w*h*3),exclude=new Uint8Array(w*h);
  const set=(x,y,c)=>rgb.set(c,(y*w+x)*3);
  set(3,4,[10,180,190]);set(4,4,[90,110,125]);set(5,4,[0,0,0]);set(6,4,[10,180,190]);exclude[4*w+6]=255;
  const before=rgb.slice(),result=selectMaterials(rgb,w,h,[[[2,4],[9,4]]],exclude);
  assert.ok(result.masks[0][4*w+3]>0);
  for(const x of [4,5,6])assert.equal(result.masks[0][4*w+x],0);
  assert.equal(result.delay[4*w+3],Math.round(255/7));assert.deepEqual(rgb,before);
  assert.throws(()=>selectMaterials(rgb,w,h,[],new Uint8Array(1)),/Unregistered/);
});
test('corrected package registers spatial flow and stationary occlusion on all moving parts',()=>{
  const m=correctedManifest();
  const moving=m.layers.filter(l=>l.travel);
  assert.equal(moving.length,2);assert.deepEqual(moving[0].travel,moving[1].travel);
  for(const l of moving)assert.equal(l.occlusionMaskAssetId,'occlusion');
  for(const l of m.layers.filter(l=>l.id.endsWith('-lights')&&l.id!=='drone-lights')){
    const flow=l.behaviors.find(b=>b.kind==='colorShift');assert.equal(flow.params.delayMapAssetId,'delay');
  }
  const instance=createArtworkInstance('test',m);instance.stepBehaviors({tick:1,timeSeconds:1/60,dt:1/60,random:()=>.5});
  const effect=instance.getSnapshot().layers.find(l=>l.id==='gate-lights').groups[0].effects.find(e=>e.kind==='colorShift');
  assert.equal(effect.delayMapAssetId,'delay');assert.ok(Number.isFinite(effect.travelPhase));
});

test('the full drone silhouette leaves the frame before one-shot travel hides it',()=>{
  const travel=correctedManifest().layers.find(l=>l.id==='drone').travel;
  const pose=travelTransform(travel,travel.durationSeconds-1/60),c=Math.cos(pose.rotation),s=Math.sin(pose.rotation);
  // Source-space rectangle enclosing the reviewed object mask, including both rotors.
  for(const [x,y] of [[255,195],[395,195],[255,250],[395,250]]){
    const dx=x*3.75-1920,dy=y*3.75-1080;
    const worldX=1920+pose.x+c*dx-s*dy;
    assert.ok(worldX>3840,'A visible rotor must not disappear at the end of travel');
  }
  assert.equal(pose.opacity,1);
  assert.equal(travelTransform(travel,travel.durationSeconds).opacity,0);
});
