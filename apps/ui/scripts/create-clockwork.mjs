import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

export const root=new URL("../public/infinite-zoom/samples/clockwork/",import.meta.url);
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1672 941" preserveAspectRatio="none">${body}</svg>`;
export const ROTORS=Object.freeze([
  {id:"wheel-left",x:469,y:477,radius:166,turnsPerSecond:1/24},
  {id:"wheel-center",x:845,y:477,radius:166,turnsPerSecond:-1/24},
  {id:"wheel-right",x:1223,y:477,radius:166,turnsPerSecond:1/24},
  {id:"wheel-upper-left",x:700,y:237,radius:86,turnsPerSecond:-1/12},
  {id:"wheel-upper-right",x:1005,y:237,radius:86,turnsPerSecond:1/12},
]);
const SOURCE_HUB={x:625,y:622.5,radius:590};
export const PULSE_DETAILS=Object.freeze([
  {id:"upper-left-bearing",x:428,y:133,radius:12,phase:0},
  {id:"upper-right-bearing",x:1238,y:210,radius:11,phase:2.1},
  {id:"lower-bearing",x:841,y:838,radius:14,phase:4.2},
]);

/** Original generated raster sources stay untouched. Full-frame containers
 * register the gear's measured axle hole to each authored bearing in the plate.
 * Raster alpha follows each rigid wheel; protected bearing caps stay fixed. */
