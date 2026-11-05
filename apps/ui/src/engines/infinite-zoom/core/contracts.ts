export type EngineStatus = "idle" | "preparing" | "ready" | "running" |
  "paused" | "stopped" | "suspended" | "error" | "disposed";

export type SuspensionReason = "hidden" | "buffering" | "seeking" | "context-lost";

export interface SessionSnapshot {
  readonly seed: number;
  readonly randomState: number;
  readonly tick: number;
  readonly timeSeconds: number;
}

export interface StepContext {
  readonly tick: number;
  readonly timeSeconds: number;
  readonly dt: number;
  readonly random: () => number;
}

/** Exactly one owner schedules frames. Callbacks must be asynchronous, like RAF. */
export interface FrameScheduler {
  request(callback: (timestampMs: number) => void): number;
  cancel(handle: number): void;
}

/** A successful preparation transfers ownership of this lease to the controller.
 * Failed preparation must clean up its own partial allocations. */
export interface PreparedEngine {
  step(context: StepContext): void;
  /** Presentation only; called once per frame, including frames with no step. */
  render?(interpolation: number): void;
  reset(): void;
  dispose(): void;
}

export interface EngineDependencies {
  readonly seed: number;
  readonly scheduler: FrameScheduler;
  readonly prepare: (signal: AbortSignal) => Promise<PreparedEngine>;
}

export interface EngineSnapshot {
  readonly status: EngineStatus;
  readonly suspensions: readonly SuspensionReason[];
  readonly session: SessionSnapshot;
  readonly interpolation: number;
  readonly error: unknown;
}
