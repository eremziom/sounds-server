import { validateBehaviorControl, type BehaviorKind } from "../artwork/pilot-controls.ts";
import { composeConstraints, type MotionConstraints } from "./motion-constraints.ts";
import { createBindingEvaluator, type NormalizedSignals } from "../modulation/bindings.ts";
import { resolveBehaviors, type BehaviorDescriptor } from "./behavior-contract.ts";
import {createAttackColorWave,type AttackColorWave,type ColorWaveEvent} from "./attack-color-wave.ts";

export interface BehaviorRegion {
  readonly id: string;
  readonly influenceMaskAssetId: string;
  readonly constraints?: MotionConstraints;
  readonly behaviors: readonly BehaviorDescriptor[];
}

export interface BehaviorGroup {
  readonly id: string;
  readonly influenceMaskAssetId?: string;
  readonly constraints?: MotionConstraints;
  readonly behaviors: readonly BehaviorDescriptor[];
}

export type BehaviorOutput = Readonly<{ id: string; influenceMaskAssetId?: string } & (
  { kind: "translate"; x: number; y: number } |
  { kind: "wave"; amplitude: number; wavelength: number; axis: "x" | "y"; phase: number } |
  { kind: "pulse"; gain: number } |
  { kind: "rotate"; radians: number; pivotX: number; pivotY: number } |
  { kind: "scale"; x: number; y: number; pivotX: number; pivotY: number } |
  { kind: "parallax"; amount: number; depthAssetId: string; referenceDepth: number } |
  { kind: "bend"; amount: number; pivotX: number; pivotY: number; axis: "x" | "y" } |
  { kind: "displace" | "flow"; amplitude: number; fieldAssetId: string } |
  { kind: "opacity"; opacity: number } |
  { kind: "colorShift"; hue: number; saturation: number; lightness: number; delayMapAssetId?: string; travelPhase?: number; travelRadians?: number; attackWave?:AttackColorWave; waveStrength?:number; waves?:readonly ColorWaveEvent[] } |
  { kind: "glow"; amount: number; threshold: number; color?: readonly [number,number,number] }
)>;

export interface BehaviorGroupOutput {
  readonly maxDisplacement?: number;
  readonly id: string;
  readonly influenceMaskAssetId?: string;
  readonly effects: readonly BehaviorOutput[];
}

export function behaviorGroups(artwork: readonly BehaviorDescriptor[], layer: {
  readonly constraints?: MotionConstraints;
  readonly behaviors: readonly BehaviorDescriptor[]; readonly regions: readonly BehaviorRegion[];
}, artworkConstraints?: MotionConstraints): readonly BehaviorGroup[] {
  const inherited = resolveBehaviors(artwork, layer.behaviors);
  return Object.freeze([
    Object.freeze({ id: "layer", behaviors: inherited, constraints: composeConstraints(artworkConstraints, layer.constraints) }),
    ...layer.regions.map(region => Object.freeze({ id: region.id, influenceMaskAssetId: region.influenceMaskAssetId,
      behaviors: resolveBehaviors(inherited, region.behaviors), constraints: composeConstraints(artworkConstraints, layer.constraints, region.constraints) })),
  ]);
}

/** Each instance owns its phase counter and immutable outputs. Groups resolve
 * artwork -> layer -> region. At a pixel a region mask blends from the inherited
 * result to that region's resolved result, in manifest region order. */
