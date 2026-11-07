export const periodic = { frequencyHz:0.25, phase:Math.PI/2 };
export const catalog = [
  ["translate",{x:48,y:12}], ["rotate",{radians:0.015,pivotX:1920,pivotY:1080}],
  ["scale",{x:0.01,y:0.005,pivotX:1920,pivotY:1080}],
  ["parallax",{amount:40,depthAssetId:"depth",referenceDepth:0.1}],
  ["bend",{amount:40,pivotX:1920,pivotY:2000,axis:"x"}],
  ["wave",{amplitude:16,wavelength:900,axis:"x"}],
  ["displace",{amplitude:40,fieldAssetId:"flow"}], ["flow",{amplitude:35,fieldAssetId:"flow"}],
  ["pulse",{amount:0.25}], ["opacity",{base:0.6,amount:0.1}],
  ["colorShift",{hue:0.6,saturation:-0.4,lightness:0.08}], ["glow",{amount:0.5,threshold:0.1}],
].map(([kind,params],order)=>({id:kind,kind,order,params:{...periodic,...params}}));

export function phase2Manifest(behaviors = catalog) {
  return {schemaVersion:2,id:"phase2",version:"0.1.0",canvas:{width:3840,height:2160},
    assets:[
      ...["backdrop","foreground"].map(id=>({id,uri:`/infinite-zoom/phase2/${id}.png`,kind:"image",width:128,height:72,critical:true})),
      {id:"mask",uri:"/infinite-zoom/phase2/mask.png",kind:"mask",width:128,height:72,critical:true},
      {id:"depth",uri:"/infinite-zoom/phase2/depth.png",kind:"depth",width:128,height:72,critical:true},
      {id:"flow",uri:"/infinite-zoom/phase2/flow.png",kind:"flow",width:128,height:72,critical:true},
      {id:"detail",uri:"/infinite-zoom/phase2/detail.png",kind:"detail",width:256,height:144,critical:false},
    ],
    layers:[{id:"backdrop",zIndex:0,imageAssetId:"backdrop"},
      {id:"foreground",zIndex:1,imageAssetId:"foreground",behaviors:structuredClone(behaviors)}],coverage:{baseLayerId:"backdrop"},anchors:[{id:"center",x:1920,y:1080}]};
}
