import assert from "node:assert/strict";
import { test } from "node:test";
import { createCameraController, cameraMatrix, viewportCorners, FULL_FRAME } from "../src/engines/infinite-zoom/camera/index.ts";
import { coversViewport, getCoverView } from "../src/engines/infinite-zoom/artwork/artwork-instance.ts";

import * as placementMath from "../src/engines/infinite-zoom/transition/placement.ts";

const base = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
const safe = pose => coversViewport(base, getCoverView(1920, 1080), pose);
const run = (camera, ticks) => { for (let i = 0; i < ticks; i++) camera.step(); };
const close = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≈ ${b}`);

test("camera matrix uses column vectors, clockwise artwork rotation and explicit inverse corners", () => {
  const pose = { x: 100, y: 200, rotation: Math.PI / 2, logScale: Math.log(2) };
  const matrix = cameraMatrix(pose);
  const transform = (x, y) => [matrix[0] * x + matrix[1] * y + matrix[2], matrix[3] * x + matrix[4] * y + matrix[5]];
  const center = transform(100, 200); close(center[0], 0); close(center[1], 0);
  const right = transform(110, 200); close(right[0], 0); close(right[1], -20);
  const corners = viewportCorners(pose, { width: 600, height: 400 });
  for (const corner of corners) {
    const [x, y] = transform(corner.x, corner.y);
    close(Math.abs(x), 300); close(Math.abs(y), 200);
  }
});

test("camera zoom/move/rotate/hold/return remain covered and return exactly without drift", () => {
  const camera = createCameraController(safe);
  for (let cycle = 0; cycle < 50; cycle++) {
    camera.zoomIn(2, 0.5); run(camera, 30);
    camera.move(2050, 1120, 0.5); run(camera, 30);
    camera.rotate(0.15, 0.5); run(camera, 30);
    camera.saveBookmark("detail");
    camera.hold(); run(camera, 30);
    camera.returnTo("full-frame", 1); run(camera, 60);
    assert.deepEqual(camera.getSnapshot().pose, FULL_FRAME);
    assert.deepEqual(camera.getSnapshot().velocity, { x: 0, y: 0, rotation: 0, logScale: 0 });
    camera.returnTo("detail", 1); run(camera, 60);
    assert.equal(camera.getSnapshot().pose.x, 2050);
    camera.returnTo("full-frame", 1); run(camera, 60);
    assert.deepEqual(camera.getSnapshot().pose, FULL_FRAME);
  }
  camera.zoomIn(2, 1); run(camera, 60);
  camera.zoomOut(2, 1); run(camera, 60);
  assert.deepEqual(camera.getSnapshot().pose, FULL_FRAME);
});

test("retarget and hold preserve exact incoming pose and velocity before smooth deceleration", () => {
  const camera = createCameraController(() => true);
  camera.move(2200, 1080, 1); run(camera, 20);
  const before = camera.getSnapshot();
  camera.move(2300, 1150, 1);
  assert.deepEqual(camera.getSnapshot().pose, before.pose);
  assert.deepEqual(camera.getSnapshot().velocity, before.velocity);
  camera.step();
  close((camera.getSnapshot().pose.x - before.pose.x) * 60, before.velocity.x, 10);
  const moving = camera.getSnapshot();
  camera.hold(0.5);
  assert.deepEqual(camera.getSnapshot().velocity, moving.velocity);
  run(camera, 30);
  close(camera.getSnapshot().pose.x, moving.pose.x + moving.velocity.x * 0.25);
  assert.equal(camera.getSnapshot().velocity.x, 0);
  assert.equal(camera.getSnapshot().moving, false);
});

test("trajectory preflight rejects unsafe interior states even when endpoints are valid", () => {
  const camera = createCameraController(pose => pose.x <= 1921);
  camera.move(1921, 1080, 1); run(camera, 30);
  const before = camera.getSnapshot();
  assert.throws(() => camera.retarget(before.pose, 5), /CONSTRAINT/);
  assert.deepEqual(camera.getSnapshot(), before);
  run(camera, 30);
  assert.equal(camera.getSnapshot().pose.x, 1921);
});

test("coverage handles rotated camera, rejects unsafe commands and changing constraints preserves last safe pose", () => {
  let valid = true;
  const camera = createCameraController(pose => valid && safe(pose));
  const initial = camera.getSnapshot();
  for (const command of [() => camera.zoomOut(2, 1), () => camera.rotate(0.1, 1), () => camera.move(2000, 1080, 1)]) {
    assert.throws(command, /CONSTRAINT/);
    assert.deepEqual(camera.getSnapshot(), initial);
  }
  camera.zoomIn(2, 1); run(camera, 20);
  const before = camera.getSnapshot(); valid = false; camera.step();
  assert.deepEqual(camera.getSnapshot().pose, before.pose);
  assert.equal(camera.getSnapshot().constraintReached, true);
  assert.equal(camera.getSnapshot().velocity.logScale, 0);
  camera.reset();
  assert.deepEqual(camera.getSnapshot().pose, FULL_FRAME);
});

test("camera rejects nonfinite parameters and invalid durations without mutating state", () => {
  const camera = createCameraController(() => true);
  for (const command of [() => camera.zoomIn(1, 1), () => camera.zoomOut(Infinity, 1),
    () => camera.move(NaN, 0, 1), () => camera.rotate(Infinity, 1), () => camera.hold(0),
    () => camera.move(2000, 1000, 61), () => camera.returnTo("missing", 1), () => camera.saveBookmark("full-frame")]) {
    assert.throws(command);
    assert.deepEqual(camera.getSnapshot().pose, FULL_FRAME);
  }
  camera.saveBookmark("local"); camera.reset();
  assert.throws(() => camera.returnTo("local", 1));
  assert.throws(() => createCameraController(() => false), /COVERAGE_INVALID/);
});


test("framing can finish at rest before zoom without changing incoming velocity or rebase continuity", () => {
  const a=createCameraController(()=>true), b=createCameraController(()=>true);
  for(const camera of [a,b]) {
    camera.retarget({...FULL_FRAME,x:1980,y:1040,rotation:0.1,logScale:1},1);
    run(camera,12);
    const before=camera.getSnapshot();
    camera.retarget({...FULL_FRAME,x:1950,y:1030,rotation:0.2,logScale:2},2,0.5);
    assert.deepEqual(camera.getSnapshot(),before);
    run(camera,30);
    const state=camera.getSnapshot();
    assert.equal(state.pose.x,1950); assert.equal(state.pose.y,1030);
    assert.ok(state.pose.rotation<0.2 && state.velocity.rotation>0);
    assert.deepEqual([state.velocity.x,state.velocity.y],[0,0]);
    assert.ok(state.moving && state.velocity.logScale>0 && state.pose.logScale<2);
  }
  const placement={x:1920,y:1080,rotation:0.1,scale:0.5,anchorX:1920,anchorY:1080};
  b.rebaseCoordinates(placement);
  const {cameraInDestination,velocityInDestination}=placementMath;
  for(let i=0;i<90;i++) {
    const expected=cameraInDestination(a.getSnapshot().pose,placement), velocity=velocityInDestination(a.getSnapshot().velocity,placement);
    for(const key of Object.keys(expected)) {close(b.getSnapshot().pose[key],expected[key]);close(b.getSnapshot().velocity[key],velocity[key]);}
    a.step();b.step();
  }
  for(const invalid of [0,NaN,3]) assert.throws(()=>a.retarget(FULL_FRAME,2,invalid),/framing/);
});
