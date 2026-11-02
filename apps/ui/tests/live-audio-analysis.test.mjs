import assert from "node:assert/strict";
import { test } from "node:test";
import { measureLiveAudio, createLiveDetector } from "../src/lib/live-audio-analysis.ts";

const frame = (time, amplitude = 0) => ({ start: Math.max(0, time - 0.093), end: time,
  rmsDbfs: amplitude ? 20 * Math.log10(amplitude) : -120, peakDbfs: amplitude ? 20 * Math.log10(amplitude) : -120,
  dominantHz: amplitude ? 100 : null, bands: { sub: 0, bass: amplitude ? 100 : 0, mid: 0, upper: 0, high: 0 },
  lowAmplitude: amplitude, amplitude });

test("live measurements use signal RMS/peak and linear frequency power", () => {
  const samples = Float32Array.from({ length: 4096 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 100 * i / 44100));
  const spectrum = new Float32Array(2048).fill(-Infinity);
  spectrum[9] = -20; spectrum[100] = -30;
  const result = measureLiveAudio([samples], [spectrum], 44100, 1);
  assert.ok(Math.abs(result.rmsDbfs - -9.03) < 0.1);
  assert.ok(Math.abs(result.peakDbfs - -6.02) < 0.1);
  assert.ok(Math.abs(result.bands.bass - 90.909) < 0.01);
  assert.ok(Math.abs(result.bands.mid - 9.091) < 0.01);
  assert.ok(Math.abs(result.dominantHz - 100) < 11);
  assert.equal(result.end, 1);
  assert.ok(Math.abs(result.start - 0.9071) < 0.001);
  const stereo = measureLiveAudio([samples, samples.map(value => -value)], [spectrum, spectrum], 44100, 1);
  assert.ok(Math.abs(stereo.rmsDbfs - result.rmsDbfs) < 1e-10);
  assert.deepEqual(stereo.bands, result.bands);
});

test("silent live measurements have finite levels, no frequency and zero band energy", () => {
  const result = measureLiveAudio([new Float32Array(4096)], [new Float32Array(2048).fill(-Infinity)], 44100, 0.1);
  assert.equal(result.rmsDbfs, -120); assert.equal(result.peakDbfs, -120);
  assert.equal(result.dominantHz, null);
  assert.equal(Object.values(result.bands).reduce((a, b) => a + b), 0);
});

test("live detector does not fabricate an onset on activation and retains the last event", () => {
  const detector = createLiveDetector();
  assert.equal(detector.sample(frame(0.1, 0.5)).bassOnset, false);
  detector.sample(frame(0.2));
  const pulse = detector.sample(frame(0.3, 0.5));
  assert.equal(pulse.bassOnset, true); assert.equal(pulse.onset, true);
  assert.equal(pulse.lastBassTime, 0.3); assert.ok(pulse.bassStrength > 1);
  const next = detector.sample(frame(0.4, 0.5));
  assert.equal(next.bassOnset, false); assert.equal(next.lastBassTime, 0.3);
  assert.equal(next.bassStrength, pulse.bassStrength);
});

test("seeks and long polling gaps clear event and tempo history", () => {
  for (const jump of [0.05, 10]) {
    const detector = createLiveDetector();
    detector.sample(frame(0.1)); detector.sample(frame(0.2, 0.5));
    const result = detector.sample(frame(jump, 0.8));
    assert.equal(result.bassOnset, false); assert.equal(result.lastBassTime, null); assert.equal(result.tempo, null);
  }
});

test("live silence needs 300 ms of measured silence", () => {
  const detector = createLiveDetector();
  assert.equal(detector.sample(frame(0.1)).silence, false);
  assert.equal(detector.sample(frame(0.2)).silence, false);
  assert.equal(detector.sample(frame(0.3)).silence, false);
  assert.equal(detector.sample(frame(0.4)).silence, true);
  assert.equal(detector.sample(frame(0.5, 0.1)).silence, false);
});

test("bass sensitivity lowers the actual threshold while leaving overall onsets unchanged", () => {
  const normal = createLiveDetector(), sensitive = createLiveDetector();
  normal.sample(frame(0.1)); sensitive.sample(frame(0.1));
  const normalPulse = normal.sample(frame(0.2, 0.004));
  const sensitivePulse = sensitive.sample(frame(0.2, 0.004), { sensitivity: 3, minIntervalMs: 180 });
  assert.equal(normalPulse.bassOnset, false);
  assert.equal(sensitivePulse.bassOnset, true);
  assert.ok(sensitivePulse.bassStrength > 1);
  assert.equal(sensitivePulse.onset, normalPulse.onset);
});

test("configured spacing suppresses closely repeated bass events", () => {
  const normal = createLiveDetector(), spaced = createLiveDetector();
  const options = { sensitivity: 1, minIntervalMs: 600 };
  for (const detector of [normal, spaced]) detector.sample(frame(0.1));
  assert.equal(normal.sample(frame(0.2, 0.02)).bassOnset, true);
  assert.equal(spaced.sample(frame(0.2, 0.02), options).bassOnset, true);
  normal.sample(frame(0.3)); spaced.sample(frame(0.3), options);
  assert.equal(normal.sample(frame(0.4, 0.2)).bassOnset, true);
  assert.equal(spaced.sample(frame(0.4, 0.2), options).bassOnset, false);
});

test("20 ms sampling catches a short attack between the old 100 ms reads", () => {
  const detector = createLiveDetector();
  const hits = [];
  for (let i = 0; i < 20; i++) {
    const time = i * 0.02;
    const snapshot = detector.sampleTransient(frame(time, time >= 0.04 && time < 0.08 ? 0.4 : 0));
    if (snapshot.bassOnset) hits.push(snapshot.lastBassTime);
  }
  assert.deepEqual(hits, [0.04]);
});

test("one ringing attack does not retrigger after the refractory interval", () => {
  const detector = createLiveDetector();
  const hits = [];
  for (let i = 0; i < 40; i++) {
    const time = i * 0.02;
    // A long body with ripples lasts past the default 180 ms spacing.
    const amplitude = i < 3 || i > 30 ? 0 : i === 3 ? 0.8 : 0.55 + 0.05 * Math.sin(i * 1.8);
    const snapshot = detector.sampleTransient(frame(time, amplitude));
    if (snapshot.bassOnset) hits.push(snapshot.lastBassTime);
  }
  assert.deepEqual(hits, [0.06]);
});

test("steady bass with small envelope ripple does not create repeated onsets", () => {
  const detector = createLiveDetector();
  for (let i = 0; i < 200; i++) {
    const snapshot = detector.sampleTransient(frame(i * 0.02, 0.4 + 0.025 * Math.sin(i * 1.1)));
    assert.equal(snapshot.bassOnset, false);
  }
});

test("distinct attacks rearm and a weaker hit after a strong hit is retained", () => {
  const detector = createLiveDetector();
  const hits = [];
  for (let i = 0; i < 120; i++) {
    const phase = i % 25;
    const amplitude = phase >= 4 && phase <= 6 ? (i < 25 ? 0.8 : 0.15) : 0;
    const snapshot = detector.sampleTransient(frame(i * 0.02, amplitude));
    if (snapshot.bassOnset) hits.push(snapshot.lastBassTime);
  }
  assert.equal(hits.length, 5);
  hits.forEach((time, i) => assert.ok(Math.abs(time - (0.08 + i * 0.5)) < 0.001));
});
