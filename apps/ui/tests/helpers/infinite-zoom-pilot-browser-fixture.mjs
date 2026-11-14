import { prepareArtwork } from "/engine/artwork/prepare-artwork.ts";
import { decodeArtworkAsset } from "/engine/artwork/artwork-loader.ts";
import { pixels,hash,opaque,check,waitFor } from "/fixture.mjs";

window.runForestPilot=async(highPrecisionColor=false)=>{
  const [forest,pilot]=await Promise.all(["forest","forest-pilot"].map(async id=>await(await fetch(`/infinite-zoom/samples/${id}/manifest.json`)).json()));
  const canvas=document.createElement("canvas");document.body.append(canvas);
  const viewport={width:1280,height:720,dpr:1,renderScale:1};
  let tick=0,failDecode=false,lease,decodes=0;const errors=[],closed=[],changed={},visiblePixels={};
  const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>0.5});
  const compare=(a,b)=>{let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;};
  const visibleDifference=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>=24)count++;return count;};
  window.forestPilotCaptures={};
  window.forestPilotDiagnostics={};
  const difference=(a,b)=>{
    let maximum=0,channels=0;const samples=[];
    for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);if(!delta)continue;maximum=Math.max(maximum,delta);channels++;if(samples.length<16)samples.push({index:i,before:a[i],after:b[i]});}
    return{maximum,channels,samples};
  };
  const capture=name=>{lease.render();window.forestPilotCaptures[name]=canvas.toDataURL("image/png");};
  try {
    lease=await prepareArtwork({canvas,manifest:forest,instanceId:"pilot-test",viewport,recordLogical:true,highPrecisionColor,
      onAvailabilityChange(){},onError(e){errors.push(String(e));},
      async decode(asset,signal){
        if(failDecode&&asset.uri.includes("forest-pilot"))throw new Error("Injected pilot decode failure");
        const value=await decodeArtworkAsset(asset,signal),entry={closes:0};closed.push(entry);decodes++;
        return {...value,close(){entry.closes++;value.close();}};
      },
    },new AbortController().signal);
    const gl=canvas.getContext("webgl2");
    lease.setLoop(true);for(let i=0;i<100;i++)step();
    const journey=lease.getLogicalSnapshot(),frame=pixels(canvas,lease.render);
    const draft=structuredClone(pilot);draft.id="draft-test";
    const timing=lease.getDiagnostics().cameraTiming;
    lease.setPilotPreset("none");
    await lease.selectScene("draft",draft);
    check(lease.getScene()==="draft"&&canvas.getContext("webgl2")===gl,"Draft reuses the journey renderer and context");
    check(lease.getDiagnostics().artworks===1,"Draft exchanges GPU residency instead of adding another renderer");
    const draftInitial=pixels(canvas,lease.render),draftState=lease.instance.getSnapshot();
    const draftCamera=JSON.stringify(lease.camera.getSnapshot()),redraw=pixels(canvas,lease.render),initialRedrawDifference=compare(draftInitial,redraw);
    window.forestPilotDiagnostics={viewport,renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),initialRedraw:difference(draftInitial,redraw),cameraUnchanged:draftCamera===JSON.stringify(lease.camera.getSnapshot()),stateUnchanged:JSON.stringify(draftState)===JSON.stringify(lease.instance.getSnapshot()),resources:lease.getDiagnostics()};
    check(initialRedrawDifference===0,`Frozen draft redraw is pixel-identical before Reset: ${JSON.stringify(window.forestPilotDiagnostics)}`);
    for(let i=0;i<90;i++)step();
    check(compare(draftInitial,pixels(canvas,lease.render))>0,"Authored draft animation runs despite disabled pilot presets");
    const frozen=JSON.stringify(lease.instance.getSnapshot());
    for(let i=0;i<8;i++)lease.render();
    check(JSON.stringify(lease.instance.getSnapshot())===frozen,"Draft redraw while paused cannot advance behavior phases");
    lease.reset();
    const resetDifference=compare(draftInitial,pixels(canvas,lease.render)),resetState=lease.instance.getSnapshot();
    window.forestPilotDiagnostics.reset={maximum:resetDifference,cameraUnchanged:draftCamera===JSON.stringify(lease.camera.getSnapshot()),stateUnchanged:JSON.stringify(draftState)===JSON.stringify(resetState)};
    check(resetDifference===0&&JSON.stringify(draftState)===JSON.stringify(resetState),`Draft Reset restores its authored first frame: pixels=${resetDifference}; initialRedraw=${initialRedrawDifference}; resetRedraw=${compare(draftInitial,pixels(canvas,lease.render))}; camera=${draftCamera===JSON.stringify(lease.camera.getSnapshot())}; state=${JSON.stringify(draftState)===JSON.stringify(resetState)}; changedLayers=${JSON.stringify(resetState.layers.filter((layer,index)=>JSON.stringify(layer)!==JSON.stringify(draftState.layers[index])).map(layer=>layer.id))}`);
    check(lease.getDiagnostics().cameraTiming===timing,"Draft stepping and Reset preserve parked camera timing");
    const cancelled=new AbortController();cancelled.abort();
    let draftFailed=false;try{await lease.selectScene("draft",draft,cancelled.signal);}catch{draftFailed=true;}
    check(draftFailed&&compare(draftInitial,pixels(canvas,lease.render))===0,"Cancelled draft replacement retains the previous frame");
    const draw=gl.drawElements;
    gl.drawElements=function(){gl.drawElements=draw;throw Error("Injected draft GPU failure");};
    draftFailed=false;try{await lease.selectScene("draft",draft);}catch{draftFailed=true;}
    check(draftFailed&&lease.getScene()==="draft"&&compare(draftInitial,pixels(canvas,lease.render))===0,"Draft GPU failure rolls back exact prior draft pixels");
    for(let i=0;i<3;i++){await lease.selectScene("draft",draft);check(lease.getDiagnostics().artworks===1,"Repeated drafts retain one GPU lease");}
    await lease.selectScene("journey");
    check(JSON.stringify(lease.getLogicalSnapshot().artworks)===JSON.stringify(journey.artworks)&&JSON.stringify(lease.camera.getSnapshot())===JSON.stringify(journey.camera),"Preview returns exact parked artwork phases and camera trajectory");
    check(lease.getLoop()&&compare(frame,pixels(canvas,lease.render))===0,"Preview preserves Loop intent, transition and original nested pixels");
    lease.setPilotPreset("all");
    failDecode=true;
    let failed=false;try{await lease.selectScene("pilot",pilot);}catch{failed=true;}
    check(failed&&lease.getScene()==="journey","Failed critical pilot load preserves the journey");
    check(compare(frame,pixels(canvas,lease.render))===0,"Failed selection retains exact old pixels");failDecode=false;
    const original=gl.drawElements;
    gl.drawElements=function(){gl.drawElements=original;throw new Error("Injected pilot GPU warmup failure");};
    let gpuFailure="";failed=false;try{await lease.selectScene("pilot",pilot);}catch(e){failed=true;gpuFailure=String(e);}
    check(failed&&gpuFailure.includes("Injected pilot GPU warmup failure")&&lease.getScene()==="journey",`GPU warmup failure rolls back scene ownership: ${gpuFailure}`);
    const rollbackDifference=compare(frame,pixels(canvas,lease.render));check(rollbackDifference===0,`GPU rollback restores exact pixels/camera: ${rollbackDifference}; failure=${gpuFailure}; camera=${JSON.stringify(lease.camera.getSnapshot())}`);
    await lease.selectScene("pilot",pilot);
    check(canvas.getContext("webgl2")===gl,"Scene selection retains one context");
    check(lease.getDiagnostics().artworks===1,"Only pilot textures remain GPU-resident");
    check(lease.getDiagnostics().estimatedTextureBytes<140*1024*1024,"Pilot fits unchanged 256 MiB budget");
    check(!lease.transition.getSnapshot().canStart&&!lease.getLoop(),"Journey travel is dormant in pilot");
    capture("maximum");lease.setPilotPreset("subtle");capture("subtle");for(let i=0;i<90;i++)step();
    const beforeControls=lease.camera.getSnapshot();
    for(const kind of pilot.layers.flatMap(l=>(l.behaviors??[]).map(b=>b.kind))) {
      lease.reset();
      lease.setPilotPreset("none");
      const neutral=pixels(canvas,lease.render);
      const behavior=pilot.layers.flatMap(l=>l.behaviors??[]).find(b=>b.kind===kind);
      if(kind==="parallax") {
        lease.camera.retarget({x:2520,y:1080,rotation:0,logScale:0.65},1);
        for(let i=0;i<60;i++)step();
      } else for(let i=0;i<Math.round((kind==="opacity"?45:15)/behavior.params.frequencyHz);i++)step();
      const base=pixels(canvas,lease.render);
      lease.setPilotControl(kind,true,1);const active=pixels(canvas,lease.render);opaque(active);
      check(hash(active)!==hash(base),`${kind} changes real pilot artwork pixels`);changed[kind]=true;
      visiblePixels[kind]=visibleDifference(active,base);
      check(visiblePixels[kind]>=100,`${kind} must have a visible test footprint, not only a different hash: ${visiblePixels[kind]} pixels`);
      if(["bend","displace","glow"].includes(kind))capture(`strong-${kind}`);
      if(kind!=="parallax"){
        for(let i=0;i<Math.round(30/behavior.params.frequencyHz);i++)step();
        check(visibleDifference(active,pixels(canvas,lease.render))>=100,`${kind} visibly changes over its cycle`);
      }
      if(kind!=="parallax")check(neutral.length===active.length,"Live controls do not resize/reset the scene");
    }
    check(beforeControls.pose.logScale===0,"Pilot starts with its full-frame composition");
    lease.setPilotPreset("subtle");capture("animated");
    lease.setPilotControl("wave",true,0.1);lease.setPilotPreset("all");
    check(lease.getPilotControls().every(c=>c.enabled&&c.strength===1),"Maximum test preset restores all strengths to 100%");
    lease.setPilotControl("wave",true,0.1);lease.setPilotPreset("wave");
    check(lease.getPilotControls().find(c=>c.kind==="wave").strength===1,"Solo restores the selected effect to 100%");
    lease.setPilotPreset("subtle");
    check(lease.getPilotControls().every(c=>c.enabled&&c.strength===0.25),"Subtle preset attenuates the exaggerated test envelope");
    const camera=JSON.stringify(lease.camera.getSnapshot()),artwork=JSON.stringify(lease.instance.getSnapshot());
    const ext=gl.getExtension("WEBGL_lose_context");ext.loseContext();await waitFor(()=>!lease.getDiagnostics().available);
    ext.restoreContext();await waitFor(()=>lease.getDiagnostics().available||errors.length);
    check(!errors.length,errors.join(";"));
    check(camera===JSON.stringify(lease.camera.getSnapshot())&&artwork===JSON.stringify(lease.instance.getSnapshot()),"Pilot controls/phases survive context recovery");
    await lease.selectScene("journey");
    check(lease.getLoop(),"Returning restores original Loop intent");
    check(JSON.stringify(lease.camera.getSnapshot())===JSON.stringify(journey.camera),"Journey camera trajectory resumes from exact saved state");
    check(JSON.stringify(lease.getLogicalSnapshot().artworks)===JSON.stringify(journey.artworks),"Original three artwork phases were frozen in pilot");
    check(compare(frame,pixels(canvas,lease.render))===0,"Returning restores exact original embedded composition");
    const beforeReload=decodes;
    await lease.selectScene("pilot");await lease.selectScene("journey");
    check(decodes===beforeReload,"Repeated selection reuses bounded CPU cache");
    for(let i=0;i<960;i++)step();
    check(lease.instance.manifest.id==="nebula","Restored mid-transition journey still commits");
    await lease.selectScene("pilot");lease.reset();capture("reset");
    for(const size of [{width:360,height:640},{width:1280,height:360}]) {
      lease.resize({...viewport,...size});lease.setPilotCameraMotion(true);
      for(let i=0;i<500;i++)step();
      check(lease.getPilotCameraMotion()&&Math.abs(lease.camera.getSnapshot().pose.x-1920)>100,"Exaggerated parallax camera stays coverage-safe and travels visibly");
      opaque(pixels(canvas,lease.render));lease.setPilotCameraMotion(false);lease.reset();
    }
  } finally {lease?.dispose();canvas.remove();check(closed.every(a=>a.closes===1),"Every bitmap closes exactly once, including failed selections");}
  return {operators:12,changed,visiblePixels,oneContext:true,loadRollback:true,gpuRollback:true,preservesJourney:true,cacheReuse:true,portraitWide:true,draftParking:true,draftReset:true,draftRollback:true,draftBoundedResources:true};
};
