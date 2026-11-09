/** A bass attack is an observed transient, not a claim of instrument or BPM
 * recognition. The analyser owns detection; this adapter adds no audio graph.
 * Timestamps and now are performance milliseconds. The sampled value can then
 * be recorded/replayed on the existing deterministic simulation clock. */
import { sampleAttack, type AttackSignal } from "./attack-signal.ts";
export const KICK_DECAY_MS = 160;

export function sampleKickAttack(signal: AttackSignal | null, now: number): number {
  return sampleAttack(signal, now, KICK_DECAY_MS);
}
