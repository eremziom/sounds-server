export type AttackSignal = Readonly<{ attackAt: number | null; strength: number }>;
export const HIGH_ATTACK_DECAY_MS = 100;
export const MID_ATTACK_DECAY_MS = 120;

/** Sample an existing detector's timestamp in performance milliseconds.
 * Only the normalized result crosses into the fixed-step engine/replay. */
export function sampleAttack(signal: AttackSignal | null, now: number, decayMs: number): number {
  if (!signal || signal.attackAt === null || !Number.isFinite(signal.attackAt) ||
      !Number.isFinite(signal.strength) || !Number.isFinite(now) || !Number.isFinite(decayMs) || decayMs <= 0) return 0;
  const age = now - signal.attackAt;
  if (age < 0 || age >= decayMs) return 0;
  return Math.max(0, Math.min(1, signal.strength)) * (1 - age / decayMs) ** 2;
}

export function sampleHighAttack(signal: AttackSignal | null, now: number): number {
  return sampleAttack(signal, now, HIGH_ATTACK_DECAY_MS);
}

export function sampleMidAttack(signal: AttackSignal | null, now: number): number {
  return sampleAttack(signal, now, MID_ATTACK_DECAY_MS);
}
