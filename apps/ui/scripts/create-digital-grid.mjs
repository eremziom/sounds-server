import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const sharp=createRequire(require.resolve('next/package.json'))('sharp');
export const root=new URL('../public/infinite-zoom/samples/digital-grid/',import.meta.url);
export const WIDTH=1600,HEIGHT=900;
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const bikeOutline=[[135,575],[146,477],[186,409],[269,363],[350,356],[481,375],[585,424],[785,393],[1005,373],[1130,396],[1242,392],[1359,419],[1431,472],[1478,565],[1475,688],[1434,763],[1377,809],[1225,825],[1146,805],[972,757],[780,736],[600,729],[384,744],[236,730],[172,693]];
function inside(x,y,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
// Domains classify material only; source pixels supply every visible contour.
export const GROUPS=[
  {id:'rear-wheel',type:'white',cx:278,cy:574,rx:158,ry:183,phase:0},
  {id:'front-wheel',type:'white',cx:1257,cy:623,rx:225,ry:213,phase:1.1},
  {id:'body-panels',type:'white',phase:2.2},
  {id:'dome-ribs',type:'cyan',phase:.7},
  {id:'road-cyan',type:'cyan',phase:2.7},
  {id:'city-amber',type:'amber',phase:4.1},
];
export async function createDigitalGrid(){
  await mkdir(root,{recursive:true});
  const source=await readFile(new URL('source.png',root)),metadata=await sharp(source).metadata();
  const rgb=await sharp(source).resize(WIDTH,HEIGHT,{fit:'fill'}).removeAlpha().raw().toBuffer();
  const assets=[],layers=[{id:'black-coverage',zIndex:0,imageAssetId:'black'},{id:'environment',zIndex:1,imageAssetId:'plate'}];
  async function asset(id,kind,bytes,extension,width=WIDTH,height=HEIGHT){
    await writeFile(new URL(`${id}.${extension}`,root),bytes);
    assets.push({id,kind,uri:`/infinite-zoom/samples/digital-grid/${id}.${extension}`,width,height,critical:true});
  }
  const gray=bytes=>sharp(bytes,{raw:{width:WIDTH,height:HEIGHT,channels:1}}).png().toBuffer();
  await asset('plate','image',await sharp(rgb,{raw:{width:WIDTH,height:HEIGHT,channels:3}}).png().toBuffer(),'png');
  // Authored SVG material variant: retain the registered plate's luminance
  // texture, but give neutral white panels chroma that existing hue rotation
  // can actually move. This is package data, not a renderer/color operator.
  const coefficients=[.2126,.7152,.0722],tint=[.015,.60,1];
  const matrix=tint.map(t=>[...coefficients.map(v=>v*t),0,0].join(' ')).join(' ')+' 0 0 0 1 0';
  await asset('diagnostic-material','image',Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><filter id="material" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${matrix}"/></filter></defs><image width="1600" height="900" preserveAspectRatio="none" filter="url(#material)" href="data:image/png;base64,${(await sharp(rgb,{raw:{width:WIDTH,height:HEIGHT,channels:3}}).png().toBuffer()).toString('base64')}"/></svg>`),'svg');
  await asset('black','image',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><path fill="black" d="M0 0h16v9H0z"/></svg>'),'svg',16,9);
  const counts={},union=new Uint8Array(WIDTH*HEIGHT);
  for(const [g,group]of GROUPS.entries()){
    const visible=new Uint8Array(WIDTH*HEIGHT),influence=new Uint8Array(visible.length),delay=new Uint8Array(visible.length);let count=0;
    for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
      const i=y*WIDTH+x,r=rgb[i*3]/255,b=rgb[i*3+2]/255,c=rgb[i*3+1]/255;
      const max=Math.max(r,c,b),min=Math.min(r,c,b),sat=max-min;
      const rear=((x-278)/158)**2+((y-574)/183)**2<1,front=((x-1257)/225)**2+((y-623)/213)**2<1;
      // The motorcycle's neutral white material is isolated from cyan/amber
      // scenery and floor reflections. No approximate hull becomes visible.
      const bike=inside(x,y,bikeOutline);
      let domain=false,weight=0,progress=x/WIDTH;
      if(group.type==='white'){
        domain=bike&&(g===0?rear:g===1?front:!rear&&!front);
        weight=smooth(.45,.79,min)*(1-smooth(.055,.16,sat));
        if(g<2)progress=(Math.atan2((y-group.cy)/group.ry,(x-group.cx)/group.rx)+Math.PI)/(2*Math.PI);
        else progress=Math.max(0,Math.min(1,(x-260)/1080));
      }else if(group.type==='cyan'){
        domain=g===3?y<355:y>=355;
        weight=smooth(.11,.39,Math.min(c,b)-r)*smooth(.34,.78,max);
        progress=g===3?Math.max(0,Math.min(1,(x+y*.5)/1300)):Math.max(0,Math.min(1,(y-330)/570));
      }else{
        domain=true;weight=smooth(.14,.48,r-b)*smooth(.27,.75,r)*smooth(.06,.35,c);
        progress=Math.max(0,Math.min(1,(x+(.5*HEIGHT-y)*.6)/WIDTH));
      }
      // Timing extends independently beyond visible material and domain edges.
      delay[i]=Math.round(255*progress);
      if(!domain)continue;
      visible[i]=Math.round(255*weight);
      influence[i]=Math.round(255*smooth(.02,.7,weight));
      union[i]=Math.max(union[i],visible[i]);if(visible[i]>25)count++;
    }
    counts[group.id]=count;
    await asset(`visible-${group.id}`,'mask',await gray(visible),'png');
    await asset(`influence-${group.id}`,'mask',await gray(influence),'png');
    await asset(`delay-${group.id}`,'mask',await sharp(await gray(delay)).resize(400,225,{kernel:'linear'}).png().toBuffer(),'png',400,225);
    layers.push({id:group.id,zIndex:g+2,imageAssetId:'diagnostic-material',maskAssetId:`visible-${group.id}`,behaviors:[
      ...[0,1].map(n=>({id:`travel-spectrum-${n}`,kind:'colorShift',order:n,params:{frequencyHz:1/12,phase:0,hue:Math.PI,saturation:0,lightness:0,delayMapAssetId:`delay-${group.id}`,travelSeconds:4}})),
      {id:'white-pass',kind:'colorShift',order:2,params:{frequencyHz:1/12,phase:-Math.PI/2,hue:0,saturation:-1,lightness:.5}},
      {id:'local-impulse',kind:'glow',order:3,influenceMaskAssetId:`influence-${group.id}`,params:{frequencyHz:1/6,phase:group.phase,amount:.18,threshold:.2,sharpness:4,intensity:1}},
    ]});
  }
  // Reuse exactly one existing material/visibility selection. No tower crop,
  // replacement texture, new mask or FE animation is required.
  const bassLayer=layers.find(layer=>layer.id==='dome-ribs');
  bassLayer.behaviors=[{id:'bass-color-wave',kind:'colorShift',order:0,params:{frequencyHz:0,phase:0,hue:0,saturation:0,lightness:0,
    attackWave:{travelSeconds:.8,pulseSeconds:.24,startY:355/900,endY:0,baseIntensity:.45,palette:[[.02,.65,1],[1,1,1],[1,.25,.01],[.02,1,.06],[.04,.08,1],[.65,.01,1]]},
  }},...bassLayer.behaviors.filter(b=>b.kind==='glow')];
  const manifest={schemaVersion:2,id:'digital-grid',version:'0.2.2',canvas:{width:3840,height:2160},assets,layers,coverage:{baseLayerId:'black-coverage'},anchors:[{id:'center',x:1920,y:1080}]};
  await writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
  // Existing opacity behavior defines the variant's initial state; opacity
  // strength 1 -> 0 reveals it. The normal variant uses layer opacity directly.
  const blackout={...manifest,layers:layers.map(l=>l.id==='environment'?{...l,behaviors:[{id:'environment-blackout',kind:'opacity',order:0,params:{frequencyHz:0,phase:0,base:0,amount:0}}]}:l)};
  await writeFile(new URL('blackout-manifest.json',root),JSON.stringify(blackout,null,2)+'\n');
  await writeFile(new URL('diagnostic-color.json',root),JSON.stringify({version:manifest.version,guidelinesVersion:'1.6',requestedColors:['cyan','white','orange','green','blue','violet'],method:'Original cyclic palette on five masks; each detected bass event launches the next palette color as an independent upward ribbon on existing dome-ribs material.',material:'diagnostic-material.svg',hueExcursionRadians:2*Math.PI,periodSeconds:12,travelSeconds:4,bassColor:{layerId:'dome-ribs',maskAssetId:'visible-dome-ribs',signal:'kickEvent',inputDecayMs:160,...bassLayer.behaviors[0].params.attackWave,returnsToBase:true,maxConcurrentWaves:32},masksUnchanged:true,engineChanges:'User-approved opt-in attackWave mode in existing colorShift, plus replayable bass event token. Renderer, masks and clock unchanged.',originalSourceUnchanged:true,controlLimitation:'Disabling colorShift leaves the original cyan diagnostic material; restoring original white panels is outside this temporary diagnostic'},null,2)+'\n');
  await writeFile(new URL('production.json',root),JSON.stringify({artworkId:manifest.id,version:manifest.version,guidelinesVersion:'1.5',tool:'built-in image_gen',source:{file:'source.png',width:metadata.width,height:metadata.height,sha256:createHash('sha256').update(source).digest('hex')},runtimeTexture:{width:WIDTH,height:HEIGHT,native4K:false},groups:GROUPS,materialTexels:counts,periodSeconds:12,travelSeconds:4,impulsePeriodSeconds:6,geometryMotion:false,maskMethod:'Source luminance/chroma inside classification domains; no synthetic luminous outlines. Separate visibility, influence and continuous delay data.',blackout:'Opaque black base, independent source light layers, environment opacity variant. No engine changes.',uncertainBoundaries:['Wheel/body classification cuts may cross a white panel; both are lit but timing direction changes there.','Very fine cyan reflected highlights are intentionally included in road light.','Angular wheel phase wraps at the rear-facing ray; inspect loop seam during zoom.'],status:'test pilot; see qa.md'},null,2)+'\n');
  const overlay=Buffer.from(rgb);for(let i=0;i<union.length;i++){const a=union[i]/255*.65;overlay[i*3]=overlay[i*3]*(1-a)+255*a;overlay[i*3+1]*=1-a;overlay[i*3+2]=overlay[i*3+2]*(1-a)+255*a;}
  await sharp(overlay,{raw:{width:WIDTH,height:HEIGHT,channels:3}}).png().toFile(fileURLToPath(new URL('mask-review.png',root)));
  return {counts,source:{width:metadata.width,height:metadata.height}};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await createDigitalGrid()));
