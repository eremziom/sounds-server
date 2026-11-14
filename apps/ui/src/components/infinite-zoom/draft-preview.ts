import type { ActiveVisualScene, VisualScene } from "../../engines/infinite-zoom/artwork/pilot-controls.ts";

/** Serializes draft entry/exit, including route cleanup during decoding. No media or clock ownership. */
export function createDraftPreview(ports: {
  prepare(): Promise<void>;
  getScene(): ActiveVisualScene;
  select(scene: ActiveVisualScene, manifest?: unknown, signal?: AbortSignal): Promise<void>;
}) {
  let previous: VisualScene | null = null, generation = 0, disposed = false;
  let pending: AbortController | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const operation = tail.then(action);
    tail = operation.catch(() => {});
    return operation;
  }
  return {
    isActive: () => previous !== null || pending !== null,
    start(manifest: unknown, signal: AbortSignal) {
      const ticket = ++generation;
      pending?.abort();
      const request = new AbortController(); pending = request;
      const combined = AbortSignal.any([signal, request.signal]);
      return enqueue(async () => {
        try {
          combined.throwIfAborted();
          if (disposed || ticket !== generation) throw new DOMException("Superseded preview", "AbortError");
          await ports.prepare(); combined.throwIfAborted();
          const scene = ports.getScene();
          await ports.select("draft", manifest, combined);
          if (previous === null && scene !== "draft") previous = scene;
        } finally { if (pending === request) pending = null; }
      });
    },
    end() {
      generation++; pending?.abort(); pending = null;
      return enqueue(async () => {
        if (disposed) return;
        if (previous !== null && ports.getScene() === "draft") await ports.select(previous);
        previous = null;
      });
    },
    dispose() { disposed = true; generation++; pending?.abort(); pending = null; previous = null; },
  };
}
