import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createCameraController, cameraMatrix, FULL_FRAME } from "../src/engines/infinite-zoom/camera/index.ts";
import { parseArtworkPackage, createArtworkInstance, coversViewport, getCoverView } from "../src/engines/infinite-zoom/artwork/index.ts";
import { createTransitionCoordinator, placePoint, cameraInDestination, velocityInDestination } from "../src/engines/infinite-zoom/transition/index.ts";
import { prepareArtwork } from "../src/engines/infinite-zoom/artwork/prepare-artwork.ts";

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
    anchorId: "center", placement: { x: 1920, y: 1080, scale: 0.5, rotation: 0.12 }, durationSeconds: 1, ...patch });
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

test("prepared destination cannot advance or commit until a fixed step, then handoff retains C0/C1", async () => {
  const f = fixture();
  await f.request();
  assert.equal(f.coordinator.getSnapshot().phase, "prepared");
  assert.deepEqual(f.camera.getSnapshot().pose, FULL_FRAME);
  assert.equal(f.acquired[0].instance.getSnapshot().layers[1].groups[0].effects[0].x, 0);
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

test("cancellation during reveal smoothly returns to preserved A and releases B", async () => {
  const f = fixture(); await f.request(); f.step(20);
  const before = f.camera.getSnapshot();
  f.coordinator.cancel();
  assert.deepEqual(f.camera.getSnapshot().pose, before.pose);
  assert.deepEqual(f.camera.getSnapshot().velocity, before.velocity);
  assert.equal(f.coordinator.getSnapshot().phase, "rollingBack");
  f.step(60);
  assert.equal(f.coordinator.getSnapshot().phase, "cancelled");
  assert.equal(f.current, f.initial); assert.equal(f.initial.closes, 0);
  assert.equal(f.acquired[0].closes, 1); assert.equal(f.attached.size, 1);
  assert.deepEqual(f.camera.getSnapshot().pose, FULL_FRAME);
});

test("invalid B coverage, unsafe camera path and commit errors all keep A and clean B", async () => {
  for (const mode of ["coverage", "path", "commit"]) {
    const f = fixture({ commitError: mode === "commit" });
    await f.request(mode === "path" ? { placement: { x: 10_000, y: 1080, scale: 0.5, rotation: 0 } } : {});
    if (mode === "coverage") f.acquired[0].instance.setLayerTransform("backdrop", { x: 5000 });
    f.step(150);
    assert.equal(f.coordinator.getSnapshot().phase, "failed", mode);
    assert.equal(f.current, f.initial); assert.equal(f.initial.closes, 0); assert.equal(f.acquired[0].closes, 1);
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
  await large.request(); large.step(150);
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
  const f = fixture(); await f.request(); f.step(20);
  const before = f.camera.getSnapshot();
  f.coordinator.rejectDestination(new Error("B graphics failed"));
  assert.equal(f.acquired[0].closes, 1);
  assert.equal(f.coordinator.getSnapshot().destinationInstanceId, null);
  assert.deepEqual(f.camera.getSnapshot().pose, before.pose);
  f.step(60);
  assert.equal(f.coordinator.getSnapshot().phase, "failed");
  assert.equal(f.current, f.initial); assert.equal(f.initial.closes, 0);
});

test("external abort cancels a prepared destination and releases it without camera motion", async () => {
  const f = fixture(), operation = new AbortController();
  await f.request({ signal: operation.signal }); operation.abort();
  assert.equal(f.coordinator.getSnapshot().phase, "cancelled");
  assert.deepEqual(f.camera.getSnapshot().pose, FULL_FRAME); assert.equal(f.acquired[0].closes, 1);
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
