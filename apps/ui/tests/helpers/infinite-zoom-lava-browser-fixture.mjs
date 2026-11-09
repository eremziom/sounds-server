import {prepareArtwork} from "/engine/artwork/prepare-artwork.ts";
import {withSceneReveal,createSceneReveal} from "/adapter/scene-reveal.ts";
import {pixels,hash,opaque,check,waitFor} from "/fixture.mjs";

window.runLavaLighting=async(highPrecisionColor=false)=>{
  const manifest=withSceneReveal(await(await fetch("/infinite-zoom/samples/insectoid-planet/manifest.json")).json());
  const canvas=document.createElement("canvas");document.body.append(canvas);window.skyCaptures={};
  let lease,tick=0;const errors=[],tolerance=highPrecisionColor?1:0;
  const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>.5});
  const capture=name=>{lease.render();window.skyCaptures[name]=canvas.toDataURL("image/png");};
  const delta=(a,b)=>{let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;};
  try{
    lease=await prepareArtwork({canvas,manifest,instanceId:"lava-review",viewport:{width:1600,height:900,dpr:1,renderScale:1},highPrecisionColor,onAvailabilityChange(){},onError:e=>errors.push(String(e))},new AbortController().signal);
    const authored=lease.instance.getSnapshot().layers.map(({id,opacity})=>({id,opacity}));
    const isolate=()=>{for(const l of authored)lease.instance.setLayerTransform(l.id,{opacity:["fixed-world","volcano-lava"].includes(l.id)?1:0});};
    isolate();lease.instance.setLayerTransform("volcano-lava",{opacity:0});const baseline=pixels(canvas,lease.render);
    lease.instance.setLayerTransform("volcano-lava",{opacity:1});check(delta(pixels(canvas,lease.render),baseline)<=tolerance,"Lava starts in the original source color everywhere");capture("initial");
    const mask=new Image();mask.src="/infinite-zoom/samples/insectoid-planet/visible-volcano-lava.png";await mask.decode();
    const supportCanvas=document.createElement("canvas");supportCanvas.width=canvas.width;supportCanvas.height=canvas.height;
    const pen=supportCanvas.getContext("2d");pen.drawImage(mask,0,0);const support=pen.getImageData(0,0,canvas.width,canvas.height).data;
    let outsideMax=0;const changedAt=[];
    for(const seconds of [2,4,6,8,10,12,16]){
      while(tick<seconds*60)step();const frame=pixels(canvas,lease.render);opaque(frame);capture(`${seconds}s`);
      let changed=0;
      for(let y=2;y<canvas.height-2;y++)for(let x=2;x<canvas.width-2;x++){
        const i=((canvas.height-1-y)*canvas.width+x)*4,d=Math.max(...[0,1,2].map(c=>Math.abs(frame[i+c]-baseline[i+c])));
        if(d>5)changed++;
        let near=false;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(support[((y+dy)*canvas.width+x+dx)*4])near=true;
        if(!near)outsideMax=Math.max(outsideMax,d);
      }
      changedAt.push({seconds,changed});
    }
    check(changedAt.some(v=>v.changed>300),"Distant lava visibly changes color");check(outsideMax<=tolerance,`Static world outside lava remains unchanged: ${outsideMax}`);
    const frozen=hash(pixels(canvas,lease.render));for(let i=0;i<8;i++)lease.render();check(hash(pixels(canvas,lease.render))===frozen,"Pause freezes color travel");
    lease.instance.setBehaviorStrength("colorShift",0);check(delta(pixels(canvas,lease.render),baseline)<=tolerance,"Color control restores orange source");
    lease.instance.setBehaviorStrength("colorShift",1);lease.reset();tick=0;isolate();check(delta(pixels(canvas,lease.render),baseline)<=tolerance,"Reset restores orange source");
    const reveal=createSceneReveal();reveal.setEnabled(true,lease.instance);lease.instance.setLayerTransform("reveal-lava",{opacity:0});
    const dark0=pixels(canvas,lease.render);for(let i=0;i<360;i++)step();check(hash(pixels(canvas,lease.render))!==hash(dark0),"Volcano lava keeps changing in blackout");capture("blackout-6s");
    reveal.setEnabled(false,lease.instance);lease.reset();tick=0;
    for(const {id,opacity}of authored)lease.instance.setLayerTransform(id,{opacity:id.startsWith("reveal-")?0:opacity});
    // One full color cycle plus its initial five-second downhill delay. All
    // scene effects remain active while the existing camera zooms toward lava.
    const stream=canvas.captureStream(0),chunks=[],recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp9"});recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
    for(let frame=0;frame<540;frame++){
      if(frame===90)lease.camera.retarget({x:1920,y:1080,rotation:0,logScale:1.1},2);
      if(frame===150)lease.camera.retarget({x:2580,y:580,rotation:0,logScale:1.1},2);
      if(frame===360)lease.camera.retarget({x:1900,y:680,rotation:0,logScale:1.1},2);
      step();step();lease.render();stream.getVideoTracks()[0].requestFrame();if(frame%60===0)capture(`motion-${frame}`);await new Promise(resolve=>setTimeout(resolve,33));
    }
    await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
    window.skyMotionData=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(chunks,{type:"video/webm"}));});
    const before=hash(pixels(canvas,lease.render)),ext=canvas.getContext("webgl2").getExtension("WEBGL_lose_context");ext.loseContext();await waitFor(()=>!lease.getDiagnostics().available);ext.restoreContext();await waitFor(()=>lease.getDiagnostics().available);check(hash(pixels(canvas,lease.render))===before,"Context recovery preserves travel phase");
    check(errors.length===0,"No shader or resource errors");
    return{highPrecisionColor,colorBuffer:lease.getDiagnostics().colorBuffer,changedAt,outsideMax,initialOrange:true,pause:true,reset:true,blackout:true,control:true,contextRecovery:true,motionSeconds:18,zoom:true};
  }finally{lease?.dispose();canvas.remove();}
};
