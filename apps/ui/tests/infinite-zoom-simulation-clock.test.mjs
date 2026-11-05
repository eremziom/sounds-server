import assert from "node:assert/strict";
import { test } from "node:test";
import { createSimulationClock, FIXED_DT } from "../src/engines/infinite-zoom/core/simulation-clock.ts";

test("clock accumulates fractions and produces fixed steps at different frame rates", () => {
  assert.equal(FIXED_DT, 1 / 60);
  for (const hz of [30, 60, 120, 144]) {
    const clock = createSimulationClock();
    assert.equal(clock.advance(0), 0);
    let steps = 0;
    for (let frame = 1; frame <= hz * 7 * 60; frame++) {
      steps += clock.advance(frame * 1000 / hz);
      assert.ok(clock.getInterpolation() >= 0 && clock.getInterpolation() < 1);
    }
    assert.equal(steps, 7 * 60 * 60, `${hz} Hz over seven simulated minutes`);
  }
});

test("catch-up discards excess whole steps and preserves only the fractional remainder", () => {
  const clock = createSimulationClock();
  clock.advance(0);
  assert.equal(clock.advance(1005), 5);
  assert.ok(Math.abs(clock.getInterpolation() - 0.3) < 1e-8);
  assert.equal(clock.advance(1005), 0, "discarded backlog never returns");
  assert.equal(clock.advance(1017), 1);
});

test("rebase excludes hidden time and preserves fractions; reset clears fractions", () => {
  const clock = createSimulationClock();
  clock.advance(0);
  clock.advance(8);
  const fraction = clock.getInterpolation();
  clock.rebase();
  assert.equal(clock.advance(100_000), 0);
  assert.equal(clock.getInterpolation(), fraction);
  assert.equal(clock.advance(100_009), 1);
  clock.reset();
  assert.equal(clock.getInterpolation(), 0);
  assert.equal(clock.advance(200_000), 0);
});

test("invalid and backwards timestamps are rejected without poisoning the clock", () => {
  const clock = createSimulationClock();
  clock.advance(100);
  for (const value of [NaN, Infinity, -1, 99]) assert.throws(() => clock.advance(value), RangeError);
  assert.equal(clock.advance(120), 1);
});
