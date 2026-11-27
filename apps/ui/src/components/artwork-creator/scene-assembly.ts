import type { ArtworkRevisionSnapshot } from "../../../../artwork-contracts/index.d.ts";
import type { Artifact } from "../../api/artworks.ts";
import { parseRigidTravel } from "../../engines/infinite-zoom/artwork/rigid-travel.ts";
import { parseBehaviors } from "../../engines/infinite-zoom/behaviors/behavior-contract.ts";

export interface SceneAssembly {
  coverage: string; environment: string; object: string; material: string; influence: string; delay: string; occlusion?: string;
  duration: number; distance: number; bend: number; period: number; audio: boolean;
}
export function includeArtifacts(artifacts: readonly Artifact[], selected: readonly string[], additions: readonly string[]) {
  const result = new Set(selected), visiting = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw Error("Artifact dependency cycle");
    const artifact = artifacts.find(a => a.id === id);
    if (!artifact) throw Error("Missing artifact");
    if (result.has(id)) return;
    visiting.add(id); artifact.inputs.forEach(input => visit(input.inputId)); visiting.delete(id); result.add(id);
  }
  additions.filter(Boolean).forEach(visit);
  if (result.size > 500) throw Error("Artifact selection limit");
  return [...result];
}
export function assembleScene(snapshot: ArtworkRevisionSnapshot, artifacts: readonly Artifact[], options: SceneAssembly): ArtworkRevisionSnapshot {
  function image(id: string) {
    const asset = artifacts.find(a => a.id === id);
    if (!asset || asset.kind !== "image" || !asset.width || !asset.height || asset.width * 9 !== asset.height * 16) throw Error("Invalid scene image");
    return asset;
  }
  const environment = image(options.environment), object = image(options.object); image(options.coverage);
  function map(id: string, kind: string, source: Artifact) {
    const asset = artifacts.find(a => a.id === id);
    if (!asset || asset.kind !== kind || !source.registrationId || asset.registrationId !== source.registrationId ||
      asset.width !== source.width || asset.height !== source.height || !asset.inputs.some(i => i.inputId === source.id)) throw Error("Map belongs to another image");
  }
  map(options.material, "material-mask", environment); map(options.influence, "influence-map", environment); map(options.delay, "delay-map", environment);
  if (options.occlusion) map(options.occlusion, "occlusion-mask", object);
  const travel = parseRigidTravel({ startSeconds: 0, durationSeconds: options.duration, easing: "ease-in-out",
    path: { kind: "bezier", segments: [{ control1: { x: options.distance / 3, y: options.bend }, control2: { x: options.distance * 2 / 3, y: options.bend }, to: { x: options.distance, y: 0 } }] } });
  if (!Number.isFinite(options.period) || options.period < 1 || options.period > 60) throw Error("Invalid light period");
  const behaviors = parseBehaviors([
    { id: "material-flow", kind: "colorShift", order: 0, influenceMaskAssetId: options.influence,
      params: { frequencyHz: 1 / options.period, phase: 0.5, hue: Math.PI, saturation: 0.3, lightness: 0,
        delayMapAssetId: options.delay, travelSeconds: Math.min(3, options.period / 2) } },
    { id: "material-impulse", kind: "glow", order: 1, influenceMaskAssetId: options.influence,
      params: { frequencyHz: 1 / options.period, phase: 0.5, amount: 0.55, threshold: 0.2, sharpness: 4 },
      ...(options.audio ? { modulation: [{ id: "bass", signal: "bass", operation: "multiply", priority: 0, min: 0.25, max: 1, attackSeconds: 0.04, releaseSeconds: 0.4 }] } : {}) },
  ]);
  const artifactIds = includeArtifacts(artifacts, snapshot.artifactIds, [options.coverage, options.environment, options.object, options.material, options.influence, options.delay, options.occlusion ?? ""]);
  return { ...snapshot, artifactIds, layers: [
    { id: "coverage", imageArtifactId: options.coverage, maskArtifactIds: [], parameters: {} },
    { id: "environment", imageArtifactId: options.environment, maskArtifactIds: [], parameters: {} },
    { id: "lights", imageArtifactId: options.environment, maskArtifactIds: [options.material, options.influence, options.delay], parameters: { maskAssetId: options.material, behaviors } },
    { id: "object", imageArtifactId: options.object, maskArtifactIds: options.occlusion ? [options.occlusion] : [], parameters: { travel, ...(options.occlusion ? { occlusionMaskAssetId: options.occlusion } : {}) } },
  ] };
}
