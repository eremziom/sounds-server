import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {produceScene} from './production-client.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const recipe={title:'Durability fixture',brief:{guidelinesPath:'apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md',guidelinesVersion:'1.7'},steps:[{key:'source',tool:'createColorPlate',arguments:{width:16,height:9,rgb:[0,0,0]},inputs:[]}]};
// JSONB does not preserve object key order. Recovery must compare semantic content.
const reordered=value=>Array.isArray(value)?value.map(reordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(k=>[k,reordered(value[k])])):value;
async function fixture(run){
 await mkdir(path.join(root,'.tmp'),{recursive:true});
 const directory=await mkdtemp(path.join(root,'.tmp/kre03-client-')),originalFetch=globalThis.fetch;
 const project={id:'project',activeRevisionId:null,revision:null};let revisions=0,jobs=0,failRevision=false;
 globalThis.fetch=async(url,options={})=>{
  const route=new URL(url).pathname,body=options.body?JSON.parse(options.body):undefined;let result;
  if(route==='/artworks/projects'&&body)result={id:project.id};
  else if(route.endsWith('/revisions')&&body){
   assert.equal(body.baseRevisionId??null,project.activeRevisionId);
   project.revision={id:'revision-'+(++revisions),parentId:project.activeRevisionId,snapshot:reordered(body.snapshot)};
   project.activeRevisionId=project.revision.id;result=project.revision;
   if(failRevision){failRevision=false;throw Error('Connection lost after revision commit');}
  }else if(route.endsWith('/messages'))result={id:'message'};
  else if(route.endsWith('/jobs')&&body){jobs++;result={id:'job',state:'succeeded',result:{outputs:[{artifactId:'image-'+jobs}]}};}
  else if(route==='/artworks/projects/project')result=project;
  else throw Error('Unexpected fixture route: '+route);
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const produce=(overrides={})=>produceScene({apiUrl:'http://fixture',recipe,directory,until:'source',...overrides});
 try{await run({produce,project,directory,setFailRevision:()=>{failRevision=true;},counts:()=>({revisions,jobs})});}
 finally{globalThis.fetch=originalFetch;await rm(directory,{recursive:true,force:true});}
}

test('resume does not repeat completed jobs or revisions',async()=>fixture(async({produce,counts})=>{
 await produce();const before=counts();await produce();assert.deepEqual(counts(),before);
}));
test('recover an exact committed revision after lost response, including JSONB key reordering',async()=>fixture(async({produce,setFailRevision,counts})=>{
 setFailRevision();await assert.rejects(produce(),/Connection lost/);await produce();assert.deepEqual(counts(),{revisions:2,jobs:1});
}));
test('reject an outside edit even if it inherits coordinator decisions',async()=>fixture(async({produce,project})=>{
 await produce();project.revision={...project.revision,id:'external',parentId:project.activeRevisionId,snapshot:{...project.revision.snapshot,brief:{...project.revision.snapshot.brief,intent:'Outside edit'}}};project.activeRevisionId='external';
 await assert.rejects(produce(),/changed outside/);
}));
test('resume a plan written before its checkpoint was saved',async()=>fixture(async({produce,directory})=>{
 await produce();const filename=path.join(directory,'production-state.json'),state=JSON.parse(await readFile(filename,'utf8'));state.plans=[];await writeFile(filename,JSON.stringify(state));await produce();
}));
test('long correction sequences stay within snapshot limits and retain revision history',async()=>fixture(async({produce,project,counts})=>{
 const steps=Array.from({length:105},(_,i)=>({...recipe.steps[0],key:'source-'+i}));
 await produce({recipe:{...recipe,steps},until:'source-104'});
 assert.equal(project.revision.snapshot.decisions.length,100);
 assert.equal(project.revision.snapshot.artifactIds.length,105);
 assert.deepEqual(counts(),{revisions:106,jobs:105});
}));
