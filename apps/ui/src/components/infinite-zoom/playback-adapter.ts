import type { createInfiniteZoomController } from "../../engines/infinite-zoom/index.ts";

type Engine = ReturnType<typeof createInfiniteZoomController>;
type AudioState = Pick<HTMLAudioElement, "paused" | "ended" | "seeking" | "readyState"> & EventTarget;
type Visibility = Pick<Document, "hidden"> & EventTarget;

/** Read-only audio observer. `play`/`canplay` cannot authorize simulation.
 * No listener calls play/pause/seek or owns an audio graph. */
export function bindPlaybackToVisuals(audio: AudioState, visibility: Visibility, getEngine: () => Engine,
  onDiscontinuity: () => void = () => {}, onConfirmed: () => void = () => {}, initiallyConfirmed = false) {
  let confirmed = initiallyConfirmed, buffering = false, disposed = false;
  function sync() {
    if (disposed) return;
    const engine = getEngine(), status = engine.getSnapshot().status;
    if (["error", "disposed"].includes(status)) return;
    engine.setSuspended("hidden", visibility.hidden);
    engine.setSuspended("buffering", buffering);
    engine.setSuspended("seeking", audio.seeking);
    if (!["ready", "running", "suspended", "paused", "stopped"].includes(status)) return;
    if (audio.ended) { engine.stop(); return; }
    if (audio.paused || !confirmed) {
      if (["running", "suspended"].includes(engine.getSnapshot().status)) engine.pause();
      return;
    }
    if (audio.readyState < 3) { engine.setSuspended("buffering", true); return; }
    const current = engine.getSnapshot().status;
    if (current === "ready") engine.start();
    else if (current === "paused" || current === "stopped") engine.resume();
  }
  function event(event: Event) {
    switch (event.type) {
      case "playing":
        if (!audio.paused && !audio.ended && audio.readyState >= 3) { confirmed = true; buffering = false; onConfirmed(); }
        break;
      case "waiting": case "stalled": buffering = true; break;
      case "pause": case "ended": case "error": case "emptied": case "loadstart": confirmed = false; buffering = false; break;
    }
    if (["seeking", "emptied", "loadstart", "error"].includes(event.type)) onDiscontinuity();
    sync();
  }
  const names = ["play", "playing", "pause", "ended", "error", "waiting", "stalled", "seeking", "seeked", "emptied", "loadstart", "canplay"];
  names.forEach(name => audio.addEventListener(name, event)); visibility.addEventListener("visibilitychange", sync);
  sync();
  return {
    sync,
    dispose() { disposed = true; names.forEach(name => audio.removeEventListener(name, event)); visibility.removeEventListener("visibilitychange", sync); },
  };
}
