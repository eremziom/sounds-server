import type { ArtworkPackage } from "../artwork/artwork-package.ts";

/** Image RGBA8; masks use the exact red channel in R8 at authored resolution. */
export function artworkTextureBytes(manifest: ArtworkPackage) {
  return manifest.assets.filter(asset => asset.critical).reduce((sum, asset) =>
    sum + asset.width * asset.height * (asset.kind === "mask" ? 1 : 4), 0);
}
