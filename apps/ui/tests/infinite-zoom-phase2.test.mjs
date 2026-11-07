import assert from "node:assert/strict";
import { test } from "node:test";
import { catalog, phase2Manifest } from "./helpers/infinite-zoom-phase2-data.mjs";
import { parseArtworkPackage } from "../src/engines/infinite-zoom/artwork/artwork-package.ts";
import { loadArtwork } from "../src/engines/infinite-zoom/artwork/artwork-loader.ts";
import { createArtworkInstance } from "../src/engines/infinite-zoom/artwork/artwork-instance.ts";
import { behaviorGroups, createBehaviorEvaluator } from "../src/engines/infinite-zoom/behaviors/behavior-evaluator.ts";
import { parseBehaviors, validateComposition } from "../src/engines/infinite-zoom/behaviors/behavior-contract.ts";
import { parseMotionConstraints, composeConstraints } from "../src/engines/infinite-zoom/behaviors/motion-constraints.ts";
import { parseBindings, createBindingEvaluator } from "../src/engines/infinite-zoom/modulation/bindings.ts";
import { createCameraController } from "../src/engines/infinite-zoom/camera/camera-controller.ts";
import { FULL_FRAME } from "../src/engines/infinite-zoom/camera/camera-math.ts";
import { anchorTour } from "../src/engines/infinite-zoom/camera/path-planner.ts";
import { createCameraTiming } from "../src/engines/infinite-zoom/modulation/camera-timing.ts";
import { createLogicalRecorder, replayLogicalJourney, validateRecording } from "../src/engines/infinite-zoom/diagnostics/logical-replay.ts";
import { createAdaptiveQuality } from "../src/engines/infinite-zoom/quality/adaptive-quality.ts";
import { createSessionDiagnostics } from "../src/engines/infinite-zoom/diagnostics/session-diagnostics.ts";

test("all twelve typed operators validate, evaluate deterministically, disable and reset", () => {
  const manifest=parseArtworkPackage(phase2Manifest()), a=createArtworkInstance("a",manifest), b=createArtworkInstance("b",manifest);
  assert.equal(new Set(a.getSnapshot().layers[1].groups[0].effects.map(e=>e.kind)).size,12);
  const initial=a.getSnapshot().layers;
  for(let tick=0;tick<180;tick++){a.stepBehaviors({dt:1/60});b.stepBehaviors({dt:1/60});}
  assert.deepEqual(a.getSnapshot().layers,b.getSnapshot().layers);
  assert.notDeepEqual(initial,a.getSnapshot().layers);a.reset();assert.deepEqual(a.getSnapshot().layers,initial);
  for(const behavior of catalog) {
    const evaluator=createBehaviorEvaluator([{id:"layer",behaviors:parseBehaviors([{...behavior,enabled:false}])}]);
    const before=evaluator.getSnapshot()[0].effects[0];evaluator.step(1/60);
    const after=evaluator.getSnapshot()[0].effects[0];
    // Wave phase advances even when amplitude is zero; all visible amplitudes stay neutral.
    assert.deepEqual({...after,phase:0},{...before,phase:0});
  }
  for(const behavior of catalog) {
    assert.throws(()=>parseBehaviors([{...behavior,params:{...behavior.params,unexpected:1}}]));
    assert.throws(()=>parseBehaviors([{...behavior,weight:Infinity}]));
  }
});

test("schema 2 is explicit, detached, field-typed and coverage-safe", () => {
  const input=phase2Manifest(), manifest=parseArtworkPackage(input);input.layers[1].behaviors[0].params.x=999;
  assert.equal(manifest.layers[1].behaviors[0].params.x,48);
  for(const mutate of [
    m=>m.schemaVersion=1,m=>m.assets.find(a=>a.id==="depth").kind="image",
    m=>m.assets.find(a=>a.id==="flow").critical=false,m=>m.assets[0].width=127,
    m=>m.layers[0].behaviors=[catalog[1]],m=>m.layers[0].behaviors=[catalog[9]],
    m=>m.layers[1].constraints={maxDisplacement:8},
  ]) {const value=phase2Manifest();mutate(value);assert.throws(()=>parseArtworkPackage(value));}
  const value=phase2Manifest([]);value.layers[1].lods=[{assetId:"detail",minPixelsPerTexel:1.25}];
  assert.ok(Object.isFrozen(parseArtworkPackage(value).layers[1].lods));
  value.assets.find(a=>a.id==="detail").critical=true;assert.throws(()=>parseArtworkPackage(value));
});

