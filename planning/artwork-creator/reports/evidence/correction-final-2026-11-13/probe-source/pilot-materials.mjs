// Deterministic authoring operations. These select existing pixels, never draw lights.
export function pathDelay(x,y,paths){
  let nearest=Infinity,delay=0;
  for(const points of paths){
    const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
    const total=lengths.reduce((a,b)=>a+b,0);let before=0;
    if(!total)throw Error('Delay path must have positive length');
    for(let i=0;i<lengths.length;i++){
      const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1];
      const t=lengths[i]?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/lengths[i]**2)):0;
      const distance=Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
      if(distance<nearest){nearest=distance;delay=(before+t*lengths[i])/total;}
      before+=lengths[i];
    }
  }
  return {distance:nearest,delay};
}

export function selectMaterials(rgb,width,height,paths,exclusion){
  if(rgb.length!==width*height*3||exclusion.length!==width*height)throw Error('Unregistered material inputs');
  const masks=[new Uint8Array(width*height),new Uint8Array(width*height),new Uint8Array(width*height)];
  const delay=new Uint8Array(width*height);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;if(exclusion[i])continue;
    const [r,g,b]=rgb.subarray(i*3,i*3+3),max=Math.max(r,g,b),min=Math.min(r,g,b);
    // Reject blue stone faces and gray highlights; retain chromatic cyan/magenta/amber details.
    const chromatic=min<max*.45&&max>125&&((g>r*1.4&&b>r*1.35)||(r>g*1.3&&b>g*1.15)||(r>b*1.45&&g>b*1.15));
    if(!chromatic)continue;
    const along=pathDelay(x,y,paths);
    // Away from authored vines, require a small local ridge in existing material.
    const offsets=[-3,3,-3*width,3*width];
    const neighbors=offsets.map(o=>{
      const j=Math.max(0,Math.min(width*height-1,i+o))*3;
      return Math.max(rgb[j],rgb[j+1],rgb[j+2]);
    });
    const ridge=max-Math.min(...neighbors)>28;
    const plantRegion=y>310&&y<510&&x>50&&x<950;
    const stoneDetail=x>410&&x<935&&y>50&&y<475;
    if(along.distance>5&&!(ridge&&(plantRegion||stoneDetail)))continue;
    const group=x<380?0:x<650?1:2;
    // A narrow gray edge retains source antialiasing; no generic broad blur.
    masks[group][i]=Math.min(255,Math.round((max-65)*4));
    delay[i]=Math.round(along.delay*255);
  }
  return {masks,delay};
}
