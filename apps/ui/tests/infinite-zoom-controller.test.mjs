import assert from "node:assert/strict";
import { test } from "node:test";
import { createInfiniteZoomController } from "../src/engines/infinite-zoom/index.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(overrides = {}) {
  let next = 0, resets = 0, disposals = 0;
  const frames = new Map(), outputs = [];
  const scheduler = {
    request(callback) { const id = next++; frames.set(id, callback); return id; },
    cancel(id) { frames.delete(id); },
  };
  const lease = {
    step(context) { outputs.push([context.tick, context.dt, context.random()]); },
    reset() { resets++; },
    dispose() { disposals++; },
  };
  const engine = createInfiniteZoomController({ seed: 42, scheduler, prepare: async () => lease, ...overrides });
  return { engine, scheduler, lease, frames, outputs,
    get resets() { return resets; }, get disposals() { return disposals; },
    frame(time) {
      assert.equal(frames.size, 1, "exactly one pending frame");
      const [id, callback] = frames.entries().next().value;
      frames.delete(id); callback(time);
    } };
}

test("prepare shares readiness, runs no simulation and start owns only one frame", async () => {
  const gate = deferred();
  let calls = 0;
  const f = fixture({ prepare: () => { calls++; return gate.promise; } });
  const ready = f.engine.prepare();
  assert.equal(f.engine.prepare(), ready);
  assert.equal(f.engine.getSnapshot().status, "preparing");
  assert.throws(() => f.engine.start());
  assert.equal(f.frames.size, 0);
  await Promise.resolve();
  assert.equal(calls, 1);
  gate.resolve(f.lease);
  await ready;
  assert.equal(f.engine.getSnapshot().status, "ready");
  assert.equal(f.outputs.length, 0);
  f.engine.start(); f.engine.start();
  f.frame(0); f.frame(1000 / 60);
  assert.equal(f.outputs.length, 1);
  assert.equal(f.engine.prepare(), ready);
  f.engine.dispose();
});

test("pause and stop preserve session and fractional time; resume excludes elapsed silence", async () => {
  const f = fixture();
  await f.engine.prepare(); f.engine.start();
  f.frame(0); f.frame(25);
  for (const method of ["pause", "stop"]) {
    const before = f.engine.getSnapshot();
    f.engine[method](); f.engine[method]();
    assert.equal(f.frames.size, 0);
    assert.deepEqual(f.engine.getSnapshot().session, before.session);
    assert.equal(f.engine.getSnapshot().interpolation, before.interpolation);
    f.engine.resume(); f.engine.resume();
    f.frame(method === "pause" ? 10_000 : 20_000);
    assert.deepEqual(f.engine.getSnapshot().session, before.session);
    f.frame(method === "pause" ? 10_017 : 20_017);
    assert.equal(f.engine.getSnapshot().session.tick, before.session.tick + 1);
  }
  assert.equal(f.disposals, 0);
  f.engine.dispose(); f.engine.dispose();
  assert.equal(f.disposals, 1);
});

test("overlapping suspensions freeze and visibility cannot override a user pause", async () => {
  const f = fixture();
  await f.engine.prepare(); f.engine.start(); f.frame(0); f.frame(20);
  const before = f.engine.getSnapshot().session;
  f.engine.setSuspended("hidden", true);
  f.engine.setSuspended("buffering", true);
  f.engine.setSuspended("hidden", false);
  assert.equal(f.frames.size, 0);
  assert.equal(f.engine.getSnapshot().status, "suspended");
  f.engine.pause();
  f.engine.setSuspended("buffering", false);
  assert.equal(f.engine.getSnapshot().status, "paused");
  assert.equal(f.frames.size, 0);
  f.engine.resume(); f.frame(1_000_000);
  assert.deepEqual(f.engine.getSnapshot().session, before);
  f.engine.dispose();
});

test("explicit reset rewinds session and module state without restarting", async () => {
  const f = fixture();
  const initial = f.engine.getSnapshot().session;
  await f.engine.prepare(); f.engine.start(); f.frame(0); f.frame(50);
  const first = f.outputs.slice();
  f.engine.reset();
  assert.deepEqual(f.engine.getSnapshot().session, initial);
  assert.equal(f.engine.getSnapshot().status, "ready");
  assert.equal(f.engine.getSnapshot().interpolation, 0);
  assert.equal(f.resets, 1);
  assert.equal(f.frames.size, 0);
  f.engine.start(); f.frame(100_000); f.frame(100_050);
  assert.deepEqual(f.outputs.slice(first.length), first);
  f.engine.dispose();
});

test("dispose during preparation aborts promptly and releases a late successful lease once", async () => {
  const gate = deferred();
  let signal;
  const f = fixture({ prepare: value => { signal = value; return gate.promise; } });
  const ready = f.engine.prepare();
  await Promise.resolve();
  const rejected = assert.rejects(ready, /aborted/);
  f.engine.dispose(); f.engine.dispose();
  assert.equal(signal.aborted, true);
  await rejected;
  gate.resolve(f.lease);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.disposals, 1);
  assert.equal(f.frames.size, 0);
  assert.equal(f.engine.getSnapshot().status, "disposed");
  await assert.rejects(f.engine.prepare(), /disposed/);
  assert.throws(() => f.engine.reset());
});

