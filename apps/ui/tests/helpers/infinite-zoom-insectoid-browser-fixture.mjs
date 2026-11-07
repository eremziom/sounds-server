import {prepareArtwork} from "/engine/artwork/prepare-artwork.ts";
import {pixels,hash,opaque,check,waitFor} from "/fixture.mjs";
import {setRimLightingVisibility} from "/adapter/rim-lighting.ts";

window.runInsectoidArtwork=async(recordMotion=false)=>{
  const [forest,alien]=await Promise.all(["forest","insectoid-planet"].map(async id=>(await fetch(`/infinite-zoom/samples/${id}/manifest.json`)).json()));
  const canvas=document.createElement("canvas");document.body.append(canvas);window.insectoidCaptures={};
  let lease,tick=0;const errors=[],effects={};
  const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>.5});
  const reset=()=>{lease.reset();setRimLightingVisibility(lease.instance,false);};
  const capture=name=>{lease.render();window.insectoidCaptures[name]=canvas.toDataURL("image/png");};
  const smokeDetail=name=>{
    lease.render();const detail=document.createElement("canvas");detail.width=580;detail.height=520;
    detail.getContext("2d").drawImage(canvas,1080*canvas.width/1672,0,290*canvas.width/1672,260*canvas.height/941,0,0,580,520);
    window.insectoidCaptures[name]=detail.toDataURL("image/png");
  };
  const fixedSites=[[24,680],[1005,366],[1622,802],[945,299],[113,325]];
  const siteDelta=(a,b,sites)=>{
    let max=0;for(const [x,y]of sites){const px=Math.floor(x*canvas.width/1672),py=canvas.height-1-Math.floor(y*canvas.height/941),i=(py*canvas.width+px)*4;
      for(let c=0;c<3;c++)max=Math.max(max,Math.abs(a[i+c]-b[i+c]));}return max;
  };
  try{
    lease=await prepareArtwork({canvas,manifest:forest,instanceId:"insectoid-test",viewport:{width:960,height:540,dpr:1,renderScale:1},onAvailabilityChange(){},onError(e){errors.push(String(e));}},new AbortController().signal);
    const gl=canvas.getContext("webgl2"),journey=hash(pixels(canvas,lease.render));
    await lease.selectScene("alien",alien);
    setRimLightingVisibility(lease.instance,false);
    const vaporImage=new Image();vaporImage.src=alien.assets.find(a=>a.id==="vapor").uri;await vaporImage.decode();
    const matte=document.createElement("canvas");matte.width=1600;matte.height=900;
    const pen=matte.getContext("2d",{willReadFrequently:true});pen.drawImage(vaporImage,0,0);
    const alpha=pen.getImageData(0,0,1600,900).data;let maxAlpha=0,alphaPixels=0;
    for(let i=3;i<alpha.length;i+=4){maxAlpha=Math.max(maxAlpha,alpha[i]);if(alpha[i])alphaPixels++;}
    check(maxAlpha>15&&maxAlpha<=62&&alphaPixels>2000&&alphaPixels<120000,"Vapor keeps real localized alpha with authored .24 cap");
    for(const[x,y]of [[0,0],[800,100],[1550,850],[1200,600],[400,800]])check(alpha[(y*1600+x)*4+3]===0,"Vapor source cannot introduce a matte outside its atmospheric wisps");
    check(lease.getDiagnostics().estimatedTextureBytes<64*1024*1024,"Alien assets remain bounded");
    check(lease.getPilotControls().map(c=>c.kind).join(",")==="scale,bend,wave,flow,pulse,opacity,colorShift,glow","Only eight authored controls appear");
    const decoded=async uri=>{const img=new Image();img.src=uri;await img.decode();return img;};
    const plate=await decoded(alien.assets.find(a=>a.id==="plate").uri),source=await decoded("/infinite-zoom/samples/insectoid-planet/source.png");
    const comparison=document.createElement("canvas");comparison.width=1600;comparison.height=900;
    const cpen=comparison.getContext("2d",{willReadFrequently:true});cpen.drawImage(source,0,0,1600,900);const original=cpen.getImageData(0,0,1600,900).data;
    cpen.clearRect(0,0,1600,900);cpen.drawImage(plate,0,0);const cleaned=cpen.getImageData(0,0,1600,900).data;let outsideMax=0,backingChanged=0;
    for(let y=0;y<900;y++)for(let x=0;x<1600;x++){
      const sx=(x+.5)*1672/1600,sy=(y+.5)*941/900,i=(y*1600+x)*4;
      const delta=Math.max(Math.abs(original[i]-cleaned[i]),Math.abs(original[i+1]-cleaned[i+1]),Math.abs(original[i+2]-cleaned[i+2]));
      if(sx<1060||sx>1390||sy>280)outsideMax=Math.max(outsideMax,delta);else if(delta>8)backingChanged++;
    }
    check(outsideMax<=2&&backingChanged>1000,`The clean background replaces only local smoke pixels: outside ${outsideMax}, inside ${backingChanged}`);
    const smokeImage=await decoded(alien.assets.find(a=>a.id==="volcano-smoke").uri);
    cpen.clearRect(0,0,1600,900);cpen.drawImage(smokeImage,0,0);const smokeAlpha=cpen.getImageData(0,0,1600,900).data;
    let rootedAlpha=0;for(let y=190;y<213;y++)for(let x=1215;x<1245;x++)rootedAlpha=Math.max(rootedAlpha,smokeAlpha[(Math.floor(y*900/941)*1600+Math.floor(x*1600/1672))*4+3]);
    check(rootedAlpha>10&&smokeAlpha[3]===0,"Generated smoke keeps an actual alpha root and transparent margins");
    lease.setPilotPreset("none");const neutral=pixels(canvas,lease.render);opaque(neutral);capture("neutral");
    smokeDetail("smoke-neutral-detail");
    for(const kind of ["scale","wave","flow","bend","pulse","opacity","colorShift","glow"]){
      reset();lease.setPilotPreset(kind);let maxChanged=0,maxDelta=0,stationary=0,peakTick=0;
      for(let sample=0;sample<45;sample++){
        for(let i=0;i<20;i++)step();const frame=pixels(canvas,lease.render);opaque(frame);
        let changed=0;
        for(let i=0;i<frame.length;i+=4){const delta=Math.max(Math.abs(frame[i]-neutral[i]),Math.abs(frame[i+1]-neutral[i+1]),Math.abs(frame[i+2]-neutral[i+2]));maxDelta=Math.max(maxDelta,delta);if(delta>8)changed++;}
        stationary=Math.max(stationary,siteDelta(neutral,frame,fixedSites));
        if(kind==="flow"||kind==="bend"){
          for(let sy=198;sy<246;sy++)for(let sx=1200;sx<1270;sx++){
            const x=Math.floor(sx*canvas.width/1672),y=canvas.height-1-Math.floor(sy*canvas.height/941),i=(y*canvas.width+x)*4;
            check(frame[i]===neutral[i]&&frame[i+1]===neutral[i+1]&&frame[i+2]===neutral[i+2],"Smoke base and crater stay exactly pinned under spatial effects");
          }
        }
        if(changed>maxChanged){maxChanged=changed;peakTick=(sample+1)*20;capture(`${kind}-peak`);if(kind==="flow"||kind==="bend")smokeDetail(`smoke-${kind}-peak-detail`);}
        if(sample===6||sample===21||sample===36)capture(`${kind}-cycle-${sample}`);
      }
      effects[kind]={changedPixels:maxChanged,maximumDelta:maxDelta,frameFraction:maxChanged/(canvas.width*canvas.height),stationaryMax:stationary,peakTick};
      check(maxChanged>200&&maxDelta>18,`${kind} visible at actual viewport: ${JSON.stringify(effects[kind])}`);
      check(stationary===0,`${kind} preserves selected rock, rib and horizon pixels`);
      check(effects[kind].frameFraction<.3,`${kind} remains spatially localized`);
    }
    // Outside authored heat support every pixel must remain unchanged, not just
    // selected landmarks. Bilinear mask support is conservatively expanded by
    // reading the mask at viewport resolution with the same linear filtering.
    const heatImage=new Image();heatImage.src=alien.assets.find(a=>a.id==="visible-heat").uri;await heatImage.decode();
    const support=document.createElement("canvas");support.width=canvas.width;support.height=canvas.height;
    const supportPen=support.getContext("2d",{willReadFrequently:true});supportPen.drawImage(heatImage,0,0,support.width,support.height);
    const heatSupport=supportPen.getImageData(0,0,support.width,support.height).data;
    reset();lease.setPilotPreset("wave");
    for(let sample=0;sample<8;sample++){
      for(let i=0;i<12;i++)step();const frame=pixels(canvas,lease.render);
      for(let y=2;y<canvas.height-2;y++)for(let x=2;x<canvas.width-2;x++){
        let nearHeat=false;
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(heatSupport[((y+dy)*canvas.width+x+dx)*4])nearHeat=true;
        if(nearHeat)continue;
        const i=((canvas.height-1-y)*canvas.width+x)*4;
        check(frame[i]===neutral[i]&&frame[i+1]===neutral[i+1]&&frame[i+2]===neutral[i+2],"Heat cannot change any pixel outside its authored support");
      }
    }
    // Complete combined cycles at full authored strength, including cloud flashes.
    reset();lease.setPilotPreset("all");
    const stream=recordMotion?canvas.captureStream(0):null,chunks=[];
    const recorder=stream?new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp9"}):null;
    if(recorder){recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();}
    for(let sample=0;sample<(recordMotion?450:45);sample++){
      for(let i=0;i<(recordMotion?2:20);i++)step();
      const frame=pixels(canvas,lease.render);opaque(frame);check(siteDelta(neutral,frame,fixedSites)===0,"Combined effects preserve fixed material sites");
      if(sample%(recordMotion?50:5)===0)capture(`combined-${recordMotion?Math.floor(sample/10):sample}`);
      if(stream){stream.getVideoTracks()[0].requestFrame();await new Promise(resolve=>setTimeout(resolve,33));}
    }
    if(recorder){
      await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
      window.insectoidMotionData=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:"video/webm"}));});
    }
    const frozen=JSON.stringify(lease.instance.getSnapshot()),frame=hash(pixels(canvas,lease.render));
    for(let i=0;i<10;i++)lease.render();check(hash(pixels(canvas,lease.render))===frame&&JSON.stringify(lease.instance.getSnapshot())===frozen,"Render/pause cannot advance phase");
    await lease.selectScene("journey");check(hash(pixels(canvas,lease.render))===journey,"Journey restored exactly");
    await lease.selectScene("alien");check(hash(pixels(canvas,lease.render))===frame,"Alien phase and composition restored exactly");
    const ext=gl.getExtension("WEBGL_lose_context");ext.loseContext();await waitFor(()=>!lease.getDiagnostics().available);ext.restoreContext();await waitFor(()=>lease.getDiagnostics().available||errors.length);
    check(!errors.length&&hash(pixels(canvas,lease.render))===frame,"Context restore preserves authored phases");
    reset();lease.setPilotPreset("none");check(hash(pixels(canvas,lease.render))===hash(neutral),"Reset returns exact neutral frame");
    lease.setPilotPreset("all");lease.setPilotCameraMotion(true);
    for(let i=0;i<600;i++)step();opaque(pixels(canvas,lease.render));capture("camera-zoom");
    for(const size of [{width:360,height:640},{width:1280,height:360}]){lease.resize({...size,dpr:1,renderScale:1});for(let i=0;i<60;i++)step();opaque(pixels(canvas,lease.render));capture(`coverage-${size.width}`);}
    lease.resize({width:960,height:540,dpr:1,renderScale:1});lease.setPilotCameraMotion(false);reset();lease.setPilotPreset("none");
    for(const kind of ["flow","bend","opacity","glow"])lease.setPilotControl(kind,true,1);
    lease.camera.retarget({x:1230*3840/1672,y:150*2160/941,rotation:0,logScale:1.2},3);
    for(let i=0;i<180;i++)step();opaque(pixels(canvas,lease.render));capture("smoke-camera-zoom");
    if(recordMotion){
      const detailStream=canvas.captureStream(0),detailChunks=[],detailRecorder=new MediaRecorder(detailStream,{mimeType:"video/webm;codecs=vp9"});
      detailRecorder.ondataavailable=e=>detailChunks.push(e.data);detailRecorder.start();
      for(let i=0;i<450;i++){
        step();step();lease.render();detailStream.getVideoTracks()[0].requestFrame();
        if(i%50===0)capture(`smoke-zoom-cycle-${i}`);
        await new Promise(resolve=>setTimeout(resolve,33));
      }
      await new Promise(resolve=>{detailRecorder.onstop=resolve;detailRecorder.stop();});detailStream.getTracks().forEach(t=>t.stop());
      window.insectoidSmokeMotionData=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(detailChunks,{type:"video/webm"}));});
    }
    check(canvas.getContext("webgl2")===gl,"Same renderer/context throughout");
    // Reviewable contact sheet of mask channels, not a substitute for motion QA.
    const sheet=document.createElement("canvas");sheet.width=960;sheet.height=160*Math.ceil((alien.assets.length-1)/3);
    const ctx=sheet.getContext("2d");ctx.fillStyle="#111";ctx.fillRect(0,0,sheet.width,sheet.height);
    for(const[i,asset]of alien.assets.filter(a=>a.kind==="mask").entries()){
      const image=new Image();image.src=asset.uri;await image.decode();const x=(i%3)*320,y=Math.floor(i/3)*160;
      ctx.drawImage(image,x,y,320,140);ctx.fillStyle="white";ctx.font="12px sans-serif";ctx.fillText(asset.id,x+5,y+154);
    }window.insectoidCaptures["mask-atlas"]=sheet.toDataURL("image/png");
  }finally{lease?.dispose();canvas.remove();}
  return{effects,combinedSeconds:15,individualSeconds:15,vaporAlpha:true,localCleanPatch:true,smokeAlpha:true,smokePinnedCrater:true,heatOutsideSupportUnchanged:true,pause:true,reset:true,sceneRestore:true,contextRestore:true,zoom:true,portraitWideCoverage:true};
};
