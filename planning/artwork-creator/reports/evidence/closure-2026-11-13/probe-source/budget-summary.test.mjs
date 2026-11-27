import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeBudget} from './budget-summary.mjs';
const adapter={name:'AMD Radeon RX 7800 XT',counter_key:'luid_0x0_0x1',dedicated_video_bytes:16*2**30};
const sample=(t,used)=>({elapsedSeconds:t,phase:'generator',osKiB:{TotalVisibleMemorySize:32*2**20,FreePhysicalMemory:8*2**20,FreeVirtualMemory:20*2**20},
 adapters:[{Name:'luid_0x0_0x1_phys_0',DedicatedUsage:used,SharedUsage:100},{Name:'luid_other_phys_0',DedicatedUsage:999999999999,SharedUsage:0}]});
const healthy=(t)=>({audioTime:t,tick:t*60,paused:false,ended:false,contextLost:false,canvasCount:1,audioCount:1,status:'running'});
test('attributes memory to DXGI LUID without summing unrelated adapters',()=>{
 const result=summarizeBudget([sample(0,8*2**30),sample(2,12*2**30)],[adapter],[healthy(1),healthy(3)]);
 assert.equal(result.observedMinDedicatedHeadroomBytes,4*2**30);assert.equal(result.maxSampleGapSeconds,2);
 assert.equal(result.observedMinAvailableRamBytes,8*2**30);
});
test('rejects a stopped player, context loss, failed telemetry and ambiguous counters',()=>{
 const samples=[sample(0,1),sample(1,2)];
 for(const patch of [{paused:true},{contextLost:true},{status:'error'}])assert.throws(()=>summarizeBudget(samples,[adapter],[healthy(0),{...healthy(1),...patch}]),/health failed/);
 assert.throws(()=>summarizeBudget([{error:'access denied'}],[adapter],[healthy(0),healthy(1)]),/telemetry/);
 const duplicate=sample(0,1);duplicate.adapters.push(duplicate.adapters[0]);
 assert.throws(()=>summarizeBudget([duplicate],[adapter],[healthy(0),healthy(1)]),/Ambiguous/);
});
