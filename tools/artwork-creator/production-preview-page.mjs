import {prepareArtwork} from '/engine/artwork/prepare-artwork.ts';
window.runProductionQA=async()=>{
 const packaged=await(await fetch('/package.json')).json(),manifest=packaged.manifest;
 const {environmentLayerIds,lightLayerIds}=packaged.previewControls;
 const canvas=document.createElement('canvas');document.body.append(canvas);window.qaCaptures={};
 const errors=[],checks={},samples=[];window.qaPartial={checks,samples,errors};let lease,tick=0,audioLevel=1,recorder,stream,chunks=[];
 const check=(value,message)=>{if(!value)throw Error(message);};
 const capture=name=>{lease.render();window.qaCaptures[name]=canvas.toDataURL('image/png');};
 const pixels=()=>{lease.render();const gl=canvas.getContext('webgl2'),p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
 const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>.5});
 const environment=value=>environmentLayerIds.forEach(id=>lease.instance.setLayerTransform(id,{opacity:value}));
 const hideObject=()=>['drone','drone-lights'].forEach(id=>lease.instance.setLayerTransform(id,{opacity:0}));
 const opaque=p=>{for(let i=3;i<p.length;i+=4)check(p[i]===255,'Opaque coverage, including blackout and zoom');};
 const bitmapData=async id=>{const a=manifest.assets.find(a=>a.id===id),bitmap=await createImageBitmap(await(await fetch(a.uri)).blob()),c=new OffscreenCanvas(1024,576),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0,1024,576);bitmap.close();return ctx.getImageData(0,0,1024,576).data;};
 const stopVideo=async()=>{
  if(!recorder||recorder.state==='inactive')return;
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
  window.qaMotion=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
 };
 try{
  lease=await prepareArtwork({canvas,manifest,instanceId:'kre03-production-qa',viewport:{width:1024,height:576,dpr:1,renderScale:1},highPrecisionColor:true,modulation:()=>({strength:1,intensity:1,signals:{bass:audioLevel,energy:audioLevel}}),onAvailabilityChange(){},onError:e=>errors.push(String(e))},new AbortController().signal);
  check(environmentLayerIds.length>0&&lightLayerIds.length>0,'Separate environment and protected light groups');
  environment(0);capture('initial-blackout');const initial=pixels(),initialState=lease.instance.getSnapshot(),initialCamera=lease.camera.getSnapshot();opaque(initial);
  const gl=canvas.getContext('webgl2'),extension=gl.getExtension('WEBGL_debug_renderer_info'),renderer=extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  stream=canvas.captureStream(0);recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'});recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
  const revealAt=seconds=>seconds<3?0:seconds<11?((seconds-3)/8)**2*(3-2*(seconds-3)/8):seconds<24?1:seconds<32?1-((seconds-24)/8)**2*(3-2*(seconds-24)/8):0;
  for(let frame=0;frame<1920;frame++){
   environment(revealAt(frame/60));
   if(frame===720)lease.camera.retarget({x:2100,y:1040,rotation:0,logScale:.35},3);
   if(frame===1440)lease.camera.retarget({x:1920,y:1080,rotation:0,logScale:0},3);
   step();lease.render();stream.getVideoTracks()[0].requestFrame();
   if([0,59,179,359,479,659,839,1019,1199,1379,1439,1559,1799,1919].includes(frame)){
    capture('frame-'+frame);const p=pixels();opaque(p);samples.push({frame,layers:lease.instance.getSnapshot().layers.map(l=>({id:l.id,x:l.x,y:l.y,rotation:l.rotation,opacity:l.opacity})),camera:lease.camera.getSnapshot()});
    if(frame===59){let black=0,lit=0;for(let i=0;i<p.length;i+=4){if(p[i]+p[i+1]+p[i+2]===0)black++;if(p[i]+p[i+1]+p[i+2]>20)lit++;}checks.blackout={blackPixels:black,litPixels:lit};check(black>1024*576*.7&&lit>200,'Black environment with numerous independently visible material details');}
   }
   if(frame===479){const frozen=canvas.toDataURL(),snapshot=JSON.stringify(lease.instance.getSnapshot());for(let n=0;n<8;n++)lease.render();check(canvas.toDataURL()===frozen&&JSON.stringify(lease.instance.getSnapshot())===snapshot,'Pause freezes camera, flight, light phases and reveal');checks.pause=true;}
   await new Promise(resolve=>setTimeout(resolve,16));
  }
  await stopVideo();
  const first=samples[0].layers.find(l=>l.id==='drone'),last=samples.at(-1).layers.find(l=>l.id==='drone');
  check(Math.abs(last.x-first.x)>2500,'Integral object travels independently of camera');checks.objectTravel={first,last};
  // Dedicated full-frame flight comparison: the static authored occlusion map
  // must hide both body and lamp pixels, rather than following the sprite.
  lease.reset();tick=0;environment(1);
  const objectLayer=manifest.layers.find(l=>l.id==='drone'),object=await bitmapData(objectLayer.maskAssetId),occlusion=await bitmapData(objectLayer.occlusionMaskAssetId);
  let crossing;
  for(let f=0;f<1440&&!crossing;f++){
   step();if(f%30!==29)continue;
   const pose=lease.instance.getSnapshot().layers.find(l=>l.id==='drone'),c=Math.cos(pose.rotation),s=Math.sin(pose.rotation);let overlap=0;
   for(let y=0;y<576;y++)for(let x=0;x<1024;x++)if(object[(y*1024+x)*4]>200){const dx=x*3.75-1920,dy=y*3.75-1080,tx=Math.round((1920+pose.x+c*dx-s*dy)/3.75),ty=Math.round((1080+pose.y+s*dx+c*dy)/3.75);if(tx>=0&&tx<1024&&ty>=0&&ty<576&&occlusion[(ty*1024+tx)*4]>200)overlap++;}
   if(overlap<30)continue;
   const withObject=pixels();capture('pillar-crossing');hideObject();const withoutObject=pixels();let inside=0,outside=0;
   for(let y=2;y<574;y++)for(let x=2;x<1022;x++){const i=(y*1024+x)*4,j=((575-y)*1024+x)*4,d=Math.max(...[0,1,2].map(c=>Math.abs(withObject[j+c]-withoutObject[j+c])));if(d>1){if([0,-2,2,-2048,2048].every(o=>occlusion[i+o*4]===255))inside++;else outside++;}}
   lease.instance.setLayerTransform('drone',{opacity:1});lease.instance.setLayerTransform('drone-lights',{opacity:1});
   check(inside===0&&outside>0,'Pillar hides object/lamp interior while some moving object remains visible');crossing={frame:f,expectedOverlapPixels:overlap,pillarInteriorChanged:inside,visibleChanged:outside};
  }
  check(!!crossing,'Authored trajectory crosses the actual foreground pillar');checks.occlusion=crossing;
  // Isolate the spatial color wave from glow, body flight, reveal and camera.
  lease.reset();tick=0;environment(0);hideObject();lease.instance.setBehaviorStrength('glow',0);
  const layer=manifest.layers.find(l=>l.id==='west-lights'),color=layer.behaviors.find(b=>b.kind==='colorShift');
  const material=await bitmapData(layer.maskAssetId),delayMap=await bitmapData(color.params.delayMapAssetId),source=await bitmapData(layer.imageAssetId);
  const choose=(low,high)=>{let best=-1,score=-1;for(let i=0;i<1024*576;i++){const j=i*4;if(material[j]<240||delayMap[j]<low||delayMap[j]>high)continue;const value=Math.max(source[j],source[j+1],source[j+2])-Math.min(source[j],source[j+1],source[j+2]);if(value>score){best=i;score=value;}}check(best>=0,'Material exists at both ends of the authored delay map');return best;};
  const probes=[choose(0,25),choose(230,255)],measure=()=>{const p=pixels();return probes.map(i=>{const j=((575-Math.floor(i/1024))*1024+i%1024)*4;return [...p.slice(j,j+3)];});};
  const baseline=measure();capture('flow-start');let early,later;
  for(let n=1;n<=240;n++){step();if(n===60){early=measure();capture('flow-one-second');}if(n===240){later=measure();capture('flow-four-seconds');}}
  const delta=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
  const changes={nearEarly:delta(baseline[0],early[0]),farEarly:delta(baseline[1],early[1]),farLater:delta(baseline[1],later[1])};
  check(changes.nearEarly>5&&changes.farEarly<=2&&changes.farLater>5,'Spatial color wave reaches separated material locations at different times: '+JSON.stringify(changes));checks.flow={probes,baseline,early,later,changes};
  lease.instance.setBehaviorStrength('glow',1);
  const audioPixels=level=>{lease.reset();tick=0;audioLevel=level;environment(0);hideObject();for(let n=0;n<45;n++)step();return pixels();};
  const quiet=audioPixels(0),loud=audioPixels(1);let changed=0,quietSum=0,loudSum=0;for(let i=0;i<quiet.length;i+=4){if(Math.max(...[0,1,2].map(c=>Math.abs(quiet[i+c]-loud[i+c])))>1)changed++;quietSum+=quiet[i]+quiet[i+1]+quiet[i+2];loudSum+=loud[i]+loud[i+1]+loud[i+2];}
  checks.audioBinding={changedPixels:changed,quietSum,loudSum,simulationTick:45,scope:'Controlled normalized signals; no second audio graph'};check(changed>20&&loudSum>quietSum,'Existing audio bindings modulate material lighting at identical simulation time: '+JSON.stringify(checks.audioBinding));
  audioLevel=1;lease.reset();tick=0;environment(0);capture('reset');const reset=pixels();let maximum=0,changedChannels=0;for(let i=0;i<reset.length;i++){const d=Math.abs(reset[i]-initial[i]);maximum=Math.max(maximum,d);if(d)changedChannels++;}
  check(JSON.stringify(lease.instance.getSnapshot())===JSON.stringify(initialState)&&JSON.stringify(lease.camera.getSnapshot())===JSON.stringify(initialCamera),'Reset restores logical composition and camera');check(changedChannels===0,'Reset restores exact initial pixels');checks.reset={changedChannels,maximum};
  for(const viewport of [{width:450,height:800,dpr:1,renderScale:1},{width:1400,height:600,dpr:1,renderScale:1}]){lease.resize(viewport);opaque(pixels());}
  check(document.querySelectorAll('canvas').length===1&&document.querySelectorAll('audio').length===0,'Single renderer and no parallel audio player in QA');check(errors.length===0,errors.join('\n'));
  return {renderer,frames:1920,simulationSeconds:32,checks,samples,opaque:true,portraitWide:true,oneCanvas:true,diagnostics:lease.getDiagnostics(),errors,visualAcceptance:'requires review of actual motion/zoom recording and uncertain boundaries'};
 }finally{await stopVideo();lease?.dispose();canvas.remove();}
};