test("hard constraints intersect and soft preferences attenuate inherited region motion", () => {
  const artwork=parseMotionConstraints({maxDisplacement:100,softStrength:0.8}),layer=parseMotionConstraints({maxDisplacement:80,softStrength:0.5});
  assert.equal(composeConstraints(artwork,layer).maxDisplacement,80);
  const behaviors=parseBehaviors([catalog[0]]),groups=behaviorGroups(behaviors,{constraints:layer,behaviors:[],regions:[{id:"tip",influenceMaskAssetId:"mask",constraints:parseMotionConstraints({softStrength:0.25}),behaviors:[]}]},artwork);
  const output=createBehaviorEvaluator(groups).getSnapshot();
  assert.equal(output[0].effects[0].x,24);assert.equal(output[1].effects[0].x,12);
  assert.throws(()=>validateComposition(behaviors,parseMotionConstraints({maxDisplacement:10})),/hard constraint/);
  assert.throws(()=>parseMotionConstraints({maxIntensity:0.5}));
});

test("binding priority, smoothing, missing signals and reset stay bounded", () => {
  const binding=(id,priority,operation,min,max)=>({id,signal:"bass",priority,operation,min,max,attackSeconds:1/60,releaseSeconds:1/60});
  const parsed=parseBindings([binding("b",2,"multiply",0.5,0.5),binding("a",1,"replace",0.8,0.8)]);
  const evaluator=createBindingEvaluator(parsed);let value;
  for(let i=0;i<60;i++)value=evaluator.step({bass:1},1/60);
  assert.ok(Math.abs(value-0.4)<1e-8);
  for(let i=0;i<60;i++)value=evaluator.step({bass:NaN},1/60);
  assert.ok(Math.abs(value-1)<1e-8);evaluator.reset();
  assert.throws(()=>evaluator.step({},0.1));assert.throws(()=>parseBindings([binding("a",0,"replace",1,0)]));
});

test("optional asset requests deduplicate, never gate readiness, and evict safely", async () => {
  const closed=[],calls=[];let release;
  const loaded=await loadArtwork(phase2Manifest([]),new AbortController().signal,async asset=>{
    calls.push(asset.id);if(!asset.critical)await new Promise(resolve=>release=resolve);
    const result={width:asset.width,height:asset.height,opaque:true,image:{},closes:0,close(){this.closes++;}};closed.push(result);return result;
  });
  assert.equal(calls.includes("detail"),false);
  const signal=new AbortController().signal,first=loaded.loadOptional("detail",signal),second=loaded.loadOptional("detail",signal);
  release();await Promise.all([first,second]);assert.equal(calls.filter(c=>c==="detail").length,1);
  assert.equal(loaded.hasAsset("detail"),true);loaded.evictOptional();assert.equal(loaded.hasAsset("detail"),false);
  assert.equal(closed.at(-1).closes,1);loaded.dispose();assert.ok(closed.every(a=>a.closes===1));
});

test("late optional decode after disposal closes exactly once", async () => {
  let resolve;const decoded={width:256,height:144,opaque:true,image:{},closes:0,close(){this.closes++;}};
  const loaded=await loadArtwork(phase2Manifest([]),new AbortController().signal,async asset=>asset.critical?{width:128,height:72,opaque:true,image:{},close(){}}:await new Promise(r=>resolve=r));
  const operation=loaded.loadOptional("detail",new AbortController().signal);loaded.dispose();resolve(decoded);
  await assert.rejects(operation);assert.equal(decoded.closes,1);
});

test("multi-segment camera paths preflight transactionally and return to exact bookmarks", () => {
  const camera=createCameraController(p=>p.x<=2200);camera.saveBookmark("start");
  const before=camera.getSnapshot();
  assert.throws(()=>camera.followPath([{pose:{...FULL_FRAME,x:2100},seconds:1},{pose:{...FULL_FRAME,x:2300},seconds:1}]));
  assert.deepEqual(camera.getSnapshot(),before);
  camera.followPath(anchorTour([{x:2000,y:1100}],FULL_FRAME,Math.log(2),0.5));
  for(let i=0;i<600;i++)camera.step();assert.deepEqual(camera.getSnapshot().pose,FULL_FRAME);
  camera.move(2000,1100,1);for(let i=0;i<60;i++)camera.step();camera.returnTo("start",1);for(let i=0;i<60;i++)camera.step();
  assert.deepEqual(camera.getSnapshot().pose,FULL_FRAME);
});

