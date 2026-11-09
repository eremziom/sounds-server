import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseBehaviors} from '../src/engines/infinite-zoom/behaviors/behavior-contract.ts';
import {createBehaviorEvaluator} from '../src/engines/infinite-zoom/behaviors/behavior-evaluator.ts';
import {createAttackColorWave,MAX_ATTACK_COLOR_WAVES} from '../src/engines/infinite-zoom/behaviors/attack-color-wave.ts';
import {buildBehaviorShader,behaviorUniform} from '../src/engines/infinite-zoom/behaviors/behavior-shader.ts';
import {createLogicalRecorder,replayLogicalJourney,validateRecording} from '../src/engines/infinite-zoom/diagnostics/logical-replay.ts';
const config={travelSeconds:.8,pulseSeconds:.24,startY:.4,endY:0,baseIntensity:.45,palette:[[1,0,0],[0,1,0],[0,0,1]]};
const descriptor={id:'wave',kind:'colorShift',order:0,params:{frequencyHz:0,phase:0,hue:0,saturation:0,lightness:0,attackWave:config}};
test('each detector event starts a new color even for weaker overlapping bass attacks, without restarting prior waves',()=>{
  const wave=createAttackColorWave(config);let token=0;
  for(let i=0;i<4;i++){
    token=1-token;wave.step({kick:i? .01:1,kickEvent:token});
    const active=wave.getSnapshot();assert.equal(active.length,i+1);assert.deepEqual(active.at(-1).color,config.palette[i%3]);assert.equal(active.at(-1).ageSeconds,0);
    for(let n=0;n<3;n++)wave.step({kick:0,kickEvent:token});
  }
  const before=wave.getSnapshot();assert.deepEqual(wave.getSnapshot(),before,'Reading/rendering does not advance wave time');
  assert.ok(before[0].ageSeconds>before.at(-1).ageSeconds);
  for(let n=0;n<70;n++)wave.step({kick:0,kickEvent:token});assert.equal(wave.getSnapshot().length,0);
  wave.reset();wave.step({kick:1,kickEvent:1});assert.deepEqual(wave.getSnapshot()[0].color,config.palette[0]);
});
test('all supported 40 ms detector attacks fit bounded memory; missing analysis cannot manufacture events',()=>{
  const wave=createAttackColorWave({...config,travelSeconds:1});let token=0,max=0;
  for(let tick=0;tick<12000;tick++){
    const hit=tick%3===0;if(hit)token=1-token;wave.step({kick:hit?1:0,kickEvent:token});max=Math.max(max,wave.getSnapshot().length);
  }
  assert.ok(max>20&&max<=MAX_ATTACK_COLOR_WAVES);wave.step(undefined);assert.equal(wave.getSnapshot().length,0);
  wave.step({kick:0,kickEvent:1-token});assert.equal(wave.getSnapshot().length,0,'A stale token without an active attack is ignored');
});
test('wave parameters validate direction, palette, lifetime and isolation from old periodic/modulation behavior',()=>{
  assert.ok(parseBehaviors([descriptor])[0].params.attackWave);
  for(const patch of [{travelSeconds:0},{travelSeconds:1.1},{pulseSeconds:.3},{startY:0},{palette:[[1,0,2],[0,1,0]]},{palette:[[1,1,1]]},{baseIntensity:2},{extra:true}]){
    assert.throws(()=>parseBehaviors([{...descriptor,params:{...descriptor.params,attackWave:{...config,...patch}}}]));
  }
  assert.throws(()=>parseBehaviors([{...descriptor,params:{...descriptor.params,frequencyHz:1}}]));
  assert.throws(()=>parseBehaviors([{...descriptor,params:{...descriptor.params,hue:1}}]));
  assert.throws(()=>parseBehaviors([{...descriptor,modulation:[]}])) ;
  const evaluator=createBehaviorEvaluator([{id:'layer',behaviors:parseBehaviors([descriptor])}]);evaluator.step(1/60,1,{kick:1,kickEvent:1});
  const effect=evaluator.getSnapshot()[0].effects[0],shader=buildBehaviorShader(evaluator.getSnapshot()),uniform=behaviorUniform(effect);
  assert.equal(uniform.length,4*(MAX_ATTACK_COLOR_WAVES+1));assert.equal(shader.masks.length,0,'Wave needs no new mask or sampler');
  assert.match(shader.colorBody,/vUv.y/);assert.match(shader.colorBody,/for\(int n=1/);
  evaluator.setBehaviorStrength('colorShift',0);assert.equal(evaluator.getSnapshot()[0].effects[0].waveStrength,0);
});
test('alternating event tokens survive logical recording and replay with identical overlapping wave state',()=>{
  const identities=[{id:'test',version:'1'}],recorder=createLogicalRecorder(1,identities),first=createAttackColorWave(config),snapshots=[];let token=0;
  for(let tick=1;tick<=80;tick++){
    const hit=tick%9===0;if(hit)token=1-token;const signals={kick:hit ? .5 : 0,kickEvent:token};
    recorder.capture(tick,signals);first.step(signals);snapshots.push(first.getSnapshot());
  }
  const recording=validateRecording(recorder.export()),replayed=createAttackColorWave(config);
  replayLogicalJourney(recording,{packages:identities,command(){},step(context,signals){replayed.step(signals);assert.deepEqual(replayed.getSnapshot(),snapshots[context.tick-1]);}});
  const invalid=structuredClone(recording);invalid.frames[0].signals.kickEvent=.5;assert.throws(()=>validateRecording(invalid));
  assert.throws(()=>createLogicalRecorder(1,identities).capture(1,{kickEvent:.5}));
});
