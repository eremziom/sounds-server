import type { BehaviorGroupOutput, BehaviorOutput } from "./behavior-evaluator.ts";
import {MAX_ATTACK_COLOR_WAVES} from "./attack-color-wave.ts";

export function behaviorUniform(effect: BehaviorOutput): number[] {
  switch (effect.kind) {
    case "translate": return [effect.x, effect.y, 0, 0];
    case "wave": return [effect.amplitude, effect.wavelength, effect.phase, effect.axis === "x" ? 0 : 1];
    case "pulse": return [effect.gain, 0, 0, 0];
    case "rotate": return [effect.radians, effect.pivotX, effect.pivotY, 0];
    case "scale": return [effect.x, effect.y, effect.pivotX, effect.pivotY];
    case "parallax": return [effect.amount, effect.referenceDepth, 0, 0];
    case "bend": return [effect.amount, effect.pivotX, effect.pivotY, effect.axis === "x" ? 0 : 1];
    case "displace": case "flow": return [effect.amplitude, 0, 0, 0];
    case "opacity": return [effect.opacity, 0, 0, 0];
    case "colorShift": {
      if(effect.attackWave){
        const result=[effect.waveStrength??0,effect.attackWave.travelSeconds,effect.attackWave.pulseSeconds,0];
        for(let i=0;i<MAX_ATTACK_COLOR_WAVES;i++){const wave=effect.waves?.[i];result.push(wave?.ageSeconds??-1,...(wave?.color??[0,0,0]));}
        return result;
      }
      return [effect.hue, effect.saturation, effect.lightness, effect.travelPhase ?? 0];
    }
    case "glow": return [effect.amount, effect.threshold, 0, 0];
  }
}

/** Generate operators in explicit manifest order, inverse spatial operations in
 * reverse order for texture sampling. Influence masks never modify alpha. */
