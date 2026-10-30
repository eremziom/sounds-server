import assert from "node:assert/strict";
import { test } from "node:test";
import { createApplicationSession } from "../src/lib/application-session.ts";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("background renewal preserves the session and shares in-flight work in one runtime", async () => {
  const session = createApplicationSession();
  const gate = deferred();
  const states = [];
  const unsubscribe = session.subscribe(() => states.push(session.getSnapshot()));
  let calls = 0;
  const first = session.renew(() => { calls++; return gate.promise; });
  const second = session.renew(() => assert.fail("Must reuse in-flight operation"));
  assert.equal(first, second);
  assert.equal(session.getSnapshot(), "refreshing");
  await Promise.resolve();
  assert.equal(calls, 1);
  gate.resolve(true);
  assert.equal(await first, true);
  assert.deepEqual(states, ["refreshing", "active"]);
  unsubscribe();
  session.end();
  assert.deepEqual(states, ["refreshing", "active"]);
});

test("a late successful renewal cannot reactivate an ended runtime", async () => {
  const session = createApplicationSession();
  const gate = deferred();
  const result = session.renew(() => gate.promise);
  await Promise.resolve();
  session.end();
  gate.resolve(true);
  assert.equal(await result, false);
  assert.equal(session.getSnapshot(), "ended");
  assert.equal(await session.renew(() => assert.fail("Ended sessions cannot renew")), false);
});

test("ending before dispatch prevents renewal from starting", async () => {
  const session = createApplicationSession();
  const result = session.renew(() => assert.fail("Must not start after ending"));
  session.end();
  assert.equal(await result, false);
});

test("only a definitive rejection ends the runtime; uncertain failures block it without retry", async () => {
  for (const [operation, status] of [
    [() => Promise.resolve(false), "ended"],
    [() => Promise.resolve("unavailable"), "unavailable"],
    [() => Promise.reject(new Error("private transport details")), "unavailable"],
    [() => { throw new Error("private synchronous details"); }, "unavailable"],
  ]) {
    const session = createApplicationSession();
    let calls = 0;
    assert.equal(await session.renew(() => { calls++; return operation(); }), false);
    assert.equal(session.getSnapshot(), status);
    assert.equal(calls, 1);
  }
});

test("sessions in separate runtimes do not share state or renewal results", async () => {
  const first = createApplicationSession();
  const second = createApplicationSession();
  first.end();
  assert.equal(await second.renew(async () => true), true);
  assert.equal(first.getSnapshot(), "ended");
  assert.equal(second.getSnapshot(), "active");
});

test("uncertain failure can recover, while a recovery attempt stays blocked until confirmed", async () => {
  const session = createApplicationSession();
  assert.equal(await session.renew(async () => "unavailable"), false);
  const gate = deferred();
  const recovery = session.renew(() => gate.promise);
  assert.equal(session.getSnapshot(), "unavailable");
  await Promise.resolve();
  gate.resolve(true);
  assert.equal(await recovery, true);
  assert.equal(session.getSnapshot(), "active");
});

test("a late failed refresh cannot change ended to unavailable", async () => {
  const session = createApplicationSession();
  let reject;
  const gate = new Promise((_, fail) => { reject = fail; });
  const pending = session.renew(() => gate);
  await Promise.resolve();
  session.end();
  reject(new TypeError("offline"));
  assert.equal(await pending, false);
  assert.equal(session.getSnapshot(), "ended");
});
