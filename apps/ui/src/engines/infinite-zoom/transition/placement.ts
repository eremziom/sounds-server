import { validatePose, type CameraPose } from "../camera/camera-math.ts";

export interface ArtworkPlacement {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scale: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

export const IDENTITY_PLACEMENT: ArtworkPlacement = Object.freeze({ x: 0, y: 0, rotation: 0, scale: 1, anchorX: 0, anchorY: 0 });

export function validatePlacement(p: ArtworkPlacement) {
  if (!p || (["x", "y", "rotation", "scale", "anchorX", "anchorY"] as const).some(key => !Number.isFinite(p[key])) || p.scale < 0.01 || p.scale > 100 ||
      p.anchorX < 0 || p.anchorX > 3840 || p.anchorY < 0 || p.anchorY > 2160 ||
      Math.abs(p.x) > 1e7 || Math.abs(p.y) > 1e7 || Math.abs(p.rotation) > 1e6) throw new Error("Invalid artwork placement");
}

/** P_(B→A) = T(p) R(theta) S(s) T(-anchor), column vectors. */
export function placePoint(point: { x: number; y: number }, p: ArtworkPlacement) {
  validatePlacement(p);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Invalid artwork point");
  const c = Math.cos(p.rotation), n = Math.sin(p.rotation);
  const x = (point.x - p.anchorX) * p.scale, y = (point.y - p.anchorY) * p.scale;
  return { x: p.x + c * x - n * y, y: p.y + n * x + c * y };
}

/** Camera view C_B = C_A P_(B→A). Position and velocity use inverse placement;
 * log scale adds log(s), angular/log-scale rates are unchanged. */
export function cameraInDestination(pose: CameraPose, p: ArtworkPlacement): CameraPose {
  validatePlacement(p);
  const c = Math.cos(p.rotation), n = Math.sin(p.rotation), x = pose.x - p.x, y = pose.y - p.y;
  const result = { x: p.anchorX + (c * x + n * y) / p.scale, y: p.anchorY + (-n * x + c * y) / p.scale,
    rotation: pose.rotation - p.rotation, logScale: pose.logScale + Math.log(p.scale) };
  validatePose(result);
  return Object.freeze(result);
}

export function velocityInDestination(velocity: CameraPose, p: ArtworkPlacement): CameraPose {
  validatePlacement(p);
  if ((["x", "y", "rotation", "logScale"] as const).some(key => !Number.isFinite(velocity[key]))) throw new Error("Invalid camera velocity");
  const c = Math.cos(p.rotation), n = Math.sin(p.rotation);
  return Object.freeze({ x: (c * velocity.x + n * velocity.y) / p.scale,
    y: (-n * velocity.x + c * velocity.y) / p.scale, rotation: velocity.rotation, logScale: velocity.logScale });
}
