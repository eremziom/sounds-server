// Copies existing KRE-03 pixels unchanged; this is not a new generation or acceptance.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const source=path.join(root,'.local/kre03/runs/pilot-1794572870608/bundle-a46639a94e15ec44');
const target=path.join(root,'apps/api/resources/artwork-starters/night-garden');
const packaged=JSON.parse(await readFile(path.join(source,'package.json'),'utf8'));
const provenance=JSON.parse(await readFile(path.join(source,'provenance.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const selected=new Set(packaged.assetBindings.map(binding=>binding.artifactId));
const artifacts=[];
await mkdir(target,{recursive:true});
for(const binding of packaged.assetBindings){
  if(!/^\/infinite-zoom\/jobs\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.png$/.test(binding.uri))throw Error('Invalid binding');
  const meta=provenance.artifacts.find(a=>a.id===binding.artifactId);
  const sourcePath=path.join(source,binding.uri.slice(1)),bytes=await readFile(sourcePath);
  if(!meta||sha(bytes)!==meta.sha256)throw Error('Source checksum mismatch');
  const inputs=meta.inputs.map(i=>i.inputId).filter(id=>selected.has(id));
  if(meta.kind!=='image'&&!inputs.some(id=>provenance.artifacts.find(a=>a.id===id)?.kind==='image'))throw Error('Map has no selected image');
  artifacts.push({id:meta.id,kind:meta.kind,sha256:meta.sha256,width:meta.width,height:meta.height,registrationId:meta.registrationId,inputIds:inputs,file:meta.id+'.png'});
  const destination=path.join(target,meta.id+'.png');
  try{await copyFile(sourcePath,destination,constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST'||sha(await readFile(destination))!==meta.sha256)throw error;}
}
const snapshot={...packaged.snapshotCandidate,artifactIds:[...selected],decisions:['Private copy of KRE-03 technical pilot; not published or artistically accepted. Source package SHA256 '+sha(await readFile(path.join(source,'package.json')))]};
const definition={version:1,title:'Nocny ogród — dron (pilot KRE-03)',snapshot,artifacts,previewControls:packaged.previewControls,sourcePackageSha256:sha(await readFile(path.join(source,'package.json')))};
await writeFile(path.join(target,'definition.json'),JSON.stringify(definition,null,2)+'\n');
await writeFile(path.join(target,'authoring-brief.md'),await readFile(path.join(source,'authoring-brief.md')));
console.log(JSON.stringify({artifacts:artifacts.length,bytes:(await Promise.all(artifacts.map(a=>readFile(path.join(target,a.file))))).reduce((sum,b)=>sum+b.length,0)}));
