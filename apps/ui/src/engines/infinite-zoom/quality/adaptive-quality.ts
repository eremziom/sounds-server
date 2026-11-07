export const QUALITY_PROFILES = Object.freeze({
  Ultra: Object.freeze({ renderScale: 1, maxDpr: 3 }),
  High: Object.freeze({ renderScale: 1, maxDpr: 2 }),
  Balanced: Object.freeze({ renderScale: 0.75, maxDpr: 2 }),
  Performance: Object.freeze({ renderScale: 0.5, maxDpr: 1 }),
});
export type QualityProfile = keyof typeof QUALITY_PROFILES;

/** Presentation only. Two slow 120-frame windows and a 600-frame cooldown
 * prevent oscillation. Upgrades require ten almost entirely fast windows.
 * Explicit interruptions and critical A/B transactions reset the sample window. */
export function createAdaptiveQuality(initial: QualityProfile = "High") {
  const order: QualityProfile[] = ["Ultra", "High", "Balanced", "Performance"];
  if (!Object.hasOwn(QUALITY_PROFILES,initial)) throw new Error("Unknown quality profile");
  let profile = initial, count = 0, slow = 0, fast = 0, goodWindows = 0, badWindows = 0, cooldown = 0;
  function interrupt() { count = 0; slow = 0; fast = 0; goodWindows = 0; badWindows = 0; }
  return {
    getSnapshot: () => Object.freeze({ profile, ...QUALITY_PROFILES[profile] }),
    interrupt,
    select(next: QualityProfile, locked = false) {
      if (!Object.hasOwn(QUALITY_PROFILES,next)) throw new Error("Unknown quality profile");
      if (locked || next === profile) return false;
      profile=next; interrupt(); cooldown=600; return true;
    },
    sample(milliseconds: number, locked: boolean): boolean {
      if (locked || !Number.isFinite(milliseconds) || milliseconds <= 0) { interrupt(); return false; }
      if (cooldown > 0) { cooldown--; return false; }
      count++; if (milliseconds > 22) slow++; if (milliseconds < 14) fast++;
      if (count < 120) return false;
      badWindows = slow / count >= 0.2 ? badWindows + 1 : 0;
      goodWindows = fast/count >= 0.98 ? goodWindows+1 : 0;
      count = 0; slow = 0; fast = 0;
      if (goodWindows >= 10 && profile !== "Ultra") {
        profile=order[order.indexOf(profile)-1]; interrupt(); cooldown=600; return true;
      }
      if (badWindows < 2) return false;
      interrupt();
      const next = order[Math.min(order.indexOf(profile) + 1, order.length - 1)];
      if (next === profile) return false;
      profile = next; cooldown = 600; return true;
    },
  };
}
