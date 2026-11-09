import {readFile,writeFile,mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createVolcanoLava,extractVolcanoLava} from "./lib/insectoid-volcano-lava.mjs";
import {sharp} from "./lib/insectoid-chitin-rims.mjs";
const root=new URL("../public/infinite-zoom/samples/insectoid-planet/",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("manifest.json",root),"utf8")),assets=[],layers=[];
const metadata=await createVolcanoLava({root,layers,async asset(id,kind,data,extension,size={width:1600,height:900}){
  await writeFile(new URL(`${id}.${extension}`,root),data);assets.push({id,kind,uri:`/infinite-zoom/samples/insectoid-planet/${id}.${extension}`,...size,critical:true});
}});
manifest.assets=[...manifest.assets.filter(a=>!assets.some(b=>a.id===b.id)),...assets];
manifest.layers=[...manifest.layers.filter(l=>l.id!=="volcano-lava"),...layers];manifest.version="0.5.4";
await writeFile(new URL("manifest.json",root),JSON.stringify(manifest,null,2)+"\n");
const production=JSON.parse(await readFile(new URL("production.json",root),"utf8"));production.version=manifest.version;production.volcanoLava=metadata;
await writeFile(new URL("production.json",root),JSON.stringify(production,null,2)+"\n");
const maps=await extractVolcanoLava(new URL("source.png",root)),overlay=Buffer.from(maps.rgb);
for(let i=0;i<maps.visibility.length;i++){const a=maps.visibility[i]/255*.65;overlay[i*3]=Math.round(overlay[i*3]*(1-a)+a*255);overlay[i*3+1]=Math.round(overlay[i*3+1]*(1-a));overlay[i*3+2]=Math.round(overlay[i*3+2]*(1-a)+a*255);}
const review=new URL("../../../.tmp/infinite-zoom-artwork/",import.meta.url);await mkdir(review,{recursive:true});
await sharp(overlay,{raw:{width:maps.width,height:maps.height,channels:3}}).png().toFile(fileURLToPath(new URL("volcano-lava-mask-review.png",review)));
console.log(JSON.stringify(metadata));
