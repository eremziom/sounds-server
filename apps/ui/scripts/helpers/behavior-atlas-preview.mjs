import { prepareArtwork } from "iz:engine/artwork/prepare-artwork.ts";
import { decodeArtworkAsset } from "iz:engine/artwork/artwork-loader.ts";
import { createInfiniteZoomController } from "iz:engine/core/infinite-zoom-controller.ts";

const data=window.atlasData,canvas=document.querySelector("#canvas"),status=document.querySelector("#status");
const play=document.querySelector("#play"),reset=document.querySelector("#reset"),focus=document.querySelector("#focus");
const camera=document.querySelector("#camera"),strength=document.querySelector("#strength"),error=document.querySelector("#error");
let lease,cameraWasMoving=false;
const viewport={width:1280,height:720,dpr:1,renderScale:1};
const engine=createInfiniteZoomController({seed:181,scheduler:{request:callback=>requestAnimationFrame(callback),cancel:handle=>cancelAnimationFrame(handle)},
  async prepare(signal) {
    lease=await prepareArtwork({canvas,manifest:data.manifest,instanceId:"behavior-atlas",viewport,
      decode:(asset,decodeSignal)=>decodeArtworkAsset({...asset,uri:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.assets[asset.uri])}`},decodeSignal),
      modulation:()=>({strength:Number(strength.value),intensity:1}),
      onAvailabilityChange:available=>engine.setSuspended("context-lost",!available),onError:failure=>showError(failure),
      evaluate(instance,context) {
        if(camera.checked) {
          const snapshot=lease.camera.getSnapshot();
          if(!snapshot.moving) {
            const segment=Math.floor(context.tick/240)%2;
            lease.camera.retarget({x:1920+(snapshot.pose.logScale<0.3?0:segment?300:-300),y:1080,rotation:0,logScale:0.35},4);
          }
          cameraWasMoving=true;
        } else if(cameraWasMoving) {lease.camera.returnTo("full-frame",2);cameraWasMoving=false;}
        for(const panel of data.panels)instance.setLayerTransform(panel.id,{opacity:focus.value==="all"||focus.value===panel.id?1:0});
      },
    },signal);
    return lease;
  },
});
function showError(failure) {error.hidden=false;error.textContent=String(failure instanceof Error?failure.message:failure);}
function publish() {
  const snapshot=engine.getSnapshot();
  canvas.dataset.tick=String(snapshot.session.tick);canvas.dataset.status=snapshot.status;
  play.textContent=snapshot.status==="running"?"Pauza":"Start";
  status.textContent=`${snapshot.status==="running"?"Animacja trwa":snapshot.status==="paused"?"Pauza":snapshot.status==="ready"?"Gotowe":"Stan: "+snapshot.status} · ${(snapshot.session.tick/60).toFixed(1)} s`;
  if(snapshot.error)showError(snapshot.error);
}
play.addEventListener("click",()=>{try {const state=engine.getSnapshot().status;if(state==="running")engine.pause();else if(state==="ready")engine.start();else engine.resume();publish();}catch(failure){showError(failure);}});
reset.addEventListener("click",()=>{engine.reset();cameraWasMoving=false;publish();});
focus.addEventListener("change",()=>{
  for(const panel of data.panels)lease?.instance.setLayerTransform(panel.id,{opacity:focus.value==="all"||focus.value===panel.id?1:0});
  lease?.render();
});
document.addEventListener("visibilitychange",()=>engine.setSuspended("hidden",document.hidden));
const timer=setInterval(publish,100);
window.addEventListener("pagehide",()=>{clearInterval(timer);engine.dispose();},{once:true});

async function exportMaster() {
  const image=new Image();image.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.master)}`;await image.decode();
  const output=document.createElement("canvas");output.width=3840;output.height=2160;output.getContext("2d").drawImage(image,0,0);
  return output.toDataURL("image/png");
}
document.querySelector("#download").addEventListener("click",async()=>{
  try{const link=document.createElement("a");link.href=await exportMaster();link.download="infinite-zoom-12-behaviors-3840x2160.png";link.click();}catch(failure){showError(failure);}
});
// Test access to the same live engine; creates no second renderer.
window.behaviorAtlas={getSnapshot:()=>engine.getSnapshot(),getArtwork:()=>lease?.instance.getSnapshot(),
  getCamera:()=>lease?.camera.getSnapshot(),getDiagnostics:()=>lease?.getDiagnostics(),exportMaster,
  stepForTest(tick){lease.step({tick,timeSeconds:tick/60,dt:1/60,random:()=>0.5});lease.render();},
  cameraForTest(pose){lease.camera.reset(pose);cameraWasMoving=false;},
  resetForTest(){engine.reset();cameraWasMoving=false;},getCanvas:()=>canvas,renderForTest(){lease.render();}};
try{await engine.prepare();play.disabled=false;reset.disabled=false;publish();}catch(failure){showError(failure);publish();}
