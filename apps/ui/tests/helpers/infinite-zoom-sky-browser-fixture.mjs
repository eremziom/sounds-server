import {prepareArtwork} from "/engine/artwork/prepare-artwork.ts";
import {withSceneReveal,createSceneReveal} from "/adapter/scene-reveal.ts";
import {pixels,hash,opaque,check,waitFor} from "/fixture.mjs";

window.runSkyLighting=async(highPrecisionColor=false)=>{
  const manifest=withSceneReveal(await(await fetch("/infinite-zoom/samples/insectoid-planet/manifest.json")).json());
  const canvas=document.createElement("canvas");document.body.append(canvas);window.skyCaptures={};
  let lease,tick=0,highAttack=0;const errors=[];
  const tolerance=highPrecisionColor?1:0;
  const delta=(a,b)=>{let result=0;for(let i=0;i<a.length;i++)result=Math.max(result,Math.abs(a[i]-b[i]));return result;};
  const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>.5});
  const capture=name=>{lease.render();window.skyCaptures[name]=canvas.toDataURL("image/png");};
  const isolate=()=>{for(const layer of lease.instance.manifest.layers)lease.instance.setLayerTransform(layer.id,{opacity:["fixed-world","sky-high-attack"].includes(layer.id)?1:0});};
  try{
    lease=await prepareArtwork({canvas,manifest,instanceId:"sky-review",viewport:{width:960,height:540,dpr:1,renderScale:1},highPrecisionColor,
      modulation:()=>({strength:1,intensity:1,signals:{highAttack}}),onAvailabilityChange(){},onError:e=>errors.push(String(e))},new AbortController().signal);
    const gl=canvas.getContext("webgl2");isolate();
    lease.instance.setLayerTransform("sky-high-attack",{opacity:0});const baseline=pixels(canvas,lease.render);
    lease.instance.setLayerTransform("sky-high-attack",{opacity:1});const initial=pixels(canvas,lease.render),zeroDelta=delta(initial,baseline);check(zeroDelta<=tolerance,`Zero emission adds no visible plate: ${zeroDelta}`);capture("silent");
    highAttack=1;for(let i=0;i<4;i++)step();const peak=pixels(canvas,lease.render);opaque(peak);capture("peak");
    const mask=new Image();mask.src="/infinite-zoom/samples/insectoid-planet/visible-sky.png";await mask.decode();
    const stencil=document.createElement("canvas");stencil.width=canvas.width;stencil.height=canvas.height;
    const pen=stencil.getContext("2d",{willReadFrequently:true});pen.drawImage(mask,0,0,stencil.width,stencil.height);const support=pen.getImageData(0,0,stencil.width,stencil.height).data;
    const sectors=Array(8).fill(0);let outsideMax=0;
    for(let y=2;y<canvas.height-2;y++)for(let x=2;x<canvas.width-2;x++){
      const i=((canvas.height-1-y)*canvas.width+x)*4,delta=Math.max(...[0,1,2].map(c=>Math.abs(peak[i+c]-baseline[i+c])));
      if(delta>8)sectors[Math.floor(x*8/canvas.width)]++;
      let near=false;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(support[((y+dy)*canvas.width+x+dx)*4])near=true;
      if(!near)outsideMax=Math.max(outsideMax,delta);
    }
    check(sectors.every(value=>value>500),`Light spans the sky: ${sectors}`);check(outsideMax<=tolerance,`Protected world unchanged: ${outsideMax}`);
    const frozen=hash(peak);for(let i=0;i<10;i++)lease.render();check(hash(pixels(canvas,lease.render))===frozen,"Pause preserves sky flash");
    highAttack=0;for(let i=0;i<90;i++)step();check(delta(pixels(canvas,lease.render),baseline)<=tolerance,"Flash relaxes to baseline");
    const reveal=createSceneReveal();reveal.setEnabled(true,lease.instance);lease.instance.setLayerTransform("reveal-lava",{opacity:0});
    const black=pixels(canvas,lease.render);for(let i=0;i<black.length;i+=4)check(black[i]<=tolerance&&black[i+1]<=tolerance&&black[i+2]<=tolerance,"Environment can be fully black");
    highAttack=1;for(let i=0;i<4;i++)step();check(hash(pixels(canvas,lease.render))!==hash(black),"Sky lights work above the curtain from darkness");capture("blackout-peak");
    reveal.setEnabled(false,lease.instance);isolate();
    // Six seconds of explicit 100 ms impulses, exported as an actual motion clip.
    const stream=canvas.captureStream(0),chunks=[],recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp9"});
    recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
    for(let frame=0;frame<180;frame++){
      for(let n=0;n<2;n++){const age=(tick%12)/60*1000;highAttack=age<100?(1-age/100)**2:0;step();}
      lease.render();stream.getVideoTracks()[0].requestFrame();
      if(frame%30===0)capture(`motion-${frame}`);await new Promise(resolve=>setTimeout(resolve,33));
    }
    await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
    window.skyMotionData=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:"video/webm"}));});
    highAttack=1;lease.camera.retarget({x:2200,y:550,rotation:0,logScale:1.2},3);
    for(let i=0;i<180;i++)step();opaque(pixels(canvas,lease.render));capture("zoom-peak");
    lease.instance.setBehaviorStrength("glow",0);const noLight=pixels(canvas,lease.render);lease.instance.setLayerTransform("sky-high-attack",{opacity:0});check(delta(pixels(canvas,lease.render),noLight)<=tolerance,"Glow control disables sky light");
    lease.instance.setLayerTransform("sky-high-attack",{opacity:1});lease.instance.setBehaviorStrength("glow",1);
    const before=hash(pixels(canvas,lease.render)),extension=gl.getExtension("WEBGL_lose_context");extension.loseContext();await waitFor(()=>!lease.getDiagnostics().available);extension.restoreContext();await waitFor(()=>lease.getDiagnostics().available);
    check(hash(pixels(canvas,lease.render))===before,"Emission blend survives context recovery");check(errors.length===0,"No resource or shader errors");
    return{sectors,outsideMax,zeroDelta,highPrecisionColor,colorBuffer:lease.getDiagnostics().colorBuffer,release:true,pause:true,blackout:true,motionSeconds:6,zoom:true,contextRecovery:true,control:true};
  }finally{lease?.dispose();canvas.remove();}
};
