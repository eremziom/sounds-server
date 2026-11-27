// Static QA evidence for B-02, not a revised production artwork.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const directory=path.resolve(process.argv[2]);
if(!directory.startsWith(path.join(root,'.local/kre00/runs')+path.sep))throw Error('Expected isolated run');
const require=createRequire(path.join(root,'apps/ui/package.json'));
const sharp=createRequire(require.resolve('next/package.json'))('sharp');
const names=['vehicle','defect','defect-hint'];
const labels=['Vehicle: no hint','Mask defect: no hint','Mask defect: location hint'];
const layers=await Promise.all(names.map(async(name,i)=>({input:await sharp(path.join(directory,`B-02-${name}-0/prediction.png`)).resize(480,270).png().toBuffer(),left:i*480,top:40})));
const svg=`<svg width="1440" height="40">${labels.map((text,i)=>`<text x="${i*480+12}" y="26" fill="white" font-size="18">${text}</text>`).join('')}</svg>`;
layers.push({input:Buffer.from(svg),left:0,top:0});
const bytes=await sharp({create:{width:1440,height:310,channels:3,background:'#111111'}}).composite(layers).webp({quality:86}).toBuffer();
await writeFile(path.join(directory,'review.webp'),bytes,{flag:'wx'});
console.log(JSON.stringify({file:path.join(directory,'review.webp'),bytes:bytes.length}));
