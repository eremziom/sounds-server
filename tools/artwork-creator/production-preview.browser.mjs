import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startChromium} from '../../apps/ui/tests/helpers/chromium.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),bundle=path.resolve(process.argv[2]);
assert.ok(bundle.startsWith(path.join(root,'.local/kre03/runs')+path.sep));
const require=createRequire(path.join(root,'apps/ui/package.json')),ts=require('typescript');
const packaged=JSON.parse(await readFile(path.join(bundle,'package.json'),'utf8'));
const assets=new Map(packaged.manifest.assets.map(a=>[a.uri,path.resolve(bundle,a.uri.slice(1))]));
for(const target of assets.values())assert.ok(target.startsWith(bundle+path.sep));
const out=path.join(bundle,'qa-'+Date.now());await mkdir(out);
const server=createServer(async(req,res)=>{
 try{
  const uri=new URL(req.url,'http://localhost').pathname;let bytes,type='text/javascript';
  if(uri==='/'){type='text/html';bytes='<style>body{margin:0;background:#000}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script><script type="module" src="/qa.mjs"></script>';}
  else if(uri==='/qa.mjs')bytes=await readFile(path.join(root,'tools/artwork-creator/production-preview-page.mjs'));
  else if(uri==='/package.json'){bytes=JSON.stringify(packaged);type='application/json';}
  else if(/^\/engine\/[a-z0-9/-]+\.ts$/.test(uri))bytes=ts.transpileModule(await readFile(path.join(root,'apps/ui/src/engines/infinite-zoom',uri.slice(8)),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,verbatimModuleSyntax:true}}).outputText;
  else if(/^\/three\/three\.(core|module)\.js$/.test(uri))bytes=await readFile(path.join(root,'apps/ui/node_modules/three/build',uri.slice(7)));
  else if(assets.has(uri)){bytes=await readFile(assets.get(uri));type='image/png';}
  else{res.writeHead(404).end();return;}
  res.setHeader('Content-Type',type);res.end(bytes);
 }catch(error){res.writeHead(500).end(String(error));}
});
let browser;
try{
 server.listen(0,'127.0.0.1');await once(server,'listening');
 browser=await startChromium({profileRoot:path.join(root,'.local/kre03/browser-profiles')});
 const {send,listeners}=browser,exceptions=[];listeners.set('Runtime.exceptionThrown',e=>exceptions.push(e));
 await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});
 for(let i=0;i<200;i++){if((await send('Runtime.evaluate',{expression:'typeof window.runProductionQA==="function"',returnByValue:true})).result.value)break;await delay(50);}
 await send('Runtime.evaluate',{expression:'void window.runProductionQA().then(r=>window.qaResult=r).catch(e=>window.qaError=e.stack).finally(()=>window.qaDone=true)'});
 let done=false;for(let i=0;i<1200;i++){done=(await send('Runtime.evaluate',{expression:'!!window.qaDone',returnByValue:true})).result.value;if(done)break;await delay(200);}
 assert.ok(done,'QA deadline');
 const result=(await send('Runtime.evaluate',{expression:'({result:window.qaResult,partial:window.qaPartial,error:window.qaError})',returnByValue:true})).result.value;
 await writeFile(path.join(out,'result.json'),JSON.stringify({...result,exceptions},null,2));
 const names=(await send('Runtime.evaluate',{expression:'Object.keys(window.qaCaptures||{})',returnByValue:true})).result.value;
 const motion=(await send('Runtime.evaluate',{expression:'typeof window.qaMotion==="string"',returnByValue:true})).result.value;
 for(const [expression,name]of [...names.map(n=>[`window.qaCaptures[${JSON.stringify(n)}]`,n+'.png']),...(motion?[['window.qaMotion','motion.webm']]:[])]){
  const length=(await send('Runtime.evaluate',{expression:`${expression}.length`,returnByValue:true})).result.value,parts=[];
  for(let offset=0;offset<length;offset+=262144)parts.push((await send('Runtime.evaluate',{expression:`${expression}.slice(${offset},${offset+262144})`,returnByValue:true})).result.value);
  await writeFile(path.join(out,name),Buffer.from(parts.join('').split(',')[1],'base64'));
 }
 console.log(out);assert.equal(result.error,undefined,result.error);assert.deepEqual(exceptions,[]);
}finally{await browser?.close();server.close();}
