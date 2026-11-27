// B-11 QA manifest only. Not a published scene or application catalog entry.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArtworkPackage} from '../../apps/ui/src/engines/infinite-zoom/artwork/artwork-package.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const directory=path.resolve(process.argv[2]);
if(!directory.startsWith(path.join(root,'.local/kre00/runs')+path.sep))throw Error('Expected isolated run');
const names=[['black','black.svg','image',16,9],['backing','backing.png','image',1024,576],
 ['source','B-04-1024-500.png','image',1024,576],['object','object-mask.png','mask',1024,576],
 ['lights','light-mask.png','mask',1024,576],['env-lights','environment-light-mask.png','mask',1024,576]];
await writeFile(path.join(directory,'black.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><path fill="black" d="M0 0H16V9H0Z"/></svg>',{flag:'wx'});
const assets=names.map(([id,file,kind,width,height])=>({id,kind,width,height,critical:true,uri:'/infinite-zoom/kre00/'+file}));
const travel={startSeconds:0,durationSeconds:12,path:{kind:'bezier',segments:[{control1:{x:400,y:-240},control2:{x:1000,y:-80},to:{x:1440,y:180}}]},
 easing:'ease-in-out',orientToPath:true,pivot:{x:1200,y:840}};
const effects=[{id:'color',kind:'colorShift',order:0,params:{frequencyHz:.125,phase:.7,hue:Math.PI,saturation:.2,lightness:0}},
 {id:'impulse',kind:'glow',order:1,params:{frequencyHz:.2,phase:.7,amount:.6,threshold:0,sharpness:4,intensity:1.5}}];
const manifest={schemaVersion:2,id:'kre00-unverified-pilot',version:'0.0.1',canvas:{width:3840,height:2160},assets,
 layers:[{id:'coverage',zIndex:0,imageAssetId:'black'},
 {id:'environment',zIndex:1,imageAssetId:'backing'},
 {id:'environment-lights',zIndex:2,imageAssetId:'backing',maskAssetId:'env-lights',behaviors:effects},
 {id:'drone',zIndex:3,imageAssetId:'source',maskAssetId:'object',travel},
 {id:'drone-lights',zIndex:4,imageAssetId:'source',maskAssetId:'lights',travel,behaviors:effects}],
 coverage:{baseLayerId:'coverage'},anchors:[]};
parseArtworkPackage(manifest);
await writeFile(path.join(directory,'preview-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
const brief=await readFile(path.join(root,'tools/artwork-creator/klein-authoring-brief.md'),'utf8');
await writeFile(path.join(directory,'preview-authoring-brief.md'),brief.replace('(../../apps/ui/','(../../../../../apps/ui/')+
 '\n## Diagnostic preview, B-11\nUnverified QA package only. Actual drone pivot (1200,840) follows the generated source. '+
 'One 12-second curved flight, separate source visibility, light-material masks and inpainted backing. '+
 'No authored portal, production publish or new engine behavior. Environmental light candidate is a color threshold, '+
 'not accepted precise material selection; full artwork requirements and occlusion QA remain open.\n',{flag:'wx'});
console.log(path.join(directory,'preview-manifest.json'));
