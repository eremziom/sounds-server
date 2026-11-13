// Reproducible, source-bound correction recipe; not a general creator or a publisher.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectMaterials} from './pilot-materials.mjs';
import {correctedManifest} from './corrected-package.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'apps/ui/package.json'));
const sharp=createRequire(require.resolve('next/package.json'))('sharp');
const runs=path.join(root,'.local/kre00/runs');
const source=await import('node:fs/promises').then(fs=>fs.realpath(path.resolve(process.argv[2])));
if(!source.startsWith(runs+path.sep))throw Error('Expected isolated source run');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const config=JSON.parse(await readFile(path.join(root,'tools/artwork-creator/pilot-correction.json'),'utf8'));
const original=await readFile(path.join(source,'B-04-1024-500.png'));
if(digest(original)!==config.sourceSha256)throw Error('Reviewed selections belong to a different source image');
const out=path.join(runs,'correction-'+Date.now());await mkdir(out);
const put=(name,bytes)=>writeFile(path.join(out,name),bytes,{flag:'wx'});
await put('correction.json',JSON.stringify(config,null,2));
const before={};
for(const name of ['B-04-1024-500.png','object-mask.png','light-mask.png']){
  before[name]=digest(await readFile(path.join(source,name)));await copyFile(path.join(source,name),path.join(out,name));
}
const {data:rgb,info}=await sharp(original).removeAlpha().raw().toBuffer({resolveWithObject:true});
if(info.width!==1024||info.height!==576||info.channels!==3)throw Error('Unregistered source');
const mask=async name=>sharp(path.join(out,name)).extractChannel(0).raw().toBuffer();
const png=data=>sharp(data,{raw:{width:1024,height:576,channels:1}}).png().toBuffer();
const object=await mask('object-mask.png');
const expanded=await sharp(await png(object)).dilate(9).extractChannel(0).raw().toBuffer();
const fill=Buffer.alloc(1024*576);const [cx,cy,rx,ry]=config.glowRemovalEllipse;
for(let y=0;y<576;y++)for(let x=0;x<1024;x++){
  const i=y*1024+x;fill[i]=expanded[i]||((x-cx)**2/rx**2+(y-cy)**2/ry**2<=1)?255:0;
}
await put('backing-fill-mask.png',await png(fill));
const stages=[];
for(const [stage,environment]of [['occlude','torch-rocm721'],['fill','onnx']]){
  const python=path.join(root,'.local/kre00/venvs',environment,'Scripts/python.exe');
  const args=['-B',path.join(root,'tools/artwork-creator/pilot-correction.py'),stage,out];
  const started=Date.now();const log=[];
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(python,args,{windowsHide:true,env:{...process.env,PYTHONNOUSERSITE:'1',HF_HUB_OFFLINE:'1',
      HF_HOME:path.join(root,'.local/kre00/cache/huggingface'),TORCH_HOME:path.join(root,'.local/kre00/cache/torch'),
      MIOPEN_USER_DB_PATH:path.join(root,'.local/kre00/cache/miopen-db'),MIOPEN_CUSTOM_CACHE_DIR:path.join(root,'.local/kre00/cache/miopen-kernels'),
      TMP:path.join(root,'.local/kre00/tmp'),TEMP:path.join(root,'.local/kre00/tmp')}});
    // Windows venv launchers may own a second Python process. End only this owned tree.
    const timer=setTimeout(()=>{
      if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});
      else child.kill();
    },180000);
    child.stdout.on('data',b=>{log.push(b);process.stdout.write(b);});child.stderr.on('data',b=>log.push(b));child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve(code);});
  });
  await put('correction-'+stage+'-worker.txt',Buffer.concat(log));
  stages.push({stage,command:[python,...args],exitCode:code,wallSeconds:(Date.now()-started)/1000});
  await put(stage+'-command.json',JSON.stringify(stages.at(-1),null,2));
  if(code!==0)throw Error(stage+' failed; evidence retained at '+out);
}
const {masks,delay}=selectMaterials(rgb,1024,576,config.paths,fill);
for(const [i,id]of ['west','gate','east'].entries())await put(id+'-light-mask.png',await png(masks[i]));
await put('material-delay.png',await png(delay));
await put('black.svg','<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><path fill="black" d="M0 0H16V9H0Z"/></svg>');
await put('preview-manifest.json',JSON.stringify(correctedManifest(),null,2));
await put('authoring-brief.md',(await readFile(path.join(root,'tools/artwork-creator/corrected-authoring-brief.md'),'utf8')).replace('(../../apps/ui/','(../../../../apps/ui/'));
const occluder=await mask('occlusion-mask.png');
const overlay=Buffer.alloc(1024*576*4);
for(let i=0;i<1024*576;i++){
  const light=Math.max(...masks.map(m=>m[i]));
  overlay[i*4]=occluder[i]?255:0;overlay[i*4+1]=light?255:0;overlay[i*4+3]=Math.round(Math.max(occluder[i],light)*.55);
}
await put('mask-overlay.webp',await sharp(original).composite([{input:overlay,raw:{width:1024,height:576,channels:4}}]).webp({quality:92}).toBuffer());
const after=Object.fromEntries(await Promise.all(Object.keys(before).map(async name=>[name,digest(await readFile(path.join(source,name)))])));
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Source changed during correction');
const artifacts={};for(const asset of correctedManifest().assets){const name=asset.uri.split('/').at(-1);artifacts[name]=digest(await readFile(path.join(out,name)));}
await put('correction-result.json',JSON.stringify({source:path.relative(root,source),recipe:config.recipe,sourceHashesBefore:before,sourceHashesAfter:after,
  sourceUnchanged:true,stages,materialPixels:masks.map(m=>m.reduce((sum,v)=>sum+(v>0),0)),artifacts,scope:config.scope},null,2));
console.log(out);
