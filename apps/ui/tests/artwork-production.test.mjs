import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleScene, includeArtifacts } from '../src/components/artwork-creator/scene-assembly.ts';
import { createDraftEnvironment } from '../src/components/infinite-zoom/draft-environment.ts';

const image=id=>({id,kind:'image',width:1024,height:576,registrationId:id,inputs:[]});
const map=(id,kind,source='background')=>({id,kind,width:1024,height:576,registrationId:source,inputs:[{inputId:source}]});
const artifacts=[image('black'),image('background'),image('object'),map('material','material-mask'),map('influence','influence-map'),map('delay','delay-map')];
const snapshot={schemaVersion:1,brief:{intent:'scene'},artifactIds:[],layers:[],decisions:['Keep my original plan']};
const options={coverage:'black',environment:'background',object:'object',material:'material',influence:'influence',delay:'delay',duration:24,distance:2800,bend:-400,period:8,audio:true};
test('assembly retains source choices, typed flow/audio and real independent curved travel',()=>{
 const result=assembleScene(snapshot,artifacts,options);
 assert.equal(result.layers.length,4);assert.equal(result.layers[0].id,'coverage');assert.equal(result.layers[0].parameters.behaviors,undefined);
 assert.equal(result.layers[2].parameters.behaviors[0].params.delayMapAssetId,'delay');
 assert.equal(result.layers[2].parameters.behaviors[1].modulation[0].signal,'bass');
 assert.equal(result.layers[3].parameters.travel.path.segments[0].to.x,2800);
 assert.deepEqual(result.decisions,snapshot.decisions);assert.deepEqual(snapshot.layers,[]);
 assert.ok(result.artifactIds.includes('background'));
});
test('assembly rejects maps from another image and invalid flight/lighting parameters',()=>{
 for(const change of [{environment:'object'},{duration:0},{distance:5000},{period:0}])assert.throws(()=>assembleScene(snapshot,artifacts,{...options,...change}));
 assert.throws(()=>assembleScene(snapshot,[...artifacts,map('occlusion','occlusion-mask')],{...options,occlusion:'occlusion'}));
});
test('selecting a result includes its transitive inputs and detects corrupt dependency cycles',()=>{
 const nodes=[image('source'),{...image('derived'),inputs:[{inputId:'source'}]}];
 assert.deepEqual(includeArtifacts(nodes,[],['derived']),['source','derived']);
 assert.throws(()=>includeArtifacts([{...image('a'),inputs:[{inputId:'b'}]},{...image('b'),inputs:[{inputId:'a'}]}],[],['a']));
});
test('blackout protects coverage/lights and reveals only on 480 actual fixed steps',()=>{
 const transforms={environment:1,object:1,lights:1,coverage:1};
 const instance={id:'draft',manifest:{coverage:{baseLayerId:'coverage'},layers:Object.keys(transforms).map(id=>({id}))},setLayerTransform(id,patch){transforms[id]=patch.opacity;}};
 const control=createDraftEnvironment(); control.configure(instance,{environmentLayerIds:['environment','object'],lightLayerIds:['lights']});
 control.setEnabled(true,instance);assert.deepEqual(transforms,{environment:0,object:0,lights:1,coverage:1});
 for(let i=0;i<10;i++)control.apply(instance);assert.equal(control.getSnapshot().brightness,0);
 control.setEnabled(false,instance); for(let i=0;i<240;i++)control.step(instance);assert.equal(transforms.environment,.5);
 const paused=control.getSnapshot(); for(let i=0;i<10;i++)control.apply(instance);assert.deepEqual(control.getSnapshot(),paused);
 for(let i=0;i<240;i++)control.step(instance);assert.equal(transforms.environment,1);assert.equal(transforms.lights,1);
 assert.throws(()=>control.configure(instance,{environmentLayerIds:['coverage'],lightLayerIds:['lights']}));
});
