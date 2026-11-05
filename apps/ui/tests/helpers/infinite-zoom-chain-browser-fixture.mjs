import { prepareArtwork } from "/engine/artwork/prepare-artwork.ts";
import { decodeArtworkAsset, loadArtwork } from "/engine/artwork/artwork-loader.ts";
import { createArtworkInstance } from "/engine/artwork/artwork-instance.ts";
import { createArtworkRenderer } from "/engine/renderer/artwork-renderer.ts";
import { createCameraController } from "/engine/camera/index.ts";
import { check, pixels, opaque, waitFor } from "/fixture.mjs";

const still = manifest => {
  const value=structuredClone(manifest); value.behaviors=[];
  for(const layer of value.layers) {
    // Keep a zero-displacement masked operator so the pixel oracle still
    // allocates the real R8 textures; remove only visible internal motion.
    layer.behaviors=(layer.behaviors??[]).filter(b=>b.kind==="translate"&&b.influenceMaskAssetId)
      .map(b=>({...b,params:{...b.params,x:0,y:0}}));
    layer.regions=[];
  }
  return value;
};
const difference=(a,b)=>{let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;};
const viewport={width:640,height:360,dpr:1,renderScale:1};
function link(source,a,b) {
  const p=source.portal;
  return {sourceId:a,destinationId:b,placement:{x:p.region.x,y:p.region.y,rotation:p.region.rotation,scale:p.scale,anchorX:1920,anchorY:1080},
    portal:p.region,destinationCamera:p.destinationCamera};
}

async function handoffPixels(manifests,handoffs) {
  const loaded=[],signal=new AbortController().signal;
  const canvas=document.createElement("canvas");document.body.append(canvas);
  let renderer;
  try {
    for(const manifest of manifests) loaded.push(await loadArtwork(manifest,signal));
    const instances=loaded.map((l,i)=>createArtworkInstance(`world-${i}`,l.manifest));
    const camera=createCameraController(()=>true,handoffs[0].before.pose);
    renderer=createArtworkRenderer(canvas,loaded[0],instances[0],{camera,viewport,onAvailabilityChange(){},onError(e){throw e;}});
    for(let i=1;i<3;i++)renderer.attach(loaded[i],instances[i]);
    const bc=link(manifests[1],instances[1].id,instances[2].id);
    const abc={...link(manifests[0],instances[0].id,instances[1].id),destinationComposition:bc};
    const differences=[];
    for(let i=0;i<2;i++) {
      camera.reset(handoffs[i].before.pose);renderer.setComposition(i===0?abc:bc);
      const before=pixels(canvas,renderer.render);opaque(before);
      camera.reset(handoffs[i].after.pose);renderer.setComposition(i===0?bc:{sourceId:instances[2].id});
      const after=pixels(canvas,renderer.render);opaque(after);
      const max=difference(before,after);check(max<=2,`Nested handoff ${i+1} retains pixels: ${max}`);differences.push(max);
    }
    return differences;
  } finally {renderer?.dispose();for(const l of loaded)l.dispose();canvas.remove();}
}

