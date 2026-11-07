import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const atlasRoot = new URL("../public/infinite-zoom/samples/behavior-atlas/", import.meta.url);
const names = ["translate","rotate","scale","parallax","bend","wave","displace","flow","pulse","opacity","colorShift","glow"];
const descriptions = ["Przesunięcie", "Obrót wokół osi", "Zmiana wielkości", "Ruch zależny od głębi", "Ugięcie z nieruchomą podstawą", "Falowanie", "Przemieszczenie według mapy", "Deformacja pola kierunków", "Pulsowanie światła", "Przezroczystość", "Zmiana koloru", "Emisja światła"];
const colors = ["#65dec5","#a9a1ff","#faad75","#75bfff","#a5db7a","#69cfed","#e4a3df","#6aacec","#f1cd70","#94c2df","#f181ac","#ffc582"];
const svg = (body,width=3840,height=2160) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 3840 2160">${body}</svg>`;
const text=(x,y,size,fill,value,extra="")=>`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" fill="${fill}" ${extra}>${value}</text>`;

export async function createBehaviorAtlas() {
  await mkdir(atlasRoot,{recursive:true});
  let background=`<rect width="3840" height="2160" fill="#0b1220"/>${text(120,132,76,"#edf3ff","INFINITE ZOOM",'font-weight="700"')}${text(122,210,32,"#91a5bf","12 zachowań · jedna paczka schema v2 · 3840 × 2160")}`;
  let objects="";
  const assets=[{id:"background",uri:"/infinite-zoom/samples/behavior-atlas/background.svg",kind:"image",width:3840,height:2160,critical:true},
    {id:"objects",uri:"/infinite-zoom/samples/behavior-atlas/objects.svg",kind:"image",width:3840,height:2160,critical:true}];
  const layers=[{id:"background",zIndex:0,imageAssetId:"background"}];
  const panels=[];
  for(const [index,kind] of names.entries()) {
    const x=120+(index%4)*912,y=312+Math.floor(index/4)*584,cx=x+432,cy=y+306,c=colors[index];
    panels.push({id:kind,label:descriptions[index],x,y,width:864,height:536});
    background+=`<rect x="${x}" y="${y}" width="864" height="536" rx="28" fill="#121e30" stroke="#2e4058" stroke-width="2"/>`;
    background+=text(x+32,y+56,34,c,`${String(index+1).padStart(2,"0")} / ${kind}`,'font-weight="700"');
    background+=text(x+32,y+102,26,"#8fa3bc",descriptions[index]);
    background+=`<path d="M ${cx-240} ${cy} H ${cx+240} M ${cx} ${cy-130} V ${cy+130}" stroke="#283b52" stroke-width="2" stroke-dasharray="10 12"/>`;
    for(let n=-3;n<=3;n++)background+=`<path d="M ${cx+n*64} ${cy+154} v 12" stroke="#455b75" stroke-width="3"/>`;
    let shape="";
    if(kind==="rotate") {
      for(let i=0;i<6;i++)shape+=`<path d="M 0 -108 C 32 -100 64 -60 18 -18 L 0 0 Z" fill="${i%2?"#e3ddff":c}" transform="rotate(${i*60})"/>`;
      shape+=`<circle r="22" fill="#17263b" stroke="${c}" stroke-width="7"/>`;
    } else if(kind==="bend"||kind==="wave") {
      shape=`<path d="M 0 114 Q -36 0 0 -120" fill="none" stroke="${c}" stroke-width="14"/>`;
      for(let i=0;i<5;i++)shape+=`<ellipse cx="${i%2?32:-32}" cy="${85-i*40}" rx="46" ry="17" fill="${i%2?c:"#d4f0bc"}" transform="rotate(${i%2?-28:28} 0 ${85-i*40})"/>`;
      background+=`<circle cx="${cx}" cy="${cy+114}" r="9" fill="#f0f5ff"/>`;
    } else if(kind==="parallax") {
      for(const [n,height] of [100,150,210].entries()) {
        const px=-180+n*180;
        shape+=`<path d="M ${px-52} 105 V ${105-height} L ${px} ${70-height} L ${px+52} ${105-height} V 105 Z" fill="${["#5484a9","#8fbdd4","#d0f4ff"][n]}" stroke="#d9f6ff" stroke-width="3"/>`;
        for(let j=0;j<4;j++)shape+=`<path d="M ${px-28} ${90-j*22} h 56" stroke="#173650" stroke-width="5"/>`;
      }
      background+=text(x+32,y+486,22,"#8196b0","Włącz ruch kamery — różne poziomy depth");
    } else if(kind==="displace"||kind==="flow") {
      for(let row=0;row<5;row++)for(let col=0;col<11;col++)shape+=`<circle cx="${-220+col*44}" cy="${-88+row*44}" r="${kind==="flow"?8:12}" fill="${(row+col)%3===0?"#e6f5ff":c}"/>`;
      if(kind==="flow")shape+=`<path d="M -220 0 Q -100 -120 0 0 T 220 0" fill="none" stroke="${c}" stroke-width="4"/>`;
    } else {
      shape=`<path d="M -140 -72 L 0 -142 L 140 -72 V 72 L 0 142 L -140 72 Z" fill="${c}" fill-opacity="${kind==="glow"?0.48:1}" stroke="${c}" stroke-width="7"/>`;
      shape+=`<path d="M -140 -72 L 0 0 L 140 -72 M 0 0 V 142" fill="none" stroke="#0d2339" stroke-width="7"/>`;
      shape+=`<path d="M -96 -72 L -38 -102" stroke="#f4fbff" stroke-width="10" stroke-linecap="round"/>`;
      if(kind==="opacity")background+=`<path d="M ${cx-190} ${cy-124} l 380 248 M ${cx+190} ${cy-124} l -380 248" stroke="#597088" stroke-width="9"/>`;
    }
    objects+=`<g transform="translate(${cx} ${cy})">${shape}</g>`;
    const maskId=`mask-${kind}`;
    assets.push({id:maskId,uri:`/infinite-zoom/samples/behavior-atlas/${maskId}.svg`,kind:"mask",width:480,height:270,critical:true});
    await writeFile(new URL(`${maskId}.svg`,atlasRoot),svg(`<rect width="3840" height="2160" fill="black"/><rect x="${x+8}" y="${y+120}" width="848" height="400" fill="white"/>`,480,270));
    const periodic={frequencyHz:0.18,phase:0};
    const params={translate:{x:100,y:36},rotate:{radians:0.085,pivotX:cx,pivotY:cy},scale:{x:0.08,y:0.06,pivotX:cx,pivotY:cy},
      parallax:{amount:240,depthAssetId:"depth",referenceDepth:0.5},bend:{amount:180,pivotX:cx,pivotY:0,axis:"x"},
      wave:{amplitude:65,wavelength:1000,axis:"x"},displace:{amplitude:100,fieldAssetId:"field"},flow:{amplitude:125,fieldAssetId:"field"},
      pulse:{amount:0.75},opacity:{base:0.55,amount:0.4},colorShift:{hue:2.6,saturation:0.8,lightness:0.12},glow:{amount:1,threshold:0.05}}[kind];
    if(kind==="colorShift")periodic.frequencyHz=0.09;
    const behavior={id:kind,kind,order:0,params:{...periodic,...params}};
    if(kind==="bend")behavior.influenceMaskAssetId="influence";
    layers.push({id:kind,zIndex:index+1,imageAssetId:"objects",maskAssetId:maskId,behaviors:[behavior]});
  }
  assets.push(...[{id:"depth",kind:"depth"},{id:"field",kind:"flow"},{id:"influence",kind:"mask"}].map(a=>({...a,uri:`/infinite-zoom/samples/behavior-atlas/${a.id}.svg`,width:480,height:270,critical:true})));
  const depth=`<rect width="3840" height="2160" fill="#808080"/>${["#191919","#808080","#e5e5e5"].map((c,i)=>`<rect x="${2856+432-260+i*180}" y="440" width="160" height="380" fill="${c}"/>`).join("")}`;
  const field=`<defs><linearGradient id="v" x2="0" y2="1"><stop stop-color="#f08000"/><stop offset=".5" stop-color="#80d000"/><stop offset="1" stop-color="#208000"/></linearGradient></defs><rect width="3840" height="2160" fill="url(#v)"/>`;
  const influence=`<defs><linearGradient id="influence" x2="0" y2="1"><stop stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient></defs><rect width="3840" height="2160" fill="black"/><rect x="120" y="1020" width="864" height="320" fill="url(#influence)"/>`;
  background+=text(120,2100,26,"#7b90a9","Test techniczny: stały krok 1/60 s · maski wpływu ≠ przezroczystość · glow = emisja, flow = deformacja pola");
  await Promise.all([writeFile(new URL("background.svg",atlasRoot),svg(background)),writeFile(new URL("objects.svg",atlasRoot),svg(objects)),
    writeFile(new URL("master.svg",atlasRoot),svg(background+objects)),writeFile(new URL("depth.svg",atlasRoot),svg(depth,480,270)),
    writeFile(new URL("field.svg",atlasRoot),svg(field,480,270)),writeFile(new URL("influence.svg",atlasRoot),svg(influence,480,270))]);
  const manifest={schemaVersion:2,id:"behavior-atlas",version:"0.1.0",canvas:{width:3840,height:2160},assets,layers,coverage:{baseLayerId:"background"},anchors:[{id:"center",x:1920,y:1080}]};
  await writeFile(new URL("manifest.json",atlasRoot),JSON.stringify(manifest,null,2)+"\n");
  await writeFile(new URL("panels.json",atlasRoot),JSON.stringify(panels,null,2)+"\n");
  return manifest;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  await createBehaviorAtlas();console.log(`Created ${fileURLToPath(atlasRoot)}`);
}
