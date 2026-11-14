import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {withAuthBrowser} from './helpers/auth-browser.mjs';
const apiUrl=process.env.KRE04_REAL_URL,directory=process.env.KRE04_DIRECTORY;
assert.ok(apiUrl&&directory&&process.env.KRE04_SESSION_FILE,'Launch through the real API acceptance harness');
const session=JSON.parse(await readFile(process.env.KRE04_SESSION_FILE,'utf8'));
const catalog=JSON.parse(await readFile(new URL('../messages/pl.json',import.meta.url),'utf8')),t=catalog.app.creator;
const recipe=JSON.parse(await readFile(new URL('../../../planning/artwork-creator/pilots/gate-drone/recipe.json',import.meta.url),'utf8'));
const qa=path.join(directory,'ui-qa');await mkdir(qa,{recursive:true});
const checks={realApi:true,realJwt:true,realWorker:true,modelInference:false,sourceGenerationInference:false},events=[];
await withAuthBrowser(apiUrl,async({send,evaluate,waitFor,origin})=>{
 await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`const nativeContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,attrs){return nativeContext.call(this,kind,kind==='webgl2'?{...attrs,preserveDrawingBuffer:true}:attrs);};`});
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await send('Network.setCookies',{cookies:[{name:'accessToken',value:session.accessToken,url:origin,path:'/',httpOnly:true},{name:'refreshToken',value:session.refreshToken,url:origin,path:'/',httpOnly:true},{name:'locale',value:'pl',url:origin,path:'/'}]});
 const click=expression=>send('Runtime.evaluate',{userGesture:true,expression:`${expression}.click()`});
 const button=(label,scope='[data-artwork-creator]')=>`[...document.querySelectorAll(${JSON.stringify(scope+' button')})].find(el=>el.textContent===${JSON.stringify(label)})`;
 const immersiveButton=()=>`document.querySelector('[data-creator-preview-immersive]')`;
 const input=async(selector,text)=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.select();})()`);await send('Input.insertText',{text:String(text)});};
 const choose=async(selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const projectId=()=>evaluate(`new URL(location.href).searchParams.get('project')`);
 const read=async(route)=>evaluate(`(async()=>{const r=await fetch(${JSON.stringify('/api/artworks/projects'+route)},{cache:'no-store'});if(!r.ok)throw Error('Read '+r.status);return r.json();})()`);
 const capture=async name=>{const value=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(qa,name+'.png'),Buffer.from(value.data,'base64'));};
 async function jobs(){return read('/'+await projectId()+'/jobs');}
 async function waitJob(tool,before=new Set()){
  const start=Date.now();let last='';
  while(Date.now()-start<600000){
   const job=(await jobs()).find(j=>j.tool===tool&&!before.has(j.id));
   if(job){
    const phase=job.state+'/'+job.phase;if(phase!==last){console.log('KRE-04 '+tool+' '+phase);last=phase;}
    if(job.state==='succeeded'){events.push({tool,jobId:job.id,state:job.state,phase:job.phase,memory:job.memory});await writeFile(path.join(qa,'events.json'),JSON.stringify(events,null,2));return job;}
    if(['failed','cancelled'].includes(job.state))throw Error(tool+' '+job.state+'/'+job.errorCode);
    if(['MEMORY_DEFERRED','MEMORY_TELEMETRY_UNAVAILABLE'].includes(job.phase)&&Date.now()-start>30000)throw Error(tool+' admission '+job.phase+'; no memory settings changed');
   }
   await delay(500);
  }throw Error(tool+' wait deadline; persisted job retained');
 }
 async function openCreator(){await evaluate(`window.next.router.push('/animations/create')`);await waitFor(`document.querySelector('[data-artwork-creator]')`);}
 async function play(){await evaluate(`window.next.router.push('/library')`);await waitFor(`document.querySelector('[data-track-id] button') && document.querySelector('[data-infinite-zoom-canvas]')?.dataset.visualStatus==='ready'`);await evaluate(`document.querySelector('audio').loop=true`);await click(`document.querySelector('[data-track-id] button')`);await waitFor(`!document.querySelector('audio').paused && document.querySelector('[data-infinite-zoom-canvas]').dataset.visualStatus==='running'`);}
 await send('Page.navigate',{url:origin+'/library'});await waitFor(`document.querySelector('[data-track-id] button') && document.querySelector('[data-infinite-zoom-canvas]')?.dataset.visualStatus==='ready'`);
 await evaluate(`window.audioEvents=[];for(const type of ['playing','pause','ended','error','emptied'])document.querySelector('audio').addEventListener(type,e=>audioEvents.push({type,loop:e.target.loop,error:e.target.error?.code,time:e.target.currentTime}));document.querySelector('audio').loop=true`);await click(`document.querySelector('[data-track-id] button')`);await waitFor(`!document.querySelector('audio').paused && document.querySelector('[data-infinite-zoom-canvas]').dataset.visualStatus==='running'`);
 await evaluate(`window.originalAudio=document.querySelector('audio');originalAudio.loop=true;window.originalCanvas=document.querySelector('[data-infinite-zoom-canvas]');window.originalGL=originalCanvas.getContext('webgl2')`);
 if(process.env.KRE04_CORRECT_PRODUCTION==='1'){
  const prior=JSON.parse(await readFile(path.join(qa,'production.json'),'utf8')),statePath=path.join(qa,'occlusion-correction.json');
  let correction={projectId:prior.projectId,operations:{}};
  try{correction=JSON.parse(await readFile(statePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  assert.equal(correction.projectId,prior.projectId);
  const saveCorrection=()=>writeFile(statePath,JSON.stringify(correction,null,2));
  await evaluate(`window.next.router.push('/animations/create?project=${prior.projectId}')`);
  await waitFor(`document.querySelector('[data-production-tool]')`);
  const initial=await read('/'+prior.projectId);
  const recovering=!!correction.revisionId,priorJobIds=(await jobs()).map(j=>j.id).sort();
  correction.baseRevisionId??=initial.revision.id;await saveCorrection();
  assert.equal(initial.revision.id,correction.revisionId??correction.baseRevisionId,'A newer revision must not be overwritten by correction recovery');
  await evaluate(`document.querySelector('[data-creator-production]').open=true`);
  async function operation(key,tool,image,mask,points=[]){
   const saved=correction.operations[key];
   if(saved?.artifactId){
    const completed=(await jobs()).find(j=>j.id===saved.jobId);
    assert.ok(completed?.state==='succeeded'&&completed.tool===tool&&completed.result.outputs.some(o=>o.artifactId===saved.artifactId),'Correction recovery requires a successful matching job');
    return saved.artifactId;
   }
   if(!saved){
    await waitFor(`!document.querySelector('[data-creator-production] fieldset').disabled`);
    await choose('[data-production-tool] select[name=operation]',tool);
    await choose('[data-production-tool] select[name=image]',image);
    if(mask){await waitFor(`document.querySelector('[data-production-tool] select[name=mask] option[value="${mask}"]')`);await choose('[data-production-tool] select[name=mask]',mask);}
    await choose('[data-production-tool] select[name=role]','occlusion-mask');
    for(const point of points){
     const negative=point.label===0;
     if(await evaluate(`document.querySelector('[data-production-tool] input[type=checkbox]').checked!==${negative}`))await click(`document.querySelector('[data-production-tool] input[type=checkbox]')`);
     await evaluate(`(()=>{const el=document.querySelector('[data-production-tool] img').closest('button'),r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+${point.x}/1024*r.width,clientY:r.top+${point.y}/576*r.height}));})()`);
    }
    correction.operations[key]={before:(await jobs()).map(j=>j.id),tool};await saveCorrection();
    await click(`document.querySelector('[data-production-tool] button[type=submit]')`);
   }
   const job=await waitJob(tool,new Set(correction.operations[key].before));
   if(tool==='segmentObject')checks.modelInference=true;
   const artifactId=job.result.outputs[0].artifactId;
   correction.operations[key]={...correction.operations[key],jobId:job.id,artifactId};await saveCorrection();return artifactId;
  }
  const {source,object}=prior.outputIds;
  const pillar=await operation('pillar','segmentObject',source,null,[{x:733,y:105,label:1},{x:738,y:280,label:1},{x:741,y:470,label:1},{x:570,y:280,label:0},{x:900,y:280,label:0}]);
  const occlusion=await operation('registered','registerMap',object,pillar);
  if(!correction.revisionId){
   for(const [name,value] of Object.entries({...Object.fromEntries(['coverage','environment','object','material','influence','delay'].map(k=>[k,prior.outputIds[k]])),occlusion})){
    await waitFor(`document.querySelector('[data-production-assembly] select[name=${name}] option[value="${value}"]')`);await choose(`[data-production-assembly] select[name=${name}]`,value);
   }
   await click(`document.querySelector('[data-production-assembly] button[type=submit]')`);
   await waitFor(`!document.querySelector('[data-creator-build-preview]').disabled`);
   const revised=await read('/'+prior.projectId);assert.notEqual(revised.revision.id,correction.baseRevisionId);assert.equal(revised.revision.parentId,correction.baseRevisionId);
   assert.equal(revised.revision.snapshot.layers.find(l=>l.id==='object').parameters.occlusionMaskAssetId,occlusion);
   correction.revisionId=revised.revision.id;await saveCorrection();
  }
  const built=(await jobs()).find(j=>j.tool==='buildPreviewPackage'&&j.baseRevisionId===correction.revisionId);
  if(!built){const before=new Set((await jobs()).map(j=>j.id));await click(`document.querySelector('[data-creator-build-preview]')`);await waitJob('buildPreviewPackage',before);}
  else await waitJob('buildPreviewPackage',new Set((await jobs()).filter(j=>j.id!==built.id).map(j=>j.id)));
  const base=await read('/'+prior.projectId+'/revisions/'+correction.baseRevisionId),revised=await read('/'+prior.projectId);
  const expectedLayers=structuredClone(base.snapshot.layers),expectedObject=expectedLayers.find(l=>l.id==='object');
  expectedObject.maskArtifactIds=[occlusion];expectedObject.parameters.occlusionMaskAssetId=occlusion;
  assert.deepEqual(revised.revision.snapshot.layers,expectedLayers,'Occlusion correction preserves the authored flight and other layers');
  assert.deepEqual(revised.revision.snapshot.brief,base.snapshot.brief);
  assert.deepEqual(revised.revision.snapshot.decisions,base.snapshot.decisions);
  if(recovering){assert.deepEqual((await jobs()).map(j=>j.id).sort(),priorJobIds);checks.correctionRecovery=true;}
  const correctionDirectory=path.join(qa,'corrected-occlusion');await mkdir(correctionDirectory,{recursive:true});
  const jobIds=Object.values(correction.operations).map(value=>value.jobId);
  const correctionJobs=(await jobs()).filter(job=>jobIds.includes(job.id)).map(({id,tool,arguments:args,inputIds,state,phase,memory,result})=>({id,tool,arguments:args,inputIds,state,phase,memory,outputs:result?.outputs}));
  await writeFile(path.join(correctionDirectory,'correction-jobs.json'),JSON.stringify(correctionJobs,null,2));
  await writeFile(path.join(correctionDirectory,'corrected-project.json'),JSON.stringify(await read('/'+prior.projectId),null,2));
  const correctionArtifacts=(await read('/'+prior.projectId+'/artifacts')).filter(a=>[pillar,occlusion,object].includes(a.id));
  await writeFile(path.join(correctionDirectory,'correction-artifacts.json'),JSON.stringify(correctionArtifacts,null,2));
  for(const [name,id] of [['pillar-mask',pillar],['registered-mask',occlusion]]){
   const data=await evaluate(`(async()=>{const r=await fetch('/api/artworks/projects/${prior.projectId}/artifacts/${id}/file');if(!r.ok)throw Error('Mask read '+r.status);const b=await r.blob();return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(b);});})()`);
   await writeFile(path.join(correctionDirectory,name+'.png'),Buffer.from(data.split(',')[1],'base64'));
  }
  checks.occlusionCorrection={...correction};
  if(process.env.KRE04_CORRECTION_ONLY==='1'){
   await writeFile(path.join(correctionDirectory,'correction-recovery-summary.json'),JSON.stringify(checks,null,2));
   console.log('KRE-04 correction recovery OK: '+JSON.stringify({revisionId:correction.revisionId,recovered:checks.correctionRecovery,modelInference:checks.modelInference}));return;
  }
 }
 if(process.env.KRE04_PRODUCTION_QA_ONLY==='1'){
  // Review the persisted, generated scene without enqueueing models or changing
  // its revision. Keep this evidence separate from the seven-layer starter.
  const {projectId:producedId}=JSON.parse(await readFile(path.join(qa,'production-state.json'),'utf8'));
  const reviewDirectory=process.env.KRE04_CORRECT_PRODUCTION==='1'?path.join(qa,'corrected-occlusion'):qa;await mkdir(reviewDirectory,{recursive:true});
  const captureReview=async name=>{const value=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(reviewDirectory,name+'.png'),Buffer.from(value.data,'base64'));};
  await evaluate(`window.next.router.push('/animations/create?project=${producedId}')`);
  await waitFor(`document.querySelector('[data-creator-show-preview]') && !document.querySelector('[data-creator-show-preview]').disabled`);
  const project=await read('/'+producedId),beforeJobs=await jobs();
  assert.equal(project.revision.snapshot.layers.length,4);
  await click(`document.querySelector('[data-creator-show-preview]')`);
  await waitFor(`document.querySelector('[data-iz-end-draft]') && document.querySelector('[data-draft-blackout]')`);
  const pixelStats=()=>evaluate(`(()=>{const p=new Uint8Array(originalCanvas.width*originalCanvas.height*4);originalGL.readPixels(0,0,originalCanvas.width,originalCanvas.height,originalGL.RGBA,originalGL.UNSIGNED_BYTE,p);let black=0,lit=0,uncovered=0,hash=0;for(let i=0;i<p.length;i+=4){const sum=p[i]+p[i+1]+p[i+2];if(sum===0)black++;if(sum>30)lit++;if(p[i+3]!==255)uncovered++;}for(const v of p)hash=Math.imul(hash^v,16777619)>>>0;return{black,lit,uncovered,hash,pixels:p.length/4};})()`);
  const pause=async()=>{await click(`document.querySelector('[data-player-toggle]')`);await waitFor(`originalAudio.paused && originalCanvas.dataset.visualStatus==='paused'`);};
  const resume=async()=>{await click(`document.querySelector('[data-player-toggle]')`);await waitFor(`!originalAudio.paused && originalCanvas.dataset.visualStatus==='running'`);};
  const frozen=async()=>{const before=await pixelStats(),tick=await evaluate('originalCanvas.dataset.simulationTick');await delay(800);assert.deepEqual(await pixelStats(),before);assert.equal(await evaluate('originalCanvas.dataset.simulationTick'),tick);return before;};
  await evaluate(`window.productionChunks=[];window.productionStream=originalCanvas.captureStream(30);window.productionRecorder=new MediaRecorder(productionStream,{mimeType:'video/webm;codecs=vp9'});productionRecorder.ondataavailable=e=>productionChunks.push(e.data);productionRecorder.start()`);
  try{
  await captureReview('qa-production-start');
  let flightSeconds=0;for(const seconds of [8,10,11,12,13,16,26]){await delay((seconds-flightSeconds)*1000);flightSeconds=seconds;await captureReview('qa-production-flight-'+seconds);assert.equal((await pixelStats()).uncovered,0);}
  await pause();checks.productionPause=await frozen();await captureReview('qa-production-paused');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor(`document.querySelector('[data-infinite-zoom-layout]').dataset.mode==='background'`);
  await click(button(t.resetPreview,'[data-draft-preview]'));await frozen();await captureReview('qa-production-reset');checks.productionResetFrozen=true;
  await resume();await click(button(t.previewCamera.zoomIn,'[data-draft-preview]'));await delay(2200);
  await click(immersiveButton());await waitFor(`document.querySelector('[data-infinite-zoom-layout]').dataset.mode==='immersive' && !document.querySelector('[data-draft-blackout]').disabled`);
  await click(`document.querySelector('[data-draft-blackout]')`);await delay(1200);
  const black=await pixelStats();assert.equal(black.uncovered,0);
  await captureReview('qa-production-blackout-zoom');await delay(2500);const animated=await pixelStats();checks.productionBlackout={...black,animated:animated.hash!==black.hash,blackCoverage:black.black/black.pixels,enabled:await evaluate(`document.querySelector('[data-draft-blackout]').checked`)};
  await writeFile(path.join(reviewDirectory,'production-qa-checkpoint.json'),JSON.stringify(checks,null,2));
  await click(`document.querySelector('[data-draft-blackout]')`);await delay(2500);await pause();checks.productionRevealPause=await frozen();await captureReview('qa-production-reveal-paused');
  await resume();await delay(10000);await captureReview('qa-production-reveal-zoom');assert.equal((await pixelStats()).uncovered,0);
  }finally{
  await evaluate(`new Promise(resolve=>{productionRecorder.onstop=resolve;productionRecorder.stop();}).then(async()=>{productionStream.getTracks().forEach(t=>t.stop());window.productionMotion=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(productionChunks,{type:'video/webm'}));});})`);
  const length=await evaluate('productionMotion.length'),parts=[];for(let i=0;i<length;i+=131072)parts.push(await evaluate(`productionMotion.slice(${i},${i+131072})`));await writeFile(path.join(reviewDirectory,'production-motion.webm'),Buffer.from(parts.join('').split(',')[1],'base64'));
  }
  await pause();await click(`document.querySelector('[data-iz-end-draft]')`);await waitFor(`!document.querySelector('[data-iz-end-draft]')`);
  checks.productionContext=await evaluate(`originalCanvas===document.querySelector('[data-infinite-zoom-canvas]')&&originalGL===originalCanvas.getContext('webgl2')&&originalAudio===document.querySelector('audio')&&originalAudio.paused`);assert.equal(checks.productionContext,true);
  await send('Page.reload');await waitFor(`document.querySelector('textarea[name=intent]')`);assert.equal(await projectId(),producedId);
  const after=await read('/'+producedId);assert.equal(after.revision.id,project.revision.id);assert.deepEqual((await jobs()).map(j=>j.id).sort(),beforeJobs.map(j=>j.id).sort());
  checks.productionReload=true;
  await writeFile(path.join(reviewDirectory,'production-qa-summary.json'),JSON.stringify({checks,projectId:producedId,revisionId:project.revision.id,scope:process.env.KRE04_CORRECT_PRODUCTION==='1'?'Occlusion corrected through UI with real SAM; motion/zoom QA; no engine changes':'Persisted generated four-layer scene; motion/zoom QA; no model inference or revision changes'},null,2));
  assert.ok(checks.productionBlackout.enabled&&checks.productionBlackout.blackCoverage>.6&&checks.productionBlackout.lit>100&&checks.productionBlackout.animated,JSON.stringify(checks.productionBlackout));
  console.log('KRE-04 persisted production QA OK: '+JSON.stringify(checks));return;
 }
 await openCreator();await click(`document.querySelector('[data-creator-starter]')`);await waitFor(`document.querySelector('textarea[name=intent]')`);
 const starterId=await projectId();await waitJob('buildPreviewPackage');await waitFor(`!document.querySelector('[data-creator-show-preview]').disabled`);
 const starter=await read('/'+starterId),starterArtifacts=await read('/'+starterId+'/artifacts');
 assert.equal(starter.revision.snapshot.layers.length,7);assert.equal(starterArtifacts.filter(a=>a.kind!=='report').length,17);checks.starterImported=true;
 await capture('starter-project');await click(`document.querySelector('[data-creator-show-preview]')`);await waitFor(`document.querySelector('[data-iz-end-draft]') && document.querySelector('[data-draft-blackout]')`);
 assert.deepEqual(await evaluate(`({sameAudio:originalAudio===document.querySelector('audio'),playing:!originalAudio.paused,sameContext:originalCanvas.getContext('webgl2')===originalGL})`),{sameAudio:true,playing:true,sameContext:true},JSON.stringify(await evaluate('audioEvents')));
 await evaluate(`window.motionChunks=[];window.motionStream=originalCanvas.captureStream(30);window.motionRecorder=new MediaRecorder(motionStream,{mimeType:'video/webm;codecs=vp9'});motionRecorder.ondataavailable=e=>motionChunks.push(e.data);motionRecorder.start()`);
 await capture('starter-normal');await click(`document.querySelector('[data-draft-blackout]')`);await delay(800);await capture('starter-blackout');
 const black=await evaluate(`(()=>{const gl=originalGL,p=new Uint8Array(originalCanvas.width*originalCanvas.height*4);gl.readPixels(0,0,originalCanvas.width,originalCanvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);let black=0,lit=0;for(let i=0;i<p.length;i+=4){if(p[i]+p[i+1]+p[i+2]===0)black++;if(p[i]+p[i+1]+p[i+2]>30)lit++;}return{black,lit,pixels:p.length/4};})()`);
 assert.ok(black.black>black.pixels*.6&&black.lit>100);checks.blackout=black;
 await click(`document.querySelector('[data-draft-blackout]')`);await delay(9000);await capture('starter-reveal');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await waitFor(`document.querySelector('[data-infinite-zoom-layout]').dataset.mode==='background'`);
 await click(button(t.previewCamera.zoomIn,'[data-draft-preview]'));await delay(2200);await click(immersiveButton());await delay(14000);await capture('starter-flight-zoom');
 await evaluate(`new Promise(resolve=>{motionRecorder.onstop=resolve;motionRecorder.stop();}).then(async()=>{motionStream.getTracks().forEach(t=>t.stop());window.motionData=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(motionChunks,{type:'video/webm'}));});})`);
 const motionLength=await evaluate('motionData.length'),parts=[];for(let i=0;i<motionLength;i+=131072)parts.push(await evaluate(`motionData.slice(${i},${i+131072})`));await writeFile(path.join(qa,'starter-motion.webm'),Buffer.from(parts.join('').split(',')[1],'base64'));
 await click(`document.querySelector('[data-player-toggle]')`);await waitFor(`originalAudio.paused && originalCanvas.dataset.visualStatus==='paused'`);await evaluate(`window.pausedPixels=originalCanvas.toDataURL();window.pausedTick=originalCanvas.dataset.simulationTick`);await delay(750);
 assert.deepEqual(await evaluate(`({pixels:originalCanvas.toDataURL()===pausedPixels,tick:originalCanvas.dataset.simulationTick===pausedTick})`),{pixels:true,tick:true});checks.pause=true;
 await click(`document.querySelector('[data-iz-end-draft]')`);await waitFor(`!document.querySelector('[data-iz-end-draft]')`);checks.sameContext=await evaluate(`originalCanvas.getContext('webgl2')===originalGL&&originalAudio===document.querySelector('audio')&&originalAudio.paused`);assert.equal(checks.sameContext,true);
 await send('Page.reload');await waitFor(`document.querySelector('textarea[name=intent]')`);assert.equal(await projectId(),starterId);checks.reload=true;
 await writeFile(path.join(qa,'starter-summary.json'),JSON.stringify({checks,starterProjectId:starterId,events},null,2));
 if(process.env.KRE04_STARTER_ONLY!=='1'){
  let source;
  if(process.env.KRE04_TOOLS_FROM_STARTER==='1'){
   source=starter.revision.snapshot.layers.find(l=>l.id==='drone').imageArtifactId;
   try{
    const prior=JSON.parse(await readFile(path.join(qa,'production.json'),'utf8'));
    await choose('#creator-project',prior.projectId);
    source=prior.outputIds.source;
    await waitFor(`document.querySelector('[data-production-assembly] select[name=object] option[value="${source}"]')`);
   }catch(error){if(error.code!=='ENOENT')throw error;}
  }else{
  let production;
  try{production=JSON.parse(await readFile(path.join(qa,'production-state.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(production){
   await choose('#creator-project',production.projectId);await waitFor(`new URL(location.href).searchParams.get('project')===${JSON.stringify(production.projectId)} && document.querySelector('textarea[name=intent]')`);
  }else{
  await input('#creator-title','KRE-04 real production');await click(button(t.create));await waitFor(`document.querySelector('textarea[name=intent]')?.value===''`);
  for(const field of ['intent','composition','motionPlan','lightingPlan','blackoutPlan','qaPlan'])await input(`textarea[name=${field}]`,field==='intent'?recipe.steps[0].arguments.prompt:recipe.brief[field]);
  await click(button(t.save));await waitFor(`!document.querySelector('[data-creator-generate]').disabled`);
  production={projectId:await projectId()};await writeFile(path.join(qa,'production-state.json'),JSON.stringify(production,null,2));
  }
  if(!(await jobs()).some(j=>j.tool==='generateImage')){
  await input('input[type=number]',785);
  await click(`document.querySelector('[data-creator-generate]')`);
  }
  const generated=await waitJob('generateImage');checks.modelInference=true;checks.sourceGenerationInference=true;
  source=generated.result.outputs[0].artifactId;
  await waitFor(`document.querySelector('img[src*="${source}"]')`);
  await click(`document.querySelector('img[src*="${source}"]').closest('figure').querySelector('button')`);
  await waitFor(`!document.querySelector('[data-creator-generate]').disabled`);
  }
  await evaluate(`document.querySelector('[data-creator-production]').open=true`);
  let outputIds={source};
  try{const prior=JSON.parse(await readFile(path.join(qa,'production.json'),'utf8'));if(prior.projectId===await projectId()&&prior.outputIds.source===source)outputIds=prior.outputIds;}catch(error){if(error.code!=='ENOENT')throw error;}
  async function tool(key,operation,image,mask,fields={},points=[]){
   if(outputIds[key])return outputIds[key];
   await waitFor(`!document.querySelector('[data-creator-production] fieldset').disabled`);
   await choose('[data-production-tool] select[name=operation]',operation);
   await waitFor(`document.querySelector('[data-production-tool] select[name=operation]').value===${JSON.stringify(operation)}`);
   if(image){await waitFor(`document.querySelector('[data-production-tool] select[name=image] option[value="${image}"]')`);await choose('[data-production-tool] select[name=image]',image);}
   if(mask){await waitFor(`document.querySelector('[data-production-tool] select[name=mask] option[value="${mask}"]')`);await choose('[data-production-tool] select[name=mask]',mask);}
   for(const [name,value] of Object.entries(fields)){
    const selector=`[data-production-tool] [name=${name}]`;
    if(await evaluate(`document.querySelector(${JSON.stringify(selector)}).tagName==='SELECT'`))await choose(selector,value);else await input(selector,value);
   }
   for(const point of points)await evaluate(`(()=>{const el=document.querySelector('[data-production-tool] img').closest('button'),r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+${point.x}/1024*r.width,clientY:r.top+${point.y}/576*r.height}));})()`);
   const current=await jobs(),inputs=[image,mask].filter(Boolean);
   const existing=current.find(j=>j.tool===operation&&JSON.stringify(j.inputIds)===JSON.stringify(inputs));
   const before=new Set(current.filter(j=>j.id!==existing?.id).map(j=>j.id));
   if(!existing)await click(`document.querySelector('[data-production-tool] button[type=submit]')`);
   const job=await waitJob(operation,before),id=job.result.outputs[0].artifactId;
   outputIds[key]=id;await writeFile(path.join(qa,'production.json'),JSON.stringify({projectId:await projectId(),outputIds},null,2));
   await waitFor(`document.querySelector('[data-production-tool] select[name=image]')?.querySelector('option[value="${id}"]') || !document.querySelector('[data-production-tool] button[type=submit]').disabled`);
   return id;
  }
  await capture('production-source');
  const mask=await tool('objectMask','segmentObject',source,null,{},recipe.steps.find(s=>s.key==='object-mask').arguments.points.filter(p=>p.label===1));checks.modelInference=true;
  const object=await tool('object','extractLayer',source,mask);
  const environment=await tool('environment','fillBackground',source,mask,{radius:14});
  const whole=await tool('whole','createMask',environment,null,{role:'visibility-mask'});
  const material=await tool('material','deriveLightSelection',environment,whole,{luma:70,saturation:.08,contrast:8});
  const influence=await tool('influence','buildInfluenceMap',environment,material);
  const delayMap=await tool('delay','buildDelayMap',environment,material);
  const coverage=await tool('coverage','createColorPlate');
  for(const [name,value] of Object.entries({coverage,environment,object,material,influence,delay:delayMap})){
   await waitFor(`document.querySelector('[data-production-assembly] select[name=${name}] option[value="${value}"]')`);
   await choose(`[data-production-assembly] select[name=${name}]`,value);
  }
  await click(`document.querySelector('[data-production-assembly] button[type=submit]')`);
  await waitFor(`document.querySelector('[data-creator-layers]')?.children.length===4`);
  await waitFor(`!document.querySelector('[data-creator-build-preview]').disabled`);
  const assembled=await read('/'+await projectId());assert.equal(assembled.revision.snapshot.layers.length,4);
  const before=new Set((await jobs()).map(j=>j.id));await click(`document.querySelector('[data-creator-build-preview]')`);await waitJob('buildPreviewPackage',before);
  const producedId=await projectId();await play();await evaluate(`document.querySelector('audio').loop=true`);
  await evaluate(`window.next.router.push('/animations/create?project=${producedId}')`);await waitFor(`document.querySelector('[data-creator-show-preview]') && !document.querySelector('[data-creator-show-preview]').disabled`);
  await click(`document.querySelector('[data-creator-show-preview]')`);await waitFor(`document.querySelector('[data-iz-end-draft]')`);
  await capture('production-preview');await delay(26000);await capture('production-flight-end');
  checks.layeredProduction=true;checks.productionProjectId=producedId;
  await click(`document.querySelector('[data-iz-end-draft]')`);await waitFor(`!document.querySelector('[data-iz-end-draft]')`);
 }
 await writeFile(path.join(qa,'summary.json'),JSON.stringify({checks,starterProjectId:starterId,events,scope:'Real API/JWT/worker, private database; no publication'},null,2));
 console.log('KRE-04 real starter UI acceptance OK: '+JSON.stringify(checks));
});
