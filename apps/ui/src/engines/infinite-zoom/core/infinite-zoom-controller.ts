import type { EngineDependencies, EngineSnapshot, PreparedEngine, SuspensionReason } from "./contracts.ts";
import { createEngineLifecycle } from "./engine-lifecycle.ts";
import { createSimulationClock } from "./simulation-clock.ts";
import { createVisualSession } from "./visual-session.ts";

/** No DOM/audio ownership. start/resume must be called by a confirmed-playback
 * adapter. After an error, dispose and create a new controller to retry. */
export function createInfiniteZoomController(dependencies: EngineDependencies) {
  const lifecycle = createEngineLifecycle();
  const clock = createSimulationClock();
  const session = createVisualSession(dependencies.seed);
  let resources: PreparedEngine | null = null;
  let preparation: Promise<void> | null = null;
  let abort: AbortController | null = null;
  let frame: number | null = null;
  let revision = 0;
  let error: unknown = null;

  function cancelFrame() {
    revision++;
    const handle = frame;
    frame = null;
    clock.rebase();
    if (handle !== null) dependencies.scheduler.cancel(handle);
  }

  function fail(failure: unknown) {
    error = failure;
    lifecycle.fail();
    cancelFrame();
  }

  function schedule() {
    if (lifecycle.getStatus() !== "running" || frame !== null) return;
    const expectedRevision = revision;
    frame = dependencies.scheduler.request(timestamp => {
      if (expectedRevision !== revision || lifecycle.getStatus() !== "running") return;
      frame = null;
      try {
        const steps = clock.advance(timestamp);
        for (let i = 0; i < steps; i++) {
          if (expectedRevision !== revision || lifecycle.getStatus() !== "running") break;
          session.step(context => resources!.step(context));
        }
        schedule();
      } catch (failure) { fail(failure); }
    });
  }

  function syncFrames() {
    try {
      if (lifecycle.getStatus() === "running") schedule(); else cancelFrame();
    } catch (failure) { fail(failure); }
  }

  function release(lease: PreparedEngine) {
    try { lease.dispose(); } catch (failure) { error = failure; }
  }

  return {
    prepare(): Promise<void> {
      const status = lifecycle.getStatus();
      if (status === "disposed" || status === "error") return Promise.reject(new Error(`Engine is ${status}`));
      if (preparation) return preparation;
      lifecycle.beginPrepare();
      const operation = new AbortController();
      abort = operation;
      preparation = new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(new Error("Engine preparation aborted"));
        operation.signal.addEventListener("abort", onAbort, { once: true });
        // Defer invocation so synchronous dependency failures also reject the
        // shared promise and cannot leave lifecycle stuck in preparing.
        void Promise.resolve().then(() => {
          operation.signal.throwIfAborted();
          return dependencies.prepare(operation.signal);
        }).then(lease => {
          if (operation.signal.aborted) { release(lease); return; }
          resources = lease;
          lifecycle.completePrepare();
          resolve();
        }).catch(failure => {
          if (!operation.signal.aborted) fail(failure);
          reject(failure);
        }).finally(() => {
          operation.signal.removeEventListener("abort", onAbort);
          if (abort === operation) abort = null;
        });
      });
      return preparation;
    },
    start() { lifecycle.start(); syncFrames(); },
    resume() { lifecycle.resume(); syncFrames(); },
    pause() { lifecycle.pause(); syncFrames(); },
    stop() { lifecycle.stop(); syncFrames(); },
    setSuspended(reason: SuspensionReason, suspended: boolean) {
      const wasRunning = lifecycle.getStatus() === "running";
      lifecycle.setSuspended(reason, suspended);
      if (wasRunning !== (lifecycle.getStatus() === "running")) syncFrames();
    },
    reset() {
      lifecycle.reset();
      syncFrames();
      try {
        resources!.reset();
        session.reset();
        clock.reset();
      } catch (failure) { fail(failure); }
    },
    dispose() {
      if (lifecycle.getStatus() === "disposed") return;
      lifecycle.dispose();
      try { cancelFrame(); } catch (failure) { error = failure; }
      abort?.abort();
      abort = null;
      const lease = resources;
      resources = null;
      if (lease) release(lease);
    },
    getSnapshot(): EngineSnapshot {
      return Object.freeze({ status: lifecycle.getStatus(), suspensions: lifecycle.getSuspensions(),
        session: session.getSnapshot(), interpolation: clock.getInterpolation(), error });
    },
  };
}
