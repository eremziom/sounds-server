// Uses the actual engine parser; no replica of its behavior or camera contract.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArtworkPackage} from '../ui/src/engines/infinite-zoom/artwork/artwork-package.ts';
let authorized=false;
for await(const chunk of process.stdin){if(chunk.toString().startsWith('START\n')){authorized=true;break;}throw Error('Invalid supervisor authorization');}
if(!authorized)throw Error('Supervisor disconnected');
const directory=path.resolve(process.argv[2]), root=path.resolve(process.env.ARTWORK_JOB_ROOT);
if(!directory.startsWith(root+path.sep))throw Error('Outside operation root');
const request=JSON.parse(await readFile(path.join(directory,'request.json'),'utf8'));
const snapshot=structuredClone(request.snapshot), args=request.arguments;
if(request.tool==='setBehaviors'||request.tool==='setTravel'){
 const layer=snapshot.layers.find(l=>l.id===args.layerId);if(!layer)throw Error('Unknown layer');
 layer.parameters={...layer.parameters,[request.tool==='setTravel'?'travel':'behaviors']:request.tool==='setTravel'?args.travel:args.behaviors};
}
const maskKinds=['visibility-mask','occlusion-mask','material-mask','influence-map','delay-map'];
const availableAssets=request.artifacts.filter(a=>a.kind!=='report').map(a=>({id:a.id,kind:maskKinds.includes(a.kind)?'mask':a.kind,
 uri:`/infinite-zoom/jobs/${request.jobId}/${a.id}.png`,width:a.width,height:a.height,critical:true}));
const layers=snapshot.layers.map((l,index)=>{
 const p=l.parameters??{};
 if(Object.keys(p).some(k=>!['zIndex','maskAssetId','occlusionMaskAssetId','behaviors','regions','constraints','travel','spin','blendMode','lods'].includes(k)))throw Error('Unsupported draft layer parameter');
 const allowed=new Set(l.maskArtifactIds);
 if(p.maskAssetId&&!allowed.has(p.maskAssetId))throw Error('Unregistered layer visibility mask');
 if(p.occlusionMaskAssetId&&!allowed.has(p.occlusionMaskAssetId))throw Error('Unregistered layer occlusion mask');
 const roles={maskAssetId:['visibility-mask','material-mask'],occlusionMaskAssetId:['occlusion-mask'],influenceMaskAssetId:['influence-map'],delayMapAssetId:['delay-map'],depthAssetId:['depth'],fieldAssetId:['flow']};
 const bindings=value=>{
  if(!value||typeof value!=='object')return;
  for(const [key,ref]of Object.entries(value)){
   if(Object.hasOwn(roles,key)){
    const artifact=request.artifacts.find(a=>a.id===ref),image=request.artifacts.find(a=>a.id===l.imageArtifactId);
    if(!artifact||!roles[key].includes(artifact.kind)||!artifact.inputs.some(i=>i.inputId===image.id)||!image.registrationId||artifact.registrationId!==image.registrationId||artifact.width!==image.width||artifact.height!==image.height)throw Error('Map is not registered to this exact layer image or role');
    if(maskKinds.includes(artifact.kind)&&!allowed.has(artifact.id))throw Error('Map must be explicitly selected by its layer');
   }else bindings(ref);
  }
 };
 bindings(p);
 return {id:l.id,zIndex:index,...p,imageAssetId:l.imageArtifactId};
});
const base=[...layers].sort((a,b)=>a.zIndex-b.zIndex)[0];
const used=new Set(layers.map(l=>l.imageAssetId));
const references=value=>{if(!value||typeof value!=='object')return;for(const [key,ref]of Object.entries(value)){if((key.endsWith('AssetId')||key==='assetId')&&typeof ref==='string')used.add(ref);else references(ref);}};
layers.forEach(references);
const assets=availableAssets.filter(a=>used.has(a.id));
const manifest={schemaVersion:2,id:`project-${request.projectId}`,version:`job-${request.jobId}`,canvas:{width:3840,height:2160},assets,layers,coverage:{baseLayerId:base?.id},anchors:[]};
const validated=parseArtworkPackage(manifest);
const previewControls={environmentLayerIds:args.environmentLayerIds??[],lightLayerIds:args.lightLayerIds??[]};
for(const id of [...previewControls.environmentLayerIds,...previewControls.lightLayerIds])if(!layers.some(l=>l.id===id)||id===base.id)throw Error('Preview controls require explicit non-coverage layers');
if(previewControls.environmentLayerIds.some(id=>previewControls.lightLayerIds.includes(id)))throw Error('Environmental and protected light layers must be separate');
const estimatedTextureBytes=assets.reduce((sum,a)=>sum+a.width*a.height*(a.kind==='mask'?1:4),0);
if(estimatedTextureBytes>192*1024*1024)throw Error('Preview texture budget exceeded');
await writeFile(path.join(directory,'result.json'),JSON.stringify({outputs:[{name:'package',file:'package.json',kind:'report',registration:'none'}],details:{runtimeSchema:validated.schemaVersion,visualAcceptance:false}}),{flag:'wx'});
await writeFile(path.join(directory,'package.json'),JSON.stringify({snapshotCandidate:snapshot,manifest,assetBindings:assets.map(a=>({artifactId:a.id,uri:a.uri})),previewControls,technicalReport:{estimatedTextureBytes,sourceDimensions:assets.filter(a=>a.kind==='image').map(a=>({id:a.id,width:a.width,height:a.height})),visualAcceptance:false},published:false,visualAcceptance:false},null,2),{flag:'wx'});
