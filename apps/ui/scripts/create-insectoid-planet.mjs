import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {grayPng} from "./lib/forest-river-masks.mjs";
import {createVolcanoSmoke} from "./lib/insectoid-volcano-smoke.mjs";
import {createChitinRimLighting} from "./lib/insectoid-chitin-rims.mjs";
import {createSkyLighting} from "./lib/insectoid-sky-lighting.mjs";

export const root=new URL("../public/infinite-zoom/samples/insectoid-planet/",import.meta.url);
const W=1600,H=900,SW=1672,SH=941;
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${SW} ${SH}" preserveAspectRatio="none">${body}</svg>`;
const polygon=points=>`<polygon points="${points.map(p=>p.join(",")).join(" ")}" fill="white"/>`;
export const MEMBRANES=[
  {id:"near-membrane",pivot:[1210,615],frequency:.135,phase:0,points:[[1080,689],[1099,629],[1134,575],[1185,533],[1247,503],[1303,480],[1355,465],[1348,511],[1325,565],[1289,613],[1235,657],[1170,689],[1112,713]]},
  {id:"upper-membrane",pivot:[1548,486],frequency:.173,phase:2.2,points:[[1451,544],[1475,496],[1508,456],[1558,411],[1611,381],[1651,374],[1641,425],[1615,477],[1574,511],[1514,538]]},
  {id:"lower-membrane",pivot:[1487,679],frequency:.112,phase:4.1,points:[[1380,714],[1391,682],[1420,654],[1461,636],[1503,627],[1543,630],[1564,646],[1553,681],[1525,703],[1481,716],[1429,722]]},
];
export const HEAT_POCKETS=[
  {id:"waterfall-air",points:[[324,492],[346,478],[382,480],[421,491],[445,507],[437,524],[395,534],[347,529]]},
  {id:"valley-air",points:[[686,566],[738,550],[806,548],[848,559],[840,588],[772,602],[711,595]]},
  {id:"far-fissure-air",points:[[805,473],[840,462],[882,462],[912,472],[909,491],[864,507],[829,499]]},
];
export const HEAT_AMPLITUDE=18;
export const VAPOR_OCCLUDERS=[
  [[401,608],[431,560],[482,499],[514,479],[502,518],[479,564],[466,612],[439,631],[400,648]],
  [[223,638],[237,605],[253,562],[270,557],[290,588],[316,628],[320,659],[281,676]],
  [[985,529],[1012,480],[1034,420],[1067,388],[1096,399],[1125,440],[1143,459],[1128,518],[1060,549],[1012,569]],
];
function inside(x,y,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;
}return yes;}
/** Distances are conservative chessboard texels. Influence leaves a three-texel
 * bilinear guard and bounds inverse scale travel at full control strength (1.25
 * overall modulation included). Only membrane interiors sample moving texture. */
function polygonDistance(sourcePoints){
  const points=sourcePoints.map(([x,y])=>[x*W/SW,y*H/SH]),distance=new Uint16Array(W*H);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)distance[y*W+x]=inside(x+.5,y+.5,points)?65535:0;
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-W-1]+1,distance[i-W]+1,distance[i-W+1]+1);}
  for(let y=H-2;y>0;y--)for(let x=W-2;x>0;x--){const i=y*W+x;distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+W-1]+1,distance[i+W]+1,distance[i+W+1]+1);}
  return distance;
}
export function membraneMasks(m){
  const distance=polygonDistance(m.points);
  const visibility=new Uint8Array(W*H),influence=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x,d=distance[i],r=Math.hypot(x-m.pivot[0]*W/SW,y-m.pivot[1]*H/SH);
    visibility[i]=Math.min(255,d*85);
    const maximumTravel=r*.075/(1-.075);
    influence[i]=Math.floor(255*Math.min(1,Math.max(0,(d-3)/(maximumTravel+1))));
  }
  return{visibility,influence,distance,width:W,height:H};
}

