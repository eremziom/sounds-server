import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createEnvironmentBlackout,ENVIRONMENT_REVEAL_TICKS} from '../src/components/infinite-zoom/environment-blackout.ts';
import {createVisualBridge} from '../src/components/infinite-zoom/visual-bridge.ts';
import {parseArtworkPackage} from '../src/engines/infinite-zoom/artwork/artwork-package.ts';
import {createArtworkInstance} from '../src/engines/infinite-zoom/artwork/artwork-instance.ts';
const manifest=parseArtworkPackage(JSON.parse(await readFile(new URL('../public/infinite-zoom/samples/digital-grid/manifest.json',import.meta.url),'utf8')));
const environment=i=>i.getSnapshot().layers.find(l=>l.id==='environment');
test('blackout is exact, affects only environment and leaves protected color phases intact',()=>{
  const instance=createArtworkInstance('digital',manifest),control=createEnvironmentBlackout();
  for(let tick=0;tick<75;tick++)instance.stepBehaviors({dt:1/60});
  const before=instance.getSnapshot();control.setEnabled(true,instance);
  assert.equal(environment(instance).opacity,0);
  assert.deepEqual(instance.getSnapshot().layers.filter(l=>l.id!=='environment'),before.layers.filter(l=>l.id!=='environment'));
  instance.stepBehaviors({dt:1/60});assert.notDeepEqual(instance.getSnapshot().layers.slice(2),before.layers.slice(2));
  instance.reset();control.apply(instance);assert.equal(environment(instance).opacity,0);
});
test('reveal uses exactly three seconds of fixed steps; pause/parking retain brightness and toggles remain reversible',()=>{
  const instance=createArtworkInstance('digital',manifest),control=createEnvironmentBlackout();
  control.setEnabled(true,instance);control.setEnabled(false,instance);
  for(let i=0;i<ENVIRONMENT_REVEAL_TICKS/2;i++)control.step(instance);
  assert.equal(environment(instance).opacity,.5);
  const paused=control.getSnapshot();for(let i=0;i<60;i++)control.apply(instance);assert.deepEqual(control.getSnapshot(),paused);
  const parked={manifest:{id:'forest'},setLayerTransform(){throw Error('Must not affect another scene');}};
  for(let i=0;i<60;i++)control.step(parked);control.setEnabled(true,parked);assert.deepEqual(control.getSnapshot(),paused);
  instance.reset();control.apply(instance);assert.equal(environment(instance).opacity,.5);
  for(let i=0;i<ENVIRONMENT_REVEAL_TICKS/2;i++)control.step(instance);assert.equal(environment(instance).opacity,1);
  control.setEnabled(true,instance);assert.equal(environment(instance).opacity,0);
  assert.throws(()=>control.setEnabled(1,instance));
});
test('application bridge forwards blackout preference and exposes published checkbox state',()=>{
  const bridge=createVisualBridge(),calls=[];
  const disconnect=bridge.connect({setEnvironmentBlackoutEnabled:value=>calls.push(value)});
  bridge.setEnvironmentBlackoutEnabled(true);bridge.setEnvironmentBlackoutEnabled(false);assert.deepEqual(calls,[true,false]);
  bridge.publish({...bridge.getSnapshot(),environmentBlackoutEnabled:true});assert.equal(bridge.getSnapshot().environmentBlackoutEnabled,true);
  disconnect();assert.equal(bridge.getSnapshot().environmentBlackoutEnabled,undefined);
});
