import { composeConstraints, type MotionConstraints } from "./motion-constraints.ts";
import { parseBindings, type ModulationBinding } from "../modulation/bindings.ts";
import type {AttackColorWave} from "./attack-color-wave.ts";

interface CommonBehavior {
  readonly id: string;
  readonly order: number;
  readonly enabled?: boolean;
  readonly weight?: number;
  readonly modulation?: readonly ModulationBinding[];
  readonly influenceMaskAssetId?: string;
}

interface Periodic { readonly frequencyHz: number; readonly phase: number }
export type BehaviorDescriptor = CommonBehavior & (
  { readonly kind: "translate"; readonly params: Periodic & { readonly x: number; readonly y: number } } |
  { readonly kind: "wave"; readonly params: Periodic & { readonly amplitude: number; readonly wavelength: number; readonly axis: "x" | "y" } } |
  { readonly kind: "pulse"; readonly params: Periodic & { readonly amount: number } } |
  { readonly kind: "rotate"; readonly params: Periodic & { readonly radians: number; readonly pivotX: number; readonly pivotY: number } } |
  { readonly kind: "scale"; readonly params: Periodic & { readonly x: number; readonly y: number; readonly pivotX: number; readonly pivotY: number } } |
  { readonly kind: "parallax"; readonly params: Periodic & { readonly amount: number; readonly depthAssetId: string; readonly referenceDepth: number } } |
  { readonly kind: "bend"; readonly params: Periodic & { readonly amount: number; readonly pivotX: number; readonly pivotY: number; readonly axis: "x" | "y" } } |
  { readonly kind: "displace"; readonly params: Periodic & { readonly amplitude: number; readonly fieldAssetId: string } } |
  { readonly kind: "flow"; readonly params: Periodic & { readonly amplitude: number; readonly fieldAssetId: string } } |
  { readonly kind: "opacity"; readonly params: Periodic & { readonly base: number; readonly amount: number } } |
  { readonly kind: "colorShift"; readonly params: Periodic & { readonly hue: number; readonly saturation: number; readonly lightness: number; readonly delayMapAssetId?: string; readonly travelSeconds?: number; readonly attackWave?:AttackColorWave } } |
  { readonly kind: "glow"; readonly params: Periodic & { readonly amount: number; readonly threshold: number; readonly sharpness?: number; readonly intensity?: number; readonly color?: readonly [number,number,number] } }
);

function finite(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Invalid behavior parameter");
  return value;
}

