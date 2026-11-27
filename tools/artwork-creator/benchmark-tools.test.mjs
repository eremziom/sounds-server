import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {executeTool,fingerprint} from './benchmark-tools.mjs';
const run=path.resolve('.local/kre00/runs/contract-'+randomUUID());
const sample=path.resolve('apps/ui/public/infinite-zoom/samples/digital-grid/manifest.json');
const require=createRequire(path.resolve('apps/ui/package.json'));
const sharp=createRequire(require.resolve('next/package.json'))('sharp');
const arc={startSeconds:30,durationSeconds:120,path:{kind:'bezier',segments:[{control1:{x:400,y:-220},control2:{x:1200,y:160},to:{x:1700,y:0}}]},easing:'ease-in-out',orientToPath:true,pivot:{x:1646.4,y:432}};

test('real engine rejects zero period; valid retry changes only the beacon period in an isolated draft',async()=>{
  const before=await fingerprint();
  await assert.rejects(executeTool('setBeaconPeriod',{periodSeconds:0},path.join(run,'invalid')),/Invalid/);
  await assert.rejects(readFile(path.join(run,'invalid/draft-manifest.json')),/ENOENT/);
  const result=await executeTool('setBeaconPeriod',{periodSeconds:5},path.join(run,'valid'));
  assert.equal(result.frequencyHz,.2);
  assert.equal(result.previousFrequencyHz,1/6);
  const original=JSON.parse(await readFile(sample,'utf8'));
  const draft=JSON.parse(await readFile(path.join(run,'valid/draft-manifest.json'),'utf8'));
  original.layers.find(l=>l.id==='sky-aircraft-beacon').behaviors.find(b=>b.id==='navigation-flash').params.frequencyHz=.2;
  assert.deepEqual(draft,original);
  assert.deepEqual(await fingerprint(),before);
});
test('arc validates through engine; all separated parts travel together, source stays unchanged',async()=>{
  const before=await fingerprint();
  const result=await executeTool('setFlightPath',{travel:arc},path.join(run,'arc'));
  assert.deepEqual(result.layers,['sky-aircraft-wake','sky-aircraft','sky-aircraft-beacon']);
  const draft=JSON.parse(await readFile(path.join(run,'arc/draft-manifest.json'),'utf8'));
  for(const l of draft.layers.filter(l=>l.travel))assert.deepEqual(l.travel,arc);
  await assert.rejects(executeTool('setFlightPath',{travel:{...arc,durationSeconds:0}},path.join(run,'bad-arc')),/Invalid/);
  assert.deepEqual(await fingerprint(),before);
});
test('mask operation corrects exactly the deliberately inserted 3600 pixels',async()=>{
  const before=await fingerprint();
  await executeTool('visionFixture',{},path.join(run,'fixture'));
  const result=await executeTool('refineMask',{maskId:'front-wheel-test',rectangle:[40,40,100,100]},path.join(run,'mask'));
  assert.equal(result.changedPixels,3600);
  const originalPixels=await sharp(path.join(path.dirname(sample),'visible-front-wheel.png')).extractChannel(0).raw().toBuffer();
  const correctedPixels=await sharp(path.join(run,'mask/mask-corrected.png')).extractChannel(0).raw().toBuffer();
  assert.deepEqual(correctedPixels,originalPixels,'No pixels outside the inserted spill may change');
  await assert.rejects(executeTool('refineMask',{maskId:'other',rectangle:[40,40,100,100]},path.join(run,'wrong')),/Unknown/);
  assert.deepEqual(await fingerprint(),before);
});
test('paths and unsupported operations fail closed',async()=>{
  await assert.rejects(executeTool('setBeaconPeriod',{periodSeconds:5},path.resolve('apps/ui/public')),/isolated/);
  await assert.rejects(executeTool('setBeaconPeriod',{periodSeconds:5,code:'arbitrary'},path.join(run,'extra')),/Unsupported/);
  const limitation=await executeTool('reportUnsupported',{effect:'new shader'},path.join(run,'unsupported'));
  assert.equal(limitation.code,'UNSUPPORTED_EFFECT');assert.equal(limitation.recorded,true);assert.equal(limitation.ok,false);
  await assert.rejects(readFile(path.join(run,'unsupported/draft-manifest.json')),/ENOENT/);
});
