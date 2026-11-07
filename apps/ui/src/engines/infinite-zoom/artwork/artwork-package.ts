import { parseMotionConstraints, type MotionConstraints } from "../behaviors/motion-constraints.ts";
import { behaviorEnvelope, parseBehaviors, validateComposition, type BehaviorDescriptor } from "../behaviors/behavior-contract.ts";
import { behaviorGroups, type BehaviorRegion } from "../behaviors/behavior-evaluator.ts";
import { parseArtworkPortal, type ArtworkPortal } from "../transition/portal.ts";

export interface ArtworkAsset {
  readonly id: string;
  readonly uri: string;
  readonly kind: "image" | "mask" | "depth" | "flow" | "detail";
  readonly width: number;
  readonly height: number;
  readonly critical: boolean;
}

export interface ArtworkLayer {
  readonly id: string;
  readonly zIndex: number;
  readonly imageAssetId: string;
  readonly maskAssetId?: string;
  readonly behaviors: readonly BehaviorDescriptor[];
  readonly regions: readonly BehaviorRegion[];
  readonly constraints?: MotionConstraints;
  readonly lods?: readonly { readonly assetId: string; readonly minPixelsPerTexel: number }[];
}

/** Version 1 preserves the sample contract; version 2 adds typed operators,
 * map assets, scoped constraints and optional full-frame detail. Unknown schema
 * versions/fields fail closed. Runtime state never mutates a package. */
export interface ArtworkPackage {
  readonly schemaVersion: 1 | 2;
  readonly id: string;
  readonly version: string;
  readonly canvas: Readonly<{ width: 3840; height: 2160 }>;
  readonly assets: readonly ArtworkAsset[];
  readonly layers: readonly ArtworkLayer[];
  readonly coverage: Readonly<{ baseLayerId: string }>;
  readonly behaviors: readonly BehaviorDescriptor[];
  readonly anchors: readonly { readonly id: string; readonly x: number; readonly y: number }[];
  readonly portal?: ArtworkPortal;
  readonly constraints?: MotionConstraints;
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) if (!keys.includes(key)) throw new Error(`Unsupported field: ${key}`);
  return result;
}

function id(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) throw new Error("Invalid identifier");
  return value;
}

function unique<T extends { readonly id: string }>(items: readonly T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    if (result.has(item.id)) throw new Error(`Duplicate identifier: ${item.id}`);
    result.set(item.id, item);
  }
  return result;
}

