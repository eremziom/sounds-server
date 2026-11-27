// Archive small review evidence; large sources/video remain inventoried outside Git.
import {readFile,writeFile,mkdir,readdir,stat,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'apps/ui/package.json'));
const sharp=createRequire(require.resolve('next/package.json'))('sharp');
const run=path.resolve(process.argv[2]),qa=path.resolve(process.argv[3]);
if(!run.startsWith(path.join(root,'.local/kre00/runs')+path.sep)||path.dirname(qa)!==run||!path.basename(qa).startsWith('browser-qa-'))throw Error('Expected isolated correction and its QA run');
const label=process.argv[4]??'correction-2026-11-13';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Expected an evidence directory label');
const destination=path.join(root,'planning/artwork-creator/reports/evidence',label);
await mkdir(destination);await mkdir(path.join(destination,'probe-source'));
const record=[];
async function inventory(directory){
  for(const item of await readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,item.name);if(item.isDirectory())await inventory(file);
    else if(item.isFile()){
      const bytes=await readFile(file);record.push({path:path.relative(root,file).replaceAll('\\','/'),bytes:(await stat(file)).size,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
  }
}
const movie=path.join(qa,'motion.webm');
const ffmpeg=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-n','-i',movie,'-vf','fps=1/1.5,scale=384:-1,tile=4x5','-frames:v','1',path.join(destination,'motion-contact.webp')],{windowsHide:true,encoding:'utf8'});
if(ffmpeg.status!==0)throw Error(ffmpeg.stderr);
const ffprobe=spawnSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=width,height,nb_read_frames:format=duration,size','-of','json',movie],{windowsHide:true,encoding:'utf8'});
if(ffprobe.status!==0)throw Error(ffprobe.stderr);
await writeFile(path.join(destination,'recording.json'),ffprobe.stdout,{flag:'wx'});
for(const name of ['correction.json','correction-result.json','correction-occlude.json','correction-fill.json','occlude-command.json','fill-command.json',
  'correction-occlude-worker.txt','correction-fill-worker.txt','authoring-brief.md','preview-manifest.json','mask-overlay.webp',
  'backing-fill-mask.png','occlusion-mask.png','west-light-mask.png','gate-light-mask.png','east-light-mask.png','material-delay.png']){
  if(name==='authoring-brief.md')await writeFile(path.join(destination,name),(await readFile(path.join(run,name),'utf8')).replace('(../../../../apps/ui/','(../../../../../apps/ui/'),{flag:'wx'});
  else await copyFile(path.join(run,name),path.join(destination,name),1);
}
await copyFile(path.join(qa,'result.json'),path.join(destination,'browser-result.json'),1);
for(const name of ['initial-blackout','pillar-crossing','frame-599','flow-0','flow-1','flow-4']){
  await writeFile(path.join(destination,name+'.webp'),await sharp(path.join(qa,name+'.png')).webp({lossless:true}).toBuffer(),{flag:'wx'});
}
const sources={};
for(const name of ['pilot-materials.mjs','pilot-materials.test.mjs','pilot-correction.json','pilot-correction.py','correct-pilot.mjs','corrected-package.mjs',
  'corrected-authoring-brief.md','preview-browser.mjs','preview.browser.mjs','image_ops.py','archive-correction.mjs']){
  const file=path.join(root,'tools/artwork-creator',name),bytes=await readFile(file);
  await writeFile(path.join(destination,'probe-source',name),bytes,{flag:'wx'});sources[name]=createHash('sha256').update(bytes).digest('hex');
}
const guidelines=path.join(root,'apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md');
sources['artwork-authoring-guidelines.md']=createHash('sha256').update(await readFile(guidelines)).digest('hex');
await inventory(run);
await writeFile(path.join(destination,'artifact-inventory.json'),JSON.stringify({run:path.relative(root,run),qa:path.relative(root,qa),artifacts:record,sourceHashes:sources},null,2),{flag:'wx'});
console.log(destination);
