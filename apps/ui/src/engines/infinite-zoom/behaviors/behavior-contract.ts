interface CommonBehavior {
  readonly id: string;
  readonly order: number;
  readonly influenceMaskAssetId?: string;
}

interface Periodic { readonly frequencyHz: number; readonly phase: number }
export type BehaviorDescriptor = CommonBehavior & (
  { readonly kind: "translate"; readonly params: Periodic & { readonly x: number; readonly y: number } } |
  { readonly kind: "wave"; readonly params: Periodic & { readonly amplitude: number; readonly wavelength: number; readonly axis: "x" | "y" } } |
  { readonly kind: "pulse"; readonly params: Periodic & { readonly amount: number } }
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
    if (Object.keys(data).some(key => !["id", "kind", "order", "params", "influenceMaskAssetId"].includes(key))) throw new Error("Unsupported behavior field");
    if (typeof data.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(data.id) || ids.has(data.id)) throw new Error("Invalid/duplicate behavior id");
    ids.add(data.id);
    if (typeof data.order !== "number" || !Number.isSafeInteger(data.order)) throw new Error("Invalid behavior order");
    if (data.influenceMaskAssetId !== undefined && (typeof data.influenceMaskAssetId !== "string" || !data.influenceMaskAssetId)) throw new Error("Invalid influence mask reference");
    const common = { id: data.id, order: data.order,
      ...(data.influenceMaskAssetId === undefined ? {} : { influenceMaskAssetId: data.influenceMaskAssetId as string }) };
    if (!data.params || typeof data.params !== "object" || Array.isArray(data.params)) throw new Error("Invalid behavior params");
    const params = data.params as Record<string, unknown>;
    const periodic = { frequencyHz: finite(params.frequencyHz, 0, 10), phase: finite(params.phase, -Math.PI * 2, Math.PI * 2) };
    let behavior: BehaviorDescriptor;
    let keys: string[];
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

export function validateComposition(behaviors: readonly BehaviorDescriptor[]) {
  let displacement = 0, waveSlope = 0, intensity = 1;
  for (const behavior of behaviors) {
    if (behavior.kind === "translate") displacement += Math.hypot(behavior.params.x, behavior.params.y);
    if (behavior.kind === "wave") {
      displacement += Math.abs(behavior.params.amplitude);
      waveSlope += Math.abs(behavior.params.amplitude) * 2 * Math.PI / behavior.params.wavelength;
    }
    if (behavior.kind === "pulse") intensity *= 1 + behavior.params.amount;
  }
  if (displacement > 512 || waveSlope > 0.5 || intensity > 4) throw new Error("Composed behavior hard constraint exceeded");
}
