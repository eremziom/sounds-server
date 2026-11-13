import {prepareArtwork} from '/engine/artwork/prepare-artwork.ts';
window.runPreview=async()=>{
 const manifest=await(await fetch('/infinite-zoom/kre00/preview-manifest.json')).json();
 const corrected=manifest.id==='kre00-corrected-pilot',frames=corrected?1440:840;
 const canvas=document.createElement('canvas');document.body.append(canvas);
 let lease,tick=0;const errors=[],samples=[];window.qaCaptures={};
 const check=(v,m)=>{if(!v)throw Error(m);};
 const capture=name=>{lease.render();window.qaCaptures[name]=canvas.toDataURL('image/png');};
 const pixels=()=>{lease.render();const gl=canvas.getContext('webgl2'),p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
 const opaque=p=>{for(let i=3;i<p.length;i+=4)check(p[i]===255,'Opaque coverage including blackout');};
 const blackout=()=>{lease.instance.setLayerTransform('environment',{opacity:0});lease.instance.setLayerTransform('drone',{opacity:0});};
 const visibilityAt=f=>corrected?(f<120?0:f<600?(f-120)/480:f<1080?1:Math.max(0,1-(f-1080)/240)):
   (f<60?0:f<360?(f-60)/300:f<660?1:Math.max(0,1-(f-660)/120));
 let occlusionPixels,objectPixels,occlusionCheck,flowCheck;
 const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>.5});
 try{
  lease=await prepareArtwork({canvas,manifest,instanceId:'kre00-preview',viewport:{width:1024,height:576,dpr:1,renderScale:1},
   highPrecisionColor:true,modulation:()=>({strength:1,intensity:1}),onAvailabilityChange(){},onError:e=>errors.push(String(e))},new AbortController().signal);
  blackout();capture('initial-blackout');const initial=canvas.toDataURL(),initialPixels=pixels(),initialState=lease.instance.getSnapshot(),initialCamera=lease.camera.getSnapshot();opaque(initialPixels);
  if(corrected){
   const bitmap=await createImageBitmap(await(await fetch('/infinite-zoom/kre00/occlusion-mask.png')).blob());
   const maskCanvas=new OffscreenCanvas(1024,576),context=maskCanvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
   occlusionPixels=context.getImageData(0,0,1024,576).data;
   const objectBitmap=await createImageBitmap(await(await fetch('/infinite-zoom/kre00/object-mask.png')).blob());
   context.clearRect(0,0,1024,576);context.drawImage(objectBitmap,0,0);objectBitmap.close();objectPixels=context.getImageData(0,0,1024,576).data;
  }
  const gl=canvas.getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');
  const renderer=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  check(document.querySelectorAll('canvas').length===1,'One active renderer canvas');check(document.querySelectorAll('audio').length===0,'No extra audio element in QA fixture');
  const stream=canvas.captureStream(0),chunks=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'});
  recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
  for(let f=0;f<frames;f++){
   const visibility=visibilityAt(f);
   lease.instance.setLayerTransform('environment',{opacity:visibility});lease.instance.setLayerTransform('drone',{opacity:visibility});
   if(f===(corrected?600:180))lease.camera.retarget({x:2050,y:1050,rotation:0,logScale:.3},2);
   if(f===(corrected?1200:600))lease.camera.retarget({x:1920,y:1080,rotation:0,logScale:0},2);
   step();lease.render();stream.getVideoTracks()[0].requestFrame();
   if((corrected?[0,59,119,239,359,419,479,599,719,839,959,1079,1199,1319,1439]:[0,59,179,299,419,599,659,719,779,839]).includes(f)){
    capture('frame-'+f);opaque(pixels());samples.push({frame:f,snapshot:lease.instance.getSnapshot(),camera:lease.camera.getSnapshot()});
   }
   if(corrected&&f===59){
    const p=pixels();let lit=0,black=0;
    for(let i=0;i<p.length;i+=4){if(p[i]+p[i+1]+p[i+2]>20)lit++;else if(p[i]+p[i+1]+p[i+2]===0)black++;}
    check(lit>500,'Independent materials remain visible in blackout');check(black>1024*576*.85,'Blackout excludes broad environmental surfaces');
    flowCheck={blackoutLitPixels:lit,blackoutBlackPixels:black};
   }
   if(corrected&&!occlusionCheck&&f%30===29&&f<600){
    // Compare actual GPU pixels with/without the moving object at its pillar crossing.
    const pose=lease.instance.getSnapshot().layers.find(l=>l.id==='drone'),c=Math.cos(pose.rotation),s=Math.sin(pose.rotation);let expectedOverlapPixels=0;
    for(let y=0;y<576;y++)for(let x=0;x<1024;x++)if(objectPixels[(y*1024+x)*4]>200){
     const dx=x*3.75-1920,dy=y*3.75-1080;
     const tx=Math.round((1920+pose.x+c*dx-s*dy)/3.75),ty=Math.round((1080+pose.y+s*dx+c*dy)/3.75);
     if(tx>=0&&tx<1024&&ty>=0&&ty<576&&occlusionPixels[(ty*1024+tx)*4]>200)expectedOverlapPixels++;
    }
    if(expectedOverlapPixels>100){
    const withDrone=pixels();
    lease.instance.setLayerTransform('drone',{opacity:0});lease.instance.setLayerTransform('drone-lights',{opacity:0});
    const withoutDrone=pixels();let interiorChanged=0,outsideChanged=0;
    for(let y=2;y<574;y++)for(let x=2;x<1022;x++){
     const i=(y*1024+x)*4,j=((575-y)*1024+x)*4;
     const delta=Math.max(...[0,1,2].map(c=>Math.abs(withDrone[j+c]-withoutDrone[j+c])));
     const interior=[0,-2,2,-2048,2048].every(o=>occlusionPixels[i+o*4]===255);
     if(delta>1){if(interior)interiorChanged++;else outsideChanged++;}
    }
    lease.instance.setLayerTransform('drone',{opacity:visibility});lease.instance.setLayerTransform('drone-lights',{opacity:1});
    check(interiorChanged===0,'Drone and lamps must not paint the pillar interior');check(outsideChanged>0,'Crossing comparison includes the moving object');
    occlusionCheck={frame:f,expectedOverlapPixels,interiorChanged,outsideChanged};capture('pillar-crossing');
    }
   }
   if(f===299){const frozen=canvas.toDataURL();for(let n=0;n<8;n++)lease.render();check(canvas.toDataURL()===frozen,'Pause preserves pose, light phase and camera');}
   await new Promise(resolve=>setTimeout(resolve,16));
  }
  if(corrected)check(!!occlusionCheck,'Flight includes a verified pillar crossing');
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
  window.qaMotion=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
  if(corrected){
   // Isolate spatial hue travel from global glow, object flight and camera motion.
   lease.reset();tick=0;blackout();lease.instance.setLayerTransform('drone-lights',{opacity:0});lease.instance.setBehaviorStrength('glow',0);
   const channels=async name=>{
    const bitmap=await createImageBitmap(await(await fetch('/infinite-zoom/kre00/'+name)).blob());
    const c=new OffscreenCanvas(1024,576),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return ctx.getImageData(0,0,1024,576).data;
   };
   const material=await channels('west-light-mask.png'),delays=await channels('material-delay.png'),source=await channels('backing.png');
   const choose=(low,high)=>{
    let best=-1,score=-1;
    for(let y=2;y<574;y++)for(let x=2;x<1022;x++){
     const i=y*1024+x,j=i*4;
     if(material[j]<240||delays[j]<low||delays[j]>high)continue;
     const value=Math.max(source[j],source[j+1],source[j+2])-Math.min(source[j],source[j+1],source[j+2]);
     if(value>score){best=i;score=value;}
    }
    check(best>=0,'Visible source material at both ends of delay guide');return best;
   };
   const probes=[choose(0,25),choose(230,255)],measure=()=>{
    const p=pixels();return probes.map(i=>{const x=i%1024,y=Math.floor(i/1024),j=((575-y)*1024+x)*4;return [...p.slice(j,j+3)];});
   };
   const baseline=measure();capture('flow-0');let early,later;
   for(let n=1;n<=240;n++){step();if(n===60){early=measure();capture('flow-1');}if(n===240){later=measure();capture('flow-4');}}
   const delta=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
   const changes={nearEarly:delta(baseline[0],early[0]),farEarly:delta(baseline[1],early[1]),farLater:delta(baseline[1],later[1])};
   check(changes.nearEarly>5&&changes.farEarly<=1&&changes.farLater>5,'Spatial color travel arrives at separated points at different times: '+JSON.stringify(changes));
   flowCheck={...flowCheck,probes:probes.map(i=>({x:i%1024,y:Math.floor(i/1024),delay:delays[i*4]/255})),baseline,atOneSecond:early,atFourSeconds:later,changes};
   lease.instance.setBehaviorStrength('glow',1);
  }
  lease.reset();tick=0;blackout();capture('reset');
  const resetPixels=pixels();let resetChanged=0,resetMax=0;for(let i=0;i<resetPixels.length;i++){const d=Math.abs(resetPixels[i]-initialPixels[i]);resetMax=Math.max(resetMax,d);if(d)resetChanged++;}
  window.qaResetDebug={resetChanged,resetMax,initialState,resetState:lease.instance.getSnapshot(),initialCamera,resetCamera:lease.camera.getSnapshot()};
  // Keep pixel/snapshot evidence even if a future engine regression fails Reset.
  window.qaResetDebugJson=JSON.stringify(window.qaResetDebug);
  const logicalReset=JSON.stringify(initialState)===JSON.stringify(lease.instance.getSnapshot())&&JSON.stringify(initialCamera)===JSON.stringify(lease.camera.getSnapshot());
  check(logicalReset,'Reset restores logical layer, behavior and camera state');
  check(resetChanged===0,'Reset restores exact initial composition: '+JSON.stringify({resetChanged,resetMax}));
  for(const viewport of [{width:450,height:800,dpr:1,renderScale:1},{width:1400,height:600,dpr:1,renderScale:1}]){
   lease.resize(viewport);opaque(pixels());
  }
  check(errors.length===0,errors.join('\n'));
  return {renderer,frames,simulationSeconds:frames/60,oneCanvas:true,noExtraAudio:true,pause:true,reset:true,opaque:true,
   ...(corrected?{occlusionCheck,flowCheck}:{}),
   resetReadPixels:{changedChannels:resetChanged,maxDifference:resetMax},logicalReset,
   portraitWide:true,diagnostics:lease.getDiagnostics(),samples,errors,
   scope:'Unpublished diagnostic package; recorded real flight, lighting, blackout/reveal and zoom. Artistic acceptance remains separate.'};
 }finally{lease?.dispose();canvas.remove();}
};