export function parseBehaviors(input: unknown): readonly BehaviorDescriptor[] {
  if (input === undefined) return Object.freeze([]);
  if (!Array.isArray(input)) throw new Error("Behaviors must be an array");
  const ids = new Set<string>();
  const parsed = input.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid behavior");
    const data = value as Record<string, unknown>;
    if (Object.keys(data).some(key => !["id", "kind", "order", "params", "influenceMaskAssetId", "enabled", "weight", "modulation"].includes(key))) throw new Error("Unsupported behavior field");
    if (typeof data.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(data.id) || ids.has(data.id)) throw new Error("Invalid/duplicate behavior id");
    ids.add(data.id);
    if (typeof data.order !== "number" || !Number.isSafeInteger(data.order)) throw new Error("Invalid behavior order");
    if (data.influenceMaskAssetId !== undefined && (typeof data.influenceMaskAssetId !== "string" || !data.influenceMaskAssetId)) throw new Error("Invalid influence mask reference");
    if (data.enabled !== undefined && typeof data.enabled !== "boolean") throw new Error("Invalid behavior enabled flag");
    const common = { id: data.id, order: data.order,
      ...(data.enabled === undefined ? {} : { enabled: data.enabled as boolean }),
      ...(data.weight === undefined ? {} : { weight: finite(data.weight, 0, 1) }),
      ...(data.modulation === undefined ? {} : { modulation: parseBindings(data.modulation) }),
      ...(data.influenceMaskAssetId === undefined ? {} : { influenceMaskAssetId: data.influenceMaskAssetId as string }) };
    if (!data.params || typeof data.params !== "object" || Array.isArray(data.params)) throw new Error("Invalid behavior params");
    const params = data.params as Record<string, unknown>;
    const periodic = { frequencyHz: finite(params.frequencyHz, 0, 10), phase: finite(params.phase, -Math.PI * 2, Math.PI * 2) };
    let behavior: BehaviorDescriptor;
    let keys: string[];
    const pivot = () => ({ pivotX: finite(params.pivotX, 0, 3840), pivotY: finite(params.pivotY, 0, 2160) });
    const reference = (value: unknown) => {
      if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) throw new Error("Invalid field asset reference");
      return value;
    };
    switch (data.kind) {
      case "translate":
        keys = ["frequencyHz", "phase", "x", "y"];
        behavior = { ...common, kind: "translate", params: { ...periodic, x: finite(params.x, -512, 512), y: finite(params.y, -512, 512) } }; break;
      case "wave":
        keys = ["frequencyHz", "phase", "amplitude", "wavelength", "axis"];
        if (params.axis !== "x" && params.axis !== "y") throw new Error("Invalid wave axis");
        behavior = { ...common, kind: "wave", params: { ...periodic, amplitude: finite(params.amplitude, -256, 256),
          wavelength: finite(params.wavelength, 16, 7680), axis: params.axis } }; break;
      case "pulse":
        keys = ["frequencyHz", "phase", "amount"];
        behavior = { ...common, kind: "pulse", params: { ...periodic, amount: finite(params.amount, 0, 1) } }; break;
      case "rotate":
        keys = ["frequencyHz", "phase", "radians", "pivotX", "pivotY"];
        behavior = { ...common, kind: "rotate", params: { ...periodic, ...pivot(), radians: finite(params.radians, -0.2, 0.2) } }; break;
      case "scale":
        keys = ["frequencyHz", "phase", "x", "y", "pivotX", "pivotY"];
        behavior = { ...common, kind: "scale", params: { ...periodic, ...pivot(), x: finite(params.x, -0.2, 0.2), y: finite(params.y, -0.2, 0.2) } }; break;
      case "parallax":
        keys = ["frequencyHz", "phase", "amount", "depthAssetId", "referenceDepth"];
        behavior = { ...common, kind: "parallax", params: { ...periodic, amount: finite(params.amount, 0, 256), depthAssetId: reference(params.depthAssetId), referenceDepth: finite(params.referenceDepth, 0, 1) } }; break;
      case "bend":
        keys = ["frequencyHz", "phase", "amount", "pivotX", "pivotY", "axis"];
        if (params.axis !== "x" && params.axis !== "y") throw new Error("Invalid bend axis");
        behavior = { ...common, kind: "bend", params: { ...periodic, ...pivot(), amount: finite(params.amount, -256, 256), axis: params.axis } }; break;
      case "displace": case "flow":
        keys = ["frequencyHz", "phase", "amplitude", "fieldAssetId"];
        behavior = { ...common, kind: data.kind, params: { ...periodic, amplitude: finite(params.amplitude, 0, 256), fieldAssetId: reference(params.fieldAssetId) } }; break;
      case "opacity":
        keys = ["frequencyHz", "phase", "base", "amount"];
        behavior = { ...common, kind: "opacity", params: { ...periodic, base: finite(params.base, 0, 1), amount: finite(params.amount, 0, 1) } };
        if (behavior.params.base-behavior.params.amount < 0 || behavior.params.base+behavior.params.amount > 1) throw new Error("Opacity envelope exceeds 0..1");
        break;
      case "colorShift":
        keys = ["frequencyHz", "phase", "hue", "saturation", "lightness", "delayMapAssetId", "travelSeconds", "attackWave"];
        let attackWave:AttackColorWave|undefined;
        if(params.attackWave!==undefined){
          const wave=params.attackWave as Record<string,unknown>;
          if(!wave||typeof wave!=="object"||Array.isArray(wave)||Object.keys(wave).some(k=>!["travelSeconds","pulseSeconds","startY","endY","palette","baseIntensity"].includes(k)))throw new Error("Invalid attack color wave");
          if(periodic.frequencyHz!==0||periodic.phase!==0||params.delayMapAssetId!==undefined||params.travelSeconds!==undefined||data.modulation!==undefined)throw new Error("Attack waves require independent event timing, not periodic/binding timing");
          if(params.hue!==0||params.saturation!==0||params.lightness!==0)throw new Error("Attack waves use their palette instead of hue/saturation/lightness offsets");
          const startY=finite(wave.startY,0,1),endY=finite(wave.endY,0,1);
          if(startY===endY||!Array.isArray(wave.palette)||wave.palette.length<2||wave.palette.length>12)throw new Error("Invalid wave range or palette");
          const palette=Object.freeze(wave.palette.map(c=>{if(!Array.isArray(c)||c.length!==3)throw new Error("Invalid wave color");return Object.freeze(c.map(v=>finite(v,0,1))) as readonly [number,number,number];}));
          attackWave=Object.freeze({travelSeconds:finite(wave.travelSeconds,1/60,1),pulseSeconds:finite(wave.pulseSeconds,1/60,.24),startY,endY,baseIntensity:wave.baseIntensity===undefined?1:finite(wave.baseIntensity,0,1),palette});
        }
        if ((params.delayMapAssetId === undefined) !== (params.travelSeconds === undefined)) throw new Error("Color travel requires both a delay map and travelSeconds");
        if (params.delayMapAssetId !== undefined && periodic.frequencyHz === 0) throw new Error("Color travel requires a positive frequency");
        behavior = { ...common, kind: "colorShift", params: { ...periodic, hue: finite(params.hue, -Math.PI, Math.PI), saturation: finite(params.saturation, -1, 1), lightness: finite(params.lightness, -0.5, 0.5),
          ...(attackWave?{attackWave}:{}),...(params.delayMapAssetId === undefined ? {} : {delayMapAssetId:reference(params.delayMapAssetId),travelSeconds:finite(params.travelSeconds,1/60,60)}) } }; break;
      case "glow":
        keys = ["frequencyHz", "phase", "amount", "threshold", "sharpness", "intensity", "color"];
        if(params.color!==undefined&&(!Array.isArray(params.color)||params.color.length!==3))throw new Error("Invalid glow color");
        behavior = { ...common, kind: "glow", params: { ...periodic, amount: finite(params.amount, 0, 1), threshold: finite(params.threshold, 0, 1),
          ...(params.sharpness === undefined ? {} : {sharpness:finite(params.sharpness,1,16)}),
          ...(params.intensity === undefined ? {} : {intensity:finite(params.intensity,1,3)}),
          ...(params.color === undefined ? {} : {color:Object.freeze((params.color as unknown[]).map(c=>finite(c,0,1))) as readonly [number,number,number]}),
        } }; break;
      default: throw new Error(`Unsupported behavior kind: ${data.kind}`);
    }
    if (Object.keys(params).some(key => !keys.includes(key))) throw new Error("Unsupported behavior parameter");
    Object.freeze(behavior.params);
    return Object.freeze(behavior);
  });
  return Object.freeze(parsed);
}

