import { viewportCorners, type CameraPose } from "../camera/camera-math.ts";
import type { ArtworkPlacement } from "./placement.ts";

/** Static ellipse in source artwork pixels. Feather is a fraction of its radii. */
export interface PortalRegion {
  readonly x: number; readonly y: number;
  readonly radiusX: number; readonly radiusY: number;
  readonly rotation: number; readonly feather: number;
}
export interface ArtworkPortal {
  readonly id: string;
  readonly region: PortalRegion;
  readonly scale: number;
  readonly durationSeconds: number;
  readonly destinationCamera?: "stop-at-full-frame";
  readonly destination: Readonly<{ manifestUri: string; artworkId: string; version: string; anchorId: string }>;
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid portal object");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key))) throw new Error("Unsupported portal field");
  return result;
}
export function validatePortalRegion(region: PortalRegion) {
  if (!region || [region.x, region.y, region.radiusX, region.radiusY, region.rotation, region.feather].some(v => !Number.isFinite(v)) ||
      region.radiusX <= 0 || region.radiusY <= 0 || region.feather <= 0 || region.feather >= 0.5 || Math.abs(region.rotation) > Math.PI) throw new Error("Invalid portal region");
  const c = Math.cos(region.rotation), s = Math.sin(region.rotation);
  const dx = Math.hypot(region.radiusX * c, region.radiusY * s), dy = Math.hypot(region.radiusX * s, region.radiusY * c);
  if (region.x - dx < 0 || region.x + dx > 3840 || region.y - dy < 0 || region.y + dy > 2160) throw new Error("Portal region exceeds source artwork");
}
export function parseArtworkPortal(input: unknown): ArtworkPortal | undefined {
  if (input === undefined) return undefined;
  const value = object(input, ["id", "region", "scale", "durationSeconds", "destinationCamera", "destination"]);
  const region = object(value.region, ["x", "y", "radiusX", "radiusY", "rotation", "feather"]);
  validatePortalRegion(region as unknown as PortalRegion);
  if (typeof value.scale !== "number" || !Number.isFinite(value.scale) || value.scale < 0.01 || value.scale > 100 ||
      typeof value.durationSeconds !== "number" || !Number.isFinite(value.durationSeconds) || value.durationSeconds < 1 / 60 || value.durationSeconds > 60) throw new Error("Invalid portal scale/duration");
  if (value.destinationCamera !== undefined && value.destinationCamera !== "stop-at-full-frame") throw new Error("Invalid destination camera policy");
  const destination = object(value.destination, ["manifestUri", "artworkId", "version", "anchorId"]);
  for (const id of [value.id, destination.artworkId, destination.version, destination.anchorId]) {
    if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) throw new Error("Invalid portal identifier");
  }
  if (typeof destination.manifestUri !== "string" || !/^\/infinite-zoom\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.json$/.test(destination.manifestUri)) throw new Error("Invalid portal manifest URI");
  return Object.freeze({ ...value, region: Object.freeze({ ...region }), destination: Object.freeze({ ...destination }) }) as unknown as ArtworkPortal;
}

export function validatePortalPlacement(region: PortalRegion, p: ArtworkPlacement) {
  validatePortalRegion(region);
  if (p.scale < 0.01 || p.scale > 100 || region.x !== p.x || region.y !== p.y || region.rotation !== p.rotation ||
      p.anchorX - region.radiusX / p.scale < 0 || p.anchorX + region.radiusX / p.scale > 3840 ||
      p.anchorY - region.radiusY / p.scale < 0 || p.anchorY + region.radiusY / p.scale > 2160) throw new Error("Portal aperture is outside destination image");
}

/** Every viewport corner must be strictly inside the fully opaque ellipse.
 * Convexity guarantees no feather/source contribution anywhere in the viewport. */
export function portalCoversViewport(region: PortalRegion, pose: CameraPose, view: { width: number; height: number }) {
  const c = Math.cos(region.rotation), s = Math.sin(region.rotation), inner = 1 - region.feather;
  return viewportCorners(pose, view).every(point => {
    const x = point.x - region.x, y = point.y - region.y;
    return Math.hypot((c * x + s * y) / region.radiusX, (-s * x + c * y) / region.radiusY) < inner - 1e-6;
  });
}
export function portalTarget(region: PortalRegion, view: { width: number; height: number }): CameraPose {
  const zoom = 1.04 * Math.hypot(view.width / (2 * region.radiusX), view.height / (2 * region.radiusY)) / (1 - region.feather);
  return { x: region.x, y: region.y, rotation: region.rotation, logScale: Math.log(zoom) };
}
