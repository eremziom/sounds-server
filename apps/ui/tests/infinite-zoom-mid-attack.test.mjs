import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { sampleMidAttack, MID_ATTACK_DECAY_MS } from "../src/engines/infinite-zoom/modulation/attack-signal.ts";
import { createAudioModulation } from "../src/engines/infinite-zoom/modulation/audio-modulation.ts";
import { parseBindings, createBindingEvaluator } from "../src/engines/infinite-zoom/modulation/bindings.ts";
import { createLogicalRecorder, validateRecording, replayLogicalJourney } from "../src/engines/infinite-zoom/diagnostics/logical-replay.ts";
import { createLiveDetector } from "../src/lib/live-audio-analysis.ts";

test("mid attack has an immediate bounded peak, 120 ms release and no stale/invalid events", () => {
  const hit = { attackAt: 1000, strength: 0.8 };
  assert.equal(MID_ATTACK_DECAY_MS, 120);
  assert.equal(sampleMidAttack(hit, 1000), 0.8);
  assert.equal(sampleMidAttack(hit, 1060), 0.2);
  assert.equal(sampleMidAttack(hit, 1120), 0);
  assert.equal(sampleMidAttack(hit, 999), 0);
  for (const input of [null, { ...hit, attackAt: null }, { ...hit, attackAt: NaN }, { ...hit, strength: Infinity }]) assert.equal(sampleMidAttack(input, 1000), 0);
  assert.equal(sampleMidAttack(hit, NaN), 0);
  assert.equal(sampleMidAttack({ ...hit, strength: 10 }, 1000), 1);
});

test("mid detector emits independent attacks and releases before the next impulse", () => {
  const detector = createLiveDetector(); let signal = null, hits = 0;
  for (let i = 0; i < 150; i++) {
    const amplitude = i % 15 === 1 ? 0.4 : 0;
    const detection = detector.sampleTransient({ start: i * 0.02, end: i * 0.02,
      rmsDbfs: amplitude ? -8 : -120, amplitude, lowAmplitude: 0,
      bandAmplitudes: { bass: 0, mid: amplitude, high: 0 } });
    assert.equal(detection.bandDetections.bass.onset, false);
    assert.equal(detection.bandDetections.high.onset, false);
    if (detection.bandDetections.mid.onset) {
      hits++; signal = { attackAt: i * 20, strength: Math.min(1, detection.bandDetections.mid.strength / 4) };
      assert.ok(sampleMidAttack(signal, i * 20) > 0);
    }
    if (i % 15 === 0) assert.equal(sampleMidAttack(signal, i * 20), 0);
  }
  assert.equal(hits, 10);
});

test("midAttack leaves overall modulation and other attacks unchanged and remains unbound", async () => {
  const a = createAudioModulation(), b = createAudioModulation();
  const input = { bass: 0.3, mid: 0.4, high: 0.5, kick: 0.25, highAttack: 0.5 };
  const plain = a.step(input, 1 / 60), hit = b.step({ ...input, midAttack: 1 }, 1 / 60);
  assert.deepEqual({ ...hit, signals: { ...hit.signals, midAttack: 0 } }, plain);
  assert.equal(hit.signals.midAttack, 1);
  assert.equal(b.step({ ...input, midAttack: NaN }, 1 / 60).signals.midAttack, 0);
  assert.equal(b.step(null, 1 / 60).signals, undefined);
  b.reset(); assert.equal(b.getSnapshot().signals, undefined);
  for (const name of ["forest", "nebula", "underwater-cavern", "forest-pilot", "forest-layered", "clockwork", "insectoid-planet"]) {
    const manifest = await readFile(new URL(`../public/infinite-zoom/samples/${name}/manifest.json`, import.meta.url), "utf8");
    assert.doesNotMatch(manifest, /"signal"\s*:\s*"midAttack"/);
  }
});

test("midAttack starts silent, can be bound later and round-trips through replay", () => {
  const binding = parseBindings([{ id: "mid-test", signal: "midAttack", operation: "replace", priority: 0,
    min: 0, max: 1, attackSeconds: 1 / 60, releaseSeconds: 0.05 }]);
  const live = createBindingEvaluator(binding), restored = createBindingEvaluator(binding);
  assert.equal(live.getSnapshot(), 0); assert.equal(live.step(undefined, 1 / 60), 0);
  const packages = [{ id: "test", version: "1" }], recorder = createLogicalRecorder(1, packages), expected = [];
  for (let tick = 1; tick <= 60; tick++) {
    const signals = { midAttack: tick % 18 === 1 ? 1 : 0 };
    expected.push(live.step(signals, 1 / 60)); recorder.capture(tick, signals);
  }
  const data = JSON.parse(JSON.stringify(recorder.export())), actual = [];
  assert.equal(validateRecording(data).frames[0].signals.midAttack, 1);
  replayLogicalJourney(data, { packages, command() {}, step(context, signals) { actual.push(restored.step(signals, context.dt)); } });
  assert.deepEqual(actual, expected);
  live.reset(); assert.equal(live.getSnapshot(), 0);
  data.frames[0].signals.midAttack = 2; assert.throws(() => validateRecording(data), /signal/);
});
