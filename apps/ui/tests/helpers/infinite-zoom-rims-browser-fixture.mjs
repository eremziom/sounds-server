import {prepareArtwork} from "/engine/artwork/prepare-artwork.ts";
import {setRimLightingVisibility} from "/adapter/rim-lighting.ts";
import {pixels,hash,opaque,check,waitFor} from "/fixture.mjs";

window.runChitinRims=async(recordMotion=false)=>{
  const [forest,artwork,production]=await Promise.all(["/infinite-zoom/samples/forest/manifest.json","/infinite-zoom/samples/insectoid-planet/manifest.json","/infinite-zoom/samples/insectoid-planet/production.json"].map(async u=>(await fetch(u)).json()));
  const canvas=document.createElement("canvas");document.body.append(canvas);window.rimCaptures={};
  let lease,tick=0;const errors=[];
  const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>.5});
  const visible=enabled=>{setRimLightingVisibility(lease.instance,enabled);lease.render();};
  const phases=()=>JSON.stringify(lease.instance.getSnapshot().layers.map(l=>l.groups));
  const capture=name=>{lease.render();window.rimCaptures[name]=canvas.toDataURL("image/png");};
  const detail=(name,rect)=>{
    lease.render();const image=document.createElement("canvas");image.width=rect[2]*2;image.height=rect[3]*2;
    image.getContext("2d").drawImage(canvas,rect[0]*canvas.width/1672,rect[1]*canvas.height/941,rect[2]*canvas.width/1672,rect[3]*canvas.height/941,0,0,image.width,image.height);
    window.rimCaptures[name]=image.toDataURL("image/png");
  };
  const deltaAt=(on,off,px,py)=>{
    const x=Math.floor(px*canvas.width/1600),y=canvas.height-1-Math.floor(py*canvas.height/900);let delta=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const i=((y+dy)*canvas.width+x+dx)*4;delta=Math.max(delta,on[i]-off[i]+on[i+1]-off[i+1]+on[i+2]-off[i+2]);
    }return delta;
  };
  let direction;
  try{
    lease=await prepareArtwork({canvas,manifest:forest,instanceId:"rim-review",viewport:{width:1280,height:720,dpr:1,renderScale:1},onAvailabilityChange(){},onError(e){errors.push(String(e));}},new AbortController().signal);
    const gl=canvas.getContext("webgl2");await lease.selectScene("alien",artwork);visible(false);lease.setPilotPreset("glow");
    const offInitial=pixels(canvas,lease.render);capture("off");detail("off-foreground",[850,380,650,450]);detail("off-city",[0,190,550,290]);
    const before=phases(),camera=JSON.stringify(lease.camera.getSnapshot());visible(true);capture("phase-0");visible(false);
    check(hash(pixels(canvas,lease.render))===hash(offInitial)&&phases()===before&&JSON.stringify(lease.camera.getSnapshot())===camera,"Overlay off restores exact pixels without advancing phase/camera");
    const anchors=production.rimLighting.reviewSamples.flatMap((samples,b)=>[4,12,20,28,36,44].filter(k=>samples[k]?.score>.1).map(k=>({...samples[k],band:production.rimLighting.bands[b].id,energy:[]})));
    check(anchors.length>=9,"Review anchors span all three actual material bands");
    for(let sample=0;sample<48;sample++){
      if(sample)for(let i=0;i<15;i++)step();
      visible(false);const off=pixels(canvas,lease.render);
      if(sample===8)detail("comparison-off-foreground",[850,380,650,450]);
      visible(true);const on=pixels(canvas,lease.render);opaque(on);
      if(sample===8)detail("comparison-on-foreground",[850,380,650,450]);
      for(const anchor of anchors)anchor.energy.push(deltaAt(on,off,anchor.x,anchor.y));
      for(const[sx,sy]of [[1200,585],[1240,615],[1450,690],[140,275],[350,365],[700,120],[470,650]]){
        const x=Math.floor(sx*canvas.width/1672),y=canvas.height-1-Math.floor(sy*canvas.height/941),i=(y*canvas.width+x)*4;
        check(on[i]===off[i]&&on[i+1]===off[i+1]&&on[i+2]===off[i+2],"Lighting preserves protected glass, sky and rock pixels");
      }
      if(sample<24&&sample%4===0){capture(`travel-${sample}`);detail(`foreground-${sample}`,[850,380,650,450]);detail(`city-${sample}`,[0,190,550,290]);}
    }
    const comparison=document.createElement("canvas");comparison.width=1300;comparison.height=1856;
    const comparisonPen=comparison.getContext("2d");comparisonPen.fillStyle="#111";comparisonPen.fillRect(0,0,1300,1856);
    for(const[index,label,key]of [[0,"Overlay off — same phase","comparison-off-foreground"],[1,"Material lighting on — same phase","comparison-on-foreground"]]){
      const img=new Image();img.src=window.rimCaptures[key];await img.decode();comparisonPen.fillStyle="white";comparisonPen.font="18px sans-serif";comparisonPen.fillText(label,14,index*928+22);comparisonPen.drawImage(img,0,index*928+28);
    }window.rimCaptures["same-phase-comparison"]=comparison.toDataURL("image/png");
    direction=anchors.map(a=>{
      const peaks=[];
      for(let cycle=0;cycle<2;cycle++){
        const values=a.energy.slice(cycle*24,(cycle+1)*24),maximum=Math.max(...values),minimum=Math.min(...values),peak=values.indexOf(maximum)*2;
        const distance=Math.min((peak-a.phase+48)%48,(a.phase-peak+48)%48);
        check(distance<=6&&maximum-minimum>6,`Visible emission reaches its actual material anchor in order: ${JSON.stringify({band:a.band,target:a.phase,peak,distance,maximum,minimum})}`);
        peaks.push({peak,maximum,minimum});
      }return{band:a.band,phase:a.phase,peaks};
    });
    const frozen=phases(),frame=hash(pixels(canvas,lease.render));visible(false);visible(true);
    check(frame===hash(pixels(canvas,lease.render))&&phases()===frozen,"Paused toggle returns to exact light position");
    await lease.selectScene("journey");await lease.selectScene("alien");check(frame===hash(pixels(canvas,lease.render)),"Parking preserves lit material and phase");
    const ext=gl.getExtension("WEBGL_lose_context");ext.loseContext();await waitFor(()=>!lease.getDiagnostics().available);ext.restoreContext();await waitFor(()=>lease.getDiagnostics().available||errors.length);
    check(!errors.length&&frame===hash(pixels(canvas,lease.render)),"Context recovery preserves masks and lit frame");
    lease.reset();visible(false);lease.setPilotPreset("glow");check(hash(pixels(canvas,lease.render))===hash(offInitial),"Reset/off returns underlying scene");visible(true);
    if(recordMotion){
      const stream=canvas.captureStream(0),chunks=[],recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp9"});
      recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
      for(let i=0;i<360;i++){step();step();lease.render();stream.getVideoTracks()[0].requestFrame();await new Promise(resolve=>setTimeout(resolve,33));}
      await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
      window.rimMotionData=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:"video/webm"}));});
    }
    lease.camera.zoomIn(1.7,2);for(let i=0;i<120;i++)step();opaque(pixels(canvas,lease.render));capture("camera-zoom");
    for(const size of [{width:360,height:640},{width:1280,height:360}]){lease.reset();visible(true);lease.resize({...size,dpr:1,renderScale:1});for(let i=0;i<30;i++)step();opaque(pixels(canvas,lease.render));capture(`coverage-${size.width}`);}
    check(canvas.getContext("webgl2")===gl,"One context throughout");
  }finally{lease?.dispose();canvas.remove();}
  return{direction,cycles:2,periodSeconds:6,exactOff:true,protectedGlazing:true,pause:true,sceneRestore:true,contextRestore:true,zoom:true,coverage:true};
};
