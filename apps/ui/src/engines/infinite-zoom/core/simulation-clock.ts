export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;
const STEP_MS = 1000 / 60;
const EPSILON_MS = 1e-7;

/** Wall timestamps only determine the number of fixed steps, never their dt. */
export function createSimulationClock() {
  let last: number | null = null;
  let remainderMs = 0;
  return {
    advance(timestampMs: number): number {
      if (!Number.isFinite(timestampMs) || timestampMs < 0) {
        throw new RangeError("Expected a finite, nonnegative frame timestamp");
      }
      if (last !== null && timestampMs < last) {
        throw new RangeError("Frame timestamps must be monotonic");
      }
      if (last === null) { last = timestampMs; return 0; }
      const elapsed = timestampMs - last;
      last = timestampMs;
      // Bound arithmetic even after very long stalls. Excess whole steps are
      // discarded, while the fractional step survives the catch-up limit.
      const total = remainderMs + elapsed % STEP_MS;
      const carried = Math.floor((total + EPSILON_MS) / STEP_MS);
      remainderMs = Math.max(0, total - carried * STEP_MS);
      return Math.min(MAX_STEPS_PER_FRAME,
        Math.floor(elapsed / STEP_MS) + carried);
    },
    rebase() { last = null; },
    reset() { last = null; remainderMs = 0; },
    getInterpolation: () => remainderMs / STEP_MS,
  };
}
