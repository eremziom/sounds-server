import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeededRandom } from "../src/engines/infinite-zoom/core/seeded-random.ts";

test("Mulberry32 has a stable known sequence, including seed zero", () => {
  const random = createSeededRandom(1);
  assert.deepEqual(Array.from({ length: 4 }, () => random.next()), [
    0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741,
  ]);
  assert.equal(createSeededRandom(0).next(), 0.26642920868471265);
});

test("random state is restorable, resettable and isolated between instances", () => {
  const first = createSeededRandom(42), second = createSeededRandom(42);
  const initial = first.next();
  assert.equal(second.next(), initial);
  const checkpoint = first.getState();
  const expected = [first.next(), first.next()];
  first.restore(checkpoint);
  assert.deepEqual([first.next(), first.next()], expected);
  assert.equal(second.next(), expected[0]);
  first.reset();
  assert.equal(first.next(), initial);
  for (const invalid of [-1, 2 ** 32, 0.5, NaN, Infinity]) {
    assert.throws(() => createSeededRandom(invalid), RangeError);
    assert.throws(() => first.restore(invalid), RangeError);
  }
});
