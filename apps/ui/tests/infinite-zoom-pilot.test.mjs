import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createCameraController } from "../src/engines/infinite-zoom/camera/camera-controller.ts";
import { FULL_FRAME } from "../src/engines/infinite-zoom/camera/camera-math.ts";
import { parseArtworkPackage } from "../src/engines/infinite-zoom/artwork/artwork-package.ts";
import { createArtworkInstance } from "../src/engines/infinite-zoom/artwork/artwork-instance.ts";
import { defaultPilotControls, BEHAVIOR_KINDS } from "../src/engines/infinite-zoom/artwork/pilot-controls.ts";
import { artworkTextureBytes } from "../src/engines/infinite-zoom/resources/texture-budget.ts";
import { createLogicalRecorder } from "../src/engines/infinite-zoom/diagnostics/logical-replay.ts";

const manifest=parseArtworkPackage(JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/forest-pilot/manifest.json",import.meta.url),"utf8")));
test("pilot authors all twelve operators with complete references within the existing budget",()=>{
  assert.equal(manifest.schemaVersion,2);assert.equal(manifest.layers.length,13);
  assert.deepEqual(manifest.layers.flatMap(l=>l.behaviors.map(b=>b.kind)),BEHAVIOR_KINDS);
  assert.equal(manifest.layers[0].behaviors.length,0);assert.equal(manifest.portal,undefined);
  assert.ok(artworkTextureBytes(manifest)+3840*2160*4<256*1024*1024);
  assert.equal(new Set(defaultPilotControls().map(c=>c.kind)).size,12);
});
test("live strength controls preserve phase, package immutability and paused state",()=>{
  const a=createArtworkInstance("a",manifest),b=createArtworkInstance("b",manifest);
  for(let i=0;i<73;i++){a.stepBehaviors({dt:1/60});b.stepBehaviors({dt:1/60});}
  const before=JSON.stringify(a.getSnapshot()),source=JSON.stringify(manifest);
  for(const kind of BEHAVIOR_KINDS){a.setBehaviorStrength(kind,0);a.setBehaviorStrength(kind,1);}
  assert.equal(JSON.stringify(a.getSnapshot()),before);assert.equal(JSON.stringify(manifest),source);
  a.setBehaviorStrength("translate",0);assert.equal(a.getSnapshot().layers[1].groups[0].effects[0].x,0);
  a.setBehaviorStrength("translate",1);assert.equal(JSON.stringify(a.getSnapshot()),before);
  a.stepBehaviors({dt:1/60});b.stepBehaviors({dt:1/60});assert.deepEqual(a.getSnapshot().layers,b.getSnapshot().layers);
  for(const strength of [-1,NaN,Infinity,1.1])assert.throws(()=>a.setBehaviorStrength("wave",strength));
});
test("saved camera restores the exact remaining trajectory, bookmark and incoming velocity",()=>{
  const a=createCameraController(()=>true),b=createCameraController(()=>true);
  a.saveBookmark("source");b.saveBookmark("source");a.zoomIn(3,3);b.zoomIn(3,3);
  for(let i=0;i<73;i++){a.step();b.step();}
  const saved=a.captureState();a.reset();a.move(2000,1100,1);for(let i=0;i<60;i++)a.step();
  a.restoreState(saved);assert.deepEqual(a.getSnapshot(),b.getSnapshot());
  for(let i=0;i<120;i++){a.step();b.step();assert.deepEqual(a.getSnapshot(),b.getSnapshot());}
  a.returnTo("source",1);for(let i=0;i<60;i++)a.step();assert.deepEqual(a.getSnapshot().pose,FULL_FRAME);
  assert.ok(Object.isFrozen(saved.path));
});
test("stopping a recording preserves a replayable prefix across pilot ticks until explicit reset",()=>{
  const recorder=createLogicalRecorder(181,[{id:"forest",version:"0.1.0"}]);
  recorder.capture(1,null);recorder.stop();recorder.command("zoomIn");recorder.capture(100,null);
  assert.equal(recorder.export().complete,false);assert.equal(recorder.export().frames.length,1);
  recorder.reset();recorder.capture(1,null);assert.equal(recorder.export().complete,true);
});
