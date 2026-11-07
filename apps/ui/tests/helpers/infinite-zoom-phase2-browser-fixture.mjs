import { phase2Manifest, catalog } from "/phase2-data.mjs";
import { prepareArtwork } from "/engine/artwork/prepare-artwork.ts";
import { loadArtwork } from "/engine/artwork/artwork-loader.ts";
import { createArtworkInstance } from "/engine/artwork/artwork-instance.ts";
import { createArtworkRenderer } from "/engine/renderer/artwork-renderer.ts";
import { createCameraController } from "/engine/camera/camera-controller.ts";
import { FULL_FRAME } from "/engine/camera/camera-math.ts";
import { replayLogicalJourney } from "/engine/diagnostics/logical-replay.ts";
import { createAudioModulation } from "/engine/modulation/audio-modulation.ts";
import { check, pixels, hash, opaque, waitFor } from "/fixture.mjs";

const viewport={width:384,height:216,dpr:1,renderScale:1};
const stepContext=tick=>({tick,timeSeconds:tick/60,dt:1/60,random:()=>0.5});
async function decode(asset,signal) {
  signal.throwIfAborted();
  const canvas=new OffscreenCanvas(asset.width,asset.height),ctx=canvas.getContext("2d");
  if(asset.id==="backdrop") {ctx.fillStyle="#142341";ctx.fillRect(0,0,canvas.width,canvas.height);}
  else if(asset.kind==="mask") {
    const gradient=ctx.createLinearGradient(0,0,canvas.width,0);gradient.addColorStop(0,"black");gradient.addColorStop(1,"white");
    ctx.fillStyle=gradient;ctx.fillRect(0,0,canvas.width,canvas.height);
  } else if(asset.kind==="depth") {ctx.fillStyle="#cccccc";ctx.fillRect(0,0,canvas.width,canvas.height);}
  else if(asset.kind==="flow") {ctx.fillStyle="rgb(255,128,0)";ctx.fillRect(0,0,canvas.width,canvas.height);}
  else {
    ctx.fillStyle=asset.id==="detail"?"#4ae663":"#c84b30";ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let x=0;x<canvas.width;x+=8) {ctx.fillStyle="#eee0a0";ctx.fillRect(x,0,2,canvas.height);}
    ctx.fillStyle="#345ad0";ctx.fillRect(0,canvas.height/3,canvas.width,5);
    ctx.fillStyle="#ffffff";ctx.fillRect(canvas.width*0.625-2,canvas.height/3-2,4,4);
  }
  const image=await createImageBitmap(canvas,{imageOrientation:"flipY",premultiplyAlpha:"none",colorSpaceConversion:"none"});
  canvas.width=canvas.height=1;
  return {width:asset.width,height:asset.height,opaque:true,image,close(){image.close();}};
}

