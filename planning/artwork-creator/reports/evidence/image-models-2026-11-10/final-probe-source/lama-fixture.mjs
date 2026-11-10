// Controlled object-removal fixtures; original authored files are read-only.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.resolve(process.argv[2]);
if(!out.startsWith(path.join(root,'.local/kre00/runs')+path.sep))throw Error('Expected isolated run');
const require=createRequire(path.join(root,'apps/ui/package.json'));
const sharp=createRequire(require.resolve('next/package.json'))('sharp');
const samples=path.join(root,'apps/ui/public/infinite-zoom/samples');
const files=['digital-grid/plate.png','digital-grid/aircraft.svg','forest/backdrop.png'];
const digest=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
const before=Object.fromEntries(await Promise.all(files.map(async f=>[f,digest(await readFile(path.join(samples,f)))])));
const sprite=await sharp(path.join(samples,'digital-grid/aircraft.svg')).trim().resize({width:96}).png().toBuffer();
await writeFile(path.join(out,'aircraft-patch.png'),sprite,{flag:'wx'});
const cases=[{id:'open-sky',source:'digital-grid/plate.png',crop:{left:800,top:0,width:512,height:512},at:[140,80]},
 {id:'architecture',source:'digital-grid/plate.png',crop:{left:950,top:0,width:512,height:512},at:[230,305]},
 {id:'organic',source:'forest/backdrop.png',resize:'cover-512',at:[200,260]}];
for(const c of cases){
 const directory=path.join(out,c.id);await mkdir(directory);
 let image=sharp(path.join(samples,c.source));image=c.crop?image.extract(c.crop):image.resize(512,512,{fit:'cover',position:'centre'});
 await image.png().toFile(path.join(directory,'clean.png'));
 await sharp(path.join(directory,'clean.png')).composite([{input:sprite,left:c.at[0],top:c.at[1]}]).png().toFile(path.join(directory,'input.png'));
}
const after=Object.fromEntries(await Promise.all(files.map(async f=>[f,digest(await readFile(path.join(samples,f)))])));
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Source changed');
await writeFile(path.join(out,'fixture.json'),JSON.stringify({cases,sourceHashes:before,sourceUnchanged:true,
 note:'Controlled compositing experiment using an existing sprite, not a new production scene; clean backing is ground truth.'},null,2),{flag:'wx'});
console.log(out);
