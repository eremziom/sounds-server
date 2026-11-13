// Bounded KRE-00 coexistence probe: real UI/runtime, fixture auth/audio, real local models.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {withAuthBrowser} from '../../apps/ui/tests/helpers/auth-browser.mjs';
import {authSession} from '../../apps/ui/tests/helpers/auth-fixtures.mjs';
import {summarizeBudget} from './budget-summary.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),data=path.join(root,'.local/kre00');
const out=path.join(data,'runs','app-budget-'+Date.now());await mkdir(out);
const put=(name,value)=>writeFile(path.join(out,name),JSON.stringify(value,null,2),{flag:'wx'});
const phasePath=path.join(out,'phase.txt'),stopPath=path.join(out,'stop'),telemetryPath=path.join(out,'memory.jsonl');
const phase=async value=>{await writeFile(phasePath,value);console.log('App budget: '+value);};
const inventory=spawnSync('py',['-B',path.join(root,'tools/artwork-creator/adapter-inventory.py')],{windowsHide:true,encoding:'utf8'});
assert.equal(inventory.status,0,inventory.stderr);
const adapters=JSON.parse(inventory.stdout);await put('adapters.json',adapters);
console.log('Adapters: '+adapters.map(a=>a.name).join(', '));
const env={...process.env,PYTHONNOUSERSITE:'1',HF_HUB_OFFLINE:'1',TMP:path.join(data,'tmp'),TEMP:path.join(data,'tmp'),
 HF_HOME:path.join(data,'cache/huggingface'),TORCH_HOME:path.join(data,'cache/torch'),
 MIOPEN_USER_DB_PATH:path.join(data,'cache/miopen-db'),MIOPEN_CUSTOM_CACHE_DIR:path.join(data,'cache/miopen-kernels')};
