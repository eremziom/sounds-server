/** A bass attack is an observed transient, not a claim of instrument or BPM
 * recognition. The analyser owns detection; this adapter adds no audio graph.
 * Timestamps and now are performance milliseconds. The sampled value can then
 * be recorded/replayed on the existing deterministic simulation clock. */
export const KICK_DECAY_MS = 160;

export function sampleKickAttack(signal: Readonly<{ attackAt: number | null; strength: number }> | null, now: number): number {
  if (!signal || signal.attackAt === null || !Number.isFinite(signal.attackAt) ||
      !Number.isFinite(signal.strength) || !Number.isFinite(now)) return 0;
  const age = now - signal.attackAt;
  if (age < 0 || age >= KICK_DECAY_MS) return 0;
  return Math.max(0, Math.min(1, signal.strength)) * (1 - age / KICK_DECAY_MS) ** 2;
}
