import { parseArtworkPackage, type ArtworkAsset, type ArtworkPackage } from "./artwork-package.ts";

export interface DecodedArtworkAsset {
  readonly width: number;
  readonly height: number;
  readonly image: TexImageSource;
  readonly opaque: boolean;
  close(): void;
}

export type AssetDecoder = (asset: ArtworkAsset, signal: AbortSignal) => Promise<DecodedArtworkAsset>;

/** CPU lease. Critical assets stay owned until terminal disposal. Optional assets
 * are deliberately not fetched in this stage; they cannot gate readiness. */
export interface LoadedArtwork {
  readonly manifest: ArtworkPackage;
  getAsset(id: string): DecodedArtworkAsset;
  dispose(): void;
}

export async function loadArtwork(input: unknown, signal: AbortSignal, decode: AssetDecoder = decodeArtworkAsset): Promise<LoadedArtwork> {
  const manifest = parseArtworkPackage(input);
  const assets = new Map<string, DecodedArtworkAsset>();
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    // A broken close must not strand the rest of this package's CPU resources.
    for (const asset of assets.values()) { try { asset.close(); } catch { /* Continue cleanup. */ } }
    assets.clear();
  }
  try {
    signal.throwIfAborted();
    // Sequential loading bounds concurrent full-resolution decodes and makes
    // cancellation/partial failure ownership unambiguous.
    for (const descriptor of manifest.assets) {
      if (!descriptor.critical) continue;
      const asset = await decode(descriptor, signal);
      assets.set(descriptor.id, asset);
      signal.throwIfAborted();
      if (asset.width !== descriptor.width || asset.height !== descriptor.height) throw new Error(`Asset dimensions mismatch: ${descriptor.id}`);
    }
    const base = manifest.layers[0];
    if (!assets.get(base.imageAssetId)!.opaque) throw new Error("Coverage base image contains transparent pixels");
    return {
      manifest,
      getAsset(id) {
        if (disposed) throw new Error("Artwork is disposed");
        const asset = assets.get(id);
        if (!asset) throw new Error(`Asset not loaded: ${id}`);
        return asset;
      },
      dispose,
    };
  } catch (failure) { dispose(); throw failure; }
}

/** Bitmap orientation is set here because WebGL ignores Texture.flipY for
 * ImageBitmap. Keep unassociated alpha; shaders premultiply in linear light. */
export async function decodeArtworkAsset(asset: ArtworkAsset, signal: AbortSignal): Promise<DecodedArtworkAsset> {
  const response = await fetch(asset.uri, { signal, credentials: "same-origin" });
  if (!response.ok) throw new Error(`RESOURCE_LOAD_FAILED: ${asset.id} (${response.status})`);
  const blob = await response.blob();
  signal.throwIfAborted();
  // Chromium cannot decode SVG Blob directly with createImageBitmap. Decode
  // through an image and rasterize first; use the same path for all formats.
  const image = new Image();
  const uri = URL.createObjectURL(blob);
  let canvas: OffscreenCanvas | undefined;
  let bitmap: ImageBitmap | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        image.onload = image.onerror = null;
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => { cleanup(); image.src = ""; reject(signal.reason); };
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error(`Cannot decode asset: ${asset.id}`)); };
      signal.addEventListener("abort", onAbort, { once: true });
      image.src = uri;
    });
    signal.throwIfAborted();
    if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) throw new Error(`Asset dimensions mismatch: ${asset.id}`);
    canvas = new OffscreenCanvas(asset.width, asset.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Cannot validate artwork alpha");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, asset.width, asset.height).data;
    let opaque = true;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) { opaque = false; break; }
    bitmap = await createImageBitmap(canvas, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
    signal.throwIfAborted();
    const decoded = bitmap;
    return { width: decoded.width, height: decoded.height, image: decoded, opaque, close: () => decoded.close() };
  } catch (failure) { bitmap?.close(); throw failure; }
  finally {
    URL.revokeObjectURL(uri);
    image.src = "";
    if (canvas) canvas.width = canvas.height = 1;
  }
}
