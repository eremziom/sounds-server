import {crc32,deflateSync} from "node:zlib";

// Hand-traced in the unchanged 1672x941 source plate. Submerged riverbed
// texture belongs to water; exposed rocks and both banks are stationary.
export const RIVER_OUTLINE=[
  [1008,308],[984,326],[958,340],[920,351],[882,364],[842,374],[799,384],[748,390],[705,398],[659,402],[617,409],[557,417],[507,425],[457,436],[408,450],[366,465],[327,475],
  [356,487],[392,498],[421,518],[463,530],[480,547],[499,560],[514,576],[526,592],[550,605],[567,622],[559,632],[534,641],[506,647],[470,650],
  [470,670],[499,683],[519,701],[544,721],[539,739],[558,756],[580,773],[620,796],[658,814],[672,836],[663,854],[652,869],[640,882],[630,899],[650,919],[657,941],
  [1050,941],[1052,905],[1070,880],[1090,867],[1115,852],[1140,837],[1157,820],[1174,800],[1203,783],[1247,767],[1290,754],[1348,743],[1404,731],[1445,718],[1484,708],[1528,697],[1574,685],[1623,675],[1672,667],
  [1672,564],[1600,560],[1525,556],[1452,551],[1383,544],[1315,535],[1256,527],[1197,515],[1150,509],[1111,498],[1069,490],[1023,480],[981,467],[942,455],[921,447],[914,433],[891,415],[883,403],[902,395],[925,389],[946,381],[961,372],[979,359],[996,342],[1015,317],
];
export const RIVER_ROCKS=[
  {id:"center-rock",polygon:[[741,445],[750,436],[757,430],[767,427],[776,420],[786,417],[800,421],[809,427],[816,436],[828,439],[841,447],[823,453],[795,455],[768,451]]},
  {id:"near-left-islet",polygon:[[601,616],[611,606],[623,601],[631,596],[642,595],[653,600],[665,601],[676,606],[687,607],[699,617],[688,625],[666,630],[643,629],[625,623]]},
  {id:"distant-rock",polygon:[[843,384],[846,376],[857,370],[868,367],[879,372],[888,377],[897,387],[884,393],[868,392],[851,389]]},
];
export const RIVER_MOTION={waveAmplitude:30,flowAmplitude:46,safetyPixels:3};

function fillPolygon(mask,width,height,polygon,value){
  const points=polygon.map(([x,y])=>[x*width/1672,y*height/941]);
  for(let y=0;y<height;y++){
    const scan=y+.5,crossings=[];
    for(let i=0;i<points.length;i++){
      const[a,b]=[points[i],points[(i+1)%points.length]];
      if((a[1]<=scan&&b[1]>scan)||(b[1]<=scan&&a[1]>scan))crossings.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    crossings.sort((a,b)=>a-b);
    for(let i=0;i+1<crossings.length;i+=2)mask.fill(value,y*width+Math.max(0,Math.ceil(crossings[i]-.5)),y*width+Math.min(width,Math.ceil(crossings[i+1]-.5)));
  }
}

/** Conservative distance in texels to any bank, rock or image edge. A composed
 * wave+flow sample travels less than that clearance, including bilinear slack.
 * No segmentation, image edits or distance calculation happens at playback. */
export function createRiverMasks(width=1600,height=900){
  const water=new Uint8Array(width*height);fillPolygon(water,width,height,RIVER_OUTLINE,1);
  for(const rock of RIVER_ROCKS)fillPolygon(water,width,height,rock.polygon,0);
  const distance=new Uint16Array(water.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)distance[y*width+x]=water[y*width+x]&&x&&y&&x<width-1&&y<height-1?65535:0;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-width-1]+1,distance[i-width]+1,distance[i-width+1]+1);
  }
  for(let y=height-2;y>0;y--)for(let x=width-2;x>0;x--){
    const i=y*width+x;distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+width-1]+1,distance[i+width]+1,distance[i+width+1]+1);
  }
  const maximumTravel=(RIVER_MOTION.waveAmplitude+RIVER_MOTION.flowAmplitude*Math.SQRT2)*Math.max(width/3840,height/2160);
  const rampPixels=Math.ceil(maximumTravel)+1;
  const visibility=new Uint8Array(water.length),stationary=new Uint8Array(water.length),influence=new Uint8Array(water.length);
  for(let i=0;i<water.length;i++){
    visibility[i]=Math.min(255,distance[i]*128);stationary[i]=255-visibility[i];
    influence[i]=Math.floor(255*Math.max(0,Math.min(1,(distance[i]-RIVER_MOTION.safetyPixels)/rampPixels)));
  }
  return{width,height,water,distance,visibility,stationary,influence,maximumTravel,rampPixels};
}

/** Minimal grayscale PNG writer for authored data maps, not artwork pixels. */
export function grayPng(width,height,data){
  function chunk(type,body){const name=Buffer.from(type),payload=Buffer.concat([name,body]),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(body.length);checksum.writeUInt32BE(crc32(payload));return Buffer.concat([length,payload,checksum]);}
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;
  const rows=Buffer.alloc((width+1)*height);
  for(let y=0;y<height;y++)rows.set(data.subarray(y*width,(y+1)*width),y*(width+1)+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(rows)),chunk("IEND",Buffer.alloc(0))]);
}
