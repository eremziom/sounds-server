import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {grayPng} from "./forest-river-masks.mjs";

const require=createRequire(import.meta.url);
// Offline data-mask extraction, using the image dependency already shipped with
// the repository's installed Next. No source illustration pixels are changed.
const sharp=createRequire(require.resolve("next/package.json"))("sharp");
export const RIM_WIDTH=1600,RIM_HEIGHT=900,RIM_PERIOD=6,RIM_PHASES=48;
export const RIM_BANDS=[
  {id:"city-left",route:[[59,243],[108,240],[153,249],[192,270],[231,301],[267,348],[287,387],[302,425],[318,458]],
    polygons:[[[55,236],[95,232],[140,238],[178,252],[213,276],[246,309],[271,345],[292,384],[307,424],[324,458],[312,458],[297,425],[282,389],[260,350],[235,318],[204,288],[171,265],[137,251],[99,245],[60,251]]]},
  {id:"city-middle",route:[[273,335],[303,328],[334,333],[364,345],[392,362],[418,385],[444,414],[470,445],[486,464]],
    polygons:[[[270,329],[300,321],[334,325],[367,338],[395,356],[423,380],[448,410],[474,442],[492,464],[480,465],[462,446],[438,419],[412,389],[386,368],[360,351],[331,339],[300,334],[275,341]]]},
  {id:"foreground-frame",route:[[1060,750],[1072,690],[1090,620],[1110,560],[1160,512],[1220,478],[1290,451],[1347,450],[1370,463],[1350,540],[1325,612],[1300,650],[1220,699],[1130,742],[1060,770],[1060,750]],
    polygons:[
      [[1085,531],[1115,512],[1140,493],[1172,477],[1205,464],[1234,452],[1260,447],[1294,441],[1326,441],[1345,450],[1356,457],[1342,463],[1320,462],[1290,469],[1260,479],[1230,490],[1200,505],[1170,523],[1145,541],[1125,560],[1107,578],[1097,593],[1098,568],[1098,550]],
      [[1365,457],[1376,460],[1370,480],[1364,506],[1353,537],[1343,569],[1333,602],[1319,633],[1307,650],[1288,658],[1298,638],[1311,612],[1322,584],[1332,553],[1344,521],[1354,492],[1360,472]],
      [[1054,752],[1085,737],[1120,724],[1160,708],[1200,689],[1240,672],[1280,654],[1314,637],[1340,628],[1360,623],[1357,639],[1330,651],[1300,666],[1260,686],[1220,706],[1180,725],[1140,744],[1100,763],[1060,785],[1030,799],[1020,789],[1045,768]],
      [[1055,748],[1061,707],[1070,668],[1082,628],[1090,591],[1103,560],[1125,532],[1150,510],[1175,495],[1175,510],[1154,528],[1136,551],[1120,579],[1107,610],[1096,645],[1087,680],[1080,715],[1075,741]],
    ]},
];
export const RIM_EXCLUSIONS=[
  [[1080,689],[1099,629],[1134,575],[1185,533],[1247,503],[1303,480],[1355,465],[1348,511],[1325,565],[1289,613],[1235,657],[1170,689],[1112,713]],
  [[73,259],[109,255],[142,261],[170,276],[196,299],[221,323],[223,335],[195,324],[160,309],[125,295],[90,282],[69,271]],
  [[291,346],[321,342],[350,352],[372,369],[392,392],[400,403],[380,398],[345,385],[310,375],[285,363]],
];
export function insideRimPolygon(x,y,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;
}return yes;}
function edgeDistance(x,y,poly){let min=Infinity;for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1];
  const q=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
  min=Math.min(min,Math.hypot(x-a[0]-q*dx,y-a[1]-q*dy));
}return min;}
const smooth=(lo,hi,x)=>{const t=Math.max(0,Math.min(1,(x-lo)/(hi-lo)));return t*t*(3-2*t);};
export function rimCoordinate(x,y,route){
  let nearest=Infinity,along=0,length=0;const lengths=[];
  for(let i=1;i<route.length;i++){lengths.push(Math.hypot(route[i][0]-route[i-1][0],route[i][1]-route[i-1][1]));length+=lengths.at(-1);}
  let prefix=0;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b[0]-a[0],dy=b[1]-a[1],l=lengths[i-1];
    const q=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(l*l||1))),d=Math.hypot(x-a[0]-q*dx,y-a[1]-q*dy);
    if(d<nearest){nearest=d;along=(prefix+q*l)/length;}prefix+=l;
  }return along;
}
export async function extractChitinRims(source){
  const {data}=await sharp(fileURLToPath(source)).resize(RIM_WIDTH,RIM_HEIGHT,{fit:"fill"}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const material=new Uint8Array(RIM_WIDTH*RIM_HEIGHT),phasePosition=new Float32Array(material.length),bandIndex=new Int8Array(material.length).fill(-1);
  const bounds=RIM_BANDS.map(b=>{const p=b.polygons.flat();return{minX:Math.min(...p.map(p=>p[0])),maxX:Math.max(...p.map(p=>p[0])),minY:Math.min(...p.map(p=>p[1])),maxY:Math.max(...p.map(p=>p[1]))};});
  for(let y=0;y<RIM_HEIGHT;y++)for(let x=0;x<RIM_WIDTH;x++){
    const sx=(x+.5)*1672/RIM_WIDTH,sy=(y+.5)*941/RIM_HEIGHT,i=y*RIM_WIDTH+x;
    for(let b=0;b<RIM_BANDS.length;b++){
      const bound=bounds[b];if(sx<bound.minX||sx>bound.maxX||sy<bound.minY||sy>bound.maxY)continue;
      let feather=0;
      for(const poly of RIM_BANDS[b].polygons)if(insideRimPolygon(sx,sy,poly))feather=Math.max(feather,smooth(0,1.6,edgeDistance(sx,sy,poly)));
      if(!feather||RIM_EXCLUSIONS.some(p=>insideRimPolygon(sx,sy,p)))continue;
      const r=data[i*3]/255,g=data[i*3+1]/255,blue=data[i*3+2]/255,luma=.2126*r+.7152*g+.0722*blue;
      const cold=(g+blue)/2-r,warm=r-Math.max(g,blue);
      const texture=(.12+.4*smooth(.07,.4,luma)+.48*smooth(.02,.15,cold))*(1-smooth(.015,.055,warm));
      const value=Math.floor(255*feather*texture*smooth(.025,.07,luma));
      if(value>material[i]){material[i]=value;phasePosition[i]=rimCoordinate(sx,sy,RIM_BANDS[b].route)*RIM_PHASES;bandIndex[i]=b;}
    }
  }
  return{width:RIM_WIDTH,height:RIM_HEIGHT,material,phasePosition,bandIndex,rgb:data};
}
export function rimPhaseMaps(maps){
  const width=400,height=225,phases=Array.from({length:RIM_PHASES},()=>new Uint8Array(width*height));
  // Dilate timing support only. It never defines visible pixels: full-resolution
  // source-derived material masks remain the actual light boundary.
  for(let y=0;y<RIM_HEIGHT;y++)for(let x=0;x<RIM_WIDTH;x++){
    const i=y*RIM_WIDTH+x;if(!maps.material[i])continue;
    const p=maps.phasePosition[i],k=Math.floor(p)%RIM_PHASES,f=p-Math.floor(p),cx=Math.floor(x/4),cy=Math.floor(y/4);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const tx=cx+dx,ty=cy+dy;if(tx<0||ty<0||tx>=width||ty>=height)continue;const j=ty*width+tx;
      phases[k][j]=Math.max(phases[k][j],Math.round(255*(1-f)));phases[(k+1)%RIM_PHASES][j]=Math.max(phases[(k+1)%RIM_PHASES][j],Math.round(255*f));
    }
  }
  const groups=Array.from({length:4},()=>new Uint8Array(RIM_WIDTH*RIM_HEIGHT));
  for(let i=0;i<maps.material.length;i++)if(maps.material[i]){
    const p=maps.phasePosition[i],k=Math.floor(p)%RIM_PHASES,f=p-Math.floor(p);
    groups[Math.floor(k/12)][i]=Math.round(maps.material[i]*(1-f));
    const next=Math.floor(((k+1)%RIM_PHASES)/12);
    groups[next][i]=Math.min(255,groups[next][i]+Math.round(maps.material[i]*f));
  }
  return{width,height,phases,groups};
}
export async function createChitinRimLighting({root,asset,layers}){
  const maps=await extractChitinRims(new URL("source.png",root)),timing=rimPhaseMaps(maps);
  for(let i=0;i<RIM_PHASES;i++)await asset(`rim-phase-${i}`,"mask",grayPng(timing.width,timing.height,timing.phases[i]),"png",{width:timing.width,height:timing.height});
  for(let g=0;g<4;g++){
    await asset(`rim-material-${g}`,"mask",grayPng(RIM_WIDTH,RIM_HEIGHT,timing.groups[g]),"png");
    const base={id:"rim-emission",kind:"glow",order:0,params:{frequencyHz:0,phase:Math.PI/2,amount:.12,threshold:.035,color:[.12,.8,1]}};
    layers.push({id:`chitin-light-${g}`,zIndex:20+g,imageAssetId:"plate",maskAssetId:`rim-material-${g}`,behaviors:[base],regions:Array.from({length:12},(_,r)=>{
      const index=g*12+r;return{id:`rim-packet-${index}`,influenceMaskAssetId:`rim-phase-${index}`,behaviors:[{...base,params:{...base.params,frequencyHz:1/RIM_PERIOD,phase:Math.PI/2-2*Math.PI*index/RIM_PHASES,amount:1,intensity:3,sharpness:16}}]};
    })});
  }
  const samples=RIM_BANDS.map(()=>Array(RIM_PHASES).fill(null));
  for(let y=0;y<RIM_HEIGHT;y++)for(let x=0;x<RIM_WIDTH;x++){
    const i=y*RIM_WIDTH+x,b=maps.bandIndex[i];if(b<0||!maps.material[i])continue;
    const p=maps.phasePosition[i],k=Math.round(p)%RIM_PHASES,phaseError=Math.abs(p-Math.round(p));
    const lum=(.2126*maps.rgb[i*3]+.7152*maps.rgb[i*3+1]+.0722*maps.rgb[i*3+2])/255;
    const score=maps.material[i]/255*lum*(1-phaseError);
    if(!samples[b][k]||samples[b][k].score<score)samples[b][k]={phase:k,x,y,score};
  }
  return{version:1,source:"source.png",periodSeconds:RIM_PERIOD,phaseSamples:RIM_PHASES,bands:RIM_BANDS,exclusions:RIM_EXCLUSIONS,reviewSamples:samples,
    maskMethod:"Full-resolution source luminance/chroma within manually inspected chitin bands; glazing excluded. Runtime image is the original plate, not a drawn stroke. Coarse phase maps control timing only.",
    uncertainty:"Manual bands and occlusion boundaries require artistic review; phase maps do not establish contour acceptance."};
}
export {sharp};
