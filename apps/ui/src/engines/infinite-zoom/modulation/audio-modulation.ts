import type { NormalizedSignals } from "./bindings.ts";
export interface BehaviorModulation { readonly strength: number; readonly intensity: number; readonly signals?: NormalizedSignals }
export const NEUTRAL_MODULATION: BehaviorModulation = Object.freeze({ strength: 1, intensity: 1 });

/** Small first-slice mapping, independent of the application's audio schema.
 * Spatial strength never exceeds authored constraints. Intensity is bounded;
 * final composed shader gain is also capped. Missing signals tend to neutral. */
export function createAudioModulation() {
  let value = NEUTRAL_MODULATION;
  return {
    step(levels: Readonly<{ bass: number; mid: number; high: number }> | null, dt: number): BehaviorModulation {
      if (dt !== 1 / 60) throw new Error("Modulation requires a fixed step");
      const valid = levels && [levels.bass, levels.mid, levels.high].every(Number.isFinite);
      const clamp = (n: number) => Math.max(0, Math.min(1, n));
      const energy = valid ? clamp(levels.bass) * 0.6 + clamp(levels.mid) * 0.3 + clamp(levels.high) * 0.1 : null;
      const strength = energy === null ? 1 : 0.65 + 0.35 * energy;
      const intensity = energy === null ? 1 : 1 + 0.25 * energy;
      const smooth = (current: number, target: number) => current + (target-current) * (1-Math.exp(-dt / (target > current ? 0.04 : 0.15)));
      value = Object.freeze({ ...(valid ? { signals: Object.freeze({ bass: clamp(levels.bass), mid: clamp(levels.mid), high: clamp(levels.high), energy: energy! }) } : {}), strength: smooth(value.strength, strength), intensity: smooth(value.intensity, intensity) });
      return value;
    },
    getSnapshot: () => value,
    reset() { value = NEUTRAL_MODULATION; },
  };
}
