export interface MotionConstraints {
  readonly maxDisplacement: number;
  readonly maxSlope: number;
  readonly maxIntensity: number;
  readonly softStrength: number;
}

export const DEFAULT_CONSTRAINTS: MotionConstraints = Object.freeze({
  maxDisplacement: 512, maxSlope: 0.5, maxIntensity: 4, softStrength: 1,
});

/** Hard budgets intersect across scopes. Soft preferences can only attenuate. */
export function parseMotionConstraints(input: unknown): MotionConstraints | undefined {
  if (input === undefined) return;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid motion constraints");
  const data = input as Record<string, unknown>;
  const result = { ...DEFAULT_CONSTRAINTS };
  for (const key of Object.keys(data)) {
    if (!Object.hasOwn(result, key)) throw new Error("Unsupported motion constraint");
    const name = key as keyof MotionConstraints, value = data[name];
    const minimum = name === "maxIntensity" ? 1 : 0;
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > DEFAULT_CONSTRAINTS[name]) throw new Error("Invalid motion constraint limit");
    result[name] = value;
  }
  return Object.freeze(result);
}

export function composeConstraints(...scopes: readonly (MotionConstraints | undefined)[]): MotionConstraints {
  const result = { ...DEFAULT_CONSTRAINTS };
  for (const scope of scopes) if (scope) for (const key of Object.keys(result) as (keyof MotionConstraints)[]) result[key] = Math.min(result[key], scope[key]);
  return Object.freeze(result);
}
