import type { BehaviorGroupOutput, BehaviorOutput } from "./behavior-evaluator.ts";

export function behaviorUniform(effect: BehaviorOutput): number[] {
  switch (effect.kind) {
    case "translate": return [effect.x, effect.y, 0, 0];
    case "wave": return [effect.amplitude, effect.wavelength, effect.phase, effect.axis === "x" ? 0 : 1];
    case "pulse": return [effect.gain, 0, 0, 0];
  }
}

/** Generate operators in explicit manifest order, inverse spatial operations in
 * reverse order for texture sampling. Influence masks never modify alpha. */
export function buildBehaviorShader(groups: readonly BehaviorGroupOutput[]) {
  const declarations: string[] = [], statements: string[] = [];
  const masks: { name: string; assetId: string }[] = [];
  const effects: { name: string; group: number; effect: number }[] = [];
  function weight(assetId: string | undefined, name: string): string {
    if (!assetId) return "1.0";
    declarations.push(`uniform sampler2D ${name};`);
    masks.push({ name, assetId });
    return `texture2D(${name}, vUv).r`;
  }
  for (const [g, group] of groups.entries()) {
    statements.push(`vec2 uv${g} = vUv; float gain${g} = 1.0;`);
    for (let e = group.effects.length - 1; e >= 0; e--) {
      const effect = group.effects[e], name = `effect_${g}_${e}`;
      effects.push({ name, group: g, effect: e });
      declarations.push(`uniform vec4 ${name};`);
      const w = weight(effect.influenceMaskAssetId, `influence_${g}_${e}`);
      if (effect.kind === "translate") statements.push(`uv${g} -= vec2(${name}.x / 3840.0, -${name}.y / 2160.0) * ${w};`);
      if (effect.kind === "wave") {
        const alongX = effect.axis === "x";
        const position = alongX ? `(1.0 - uv${g}.y) * 2160.0` : `uv${g}.x * 3840.0`;
        statements.push(`uv${g}.${alongX ? "x" : "y"} ${alongX ? "-=" : "+="} ${name}.x / ${alongX ? "3840.0" : "2160.0"}
          * sin(${position} * 6.28318530718 / ${name}.y + ${name}.z) * ${w};`);
      }
    }
    // Pulse is an intensity operation, before opacity, in forward order.
    for (const [e, effect] of group.effects.entries()) if (effect.kind === "pulse") {
      statements.push(`gain${g} *= mix(1.0, effect_${g}_${e}.x, ${effect.influenceMaskAssetId ? `texture2D(influence_${g}_${e}, vUv).r` : "1.0"});`);
    }
    if (g === 0) statements.push("vec2 sampleUv = uv0; float pulseGain = gain0;");
    else {
      const w = weight(group.influenceMaskAssetId, `region_${g}`);
      statements.push(`sampleUv = mix(sampleUv, uv${g}, ${w}); pulseGain = mix(pulseGain, gain${g}, ${w});`);
    }
  }
  return { declarations: declarations.join("\n"), body: statements.join("\n"), masks, effects };
}
