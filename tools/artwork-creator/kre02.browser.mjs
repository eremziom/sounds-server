// Existing UI/audio + actual KRE-02 job runner; disposable DB/files are owned by the API probe.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {withAuthBrowser} from '../../apps/ui/tests/helpers/auth-browser.mjs';
import {authSession} from '../../apps/ui/tests/helpers/auth-fixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const session=authSession({accessToken:'header.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+1800})).toString('base64url')+'.signature'});
const rate=8000,samples=rate*900,wav=Buffer.alloc(44+samples*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*100/rate)*6000),44+i*2);
const api=createServer((req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/auth/refresh')return res.end(JSON.stringify(session));
 if(req.url==='/auth/me')return res.end(JSON.stringify({...session.user,roles:[{key:'USER'}],permissions:[],sessionExpiresAt:session.refreshTokenExpiresAt}));
 if(req.url==='/tracks')return res.end(JSON.stringify([{id:1,ownerId:1,author:'KRE-02 fixture',title:'Worker coexistence',genre:null,subgenre:null,description:null,publicationDate:'2026-01-01',bpm:null,hasAudio:true}]));
 if(req.url==='/tracks/1/audio'){
  const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range??''),start=match?Number(match[1]):0,end=match?.[2]?Math.min(Number(match[2]),wav.length-1):wav.length-1;
  res.setHeader('Content-Type','audio/wav');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',end-start+1);
  if(match){res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${wav.length}`);}return res.end(wav.subarray(start,end+1));
 }
 res.writeHead(404).end('{}');
});
const health=[],evidence=path.join(root,'.tmp/kre02-coexistence-models.json');
let child;
api.listen(0,'127.0.0.1');await once(api,'listening');
try{
 await withAuthBrowser('http://127.0.0.1:'+api.address().port,async({send,evaluate,waitFor,origin})=>{
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Page.bringToFront');
  await send('Network.setCookies',{cookies:[{name:'accessToken',value:session.accessToken,url:origin,path:'/',httpOnly:true},{name:'refreshToken',value:session.refreshToken,url:origin,path:'/',httpOnly:true},{name:'locale',value:'en',url:origin,path:'/'}]});
  await send('Page.navigate',{url:origin+'/library'});
  await waitFor("document.querySelector('[data-track-id=\"1\"] button') && document.querySelector('[data-infinite-zoom-canvas]')?.dataset.visualStatus==='ready'");
  await send('Runtime.evaluate',{userGesture:true,expression:"document.querySelector('[data-track-id=\"1\"] button').click()"});
  await waitFor("!document.querySelector('[data-persistent-media] audio').paused && document.querySelector('[data-infinite-zoom-canvas]').dataset.visualStatus==='running'");
  await evaluate("window.next.router.push('/animations')");await waitFor("document.querySelector('[data-iz-diagnostic-snapshot]')");
  const sample=async()=>{
   const record=await evaluate(`(()=>{const a=document.querySelector('[data-persistent-media] audio'),c=document.querySelector('[data-infinite-zoom-canvas]');return {audioTime:a.currentTime,paused:a.paused,ended:a.ended,tick:Number(c.dataset.simulationTick),status:c.dataset.visualStatus,contextLost:c.getContext('webgl2').isContextLost(),canvasCount:document.querySelectorAll('[data-infinite-zoom-canvas]').length,audioCount:document.querySelectorAll('audio').length};})()`);
   assert.ok(!record.paused&&!record.ended&&!record.contextLost&&record.status==='running');assert.equal(record.canvasCount,1);assert.equal(record.audioCount,1);
   if(health.length){assert.ok(record.audioTime>=health.at(-1).audioTime);assert.ok(record.tick>=health.at(-1).tick);}health.push({...record,utc:new Date().toISOString()});
  };
  await sample();
  let finished=false,code=null,log='';
  child=spawn(process.execPath,['scripts/test-artwork-jobs.cjs','--models'],{cwd:path.join(root,'apps/api'),windowsHide:true,env:{...process.env,KRE02_EVIDENCE:evidence}});
  child.stdout.on('data',b=>{log+=b.toString();});child.stderr.on('data',b=>{log+=b.toString();});
  const completed=new Promise((resolveDone,reject)=>{child.once('error',reject);child.once('close',value=>{finished=true;code=value;resolveDone();});});
  const started=Date.now();
  while(!finished){if(Date.now()-started>600000)throw Error('Coexistence timeout');await sample();await delay(1000);}await completed;await sample();
  await writeFile(path.join(root,'.tmp/kre02-coexistence.log'),log);assert.equal(code,0,log);
  const models=JSON.parse(await readFile(evidence,'utf8'));
  const result={viewport:{width:1280,height:720,dpr:1},health,models,visualArtworkAcceptance:false,scope:'Existing Forest/Nebula/Cavern renderer with fixture audio; KRE-02 model/tool adapter probes, not a new scene or FPS benchmark'};
  await writeFile(path.join(root,'.tmp/kre02-coexistence.json'),JSON.stringify(result,null,2));
  console.log(`KRE-02 audio/renderer coexistence: ${health.length} samples, audio +${(health.at(-1).audioTime-health[0].audioTime).toFixed(2)}s, simulation +${health.at(-1).tick-health[0].tick} ticks; `+models.models.map(m=>`${m.tool}: ${m.state}/${m.errorCode??'OK'}`).join(', '));
 });
}finally{
 if(child&&child.exitCode===null)child.kill();
 api.closeAllConnections();await new Promise(resolveDone=>api.close(resolveDone));
}
