import {prepareArtwork} from '/engine/artwork/prepare-artwork.ts';
window.runDigitalGrid=async()=>{
  const manifest=await(await fetch('/infinite-zoom/samples/digital-grid/manifest.json')).json();
  const canvas=document.createElement('canvas');document.body.append(canvas);window.qaCaptures={};let lease,tick=0;const errors=[];
  const check=(v,m)=>{if(!v)throw Error(m);};
  const step=()=>lease.step({tick:++tick,timeSeconds:tick/60,dt:1/60,random:()=>.5});
  const frame=()=>{lease.render();const gl=canvas.getContext('webgl2'),p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const capture=name=>{lease.render();window.qaCaptures[name]=canvas.toDataURL('image/png');};
  const difference=(a,b)=>{let count=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d>4)count++;max=Math.max(max,d);}return{count,max};};
  const opaque=p=>{for(let i=3;i<p.length;i+=4)check(p[i]===255,'Opaque viewport');};
  try{
    lease=await prepareArtwork({canvas,manifest,instanceId:'digital-qa',viewport:{width:1600,height:900,dpr:1,renderScale:1},highPrecisionColor:true,onAvailabilityChange(){},onError:e=>errors.push(String(e))},new AbortController().signal);
    const support=new Uint8Array(1600*900),palettePeaks={cyan:0,white:0,orange:0,green:0,blue:0,violet:0};
    for(const id of ['rear-wheel','front-wheel','body-panels']){
      const image=new Image();image.src=`/infinite-zoom/samples/digital-grid/visible-${id}.png`;await image.decode();
      const c=document.createElement('canvas');c.width=1600;c.height=900;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const p=ctx.getImageData(0,0,1600,900).data;
      for(let i=0;i<support.length;i++)support[i]=Math.max(support[i],p[i*4]);
    }
    const inspectPalette=p=>{
      const counts={cyan:0,white:0,orange:0,green:0,blue:0,violet:0};
      for(let y=350;y<830;y++)for(let x=135;x<1480;x++){
        if(support[y*1600+x]<220)continue;
        const i=((899-y)*1600+x)*4,r=p[i]/255,g=p[i+1]/255,b=p[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
        if(min>.6&&d<.12){counts.white++;continue;}
        if(max<.35||d/max<.5)continue;
        let h=(max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60;h=(h+360)%360;
        const color=h>=20&&h<50?'orange':h>=70&&h<160?'green':h>=170&&h<205?'cyan':h>=210&&h<255?'blue':h>=260&&h<305?'violet':null;
        if(color)counts[color]++;
      }
      for(const color of Object.keys(counts))palettePeaks[color]=Math.max(palettePeaks[color],counts[color]);
    };
    capture('initial');const initial=frame();opaque(initial);
    const stream=canvas.captureStream(0),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'});recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
    // 28 simulation seconds: delayed startup, two complete 12 s waves, exact
    // blackout, smooth environment reveal and existing camera zoom/pan combined.
    const phases=[];
    for(let f=0;f<840;f++){
      if(f===60)lease.instance.setLayerTransform('environment',{opacity:0});
      if(f===120){const a=frame();for(let i=0;i<8;i++)lease.render();check(difference(a,frame()).max===0,'Pause freezes all light');}
      if(f>=180&&f<=420){const t=(f-180)/240;lease.instance.setLayerTransform('environment',{opacity:t*t*(3-2*t)});}
      if(f===450)lease.camera.retarget({x:1920,y:1080,rotation:0,logScale:.65},3);
      if(f===600)lease.camera.retarget({x:2300,y:1250,rotation:0,logScale:.65},3);
      if(f===720)lease.camera.retarget({x:1920,y:1080,rotation:0,logScale:0},3);
      step();step();lease.render();stream.getVideoTracks()[0].requestFrame();
      if(f%30===0||[60,120,180,300,420,540,660,780].includes(f)){const p=frame();opaque(p);if(f<450)inspectPalette(p);phases.push({seconds:tick/60,...difference(initial,p)});capture(`time-${f}`);}
      await new Promise(r=>setTimeout(r,33));
    }
    await new Promise(r=>{recorder.onstop=r;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
    window.qaMotion=await new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
    check(phases.filter(p=>p.seconds>1).every(p=>p.count>1000),'Visible local animation and environment changes after initial frame');
    check(Object.values(palettePeaks).every(count=>count>500),`All six diagnostic colors occupy visible motorcycle material: ${JSON.stringify(palettePeaks)}`);
    lease.reset();tick=0;check(difference(initial,frame()).max===0,'Reset restores exact frame');
    // Exact black outside authored protected material at tick zero.
    lease.instance.setLayerTransform('environment',{opacity:0});const black=frame();opaque(black);capture('blackout-start');
    for(let i=0;i<black.length;i+=4)if(i/4%1600>800&&i/4%1600<1100&&Math.floor(i/4/1600)>700){check(black[i]===0&&black[i+1]===0&&black[i+2]===0,'Black sky remains exact black');}
    for(let i=0;i<180;i++)step();const animatedBlack=frame();check(difference(black,animatedBlack).count>1000,'Independent lights animate in blackout');capture('blackout-3s');
    const paused=frame();for(let i=0;i<10;i++)lease.render();check(difference(paused,frame()).max===0,'Pause freezes blackout lights');
    check(errors.length===0,errors.join('\n'));
    return{simulationSeconds:28,cycles:2,travelDelaySeconds:4,zoom:true,pan:true,pause:true,reset:true,opaque:true,blackout:true,animatedLightsFromStart:true,smoothRevealSeconds:8,palettePeaks,phases,errors,colorBuffer:lease.getDiagnostics().colorBuffer};
  }finally{lease?.dispose();canvas.remove();}
};
