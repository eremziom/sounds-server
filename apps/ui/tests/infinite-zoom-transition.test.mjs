import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createCameraController, cameraMatrix, FULL_FRAME } from "../src/engines/infinite-zoom/camera/index.ts";
import { parseArtworkPackage, createArtworkInstance, coversViewport, getCoverView } from "../src/engines/infinite-zoom/artwork/index.ts";
import { createTransitionCoordinator, placePoint, cameraInDestination, velocityInDestination } from "../src/engines/infinite-zoom/transition/index.ts";
import { prepareArtwork } from "../src/engines/infinite-zoom/artwork/prepare-artwork.ts";
import { parseArtworkPortal, portalCoversViewport, portalTarget } from "../src/engines/infinite-zoom/transition/portal.ts";

const source = JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/foundation/manifest.json", import.meta.url), "utf8"));
const destination = JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/foundation/destination.json", import.meta.url), "utf8"));
const placement = { x: 1920, y: 1080, scale: 0.5, rotation: 0.12, anchorX: 1920, anchorY: 1080 };
const project = (pose, point) => { const m = cameraMatrix(pose); return [m[0]*point.x+m[1]*point.y+m[2], m[3]*point.x+m[4]*point.y+m[5]]; };
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-8, `${a} ≈ ${b}`);
const context = { dt: 1 / 60, tick: 1, timeSeconds: 1 / 60, random: () => 0.5 };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

function lease(input, id) {
  const manifest = parseArtworkPackage(input);
  let closes = 0;
  return { instance: createArtworkInstance(id, manifest),
    loaded: { manifest, getAsset() { throw new Error("not used in pure coordinator tests"); }, dispose() { closes++; } },
    get closes() { return closes; } };
}

function fixture(options = {}) {
  let current = lease(source, "source"), loadCalls = 0;
  const initial = current, acquired = [], attached = new Set([current.instance.id]), compositions = [];
  const viewport = { width: 640, height: 360, dpr: 1, renderScale: 1, ...options.viewport };
  const camera = createCameraController(pose => coversViewport(current.instance.getSnapshot().layers[0], getCoverView(viewport.width, viewport.height), pose));
  const coordinator = createTransitionCoordinator({ camera, current: () => current, viewport: () => viewport,
    gpuBudgetBytes: options.budget ?? 256 * 1024 * 1024,
    async load(manifest, signal, id) {
      loadCalls++;
      if (options.load) return options.load(manifest, signal, id);
      const value = lease(manifest, id); acquired.push(value); return value;
    },
    attach(value) { if (options.attachError) throw new Error("GPU upload failed"); attached.add(value.instance.id); },
    compose(value) { compositions.push(value); },
    release(value) { attached.delete(value.instance.id); value.loaded.dispose(); },
    commit(value, p) {
      if (options.commitError) throw new Error("commit rejected");
      const old = current; camera.rebaseCoordinates(p); current = value;
      attached.delete(old.instance.id); old.loaded.dispose();
    },
  });
  const request = patch => coordinator.request({ sourceInstanceId: current.instance.id, manifest: destination,
    anchorId: "center", placement: { x: 1920, y: 1080, scale: 0.5, rotation: 0.12 },
    region: { x: 1920, y: 1080, radiusX: 900, radiusY: 450, rotation: 0.12, feather: 0.2 }, durationSeconds: 1, ...patch });
  return { coordinator, camera, initial, attached, compositions, acquired, request, viewport,
    get current() { return current; }, get loadCalls() { return loadCalls; },
    step(count = 1) { for (let i = 0; i < count; i++) coordinator.step(context); } };
}

