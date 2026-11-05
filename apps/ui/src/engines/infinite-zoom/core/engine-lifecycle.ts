import type { EngineStatus, SuspensionReason } from "./contracts.ts";

export function createEngineLifecycle() {
  let phase: "idle" | "preparing" | "ready" | "error" | "disposed" = "idle";
  let intent: "ready" | "running" | "paused" | "stopped" = "ready";
  const suspensions = new Set<SuspensionReason>();
  function assertReady() {
    if (phase !== "ready") throw new Error(`Engine is ${phase}; expected ready`);
  }
  return {
    getStatus(): EngineStatus {
      if (phase !== "ready") return phase;
      return intent === "running" && suspensions.size ? "suspended" : intent;
    },
    getSuspensions: () => Object.freeze([...suspensions].sort()),
    beginPrepare() {
      if (phase !== "idle") throw new Error(`Cannot prepare engine in ${phase}`);
      phase = "preparing";
    },
    completePrepare() {
      if (phase !== "preparing") throw new Error(`Cannot complete preparation in ${phase}`);
      phase = "ready";
    },
    start() {
      assertReady();
      if (intent !== "ready" && intent !== "running") throw new Error("Use resume for a preserved journey");
      intent = "running";
    },
    resume() {
      assertReady();
      if (intent === "ready") throw new Error("Use start for the first playback");
      intent = "running";
    },
    pause() { assertReady(); intent = "paused"; },
    stop() { assertReady(); intent = "stopped"; },
    reset() { assertReady(); intent = "ready"; },
    setSuspended(reason: SuspensionReason, suspended: boolean) {
      if (phase === "disposed" || phase === "error") throw new Error(`Engine is ${phase}`);
      if (suspended) suspensions.add(reason); else suspensions.delete(reason);
    },
    fail() { if (phase !== "disposed") phase = "error"; },
    dispose() { phase = "disposed"; suspensions.clear(); },
  };
}