window.runDemoChain=async()=>{
  const manifests=await Promise.all(["forest","nebula","underwater-cavern"].map(async n=>still(await(await fetch(`/infinite-zoom/samples/${n}/manifest.json`)).json())));
  const canvas=document.createElement("canvas");document.body.append(canvas);
  const closed=[],errors=[],handoffs=[];
  let r8=0;
  const proto=WebGL2RenderingContext.prototype,storage=proto.texStorage2D,image=proto.texImage2D;
  proto.texStorage2D=function(...args){if(args[2]===this.R8)r8++;return storage.apply(this,args);};
  proto.texImage2D=function(...args){if(args[2]===this.R8)r8++;return image.apply(this,args);};
  let lease,tick=0;
  const captures=window.demoChainCaptures={};
  const capture=name=>{lease.render();captures[name]=canvas.toDataURL("image/png");};
  const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>0.5});
  try {
    lease=await prepareArtwork({canvas,manifest:manifests[0],instanceId:"demo",viewport,
      resolveManifest:async uri=>manifests.find(m=>uri.endsWith(`/${m.id}/manifest.json`)),
      onAvailabilityChange(){},onError(e){errors.push(String(e));},
      async decode(asset,signal){const value=await decodeArtworkAsset(asset,signal),entry={uri:asset.uri,closes:0};closed.push(entry);
        return {...value,close(){entry.closes++;value.close();}};}
    },new AbortController().signal);
    const initial=pixels(canvas,lease.render);opaque(initial);capture("initial");
    check(closed.length===9&&lease.getDiagnostics().artworks===3,"All three worlds are ready before playback");
    check(r8>=3,"Masks really use R8 GPU allocation");
    check(lease.getDiagnostics().estimatedTextureBytes===223948800,"Three 4K packages use the exact RGBA8/R8 estimate");
    check(lease.getDiagnostics().estimatedTextureBytes+lease.getDiagnostics().estimatedTargetBytes<256*1024*1024,"Unchanged budget admits the entire chain");
    for(let i=0;i<2;i++) {
      const beforeCommand=pixels(canvas,lease.render);
      lease.transition.start();
      check(difference(beforeCommand,pixels(canvas,lease.render))<=2,"Each travel command preserves the existing embedded composition");
      if(i===1) {
        for(let j=0;j<120;j++)step();
        lease.transition.cancel();for(let j=0;j<960;j++)step();
        check(lease.transition.getSnapshot().phase==="cancelled"&&lease.instance.manifest.id==="nebula","B-to-C cancellation retains B and visible C");
        check(difference(beforeCommand,pixels(canvas,lease.render))<=2,"B-to-C rollback restores exact embedded C pixels");
        lease.transition.start();for(let j=0;j<120;j++)step();
        const snapshot=JSON.stringify({camera:lease.camera.getSnapshot(),transition:lease.transition.getSnapshot()});
        const frame=pixels(canvas,lease.render),ext=canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
        ext.loseContext();await waitFor(()=>!lease.getDiagnostics().available);
        ext.restoreContext();await waitFor(()=>lease.getDiagnostics().available||errors.length);
        check(errors.length===0,errors.join(";"));
        check(snapshot===JSON.stringify({camera:lease.camera.getSnapshot(),transition:lease.transition.getSnapshot()}),"Second transition survives context recovery without reset");
        check(difference(frame,pixels(canvas,lease.render))<=2,"Second transition recovers identical pixels");
      }
      for(let j=0;j<960&&lease.transition.getSnapshot().phase!=="committed";j++) {
        step();if(j%30===0)opaque(pixels(canvas,lease.render));
        if(i===1&&j===480)capture("cave-approach");
      }
      const state=lease.transition.getSnapshot();check(state.phase==="committed",`Transition ${i+1} commits`);
      check(Math.abs(lease.camera.getSnapshot().pose.logScale)<1e-8,"Each destination stops at full frame");
      check(lease.camera.getSnapshot().velocity.logScale===0,"Handoff camera has no zoom velocity");
      handoffs.push(state.handoff);capture(i===0?"nebula-with-cave":"cave");
      check(state.canStart===(i===0),"Next travel is enabled only when an authored destination exists");
    }
    const final=pixels(canvas,lease.render);for(let j=0;j<120;j++)step();
    check(difference(final,pixels(canvas,lease.render))<=2,"C remains at full frame after travel ends");
    lease.reset();check(lease.instance.manifest.id==="forest","Reset from C returns to A");
    check(difference(initial,pixels(canvas,lease.render))<=2,"Reset from C restores exact nested initial pixels");
    check(closed.every(a=>a.closes===0),"Bounded three-world cache needs no reload on reset");
    for(const size of [{width:240,height:360},{width:960,height:240}]) {
      lease.resize({...viewport,...size});
      for(let i=0;i<2;i++) {lease.transition.start();for(let j=0;j<960;j++)step();opaque(pixels(canvas,lease.render));}
      check(lease.instance.manifest.id==="underwater-cavern","Both transitions cover portrait and wide viewports");lease.reset();
    }
  } finally {
    lease?.dispose();canvas.remove();proto.texStorage2D=storage;proto.texImage2D=image;
    check(closed.every(a=>a.closes===1),"All nine bitmaps close exactly once");
    if(lease)check(lease.getDiagnostics().textures===0,"All three worlds release GPU resources");
  }
  return {worlds:3,decodedBitmaps:closed.length,r8Allocations:r8,textureBytes:223948800,resetFromC:true,
    rollbackToB:true,contextRecovery:true,portraitWide:true,handoffMaximumDifferences:await handoffPixels(manifests,handoffs)};
};
