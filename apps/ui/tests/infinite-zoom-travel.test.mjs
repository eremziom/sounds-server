import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseRigidTravel,createTravelSampler} from '../src/engines/infinite-zoom/artwork/rigid-travel.ts';
import {parseArtworkPackage} from '../src/engines/infinite-zoom/artwork/artwork-package.ts';
import {createArtworkInstance} from '../src/engines/infinite-zoom/artwork/artwork-instance.ts';
import {createLogicalRecorder,replayLogicalJourney} from '../src/engines/infinite-zoom/diagnostics/logical-replay.ts';
import {phase2Manifest} from './helpers/infinite-zoom-phase2-data.mjs';

const arc={kind:'bezier',segments:[{control1:{x:0,y:-400},control2:{x:600,y:-400},to:{x:600,y:0}}]};
const wave={kind:'spline',points:[{x:0,y:0},{x:200,y:-100},{x:400,y:0},{x:600,y:100},{x:800,y:0}]};
const sample=(options={})=>createTravelSampler(parseRigidTravel({startSeconds:1,durationSeconds:8,path:arc,...options}));
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function packageWith(travel){const raw=phase2Manifest([]);raw.layers[1].travel=travel;return parseArtworkPackage(raw);}

test('legacy straight flight preserves endpoints, gates, speed and zero rotation exactly',()=>{
  const at=sample({path:undefined,x:900,y:120});
  assert.deepEqual(at(0),{x:0,y:0,rotation:0,opacity:0});
  assert.deepEqual(at(1),{x:0,y:0,rotation:0,opacity:1});
  assert.deepEqual(at(5),{x:450,y:60,rotation:0,opacity:1});
  assert.deepEqual(at(9),{x:900,y:120,rotation:0,opacity:0});
  assert.deepEqual(at(999),at(9));
});

test('Bezier arc is smooth and has nearly constant physical speed despite uneven parameter speed',()=>{
  const at=sample();near(at(5).x,300);near(at(5).y,-300);
  const distances=[];let previous=at(1);
  for(let i=1;i<=600;i++){
    const p=at(1+8*i/600);distances.push(Math.hypot(p.x-previous.x,p.y-previous.y));previous=p;
  }
  assert.ok(Math.max(...distances)/Math.min(...distances)<1.002,'Distance mapping keeps speed within 0.2%');
  near(at(9).x,600);near(at(9).y,0);
});

test('waypoint spline passes through authored turns and supports a wave-shaped route',()=>{
  const at=sample({path:wave});
  near(at(5).x,400);near(at(5).y,0);
  assert.ok(at(3).y< -99);assert.ok(at(7).y>99);
  near(at(9).x,800);near(at(9).y,0);
  const rounded=sample({path:{kind:'spline',points:[{x:0,y:0},{x:300,y:-200},{x:600,y:0}],tension:.4}});
  near(rounded(5).x,300);near(rounded(5).y,-200);
});

test('easing accelerates/decelerates arc distance rather than changing the route',()=>{
  const straight=easing=>sample({path:undefined,x:800,y:0,easing});
  for(const easing of ['linear','ease-in','ease-out','ease-in-out']){
    near(straight(easing)(1).x,0);near(straight(easing)(9).x,800);
  }
  assert.ok(straight('ease-in')(3).x<straight('linear')(3).x);
  assert.ok(straight('ease-out')(3).x>straight('linear')(3).x);
  const smooth=straight('ease-in-out');
  near(smooth(5).x,400);
  assert.ok(smooth(1.1).x-smooth(1).x < smooth(5).x-smooth(4.9).x);
  assert.ok(smooth(9).x-smooth(8.9).x < smooth(5).x-smooth(4.9).x);
  // At quarter time ease-in maps to 1/16 of the same arc's distance.
  const a=sample({easing:'ease-in'})(3),b=sample()(1.5);near(a.x,b.x);near(a.y,b.y);
});

const pivot={x:700,y:420};
function anchor(pose,point=pivot){
  const x=point.x-1920,y=point.y-1080,c=Math.cos(pose.rotation),s=Math.sin(pose.rotation),scale=pose.scale??1;
  return {x:1920+pose.x+scale*(c*x-s*y),y:1080+pose.y+scale*(s*x+c*y)};
}
test('heading follows tangent around the authored off-center hull pivot, without orbital drift',()=>{
  const moving=sample({orientToPath:true,pivot}),position=sample();
  for(let i=0;i<=600;i++){
    const seconds=1+i*8/600,pose=moving(seconds),p=position(seconds),a=anchor(pose);
    near(a.x,pivot.x+p.x);near(a.y,pivot.y+p.y);
  }
  near(moving(1).rotation,-Math.PI/2);near(moving(5).rotation,0);near(moving(9).rotation,Math.PI/2);
  near(sample({orientToPath:true,pivot,headingOffsetRadians:.3})(5).rotation,.3);
});

