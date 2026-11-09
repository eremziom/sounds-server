import {fileURLToPath} from "node:url";
import {sharp,insideRimPolygon} from "./insectoid-chitin-rims.mjs";
import {grayPng} from "./forest-river-masks.mjs";
import {SKY_FLOOR,SKY_EXCLUSIONS,SKY_OPENINGS} from "./insectoid-sky-contours.mjs";
export {SKY_FLOOR,SKY_EXCLUSIONS,SKY_OPENINGS} from "./insectoid-sky-contours.mjs";

export const SKY_WIDTH=1600,SKY_HEIGHT=900;
const smooth=(lo,hi,value)=>{const t=Math.max(0,Math.min(1,(value-lo)/(hi-lo)));return t*t*(3-2*t);};
function edgeDistance(x,y,poly){let result=Infinity;for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
  result=Math.min(result,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
}return result;}
function floorAt(x){
  const i=SKY_FLOOR.findIndex((point,index)=>index&&point[0]>=x),a=SKY_FLOOR[Math.max(0,i-1)],b=SKY_FLOOR[i<0?SKY_FLOOR.length-1:i];
  return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]||1);
}
export function safeSky(x,y){return y<floorAt(x)&&(!SKY_EXCLUSIONS.some(poly=>insideRimPolygon(x,y,poly))||SKY_OPENINGS.some(poly=>insideRimPolygon(x,y,poly)));}

export async function extractSkyLighting(source){
  const rgb=await sharp(fileURLToPath(source)).resize(SKY_WIDTH,SKY_HEIGHT,{fit:"fill"}).removeAlpha().raw().toBuffer();
  const local=await sharp(rgb,{raw:{width:SKY_WIDTH,height:SKY_HEIGHT,channels:3}}).blur(12).raw().toBuffer();
  // Preserve the independently moving ash plume. A summed-area dilation covers
  // its complete alpha footprint plus the authored 50-source-pixel motion guard.
  const smoke=await sharp(fileURLToPath(new URL("volcano-smoke.svg",source))).resize(SKY_WIDTH,SKY_HEIGHT,{fit:"fill"}).ensureAlpha().raw().toBuffer();
  const stride=SKY_WIDTH+1,prefix=new Uint32Array(stride*(SKY_HEIGHT+1)),radius=Math.ceil(55*SKY_WIDTH/1672);
  for(let y=0;y<SKY_HEIGHT;y++){let row=0;for(let x=0;x<SKY_WIDTH;x++){row+=smoke[(y*SKY_WIDTH+x)*4+3]>8?1:0;prefix[(y+1)*stride+x+1]=prefix[y*stride+x+1]+row;}}
  const visibility=new Uint8Array(SKY_WIDTH*SKY_HEIGHT),material=new Uint8Array(visibility.length);
  for(let y=0;y<SKY_HEIGHT;y++)for(let x=0;x<SKY_WIDTH;x++){
    const sx=(x+.5)*1672/SKY_WIDTH,sy=(y+.5)*941/SKY_HEIGHT,i=y*SKY_WIDTH+x;
    const x0=Math.max(0,x-radius),x1=Math.min(SKY_WIDTH,x+radius+1),y0=Math.max(0,y-radius),y1=Math.min(SKY_HEIGHT,y+radius+1);
    if(prefix[y1*stride+x1]-prefix[y0*stride+x1]-prefix[y1*stride+x0]+prefix[y0*stride+x0]>0)continue;
    if(!safeSky(sx,sy))continue;
    // Only a sub-texel antialias ramp on the SKY side of static edges.
    // The plume alone retains the conservative motion envelope above.
    let support=smooth(0,1.2,floorAt(sx)-sy);
    const opening=SKY_OPENINGS.find(poly=>insideRimPolygon(sx,sy,poly));
    if(opening)support*=smooth(0,1.2,edgeDistance(sx,sy,opening));
    else for(const poly of SKY_EXCLUSIONS)support*=smooth(0,1.2,edgeDistance(sx,sy,poly));
    const [r,g,b]=[rgb[i*3],rgb[i*3+1],rgb[i*3+2]].map(v=>v/255);
    const lum=.2126*r+.7152*g+.0722*b,mean=(.2126*local[i*3]+.7152*local[i*3+1]+.0722*local[i*3+2])/255;
    visibility[i]=Math.floor(255*support);
    material[i]=Math.floor(255*smooth(.10,.38,lum)*(.35+.65*smooth(-.015,.05,lum-mean))*(1-smooth(.02,.08,r-(g+b)/2)));
  }
  return{width:SKY_WIDTH,height:SKY_HEIGHT,visibility,material,rgb};
}

export function skyLightingLayer(){return{
  id:"sky-high-attack",zIndex:24,imageAssetId:"plate",maskAssetId:"visible-sky",blendMode:"additive-emission",
  behaviors:[{id:"sky-emission",kind:"glow",order:0,influenceMaskAssetId:"influence-sky-light",params:{frequencyHz:0,phase:Math.PI/2,amount:1,intensity:3,threshold:0,color:[.72,.88,1]},
    modulation:[{id:"high-sky",signal:"highAttack",operation:"replace",priority:0,min:0,max:1,attackSeconds:1/60,releaseSeconds:.045}]}],
};}

export async function createSkyLighting({root,asset,layers}){
  const maps=await extractSkyLighting(new URL("source.png",root));
  await asset("visible-sky","mask",grayPng(maps.width,maps.height,maps.visibility),"png");
  await asset("influence-sky-light","mask",grayPng(maps.width,maps.height,maps.material),"png");
  layers.push(skyLightingLayer());
  return{guidelinesVersion:"1.2",source:"source.png",method:"Source-traced static contours and arch openings, 1.2-source-pixel edge AA; unchanged 55-source-pixel plume guard; source luminance/local contrast; additive emission only",floor:SKY_FLOOR,exclusions:SKY_EXCLUSIONS,openings:SKY_OPENINGS};
}
