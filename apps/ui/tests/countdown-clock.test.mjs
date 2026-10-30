import assert from "node:assert/strict";
import { test } from "node:test";
import { countdownTickDelay, startCountdownClock } from "../src/lib/countdown-clock.ts";

test("both deadlines schedule their own second boundaries, including millisecond offsets", () => {
  assert.equal(countdownTickDelay([10_000, 20_317], 1_001), 316);
  assert.equal(countdownTickDelay([10_000, 20_317], 1_317), 683);
  assert.equal(countdownTickDelay([10_000, 20_317], 2_000), 317);
  assert.equal(countdownTickDelay([null, 20_317], 1_317), 1_000);
  assert.equal(countdownTickDelay([1_000, null, NaN], 1_000), null);
});

test("countdowns change one second at a time without duplicate/skip rounding near a boundary", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_001 });
  const expiries = [10_000, 20_317];
  const values = [[], []];
  const clock = startCountdownClock(expiries, (now) => {
    expiries.forEach((expiry, index) => {
      const seconds = Math.ceil((expiry - now) / 1000);
      if (values[index].at(-1) !== seconds) values[index].push(seconds);
    });
  });
  t.after(clock.stop);
  t.mock.timers.tick(0);
  assert.deepEqual(values, [[9], [20]]);
  for (let ms = 0; ms < 4_000; ms++) t.mock.timers.tick(1);
  assert.deepEqual(values[0], [9, 8, 7, 6, 5]);
  assert.deepEqual(values[1], [20, 19, 18, 17, 16]);
});

test("late callbacks and tab resume correct from real time then align the next boundary", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_001 });
  const ticks = [];
  const clock = startCountdownClock([10_000], (now) => ticks.push(now));
  t.after(clock.stop);
  t.mock.timers.tick(0);
  t.mock.timers.setTime(3_157); // Browser suspension, not three executed callbacks.
  clock.sync();
  assert.deepEqual(ticks, [1_001, 3_157]);
  t.mock.timers.tick(842);
  assert.equal(ticks.length, 2);
  t.mock.timers.tick(1);
  assert.deepEqual(ticks, [1_001, 3_157, 4_000]);
  clock.stop();
  t.mock.timers.tick(10_000);
  clock.sync();
  assert.equal(ticks.length, 3);
});