test("placement maps anchors and C_B=C_A*P for translated, rotated and scaled coordinates", () => {
  assert.deepEqual(placePoint({ x: 1920, y: 1080 }, placement), { x: 1920, y: 1080 });
  const camera = { x: 1900, y: 1030, rotation: 0.3, logScale: Math.log(2.4) };
  const mapped = cameraInDestination(camera, placement);
  for (const point of [{ x: 0, y: 0 }, { x: 3840, y: 2160 }, { x: 1000, y: 1500 }]) {
    const a = project(camera, placePoint(point, placement)), b = project(mapped, point);
    near(a[0], b[0]); near(a[1], b[1]);
  }
  const v = { x: 130, y: -70, rotation: 0.2, logScale: 0.4 }, mappedV = velocityInDestination(v, placement);
  const delta = 1e-4;
  const later = cameraInDestination(Object.fromEntries(Object.keys(camera).map(key => [key, camera[key] + v[key]*delta])), placement);
  for (const key of Object.keys(v)) near((later[key] - mapped[key])/delta, mappedV[key]);
});

test("camera coordinate handoff preserves a moving trajectory and its derivatives", () => {
  const a = createCameraController(() => true), b = createCameraController(() => true);
  const target = { x: 2000, y: 1150, rotation: 0.2, logScale: 1 };
  a.retarget(target, 1); b.retarget(target, 1);
  for (let i = 0; i < 25; i++) { a.step(); b.step(); }
  b.rebaseCoordinates(placement);
  for (let i = 0; i < 35; i++) {
    const expectedPose = cameraInDestination(a.getSnapshot().pose, placement);
    for (const key of Object.keys(expectedPose)) near(b.getSnapshot().pose[key], expectedPose[key]);
    const expected = velocityInDestination(a.getSnapshot().velocity, placement);
    for (const key of Object.keys(expected)) near(b.getSnapshot().velocity[key], expected[key]);
    a.step(); b.step();
  }
});

test("prepared B is already composed, waiting never travels; explicit start and handoff retain C0/C1", async () => {
  const f = fixture();
  await f.request();
  assert.equal(f.coordinator.getSnapshot().phase, "prepared");
  assert.deepEqual(f.camera.getSnapshot().pose, FULL_FRAME);
  assert.equal(f.acquired[0].instance.getSnapshot().layers[1].groups[0].effects[0].x, 0);
  assert.equal(f.compositions.at(-1).destinationId, f.acquired[0].instance.id);
  f.step(30); assert.deepEqual(f.camera.getSnapshot().pose, FULL_FRAME);
  f.coordinator.start();
  for (let i = 0; i < 60 && f.coordinator.getSnapshot().phase !== "committed"; i++) f.step();
  const state = f.coordinator.getSnapshot();
  assert.equal(state.phase, "committed");
  assert.equal(f.current, f.acquired[0]);
  assert.equal(f.initial.closes, 1);
  assert.equal(f.attached.size, 1);
  assert.ok(state.handoff.before.velocity.logScale > 0, "handoff happens while camera still moves");
  const expected = cameraInDestination(state.handoff.before.pose, placement);
  assert.deepEqual(state.handoff.after.pose, expected);
  assert.deepEqual(state.handoff.after.velocity, velocityInDestination(state.handoff.before.velocity, placement));
  assert.ok(coversViewport(f.current.instance.getSnapshot().layers[0], getCoverView(640,360), expected));
});

test("cancellation returns smoothly to A while preserving visible B at its fixed placement", async () => {
  const f = fixture(); await f.request(); f.coordinator.start(); f.step(20);
  const composition = f.compositions.at(-1);
  const before = f.camera.getSnapshot();
  f.coordinator.cancel();
  assert.deepEqual(f.camera.getSnapshot().pose, before.pose);
  assert.deepEqual(f.camera.getSnapshot().velocity, before.velocity);
  assert.equal(f.coordinator.getSnapshot().phase, "rollingBack");
  f.step(60);
  assert.equal(f.coordinator.getSnapshot().phase, "cancelled");
  assert.equal(f.current, f.initial); assert.equal(f.initial.closes, 0);
  assert.equal(f.acquired[0].closes, 0); assert.equal(f.attached.size, 2);
  assert.deepEqual(f.compositions.at(-1), composition);
  assert.equal(f.coordinator.getSnapshot().canStart, true);
  assert.deepEqual(f.camera.getSnapshot().pose, FULL_FRAME);
});

