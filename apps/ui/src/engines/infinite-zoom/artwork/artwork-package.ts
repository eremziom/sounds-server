export interface ArtworkAsset {
  readonly id: string;
  readonly uri: string;
  readonly kind: "image" | "mask";
  readonly width: number;
  readonly height: number;
  readonly critical: boolean;
}

export interface ArtworkLayer {
  readonly id: string;
  readonly zIndex: number;
  readonly imageAssetId: string;
  readonly maskAssetId?: string;
}

/** IZ-182 subset. Unsupported features are rejected rather than ignored.
 * coverage declares an opaque bottom layer; decoded pixels are checked by the
 * browser loader. Transition envelopes and behaviors belong to later stages. */
export interface ArtworkPackage {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly canvas: Readonly<{ width: 3840; height: 2160 }>;
  readonly assets: readonly ArtworkAsset[];
  readonly layers: readonly ArtworkLayer[];
  readonly coverage: Readonly<{ baseLayerId: string }>;
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
  const data = record(input, ["schemaVersion", "id", "version", "canvas", "assets", "layers", "coverage"]);
  if (data.schemaVersion !== 1) throw new Error("Unsupported artwork schema version");
  const canvas = record(data.canvas, ["width", "height"]);
  if (canvas.width !== 3840 || canvas.height !== 2160) throw new Error("Artwork canvas must be 3840x2160");
  if (!Array.isArray(data.assets) || !data.assets.length || !Array.isArray(data.layers) || !data.layers.length) {
    throw new Error("Artwork requires assets and layers");
  }
  const assets: ArtworkAsset[] = data.assets.map(input => {
    const asset = record(input, ["id", "uri", "kind", "width", "height", "critical"]);
    if (asset.kind !== "image" && asset.kind !== "mask") throw new Error("Unsupported asset kind");
    if (asset.width !== 3840 || asset.height !== 2160) throw new Error("Asset must share artwork coordinates");
    if (typeof asset.critical !== "boolean") throw new Error("Asset critical must be boolean");
    // Only local, root-relative package assets. No traversal, query strings,
    // protocols or encoded path separators. Hosting policy can expand later.
    if (typeof asset.uri !== "string" || !/^\/infinite-zoom\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(svg|png|webp)$/.test(asset.uri)) {
      throw new Error("Invalid local artwork asset URI");
    }
    return Object.freeze({ id: id(asset.id), uri: asset.uri, kind: asset.kind,
      width: asset.width, height: asset.height, critical: asset.critical });
  });
  const references = unique(assets);
  const layers: ArtworkLayer[] = data.layers.map(input => {
    const layer = record(input, ["id", "zIndex", "imageAssetId", "maskAssetId"]);
    if (typeof layer.zIndex !== "number" || !Number.isSafeInteger(layer.zIndex)) throw new Error("Invalid layer zIndex");
    const imageAssetId = id(layer.imageAssetId);
    const image = references.get(imageAssetId);
    if (!image || image.kind !== "image" || !image.critical) throw new Error("Layer image must reference a critical image");
    const maskAssetId = layer.maskAssetId === undefined ? undefined : id(layer.maskAssetId);
    if (maskAssetId !== undefined) {
      const mask = references.get(maskAssetId);
      if (!mask || mask.kind !== "mask" || !mask.critical) throw new Error("Layer mask must reference a critical mask");
    }
    return Object.freeze({ id: id(layer.id), zIndex: layer.zIndex, imageAssetId,
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
  return Object.freeze({ schemaVersion: 1, id: id(data.id), version: id(data.version),
    canvas: Object.freeze({ width: 3840, height: 2160 }), assets: Object.freeze(assets),
    layers: Object.freeze(layers), coverage: Object.freeze({ baseLayerId }) });
}
