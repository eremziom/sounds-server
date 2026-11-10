import {prepareArtwork} from '/engine/artwork/prepare-artwork.ts';
window.runPreview=async()=>{
 const manifest=await(await fetch('/infinite-zoom/kre00/preview-manifest.json')).json();
 const canvas=document.createElement('canvas');document.body.append(canvas);
 let lease,tick=0;const errors=[],samples=[];window.qaCaptures={};
 const check=(v,m)=>{if(!v)throw Error(m);};
 const capture=name=>{lease.render();window.qaCaptures[name]=canvas.toDataURL('image/png');};
 const pixels=()=>{lease.render();const gl=canvas.getContext('webgl2'),p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
 const opaque=p=>{for(let i=3;i<p.length;i+=4)check(p[i]===255,'Opaque coverage including blackout');};
 const blackout=()=>{lease.instance.setLayerTransform('environment',{opacity:0});lease.instance.setLayerTransform('drone',{opacity:0});};
 const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>.5});
 try{
  lease=await prepareArtwork({canvas,manifest,instanceId:'kre00-preview',viewport:{width:1024,height:576,dpr:1,renderScale:1},
   highPrecisionColor:true,modulation:()=>({strength:1,intensity:1}),onAvailabilityChange(){},onError:e=>errors.push(String(e))},new AbortController().signal);
  blackout();capture('initial-blackout');const initial=canvas.toDataURL(),initialPixels=pixels(),initialState=lease.instance.getSnapshot(),initialCamera=lease.camera.getSnapshot();opaque(initialPixels);
  const gl=canvas.getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');
  const renderer=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  check(document.querySelectorAll('canvas').length===1,'One active renderer canvas');check(document.querySelectorAll('audio').length===0,'No extra audio element in QA fixture');
  const stream=canvas.captureStream(0),chunks=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'});
  recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
  for(let f=0;f<840;f++){
   const visibility=f<60?0:f<360?(f-60)/300:f<660?1:Math.max(0,1-(f-660)/120);
   lease.instance.setLayerTransform('environment',{opacity:visibility});lease.instance.setLayerTransform('drone',{opacity:visibility});
   if(f===180)lease.camera.retarget({x:2050,y:1050,rotation:0,logScale:.3},2);
   if(f===600)lease.camera.retarget({x:1920,y:1080,rotation:0,logScale:0},2);
   step();lease.render();stream.getVideoTracks()[0].requestFrame();
   if([0,59,179,299,419,599,659,719,779,839].includes(f)){
    capture('frame-'+f);opaque(pixels());samples.push({frame:f,snapshot:lease.instance.getSnapshot(),camera:lease.camera.getSnapshot()});
   }
   if(f===299){const frozen=canvas.toDataURL();for(let n=0;n<8;n++)lease.render();check(canvas.toDataURL()===frozen,'Pause preserves pose, light phase and camera');}
   await new Promise(resolve=>setTimeout(resolve,16));
  }
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
  window.qaMotion=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
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
  return {renderer,frames:840,simulationSeconds:14,oneCanvas:true,noExtraAudio:true,pause:true,reset:true,opaque:true,
   resetReadPixels:{changedChannels:resetChanged,maxDifference:resetMax},logicalReset,
   portraitWide:true,diagnostics:lease.getDiagnostics(),samples,errors,
   scope:'Unpublished diagnostic package; recorded real flight, lighting, blackout/reveal and zoom. Artistic acceptance remains separate.'};
 }finally{lease?.dispose();canvas.remove();}
};