const session=authSession({accessToken:'header.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+1800})).toString('base64url')+'.signature'});
const rate=8000,count=rate*900,wav=Buffer.alloc(44+count*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
for(let i=0;i<count;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*100/rate)*6000),44+i*2);
const tracks=[{id:1,ownerId:1,author:'KRE-00',title:'Budget fixture',genre:null,subgenre:null,description:null,publicationDate:'2026-01-01',bpm:null,hasAudio:true}];
const api=createServer((req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/auth/refresh')return res.end(JSON.stringify(session));
 if(req.url==='/auth/me')return res.end(JSON.stringify({...session.user,roles:[{key:'USER'}],permissions:[],sessionExpiresAt:session.refreshTokenExpiresAt}));
 if(req.url==='/tracks')return res.end(JSON.stringify(tracks));
 if(req.url==='/tracks/1/audio'){
  const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range??''),start=match?Number(match[1]):0,end=match?.[2]?Math.min(Number(match[2]),wav.length-1):wav.length-1;
  res.setHeader('Content-Type','audio/wav');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',end-start+1);
  if(match){res.statusCode=206;res.setHeader('Content-Range','bytes '+start+'-'+end+'/'+wav.length);}
  return res.end(req.method==='HEAD'?undefined:wav.subarray(start,end+1));
 }
 res.writeHead(404).end('{}');
});
let telemetry;const stages=[],health=[];let currentPhase='starting';
api.listen(0,'127.0.0.1');await once(api,'listening');
try{
 await withAuthBrowser('http://127.0.0.1:'+api.address().port,async({send,evaluate,waitFor,origin})=>{
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Page.bringToFront');
  await send('Network.setCookies',{cookies:[{name:'accessToken',value:session.accessToken,url:origin,path:'/',httpOnly:true},
   {name:'refreshToken',value:session.refreshToken,url:origin,path:'/',httpOnly:true},{name:'locale',value:'en',url:origin,path:'/'}]});
  await send('Page.navigate',{url:origin+'/library'});
  await waitFor("document.querySelector('[data-track-id=\"1\"] button') && document.querySelector('[data-infinite-zoom-canvas]')?.dataset.visualStatus==='ready'");
  await send('Runtime.evaluate',{userGesture:true,expression:"document.querySelector('[data-track-id=\"1\"] button').click()"});
  await waitFor("!document.querySelector('[data-persistent-media] audio').paused && document.querySelector('[data-infinite-zoom-canvas]').dataset.visualStatus==='running'");
  await evaluate("window.next.router.push('/animations')");await waitFor("document.querySelector('[data-iz-diagnostic-snapshot]')");
  const sample=async()=>{
   const record=await evaluate(`(() => {const a=document.querySelector('[data-persistent-media] audio'),c=document.querySelector('[data-infinite-zoom-canvas]');return {
    audioTime:a.currentTime,paused:a.paused,ended:a.ended,tick:Number(c.dataset.simulationTick),status:c.dataset.visualStatus,contextLost:c.getContext('webgl2').isContextLost(),
    canvasCount:document.querySelectorAll('[data-infinite-zoom-canvas]').length,audioCount:document.querySelectorAll('audio').length};})()`);
   health.push({phase:currentPhase,utc:new Date().toISOString(),...record});
   assert.ok(!record.paused&&!record.ended&&!record.contextLost&&record.status==='running','Audio/rendering health: '+JSON.stringify(record));
  };
  await sample();
  await put('application.json',await evaluate(`({route:location.pathname,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},diagnostics:JSON.parse(document.querySelector('[data-iz-diagnostic-snapshot]').textContent)})`));
  telemetry=spawn('powershell',['-NoProfile','-File',path.join(root,'tools/artwork-creator/app-budget-telemetry.ps1'),'-RootProcessId',String(process.pid),'-OutputPath',telemetryPath,'-PhasePath',phasePath,'-StopPath',stopPath],{windowsHide:true,stdio:'ignore'});
  const hold=async(label,seconds)=>{currentPhase=label;await phase(label);for(let i=0;i<seconds;i++){await sample();await delay(1000);}};
  await hold('baseline',5);
  const worker=async(label,command,args)=>{
   currentPhase=label;await phase(label);let code=null,finished=false;const log=[],started=Date.now();
   const child=spawn(command,args,{cwd:root,env,windowsHide:true});
   const complete=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',value=>{code=value;finished=true;resolve();});});
   child.stdout.on('data',b=>log.push(b));child.stderr.on('data',b=>log.push(b));
   const timer=setTimeout(()=>spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true}),600000);
   try{while(!finished){await sample();await delay(1000);}await complete;}
   finally{clearTimeout(timer);if(!finished){spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});await complete;}}
   await writeFile(path.join(out,label+'.txt'),Buffer.concat(log),{flag:'wx'});
   const record={label,command:[command,...args],pid:child.pid,exitCode:code,wallSeconds:(Date.now()-started)/1000};stages.push(record);await put(label+'.json',record);
   assert.equal(code,0,'Worker failed: '+label+'; inspect '+out);await hold(label+'-released',4);
  };
  await worker('qwen','py',['-B',path.join(root,'tools/artwork-creator/kre00.py'),'probe-sequence-plan','--runs','3']);
  const gpu=path.join(data,'venvs/torch-rocm721/Scripts/python.exe'),cpu=path.join(data,'venvs/onnx/Scripts/python.exe');
  const source=path.join(data,'runs/correction-1794554290558');
  for(let index=0;index<3;index++){
   const job=path.join(out,'job-'+index);await mkdir(job);
   for(const name of ['correction.json','object-mask.png','light-mask.png','backing-fill-mask.png'])await copyFile(path.join(source,name),path.join(job,name));
   for(const stage of ['encode','single'])await worker('job-'+index+'-'+stage,gpu,['-B',path.join(root,'tools/artwork-creator/klein_probe.py'),stage,job]);
   for(const [stage,python]of [['occlude',gpu],['fill',cpu]])await worker('job-'+index+'-'+stage,python,['-B',path.join(root,'tools/artwork-creator/pilot-correction.py'),stage,job]);
  }
  await hold('all-models-released',8);
  await put('health.json',health);await writeFile(stopPath,'stop');
  await new Promise(resolve=>{if(telemetry.exitCode!==null)resolve();else telemetry.once('close',resolve);});assert.equal(telemetry.exitCode,0,'Telemetry failed');
  const samples=(await readFile(telemetryPath,'utf8')).trim().split(/\r?\n/).map(line=>JSON.parse(line));
  const summary=summarizeBudget(samples,adapters,health);await put('summary.json',{...summary,stages,scope:'Real built /animations UI with fixture auth/API/audio, default three-world renderer; models run sequentially, not together. Three image-worker cycles, one three-request Qwen run.'});
 });
 const files=['app-budget.browser.mjs','app-budget-telemetry.ps1','adapter-inventory.py','budget-summary.mjs','budget-summary.test.mjs','klein_probe.py','pilot-correction.py','bounded_attention.py','kre00.py'];
 await mkdir(path.join(out,'probe-source'));const hashes={};
 for(const name of files){const bytes=await readFile(path.join(root,'tools/artwork-creator',name));await writeFile(path.join(out,'probe-source',name),bytes,{flag:'wx'});hashes[name]=createHash('sha256').update(bytes).digest('hex');}
 await put('source-hashes.json',hashes);await put('status.json',{success:true});console.log(out);
}catch(error){await put('failure.json',{error:String(error),stages,health});throw error;}
finally{
 if(telemetry?.exitCode===null){await writeFile(stopPath,'stop');await new Promise(resolve=>telemetry.once('close',resolve));}
 api.closeAllConnections();await new Promise(resolve=>api.close(resolve));
}
