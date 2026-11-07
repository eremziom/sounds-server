import type { ArtworkPackage } from "./artwork-package.ts";
import type { StepContext } from "../core/contracts.ts";
import { behaviorGroups, createBehaviorEvaluator } from "../behaviors/behavior-evaluator.ts";
import { FULL_FRAME, viewportCorners, type CameraPose } from "../camera/camera-math.ts";
import { NEUTRAL_MODULATION, type BehaviorModulation } from "../modulation/audio-modulation.ts";

export interface LayerTransform {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly opacity: number;
}

const INITIAL: LayerTransform = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });

export function createArtworkInstance(instanceId: string, manifest: ArtworkPackage) {
  if (!instanceId.trim()) throw new Error("Artwork instance requires an identity");
  const layers = new Map(manifest.layers.map(layer => [layer.id, { ...INITIAL }]));
  let audioGain = 1;
  const evaluators = new Map(manifest.layers.map(layer => [layer.id,
    createBehaviorEvaluator(behaviorGroups(manifest.behaviors, layer, manifest.constraints))]));
  return {
    id: instanceId,
    manifest,
    setLayerTransform(id: string, patch: Partial<LayerTransform>) {
      const previous = layers.get(id);
      if (!previous) throw new Error(`Unknown layer: ${id}`);
      const next = { ...previous, ...patch };
      if (Object.keys(next).some(key => !Object.hasOwn(INITIAL, key)) ||
          Object.values(next).some(value => !Number.isFinite(value)) || next.scale <= 0 || next.opacity < 0 || next.opacity > 1) {
        throw new Error("Invalid layer transform");
      }
      if (id === manifest.coverage.baseLayerId && next.opacity !== 1) throw new Error("Coverage base must remain opaque");
      layers.set(id, next);
    },
    stepBehaviors(context: StepContext, modulation: BehaviorModulation = NEUTRAL_MODULATION) {
      if (!Number.isFinite(modulation.strength) || modulation.strength < 0 || modulation.strength > 1 ||
          !Number.isFinite(modulation.intensity) || modulation.intensity < 1 || modulation.intensity > 1.25) throw new Error("Invalid behavior modulation");
      for (const evaluator of evaluators.values()) evaluator.step(context.dt, modulation.strength, modulation.signals);
      audioGain = modulation.intensity;
    },
    getSnapshot() {
      return Object.freeze({ id: instanceId, packageId: manifest.id,
        layers: Object.freeze(manifest.layers.map(layer => Object.freeze({ id: layer.id, ...layers.get(layer.id)!,
          groups: evaluators.get(layer.id)!.getSnapshot(), audioGain }))) });
    },
    reset() {
      audioGain = 1;
      for (const layer of manifest.layers) layers.set(layer.id, { ...INITIAL });
      for (const evaluator of evaluators.values()) evaluator.reset();
    },
  };
}

export type ArtworkInstance = ReturnType<typeof createArtworkInstance>;

/** Baseline cover projection; camera zoom/rotation/translation are applied on
 * top. This is not the future deformation/transition coverage validator. */
export function getCoverView(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("Invalid viewport");
  const scale = Math.max(width / 3840, height / 2160);
  return { width: width / scale, height: height / scale };
}

export function coversViewport(transform: LayerTransform, view: { width: number; height: number }, camera: CameraPose = FULL_FRAME): boolean {
  const cos = Math.cos(transform.rotation), sin = Math.sin(transform.rotation);
  for (const point of viewportCorners(camera, view)) {
    const dx = point.x - 1920 - transform.x, dy = point.y - 1080 - transform.y;
    const localX = (cos * dx + sin * dy) / transform.scale;
    const localY = (-sin * dx + cos * dy) / transform.scale;
    if (Math.abs(localX) > 1920 + 1e-7 || Math.abs(localY) > 1080 + 1e-7) return false;
  }
  return transform.opacity === 1;
}
