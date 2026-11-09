import {fileURLToPath} from "node:url";
import {sharp,insideRimPolygon} from "./insectoid-chitin-rims.mjs";
import {grayPng} from "./forest-river-masks.mjs";

export const LAVA_WIDTH=1600,LAVA_HEIGHT=900,LAVA_PERIOD=12,LAVA_TRAVEL=5;
// Domains delimit the cone faces. Source chroma, not these polygons, supplies
// the fine visible stream boundaries. No cloud, plume, architecture or foreground.
export const VOLCANO_LAVA_DOMAINS=[
  {id:"left",top:249,bottom:330,points:[[781,249],[796,249],[809,258],[837,269],[861,280],[890,291],[922,306],[915,330],[860,331],[818,312],[777,302],[735,290],[711,284],[749,269]]},
  {id:"right",top:214,bottom:314,points:[[1238,215],[1257,212],[1267,220],[1281,218],[1305,215],[1321,228],[1344,237],[1385,253],[1411,268],[1384,289],[1311,295],[1233,298],[1165,312],[1090,322],[1034,319],[1057,291],[1090,276],[1130,260],[1164,250],[1190,234],[1214,224]]},
  {id:"middle",top:287,bottom:405,points:[[898,287],[909,290],[925,301],[951,307],[968,321],[953,342],[927,363],[910,389],[885,406],[846,405],[797,393],[781,378],[806,357],[836,339],[863,319],[886,303]]},
];
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export async function extractVolcanoLava(source){
  const rgb=await sharp(fileURLToPath(source)).resize(LAVA_WIDTH,LAVA_HEIGHT,{fit:"fill"}).removeAlpha().raw().toBuffer();
  const visibility=new Uint8Array(LAVA_WIDTH*LAVA_HEIGHT),delay=new Uint8Array(visibility.length),counts=Array(3).fill(0);
  for(let y=0;y<LAVA_HEIGHT;y++)for(let x=0;x<LAVA_WIDTH;x++){
    const sx=(x+.5)*1672/LAVA_WIDTH,sy=(y+.5)*941/LAVA_HEIGHT,i=y*LAVA_WIDTH+x;
    const d=VOLCANO_LAVA_DOMAINS.findIndex(d=>insideRimPolygon(sx,sy,d.points));if(d<0)continue;
    const domain=VOLCANO_LAVA_DOMAINS[d],r=rgb[i*3]/255,g=rgb[i*3+1]/255,b=rgb[i*3+2]/255;
    // Keep original emissive texture/edge antialiasing, rejecting neutral rock.
    visibility[i]=Math.round(255*smooth(.018,.11,r-Math.max(g,b))*smooth(.10,.32,r));
    // The timing field is filled over the ENTIRE cone domain, independently of
    // material alpha. Linear filtering must never pull a dark zero delay from
    // immediately outside a thin stream and make its edges run ahead of its core.
    delay[i]=Math.round(255*Math.max(0,Math.min(1,(sy-domain.top)/(domain.bottom-domain.top))));
    if(visibility[i]>25)counts[d]++;
  }
  return{width:LAVA_WIDTH,height:LAVA_HEIGHT,visibility,delay,rgb,counts};
}
export function volcanoLavaLayer(){return{
  id:"volcano-lava",zIndex:5,imageAssetId:"plate",maskAssetId:"visible-volcano-lava",
  behaviors:[{id:"downhill-color",kind:"colorShift",order:0,params:{frequencyHz:1/LAVA_PERIOD,phase:0,hue:-1.65,saturation:.08,lightness:0,delayMapAssetId:"delay-volcano-lava",travelSeconds:LAVA_TRAVEL}}],
};}
export async function volcanoDelayPng(maps){
  // Timing is smooth low-frequency data, not a material boundary. Preserve the
  // full-resolution visibility mask while keeping this field at 400 x 225.
  return sharp(grayPng(maps.width,maps.height,maps.delay)).resize(400,225,{kernel:"linear"}).png().toBuffer();
}
export async function createVolcanoLava({root,asset,layers}){
  const maps=await extractVolcanoLava(new URL("source.png",root));
  await asset("visible-volcano-lava","mask",grayPng(maps.width,maps.height,maps.visibility),"png");
  await asset("delay-volcano-lava","mask",await volcanoDelayPng(maps),"png",{width:400,height:225});
  layers.push(volcanoLavaLayer());
  return{guidelinesVersion:"1.3",source:"source.png",domains:VOLCANO_LAVA_DOMAINS,periodSeconds:LAVA_PERIOD,travelSeconds:LAVA_TRAVEL,materialTexels:maps.counts,
    method:"Source warm-chroma/luminance inside three cone-face domains; independent continuous top-to-bottom delay field. Smooth orange-to-purple-to-orange traveling color, no texture displacement."};
}
