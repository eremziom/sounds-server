import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdaptiveQuality } from "../src/engines/infinite-zoom/quality/adaptive-quality.ts";
import { createSessionDiagnostics } from "../src/engines/infinite-zoom/diagnostics/session-diagnostics.ts";

test("quality degrades only after sustained pressure, with cooldown and a bounded floor", () => {
  const quality = createAdaptiveQuality();
  assert.deepEqual(quality.getSnapshot(), { profile: "High", renderScale: 1, maxDpr: 2 });
  for (let i = 0; i < 239; i++) assert.equal(quality.sample(30, false), false);
  assert.equal(quality.sample(30, false), true);
  assert.equal(quality.getSnapshot().profile, "Balanced");
  for (let i = 0; i < 600; i++) assert.equal(quality.sample(30, false), false);
  for (let i = 0; i < 240; i++) quality.sample(30, false);
  assert.equal(quality.getSnapshot().renderScale, 0.5);
  for (let i = 0; i < 10000; i++) assert.equal(quality.sample(30, false), false);
  assert.equal(quality.getSnapshot().profile, "Performance");
});

test("quality never changes during handoff; interruptions discard accumulated pressure", () => {
  const quality = createAdaptiveQuality();
  for (let i = 0; i < 239; i++) quality.sample(30, false);
  for (let i = 0; i < 1000; i++) assert.equal(quality.sample(30, true), false);
  assert.equal(quality.sample(30, false), false);
  for (const invalid of [NaN, Infinity, -1, 0]) quality.sample(invalid, false);
  for (let i = 0; i < 239; i++) assert.equal(quality.sample(30, false), false);
  quality.interrupt();
  for (let i = 0; i < 1000; i++) quality.sample(1000 / 60, false);
  assert.equal(quality.getSnapshot().profile, "High");
});

test("diagnostic event and frame rings stay bounded and snapshots remain immutable", () => {
  const diagnostics = createSessionDiagnostics("test-session");
  diagnostics.event("CONTEXT_LOST", 1, "warning");
  const previous = diagnostics.getSnapshot();
  for (let tick = 2; tick <= 10000; tick++) {
    diagnostics.event("CONTEXT_RESTORED", tick);
    diagnostics.frame(tick % 2 ? 20 : 10);
  }
  const snapshot = diagnostics.getSnapshot();
  assert.equal(snapshot.events.length, 128);
  assert.equal(snapshot.events[0].tick, 9873);
  assert.equal(snapshot.events.at(-1).tick, 10000);
  assert.equal(snapshot.retainedFrames, 600);
  assert.equal(snapshot.frameMsP50, 10);
  assert.equal(snapshot.frameMsP95, 20);
  assert.ok(snapshot.averageFps > 66 && snapshot.averageFps < 67);
  assert.equal(previous.events.length, 1);
  assert.throws(() => { snapshot.events[0].tick = 0; }, TypeError);
  for (const invalid of [NaN, Infinity, -1, 0]) diagnostics.frame(invalid);
  assert.equal(diagnostics.getSnapshot().totalFrames, 9999);
  assert.throws(() => diagnostics.event("https://secret", 0), /Invalid/);
  assert.throws(() => diagnostics.event("INVALID_TICK", -1), /Invalid/);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test("very slow visible frames count toward pressure and cannot inflate measured FPS", () => {
  const quality = createAdaptiveQuality(), diagnostics = createSessionDiagnostics("slow");
  for (let i = 0; i < 240; i++) { quality.sample(500, false); diagnostics.frame(500); }
  assert.equal(quality.getSnapshot().profile, "Balanced");
  assert.equal(diagnostics.getSnapshot().averageFps, 2);
  assert.equal(diagnostics.getSnapshot().frameMsP95, 500);
});
