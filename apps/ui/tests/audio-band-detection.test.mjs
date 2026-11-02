import assert from "node:assert/strict";
import { test } from "node:test";
import { createBandDetector, DEFAULT_BAND_OPTIONS, sanitizeBandOptions } from "../src/lib/audio-band-detection.ts";
import { createLiveDetector } from "../src/lib/live-audio-analysis.ts";

test("a band emits one event per attack and holds its last event through a sustained tone", () => {
  const detect = createBandDetector(), settings = DEFAULT_BAND_OPTIONS.mid;
  assert.equal(detect(0, 0, settings).onset, false);
  const hit = detect(0.4, 0.02, settings);
  assert.equal(hit.onset, true);
  for (let i = 2; i < 30; i++) {
    const result = detect(0.4, i * 0.02, settings);
    assert.equal(result.onset, false);
    assert.equal(result.lastTime, hit.lastTime);
  }
});

test("minimum level ignores quiet attacks without locking out a later audible hit", () => {
  const detect = createBandDetector(), settings = { ...DEFAULT_BAND_OPTIONS.mid, minDbfs: -20 };
  detect(0, 0, settings);
  assert.equal(detect(0.04, 0.02, settings).onset, false);
  detect(0, 0.04, settings);
  assert.equal(detect(0.2, 0.06, settings).onset, true);
});

test("fast high attacks use their own refractory interval, independent of the bass", () => {
  const detector = createLiveDetector(), hits = { bass: [], mid: [], high: [] };
  for (let i = 0; i < 60; i++) {
    const level = i % 6 === 1 ? 0.4 : 0;
    const result = detector.sampleTransient({ start: i * 0.02, end: i * 0.02,
      rmsDbfs: level ? -8 : -120, amplitude: level, lowAmplitude: level,
      bandAmplitudes: { bass: level, mid: 0, high: level } });
    for (const band of Object.keys(hits)) if (result.bandDetections[band].onset) hits[band].push(i);
  }
  assert.equal(hits.high.length, 10);
  assert.equal(hits.bass.length, 5);
  assert.equal(hits.mid.length, 0);
});

test("seeking, long polling gaps and changing frequency ranges clear detection history without a hit", () => {
  for (const next of [{ time: 0.01 }, { time: 2 }, { time: 0.04, fromHz: 900, toHz: 1100 }]) {
    const detect = createBandDetector(), settings = DEFAULT_BAND_OPTIONS.mid;
    detect(0, 0, settings); assert.equal(detect(0.4, 0.02, settings).onset, true);
    const result = detect(0.8, next.time, { ...settings, ...next });
    assert.deepEqual(result, { onset: false, lastTime: null, strength: null });
  }
});

test("invalid detector settings are bounded with an ordered, nonempty frequency range", () => {
  const result = sanitizeBandOptions({ fromHz: 25000, toHz: 20, sensitivity: NaN, minDbfs: 10, minIntervalMs: 0 });
  assert.deepEqual(result, { fromHz: 19990, toHz: 20000, sensitivity: 1, minDbfs: -6, minIntervalMs: 40 });
});
