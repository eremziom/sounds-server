import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {createRiverMasks,grayPng,RIVER_MOTION,RIVER_ROCKS} from "./lib/forest-river-masks.mjs";

export const root=new URL("../public/infinite-zoom/samples/forest-layered/",import.meta.url);
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1672 941" preserveAspectRatio="none">${body}</svg>`;
const op=(kind,params,order=0,extra={})=>({id:kind,kind,order,params:{frequencyHz:0.2,phase:0,...params},...extra});

/** Package original generated PNGs without modifying their pixels. SVG image
 * containers register rounded source dimensions to the engine's 16:9 domain.
 * Their 1600x900 runtime texture is a downsample, never a native-4K claim. */
export async function createLayeredForest(){
  await mkdir(root,{recursive:true});
  const assets=[],sources=[];
  for(const id of ["plate","foliage","mist"]){
    const png=await readFile(new URL(`${id}.png`,root));
    const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
    sources.push({id,file:`${id}.png`,width,height,sha256:createHash("sha256").update(png).digest("hex")});
    await writeFile(new URL(`${id}.svg`,root),svg(`<image width="1672" height="941" preserveAspectRatio="none" href="data:image/png;base64,${png.toString("base64")}"/>`));
    assets.push({id,uri:`/infinite-zoom/samples/forest-layered/${id}.svg`,kind:"image",width:1600,height:900,critical:true});
  }
  const river=createRiverMasks();
  for(const[id,data]of [["mask-water",river.visibility],["mask-stationary",river.stationary],["water-influence",river.influence]]){
    await writeFile(new URL(`${id}.png`,root),grayPng(river.width,river.height,data));
    assets.push({id,uri:`/infinite-zoom/samples/forest-layered/${id}.png`,kind:"mask",width:river.width,height:river.height,critical:true});
  }
  const masks={
    left:'<path d="M 0 360 H 700 V 941 H 0 Z" fill="white"/>',
    right:'<path d="M 1050 360 H 1672 V 941 H 1050 Z" fill="white"/>',
    lights:'<path d="M 18 421 Q 78 390 118 426 L 147 504 Q 65 520 15 483 Z M 1372 223 Q 1436 203 1503 234 L 1507 304 Q 1437 329 1374 289 Z M 1178 331 Q 1215 328 1252 344 L 1247 385 L 1183 385 Z M 1450 437 Q 1486 421 1530 448 L 1533 486 L 1455 490 Z" fill="white"/>',
  };
  for(const [id,shape]of Object.entries(masks)){
    await writeFile(new URL(`mask-${id}.svg`,root),svg(`<defs><filter id="f" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="12"/></filter></defs><rect width="1672" height="941" fill="black"/><g filter="url(#f)">${shape}</g>`));
    assets.push({id:`mask-${id}`,uri:`/infinite-zoom/samples/forest-layered/mask-${id}.svg`,kind:"mask",width:1600,height:900,critical:true});
  }
  const maps={
    "leaf-influence":`<defs><linearGradient id="f" x1="0" y1=".56" x2="0" y2=".93"><stop stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient></defs><rect width="1672" height="941" fill="url(#f)"/>`,
    depth:'<defs><linearGradient id="f" x2="0" y2="1"><stop stop-color="#777"/><stop offset="1" stop-color="#eee"/></linearGradient></defs><rect width="1672" height="941" fill="url(#f)"/>',
    "water-field":'<defs><linearGradient id="f" x1=".2" y1=".4" x2=".8" y2="1"><stop stop-color="#60a080"/><stop offset=".45" stop-color="#a8b080"/><stop offset="1" stop-color="#60c080"/></linearGradient></defs><rect width="1672" height="941" fill="url(#f)"/>',
  };
  for(const[id,body]of Object.entries(maps)){
    await writeFile(new URL(`${id}.svg`,root),svg(body));
    assets.push({id,uri:`/infinite-zoom/samples/forest-layered/${id}.svg`,kind:id==="depth"?"depth":id==="water-field"?"flow":"mask",width:1600,height:900,critical:true});
  }
  const pinned={influenceMaskAssetId:"leaf-influence"};
  const manifest={schemaVersion:2,id:"forest-layered",version:"0.2.0",canvas:{width:3840,height:2160},assets,layers:[
    {id:"plate",zIndex:0,imageAssetId:"plate"},
    {id:"river",zIndex:1,imageAssetId:"plate",maskAssetId:"mask-water",behaviors:[op("wave",{amplitude:RIVER_MOTION.waveAmplitude,wavelength:1100,axis:"x"},0,{influenceMaskAssetId:"water-influence"}),op("flow",{amplitude:RIVER_MOTION.flowAmplitude,fieldAssetId:"water-field",frequencyHz:0.13},1,{influenceMaskAssetId:"water-influence"})]},
    {id:"stationary-banks-rocks",zIndex:2,imageAssetId:"plate",maskAssetId:"mask-stationary"},
    {id:"mushroom-light",zIndex:3,imageAssetId:"plate",maskAssetId:"mask-lights",behaviors:[op("pulse",{amount:0.5,frequencyHz:0.16}),op("glow",{amount:0.6,threshold:0.15},1),op("colorShift",{hue:0.2,saturation:0.15,lightness:0.025,frequencyHz:0.09},2)]},
    {id:"river-mist",zIndex:4,imageAssetId:"mist",behaviors:[op("translate",{x:45,y:7,frequencyHz:0.09}),op("displace",{amplitude:35,fieldAssetId:"water-field",frequencyHz:0.12},1),op("opacity",{base:0.75,amount:0.25,frequencyHz:0.1},2)]},
    {id:"left-ferns",zIndex:5,imageAssetId:"foliage",maskAssetId:"mask-left",behaviors:[op("bend",{amount:160,pivotX:690,pivotY:0,axis:"x",frequencyHz:0.24},0,pinned),op("rotate",{radians:0.022,pivotX:690,pivotY:1960,frequencyHz:0.18},1,pinned)]},
    {id:"right-ferns",zIndex:6,imageAssetId:"foliage",maskAssetId:"mask-right",behaviors:[op("scale",{x:0.04,y:0.025,pivotX:3380,pivotY:2040,frequencyHz:0.2},0,pinned),op("parallax",{amount:90,depthAssetId:"depth",referenceDepth:0.3},1,pinned)]},
  ],coverage:{baseLayerId:"plate"},anchors:[{id:"center",x:1920,y:1080}]};
  await writeFile(new URL("manifest.json",root),JSON.stringify(manifest,null,2)+"\n");
  await writeFile(new URL("production.json",root),JSON.stringify({schemaVersion:1,artworkId:manifest.id,version:manifest.version,tool:"built-in image_gen",paidApiCalls:0,sources,
    runtimeTexture:{width:1600,height:900,native4K:false,registration:"Each unmodified PNG maps to the same full-frame 16:9 domain; generator rounded dimensions are registered by SVG image containers."},
    cleanPlate:"Generated complete moss, earth, rocks and river before separate foreground foliage and mist. No fern is baked into the plate at the two authored root sites.",
    water:"Hand-traced banks and exposed-rock exclusions. Static bank/rock layer above river; distance-limited wave+flow cannot sample protected rock/bank pixels. Original plate remains unchanged; no AI inpainting is claimed.",
    riverGuard:{stationaryRocks:RIVER_ROCKS.map(r=>r.id),maximumTravelTexels:river.maximumTravel,rampTexels:river.rampPixels,safetyTexels:RIVER_MOTION.safetyPixels,method:"Offline conservative chessboard distance to non-water; influence rounded down. Bound includes both operators at full authored strength, all phases and bilinear slack."},
    layers:manifest.layers.map(l=>({id:l.id,source:l.imageAssetId,behaviors:l.behaviors?.map(b=>b.kind)??[]})),
    limitations:["Flow is bounded periodic texture deformation, not continuously advected water","No authored portal for the new scene","Target-device performance and artistic approval still required"]},null,2)+"\n");
  return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await createLayeredForest();console.log(`Packaged ${fileURLToPath(root)}`);}