export function parseArtworkPackage(input: unknown): ArtworkPackage {
  const data = record(input, ["schemaVersion", "id", "version", "canvas", "assets", "layers", "coverage", "behaviors", "anchors", "portal", "constraints"]);
  if (data.schemaVersion !== 1 && data.schemaVersion !== 2) throw new Error("Unsupported artwork schema version");
  const phase2 = data.schemaVersion === 2;
  if (!phase2 && data.constraints !== undefined) throw new Error("Motion constraints require schema 2");
  const constraints = parseMotionConstraints(data.constraints);
  const canvas = record(data.canvas, ["width", "height"]);
  if (canvas.width !== 3840 || canvas.height !== 2160) throw new Error("Artwork canvas must be 3840x2160");
  if (!Array.isArray(data.assets) || !data.assets.length || !Array.isArray(data.layers) || !data.layers.length) {
    throw new Error("Artwork requires assets and layers");
  }
  const assets: ArtworkAsset[] = data.assets.map(input => {
    const asset = record(input, ["id", "uri", "kind", "width", "height", "critical"]);
    if (!["image", "mask", ...(phase2 ? ["depth", "flow", "detail"] : [])].includes(String(asset.kind))) throw new Error("Unsupported asset kind");
    if (!phase2 && (asset.width !== 3840 || asset.height !== 2160)) throw new Error("Asset must share artwork coordinates");
    if (phase2 && (typeof asset.width !== "number" || typeof asset.height !== "number" || !Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height) || asset.width < 16 || asset.height < 9 || asset.width > 8192 || asset.height > 8192 || asset.width*9 !== asset.height*16)) throw new Error("Asset must share normalized 16:9 artwork coordinates");
    if (typeof asset.critical !== "boolean") throw new Error("Asset critical must be boolean");
    // Only local, root-relative package assets. No traversal, query strings,
    // protocols or encoded path separators. Hosting policy can expand later.
    if (typeof asset.uri !== "string" || !/^\/infinite-zoom\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(svg|png|webp)$/.test(asset.uri)) {
      throw new Error("Invalid local artwork asset URI");
    }
    return Object.freeze({ id: id(asset.id), uri: asset.uri, kind: asset.kind as ArtworkAsset["kind"],
      width: asset.width as number, height: asset.height as number, critical: asset.critical });
  });
  const references = unique(assets);
  function validateMask(reference: string | undefined) {
    if (reference === undefined) return;
    const mask = references.get(reference);
    if (!mask || mask.kind !== "mask" || !mask.critical) throw new Error("Influence mask must reference a critical mask");
  }
  function behaviors(input: unknown) {
    const parsed = parseBehaviors(input);
    for (const behavior of parsed) {
      if (!phase2 && (!["translate", "wave", "pulse"].includes(behavior.kind) || behavior.enabled !== undefined || behavior.weight !== undefined || behavior.modulation !== undefined)) throw new Error("Extended behaviors require schema 2");
      validateMask(behavior.influenceMaskAssetId);
      if (behavior.kind === "parallax" || behavior.kind === "flow" || behavior.kind === "displace") {
        const field = references.get(behavior.kind === "parallax" ? behavior.params.depthAssetId : behavior.params.fieldAssetId);
        if (!field || !field.critical || field.kind !== (behavior.kind === "parallax" ? "depth" : "flow")) throw new Error("Behavior field must reference a critical depth/flow asset");
      }
    }
    return parsed;
  }
  const artworkBehaviors = behaviors(data.behaviors);
  const layers: ArtworkLayer[] = data.layers.map(input => {
    const layer = record(input, ["id", "zIndex", "imageAssetId", "maskAssetId", "behaviors", "regions", "constraints", "lods"]);
    if (!phase2 && (layer.constraints !== undefined || layer.lods !== undefined)) throw new Error("Extended layers require schema 2");
    const layerConstraints = parseMotionConstraints(layer.constraints);
    if (typeof layer.zIndex !== "number" || !Number.isSafeInteger(layer.zIndex)) throw new Error("Invalid layer zIndex");
    const imageAssetId = id(layer.imageAssetId);
    const image = references.get(imageAssetId);
    if (!image || image.kind !== "image" || !image.critical) throw new Error("Layer image must reference a critical image");
    const maskAssetId = layer.maskAssetId === undefined ? undefined : id(layer.maskAssetId);
    if (maskAssetId !== undefined) {
      const mask = references.get(maskAssetId);
      if (!mask || mask.kind !== "mask" || !mask.critical) throw new Error("Layer mask must reference a critical mask");
    }
    if (layer.regions !== undefined && !Array.isArray(layer.regions)) throw new Error("Regions must be an array");
    const regions: BehaviorRegion[] = ((layer.regions ?? []) as unknown[]).map(input => {
      const region = record(input, ["id", "influenceMaskAssetId", "behaviors", "constraints"]);
      const influenceMaskAssetId = id(region.influenceMaskAssetId);
      validateMask(influenceMaskAssetId);
      if (!phase2 && region.constraints !== undefined) throw new Error("Region constraints require schema 2");
      return Object.freeze({ id: id(region.id), influenceMaskAssetId, constraints: parseMotionConstraints(region.constraints), behaviors: behaviors(region.behaviors) });
    });
    unique(regions);
    if (regions.some(region => region.id === "layer")) throw new Error("Reserved region id: layer");
    if (layer.lods !== undefined && !Array.isArray(layer.lods)) throw new Error("LODs must be an array");
    const lodIds = new Set<string>();
    const lods = ((layer.lods ?? []) as unknown[]).map(input => {
      const lod = record(input,["assetId","minPixelsPerTexel"]), assetId = id(lod.assetId), asset = references.get(assetId);
      if (!asset || !["image","detail"].includes(asset.kind) || asset.critical || asset.width <= image.width || lodIds.has(assetId) || typeof lod.minPixelsPerTexel !== "number" || !Number.isFinite(lod.minPixelsPerTexel) || lod.minPixelsPerTexel < 1 || lod.minPixelsPerTexel > 8) throw new Error("Invalid optional full-frame detail LOD");
      lodIds.add(assetId);
      return Object.freeze({ assetId, minPixelsPerTexel: lod.minPixelsPerTexel });
    });
    lods.sort((a,b) => references.get(a.assetId)!.width - references.get(b.assetId)!.width);
    return Object.freeze({ id: id(layer.id), zIndex: layer.zIndex, imageAssetId,
      behaviors: behaviors(layer.behaviors), regions: Object.freeze(regions),
      ...(layerConstraints ? { constraints: layerConstraints } : {}), ...(lods.length ? { lods: Object.freeze(lods) } : {}),
      ...(maskAssetId === undefined ? {} : { maskAssetId }) });
  });
  unique(layers);
  // Input order is the explicit stable tie-breaker for equal zIndex.
  layers.sort((a, b) => a.zIndex - b.zIndex);
  const coverage = record(data.coverage, ["baseLayerId"]);
  const baseLayerId = id(coverage.baseLayerId);
  if (layers[0].id !== baseLayerId || layers[0].maskAssetId !== undefined) {
    throw new Error("Coverage requires an unmasked bottom layer");
  }
  for (const layer of layers) for (const group of behaviorGroups(artworkBehaviors, layer, constraints)) {
    validateComposition(group.behaviors, group.constraints);
    if (layer.id === baseLayerId && group.behaviors.some(behavior =>
      behaviorEnvelope(behavior).displacement !== 0 ||
      (behavior.enabled !== false && behavior.kind === "opacity" && (behavior.params.base !== 1 || behavior.params.amount !== 0)))) {
      throw new Error("Coverage base cannot use spatial behaviors without authored extended coverage");
    }
  }
  if (data.anchors !== undefined && !Array.isArray(data.anchors)) throw new Error("Anchors must be an array");
  const anchors = ((data.anchors ?? []) as unknown[]).map(input => {
    const anchor = record(input, ["id", "x", "y"]);
    if (typeof anchor.x !== "number" || typeof anchor.y !== "number" || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) ||
        anchor.x < 0 || anchor.x > 3840 || anchor.y < 0 || anchor.y > 2160) throw new Error("Invalid artwork anchor");
    return Object.freeze({ id: id(anchor.id), x: anchor.x, y: anchor.y });
  });
  unique(anchors);
  return Object.freeze({ schemaVersion: data.schemaVersion, ...(constraints ? { constraints } : {}), id: id(data.id), version: id(data.version), anchors: Object.freeze(anchors),
    canvas: Object.freeze({ width: 3840, height: 2160 }), assets: Object.freeze(assets),
    layers: Object.freeze(layers), coverage: Object.freeze({ baseLayerId }), behaviors: artworkBehaviors,
    ...(data.portal === undefined ? {} : { portal: parseArtworkPortal(data.portal) }) });
}