test("invalid B coverage and commit errors keep A recoverable without erasing the embedded B", async () => {
  for (const mode of ["coverage", "commit"]) {
    const f = fixture({ commitError: mode === "commit" });
    await f.request();
    if (mode === "coverage") f.acquired[0].instance.setLayerTransform("backdrop", { x: 5000 });
    f.coordinator.start(); f.step(150);
    assert.equal(f.coordinator.getSnapshot().phase, "failed", mode);
    assert.equal(f.current, f.initial); assert.equal(f.initial.closes, 0); assert.equal(f.acquired[0].closes, 0);
    f.coordinator.dispose(); assert.equal(f.acquired[0].closes, 1);
  }
});

test("admission validates anchors, source identity, placement, memory and resolution", async () => {
  const f = fixture({ budget: 100 * 1024 * 1024 });
  await assert.rejects(f.request(), /BUDGET/); assert.equal(f.loadCalls, 0);
  const g = fixture();
  await assert.rejects(g.request({ anchorId: "absent" }), /anchor/);
  await assert.rejects(g.request({ sourceInstanceId: "stale" }), /source/);
  await assert.rejects(g.request({ placement: { ...placement, scale: 0 } }), /placement/);
  await assert.rejects(g.request({ placement: { scale: 0.5, rotation: 0 } }), /placement/);
  const invalidAnchor = structuredClone(destination); invalidAnchor.anchors[0].x = NaN;
  await assert.rejects(g.request({ manifest: invalidAnchor }), /anchor/);
  const duplicateAnchor = structuredClone(destination); duplicateAnchor.anchors.push(duplicateAnchor.anchors[0]);
  await assert.rejects(g.request({ manifest: duplicateAnchor }), /Duplicate/);
  assert.equal(g.loadCalls, 0);
  const large = fixture({ viewport: { width: 16_000, height: 9000 }, budget: 2 ** 32 });
  await large.request(); large.coordinator.start(); large.step(150);
  assert.equal(large.coordinator.getSnapshot().phase, "failed", "no LOD: reject excessive destination magnification");
});

test("load and GPU upload failures remain transaction-local", async () => {
  for (const options of [{ load: async () => { throw new Error("missing critical asset"); } }, { attachError: true }]) {
    const f = fixture(options);
    await assert.rejects(f.request());
    assert.equal(f.coordinator.getSnapshot().phase, "failed");
    assert.deepEqual(f.camera.getSnapshot().pose, FULL_FRAME);
    assert.equal(f.current, f.initial);
    if (f.acquired.length) assert.equal(f.acquired[0].closes, 1);
    f.step(); // A continues; no application/audio teardown path exists here.
  }
});

test("cancelled preparation cannot resurrect or replace a newer request", async () => {
  const gate = deferred(); let calls = 0;
  const stale = lease(destination, "stale");
  const f = fixture({ load: async (manifest, signal, id) => ++calls === 1 ? gate.promise : lease(manifest, id) });
  const first = f.request(); const rejected = assert.rejects(first);
  await Promise.resolve(); await Promise.resolve();
  f.coordinator.cancel();
  await rejected;
  await f.request();
  gate.resolve(stale); await new Promise(resolve => setImmediate(resolve));
  assert.equal(stale.closes, 1);
  assert.equal(f.coordinator.getSnapshot().phase, "prepared");
  f.coordinator.dispose(); assert.equal(f.attached.size, 1);
});

test("timeout rejects promptly even if decoder ignores abort and closes its late lease", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const gate = deferred(), late = lease(destination, "late");
  const f = fixture({ load: () => gate.promise });
  const rejected = assert.rejects(f.request({ loadTimeoutMs: 10 }), /timeout/);
  await Promise.resolve(); await Promise.resolve(); t.mock.timers.tick(10); await rejected;
  assert.equal(f.coordinator.getSnapshot().phase, "failed");
  gate.resolve(late); await new Promise(resolve => setImmediate(resolve)); assert.equal(late.closes, 1);
});

