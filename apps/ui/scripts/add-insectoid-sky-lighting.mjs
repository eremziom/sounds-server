import {readFile,writeFile,mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createSkyLighting,extractSkyLighting} from "./lib/insectoid-sky-lighting.mjs";
import {sharp} from "./lib/insectoid-chitin-rims.mjs";

const root=new URL("../public/infinite-zoom/samples/insectoid-planet/",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("manifest.json",root),"utf8"));
const assets=[],layers=[];
const skyLighting=await createSkyLighting({root,layers,async asset(id,kind,data,extension){
  await writeFile(new URL(`${id}.${extension}`,root),data);
  assets.push({id,kind,uri:`/infinite-zoom/samples/insectoid-planet/${id}.${extension}`,width:1600,height:900,critical:true});
}});
manifest.assets=[...manifest.assets.filter(a=>!assets.some(next=>next.id===a.id)),...assets];
manifest.layers=[...manifest.layers.filter(l=>l.id!=="sky-high-attack"),...layers];
manifest.version="0.5.2";
await writeFile(new URL("manifest.json",root),JSON.stringify(manifest,null,2)+"\n");
const production=JSON.parse(await readFile(new URL("production.json",root),"utf8"));
production.version=manifest.version;production.skyLighting=skyLighting;
await writeFile(new URL("production.json",root),JSON.stringify(production,null,2)+"\n");
const maps=await extractSkyLighting(new URL("source.png",root)),rgb=Buffer.from(maps.rgb);
let support=0;const columns=Array(8).fill(0);
for(let i=0;i<maps.material.length;i++){
  const a=maps.material[i]/255*maps.visibility[i]/255;
  if(a>.03){support++;columns[Math.min(7,Math.floor((i%maps.width)*8/maps.width))]++;}
  rgb[i*3]=Math.round(rgb[i*3]*(1-a*.6)+255*a*.6);
  rgb[i*3+1]=Math.round(rgb[i*3+1]*(1-a*.6));rgb[i*3+2]=Math.round(rgb[i*3+2]*(1-a*.6));
}
const review=new URL("../../../.tmp/infinite-zoom-artwork/",import.meta.url);await mkdir(review,{recursive:true});
await sharp(rgb,{raw:{width:maps.width,height:maps.height,channels:3}}).png().toFile(fileURLToPath(new URL("sky-mask-review.png",review)));
console.log(JSON.stringify({version:manifest.version,litTexels:support,skyDistribution:columns}));
