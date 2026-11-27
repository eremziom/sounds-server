import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startChromium} from '../../apps/ui/tests/helpers/chromium.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const directory=path.resolve(process.argv[2]);
assert.ok(directory.startsWith(path.join(root,'.local/kre00/runs')+path.sep));
const require=createRequire(path.join(root,'apps/ui/package.json')),ts=require('typescript');
const manifest=JSON.parse(await readFile(path.join(directory,'preview-manifest.json'),'utf8'));
const files=new Set(['preview-manifest.json',...manifest.assets.map(a=>a.uri.split('/').at(-1))]);
const out=path.join(directory,'browser-qa-'+Date.now());await mkdir(out);
const server=createServer(async(req,res)=>{
 try{
  const p=new URL(req.url,'http://localhost').pathname;let bytes,type='text/javascript';
  if(p==='/'){type='text/html';bytes='<script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script><script type="module" src="/preview.mjs"></script>';}
  else if(p==='/preview.mjs')bytes=await readFile(path.join(root,'tools/artwork-creator/preview-browser.mjs'));
  else if(/^\/engine\/[a-z0-9/-]+\.ts$/.test(p))bytes=ts.transpileModule(await readFile(path.join(root,'apps/ui/src/engines/infinite-zoom',p.slice(8)),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,verbatimModuleSyntax:true}}).outputText;
  else if(/^\/three\/three\.(core|module)\.js$/.test(p))bytes=await readFile(path.join(root,'apps/ui/node_modules/three/build',p.slice(7)));
  else if(p.startsWith('/infinite-zoom/kre00/')&&files.has(p.slice(21))){const name=p.slice(21);bytes=await readFile(path.join(directory,name));type=name.endsWith('.json')?'application/json':name.endsWith('.svg')?'image/svg+xml':'image/png';}
  else {res.writeHead(404).end();return;}
  res.setHeader('Content-Type',type);res.end(bytes);
 }catch(error){res.writeHead(500).end(String(error));}
});
let browser;
try{
 server.listen(0,'127.0.0.1');await once(server,'listening');
 browser=await startChromium({profileRoot:path.join(root,'.local/kre00/browser-profiles')});
 const {send,listeners}=browser,errors=[];listeners.set('Runtime.exceptionThrown',e=>errors.push(e));
 await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});
 let ready=false;for(let n=0;n<200;n++){ready=(await send('Runtime.evaluate',{expression:'typeof window.runPreview==="function"',returnByValue:true})).result.value;if(ready)break;await delay(50);}
 assert.ok(ready,JSON.stringify(errors));
 await send('Runtime.evaluate',{expression:'void window.runPreview().then(r=>window.qaResult=r).catch(e=>window.qaError=e.stack).finally(()=>window.qaDone=true)'});
 let done=false;for(let n=0;n<600;n++){done=(await send('Runtime.evaluate',{expression:'!!window.qaDone',returnByValue:true})).result.value;if(done)break;await delay(200);}
 assert.ok(done,'Preview deadline');
 const result=(await send('Runtime.evaluate',{expression:'({result:window.qaResult,error:window.qaError})',returnByValue:true})).result.value;
 await writeFile(path.join(out,'result.json'),JSON.stringify({result,exceptions:errors},null,2));
 const names=(await send('Runtime.evaluate',{expression:'Object.keys(window.qaCaptures||{})',returnByValue:true})).result.value;
 const motion=(await send('Runtime.evaluate',{expression:'typeof window.qaMotion==="string"',returnByValue:true})).result.value;
 for(const [expression,name]of [...names.map(n=>[`window.qaCaptures[${JSON.stringify(n)}]`,n+'.png']),...(motion?[['window.qaMotion','motion.webm']]:[])]){
  const length=(await send('Runtime.evaluate',{expression:`${expression}.length`,returnByValue:true})).result.value;const parts=[];
  for(let offset=0;offset<length;offset+=262144)parts.push((await send('Runtime.evaluate',{expression:`${expression}.slice(${offset},${offset+262144})`,returnByValue:true})).result.value);
  await writeFile(path.join(out,name),Buffer.from(parts.join('').split(',')[1],'base64'));
 }
 assert.equal(result.error,undefined,result.error);assert.deepEqual(errors,[]);
 console.log(out);
}finally{await browser?.close();server.close();}
