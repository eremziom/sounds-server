import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const pilotRoot=new URL("../public/infinite-zoom/samples/forest-pilot/",import.meta.url);
const svg=(body,w=3840,h=2160)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 3840 2160">${body}</svg>`;
const ellipse=(x,y,rx,ry,fill)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;

/** Reuses an unchanged raster plate and authored foreground. New organic SVG
 * elements are independent artwork, with intact plate pixels behind them. */
export async function createForestPilot() {
  await mkdir(pilotRoot,{recursive:true});
  const defs=`<defs>
    <radialGradient id="mist"><stop stop-color="#bceff5" stop-opacity=".8"/><stop offset=".45" stop-color="#8bd4e9" stop-opacity=".5"/><stop offset="1" stop-color="#78c9e4" stop-opacity="0"/></radialGradient>
    <radialGradient id="spark"><stop stop-color="#fff9c9"/><stop offset=".18" stop-color="#91fff0" stop-opacity=".9"/><stop offset="1" stop-color="#5be7e4" stop-opacity="0"/></radialGradient>
    <linearGradient id="leaf" x2="1" y2=".5"><stop stop-color="#173c62"/><stop offset=".5" stop-color="#62e7c8"/><stop offset="1" stop-color="#5896d7"/></linearGradient>
    <linearGradient id="petal" x2=".6" y2="1"><stop stop-color="#f4c2fa"/><stop offset=".5" stop-color="#a658c7"/><stop offset="1" stop-color="#3c356b"/></linearGradient>
    <linearGradient id="cap" x2="0" y2="1"><stop stop-color="#ffb1d9"/><stop offset=".45" stop-color="#ac4989"/><stop offset="1" stop-color="#472d64"/></linearGradient>
  </defs>`;
  let objects=defs;
  const masks={},groups={};let lastOffset=defs.length;
  function feather(id,shape,opacity=1) {
    groups[id]=defs+objects.slice(lastOffset);lastOffset=objects.length;
    masks[id]=`<defs><filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="24"/></filter></defs><rect width="3840" height="2160" fill="black"/><g opacity="${opacity}" fill="white" filter="url(#soft)">${shape}</g>`;
  }
  // Airborne pollen: individually authored small points, not a moving bitmap rectangle.
  for(let i=0;i<30;i++){const x=1260+(i*137%1220),y=500+(i*191%700);objects+=ellipse(x,y,23+(i%3)*5,23+(i%3)*5,"url(#spark)");}
  feather("translate",ellipse(1920,860,850,480,"white"));
  // Hanging seed pod, registered to a branch above the distant clearing.
  objects+=`<path d="M 1420 305 Q 1390 390 1410 492" stroke="#437b75" stroke-width="6" fill="none"/>`;
  for(let i=0;i<5;i++)objects+=`<path d="M 1410 485 Q ${1330+i*30} 560 1410 625 Q ${1490-i*28} 550 1410 485" fill="url(#petal)" fill-opacity=".7"/>`;
  objects+=ellipse(1410,560,12,35,"url(#spark)");feather("rotate",ellipse(1410,505,140,230,"white"));
  // Additional small mushroom on the right bank.
  objects+=`<g transform="translate(3000 1350) scale(1.8) translate(-3000 -1350)"><path d="M 3007 1350 Q 2980 1290 3003 1220" stroke="#a2cccf" stroke-width="16" fill="none"/><path d="M 2910 1232 Q 2990 1115 3090 1232 Q 3000 1275 2910 1232" fill="url(#cap)" stroke="#eca9da" stroke-width="3"/>`;
  for(let i=0;i<8;i++)objects+=ellipse(2940+i*18,1218-(i%3)*10,3,2,"#ffd8f0");objects+="</g>";feather("scale",ellipse(3000,1150,270,300,"white"));
  // The existing independent foreground supplies a genuine transparent depth layer.
  feather("parallax",`<path d="M 0 0 H 1200 Q 600 700 1100 2160 H 0 Z M 2840 0 H 3840 V 2160 H 2700 Q 3300 900 2840 0" fill="white"/>`);
  // Fern: the motion influence gradient pins the stem's base to its rock.
  objects+=`<path d="M 650 1880 Q 640 1750 595 1610" stroke="#5cd7b5" stroke-width="7" fill="none"/>`;
  for(let i=0;i<8;i++){const y=1850-i*30,x=648-i*5;objects+=`<path d="M ${x} ${y} Q ${x-110} ${y-65} ${x-100} ${y-94} Q ${x-30} ${y-85} ${x} ${y}" fill="url(#leaf)"/><path d="M ${x} ${y} Q ${x+80} ${y-85} ${x+120} ${y-75} Q ${x+85} ${y-15} ${x} ${y}" fill="url(#leaf)"/>`;}
  feather("bend",ellipse(630,1750,200,240,"white"));
  // Water highlights follow the existing stream, leaving the opaque plate intact.
  for(let i=0;i<14;i++){const y=1330+i*48,x=1800+(i%4)*40;objects+=`<path d="M ${x-180} ${y} Q ${x} ${y-24} ${x+240} ${y+12}" fill="none" stroke="${i%2?"#9ee2ff":"#b3fff4"}" stroke-opacity=".65" stroke-width="${7+i%3}"/>`;}
  feather("wave",`<path d="M 1670 1250 Q 2200 1370 2620 1680 L 2240 2160 H 1280 Q 1930 1710 1670 1250 Z" fill="white"/>`);
  // Upper haze and lower stream mist use separate alpha envelopes.
  objects+=ellipse(2230,870,520,200,"url(#mist)");
  for(let i=0;i<5;i++)objects+=ellipse(1900+i*140,790+(i%2)*90,135,36,"url(#mist)");
  feather("displace",ellipse(2230,820,600,200,"white"));
  for(let i=0;i<9;i++){const y=1620+i*44;objects+=`<path d="M ${2200-i*40} ${y} q -180 34 -380 12" stroke="#b4e6ff" stroke-opacity=".7" stroke-width="11" fill="none"/>`;}
  feather("flow",ellipse(1910,1860,480,330,"white"));
  feather("pulse",ellipse(300,960,280,360,"white"));
  objects+=ellipse(1870,1330,430,110,"url(#mist)");
  feather("opacity",ellipse(1860,1340,520,160,"white"));
  feather("colorShift",ellipse(3450,1510,390,440,"white"));
  for(let i=0;i<18;i++){const x=2650+(i*83%850),y=1200+(i*113%600);objects+=ellipse(x,y,42,42,"url(#spark)");}
  feather("glow",ellipse(3050,1460,520,420,"white"));
  const kinds=Object.keys(masks),assets=[
    {id:"plate",uri:"/infinite-zoom/samples/forest/backdrop.png",kind:"image",width:3840,height:2160,critical:true},
    {id:"foreground",uri:"/infinite-zoom/samples/forest/foreground.png",kind:"image",width:3840,height:2160,critical:true},
  ];
  const layers=[{id:"plate",zIndex:0,imageAssetId:"plate"}];
  // Deliberately exaggerated review envelopes. Keep the production engine's
  // existing hard limits; 100% means the full authored test amplitude.
  const specs={translate:{x:160,y:90},rotate:{radians:0.11,pivotX:1420,pivotY:305},scale:{x:0.08,y:0.1,pivotX:3000,pivotY:1350},
    parallax:{amount:256,depthAssetId:"depth",referenceDepth:0},bend:{amount:256,pivotX:650,pivotY:0,axis:"x"},wave:{amplitude:90,wavelength:1500,axis:"x"},
    displace:{amplitude:180,fieldAssetId:"field"},flow:{amplitude:180,fieldAssetId:"field"},pulse:{amount:0.95},opacity:{base:0.5,amount:0.5},
    colorShift:{hue:2,saturation:0.8,lightness:0.18},glow:{amount:1,threshold:0}};
  for(const [i,kind] of kinds.entries()) {
    const maskId=`mask-${kind}`;assets.push({id:maskId,uri:`/infinite-zoom/samples/forest-pilot/${maskId}.svg`,kind:"mask",width:960,height:540,critical:true});
    const behavior={id:kind,kind,order:0,params:{frequencyHz:kind==="colorShift"?0.2:0.28+(i%3)*0.06,phase:0,...specs[kind]}};
    if(kind==="bend")behavior.influenceMaskAssetId="influence";
    const imageAssetId=kind==="parallax"?"foreground":["pulse","colorShift"].includes(kind)?"plate":`objects-${kind}`;
    if(imageAssetId.startsWith("objects-")) {
      assets.push({id:imageAssetId,uri:`/infinite-zoom/samples/forest-pilot/${imageAssetId}.svg`,kind:"image",width:1280,height:720,critical:true});
      await writeFile(new URL(`${imageAssetId}.svg`,pilotRoot),svg(groups[kind],1280,720));
    }
    layers.push({id:kind,zIndex:i+1,imageAssetId,maskAssetId:maskId,behaviors:[behavior],...(kind==="bend"?{lods:[{assetId:"fern-detail",minPixelsPerTexel:1.25}]}:{})});
    await writeFile(new URL(`${maskId}.svg`,pilotRoot),svg(masks[kind],960,540));
  }
  for(const [id,kind] of [["depth","depth"],["field","flow"],["influence","mask"]])assets.push({id,uri:`/infinite-zoom/samples/forest-pilot/${id}.svg`,kind,width:960,height:540,critical:true});
  assets.push({id:"fern-detail",uri:"/infinite-zoom/samples/forest-pilot/fern-detail.svg",kind:"detail",width:3840,height:2160,critical:false});
  await writeFile(new URL("fern-detail.svg",pilotRoot),svg(groups.bend));
  const depth=`<defs><radialGradient id="d"><stop stop-color="#303030"/><stop offset=".55" stop-color="#808080"/><stop offset="1" stop-color="#ededed"/></radialGradient></defs><rect width="3840" height="2160" fill="url(#d)"/>`;
  const field=`<defs><linearGradient id="f" x2=".7" y2="1"><stop stop-color="#ed2680"/><stop offset=".5" stop-color="#20e080"/><stop offset="1" stop-color="#e8ef80"/></linearGradient></defs><rect width="3840" height="2160" fill="url(#f)"/>`;
  const influence=`<defs><linearGradient id="m" x2="0" y2="1"><stop stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient></defs><rect width="3840" height="2160" fill="black"/><rect x="390" y="1500" width="500" height="390" fill="url(#m)"/>`;
  await Promise.all([writeFile(new URL("objects.svg",pilotRoot),svg(objects)),writeFile(new URL("depth.svg",pilotRoot),svg(depth,960,540)),
    writeFile(new URL("field.svg",pilotRoot),svg(field,960,540)),writeFile(new URL("influence.svg",pilotRoot),svg(influence,960,540))]);
  const manifest={schemaVersion:2,id:"forest-pilot",version:"0.2.0",canvas:{width:3840,height:2160},assets,layers,coverage:{baseLayerId:"plate"},anchors:[{id:"center",x:1920,y:1080}]};
  await writeFile(new URL("manifest.json",pilotRoot),JSON.stringify(manifest,null,2)+"\n");
  const provenance={schemaVersion:1,artworkId:manifest.id,version:manifest.version,source:"Existing forest sample assets; unchanged raster files",generationApiCalls:0,
    plateStrategy:"Intact opaque forest image behind separately authored organic SVG layers; no raster inpainting claimed",mapEncoding:"depth R [0,1], flow RG [0,1] -> [-1,1], masks red influence/visibility",behaviors:kinds,
    pendingVisualQA:["Painterly/vector style integration","Mask feathering and halo inspection","Neutral versus single-operator comparison","Portrait/wide camera coverage","Audio response and performance on target hardware"]};
  await writeFile(new URL("production.json",pilotRoot),JSON.stringify(provenance,null,2)+"\n");
  // Keep source availability explicit, without copying or editing existing art.
  await readFile(new URL("../forest/manifest.json",pilotRoot),"utf8");
  return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {await createForestPilot();console.log(`Created ${fileURLToPath(pilotRoot)}`);}