export function createBehaviorEvaluator(groups: readonly BehaviorGroup[]) {
  let tick = 0;
  let strength = 1;
  const controls = new Map<BehaviorKind,number>();
  const bindings = groups.map(group => group.behaviors.map(b => createBindingEvaluator(b.modulation ?? [])));
  const waves=groups.map(group=>group.behaviors.map(b=>b.kind==="colorShift"&&b.params.attackWave?createAttackColorWave(b.params.attackWave):null));
  const bindingGains = () => bindings.map(group => group.map(binding => binding.getSnapshot()));
  let gains = bindingGains();
  function evaluate(): readonly BehaviorGroupOutput[] {
    return Object.freeze(groups.map((group,g) => Object.freeze({ id: group.id, influenceMaskAssetId: group.influenceMaskAssetId, maxDisplacement:group.constraints?.maxDisplacement ?? 512,
      effects: Object.freeze(group.behaviors.map((behavior,e) => {
        const phase = (behavior.params.phase + 2 * Math.PI * behavior.params.frequencyHz * (tick / 60)) % (2 * Math.PI);
        const amount = behavior.enabled === false ? 0 : strength*(controls.get(behavior.kind) ?? 1)*(behavior.weight ?? 1)*(group.constraints?.softStrength ?? 1)*gains[g][e];
        const oscillation = Math.sin(phase)*amount;
        const common = { id: behavior.id, influenceMaskAssetId: behavior.influenceMaskAssetId };
        switch (behavior.kind) {
          case "translate": return Object.freeze({ ...common, kind: "translate" as const,
            x: behavior.params.x * oscillation, y: behavior.params.y * oscillation });
          case "wave": return Object.freeze({ ...common, kind: "wave" as const, amplitude: behavior.params.amplitude * amount,
            wavelength: behavior.params.wavelength, axis: behavior.params.axis, phase });
          case "rotate": return Object.freeze({ ...common, kind: "rotate" as const, radians: behavior.params.radians*oscillation, pivotX: behavior.params.pivotX, pivotY: behavior.params.pivotY });
          case "scale": return Object.freeze({ ...common, kind: "scale" as const, x: 1+behavior.params.x*oscillation, y: 1+behavior.params.y*oscillation, pivotX: behavior.params.pivotX, pivotY: behavior.params.pivotY });
          case "parallax": return Object.freeze({ ...common, kind: "parallax" as const, amount: behavior.params.amount*amount, depthAssetId: behavior.params.depthAssetId, referenceDepth: behavior.params.referenceDepth });
          case "bend": return Object.freeze({ ...common, kind: "bend" as const, amount: behavior.params.amount*oscillation, pivotX: behavior.params.pivotX, pivotY: behavior.params.pivotY, axis: behavior.params.axis });
          case "displace": case "flow": return Object.freeze({ ...common, kind: behavior.kind, amplitude: behavior.params.amplitude*oscillation, fieldAssetId: behavior.params.fieldAssetId });
          case "opacity": return Object.freeze({ ...common, kind: "opacity" as const, opacity: 1+(behavior.params.base-1)*amount+behavior.params.amount*oscillation });
          case "colorShift": {
            if(behavior.params.attackWave)return Object.freeze({...common,kind:"colorShift" as const,hue:0,saturation:1,lightness:0,attackWave:behavior.params.attackWave,waveStrength:amount,waves:waves[g][e]!.getSnapshot()});
            if (behavior.params.delayMapAssetId) {
              const delay=behavior.params.travelSeconds!,time=tick/60,period=1/behavior.params.frequencyHz;
              // Preserve the initial source color at every spatial delay, then
              // wrap only after the last delayed point has started. This bounds
              // GPU phase precision without restarting downstream pixels.
              const travelPhase=behavior.params.phase+2*Math.PI*behavior.params.frequencyHz*(time<=delay?time:delay+(time-delay)%period);
              return Object.freeze({...common,kind:"colorShift" as const,hue:behavior.params.hue*amount,saturation:1+behavior.params.saturation*amount,lightness:behavior.params.lightness*amount,
                delayMapAssetId:behavior.params.delayMapAssetId,travelPhase,travelRadians:2*Math.PI*behavior.params.frequencyHz*delay});
            }
            return Object.freeze({ ...common, kind: "colorShift" as const, hue: behavior.params.hue*oscillation, saturation: 1+behavior.params.saturation*oscillation, lightness: behavior.params.lightness*oscillation });
          }
          case "glow": {
            // An explicit short pulse has a compact support: exact darkness
            // outside its authored window, independent of the period length.
            const cycle=((phase % (2*Math.PI))+2*Math.PI)%(2*Math.PI);
            const u=behavior.params.pulseSeconds === undefined ? 0 : cycle/(2*Math.PI*behavior.params.frequencyHz*behavior.params.pulseSeconds);
            const envelope=behavior.params.pulseSeconds === undefined ? Math.pow(0.5+0.5*Math.sin(phase),behavior.params.sharpness ?? 1) : u<1 ? Math.sin(Math.PI*u)**2 : 0;
            return Object.freeze({ ...common, kind: "glow" as const, amount: behavior.params.amount*(behavior.params.intensity ?? 1)*envelope*amount, threshold: behavior.params.threshold,
            ...(behavior.params.color ? {color:behavior.params.color} : {}) });
          }
          case "pulse": return Object.freeze({ ...common, kind: "pulse" as const, gain: 1 + behavior.params.amount * oscillation });
        }
      })),
    })));
  }
  let outputs = evaluate();
  return {
    step(dt: number, nextStrength = 1, signals?: NormalizedSignals) {
      if (dt !== 1 / 60) throw new Error("Behaviors require a fixed 1/60-second step");
      if (!Number.isFinite(nextStrength) || nextStrength < 0 || nextStrength > 1) throw new Error("Invalid behavior strength");
      if (tick === Number.MAX_SAFE_INTEGER) throw new Error("Behavior tick exhausted");
      gains = groups.map((group,g) => group.behaviors.map((_,e) => bindings[g][e].step(signals,dt)));
      for(const group of waves)for(const wave of group)wave?.step(signals);
      tick++; strength = nextStrength; outputs = evaluate();
    },
    setBehaviorStrength(kind: BehaviorKind, value: number) { validateBehaviorControl(kind,value); controls.set(kind,value); outputs=evaluate(); },
    getSnapshot: () => outputs,
    reset() { tick = 0; strength = 1; for (const group of bindings) for (const b of group) b.reset();for(const group of waves)for(const wave of group)wave?.reset(); gains = bindingGains(); outputs = evaluate(); },
  };
}