test("reset/dispose release B and reject overlapping or terminal requests", async () => {
  const f = fixture(); await f.request(); f.step(10);
  await assert.rejects(f.request(), /Cannot request/);
  f.coordinator.reset(); assert.equal(f.coordinator.getSnapshot().phase, "idle"); assert.equal(f.acquired[0].closes, 1);
  f.coordinator.dispose(); f.coordinator.dispose();
  assert.throws(() => f.step(), /disposed/); await assert.rejects(f.request(), /disposed/);
});

test("failed destination can be dropped immediately while camera rolls back on live A", async () => {
  const f = fixture(); await f.request(); f.coordinator.start(); f.step(20);
  const before = f.camera.getSnapshot();
  f.coordinator.rejectDestination(new Error("B graphics failed"));
  assert.equal(f.acquired[0].closes, 1);
  assert.equal(f.coordinator.getSnapshot().destinationInstanceId, null);
  assert.deepEqual(f.camera.getSnapshot().pose, before.pose);
  f.step(60);
  assert.equal(f.coordinator.getSnapshot().phase, "failed");
  assert.equal(f.current, f.initial); assert.equal(f.initial.closes, 0);
});

test("external abort before travel leaves the already visible portal in place without camera motion", async () => {
  const f = fixture(), operation = new AbortController();
  await f.request({ signal: operation.signal }); operation.abort();
  assert.equal(f.coordinator.getSnapshot().phase, "cancelled");
  assert.deepEqual(f.camera.getSnapshot().pose, FULL_FRAME); assert.equal(f.acquired[0].closes, 0);
  f.coordinator.dispose(); assert.equal(f.acquired[0].closes, 1);
});

test("terminal disposal during loading releases late CPU lease without attaching it", async () => {
  const gate = deferred(), late = lease(destination, "late-disposed");
  const f = fixture({ load: () => gate.promise });
  const rejected = assert.rejects(f.request(), /disposed/);
  await Promise.resolve(); await Promise.resolve(); f.coordinator.dispose(); await rejected;
  gate.resolve(late); await new Promise(resolve => setImmediate(resolve));
  assert.equal(late.closes, 1); assert.equal(f.coordinator.getSnapshot().phase, "disposed"); assert.equal(f.attached.size, 1);
});

test("initial GPU budget refusal releases decoded assets before constructing a renderer", async () => {
  let closes = 0;
  await assert.rejects(prepareArtwork({ manifest: source, canvas: {}, instanceId: "initial", gpuBudgetBytes: 1024,
    viewport: { width: 640, height: 360, dpr: 1, renderScale: 1 }, onAvailabilityChange() {}, onError() {},
    decode: async () => ({ width: 3840, height: 2160, opaque: true, image: {}, close() { closes++; } }),
  }, new AbortController().signal), /GPU_BUDGET_EXCEEDED/);
  assert.equal(closes, 2);
});

test("repeated scene handoffs cannot accumulate stale bookmark scale outside pose limits", () => {
  const camera = createCameraController(() => true);
  for (let i = 0; i < 40; i++) {
    camera.retarget({ ...FULL_FRAME, logScale: Math.log(2.1) }, 1 / 60); camera.step();
    camera.saveBookmark("scene-detail"); camera.rebaseCoordinates(placement);
    assert.throws(() => camera.returnTo("scene-detail", 1), /Unknown/);
    camera.returnTo("full-frame", 1 / 60); camera.step();
    assert.deepEqual(camera.getSnapshot().pose, FULL_FRAME);
  }
});