/** Same IDs override inherited definitions. Explicit order then lexical ID
 * makes evaluation independent of map/object iteration or the user's locale. */
export function resolveBehaviors(...scopes: readonly (readonly BehaviorDescriptor[])[]): readonly BehaviorDescriptor[] {
  const resolved = new Map<string, BehaviorDescriptor>();
  for (const scope of scopes) for (const behavior of scope) resolved.set(behavior.id, behavior);
  return Object.freeze([...resolved.values()].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

/** Conservative envelopes combine before runtime. Masks cannot increase safety budgets. */
export function behaviorEnvelope(behavior: BehaviorDescriptor) {
  if (behavior.enabled === false) return { displacement: 0, slope: 0, intensity: 1 };
  const weight = behavior.weight ?? 1;
  let displacement = 0, slope = 0, intensity = 1;
  switch (behavior.kind) {
    case "translate": displacement = Math.hypot(behavior.params.x, behavior.params.y); break;
    case "wave": displacement = Math.abs(behavior.params.amplitude); slope = displacement*2*Math.PI/behavior.params.wavelength; break;
    case "rotate": displacement = Math.hypot(3840,2160)*Math.abs(behavior.params.radians); break;
    case "scale": displacement = Math.hypot(3840*behavior.params.x,2160*behavior.params.y)/0.8; break;
    case "parallax": displacement = behavior.params.amount*Math.SQRT2; break;
    case "bend": displacement = Math.abs(behavior.params.amount); slope = 2*displacement/2160; break;
    case "displace": case "flow": displacement = behavior.params.amplitude*Math.SQRT2; break;
    case "pulse": intensity = 1+behavior.params.amount*weight; break;
    case "glow": intensity = 1+behavior.params.amount*(behavior.params.intensity ?? 1)*weight; break;
  }
  return { displacement: displacement*weight, slope: slope*weight, intensity };
}

export function validateComposition(behaviors: readonly BehaviorDescriptor[], constraints: MotionConstraints = composeConstraints()) {
  let displacement = 0, slope = 0, intensity = 1;
  for (const behavior of behaviors) {
    const envelope = behaviorEnvelope(behavior);
    displacement += envelope.displacement; slope += envelope.slope; intensity *= envelope.intensity;
  }
  if (displacement > constraints.maxDisplacement || slope > constraints.maxSlope || intensity > constraints.maxIntensity) throw new Error("Composed behavior hard constraint exceeded");
}
