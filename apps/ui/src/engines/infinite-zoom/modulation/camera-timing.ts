import type { NormalizedSignals } from "./bindings.ts";

/** Bounded intention timing. The active trajectory is never time-warped, so
 * changing music cannot invalidate its coverage proof or C1 handoff. */
export function createCameraTiming() {
  let factor = 1;
  return {
    step(signals: NormalizedSignals | undefined, dt: number) {
      if (dt !== 1/60) throw new Error("Camera timing requires a fixed step");
      const energy = signals?.energy;
      const target = energy === undefined || !Number.isFinite(energy) ? 1 : 0.75+0.5*Math.max(0,Math.min(1,energy));
      factor += (target-factor)*(1-Math.exp(-dt/0.25));
    },
    duration(seconds: number) {
      if (!Number.isFinite(seconds) || seconds < 1/60 || seconds > 60) throw new Error("Invalid camera intention duration");
      return Math.max(1/60,Math.min(60,Math.round(seconds/factor*60)/60));
    },
    getSnapshot: () => factor,
    reset() { factor = 1; },
  };
}
