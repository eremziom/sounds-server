import {prepareArtwork} from "/engine/artwork/prepare-artwork.ts";
import {decodeArtworkAsset} from "/engine/artwork/artwork-loader.ts";
import {pixels,hash,opaque,check,waitFor} from "/fixture.mjs";

window.runClockworkArtwork=async()=>{
  const [forest,mechanism,layered]=await Promise.all(["forest","clockwork","forest-layered"].map(async id=>(await fetch(`/infinite-zoom/samples/${id}/manifest.json`)).json()));
  const canvas=document.createElement("canvas");document.body.append(canvas);window.clockworkCaptures={};
  let lease,tick=0;const matteChecks=[],errors=[],lightingVisibility={};
  const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>.5});
  const capture=name=>{lease.render();window.clockworkCaptures[name]=canvas.toDataURL("image/png");};
  const captureGlintDetail=name=>{
    lease.render();const crop=document.createElement("canvas");crop.width=480;crop.height=480;
    crop.getContext("2d").drawImage(canvas,430*canvas.width/1672,310*canvas.height/941,210*canvas.width/1672,210*canvas.height/941,0,0,480,480);
    window.clockworkCaptures[name]=crop.toDataURL("image/png");
  };
  const snapshot=()=>lease.instance.getSnapshot();
  try{
    lease=await prepareArtwork({canvas,manifest:forest,instanceId:"clockwork-test",viewport:{width:1280,height:720,dpr:1,renderScale:1},onAvailabilityChange(){},onError(e){errors.push(String(e));},
      async decode(asset,signal){const decoded=await decodeArtworkAsset(asset,signal);
        if(asset.uri.includes("clockwork/wheel")){
          const rotor=mechanism.layers.find(l=>l.imageAssetId===asset.id),sample=new OffscreenCanvas(asset.width,asset.height),pen=sample.getContext("2d",{willReadFrequently:true});pen.drawImage(decoded.image,0,0);
          const x=Math.floor(rotor.spin.pivotX*asset.width/3840),y=asset.height-1-Math.floor(rotor.spin.pivotY*asset.height/2160);
          matteChecks.push(!decoded.opaque&&pen.getImageData(x,y,1,1).data[3]===0&&pen.getImageData(0,0,1,1).data[3]===0);
        }return decoded;
      },
    },new AbortController().signal);
    const gl=canvas.getContext("webgl2"),journey=hash(pixels(canvas,lease.render));
    await lease.selectScene("clockwork",mechanism);
    check(matteChecks.length===5&&matteChecks.every(Boolean),"All five cleaned gear mattes have genuinely transparent axle holes and margins");
    check(lease.getDiagnostics().estimatedTextureBytes<48*1024*1024&&lease.getDiagnostics().artworks===1,"Clockwork fits active-scene GPU budget");
    check(JSON.stringify(lease.getPilotControls().map(c=>c.kind))===JSON.stringify(["rotate","pulse","glow"]),"Only meaningful mechanical controls are shown");
    lease.setPilotPreset("none");const initial=pixels(canvas,lease.render);opaque(initial);capture("initial");
    lease.setPilotPreset("rotate");for(let i=0;i<120;i++)step();const moving=pixels(canvas,lease.render);opaque(moving);capture("rotating");
    check(hash(initial)!==hash(moving),"Clockwork visibly rotates actual painted metal");
    const left=snapshot().layers.find(l=>l.id==="wheel-left"),center=snapshot().layers.find(l=>l.id==="wheel-center");
    check(left.rotation>0&&center.rotation<0&&Math.abs(left.rotation+center.rotation)<1e-10,"Neighboring large wheels share speed and counter-rotate");
    // Original bearing caps and fixed bridge patches must not move with rotors.
    let stationaryMax=0;
    for(const[x,y]of [[469,477],[845,477],[1223,477],[700,237],[1005,237],[180,133],[1515,468]]){
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        const px=Math.floor(x*canvas.width/1672)+dx,py=canvas.height-1-Math.floor(y*canvas.height/941)+dy,i=(py*canvas.width+px)*4;
        for(let c=0;c<3;c++)stationaryMax=Math.max(stationaryMax,Math.abs(initial[i+c]-moving[i+c]));
      }
    }
    check(stationaryMax===0,`Fixed bearings/bridges keep exact original pixels: ${stationaryMax}`);
    lease.setPilotControl("rotate",false,1);const stopped=JSON.stringify(snapshot().layers.map(l=>[l.x,l.y,l.rotation]));
    for(let i=0;i<180;i++)step();check(stopped===JSON.stringify(snapshot().layers.map(l=>[l.x,l.y,l.rotation])),"Disabling drive freezes exact rotor orientation");
    lease.setPilotControl("rotate",true,.5);for(let i=0;i<60;i++)step();
    check(Math.abs(snapshot().layers.find(l=>l.id==="wheel-left").rotation-left.rotation-Math.PI/24)<1e-10,"Half speed resumes without snapping teeth");
    const retained=JSON.stringify(snapshot()),camera=JSON.stringify(lease.camera.getSnapshot()),frame=hash(pixels(canvas,lease.render));
    await lease.selectScene("layered",layered);for(let i=0;i<60;i++)step();await lease.selectScene("clockwork");
    check(retained===JSON.stringify(snapshot())&&camera===JSON.stringify(lease.camera.getSnapshot())&&frame===hash(pixels(canvas,lease.render)),"Returning restores exact parked mechanical phase/frame");
    const ext=gl.getExtension("WEBGL_lose_context");ext.loseContext();await waitFor(()=>!lease.getDiagnostics().available);ext.restoreContext();await waitFor(()=>lease.getDiagnostics().available||errors.length);
    check(!errors.length&&frame===hash(pixels(canvas,lease.render)),"Context recovery preserves rigid motion and matte registration");
    // Regression: authored lighting must be local. Broad exposure/contrast
    // changes would fail even if their mean brightness looked impressive.
    for(const kind of ["pulse","glow"]){
      lease.reset();lease.setPilotPreset("none");const neutral=pixels(canvas,lease.render);capture(`light-${kind}-off`);
      const details=[[428,133,12],[1238,210,11],[841,838,14]];
      let peakCount=0,maximumDelta=0,outsidePulse=0,shadowChanges=0,negativeGlint=0;
      lease.setPilotPreset(kind);
      for(let sample=0;sample<30;sample++){
        for(let i=0;i<12;i++)step();const active=pixels(canvas,lease.render);let changed=0;
        for(let i=0;i<active.length;i+=4){
          const dr=active[i]-neutral[i],dg=active[i+1]-neutral[i+1],db=active[i+2]-neutral[i+2],delta=Math.abs(dr)+Math.abs(dg)+Math.abs(db);
          maximumDelta=Math.max(maximumDelta,Math.abs(dr),Math.abs(dg),Math.abs(db));
          if(kind==="glow"&&Math.min(dr,dg,db)<-1)negativeGlint++;
          if(delta<8)continue;changed++;
          if(kind==="glow"&&.2126*neutral[i]+.7152*neutral[i+1]+.0722*neutral[i+2]<40)shadowChanges++;
          if(kind==="pulse"){
            const p=i/4,x=(p%canvas.width+.5)*1672/canvas.width,y=(canvas.height-1-Math.floor(p/canvas.width)+.5)*941/canvas.height;
            if(!details.some(([cx,cy,r])=>Math.hypot(x-cx,y-cy)<r+3))outsidePulse++;
          }
        }
        if(changed>peakCount){peakCount=changed;capture(`light-${kind}-on`);}
      }
      lightingVisibility[kind]={changedPixels:peakCount,frameFraction:peakCount/(canvas.width*canvas.height),maximumDelta,outsidePulse,shadowChanges,negativeGlint};
      check(peakCount>80&&maximumDelta>20,`${kind} must visibly affect authored details: ${JSON.stringify(lightingVisibility[kind])}`);
      check(peakCount/(canvas.width*canvas.height)<(kind==="pulse"?.003:.02),`${kind} must not behave as a frame-wide exposure change: ${JSON.stringify(lightingVisibility[kind])}`);
      check(outsidePulse===0,"Pulse cannot alter anything outside the three selected bearing interiors");
      check(shadowChanges===0&&negativeGlint===0,`Glints only add light to highlights, preserving dark metal: ${JSON.stringify(lightingVisibility[kind])}`);
    }
    lease.reset();lease.setPilotPreset("none");const glintOff=pixels(canvas,lease.render);captureGlintDetail("glint-detail-off");
    lease.setPilotPreset("glow");const glintOn=pixels(canvas,lease.render);captureGlintDetail("glint-detail-on");
    let clearInitialGlints=0,maximumInitialBlue=0;
    for(let i=0;i<glintOn.length;i+=4){
      if(glintOn[i]-glintOff[i]+glintOn[i+1]-glintOff[i+1]+glintOn[i+2]-glintOff[i+2]>90)clearInitialGlints++;
      maximumInitialBlue=Math.max(maximumInitialBlue,glintOn[i+2]-glintOff[i+2]);
    }
    check(clearInitialGlints>150&&maximumInitialBlue>80,`Initial specular reflection must be visibly warmer-white, not only a tiny albedo boost: ${clearInitialGlints} pixels, blue lift ${maximumInitialBlue}`);
    lightingVisibility.glow.initialBrightPixels=clearInitialGlints;lightingVisibility.glow.initialBlueLift=maximumInitialBlue;
    lease.reset();lease.setPilotPreset("all");for(let i=0;i<180;i++)step();capture("animated");
    for(const size of [{width:360,height:640},{width:1280,height:360}]){
      lease.setPilotCameraMotion(false);lease.reset();lease.resize({...size,dpr:1,renderScale:1});lease.setPilotCameraMotion(true);
      for(let i=0;i<500;i++)step();opaque(pixels(canvas,lease.render));check(lease.getPilotCameraMotion(),"Clockwork camera preserves coverage");
    }
    await lease.selectScene("journey");lease.resize({width:1280,height:720,dpr:1,renderScale:1});check(hash(pixels(canvas,lease.render))===journey,"Original journey remains exact");
    check(canvas.getContext("webgl2")===gl,"All scenes retain one context");
  }finally{lease?.dispose();canvas.remove();}
  return{rotors:5,trueAlpha:true,counterRotation:true,fixedAxles:true,speedFreezeResume:true,lightingVisibility,studioRestore:true,contextRecovery:true,coverage:true};
};
