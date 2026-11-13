import {parseArtworkPackage} from '../../apps/ui/src/engines/infinite-zoom/artwork/artwork-package.ts';

export function correctedManifest(){
  const files=[['black','black.svg','image',16,9],['backing','backing.png','image'],['source','B-04-1024-500.png','image'],
    ['object','object-mask.png','mask'],['lights','light-mask.png','mask'],['occlusion','occlusion-mask.png','mask'],
    ['delay','material-delay.png','mask'],...['west','gate','east'].map(id=>[id,id+'-light-mask.png','mask'])];
  const assets=files.map(([id,file,kind,width=1024,height=576])=>({id,uri:'/infinite-zoom/kre00/'+file,kind,width,height,critical:true}));
  const travel={startSeconds:0,durationSeconds:16,path:{kind:'bezier',segments:[{control1:{x:400,y:-200},control2:{x:1000,y:-80},to:{x:1440,y:180}}]},
    easing:'ease-in-out',orientToPath:true,pivot:{x:1200,y:840}};
  const layers=[{id:'coverage',zIndex:0,imageAssetId:'black'},{id:'environment',zIndex:1,imageAssetId:'backing'}];
  for(const [i,id]of ['west','gate','east'].entries())layers.push({id:id+'-lights',zIndex:2+i,imageAssetId:'backing',maskAssetId:id,behaviors:[
    {id:'flow',kind:'colorShift',order:0,params:{frequencyHz:1/8,phase:.7,hue:Math.PI,saturation:.35,lightness:0,delayMapAssetId:'delay',travelSeconds:3}},
    {id:'impulse',kind:'glow',order:1,params:{frequencyHz:1/[6,8,11][i],phase:[.7,2.1,4][i],amount:.45,threshold:0,sharpness:8,intensity:1.2}}
  ]});
  layers.push({id:'drone',zIndex:5,imageAssetId:'source',maskAssetId:'object',occlusionMaskAssetId:'occlusion',travel},
    {id:'drone-lights',zIndex:6,imageAssetId:'source',maskAssetId:'lights',occlusionMaskAssetId:'occlusion',travel,behaviors:[
      {id:'beacon',kind:'glow',order:0,params:{frequencyHz:.5,phase:.7,amount:.45,threshold:0,sharpness:8,intensity:1.2}}]});
  const manifest={schemaVersion:2,id:'kre00-corrected-pilot',version:'0.0.2',canvas:{width:3840,height:2160},assets,layers,coverage:{baseLayerId:'coverage'},anchors:[]};
  return parseArtworkPackage(manifest);
}
