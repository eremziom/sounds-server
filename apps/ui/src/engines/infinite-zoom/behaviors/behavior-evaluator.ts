import { resolveBehaviors, type BehaviorDescriptor } from "./behavior-contract.ts";

export interface BehaviorRegion {
  readonly id: string;
  readonly influenceMaskAssetId: string;
  readonly behaviors: readonly BehaviorDescriptor[];
}

export interface BehaviorGroup {
  readonly id: string;
  readonly influenceMaskAssetId?: string;
  readonly behaviors: readonly BehaviorDescriptor[];
}

export type BehaviorOutput = Readonly<{ id: string; influenceMaskAssetId?: string } & (
  { kind: "translate"; x: number; y: number } |
  { kind: "wave"; amplitude: number; wavelength: number; axis: "x" | "y"; phase: number } |
  { kind: "pulse"; gain: number }
)>;

export interface BehaviorGroupOutput {
  readonly id: string;
  readonly influenceMaskAssetId?: string;
  readonly effects: readonly BehaviorOutput[];
}

export function behaviorGroups(artwork: readonly BehaviorDescriptor[], layer: {
  readonly behaviors: readonly BehaviorDescriptor[]; readonly regions: readonly BehaviorRegion[];
}): readonly BehaviorGroup[] {
  const inherited = resolveBehaviors(artwork, layer.behaviors);
  return Object.freeze([
    Object.freeze({ id: "layer", behaviors: inherited }),
    ...layer.regions.map(region => Object.freeze({ id: region.id, influenceMaskAssetId: region.influenceMaskAssetId,
      behaviors: resolveBehaviors(inherited, region.behaviors) })),
  ]);
}

/** Each instance owns its phase counter and immutable outputs. Groups resolve
 * artwork -> layer -> region. At a pixel a region mask blends from the inherited
 * result to that region's resolved result, in manifest region order. */
export function createBehaviorEvaluator(groups: readonly BehaviorGroup[]) {
  let tick = 0;
  function evaluate(): readonly BehaviorGroupOutput[] {
    return Object.freeze(groups.map(group => Object.freeze({ id: group.id, influenceMaskAssetId: group.influenceMaskAssetId,
      effects: Object.freeze(group.behaviors.map(behavior => {
        const phase = (behavior.params.phase + 2 * Math.PI * behavior.params.frequencyHz * (tick / 60)) % (2 * Math.PI);
        const common = { id: behavior.id, influenceMaskAssetId: behavior.influenceMaskAssetId };
        switch (behavior.kind) {
          case "translate": return Object.freeze({ ...common, kind: "translate" as const,
            x: behavior.params.x * Math.sin(phase), y: behavior.params.y * Math.sin(phase) });
          case "wave": return Object.freeze({ ...common, kind: "wave" as const, amplitude: behavior.params.amplitude,
            wavelength: behavior.params.wavelength, axis: behavior.params.axis, phase });
          case "pulse": return Object.freeze({ ...common, kind: "pulse" as const, gain: 1 + behavior.params.amount * Math.sin(phase) });
        }
      })),
    })));
  }
  let outputs = evaluate();
  return {
    step(dt: number) {
      if (dt !== 1 / 60) throw new Error("Behaviors require a fixed 1/60-second step");
      if (tick === Number.MAX_SAFE_INTEGER) throw new Error("Behavior tick exhausted");
      tick++; outputs = evaluate();
    },
    getSnapshot: () => outputs,
    reset() { tick = 0; outputs = evaluate(); },
  };
}
