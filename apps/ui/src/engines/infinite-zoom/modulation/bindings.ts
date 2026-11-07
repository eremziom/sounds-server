export type ModulationSignal = "bass" | "mid" | "high" | "energy";
export type NormalizedSignals = Readonly<Partial<Record<ModulationSignal, number>>>;
export interface ModulationBinding {
  readonly id: string; readonly signal: ModulationSignal; readonly operation: "multiply" | "add" | "replace";
  readonly priority: number; readonly min: number; readonly max: number;
  readonly attackSeconds: number; readonly releaseSeconds: number;
}

export function parseBindings(input: unknown): readonly ModulationBinding[] {
  if (input === undefined) return Object.freeze([]);
  if (!Array.isArray(input) || input.length > 16) throw new Error("Invalid modulation bindings");
  const ids = new Set<string>();
  const bindings = input.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid modulation binding");
    const b = value as Record<string, unknown>;
    if (Object.keys(b).some(key => !["id", "signal", "operation", "priority", "min", "max", "attackSeconds", "releaseSeconds"].includes(key))) throw new Error("Unsupported modulation field");
    if (typeof b.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(b.id) || ids.has(b.id)) throw new Error("Invalid modulation id");
    ids.add(b.id);
    if (!["bass", "mid", "high", "energy"].includes(String(b.signal)) || !["multiply", "add", "replace"].includes(String(b.operation))) throw new Error("Invalid modulation operation/signal");
    for (const key of ["priority", "min", "max", "attackSeconds", "releaseSeconds"]) if (typeof b[key] !== "number" || !Number.isFinite(b[key])) throw new Error("Invalid modulation parameter");
    if (!Number.isSafeInteger(b.priority) || (b.min as number) < -1 || (b.max as number) > 1 || (b.min as number) > (b.max as number) || (b.attackSeconds as number) < 1/60 || (b.releaseSeconds as number) < 1/60 || (b.attackSeconds as number) > 10 || (b.releaseSeconds as number) > 10) throw new Error("Invalid modulation range");
    return Object.freeze({ ...b }) as unknown as ModulationBinding;
  });
  return Object.freeze(bindings.sort((a,b) => a.priority-b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

/** Each evaluator owns its smoothing state. Missing input tends to neutral. */
export function createBindingEvaluator(bindings: readonly ModulationBinding[]) {
  const values = bindings.map(b => b.operation === "add" ? 0 : 1);
  return {
    step(signals: NormalizedSignals | undefined, dt: number) {
      if (dt !== 1/60) throw new Error("Modulation bindings require a fixed step");
      let result = 1;
      for (const [i,b] of bindings.entries()) {
        const input = signals?.[b.signal];
        const neutral = b.operation === "add" ? 0 : 1;
        const target = input === undefined || !Number.isFinite(input) ? neutral : b.min + (b.max-b.min)*Math.max(0,Math.min(1,input));
        const current = values[i];
        values[i] += (target-current)*(1-Math.exp(-dt/(target > current ? b.attackSeconds : b.releaseSeconds)));
        if (b.operation === "multiply") result *= values[i];
        else if (b.operation === "add") result += values[i];
        else result = values[i];
      }
      return Math.max(0, Math.min(1, result));
    },
    reset() { for (const [i,b] of bindings.entries()) values[i] = b.operation === "add" ? 0 : 1; },
  };
}