window.runPhase2Renderer=async()=>{
  const results=[],errors=[];let maximumLandmarkError=0;
  let canvas;
  const freshCanvas=()=>{canvas?.remove();canvas=document.createElement("canvas");document.body.append(canvas);};
  freshCanvas();
  const pose={...FULL_FRAME,x:2240,logScale:0.5};
  const landmark=frame=>{
    let x=0,y=0,count=0;
    for(let row=0;row<canvas.height;row++)for(let col=0;col<canvas.width;col++) {
      const i=(row*canvas.width+col)*4;
      if(frame[i]>230&&frame[i+1]>230&&frame[i+2]>230){x+=col+0.5;y+=row+0.5;count++;}
    }
    check(count>0,"White landmark remains visible");return {x:x/count,y:y/count};
  };
  const forward=behavior=>{
    let x=2400,y=720;const p=behavior.params;
    switch(behavior.kind) {
      case "translate":x+=p.x;y+=p.y;break;
      case "rotate":{const dx=x-p.pivotX,dy=y-p.pivotY;x=p.pivotX+Math.cos(p.radians)*dx-Math.sin(p.radians)*dy;y=p.pivotY+Math.sin(p.radians)*dx+Math.cos(p.radians)*dy;break;}
      case "scale":x=p.pivotX+(x-p.pivotX)*(1+p.x);y=p.pivotY+(y-p.pivotY)*(1+p.y);break;
      case "wave":x+=p.amplitude*Math.sin(y*2*Math.PI/p.wavelength+p.phase);break;
      case "bend":x+=p.amount*Math.min(1,Math.abs(y-p.pivotY)/2160)**2;break;
      case "parallax":x+=p.amount*(pose.x-1920)/1920*(0.8-p.referenceDepth);break;
      case "displace":case "flow":x+=p.amplitude;y+=p.amplitude*(128/255*2-1);break;
    }
    return {x:(x-pose.x)*Math.exp(pose.logScale)*viewport.width/3840+viewport.width/2,
      y:(pose.y-y)*Math.exp(pose.logScale)*viewport.height/2160+viewport.height/2};
  };
  for(const original of catalog) {
    const behavior=structuredClone(original);
    if(behavior.kind==="rotate")behavior.params.radians=0.06;
    if(behavior.kind==="scale"){behavior.params.x=0.08;behavior.params.y=0.04;}
    if(behavior.kind==="parallax")behavior.params.amount=120;
    const manifest=phase2Manifest([behavior]);
    const loaded=await loadArtwork(manifest,new AbortController().signal,decode);
    const instance=createArtworkInstance("phase2",loaded.manifest),camera=createCameraController(()=>true,pose);
    const renderer=createArtworkRenderer(canvas,loaded,instance,{viewport,camera,onAvailabilityChange(){},onError(e){errors.push(String(e));}});
    try {
      const active=pixels(canvas,renderer.render);opaque(active);
      const neutral=await loadArtwork(phase2Manifest([]),new AbortController().signal,decode);
      const base=createArtworkInstance("neutral",neutral.manifest);
      try {
        renderer.attach(neutral,base);renderer.setComposition({sourceId:"neutral"});
        const baseline=pixels(canvas,renderer.render);opaque(baseline);
        check(hash(active)!==hash(baseline),`${behavior.kind} actually changes GPU pixels`);
        if(!["pulse","opacity","colorShift","glow"].includes(behavior.kind)) {
          const actual=landmark(active),expected=forward(behavior),error=Math.hypot(actual.x-expected.x,actual.y-expected.y);
          check(error<0.9,`${behavior.kind} landmark follows authored transform, error ${error}`);
          maximumLandmarkError=Math.max(maximumLandmarkError,error);
        }
        renderer.setComposition({sourceId:"phase2"});
        const initial=hash(pixels(canvas,renderer.render));
        for(let tick=1;tick<=60;tick++)instance.stepBehaviors(stepContext(tick));
        if(behavior.kind!=="parallax")check(hash(pixels(canvas,renderer.render))!==initial,`${behavior.kind} evolves on the fixed clock`);
        const frozen=hash(pixels(canvas,renderer.render));
        check(hash(pixels(canvas,renderer.render))===frozen,`${behavior.kind} does not evolve on render`);
        instance.reset();check(hash(pixels(canvas,renderer.render))===initial,`${behavior.kind} reset restores exact pixels`);
      } finally {renderer.setComposition({sourceId:"phase2"});renderer.detach("neutral");neutral.dispose();}
      results.push(behavior.kind);
    } finally {renderer.dispose();loaded.dispose();freshCanvas();}
  }

  // Real depth/flow samplers, inherited gradient region and every shader together.
  const manifest=phase2Manifest();manifest.layers[1].regions=[{id:"edge",influenceMaskAssetId:"mask",constraints:{softStrength:0.4},behaviors:[]}];
  let lease=await prepareArtwork({canvas,manifest,instanceId:"combined",viewport,decode,onAvailabilityChange(){},onError(e){errors.push(String(e));}},new AbortController().signal);
  try {
    lease.camera.zoomIn(1.25,1);for(let tick=1;tick<=90;tick++)lease.step(stepContext(tick));opaque(pixels(canvas,lease.render));
    const state=JSON.stringify(lease.instance.getSnapshot()),before=hash(pixels(canvas,lease.render));
    const ext=canvas.getContext("webgl2").getExtension("WEBGL_lose_context");ext.loseContext();await waitFor(()=>!lease.getDiagnostics().available);
    ext.restoreContext();await waitFor(()=>lease.getDiagnostics().available||errors.length);
    check(errors.length===0,errors.join(";"));check(state===JSON.stringify(lease.instance.getSnapshot()),"All behavior phases survive context loss");
    check(hash(pixels(canvas,lease.render))===before,"Depth, flow, gradients and 12 operators recover identical pixels");
  } finally {lease.dispose();freshCanvas();}

  // Detail is optional, budgeted, recoverable and frozen during critical handoff.
  const detail=phase2Manifest([]);detail.layers[1].lods=[{assetId:"detail",minPixelsPerTexel:1}];
  let detailDecodes=0;
  lease=await prepareArtwork({canvas,manifest:detail,instanceId:"detail",viewport,decode:async(a,s)=>{if(!a.critical)detailDecodes++;return decode(a,s);},onAvailabilityChange(){},onError(e){errors.push(String(e));}},new AbortController().signal);
  try {
    await waitFor(()=>lease.getDiagnostics().optionalPending===0);const detailed=pixels(canvas,lease.render);opaque(detailed);
    check(detailDecodes===1,"Projected magnification loads optional detail once");
    const highBytes=lease.getDiagnostics().estimatedTextureBytes;
    lease.setDetailEnabled(false);const base=pixels(canvas,lease.render);opaque(base);
    check(hash(base)!==hash(detailed),"Detail really replaces sampled pixels");check(lease.getDiagnostics().estimatedTextureBytes<highBytes,"Quality downgrade releases optional resources");
    lease.setDetailEnabled(true);lease.render();await waitFor(()=>lease.getDiagnostics().optionalPending===0);check(detailDecodes===2,"Optional detail reloads after eviction");
  } finally {lease.dispose();freshCanvas();}
  lease=await prepareArtwork({canvas,manifest:detail,instanceId:"budget",viewport,gpuBudgetBytes:500000,decode:async(a,s)=>{check(a.critical,"Budget blocks optional decoding before allocation");return decode(a,s);},onAvailabilityChange(){},onError(e){errors.push(String(e));}},new AbortController().signal);
  try {opaque(pixels(canvas,lease.render));check(lease.getDiagnostics().optionalPending===0,"Budget retains valid base composition");}
  finally {lease.dispose();freshCanvas();}

  // Reproduce the actual journey command implementation, with audio modulation.
  const recorderOptions={manifest:phase2Manifest([catalog[0],catalog[8]]),instanceId:"recorded",viewport,decode,onAvailabilityChange(){},onError(e){errors.push(String(e));}};
  let modulation=createAudioModulation();
  lease=await prepareArtwork({canvas,...recorderOptions,recordLogical:true,seed:181,modulation:()=>modulation.getSnapshot()},new AbortController().signal);
  let recording,snapshot;
  try {
    for(let tick=1;tick<=150;tick++) {
      if(tick===10)lease.command("zoomIn");if(tick===70)lease.command("hold");
      modulation.step({bass:tick/150,mid:0.5,high:0.1},1/60);lease.step(stepContext(tick));
    }
    recording=lease.exportReplay();snapshot=JSON.stringify({camera:lease.camera.getSnapshot(),artwork:lease.instance.getSnapshot()});
  } finally {lease.dispose();freshCanvas();}
  modulation=createAudioModulation();
  lease=await prepareArtwork({canvas,...recorderOptions,modulation:()=>modulation.getSnapshot()},new AbortController().signal);
  try {
    replayLogicalJourney(recording,{packages:lease.getPackages(),command:c=>lease.command(c),step(context,signals){modulation.step(signals,context.dt);lease.step(context);}});
    check(snapshot===JSON.stringify({camera:lease.camera.getSnapshot(),artwork:lease.instance.getSnapshot()}),"Recorded real camera commands and normalized audio reproduce exact journey logic");
  } finally {lease.dispose();freshCanvas();}
  const ring=["a","b","c"].map((id,index)=>{
    const manifest=phase2Manifest();manifest.id=id;
    manifest.portal={id:"portal",region:{x:1920,y:1080,radiusX:90,radiusY:48,rotation:0,feather:0.24},scale:0.055,
      durationSeconds:1,destinationCamera:"stop-at-full-frame",destination:{manifestUri:`/infinite-zoom/${["b","c","a"][index]}/manifest.json`,artworkId:["b","c","a"][index],version:"0.1.0",anchorId:"center"}};
    return manifest;
  });
  const ringOptions={manifest:ring[0],instanceId:"ring",viewport:{...viewport,width:128,height:72},decode,
    resolveManifest:async uri=>ring.find(m=>uri===`/infinite-zoom/${m.id}/manifest.json`),onAvailabilityChange(){},onError(e){errors.push(String(e));}};
  modulation=createAudioModulation();
  lease=await prepareArtwork({canvas,...ringOptions,recordLogical:true,modulation:()=>modulation.getSnapshot()},new AbortController().signal);
  const sequence=[];
  try {
    for(let tick=1;tick<=300;tick++) {
      if(tick===1||tick===130)lease.setLoop(true);if(tick===100)lease.setLoop(false);
      modulation.step({bass:tick/300,mid:0.3,high:0.2},1/60);const before=lease.instance.manifest.id;lease.step(stepContext(tick));
      if(before!==lease.instance.manifest.id)sequence.push(lease.instance.manifest.id);
    }
    check(sequence.slice(0,3).join(",")==="b,c,a","Recorded ring actually completes A-B-C-A");
    recording=lease.exportReplay();snapshot=JSON.stringify(lease.getLogicalSnapshot());
  } finally {lease.dispose();freshCanvas();}
  modulation=createAudioModulation();
  lease=await prepareArtwork({canvas,...ringOptions,modulation:()=>modulation.getSnapshot()},new AbortController().signal);
  try {
    replayLogicalJourney(recording,{packages:lease.getPackages(),command:c=>lease.command(c),step(context,signals){modulation.step(signals,context.dt);lease.step(context);}});
    check(snapshot===JSON.stringify(lease.getLogicalSnapshot()),"Loop stop/resume, handoffs, all three artwork phases and audio replay exactly");
  } finally {lease.dispose();canvas.remove();}
  return {operators:results,maximumLandmarkError,combinedContextRecovery:true,optionalDetail:true,budgetFallback:true,logicalReplay:true,ringReplay:sequence};
};
