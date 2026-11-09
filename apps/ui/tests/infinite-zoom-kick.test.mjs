import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { parseArtworkPackage, createArtworkInstance } from "../src/engines/infinite-zoom/artwork/index.ts";
import { createBandDetector, DEFAULT_BAND_OPTIONS } from "../src/lib/audio-band-detection.ts";
import { sampleKickAttack, KICK_DECAY_MS } from "../src/engines/infinite-zoom/modulation/kick-signal.ts";
import { createAudioModulation } from "../src/engines/infinite-zoom/modulation/audio-modulation.ts";
import { parseBindings, createBindingEvaluator } from "../src/engines/infinite-zoom/modulation/bindings.ts";
import { createLogicalRecorder, validateRecording, replayLogicalJourney } from "../src/engines/infinite-zoom/diagnostics/logical-replay.ts";

test("kick has an immediate bounded peak, short release and no stale/future/invalid attacks", () => {
  const hit = { attackAt: 1000, strength: 0.8 };
  assert.equal(sampleKickAttack(hit, 1000), 0.8);
  assert.equal(sampleKickAttack(hit, 1080), 0.2);
  assert.equal(sampleKickAttack(hit, 1000 + KICK_DECAY_MS), 0);
  for (const value of [null, { ...hit, attackAt: null }, { ...hit, attackAt: NaN }, { ...hit, strength: Infinity }]) {
    assert.equal(sampleKickAttack(value, 1000), 0);
  }
  assert.equal(sampleKickAttack(hit, 999), 0);
  assert.equal(sampleKickAttack(hit, NaN), 0);
  assert.equal(sampleKickAttack({ ...hit, strength: 10 }, 1000), 1);
});

for (const bpm of [100, 150]) test(`${bpm} BPM bass attacks stay distinct through 50 Hz detection and 60 Hz engine sampling`, () => {
  const detect = createBandDetector(), modulation = createAudioModulation();
  const period = 60 / bpm, events = [], frames = [], duration = 12;
  let signal = { attackAt: null, strength: 0 }, nextPoll = 0;
  for (let tick = 0; tick < duration * 60; tick++) {
    const time = tick / 60;
    while (nextPoll / 50 <= time + 1e-8) {
      const sampledTime = nextPoll++ / 50;
      const age = sampledTime - 0.2;
      const phase = age < 0 ? Infinity : (age + 1e-8) % period;
      // Long bass body + decay, not just an isolated one-sample spike.
      const amplitude = phase < 0.22 ? 0.5 * Math.exp(-phase / 0.06) : 0.001;
      const result = detect(amplitude, sampledTime, DEFAULT_BAND_OPTIONS.bass);
      if (result.onset) {
        events.push(sampledTime);
        signal = { attackAt: sampledTime * 1000, strength: Math.min(1, result.strength / 4) };
      }
    }
    frames.push(modulation.step({ bass: 0.8, mid: 0.1, high: 0.1, kick: sampleKickAttack(signal, time * 1000) }, 1 / 60).signals.kick);
  }
  assert.equal(events.length, bpm / 5);
  for (let i = 1; i < events.length; i++) assert.ok(Math.abs(events[i] - events[i - 1] - period) < 0.021);
  const peaks = frames.filter((value, index) => value > 0 && (!index || frames[index - 1] === 0));
  assert.equal(peaks.length, events.length);
  assert.ok(peaks.every(value => value > 0.7), "No slow attack smoothing hides the peak");
  for (const event of events) assert.equal(frames[Math.ceil((event + 0.18) * 60)], 0, "Returns to zero before the next beat");
});

test("kick does not alter existing overall animation or camera energy and clears when disabled", () => {
  const a = createAudioModulation(), b = createAudioModulation();
  const bands = { bass: 0.2, mid: 0.4, high: 0.6 };
  const plain = a.step(bands, 1 / 60), hit = b.step({ ...bands, kick: 1 }, 1 / 60);
  assert.equal(hit.strength, plain.strength);
  assert.equal(hit.intensity, plain.intensity);
  assert.equal(hit.signals.energy, plain.signals.energy);
  assert.equal(hit.signals.kick, 1);
  assert.equal(b.step({ ...bands, kick: NaN }, 1 / 60).signals.kick, 0);
  assert.equal(b.step(null, 1 / 60).signals, undefined);
  b.reset(); assert.equal(b.getSnapshot().signals, undefined);
  assert.equal(sampleKickAttack({ attackAt: 1000, strength: 1 }, 2000), 0, "No hit survives a long pause");
});