test("authored portal data is detached, typed and rejects unsafe regions/references", async () => {
  const forest = JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/forest/manifest.json", import.meta.url), "utf8"));
  const original = structuredClone(forest.portal), parsed = parseArtworkPackage(forest);
  forest.portal.region.x = 10;
  assert.deepEqual(parsed.portal.region, original.region);
  assert.ok(Object.isFrozen(parsed.portal.region) && Object.isFrozen(parsed.portal.destination));
  for (const mutate of [
    p => { p.region.radiusX = 0; }, p => { p.region.y = NaN; }, p => { p.region.feather = 1; },
    p => { p.region.x = 1; }, p => { p.destination.manifestUri = "https://example.com/b.json"; },
    p => { p.destination.manifestUri = "/infinite-zoom/../b.json"; }, p => { p.scale = 0; },
    p => { p.durationSeconds = Infinity; }, p => { p.region.reveal = 0; },
  ]) { const input = structuredClone(original); mutate(input); assert.throws(() => parseArtworkPortal(input)); }
});

test("small off-center portal/noncentral B anchor preserve projected landmarks before and after handoff", async () => {
  const f = fixture(), next = structuredClone(destination);
  next.anchors[0] = { id: "offset-entry", x: 1700, y: 1000 };
  const region = { x: 1850, y: 1000, radiusX: 70, radiusY: 38, rotation: 0.05, feather: 0.24 };
  const p = { x: region.x, y: region.y, scale: 0.055, rotation: region.rotation };
  await f.request({ manifest: next, anchorId: "offset-entry", placement: p, region, durationSeconds: 2 });
  const initialPlacement = f.coordinator.getSnapshot().placement;
  assert.deepEqual(placePoint({ x: 1700, y: 1000 }, initialPlacement), { x: region.x, y: region.y });
  const target = portalTarget(region, getCoverView(640, 360));
  assert.ok(portalCoversViewport(region, target, getCoverView(640, 360)));
  f.step(60); assert.deepEqual(f.camera.getSnapshot().pose, FULL_FRAME);
  f.coordinator.start();
  for (let i = 0; i < 120 && f.coordinator.getSnapshot().phase !== "committed"; i++) {
    f.step();
    assert.deepEqual(f.coordinator.getSnapshot().placement, initialPlacement);
  }
  const state = f.coordinator.getSnapshot(); assert.equal(state.phase, "committed");
  assert.ok(portalCoversViewport(region, state.handoff.before.pose, getCoverView(640, 360)));
  for (const point of [{ x: 1700, y: 1000 }, { x: 1000, y: 500 }, { x: 2100, y: 1400 }]) {
    const a = project(state.handoff.before.pose, placePoint(point, initialPlacement)), b = project(state.handoff.after.pose, point);
    near(a[0], b[0]); near(a[1], b[1]);
  }
});

test("embedded destination failure/cancellation blocks readiness and closes the acquired source", async () => {
  const forest = JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/forest/manifest.json", import.meta.url), "utf8"));
  for (const mode of ["manifest", "decode", "identity", "abort", "budget"]) {
    const controller = new AbortController(), acquired = [];
    await assert.rejects(prepareArtwork({ manifest: forest, canvas: {}, instanceId: "initial", gpuBudgetBytes: mode === "budget" ? 120 * 1024 * 1024 : undefined,
      viewport: { width: 640, height: 360, dpr: 1, renderScale: 1 }, onAvailabilityChange() {}, onError() {},
      async resolveManifest() {
        if (mode === "manifest") throw new Error("unavailable B");
        if (mode === "abort") controller.abort();
        return { ...destination, id: mode === "identity" ? "other" : "nebula" };
      },
      async decode(asset) {
        if (mode === "decode" && acquired.length === 3) throw new Error("B decode failed");
        const value = { width: 3840, height: 2160, image: {}, opaque: true, closes: 0, close() { this.closes++; } };
        acquired.push(value); return value;
      },
    }, controller.signal));
    assert.equal(acquired.length, 3, mode); assert.ok(acquired.every(value => value.closes === 1), mode);
  }
});


