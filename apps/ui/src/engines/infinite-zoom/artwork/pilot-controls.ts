import type { BehaviorDescriptor } from "../behaviors/behavior-contract.ts";

export type BehaviorKind = BehaviorDescriptor["kind"];
export const BEHAVIOR_KINDS: readonly BehaviorKind[] = Object.freeze([
  "translate", "rotate", "scale", "parallax", "bend", "wave", "displace", "flow", "pulse", "opacity", "colorShift", "glow",
]);
export interface PilotControl { readonly kind: BehaviorKind; readonly enabled: boolean; readonly strength: number }
export const STUDIO_ARTWORKS = Object.freeze({pilot:"forest-pilot",layered:"forest-layered",clockwork:"clockwork",alien:"insectoid-planet",digital:"digital-grid"});
export type VisualScene = "journey" | keyof typeof STUDIO_ARTWORKS;
export function validateBehaviorControl(kind: BehaviorKind, strength: number) {
  if (!BEHAVIOR_KINDS.includes(kind) || !Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error("Invalid behavior control");
}
export function defaultPilotControls(): readonly PilotControl[] {
  return Object.freeze(BEHAVIOR_KINDS.map(kind => Object.freeze({ kind, enabled:true, strength:1 })));
}
