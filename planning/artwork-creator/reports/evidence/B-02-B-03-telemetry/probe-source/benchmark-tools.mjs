// KRE-00 adapters: isolated drafts only. Never used by the application.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArtworkPackage} from '../../apps/ui/src/engines/infinite-zoom/artwork/artwork-package.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'apps/ui/package.json'));
const sharp=createRequire(require.resolve('next/package.json'))('sharp');
const sample=path.join(root,'apps/ui/public/infinite-zoom/samples/digital-grid');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function benchmarkManifest(){
  const m=JSON.parse(await readFile(path.join(sample,'manifest.json'),'utf8'));
  // Deliberately different initial period makes the 5-second request a real edit.
  m.layers.find(l=>l.id==='sky-aircraft-beacon').behaviors.find(b=>b.id==='navigation-flash').params.frequencyHz=1/6;
  return m;
}
export async function fingerprint(){
  const m=JSON.parse(await readFile(path.join(sample,'manifest.json'),'utf8'));
  const files=['manifest.json',...new Set(m.assets.map(a=>a.uri.split('/').at(-1)))];
  return Object.fromEntries(await Promise.all(files.map(async name=>[name,hash(await readFile(path.join(sample,name)))])));
}
function fields(args,keys){
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!keys.includes(k)))throw Error('Unsupported tool arguments');
}
export async function executeTool(name,args,directory){
  const out=path.resolve(directory), allowed=path.join(root,'.local/kre00/runs');
  if(!out.startsWith(allowed+path.sep))throw Error('Outputs must stay inside isolated KRE-00 runs');
  await mkdir(out,{recursive:true});
  if(name==='fingerprint')return await fingerprint();
  if(name==='visionFixture'){
    await writeFile(path.join(out,'benchmark-base-manifest.json'),JSON.stringify(await benchmarkManifest(),null,2),{flag:'wx'});
    const source=await readFile(path.join(sample,'plate.png'));
    const {data,info}=await sharp(path.join(sample,'visible-front-wheel.png')).extractChannel(0).raw().toBuffer({resolveWithObject:true});
    for(let y=40;y<100;y++)for(let x=40;x<100;x++)data[y*info.width+x]=255;
    const overlay=Buffer.alloc(info.width*info.height*4);
    for(let i=0;i<data.length;i++){overlay[i*4]=255;overlay[i*4+3]=Math.round(data[i]*.55);}
    await sharp(data,{raw:{width:info.width,height:info.height,channels:1}}).png().toFile(path.join(out,'mask-input.png'));
    await sharp(source).composite([{input:overlay,raw:{width:info.width,height:info.height,channels:4}}]).png().toFile(path.join(out,'mask-overlay.png'));
    return {width:info.width,height:info.height,sourceSha256:hash(source),defectPixels:[40,40,100,100],
      defectNormalized:[.025,40/900,.0625,100/900],note:'Deliberate rectangular spill; not a production artwork revision'};
  }
  if(name==='annotate'){
    fields(args,['file','boxes']);
    if(!['plate.png','mask-overlay.png'].includes(args.file))throw Error('Unknown fixture');
    const input=args.file==='plate.png'?path.join(sample,args.file):path.join(out,'..','fixture',args.file);
    const boxes=args.boxes;
    if(!Array.isArray(boxes)||boxes.length>4)throw Error('Invalid boxes');
    for(const b of boxes)if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b.some(v=>v<0||v>1)||b[2]<=b[0]||b[3]<=b[1])throw Error('Invalid normalized box');
    const svg=`<svg width="1600" height="900">${boxes.map(b=>`<rect x="${b[0]*1600}" y="${b[1]*900}" width="${(b[2]-b[0])*1600}" height="${(b[3]-b[1])*900}" fill="none" stroke="#00ff00" stroke-width="4"/>`).join('')}</svg>`;
    await sharp(input).composite([{input:Buffer.from(svg)}]).png().toFile(path.join(out,'prediction.png'));
    return {artifact:'prediction.png',sha256:hash(await readFile(path.join(out,'prediction.png')))};
  }
  if(name==='refineMask'){
    fields(args,['maskId','rectangle']);
    if(args.maskId!=='front-wheel-test')throw Error('Unknown mask ID');
    const r=args.rectangle;
    if(!Array.isArray(r)||r.length!==4||!r.every(Number.isInteger)||r[0]<0||r[1]<0||r[2]>1600||r[3]>900||r[2]<=r[0]||r[3]<=r[1])throw Error('Invalid mask rectangle');
    const input=path.join(out,'..','fixture','mask-input.png');
    const {data,info}=await sharp(input).extractChannel(0).raw().toBuffer({resolveWithObject:true});
    let changed=0;
    for(let y=r[1];y<r[3];y++)for(let x=r[0];x<r[2];x++){const i=y*info.width+x;if(data[i])changed++;data[i]=0;}
    const artifact=path.join(out,'mask-corrected.png');
    // Exclusive write: a repeated tool call cannot overwrite earlier evidence.
    await writeFile(artifact,await sharp(data,{raw:{width:info.width,height:info.height,channels:1}}).png().toBuffer(),{flag:'wx'});
    return {ok:true,artifact:'mask-corrected.png',changedPixels:changed,sha256:hash(await readFile(artifact))};
  }
  if(name==='reportUnsupported'){
    fields(args,['effect']);
    if(typeof args.effect!=='string'||args.effect.length>500)throw Error('Invalid effect description');
    const limitation={ok:false,code:'UNSUPPORTED_EFFECT',recorded:true,effect:args.effect,
      error:'The tool exists and recorded this limitation; the requested engine effect is unavailable. No effect applied.'};
    await writeFile(path.join(out,'limitation.json'),JSON.stringify(limitation,null,2),{flag:'wx'});
    return limitation;
  }
  const m=await benchmarkManifest();
  if(name==='setBeaconPeriod'){
    fields(args,['periodSeconds']);
    if(typeof args.periodSeconds!=='number'||!Number.isFinite(args.periodSeconds))throw Error('periodSeconds must be a finite number');
    const b=m.layers.find(l=>l.id==='sky-aircraft-beacon').behaviors.find(b=>b.id==='navigation-flash');
    b.params.frequencyHz=1/args.periodSeconds;
    parseArtworkPackage(m); // Genuine engine error, including period=0 -> Infinity.
    if(args.periodSeconds<=0)throw Error('Period must be positive');
  }else if(name==='setFlightPath'){
    fields(args,['travel']);
    // All three parts move together; no detached beacon or wake.
    for(const l of m.layers.filter(l=>l.travel))l.travel=structuredClone(args.travel);
    parseArtworkPackage(m);
  }else throw Error(`Unsupported tool: ${name}; no engine extension available`);
  const bytes=JSON.stringify(m,null,2);
  await writeFile(path.join(out,'draft-manifest.json'),bytes,{flag:'wx'});
  return {ok:true,artifact:'draft-manifest.json',sha256:hash(bytes),validatedBy:'parseArtworkPackage',
    ...(name==='setBeaconPeriod'?{periodSeconds:args.periodSeconds,frequencyHz:1/args.periodSeconds,previousFrequencyHz:1/6}:{}),
    ...(name==='setFlightPath'?{layers:m.layers.filter(l=>l.travel).map(l=>l.id)}:{})};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{process.stdin.setEncoding('utf8');let stdin='';for await(const chunk of process.stdin)stdin+=chunk;const input=JSON.parse(stdin);console.log(JSON.stringify(await executeTool(input.name,input.arguments,input.output)));}
  catch(error){console.log(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
}