test("independent nebula view caps while forest continues and hands off at rest", async () => {
  const { destinationView, destinationRenderPlacement } = await import("../src/engines/infinite-zoom/transition/destination-view.ts");
  const f = fixture(); await f.request({ destinationCamera: "stop-at-full-frame" });
  f.coordinator.start(); let capped = 0, firstScale;
  for (let i = 0; i < 60; i++) {
    f.step();
    const state = f.coordinator.getSnapshot(), pose = f.camera.getSnapshot().pose;
    if (state.phase === "approaching") {
      const b = destinationView(pose, placement, "stop-at-full-frame"); assert.ok(b.logScale <= 0);
      if (b.logScale === 0) { capped++; firstScale ??= pose.logScale; assert.deepEqual(b, FULL_FRAME); }
      const mapped = cameraInDestination(pose, destinationRenderPlacement(pose, placement, "stop-at-full-frame"));
      for (const key of Object.keys(b)) near(mapped[key], b[key]);
    }
  }
  const state = f.coordinator.getSnapshot(); assert.equal(state.phase, "committed"); assert.ok(capped > 5);
  assert.ok(state.handoff.before.pose.logScale > firstScale);
  for (const key of Object.keys(FULL_FRAME)) near(state.handoff.after.pose[key], FULL_FRAME[key]);
  assert.equal(state.handoff.after.velocity.logScale, 0);
  f.step(30); near(f.camera.getSnapshot().pose.logScale, 0);
});

test("destination cap preserves continuous slope and reverses deterministically", async () => {
  const { destinationView } = await import("../src/engines/infinite-zoom/transition/destination-view.ts");
  const p = { ...placement, anchorX: 1700, anchorY: 900 };
  const at = z => destinationView({ x: 1900, y: 1020, rotation: 0.3, logScale: z - Math.log(p.scale) }, p, "stop-at-full-frame");
  const h = 1e-6;
  for (const z of [-0.25, 0]) for (const key of Object.keys(FULL_FRAME)) {
    const left = (at(z)[key] - at(z-h)[key]) / h, right = (at(z+h)[key] - at(z)[key]) / h;
    assert.ok(Math.abs(left-right) < 0.1, `${z} ${key}: continuous slope`);
  }
  const before = at(-0.4); at(1); assert.deepEqual(at(-0.4), before); assert.deepEqual(at(0.5), FULL_FRAME);
});


test("off-center Forest approach finishes framing before Nebula zoom braking, without a late vertical correction", async () => {
  const {destinationView}=await import("../src/engines/infinite-zoom/transition/destination-view.ts");
  const forest=JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/forest/manifest.json",import.meta.url),"utf8"));
  const portal=forest.portal, f=fixture();
  const p={x:portal.region.x,y:portal.region.y,rotation:portal.region.rotation,scale:portal.scale};
  await f.request({placement:p,region:portal.region,durationSeconds:portal.durationSeconds,destinationCamera:portal.destinationCamera});
  const resolved=f.coordinator.getSnapshot().placement;
  f.coordinator.start();let brakingFrames=0,framingFinished=false,sourceZoomAtFraming;
  for(let i=0;i<960;i++) {
    f.step();if(f.coordinator.getSnapshot().phase==="committed")break;
    const state=f.camera.getSnapshot(),raw=cameraInDestination(state.pose,resolved);
    if(state.pose.y===portal.region.y) {framingFinished=true;sourceZoomAtFraming??=state.pose.logScale;}
    if(raw.logScale>=-0.25) {
      brakingFrames++;assert.ok(framingFinished);
      assert.ok(sourceZoomAtFraming < -Math.log(p.scale)-0.25);
      assert.deepEqual([state.velocity.x,state.velocity.y,state.velocity.rotation],[0,0,0]);
      const b=destinationView(state.pose,resolved,portal.destinationCamera);
      near(b.x,FULL_FRAME.x);near(b.y,FULL_FRAME.y);near(b.rotation,0);
      const anchorScreen=project(b,{x:1920,y:1080});near(anchorScreen[0],0);near(anchorScreen[1],0);
    }
  }
  assert.ok(brakingFrames>30);assert.equal(f.coordinator.getSnapshot().phase,"committed");
});