test("dispose before preparation invocation never acquires resources", async () => {
  let calls = 0;
  const f = fixture({ prepare: async () => { calls++; return f.lease; } });
  const rejected = assert.rejects(f.engine.prepare(), /aborted/);
  f.engine.dispose();
  await rejected;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
});

test("synchronous and asynchronous preparation failures enter error without scheduling", async () => {
  for (const prepare of [() => { throw new Error("load failed"); }, () => Promise.reject(new Error("load failed"))]) {
    const f = fixture({ prepare });
    await assert.rejects(f.engine.prepare(), /load failed/);
    assert.equal(f.engine.getSnapshot().status, "error");
    assert.equal(f.frames.size, 0);
    assert.throws(() => f.engine.start());
    await assert.rejects(f.engine.prepare(), /error/);
    f.engine.dispose();
  }
});

test("stale frame callbacks cannot advance a stopped, resumed or disposed journey", async () => {
  const f = fixture();
  await f.engine.prepare(); f.engine.start();
  const stale = [...f.frames.values()][0];
  f.engine.stop(); f.engine.resume();
  stale(1_000);
  assert.equal(f.frames.size, 1);
  assert.equal(f.engine.getSnapshot().session.tick, 0);
  const late = [...f.frames.values()][0];
  f.engine.dispose(); late(2_000);
  assert.equal(f.frames.size, 0);
  assert.equal(f.engine.getSnapshot().session.tick, 0);
});

test("step failures freeze the engine, cleanup failures preserve terminal disposal", async () => {
  const f = fixture();
  f.lease.step = () => { throw new Error("visual failure"); };
  f.lease.dispose = () => { throw new Error("cleanup failure"); };
  await f.engine.prepare(); f.engine.start(); f.frame(0); f.frame(50);
  assert.equal(f.engine.getSnapshot().status, "error");
  assert.match(f.engine.getSnapshot().error.message, /visual failure/);
  assert.equal(f.frames.size, 0);
  f.engine.dispose();
  assert.equal(f.engine.getSnapshot().status, "disposed");
  assert.match(f.engine.getSnapshot().error.message, /cleanup failure/);
});

test("reentrant stop during a catch-up step cancels remaining steps", async () => {
  const f = fixture();
  const step = f.lease.step;
  f.lease.step = context => { step(context); f.engine.stop(); };
  await f.engine.prepare(); f.engine.start(); f.frame(0); f.frame(1000);
  assert.equal(f.outputs.length, 1);
  assert.equal(f.frames.size, 0);
});

test("frame frequency does not change deterministic per-tick input evaluation", async () => {
  const runs = [];
  for (const hz of [30, 60, 144]) {
    const f = fixture();
    let value = 0;
    f.lease.step = context => {
      const input = context.tick % 7;
      value += input * context.random() * context.dt;
    };
    await f.engine.prepare(); f.engine.start(); f.frame(0);
    for (let frame = 1; frame <= hz * 10; frame++) f.frame(frame * 1000 / hz);
    runs.push({ value, session: f.engine.getSnapshot().session });
    f.engine.dispose();
  }
  assert.deepEqual(runs[0], runs[1]);
  assert.deepEqual(runs[1], runs[2]);
  assert.equal(runs[0].session.tick, 600);
});

test("reset preserves technical blockers and never implicitly resumes", async () => {
  const f = fixture();
  await f.engine.prepare(); f.engine.start(); f.frame(0); f.frame(20);
  f.engine.setSuspended("context-lost", true);
  f.engine.reset();
  assert.equal(f.engine.getSnapshot().session.tick, 0);
  f.engine.start();
  assert.equal(f.engine.getSnapshot().status, "suspended");
  assert.equal(f.frames.size, 0);
  f.engine.setSuspended("context-lost", false);
  f.frame(500_000);
  assert.equal(f.engine.getSnapshot().session.tick, 0);
  f.engine.dispose();
});

test("late preparation rejection cannot replace disposed with error", async () => {
  const gate = deferred();
  const f = fixture({ prepare: () => gate.promise });
  const rejected = assert.rejects(f.engine.prepare(), /aborted/);
  await Promise.resolve();
  f.engine.dispose();
  await rejected;
  gate.reject(new Error("late failure"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.engine.getSnapshot().status, "disposed");
  assert.equal(f.disposals, 0);
});

test("scheduler and module reset failures enter error and leave cleanup available", async () => {
  for (const mode of ["request", "cancel", "reset"]) {
    const f = fixture();
    await f.engine.prepare();
    if (mode === "request") f.scheduler.request = () => { throw new Error(mode); };
    f.engine.start();
    if (mode === "cancel") {
      f.scheduler.cancel = () => { throw new Error(mode); };
      f.engine.pause();
    }
    if (mode === "reset") {
      f.lease.reset = () => { throw new Error(mode); };
      f.engine.reset();
    }
    assert.equal(f.engine.getSnapshot().status, "error");
    assert.equal(f.engine.getSnapshot().error.message, mode);
    const before = f.engine.getSnapshot().session;
    for (const callback of f.frames.values()) callback(1000);
    assert.deepEqual(f.engine.getSnapshot().session, before);
    f.engine.dispose();
    assert.equal(f.disposals, 1);
  }
});