test("camera audio timing changes intention duration without writing pose", () => {
  const timing=createCameraTiming();assert.equal(timing.duration(2),2);
  for(let i=0;i<120;i++)timing.step({energy:1},1/60);assert.ok(timing.duration(2)<2);
  for(let i=0;i<120;i++)timing.step(undefined,1/60);assert.ok(Math.abs(timing.getSnapshot()-1)<0.001);
  timing.reset();assert.equal(timing.duration(2),2);
});

test("bounded recording round-trips real camera and behavior logic with matching versions", () => {
  const manifest=parseArtworkPackage(phase2Manifest([catalog[0],catalog[8]])),packages=[{id:manifest.id,version:manifest.version}];
  const setup=()=>{const camera=createCameraController(()=>true),instance=createArtworkInstance("replay",manifest);return {camera,instance,
    command(command){if(command==="zoomIn")camera.zoomIn(2,1);},step(context){camera.step();instance.stepBehaviors(context);}};};
  const original=setup(),recorder=createLogicalRecorder(42,packages,120);
  for(let tick=1;tick<=120;tick++) {if(tick===1){original.command("zoomIn");recorder.command("zoomIn");}original.step({dt:1/60});recorder.capture(tick,{energy:tick/120});}
  const restored=setup(),serialized=JSON.parse(JSON.stringify(recorder.export()));
  assert.deepEqual(replayLogicalJourney(serialized,{packages,command:c=>restored.command(c),step:c=>restored.step(c)}),{ticks:120,complete:true});
  assert.deepEqual(restored.camera.getSnapshot(),original.camera.getSnapshot());assert.deepEqual(restored.instance.getSnapshot(),original.instance.getSnapshot());
  assert.throws(()=>replayLogicalJourney(serialized,{packages:[{id:"phase2",version:"other"}],command(){},step(){}}),/version mismatch/);
  recorder.capture(121,null);assert.equal(recorder.getSnapshot().frames,120);assert.equal(recorder.export().complete,false);
  serialized.frames[0].signals.energy=NaN;assert.throws(()=>validateRecording(serialized));recorder.reset();assert.equal(recorder.export().frames.length,0);
});

test("quality upgrade hysteresis and rich diagnostics preserve handoff locks and bounded context", () => {
  const quality=createAdaptiveQuality("Performance");for(let i=0;i<1200;i++)quality.sample(10,false);
  assert.equal(quality.getSnapshot().profile,"Balanced");assert.equal(quality.select("Ultra",true),false);
  assert.equal(quality.select("High"),true);assert.equal(quality.getSnapshot().profile,"High");
  const diagnostics=createSessionDiagnostics("phase2"),details={layers:12,available:true};
  diagnostics.event("RESOURCE_LOAD_FAILED",2,"critical",{artworkInstanceId:"a:2",details});details.layers=99;
  assert.equal(diagnostics.getSnapshot().events[0].details.layers,12);
  assert.throws(()=>diagnostics.event("TEST",3,"info",{details:{uri:"secret"}}));
});


test("evicting an in-flight optional request cannot resurrect its bitmap or erase its retry", async () => {
  const resolvers=[],closed=[];
  const loaded=await loadArtwork(phase2Manifest([]),new AbortController().signal,async asset=>{
    if(asset.critical)return {width:128,height:72,opaque:true,image:{},close(){}};
    return await new Promise(resolve=>resolvers.push(()=>{
      const value={width:256,height:144,opaque:false,image:{},closes:0,close(){this.closes++;}};closed.push(value);resolve(value);
    }));
  });
  const first=loaded.loadOptional("detail",new AbortController().signal);loaded.evictOptional();
  const second=loaded.loadOptional("detail",new AbortController().signal);
  resolvers[0]();await assert.rejects(first);assert.equal(closed[0].closes,1);assert.equal(loaded.hasAsset("detail"),false);
  resolvers[1]();await second;assert.equal(loaded.hasAsset("detail"),true);loaded.dispose();assert.equal(closed[1].closes,1);
});