export async function createClockwork(){
  await mkdir(root,{recursive:true});const assets=[],sources=[];
  const plate=await readFile(new URL("plate.png",root)),gear=await readFile(new URL("gear.png",root));
  for(const[id,bytes]of [["plate",plate],["gear",gear]])sources.push({id,file:`${id}.png`,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),sha256:createHash("sha256").update(bytes).digest("hex")});
  function asset(id,kind){assets.push({id,kind,uri:`/infinite-zoom/samples/clockwork/${id}.svg`,width:1600,height:900,critical:true});}
  await writeFile(new URL("plate.svg",root),svg(`<image width="1672" height="941" preserveAspectRatio="none" href="data:image/png;base64,${plate.toString("base64")}"/>`));asset("plate","image");
  const layers=[{id:"plate",zIndex:0,imageAssetId:"plate"}];
  for(const [i,rotor]of ROTORS.entries()){
    const scale=rotor.radius/SOURCE_HUB.radius,width=sources[1].width*scale,height=sources[1].height*scale,x=rotor.x-SOURCE_HUB.x*scale,y=rotor.y-SOURCE_HUB.y*scale;
    const circle=`<circle cx="${rotor.x}" cy="${rotor.y}" r="${rotor.radius+2}"/>`;
    // The alpha matte is already cleaned by image_gen; the radial limit is a
    // conservative safety boundary, not a substitute for tooth/spoke alpha.
    await writeFile(new URL(`${rotor.id}.svg`,root),svg(`<defs><clipPath id="bounds">${circle}</clipPath></defs><image x="${x}" y="${y}" width="${width}" height="${height}" clip-path="url(#bounds)" href="data:image/png;base64,${gear.toString("base64")}"/>`));asset(rotor.id,"image");
    // Data mask from the actual bright metal pixels, intersected with a small
    // feathered reflection footprint. Dark spokes/openings are never emissive.
    const spotX=rotor.x+rotor.radius*.4,spotY=rotor.y-rotor.radius*.4;
    const highlight=`<defs><filter id="bright" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="linear" slope="4.1666667" intercept="-1.9166667"/><feFuncG type="linear" slope="4.1666667" intercept="-1.9166667"/><feFuncB type="linear" slope="4.1666667" intercept="-1.9166667"/></feComponentTransfer></filter><filter id="soft"><feGaussianBlur stdDeviation="${rotor.radius*.045}"/></filter><mask id="spot" maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941"><rect width="1672" height="941" fill="black"/><ellipse cx="${spotX}" cy="${spotY}" rx="${rotor.radius*.53}" ry="${rotor.radius*.24}" transform="rotate(-40 ${spotX} ${spotY})" fill="white" filter="url(#soft)"/></mask></defs><rect width="1672" height="941" fill="black"/><image x="${x}" y="${y}" width="${width}" height="${height}" href="data:image/png;base64,${gear.toString("base64")}" filter="url(#bright)" mask="url(#spot)"/>`;
    const maskId=`highlight-${rotor.id}`;await writeFile(new URL(`${maskId}.svg`,root),svg(highlight));asset(maskId,"mask");
    layers.push({id:rotor.id,zIndex:i+1,imageAssetId:rotor.id,behaviors:[{id:"glow",kind:"glow",order:0,influenceMaskAssetId:maskId,params:{frequencyHz:.28+i*.017,phase:Math.PI/2+i*1.07,amount:1,threshold:.06,sharpness:3,intensity:3,color:[1,.92,.72]}}],spin:{pivotX:rotor.x*3840/1672,pivotY:rotor.y*2160/941,turnsPerSecond:rotor.turnsPerSecond,phaseTurns:0}});
  }
  const fixed=ROTORS.map(r=>`<circle cx="${r.x}" cy="${r.y}" r="9" fill="white"/>`).join("");
  await writeFile(new URL("mask-axles.svg",root),svg(`<rect width="1672" height="941" fill="black"/>${fixed}`));asset("mask-axles","mask");
  layers.push({id:"fixed-axles",zIndex:6,imageAssetId:"plate",maskAssetId:"mask-axles"});
  for(const[i,detail]of PULSE_DETAILS.entries()){
    const maskId=`pulse-${detail.id}`;
    await writeFile(new URL(`${maskId}.svg`,root),svg(`<defs><radialGradient id="edge"><stop offset=".65" stop-color="white"/><stop offset="1" stop-color="black"/></radialGradient></defs><rect width="1672" height="941" fill="black"/><circle cx="${detail.x}" cy="${detail.y}" r="${detail.radius}" fill="url(#edge)"/>`));asset(maskId,"mask");
    layers.push({id:detail.id,zIndex:7+i,imageAssetId:"plate",maskAssetId:maskId,behaviors:[{id:"pulse",kind:"pulse",order:0,params:{frequencyHz:.38,phase:detail.phase,amount:.8}}]});
  }
  const manifest={schemaVersion:2,id:"clockwork",version:"0.4.0",canvas:{width:3840,height:2160},assets,layers,coverage:{baseLayerId:"plate"},anchors:[{id:"center",x:1920,y:1080}]};
  await writeFile(new URL("manifest.json",root),JSON.stringify(manifest,null,2)+"\n");
  await writeFile(new URL("production.json",root),JSON.stringify({schemaVersion:1,artworkId:manifest.id,version:manifest.version,tool:"built-in image_gen",externalApiCalls:0,sources,
    sourceHub:SOURCE_HUB,rotors:ROTORS,runtimeTexture:{width:1600,height:900,native4K:false},
    cleanPlate:"Complete recessed backing and fixed bearing stubs were generated before moving wheels. No duplicate moving wheel is baked into the five rotor wells.",
    masks:"Cleaned PNG alpha follows tooth/spoke/axle silhouettes. Each rotor has a separate source-luminance highlight mask intersected with a small reflection footprint. Three fixed jewel/bearing masks localize pulse. Fixed axle caps and all unselected metal remain protected.",
    motion:"Five rigid continuous spins share one fixed-step clock and a common user speed multiplier; adjacent large wheels counter-rotate. No texture deformation is applied to metal.",
    lighting:{pulseDetails:PULSE_DETAILS,pulse:"Three small selected bearing interiors, phase-staggered; no whole-frame or rotor pulse",glint:"Bright source pixels only: sRGB luminance ramp .46.. .70 intersected with a local footprint. Warm specular color [1,.92,.72], intensity 3 within the unchanged intensity budget, linear luminance threshold .06, sharpness 3, staggered phases and an initial peak on the first rotor. Dark metal is unchanged; no exposure or contrast adjustment."},
    limitations:["Artistic clockwork, not a CAD or contact-dynamics simulation","Only five separated rotors are animated; background microgears are stationary","Source resolution is recorded, not native 4K","No portal in this standalone studio scene"]},null,2)+"\n");
  return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await createClockwork();console.log(`Packaged ${fileURLToPath(root)}`);}
