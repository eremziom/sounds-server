import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngineLifecycle } from "../src/engines/infinite-zoom/core/engine-lifecycle.ts";

test("lifecycle requires readiness and distinguishes first start, resume and reset", () => {
  const lifecycle = createEngineLifecycle();
  assert.equal(lifecycle.getStatus(), "idle");
  for (const method of ["start", "resume", "pause", "stop", "reset", "completePrepare"]) {
    assert.throws(() => lifecycle[method]());
  }
  lifecycle.beginPrepare();
  assert.equal(lifecycle.getStatus(), "preparing");
  assert.throws(() => lifecycle.beginPrepare());
  lifecycle.completePrepare();
  assert.equal(lifecycle.getStatus(), "ready");
  assert.throws(() => lifecycle.resume());
  lifecycle.start(); lifecycle.start();
  assert.equal(lifecycle.getStatus(), "running");
  for (const method of ["pause", "stop"]) {
    lifecycle[method](); lifecycle[method]();
    assert.equal(lifecycle.getStatus(), method === "pause" ? "paused" : "stopped");
    assert.throws(() => lifecycle.start());
    lifecycle.resume(); lifecycle.resume();
    assert.equal(lifecycle.getStatus(), "running");
  }
  lifecycle.reset(); lifecycle.reset();
  assert.equal(lifecycle.getStatus(), "ready");
});

test("independent suspensions never erase pause or stop intent", () => {
  const lifecycle = createEngineLifecycle();
  lifecycle.setSuspended("hidden", true);
  lifecycle.beginPrepare(); lifecycle.completePrepare(); lifecycle.start();
  assert.equal(lifecycle.getStatus(), "suspended");
  lifecycle.setSuspended("context-lost", true);
  lifecycle.setSuspended("hidden", false);
  assert.equal(lifecycle.getStatus(), "suspended");
  assert.deepEqual(lifecycle.getSuspensions(), ["context-lost"]);
  lifecycle.pause();
  lifecycle.setSuspended("context-lost", false);
  assert.equal(lifecycle.getStatus(), "paused");
  lifecycle.setSuspended("buffering", true);
  lifecycle.resume();
  assert.equal(lifecycle.getStatus(), "suspended");
  lifecycle.stop();
  lifecycle.setSuspended("buffering", false);
  assert.equal(lifecycle.getStatus(), "stopped");
});

test("error blocks commands and dispose is terminal and idempotent", () => {
  const lifecycle = createEngineLifecycle();
  lifecycle.fail();
  assert.equal(lifecycle.getStatus(), "error");
  assert.throws(() => lifecycle.beginPrepare());
  lifecycle.dispose(); lifecycle.dispose(); lifecycle.fail();
  assert.equal(lifecycle.getStatus(), "disposed");
  for (const method of ["start", "resume", "pause", "stop", "reset", "beginPrepare", "completePrepare"]) {
    assert.throws(() => lifecycle[method]());
  }
  assert.throws(() => lifecycle.setSuspended("hidden", false));
});
