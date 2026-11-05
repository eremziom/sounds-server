import type { ArtworkPackage } from "./artwork-package.ts";

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
    getSnapshot() {
      return Object.freeze({ id: instanceId, packageId: manifest.id,
        layers: Object.freeze(manifest.layers.map(layer => Object.freeze({ id: layer.id, ...layers.get(layer.id)! }))) });
    },
    reset() { for (const layer of manifest.layers) layers.set(layer.id, { ...INITIAL }); },
  };
}

export type ArtworkInstance = ReturnType<typeof createArtworkInstance>;

/** Initial cover projection crops artwork to fill the viewport, without camera
 * motion. Validate the transformed opaque rectangle using inverse-mapped
 * viewport corners. This is not the future deformation/transition validator. */
export function getCoverView(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("Invalid viewport");
  const scale = Math.max(width / 3840, height / 2160);
  return { width: width / scale, height: height / scale };
}

export function coversViewport(transform: LayerTransform, view: { width: number; height: number }): boolean {
  const cos = Math.cos(transform.rotation), sin = Math.sin(transform.rotation);
  for (const x of [-view.width / 2, view.width / 2]) for (const y of [-view.height / 2, view.height / 2]) {
    const dx = x - transform.x, dy = y - transform.y;
    const localX = (cos * dx + sin * dy) / transform.scale;
    const localY = (-sin * dx + cos * dy) / transform.scale;
    if (Math.abs(localX) > 1920 + 1e-7 || Math.abs(localY) > 1080 + 1e-7) return false;
  }
  return transform.opacity === 1;
}
