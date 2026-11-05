import assert from "node:assert/strict";
import { test } from "node:test";
import { createVisualSession } from "../src/engines/infinite-zoom/core/visual-session.ts";

test("same seed and per-tick inputs yield the same logic, reset rewinds it", () => {
  const first = createVisualSession(21), second = createVisualSession(21);
  const run = session => {
    const outputs = [];
    for (let i = 0; i < 120; i++) session.step(context => {
      assert.equal(context.dt, 1 / 60);
      assert.equal(context.timeSeconds, context.tick / 60);
      outputs.push(context.random() * (context.tick % 3));
    });
    return outputs;
  };
  const expected = run(first);
  assert.deepEqual(run(second), expected);
  assert.deepEqual(first.getSnapshot(), second.getSnapshot());
  const snapshot = first.getSnapshot();
  assert.throws(() => { snapshot.tick = 0; }, TypeError);
  first.reset();
  assert.equal(first.getSnapshot().tick, 0);
  assert.deepEqual(run(first), expected);
});

test("a retained step context cannot consume randomness outside evaluation", () => {
  const session = createVisualSession(0);
  let retained;
  session.step(context => { retained = context; });
  const snapshot = session.getSnapshot();
  assert.throws(() => retained.random(), /during a simulation step/);
  assert.deepEqual(session.getSnapshot(), snapshot);
  assert.throws(() => session.step(context => { retained = context; throw new Error("failed"); }), /failed/);
  assert.throws(() => retained.random(), /during a simulation step/);
});
