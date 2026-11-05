import assert from "node:assert/strict";
import { test } from "node:test";
import { createInfiniteZoomController } from "../src/engines/infinite-zoom/index.ts";
import { bindPlaybackToVisuals } from "../src/components/infinite-zoom/playback-adapter.ts";
import { createVisualBridge } from "../src/components/infinite-zoom/visual-bridge.ts";

class Audio extends EventTarget {
  paused = true; ended = false; seeking = false; readyState = 4;
  emit(name) { this.dispatchEvent(new Event(name)); }
}
class Visibility extends EventTarget { hidden = false; change(hidden) { this.hidden = hidden; this.dispatchEvent(new Event("visibilitychange")); } }
function fixture() {
  const audio = new Audio(), visibility = new Visibility(), frames = new Map();
  let next = 0, discontinuities = 0;
  const engine = createInfiniteZoomController({ seed: 1,
    scheduler: { request(callback) { const id = next++; frames.set(id, callback); return id; }, cancel(id) { frames.delete(id); } },
    prepare: async () => ({ step() {}, reset() {}, dispose() {} }),
  });
  const adapter = bindPlaybackToVisuals(audio, visibility, () => engine, () => { discontinuities++; });
  return { audio, visibility, engine, adapter, frames, get discontinuities() { return discontinuities; },
    frame(time) { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(time); },
    play() { audio.paused = false; audio.ended = false; audio.emit("playing"); } };
}

test("Play click and canplay do not start visuals; confirmed playing does", async () => {
  const f = fixture(); await f.engine.prepare();
  f.audio.paused = false; f.audio.emit("play"); f.audio.emit("canplay");
  assert.equal(f.engine.getSnapshot().status, "ready"); assert.equal(f.frames.size, 0);
  f.play(); assert.equal(f.engine.getSnapshot().status, "running");
  f.frame(0); f.frame(20); assert.equal(f.engine.getSnapshot().session.tick, 1);
  f.adapter.dispose(); f.engine.dispose();
});

test("pause/end freeze, next track resumes, and source/seek events never reset the journey", async () => {
  const f = fixture(); await f.engine.prepare(); f.play(); f.frame(0); f.frame(50);
  const saved = f.engine.getSnapshot().session;
  f.audio.paused = true; f.audio.emit("pause"); assert.equal(f.frames.size, 0);
  f.audio.ended = true; f.audio.emit("ended"); assert.equal(f.engine.getSnapshot().status, "stopped");
  f.audio.emit("emptied"); f.audio.emit("loadstart");
  assert.deepEqual(f.engine.getSnapshot().session, saved);
  f.play(); f.frame(100_000); assert.deepEqual(f.engine.getSnapshot().session, saved);
  f.audio.seeking = true; f.audio.emit("seeking"); assert.equal(f.frames.size, 0);
  f.audio.seeking = false; f.audio.emit("seeked"); f.frame(200_000);
  assert.deepEqual(f.engine.getSnapshot().session, saved); assert.equal(f.discontinuities, 3);
  f.adapter.dispose(); f.engine.dispose();
});

test("buffering, seeking and hidden reasons remain independent of a user pause", async () => {
  const f = fixture(); await f.engine.prepare(); f.play();
  f.audio.emit("waiting"); f.audio.emit("canplay"); assert.equal(f.frames.size, 0);
  f.visibility.change(true); f.audio.emit("playing"); assert.equal(f.engine.getSnapshot().status, "suspended");
  f.audio.paused = true; f.audio.emit("pause"); f.visibility.change(false);
  assert.equal(f.engine.getSnapshot().status, "paused"); assert.equal(f.frames.size, 0);
  f.play(); f.visibility.change(true); f.visibility.change(false);
  f.frame(1_000_000); assert.equal(f.engine.getSnapshot().session.tick, 0);
  f.adapter.dispose(); f.engine.dispose();
});

test("late mount can read confirmed playback snapshot; disposal detaches all event handling", async () => {
  const f = fixture(); f.adapter.dispose(); await f.engine.prepare();
  f.audio.paused = false;
  const adapter = bindPlaybackToVisuals(f.audio, f.visibility, () => f.engine, undefined, undefined, true);
  assert.equal(f.engine.getSnapshot().status, "running");
  adapter.dispose(); f.engine.pause(); f.audio.emit("playing"); f.visibility.change(true);
  assert.equal(f.engine.getSnapshot().status, "paused"); assert.deepEqual(f.engine.getSnapshot().suspensions, []);
  f.engine.dispose(); assert.doesNotThrow(() => f.audio.emit("playing"));
});

test("visual bridge modes preserve the connection and readiness; terminal cleanup is idempotent", async () => {
  const bridge = createVisualBridge(); let preparations = 0, disposals = 0;
  await assert.rejects(bridge.prepareForPlayback(), /not mounted/);
  const connection = { prepareForPlayback: async () => { preparations++; }, retry: async () => {}, command() {}, transition: async () => {}, reset() {}, dispose() { disposals++; } };
  const disconnect = bridge.connect(connection);
  assert.throws(() => bridge.connect(connection), /already/);
  await bridge.prepareForPlayback(); bridge.setMode("immersive"); bridge.setMode("background");
  assert.equal(preparations, 1); assert.equal(disposals, 0);
  bridge.dispose(); bridge.dispose(); disconnect();
  assert.equal(disposals, 1); await assert.rejects(bridge.prepareForPlayback(), /not mounted/);
});
