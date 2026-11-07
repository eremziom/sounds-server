import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {parseArtworkPackage} from "../src/engines/infinite-zoom/artwork/artwork-package.ts";
import {createArtworkInstance} from "../src/engines/infinite-zoom/artwork/artwork-instance.ts";

const source=JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/foundation/manifest.json",import.meta.url),"utf8"));
function sample(){const value=structuredClone(source);value.schemaVersion=2;value.layers[1].spin={pivotX:910,pivotY:1320,turnsPerSecond:.075,phaseTurns:.03};return value;}
const step=instance=>instance.stepBehaviors({dt:1/60});
function hub(layer,pivot){
  const x=pivot.x-1920,y=pivot.y-1080,c=Math.cos(layer.rotation),s=Math.sin(layer.rotation);
  return{x:1920+layer.x+layer.scale*(c*x-s*y),y:1080+layer.y+layer.scale*(s*x+c*y)};
}
test("rigid spin keeps an off-center hub fixed through full revolutions without deformation",()=>{
  const manifest=parseArtworkPackage(sample()),instance=createArtworkInstance("spin",manifest);
  for(let i=0;i<3600;i++){
    step(instance);const layer=instance.getSnapshot().layers[1],point=hub(layer,{x:910,y:1320});
    assert.ok(Math.abs(point.x-910)<1e-8&&Math.abs(point.y-1320)<1e-8);assert.equal(layer.scale,1);
  }
  assert.ok(Object.isFrozen(manifest.layers[1].spin));
});
test("spin speed controls freeze in place and resume without an angle snap; reset restores authored phase",()=>{
  const manifest=parseArtworkPackage(sample()),a=createArtworkInstance("a",manifest),b=createArtworkInstance("b",manifest);
  for(let i=0;i<123;i++){step(a);step(b);}
  a.setBehaviorStrength("rotate",0);const pose=a.getSnapshot().layers[1];
  for(let i=0;i<120;i++)step(a);
  for(const key of ["x","y","rotation"])assert.equal(a.getSnapshot().layers[1][key],pose[key]);
  a.setBehaviorStrength("rotate",1);
  for(let i=0;i<60;i++){step(a);step(b);}
  for(const key of ["x","y","rotation"])assert.equal(a.getSnapshot().layers[1][key],b.getSnapshot().layers[1][key]);
  a.reset();assert.equal(a.getSnapshot().layers[1].rotation,.03*2*Math.PI);
  a.setBehaviorStrength("rotate",.5);step(a);
  assert.ok(Math.abs(a.getSnapshot().layers[1].rotation-(.03*2*Math.PI+.075*2*Math.PI/120))<1e-12);
});
test("spin rejects unsafe coverage motion, malformed data and schema 1 extensions",()=>{
  for(const mutate of [v=>v.schemaVersion=1,v=>v.layers[0].spin=v.layers[1].spin,v=>v.layers[1].spin.pivotX=4000,v=>v.layers[1].spin.turnsPerSecond=1,v=>v.layers[1].spin.phaseTurns=NaN,v=>v.layers[1].spin.extra=true]){
    const value=sample();mutate(value);assert.throws(()=>parseArtworkPackage(value));
  }
});