test("kick bindings are opt-in and normalized samples survive record/replay", () => {
  const binding = parseBindings([{ id: "kick-test", signal: "kick", operation: "replace", priority: 0,
    min: 0, max: 1, attackSeconds: 1 / 60, releaseSeconds: 1 / 60 }]);
  const live = createBindingEvaluator(binding), restored = createBindingEvaluator(binding);
  const packages = [{ id: "kick-test", version: "1" }], recorder = createLogicalRecorder(181, packages);
  const expected = [];
  for (let tick = 1; tick <= 120; tick++) {
    const signals = { kick: tick % 24 === 1 ? 1 : 0 };
    recorder.capture(tick, signals); expected.push(live.step(signals, 1 / 60));
  }
  const recording = JSON.parse(JSON.stringify(recorder.export())), actual = [];
  assert.equal(validateRecording(recording).frames[0].signals.kick, 1);
  replayLogicalJourney(recording, { packages, command() {}, step(context, signals) { actual.push(restored.step(signals, context.dt)); } });
  assert.deepEqual(actual, expected);
  recording.frames[0].signals.kick = 2;
  assert.throws(() => validateRecording(recording), /signal/);
});

test("absent kick initializes, releases and resets to silence without changing continuous fallbacks", () => {
  const make = signal => createBindingEvaluator(parseBindings([{ id: "test", signal, operation: "replace", priority: 0,
    min: 0, max: 1, attackSeconds: 1 / 60, releaseSeconds: 0.05 }]));
  const kick = make("kick"), bass = make("bass");
  assert.equal(kick.getSnapshot(), 0); assert.equal(bass.getSnapshot(), 1);
  assert.equal(kick.step(undefined, 1 / 60), 0);
  assert.ok(kick.step({ kick: 1 }, 1 / 60) > 0.6);
  for (let i = 0; i < 120; i++) kick.step({ kick: NaN }, 1 / 60);
  assert.ok(kick.getSnapshot() < 1e-12);
  kick.step({ kick: 1 }, 1 / 60); kick.reset(); assert.equal(kick.getSnapshot(), 0);
  assert.equal(bass.step(undefined, 1 / 60), 1);
});

for (const bpm of [100, 150]) test(`three real building membranes breathe once per ${bpm} BPM kick and retain safe bounds`, async () => {
  const manifest = parseArtworkPackage(JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/insectoid-planet/manifest.json", import.meta.url), "utf8")));
  const instance = createArtworkInstance("kick-membranes", manifest);
  const scales = () => instance.getSnapshot().layers.filter(layer => layer.id.endsWith("-membrane")).map(layer => layer.groups[0].effects.find(effect => effect.kind === "scale"));
  assert.equal(scales().length, 3);
  assert.ok(scales().every(scale => scale.x === 1 && scale.y === 1), "No startup inflation");
  const frames = [], period = 3600 / bpm;
  for (let tick = 0; tick < 600; tick++) {
    const age = (tick % period) / 60 * 1000;
    const kick = sampleKickAttack({ attackAt: 0, strength: 1 }, age);
    instance.stepBehaviors({ dt: 1 / 60 }, { strength: 1, intensity: 1, signals: { kick } });
    const values = scales();
    assert.ok(values.every(scale => scale.x >= 1 && scale.x <= 1.06 && scale.y >= 1 && scale.y <= 1.045));
    assert.ok(values.every(scale => scale.x === values[0].x), "All membranes breathe together");
    frames.push(values[0].x);
  }
  const peaks = frames.filter((value, i) => i > 0 && i < frames.length - 1 && value > frames[i - 1] && value > frames[i + 1] && value > 1.02);
  assert.equal(peaks.length, Math.ceil(600 / period), "Each kick produces an actual expansion peak");
  const frozen = instance.getSnapshot(); assert.deepEqual(instance.getSnapshot(), frozen);
  for (let i = 0; i < 120; i++) instance.stepBehaviors({ dt: 1 / 60 });
  assert.ok(scales().every(scale => Math.abs(scale.x - 1) < 1e-12), "Missing analysis relaxes to rest");
  instance.setBehaviorStrength("scale", 0);
  instance.stepBehaviors({ dt: 1 / 60 }, { strength: 1, intensity: 1, signals: { kick: 1 } });
  assert.ok(scales().every(scale => scale.x === 1 && scale.y === 1), "Existing scale control disables the breath");
  instance.reset(); assert.ok(scales().every(scale => scale.x === 1 && scale.y === 1), "Reset has no phantom breath");
});
