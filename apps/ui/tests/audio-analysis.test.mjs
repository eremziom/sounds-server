import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzePcm, estimateTempo } from "../src/lib/audio-analysis.ts";

const sampleRate = 44100;
const tone = (duration, frequency, amplitude = 0.5) => Float32Array.from({ length: Math.round(duration * sampleRate) }, (_, i) => amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate));
const pulses = (frequency = 80) => Float32Array.from({ length: 10 * sampleRate }, (_, i) => {
  const time = i / sampleRate, phase = (time - 0.5) % 0.5;
  return time >= 0.5 && phase < 0.08 ? 0.8 * Math.sin(2 * Math.PI * frequency * time) * Math.sin(Math.PI * phase / 0.08) : 0;
});

test("silence produces a complete finite timeline and a silence interval, without a tempo", () => {
  const result = analyzePcm([new Float32Array(2 * sampleRate)], sampleRate);
  assert.equal(result.timeline.length, 20);
  assert.deepEqual(result.events, [{ type: "silence", time: 0, endTime: 2 }]);
  assert.equal(result.tempo, null);
  assert.ok(result.timeline.every(frame => frame.rmsDbfs === -120 && frame.peakDbfs === -120 && frame.dominantHz === null));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("known tones land in the correct band with calibrated digital RMS and peak", () => {
  for (const [frequency, band] of [[40, "sub"], [100, "bass"], [1000, "mid"], [4000, "upper"], [10000, "high"]]) {
    const { timeline } = analyzePcm([tone(0.5, frequency)], sampleRate);
    const frame = timeline[1];
    assert.ok(frame.bands[band] > 99, `${frequency} Hz: ${JSON.stringify(frame.bands)}`);
    assert.ok(Math.abs(frame.dominantHz - frequency) < sampleRate / 4096);
    assert.ok(Math.abs(frame.rmsDbfs - -9.031) < 0.1);
    assert.ok(Math.abs(frame.peakDbfs - -6.021) < 0.1);
    assert.ok(Math.abs(Object.values(frame.bands).reduce((sum, value) => sum + value, 0) - 100) < 0.01);
  }
});

test("opposite stereo phases do not cancel during analysis", () => {
  const left = tone(1, 100);
  const mono = analyzePcm([left], sampleRate);
  const stereo = analyzePcm([left, left.map(value => -value)], sampleRate);
  assert.deepEqual(stereo.timeline, mono.timeline);
});

test("timeline levels use exactly the stated interval without leaking the next onset", () => {
  const samples = new Float32Array(sampleRate);
  samples.set(tone(0.5, 100), sampleRate / 2);
  const result = analyzePcm([samples], sampleRate);
  assert.equal(result.timeline[4].rmsDbfs, -120);
  assert.equal(result.timeline[4].peakDbfs, -120);
  assert.equal(result.timeline[4].dominantHz, null);
  assert.ok(result.timeline[5].rmsDbfs > -10);
});

test("regular low-frequency pulses receive timestamps and an approximate 120 BPM tempo", () => {
  const result = analyzePcm([pulses()], sampleRate);
  const detected = result.events.filter(event => event.type === "bassOnset");
  assert.ok(detected.length >= 17 && detected.length <= 20, `Detected ${detected.length}`);
  detected.forEach(event => {
    const nearest = Math.round(event.time / 0.5) * 0.5;
    assert.ok(Math.abs(event.time - nearest) < 0.08, `Pulse at ${event.time}`);
  });
  assert.ok(result.tempo && Math.abs(result.tempo.bpm - 120) < 4);
  assert.ok(result.events.every((event, i, events) => i === 0 || event.time >= events[i - 1].time));
});

test("a sustained bass tone and high-frequency transients are not labelled repeated bass pulses", () => {
  assert.equal(analyzePcm([tone(2, 80)], sampleRate).events.filter(event => event.type === "bassOnset").length, 0);
  const result = analyzePcm([pulses(4000)], sampleRate);
  assert.equal(result.events.filter(event => event.type === "bassOnset").length, 0);
  assert.ok(result.events.some(event => event.type === "onset"));
});

test("short files, a partial final interval and low sample rates keep valid bounds", () => {
  for (const [samples, rate] of [[tone(0.015, 440), sampleRate], [tone(0.347, 440), sampleRate], [new Float32Array(8000), 8000]]) {
    const result = analyzePcm([samples], rate);
    assert.ok(result.timeline.every(frame => Number.isFinite(frame.rmsDbfs) && frame.end <= Math.round(result.duration * 1000) / 1000));
    assert.equal(result.timeline.at(-1).end, Math.round(result.duration * 1000) / 1000);
  }
});

test("tempo estimation abstains on short, irregular or unsupported pulse intervals", () => {
  for (const times of [[], [0, 0.5, 1], [0, 0.3, 1, 1.2, 2.3, 2.6, 3.7, 4, 5.2], Array.from({ length: 10 }, (_, i) => i * 2)]) assert.equal(estimateTempo(times), null);
});

test("invalid PCM is rejected", () => {
  for (const channels of [[], [new Float32Array()], [tone(1, 440), tone(0.5, 440)], [Float32Array.of(NaN)]]) assert.throws(() => analyzePcm(channels, sampleRate));
});
