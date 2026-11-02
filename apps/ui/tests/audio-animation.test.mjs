import assert from "node:assert/strict";
import { test } from "node:test";
import { ANIMATION_PARAMETERS, createAudioModulator, normalizeAudioLevel, createEmptyAudioSignals } from "../src/lib/audio-animation.ts";

const base = Object.fromEntries(Object.entries(ANIMATION_PARAMETERS).map(([key, { min, max }]) => [key, (min + max) / 2]));
const row = (patch = {}) => ({ id: "test", enabled: true, source: "bass", target: "spread", amount: 0.2, ...patch });
const signal = { ...createEmptyAudioSignals(), bass: { level: 1, attackAt: null, strength: 0 } };

test("bass uses absolute amplitude, is bounded and has a smooth attack and release", () => {
  assert.equal(normalizeAudioLevel(0), 0);
  assert.equal(normalizeAudioLevel(0.001), 0);
  assert.equal(normalizeAudioLevel(1), 1);
  assert.equal(normalizeAudioLevel(10), 1);
  const apply = createAudioModulator();
  const attack = apply(base, [row()], signal, true, 200, 0.02, 0).spread;
  assert.ok(attack > base.spread && attack < base.spread + 0.2);
  const release = apply(base, [row()], { ...signal, bass: { ...signal.bass, level: 0 } }, true, 200, 0.02, 20).spread;
  assert.ok(release > base.spread && release < attack);
});

test("changing destination immediately restores the old parameter and modulates the new one", () => {
  const apply = createAudioModulator();
  assert.ok(apply(base, [row()], signal, true, 200, 1, 0).spread > base.spread);
  const result = apply(base, [row({ target: "pulses" })], signal, true, 200, 1, 0);
  assert.equal(result.spread, undefined);
  assert.ok(result.pulses > base.pulses);
  assert.equal(base.spread, 0.5, "Manual settings are never overwritten");
});

test("mappings sum before clamping, allow negative strength, and support integer targets", () => {
  const apply = createAudioModulator();
  const result = apply(base, [row({ amount: 1 }), row({ id: "second", amount: -0.5 }), row({ target: "nodes", amount: 1 })], signal, true, 200, 10, 0);
  assert.equal(result.spread, 1);
  assert.equal(result.nodes, 6);
  assert.equal(apply(base, [row({ amount: -1 })], signal, true, 200, 10, 0).spread, 0);
  assert.deepEqual(apply(base, [row({ enabled: false })], signal, true, 200, 10, 0), {});
  assert.deepEqual(apply(base, [row()], signal, false, 200, 10, 0), {});
});

test("a kick reacts immediately, scales with strength and fully decays or resets", () => {
  const apply = createAudioModulator();
  const mapping = [row({ source: "kick", target: "brightness", amount: 0.5 })];
  const hit = { ...createEmptyAudioSignals(), bass: { level: 0, attackAt: 100, strength: 0.5 } };
  assert.equal(apply(base, mapping, hit, true, 200, 0.02, 100).brightness, 1.5);
  assert.equal(apply(base, mapping, hit, true, 200, 0.02, 200).brightness, 1.125);
  assert.equal(apply(base, mapping, hit, true, 200, 0.02, 300).brightness, 1);
  assert.equal(apply(base, mapping, { ...hit, bass: { ...hit.bass, attackAt: null } }, true, 200, 0.02, 110).brightness, 1);
});

test("mid and high levels and attacks map independently to any animation parameter", () => {
  const signals = createEmptyAudioSignals();
  signals.mid = { level: 1, attackAt: null, strength: 0 };
  signals.high = { level: 0, attackAt: 100, strength: 1 };
  const apply = createAudioModulator();
  const mappings = [row({ source: "mid", target: "spread" }), row({ source: "highAttack", target: "pulses" }),
    row({ source: "midAttack", target: "glow" }), row({ source: "high", target: "speed" })];
  const result = apply(base, mappings, signals, true, 200, 1, 100);
  assert.ok(result.spread > base.spread);
  assert.equal(result.pulses, base.pulses + 1);
  assert.equal(result.glow, base.glow);
  assert.equal(result.speed, base.speed);
  const reset = apply(base, mappings, createEmptyAudioSignals(), true, 200, 5, 400);
  assert.ok(Math.abs(reset.spread - base.spread) < 1e-10);
  assert.equal(reset.pulses, base.pulses);
});