test('heading unwraps through pi and smooth Bezier joins keep velocity and angle continuous',()=>{
  const r=200,k=.5522847498307936*r;
  const circle={kind:'bezier',segments:[
    {control1:{x:0,y:-k},control2:{x:r-k,y:-r},to:{x:r,y:-r}},
    {control1:{x:r+k,y:-r},control2:{x:2*r,y:-k},to:{x:2*r,y:0}},
    {control1:{x:2*r,y:k},control2:{x:r+k,y:r},to:{x:r,y:r}},
    {control1:{x:r-k,y:r},control2:{x:0,y:k},to:{x:0,y:0}},
  ]};
  const at=sample({path:circle,orientToPath:true,pivot:{x:1920,y:1080}});
  let previous=at(1).rotation;
  for(let i=1;i<=1200;i++){const angle=at(1+8*i/1200).rotation;assert.ok(Math.abs(angle-previous)<.01);previous=angle;}
  near(previous,3*Math.PI/2);
  for(const time of [3,5,7]){
    const e=1e-4,a=at(time-e),b=at(time),c=at(time+e);
    const vx=(b.x-a.x)/e,vy=(b.y-a.y)/e,wx=(c.x-b.x)/e,wy=(c.y-b.y)/e;
    assert.ok(Math.hypot(vx-wx,vy-wy)/Math.hypot(vx,vy)<.001);
  }
});

test('path parsing is detached, deeply frozen and rejects cusps, corners, ambiguity and unbounded data',()=>{
  const raw={startSeconds:1,durationSeconds:8,path:structuredClone(arc)},parsed=parseRigidTravel(raw);
  raw.path.segments[0].control1.x=999;assert.equal(parsed.path.segments[0].control1.x,0);
  assert.ok(Object.isFrozen(parsed.path.segments[0].control1));assert.ok(Object.isFrozen(parsed.path.segments));
  const invalid=[
    {path:arc,x:0,y:0},{path:{...arc,kind:'arc'}},{path:{...arc,extra:1}},
    {path:{kind:'bezier',segments:[]}},{path:{kind:'spline',points:[{x:1,y:0},{x:100,y:0}]}},
    {path:{kind:'spline',points:[{x:0,y:0},{x:100,y:0},{x:0,y:0}]}},
    {path:{kind:'spline',points:[{x:0,y:0},{x:0,y:0}]}},
    {path:{...wave,tension:1}},{path:{...wave,tension:NaN}},
    {easing:'bounce'},{easing:{toString:()=> 'linear'}},{orientToPath:1},
    {orientToPath:true},{orientToPath:true,pivot:{x:-1,y:0}},
    {headingOffsetRadians:1},{pivot},{orientToPath:true,pivot,headingOffsetRadians:Infinity},
    {path:undefined,x:0,y:0,orientToPath:true,pivot},
    {path:{kind:'bezier',segments:[{control1:{x:0,y:0},control2:{x:10,y:10},to:{x:100,y:0}}]}},
    {path:{kind:'bezier',segments:[{control1:{x:100,y:0},control2:{x:-100,y:0},to:{x:0,y:0}}]}},
    {path:{kind:'bezier',segments:[...arc.segments,{control1:{x:700,y:0},control2:{x:800,y:0},to:{x:900,y:0}}]}},
    {path:{kind:'bezier',segments:[{control1:{x:NaN,y:0},control2:{x:100,y:0},to:{x:200,y:0}}]}},
    {path:{kind:'spline',points:Array.from({length:66},(_,i)=>({x:i,y:0}))}},
    {path:{kind:'spline',points:[{x:0,y:0},{x:3841,y:0}]}},
  ];
  for(const patch of invalid)assert.throws(()=>parseRigidTravel({...raw,...patch}));
});

test('schema/coverage validation still rejects moving base layers, spin conflicts and schema 1 extensions',()=>{
  const travel={startSeconds:0,durationSeconds:8,path:arc};
  for(const mutate of [raw=>raw.schemaVersion=1,raw=>raw.layers[0].travel=travel,
    raw=>raw.layers[1].spin={pivotX:100,pivotY:100,turnsPerSecond:.1}]){
    const raw=phase2Manifest([]);raw.layers[1].travel=travel;mutate(raw);assert.throws(()=>parseArtworkPackage(raw));
  }
});

test('layer transform composes with curved pivot motion; pause, reset and logical replay reproduce the same journey',()=>{
  const manifest=packageWith({startSeconds:1,durationSeconds:8,path:wave,orientToPath:true,pivot,easing:'ease-in-out'});
  const instance=createArtworkInstance('flight',manifest),fresh=createArtworkInstance('flight',manifest),initial=instance.getSnapshot();
  const packages=[{id:manifest.id,version:manifest.version}],recorder=createLogicalRecorder(123,packages,600);
  for(let tick=1;tick<=360;tick++){instance.stepBehaviors({dt:1/60});recorder.capture(tick,null);if(tick===180){const paused=instance.getSnapshot();for(let i=0;i<20;i++)assert.deepEqual(instance.getSnapshot(),paused);}}
  replayLogicalJourney(JSON.parse(JSON.stringify(recorder.export())),{packages,command(){},step:c=>fresh.stepBehaviors(c)});
  assert.deepEqual(fresh.getSnapshot(),instance.getSnapshot());
  const source=sample({startSeconds:1,durationSeconds:8,path:wave,easing:'ease-in-out'})(6);
  instance.setLayerTransform('foreground',{x:31,y:-17,scale:1.2,rotation:.4});
  const actual=anchor(instance.getSnapshot().layers[1]);
  const x=pivot.x-1920+source.x,y=pivot.y-1080+source.y;
  near(actual.x,1920+31+1.2*(Math.cos(.4)*x-Math.sin(.4)*y));
  near(actual.y,1080-17+1.2*(Math.sin(.4)*x+Math.cos(.4)*y));
  instance.reset();assert.deepEqual(instance.getSnapshot(),initial);
});