/** Refraction may only sample the authored atmospheric pocket. The wave travels
 * horizontally, bounded at all phases and 1.25 maximum modulation. */
export function heatMasks(){
  const distance=new Uint16Array(W*H);
  for(const pocket of HEAT_POCKETS){const local=polygonDistance(pocket.points);for(let i=0;i<distance.length;i++)distance[i]=Math.max(distance[i],local[i]);}
  const visibility=new Uint8Array(W*H),influence=new Uint8Array(W*H);
  const maximumTravel=HEAT_AMPLITUDE*1.25*W/3840;
  for(let i=0;i<distance.length;i++){
    visibility[i]=Math.min(255,distance[i]*64);
    influence[i]=Math.floor(255*Math.min(1,Math.max(0,(distance[i]-3)/(maximumTravel+1))));
  }
  return{visibility,influence,distance,width:W,height:H,maximumTravel};
}

export async function createInsectoidPlanet(){
  await mkdir(root,{recursive:true});const bytes=await readFile(new URL("source.png",root));
  if(bytes.readUInt32BE(16)!==SW||bytes.readUInt32BE(20)!==SH)throw new Error("Reauthor masks for changed source dimensions");
  const image=`<image width="${SW}" height="${SH}" preserveAspectRatio="none" href="data:image/png;base64,${bytes.toString("base64")}"/>`;
  const assets=[],layers=[{id:"fixed-world",zIndex:0,imageAssetId:"plate"}];
  async function asset(id,kind,body,extension="svg",size={width:W,height:H}){
    await writeFile(new URL(`${id}.${extension}`,root),body);
    assets.push({id,kind,uri:`/infinite-zoom/samples/insectoid-planet/${id}.${extension}`,...size,critical:true});
  }
  const op=(kind,params,extra={})=>({id:kind,kind,order:({scale:0,wave:0,flow:0,bend:1,colorShift:1,pulse:2,glow:3,opacity:4})[kind],params:{frequencyHz:.15,phase:0,...params},...extra});
  const smoke=await createVolcanoSmoke({root,svg,asset,op,plateImage:image});
  await asset("plate","image",svg(smoke.plateBody));
  const heat=heatMasks();
  await asset("visible-heat","mask",grayPng(W,H,heat.visibility),"png");
  await asset("influence-heat","mask",grayPng(W,H,heat.influence),"png");
  layers.push({id:"heat-refraction",zIndex:1,imageAssetId:"plate",maskAssetId:"visible-heat",behaviors:[op("wave",{amplitude:HEAT_AMPLITUDE,wavelength:260,axis:"x",frequencyHz:.65},{influenceMaskAssetId:"influence-heat"})]});
  // Hand-authored material boundaries, then source-pixel chroma/luminance gating.
  // These are data maps, not generic ellipses painted over adjacent objects.
  const selections=[
    {id:"city-amber",points:[[0,0],[525,0],[568,343],[864,447],[831,471],[0,440]],type:"warm",hue:1.45,frequency:.083,phase:.3},
    {id:"foreground-cold",points:[[580,821],[695,741],[844,654],[926,527],[1129,430],[1336,340],[1555,202],[1672,104],[1672,941],[1271,941],[1197,873],[895,858]],type:"cold",hue:1.8,frequency:.097,phase:2.1},
    {id:"lava-seams",points:[[0,439],[621,449],[946,474],[1054,548],[777,657],[644,730],[554,789],[0,792]],type:"warm",hue:.65,frequency:.071,phase:1.4},
    {id:"wet-reflections",points:[[0,773],[549,770],[815,850],[1315,941],[0,941]],type:"warm",hue:1.15,frequency:.127,phase:3.4},
  ];
  for(const [i,s]of selections.entries()){
    // Positive warm/cold excess selects colored pinlights, seams and reflections;
    // neutral rock and storm clouds have zero influence even within the polygon.
    const coefficients=s.type==="warm"?"2.6 -1.7 -.5 0 -.08":"-1.8 1.1 1.8 0 -.13";
    const rows=`${coefficients} ${coefficients} ${coefficients} 0 0 0 1 0`;
    const mask=svg(`<defs><clipPath id="site">${polygon(s.points)}</clipPath><filter id="material" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${rows}"/></filter></defs><rect width="${SW}" height="${SH}" fill="black"/><g clip-path="url(#site)" filter="url(#material)">${image}</g>`);
    await asset(`select-${s.id}`,"mask",mask);
    layers.push({id:s.id,zIndex:i+2,imageAssetId:"plate",maskAssetId:`select-${s.id}`,behaviors:[
      op("colorShift",{hue:s.hue,saturation:.4,lightness:.035,frequencyHz:s.frequency,phase:s.phase}),
      op("pulse",{amount:.55,frequencyHz:.22+i*.041,phase:i*1.7}),
      op("glow",{amount:.55,threshold:.025,intensity:2,sharpness:3,frequencyHz:.19+i*.027,phase:i*1.3}),
    ]});
  }
  for(const [i,m]of MEMBRANES.entries()){
    const masks=membraneMasks(m);
    await asset(`visible-${m.id}`,"mask",grayPng(W,H,masks.visibility),"png");
    await asset(`influence-${m.id}`,"mask",grayPng(W,H,masks.influence),"png");
    layers.push({id:m.id,zIndex:6+i,imageAssetId:"plate",maskAssetId:`visible-${m.id}`,behaviors:[
      op("scale",{x:.06,y:.045,pivotX:m.pivot[0]*3840/SW,pivotY:m.pivot[1]*2160/SH,frequencyHz:0,phase:Math.PI/2},{influenceMaskAssetId:`influence-${m.id}`,
        modulation:[{id:"kick-breath",signal:"kick",operation:"replace",priority:0,min:0,max:1,attackSeconds:1/60,releaseSeconds:.05}]}),
      op("colorShift",{hue:1.1,saturation:.3,lightness:.025,frequencyHz:.07+i*.013,phase:m.phase},{influenceMaskAssetId:`influence-${m.id}`}),
      op("pulse",{amount:.35,frequencyHz:m.frequency,phase:m.phase},{influenceMaskAssetId:`influence-${m.id}`}),
    ]});
  }
  // Spatially bounded internal cloud illumination, not a global exposure flash.
  const storms=[{x:686,y:110,rx:145,ry:88,f:.073,p:3},{x:1110,y:82,rx:148,ry:74,f:.109,p:4.6},{x:1390,y:132,rx:110,ry:73,f:.137,p:2.7}];
  for(const[i,s]of storms.entries()){
    const id=`storm-${i+1}`;
    await asset(`select-${id}`,"mask",svg(`<defs><radialGradient id="cloud"><stop stop-color="white"/><stop offset=".3" stop-color="#aaa"/><stop offset="1" stop-color="black"/></radialGradient></defs><rect width="${SW}" height="${SH}" fill="black"/><ellipse cx="${s.x}" cy="${s.y}" rx="${s.rx}" ry="${s.ry}" fill="url(#cloud)"/>`));
    layers.push({id,zIndex:9+i,imageAssetId:"plate",maskAssetId:`select-${id}`,behaviors:[op("glow",{amount:1,intensity:3,threshold:0,sharpness:16,color:[.6,.78,1],frequencyHz:s.f,phase:s.p})]});
  }
  const vapor=await readFile(new URL("vapor-source.png",root));
  // Preserve generated alpha. Reposition the two independent wisps with SVG
  // registration only; their transparent backing contains no duplicated scene.
  await asset("vapor","image",svg(`<defs><image id="vapor-source" width="${SW}" height="${SH}" preserveAspectRatio="none" href="data:image/png;base64,${vapor.toString("base64")}"/><clipPath id="left">${polygon([[0,0],[720,0],[720,480],[630,535],[600,700],[0,700]])}</clipPath><clipPath id="valley"><rect x="630" y="500" width="440" height="200"/></clipPath></defs><g opacity=".24"><g transform="translate(170 300) scale(.48)"><use href="#vapor-source" clip-path="url(#left)"/></g><g transform="translate(380 125) scale(.65)"><use href="#vapor-source" clip-path="url(#valley)"/></g></g>`));
  for(const[i,id]of ["left","valley"].entries()){
    const occluders=VAPOR_OCCLUDERS.map(points=>polygon(points).replace('fill="white"','fill="black"')).join("");
    await asset(`visible-vapor-${id}`,"mask",svg(`<rect width="${SW}" height="${SH}" fill="black"/><rect x="${i===0?0:650}" width="${i===0?650:1022}" height="${SH}" fill="white"/>${occluders}`));
    layers.push({id:`vapor-${id}`,zIndex:12+i,imageAssetId:"vapor",maskAssetId:`visible-vapor-${id}`,behaviors:[op("opacity",{base:.5,amount:.5,frequencyHz:i===0?.13:.17,phase:i===0?1.2:3.8})]});
  }
  layers.push(smoke.layer);
  const rimLighting=await createChitinRimLighting({root,asset,layers});
  const skyLighting=await createSkyLighting({root,asset,layers});
  const manifest={schemaVersion:2,id:"insectoid-planet",version:"0.5.2",canvas:{width:3840,height:2160},assets,layers,coverage:{baseLayerId:"fixed-world"},anchors:[{id:"city",x:740,y:770},{id:"membranes",x:3000,y:1390},{id:"volcano",x:2780,y:560}]};
  await writeFile(new URL("manifest.json",root),JSON.stringify(manifest,null,2)+"\n");
  const production={
    schemaVersion:1,artworkId:manifest.id,version:manifest.version,tool:"built-in image_gen",externalApiCalls:0,
    sources:[{file:"source.png",width:SW,height:SH,sha256:createHash("sha256").update(bytes).digest("hex")},
      {file:"vapor-source.png",width:vapor.readUInt32BE(16),height:vapor.readUInt32BE(20),sha256:createHash("sha256").update(vapor).digest("hex")},...smoke.sources],
    runtimeTexture:{width:W,height:H,native4K:false},guidelines:{version:"1.0",file:"../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md"},
    membranes:MEMBRANES,materialSelections:selections,storms,skyLighting,
    heat:{pockets:HEAT_POCKETS,amplitude:HEAT_AMPLITUDE,frequencyHz:.65,wavelength:260,guardTexels:3,maximumTravelTexels:heat.maximumTravel},
    vapor:{source:"vapor-source.png",registration:"Two alpha wisps registered inside left and valley windows; static alpha capped to .24; opacity envelopes 0..1 at .13/.17 Hz",neutralControl:"Disabling opacity freezes its modulation at neutral alpha 1, leaving the authored static vapor visible; it does not hide the artwork layer"},
    volcanoSmoke:smoke.metadata,
    rimLighting,
    limitations:["Single generated multilayer-depth painting, not independently movable depth planes",
      "Breathing deforms membrane interior texture; silhouettes, attachment ribs and architecture stay fixed",
      "Distance guard keeps moving samples inside authored membrane and heat polygons; correctness of material tracing requires visual QA",
      "Cloud glow uses three deterministic periodic envelopes, not stochastic lightning or moving cloud simulation",
      "Vapor fades in place and volcanic smoke curls periodically, not physical advection; heat is local periodic refraction, not fluid simulation",
      "Local regenerated sky patch, smoke silhouette and crater attachment require visual approval",
      "Original source is 1672x941; runtime registration is 1600x900; no native 4K claim",
      "No portal; standalone studio only; final artistic acceptance pending"],
  };
  await writeFile(new URL("production.json",root),JSON.stringify(production,null,2)+"\n");
  return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await createInsectoidPlanet();console.log(`Packaged ${fileURLToPath(root)}`);}