export function buildBehaviorShader(groups: readonly BehaviorGroupOutput[]) {
  const declarations: string[] = ["uniform vec2 behaviorCameraOffset;"], statements: string[] = [], colors: string[] = [], glows: string[] = [];
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
    colors.push(`vec3 shifted${g} = color.rgb; float alpha${g} = 1.0;`);
    for (let e = group.effects.length - 1; e >= 0; e--) {
      const effect = group.effects[e], name = `effect_${g}_${e}`;
      effects.push({ name, group: g, effect: e });
      declarations.push(`uniform vec4 ${name}${effect.kind==="colorShift"&&effect.attackWave?`[${MAX_ATTACK_COLOR_WAVES+1}]`:""};`);
      const w = weight(effect.influenceMaskAssetId, `influence_${g}_${e}`);
      if (effect.kind === "rotate" || effect.kind === "scale") {
        const pivot = effect.kind === "rotate" ? `${name}.yz` : `${name}.zw`;
        statements.push(`vec2 point_${g}_${e} = vec2(uv${g}.x*3840.0,(1.0-uv${g}.y)*2160.0) - ${pivot};`);
        if (effect.kind === "rotate") statements.push(`float angle_${g}_${e} = -${name}.x*${w};
          point_${g}_${e} = mat2(cos(angle_${g}_${e}),sin(angle_${g}_${e}),-sin(angle_${g}_${e}),cos(angle_${g}_${e}))*point_${g}_${e};`);
        else statements.push(`point_${g}_${e} /= mix(vec2(1.0),${name}.xy,${w});`);
        statements.push(`point_${g}_${e} += ${pivot}; uv${g} = vec2(point_${g}_${e}.x/3840.0,1.0-point_${g}_${e}.y/2160.0);`);
      }
      if (effect.kind === "bend") {
        const alongX = effect.axis === "x";
        const distance = alongX ? `(1.0-uv${g}.y)*2160.0-${name}.z` : `uv${g}.x*3840.0-${name}.y`;
        statements.push(`uv${g}.${alongX ? "x" : "y"} ${alongX ? "-=" : "+="} ${name}.x/${alongX ? "3840.0" : "2160.0"}*pow(clamp(abs(${distance})/${alongX ? "2160.0" : "3840.0"},0.0,1.0),2.0)*${w};`);
      }
      if (effect.kind === "parallax" || effect.kind === "displace" || effect.kind === "flow") {
        const sampler = `field_${g}_${e}`;
        declarations.push(`uniform sampler2D ${sampler};`);
        masks.push({name:sampler,assetId:effect.kind === "parallax" ? effect.depthAssetId : effect.fieldAssetId});
        const offset = effect.kind === "parallax" ? `clamp(behaviorCameraOffset/vec2(1920.0,1080.0),-1.0,1.0)*(texture2D(${sampler},vUv).r-${name}.y)` : `(texture2D(${sampler},${effect.kind === "flow" ? `uv${g}` : "vUv"}).rg*2.0-1.0)`;
        statements.push(`uv${g} -= vec2(1.0/3840.0,-1.0/2160.0)*${name}.x*${offset}*${w};`);
      }
      if (effect.kind === "translate") statements.push(`uv${g} -= vec2(${name}.x / 3840.0, -${name}.y / 2160.0) * ${w};`);
      if (effect.kind === "wave") {
        const alongX = effect.axis === "x";
        const position = alongX ? `(1.0 - uv${g}.y) * 2160.0` : `uv${g}.x * 3840.0`;
        statements.push(`uv${g}.${alongX ? "x" : "y"} ${alongX ? "-=" : "+="} ${name}.x / ${alongX ? "3840.0" : "2160.0"}
          * sin(${position} * 6.28318530718 / ${name}.y + ${name}.z) * ${w};`);
      }
    }
    statements.push(`vec2 delta${g}=(uv${g}-vUv)*vec2(3840.0,2160.0);
      uv${g}=vUv+delta${g}/vec2(3840.0,2160.0)*min(1.0,${(group.maxDisplacement ?? 512).toFixed(8)}/max(length(delta${g}),0.000001));`);
    // Pulse is an intensity operation, before opacity, in forward order.
    for (const [e, effect] of group.effects.entries()) if (effect.kind === "pulse") {
      statements.push(`gain${g} *= mix(1.0, effect_${g}_${e}.x, ${effect.influenceMaskAssetId ? `texture2D(influence_${g}_${e}, vUv).r` : "1.0"});`);
    }
    // Visual operations have a fixed stage order independent of spatial order.
    for (const [e,effect] of group.effects.entries()) if (effect.kind === "colorShift") {
      const name=`effect_${g}_${e}`, w=effect.influenceMaskAssetId?`texture2D(influence_${g}_${e},vUv).r`:"1.0";
      if(effect.attackWave){
        const wave=effect.attackWave;
        colors.push(`{ float delay=clamp((1.0-vUv.y-${wave.startY.toFixed(12)})/${(wave.endY-wave.startY).toFixed(12)},0.0,1.0);
          float materialValue=max(color.r,max(color.g,color.b));
          shifted${g}=mix(color.rgb,color.rgb*${wave.baseIntensity.toFixed(12)},${name}[0].x*${w});
          for(int n=1;n<=${MAX_ATTACK_COLOR_WAVES};n++){
            vec4 pulse=${name}[n];
            if(pulse.x>=0.0){
              float u=(pulse.x-delay*${name}[0].y)/${name}[0].z;
              float band=step(0.0,u)*step(u,1.0)*pow(sin(clamp(u,0.0,1.0)*3.14159265359),2.0);
              shifted${g}=mix(shifted${g},pulse.yzw*materialValue,clamp(band*${name}[0].x*${w},0.0,1.0));
            }
          }
        }`);
        continue;
      }
      let travel="1.0";
      if(effect.delayMapAssetId){
        const sampler=`delay_${g}_${e}`;
        declarations.push(`uniform sampler2D ${sampler};`);masks.push({name:sampler,assetId:effect.delayMapAssetId});
        travel=`(0.5-0.5*cos(max(0.0,${name}.w-texture2D(${sampler},vUv).r*${effect.travelRadians!.toFixed(12)})))`;
      }
      colors.push(`{ vec3 axis=normalize(vec3(1.0)); float colorWeight=${w}*${travel}; float a=${name}.x*colorWeight;
        shifted${g}=shifted${g}*cos(a)+cross(axis,shifted${g})*sin(a)+axis*dot(axis,shifted${g})*(1.0-cos(a));
        shifted${g}=mix(vec3(dot(shifted${g},vec3(0.2126,0.7152,0.0722))),shifted${g},mix(1.0,${name}.y,colorWeight))+${name}.z*colorWeight; }`);
    }
    for (const [e,effect] of group.effects.entries()) if (effect.kind === "opacity") {
      colors.push(`alpha${g} *= mix(1.0,effect_${g}_${e}.x,${effect.influenceMaskAssetId?`texture2D(influence_${g}_${e},vUv).r`:"1.0"});`);
    }
    glows.push(`vec3 emission${g}=vec3(0.0);`);
    for (const [e,effect] of group.effects.entries()) if (effect.kind === "glow") {
      const name=`effect_${g}_${e}`, w=effect.influenceMaskAssetId?`texture2D(influence_${g}_${e},vUv).r`:"1.0";
      const source=effect.color ? `vec3(${effect.color.map(c=>c.toFixed(8)).join(",")})*max(dot(color.rgb,vec3(0.2126,0.7152,0.0722))-${name}.y,0.0)*smoothstep(0.8,1.0,color.a)` : `max(color.rgb-vec3(${name}.y),vec3(0.0))`;
      glows.push(`emission${g} += ${source}*${name}.x*${w};`);
    }
    if (g === 0) { colors.push("vec3 shiftedColor=shifted0; float behaviorAlpha=alpha0;"); glows.push("vec3 emission=emission0;"); }
    else { const w=`texture2D(region_${g},vUv).r`; colors.push(`shiftedColor=mix(shiftedColor,shifted${g},${w}); behaviorAlpha=mix(behaviorAlpha,alpha${g},${w});`); glows.push(`emission=mix(emission,emission${g},${w});`); }
    if (g === 0) statements.push("vec2 sampleUv = uv0; float pulseGain = gain0;");
    else {
      const w = weight(group.influenceMaskAssetId, `region_${g}`);
      statements.push(`sampleUv = mix(sampleUv, uv${g}, ${w}); pulseGain = mix(pulseGain, gain${g}, ${w});`);
    }
  }
  colors.push("color.rgb=max(shiftedColor,vec3(0.0)); color.a*=behaviorAlpha;");
  glows.push("color.rgb+=emission;");
  return { colorBody: colors.join("\n"), glowBody: glows.join("\n"), declarations: declarations.join("\n"), body: statements.join("\n"), masks, effects };
}
