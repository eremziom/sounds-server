// Developer acceptance client for KRE-03. Every image/map/package is produced by API jobs.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const snapshotHash=value=>hash(canonical(value));
const safeKey=value=>{if(typeof value!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(value))throw Error('Invalid production step key');return value;};

export async function produceScene({apiUrl,headers={},recipe,directory,until,onProgress=()=>{}}){
 directory=path.resolve(directory);await mkdir(directory,{recursive:true});
 if(recipe.brief.guidelinesPath!=='apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md')throw Error('Use the shared artwork authoring guidelines');
 const guidelines=await readFile(path.join(repo,recipe.brief.guidelinesPath),'utf8');
 if(!guidelines.includes(`**${recipe.brief.guidelinesVersion}**`))throw Error('Scene brief must use the current shared guideline version');
 const planHash=hash(recipe),statePath=path.join(directory,'production-state.json');
 const save=async()=>{await writeFile(statePath+'.next',JSON.stringify(state,null,2));await rename(statePath+'.next',statePath);};
 const request=async(route,options={})=>{
  const response=await fetch(apiUrl+route,{...options,headers:{...headers,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(`API ${response.status}: ${body.code??body.message??route}`);}
  return response;
 };
 const json=async(route,body)=> (await request(route,body===undefined?{}:{method:'POST',body:JSON.stringify(body)})).json();
 let state;
 try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!state){const project=await json('/artworks/projects',{title:recipe.title});state={version:1,runId:randomUUID(),projectId:project.id,revisionId:null,assets:{},completed:{},requests:{},plans:[],package:null};await save();}
 const base=`/artworks/projects/${state.projectId}`;
 let project=await json(base);
 if(project.activeRevisionId!==state.revisionId){
  // Recover a client crash after its revision commit but before its checkpoint rename.
  if(!state.pendingRevision||project.revision?.parentId!==state.revisionId||snapshotHash(project.revision.snapshot)!==state.pendingRevision.snapshotHash)throw Error('Production project changed outside this coordinator; reload/review it explicitly');
  state.revisionId=project.activeRevisionId;delete state.pendingRevision;await save();
 }
 let snapshot=project.revision?.snapshot??{schemaVersion:1,brief:recipe.brief,layers:[],artifactIds:[],decisions:[]};
 const saveSnapshot=async(candidate,marker)=>{
  // A snapshot has at most 100 decisions. Earlier operation markers remain in
  // immutable revision history; never discard a user's authored decision.
  const decisions=[...candidate.decisions],prefix=`Production ${state.runId} `;
  while(decisions.length>=100){const index=decisions.findIndex(d=>d.startsWith(prefix));if(index<0)throw Error('Snapshot decision limit reached; review authored decisions explicitly');decisions.splice(index,1);}
  const next={...candidate,decisions:[...decisions,prefix+marker]};
  state.pendingRevision={snapshotHash:snapshotHash(next)};await save();
  const updated=await json(base+'/revisions',{...(state.revisionId?{baseRevisionId:state.revisionId}:{}),snapshot:next});
  state.revisionId=updated.id;snapshot=updated.snapshot;delete state.pendingRevision;await save();return updated;
 };
 if(!state.revisionId)await saveSnapshot(snapshot,'brief');
 if(!state.plans.includes(planHash)){
  const planPath=path.join(directory,'plan-'+planHash+'.json'),planBytes=JSON.stringify(recipe,null,2);
  try{await writeFile(planPath,planBytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||await readFile(planPath,'utf8')!==planBytes)throw error;}
  state.plans.push(planHash);state.package=null;await save();
  await json(base+'/messages',{text:'Production plan '+planHash+'; shared guidelines '+recipe.brief.guidelinesVersion+' SHA256 '+hash(guidelines)});
 }
 const artifact=key=>{if(!state.assets[key])throw Error('Missing preceding artifact: '+key);return state.assets[key];};
 const report=async key=> (await request(base+'/artifacts/'+artifact(key)+'/file')).json();
 async function execute(step){
  safeKey(step.key);
  const fingerprint=hash(step);
  if(state.completed[step.key]){if(state.completed[step.key]!==fingerprint)throw Error('Completed operation changed; author a new correction step key');return;}
  const inputIds=(step.inputs??[]).map(artifact);
  const dto=state.requests[step.key]??{baseRevisionId:state.revisionId,requestKey:state.runId+'.'+step.key,tool:step.tool,arguments:step.arguments,inputIds};
  if(dto.tool!==step.tool||hash(dto.arguments)!==hash(step.arguments)||hash(dto.inputIds)!==hash(inputIds))throw Error('Pending operation changed; keep its original request or use a new correction key');
  state.requests[step.key]=dto;await save();
  let job=await json(base+'/jobs',dto);const started=Date.now();onProgress({step:step.key,jobId:job.id,state:job.state});
  while(job.state==='queued'||job.state==='running'){
   if(Date.now()-started>1200000)throw Error('Production wait deadline; checkpoint retained, last state '+job.phase);
   await delay(500);job=await json(base+'/jobs/'+job.id);
  }
  if(job.state!=='succeeded')throw Error(`Production step ${step.key}: ${job.state}/${job.errorCode}; use the job API to retry and resume`);
  if(job.result.outputs.length!==1)throw Error('Expected exactly one named result');
  const id=job.result.outputs[0].artifactId;state.assets[step.key]=id;await save();
  if(!snapshot.artifactIds.includes(id))await saveSnapshot({...snapshot,artifactIds:[...snapshot.artifactIds,id]},'step '+step.key);
  state.completed[step.key]=fingerprint;await save();onProgress({step:step.key,jobId:job.id,state:'succeeded'});
 }
 for(const step of recipe.steps){await execute(step);if(until===step.key)return {state,complete:false};}
 const expand=async value=>{
  if(typeof value==='string'&&value.startsWith('artifact:'))return artifact(value.slice(9));
  if(Array.isArray(value))return Promise.all(value.map(expand));
  if(value&&typeof value==='object'){
   if(Object.keys(value).length===1&&value.pivotFromSelection){const r=await report(value.pivotFromSelection);if(!r.centroid)throw Error('Cannot choose pivot from empty selection');const metadata=(await json(base+'/artifacts')).find(a=>a.id===artifact(recipe.steps.find(s=>s.key===value.pivotFromSelection).inputs[0]));return {x:r.centroid.x*3840/metadata.width,y:r.centroid.y*2160/metadata.height};}
   return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await expand(v)])));
  }
  return value;
 };
 const layers=await expand(recipe.layers);
 const assemblyMarker='assembly '+planHash;
 if(!snapshot.decisions.includes(`Production ${state.runId} ${assemblyMarker}`))await saveSnapshot({...snapshot,layers},assemblyMarker);
 const packageKey='package-'+planHash.slice(0,16);
 await execute({key:packageKey,tool:'buildPreviewPackage',arguments:recipe.previewControls,inputs:[]});
 state.package={artifactId:artifact(packageKey),planHash};await save();
 const packaged=await report(packageKey);
 const bundle=path.join(directory,'bundle-'+planHash.slice(0,16));await mkdir(bundle,{recursive:true});
 const put=async(relative,bytes)=>{
  const target=path.resolve(bundle,relative);if(!target.startsWith(bundle+path.sep))throw Error('Export outside bundle');
  await mkdir(path.dirname(target),{recursive:true});
  try{const old=await readFile(target);if(hash(old)!==hash(bytes))throw Error('Immutable bundle already contains different bytes: '+relative);return;}catch(e){if(e.code!=='ENOENT')throw e;}
  await writeFile(target,bytes,{flag:'wx'});
 };
 const allArtifacts=await json(base+'/artifacts');
 for(const binding of packaged.assetBindings){
  if(!/^\/infinite-zoom\/jobs\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.png$/.test(binding.uri))throw Error('Unsupported package asset binding');
  const meta=allArtifacts.find(a=>a.id===binding.artifactId),bytes=Buffer.from(await(await request(base+'/artifacts/'+binding.artifactId+'/file')).arrayBuffer());
  if(!meta||hash(bytes)!==meta.sha256)throw Error('Artifact export checksum mismatch');await put(binding.uri.slice(1),bytes);
 }
 await put('manifest.json',JSON.stringify(packaged.manifest,null,2));
 await put('package.json',JSON.stringify(packaged,null,2));
 await put('authoring-brief.md',`# ${recipe.title}\n\nShared guidelines [v${recipe.brief.guidelinesVersion}](${path.relative(bundle,path.join(repo,recipe.brief.guidelinesPath)).replaceAll('\\','/')}), SHA256 ${hash(guidelines)}.\n\n`+Object.entries(recipe.brief).map(([k,v])=>`## ${k}\n${v}\n`).join('\n')+'\n## Production and acceptance\nAll source images, masks, maps and the manifest were produced by registered API jobs. No output pixels or manifest were hand-edited. Source images are 1024x576; the 3840x2160 canvas is a coordinate system, not native 4K. Motion/zoom and visual acceptance are recorded separately by QA.\n');
 const allJobs=[];let cursor;
 do{const page=await json(base+'/jobs'+(cursor?'?cursor='+encodeURIComponent(cursor):''));allJobs.push(...page);cursor=page.length===100?page.at(-1).id:null;}while(cursor);
 await put('provenance.json',JSON.stringify({projectId:state.projectId,revisionId:state.revisionId,runId:state.runId,planHash,recipe,artifacts:allArtifacts,jobs:allJobs,published:false},null,2));
 state.bundle=path.relative(directory,bundle);await save();onProgress({state:'packaged',bundle});
 return {state,bundle,complete:true};
}
