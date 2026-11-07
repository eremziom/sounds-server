import {prepareArtwork} from "/engine/artwork/prepare-artwork.ts";
import {createSceneReveal,withSceneReveal} from "/adapter/scene-reveal.ts";
import {setRimLightingVisibility} from "/adapter/rim-lighting.ts";
import {pixels,hash,opaque,check,waitFor} from "/fixture.mjs";

window.runSceneReveal=async()=>{
  // Compare actual display-space steps with the old low-precision compositor.
  const precision=[];
  for(const mode of ["standard","high","budget-fallback","capability-fallback"]){
    const highPrecisionColor=mode!=="standard",fallback=mode.endsWith("fallback"),gpuBudgetBytes=mode==="budget-fallback" ? 60000 : undefined;
    const canvas=document.createElement("canvas");document.body.append(canvas);
    if(mode==="capability-fallback"){
      const gl=canvas.getContext("webgl2"),getExtension=gl.getExtension.bind(gl);
      gl.getExtension=name=>name==="EXT_color_buffer_float"||name==="EXT_color_buffer_half_float" ? null : getExtension(name);
    }
    const manifest={schemaVersion:2,id:"precision",version:"1",canvas:{width:3840,height:2160},assets:[
      {id:"field",kind:"image",uri:"/infinite-zoom/samples/foundation/precision-test.svg",width:16,height:9,critical:true},
      {id:"black",kind:"image",uri:"/infinite-zoom/samples/insectoid-planet/reveal-black.svg",width:16,height:9,critical:true},
    ],layers:[{id:"base",zIndex:0,imageAssetId:"field"},{id:"curtain",zIndex:1,imageAssetId:"black"}],coverage:{baseLayerId:"base"}};
    const lease=await prepareArtwork({canvas,manifest,instanceId:"precision",viewport:{width:160,height:90,dpr:1,renderScale:1},highPrecisionColor,gpuBudgetBytes,onAvailabilityChange(){},onError:e=>{throw e;}},new AbortController().signal);
    try {
      const levels=[];
      for(let tick=0;tick<=600;tick+=5){
        const t=tick/3600;lease.instance.setLayerTransform("curtain",{opacity:.995*(1-t*t*(3-2*t))});
        const frame=pixels(canvas,lease.render);let sum=0;
        for(let y=25;y<57;y++)for(let x=50;x<82;x++){const i=(y*canvas.width+x)*4;sum+=frame[i]+frame[i+1]+frame[i+2];}
        levels.push(sum/(32*32*3));
      }
      const maxJump=Math.max(...levels.slice(1).map((v,i)=>Math.abs(v-levels[i]))),unique=new Set(levels.map(v=>v.toFixed(3))).size;
      precision.push({mode,maxJump,unique,diagnostics:lease.getDiagnostics()});
      check(lease.getDiagnostics().estimatedTargetBytes===160*90*(highPrecisionColor&&!fallback?8:4),"Target memory reflects its actual format");
      if(highPrecisionColor&&!fallback){check(maxJump<.5&&unique>40,`Smooth shadow ramp: ${maxJump}, ${unique}`);check(lease.getDiagnostics().colorBuffer==="rgba16f","High precision is available");}
      else if(!highPrecisionColor)check(maxJump>5&&unique<10,"Regression reproduces the original shadow jumps");
      if(mode==="budget-fallback"){
        check(lease.getDiagnostics().colorBuffer==="rgba8","Tight budget retains readiness with standard precision");
        lease.resize({width:80,height:45,dpr:1,renderScale:1});opaque(pixels(canvas,lease.render));
        check(lease.getDiagnostics().colorBuffer==="rgba16f","Smaller viewport restores precision within budget");
        lease.resize({width:160,height:90,dpr:1,renderScale:1});opaque(pixels(canvas,lease.render));
        check(lease.getDiagnostics().colorBuffer==="rgba8","Larger viewport falls back without losing coverage");
      }
    }finally{lease.dispose();canvas.remove();}
  }
  const [forest,artwork]=await Promise.all(["forest","insectoid-planet"].map(async id=>(await fetch(`/infinite-zoom/samples/${id}/manifest.json`)).json()));
  const canvas=document.createElement("canvas");document.body.append(canvas);
  const reveal=createSceneReveal();let lease,tick=0;const errors=[];
  window.revealCaptures={};
  const capture=name=>{lease.render();window.revealCaptures[name]=canvas.toDataURL("image/png");};
  const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>.5});
  const sample=(frame,x,y)=>{const i=((canvas.height-1-Math.floor(y*canvas.height/941))*canvas.width+Math.floor(x*canvas.width/1672))*4;return frame[i]+frame[i+1]+frame[i+2];};
  try {
    lease=await prepareArtwork({canvas,manifest:forest,instanceId:"reveal-review",viewport:{width:1280,height:720,dpr:1,renderScale:1},highPrecisionColor:true,evaluate:instance=>reveal.step(instance),onAvailabilityChange(){},onError:e=>errors.push(String(e))},new AbortController().signal);
    await lease.selectScene("alien",withSceneReveal(artwork));
    reveal.apply(lease.instance);setRimLightingVisibility(lease.instance,true);
    lease.setPilotPreset("all");
    const normal=pixels(canvas,lease.render);capture("normal");
    reveal.setEnabled(true,lease.instance);const dark=pixels(canvas,lease.render);opaque(dark);capture("0s");
    check(sample(dark,800,150)<sample(normal,800,150)*.05,"Unlit sky starts nearly black");
    const paused=hash(dark),state=reveal.getSnapshot();
    for(let i=0;i<20;i++)lease.render();
    check(hash(pixels(canvas,lease.render))===paused&&reveal.getSnapshot().progress===state.progress,"Presentation cannot advance reveal");
    // The protected copy must respond even before the curtain starts lifting.
    lease.setPilotPreset("colorShift");reveal.restart(lease.instance);
    const colored=pixels(canvas,lease.render);lease.setPilotControl("colorShift",false,1);
    const neutral=pixels(canvas,lease.render);let lavaColorDelta=0;
    for(let y=370;y<580;y++)for(let x=130;x<500;x++){const i=(y*canvas.width+x)*4;lavaColorDelta+=Math.abs(colored[i]-neutral[i])+Math.abs(colored[i+1]-neutral[i+1])+Math.abs(colored[i+2]-neutral[i+2]);}
    check(lavaColorDelta>10000,`Lava changes color at initial darkness: ${lavaColorDelta}`);
    lease.setPilotPreset("all");
    const stream=canvas.captureStream(0),chunks=[],recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp9"});
    recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
    // 600 frames at 30 fps: a labelled 3x preview of the full 60-second simulation.
    for(let frame=1;frame<=600;frame++) {
      for(let i=0;i<6;i++)step();
      lease.render();stream.getVideoTracks()[0].requestFrame();
      if(frame%150===0)capture(`${frame/10}s`);
      await new Promise(resolve=>setTimeout(resolve,33));
    }
    await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
    window.revealMotionData=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:"video/webm"}));});
    check(reveal.getSnapshot().progress===1,"Full brightness after exactly 3600 steps");
    const end=pixels(canvas,lease.render);reveal.setEnabled(false,lease.instance);
    check(hash(pixels(canvas,lease.render))===hash(end),"Completed reveal exactly matches the normal animated frame");
    reveal.setEnabled(true,lease.instance);for(let i=0;i<900;i++)step();
    const parked=reveal.getSnapshot();await lease.selectScene("journey");for(let i=0;i<60;i++)step();
    check(reveal.getSnapshot().progress===parked.progress,"Parking preserves reveal progress");
    await lease.selectScene("alien",withSceneReveal(artwork));reveal.apply(lease.instance);setRimLightingVisibility(lease.instance,true);
    const beforeRestore=hash(pixels(canvas,lease.render)),ext=canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
    ext.loseContext();await waitFor(()=>!lease.getDiagnostics().available);ext.restoreContext();await waitFor(()=>lease.getDiagnostics().available);
    check(hash(pixels(canvas,lease.render))===beforeRestore,"Context restore preserves exposure and light phases");
    for(const viewport of [{width:360,height:640},{width:1280,height:360}]) {
      lease.reset();reveal.restart(lease.instance);setRimLightingVisibility(lease.instance,true);
      lease.resize({...viewport,dpr:1,renderScale:1});lease.camera.zoomIn(1.6,2);
      for(let i=0;i<120;i++)step();opaque(pixels(canvas,lease.render));capture(`zoom-${viewport.width}`);
    }
    check(errors.length===0,errors.join(";"));
    return {durationSeconds:60,steps:3600,exactFinalFrame:true,pause:true,sceneParking:true,contextRestore:true,zoomCoverage:true,previewSpeed:3,lavaColorDelta,precision};
  } finally {lease?.dispose();canvas.remove();}
};
