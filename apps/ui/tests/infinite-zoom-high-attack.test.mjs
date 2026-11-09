import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { sampleHighAttack, HIGH_ATTACK_DECAY_MS, sampleAttack } from "../src/engines/infinite-zoom/modulation/attack-signal.ts";
import { createAudioModulation } from "../src/engines/infinite-zoom/modulation/audio-modulation.ts";
import { parseBindings, createBindingEvaluator } from "../src/engines/infinite-zoom/modulation/bindings.ts";
import { createLogicalRecorder, validateRecording, replayLogicalJourney } from "../src/engines/infinite-zoom/diagnostics/logical-replay.ts";
import { createLiveDetector } from "../src/lib/live-audio-analysis.ts";

test("high attack has an immediate normalized peak and exact 100 ms release", () => {
  const hit = { attackAt: 1000, strength: 0.8 };
  assert.equal(HIGH_ATTACK_DECAY_MS, 100);
  assert.equal(sampleHighAttack(hit, 1000), 0.8);
  assert.equal(sampleHighAttack(hit, 1050), 0.2);
  assert.equal(sampleHighAttack(hit, 1100), 0);
  assert.equal(sampleHighAttack(hit, 999), 0);
  for (const value of [null, { ...hit, attackAt: null }, { ...hit, attackAt: NaN }, { ...hit, strength: Infinity }]) assert.equal(sampleHighAttack(value, 1000), 0);
  assert.equal(sampleHighAttack(hit, NaN), 0);
  assert.equal(sampleHighAttack({ ...hit, strength: 10 }, 1000), 1);
  for (const decay of [0, -1, NaN, Infinity]) assert.equal(sampleAttack(hit, 1000, decay), 0);
});

test("fast high attacks stay independent of the bass detector and do not become a continuous level", () => {
  const detector = createLiveDetector(); let signal = null, highHits = 0, bassHits = 0;
  for (let i = 0; i < 120; i++) {
    const amplitude = i % 6 === 1 ? 0.4 : 0;
    const detection = detector.sampleTransient({ start: i * 0.02, end: i * 0.02,
      rmsDbfs: amplitude ? -8 : -120, amplitude, lowAmplitude: 0,
      bandAmplitudes: { bass: 0, mid: 0, high: amplitude } });
    if (detection.bandDetections.high.onset) {
      highHits++; signal = { attackAt: i * 20, strength: Math.min(1, detection.bandDetections.high.strength / 4) };
      assert.ok(sampleHighAttack(signal, i * 20) > 0);
    }
    if (detection.bassOnset) bassHits++;
    if (i % 6 === 0) assert.equal(sampleHighAttack(signal, i * 20), 0);
  }
  assert.equal(highHits, 20); assert.equal(bassHits, 0);
});

test("highAttack does not affect overall energy or kick and is bound only to the authored sky", async () => {
  const a = createAudioModulation(), b = createAudioModulation(), input = { bass: 0.3, mid: 0.4, high: 0.5, kick: 0.25 };
  const plain = a.step(input, 1 / 60), hit = b.step({ ...input, highAttack: 1 }, 1 / 60);
  assert.deepEqual({ ...hit, signals: { ...hit.signals, highAttack: 0 } }, plain);
  assert.equal(hit.signals.highAttack, 1);
  assert.equal(b.step({ ...input, highAttack: NaN }, 1 / 60).signals.highAttack, 0);
  assert.equal(b.step(null, 1 / 60).signals, undefined);
  b.reset(); assert.equal(b.getSnapshot().signals, undefined);
  for (const name of ["forest", "nebula", "underwater-cavern", "forest-pilot", "forest-layered", "clockwork"]) {
    const manifest = await readFile(new URL(`../public/infinite-zoom/samples/${name}/manifest.json`, import.meta.url), "utf8");
    assert.doesNotMatch(manifest, /"signal"\s*:\s*"highAttack"/);
  }
  const alien=JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/insectoid-planet/manifest.json",import.meta.url),"utf8"));
  assert.deepEqual(alien.layers.filter(layer=>layer.behaviors?.some(b=>b.modulation?.some(m=>m.signal==="highAttack"))).map(layer=>layer.id),["sky-high-attack"]);
});

test("highAttack can be bound later, starts silent and survives normalized replay", () => {
  const binding = parseBindings([{ id: "high-test", signal: "highAttack", operation: "replace", priority: 0,
    min: 0, max: 1, attackSeconds: 1 / 60, releaseSeconds: 0.05 }]);
  const live = createBindingEvaluator(binding), restored = createBindingEvaluator(binding);
  assert.equal(live.getSnapshot(), 0);
  assert.equal(live.step(undefined, 1 / 60), 0);
  const packages = [{ id: "test", version: "1" }], recorder = createLogicalRecorder(1, packages), expected = [];
  for (let tick = 1; tick <= 60; tick++) {
    const signals = { highAttack: tick % 12 === 1 ? 1 : 0 };
    expected.push(live.step(signals, 1 / 60)); recorder.capture(tick, signals);
  }
  const data = JSON.parse(JSON.stringify(recorder.export())), actual = [];
  assert.equal(validateRecording(data).frames[0].signals.highAttack, 1);
  replayLogicalJourney(data, { packages, command() {}, step(context, signals) { actual.push(restored.step(signals, context.dt)); } });
  assert.deepEqual(actual, expected);
  live.reset(); assert.equal(live.getSnapshot(), 0);
  data.frames[0].signals.highAttack = 2; assert.throws(() => validateRecording(data), /signal/);
});
