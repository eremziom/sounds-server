import {prepareArtwork} from "/engine/artwork/prepare-artwork.ts";
import {decodeArtworkAsset} from "/engine/artwork/artwork-loader.ts";
import {pixels,hash,opaque,check} from "/fixture.mjs";

window.runLayeredArtwork=async()=>{
  const manifests=await Promise.all(["forest","forest-pilot","forest-layered"].map(async id=>(await fetch(`/infinite-zoom/samples/${id}/manifest.json`)).json()));
  const canvas=document.createElement("canvas");document.body.append(canvas);
  let lease,tick=0;const changed={},alpha={};window.layeredCaptures={};
  const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>.5});
  const capture=name=>{lease.render();window.layeredCaptures[name]=canvas.toDataURL("image/png");};
  const difference=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>=12)count++;return count;};
  try{
    lease=await prepareArtwork({canvas,manifest:manifests[0],instanceId:"layered-test",viewport:{width:1280,height:720,dpr:1,renderScale:1},onAvailabilityChange(){},onError(e){throw e;},
      async decode(asset,signal){
        const decoded=await decodeArtworkAsset(asset,signal);
        if(asset.uri.includes("forest-layered")&&asset.kind==="image"){
          const sample=new OffscreenCanvas(asset.width,asset.height),context=sample.getContext("2d",{willReadFrequently:true});context.drawImage(decoded.image,0,0);
          const data=context.getImageData(0,0,asset.width,asset.height).data;let transparent=0,partial=0;
          for(let i=3;i<data.length;i+=4){if(data[i]===0)transparent++;else if(data[i]<255)partial++;}
          alpha[asset.id]={transparent,partial,opaque:decoded.opaque};
        }
        return decoded;
      },
    },new AbortController().signal);
    const context=canvas.getContext("webgl2"),original=pixels(canvas,lease.render),journey=JSON.stringify(lease.camera.getSnapshot());
    await lease.selectScene("layered",manifests[2]);
    check(alpha.plate.opaque&&alpha.foliage.transparent>1600*900*.5&&alpha.mist.partial>10000,"Opaque clean plate and genuine foliage/mist alpha mattes");
    check(lease.instance.manifest.id==="forest-layered"&&!lease.transition.getSnapshot().canStart,"Layered scene is a studio scene, not a portal");
    check(lease.getDiagnostics().artworks===1&&lease.getDiagnostics().estimatedTextureBytes<64*1024*1024,"Only one budgeted studio GPU scene");
    capture("initial");
    lease.setPilotPreset("none");const neutral=pixels(canvas,lease.render);opaque(neutral);capture("neutral");
    const protectedPatches=[[760,431,45,12],[630,606,40,12],[440,590,45,25],[570,823,40,15],[1360,510,50,14]];
    function stationaryDifference(a,b){
      let max=0;
      for(const[x,y,w,h]of protectedPatches)for(let py=Math.ceil(y*canvas.height/941);py<Math.floor((y+h)*canvas.height/941);py++)for(let px=Math.ceil(x*canvas.width/1672);px<Math.floor((x+w)*canvas.width/1672);px++){
        const i=((canvas.height-1-py)*canvas.width+px)*4;for(let c=0;c<3;c++)max=Math.max(max,Math.abs(a[i+c]-b[i+c]));
      }
      return max;
    }
    lease.setPilotControl("wave",true,1);lease.setPilotControl("flow",true,1);
    let maximumRockDifference=0,waterChanged=0;
    for(let frame=0;frame<24;frame++){
      for(let i=0;i<20;i++)step();
      const active=pixels(canvas,lease.render);maximumRockDifference=Math.max(maximumRockDifference,stationaryDifference(neutral,active));waterChanged=Math.max(waterChanged,difference(neutral,active));
    }
    check(maximumRockDifference===0,`Exposed rocks/banks stay exactly stationary across combined wave/flow phases: ${maximumRockDifference}`);
    check(waterChanged>20000,"Water still moves visibly around stationary obstacles");capture("river-guarded");
    for(const kind of new Set(manifests[2].layers.flatMap(l=>(l.behaviors??[]).map(b=>b.kind)))){
      lease.reset();lease.setPilotPreset("none");
      const behavior=manifests[2].layers.flatMap(l=>l.behaviors??[]).find(b=>b.kind===kind);
      if(kind==="parallax"){
        lease.camera.retarget({x:2520,y:1080,rotation:0,logScale:.65},1);for(let i=0;i<60;i++)step();
      }else for(let i=0;i<Math.round((kind==="opacity"?45:15)/behavior.params.frequencyHz);i++)step();
      const base=pixels(canvas,lease.render);lease.setPilotPreset(kind);const active=pixels(canvas,lease.render);opaque(active);
      changed[kind]=difference(base,active);check(changed[kind]>40,`${kind} affects a real painted region: ${changed[kind]} pixels`);
      if(kind==="wave")capture("water-wave");
      if(kind==="bend")capture("fern-bend");
    }
    lease.setPilotCameraMotion(false);lease.reset();lease.setPilotPreset("all");for(let i=0;i<90;i++)step();capture("animated");
    const layeredFrame=hash(pixels(canvas,lease.render)),layeredCamera=JSON.stringify(lease.camera.getSnapshot()),layeredState=JSON.stringify(lease.instance.getSnapshot());
    await lease.selectScene("pilot",manifests[1]);check(lease.instance.manifest.id==="forest-pilot","Technical pilot remains available");
    for(let i=0;i<100;i++)step();
    await lease.selectScene("layered");
    check(hash(pixels(canvas,lease.render))===layeredFrame&&JSON.stringify(lease.camera.getSnapshot())===layeredCamera&&JSON.stringify(lease.instance.getSnapshot())===layeredState,"Studio switching restores exact layered phases, camera and frame");
    await lease.selectScene("journey");
    check(hash(pixels(canvas,lease.render))===hash(original)&&JSON.stringify(lease.camera.getSnapshot())===journey,"Returning from both studios preserves original journey");
    check(canvas.getContext("webgl2")===context,"Three scene choices share one context");
    await lease.selectScene("layered");lease.setPilotCameraMotion(true);
    for(const size of [{width:360,height:640},{width:1280,height:360}]){
      lease.setPilotCameraMotion(false);lease.reset();lease.resize({...size,dpr:1,renderScale:1});lease.setPilotCameraMotion(true);
      for(let i=0;i<500;i++)step();opaque(pixels(canvas,lease.render));check(lease.getPilotCameraMotion(),"Layered camera coverage remains safe");
    }
  }finally{lease?.dispose();canvas.remove();}
  return{paintedOperators:changed,alpha,riverStationary:true,oneContext:true,studioRestore:true,journeyRestore:true,coverage:true};
};
