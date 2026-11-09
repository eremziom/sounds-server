import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import ts from 'typescript';
import {startChromium} from './helpers/chromium.mjs';
const report=new URL('../../../.tmp/digital-grid-qa/',import.meta.url);
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;let bytes,type='text/javascript';
    if(path==='/'){type='text/html';bytes='<script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script><script type="module" src="/digital.mjs"></script>';}
    else if(path==='/digital.mjs')bytes=await readFile(new URL('helpers/infinite-zoom-digital-grid-browser-fixture.mjs',import.meta.url));
    else if(/^\/engine\/[a-z/-]+\.ts$/.test(path))bytes=ts.transpileModule(await readFile(new URL('../src/engines/infinite-zoom/'+path.slice(8),import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,verbatimModuleSyntax:true}}).outputText;
    else if(/^\/three\/three\.(core|module)\.js$/.test(path))bytes=await readFile(new URL('../node_modules/three/build/'+path.slice(7),import.meta.url));
    else if(/^\/infinite-zoom\/samples\/digital-grid\/[a-z-]+\.(json|png|svg)$/.test(path)){bytes=await readFile(new URL('../public'+path,import.meta.url));type=path.endsWith('.json')?'application/json':path.endsWith('.png')?'image/png':'image/svg+xml';}
    else {res.writeHead(404).end();return;}
    res.setHeader('Content-Type',type);res.end(bytes);
  }catch(e){res.writeHead(500).end(String(e));}
});
let browser;
try{
  await mkdir(report,{recursive:true});server.listen(0,'127.0.0.1');await once(server,'listening');
  browser=await startChromium({profileRoot:fileURLToPath(new URL('../../../.tmp/browser-profiles/',import.meta.url))});
  const {send,listeners}=browser,errors=[];
  listeners.set('Runtime.exceptionThrown',e=>errors.push(e));
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});
  let ready=false;for(let i=0;i<200;i++){ready=(await send('Runtime.evaluate',{expression:'typeof window.runDigitalGrid === "function"',returnByValue:true})).result.value;if(ready)break;await delay(50);}
  assert.ok(ready,JSON.stringify(errors));
  await send('Runtime.evaluate',{expression:'void window.runDigitalGrid().then(r=>window.qaResult=r).catch(e=>window.qaError=e.stack).finally(()=>window.qaDone=true)'});
  let done=false;for(let i=0;i<600;i++){done=(await send('Runtime.evaluate',{expression:'!!window.qaDone',returnByValue:true})).result.value;if(done)break;await delay(200);}
  assert.ok(done,'Motion review completes');
  const result=(await send('Runtime.evaluate',{expression:'({result:window.qaResult,error:window.qaError})',returnByValue:true})).result.value;
  assert.equal(result.error,undefined,result.error);assert.deepEqual(errors,[]);console.log(JSON.stringify(result.result));
  await writeFile(new URL('report.json',report),JSON.stringify(result.result,null,2));
  const names=(await send('Runtime.evaluate',{expression:'Object.keys(window.qaCaptures)',returnByValue:true})).result.value;
  for(const [expression,file]of [...names.map(n=>[`window.qaCaptures[${JSON.stringify(n)}]`,`${n}.png`]),['window.qaMotion','motion.webm']]){
    const length=(await send('Runtime.evaluate',{expression:`${expression}.length`,returnByValue:true})).result.value,parts=[];
    for(let i=0;i<length;i+=262144)parts.push((await send('Runtime.evaluate',{expression:`${expression}.slice(${i},${i+262144})`,returnByValue:true})).result.value);
    await writeFile(new URL(file,report),Buffer.from(parts.join('').split(',')[1],'base64'));
  }
}finally{await browser?.close();server.close();}
