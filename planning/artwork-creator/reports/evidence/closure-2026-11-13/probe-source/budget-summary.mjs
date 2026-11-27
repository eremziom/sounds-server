export function summarizeBudget(samples,adapters,health){
  if(!samples.length||samples.some(s=>s.error))throw Error('Missing or failed memory telemetry');
  const target=adapters.find(a=>a.name.includes('7800 XT'));
  if(!target?.dedicated_video_bytes)throw Error('Target GPU capacity not identified');
  const usage=samples.map(s=>{
    const matches=s.adapters.filter(a=>a.Name.toLowerCase().startsWith(target.counter_key.toLowerCase()+'_phys_'));
    if(matches.length!==1)throw Error('Ambiguous/missing physical-adapter counter');
    return matches[0];
  });
  if(health.length<2||health.some(h=>h.paused||h.ended||h.contextLost||h.canvasCount!==1||h.audioCount!==1||h.status!=='running'))throw Error('Playback/renderer health failed');
  for(let i=1;i<health.length;i++)if(health[i].audioTime<health[i-1].audioTime||health[i].tick<health[i-1].tick)throw Error('Playback or journey restarted');
  if(health.at(-1).audioTime<=health[0].audioTime||health.at(-1).tick<=health[0].tick)throw Error('Playback or journey did not advance');
  return {gpu:target.name,gpuCapacityBytes:target.dedicated_video_bytes,
    observedMaxDedicatedBytes:Math.max(...usage.map(a=>Number(a.DedicatedUsage))),
    observedMinDedicatedHeadroomBytes:target.dedicated_video_bytes-Math.max(...usage.map(a=>Number(a.DedicatedUsage))),
    observedMaxSharedBytes:Math.max(...usage.map(a=>Number(a.SharedUsage))),
    systemRamBytes:Number(samples[0].osKiB.TotalVisibleMemorySize)*1024,
    observedMinAvailableRamBytes:Math.min(...samples.map(s=>Number(s.osKiB.FreePhysicalMemory)*1024)),
    observedMinCommitHeadroomBytes:Math.min(...samples.map(s=>Number(s.osKiB.FreeVirtualMemory)*1024)),
    samples:samples.length,maxSampleGapSeconds:Math.max(...samples.slice(1).map((s,i)=>s.elapsedSeconds-samples[i].elapsedSeconds),0),
    audioSecondsAdvanced:health.at(-1).audioTime-health[0].audioTime,simulationTicksAdvanced:health.at(-1).tick-health[0].tick,
    healthSamples:health.length,phases:[...new Set(samples.map(s=>s.phase))],
    note:'Sampled WDDM adapter usage includes all system processes; headroom is physical capacity minus observed usage, not an exact instantaneous peak or an allocation guarantee.'};
}
