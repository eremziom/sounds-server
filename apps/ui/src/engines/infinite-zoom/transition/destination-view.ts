import { FULL_FRAME, type CameraPose } from "../camera/camera-math.ts";
import { cameraInDestination, type ArtworkPlacement } from "./placement.ts";

export type DestinationCamera = "stop-at-full-frame";

/** Finish source translation before the destination's zoom brake.
 * Sample the same log-scale Hermite curve as the camera, including incoming
 * velocity. The last 20% before braking is a framing hold, not a late recenter. */
export function destinationFramingSeconds(source: CameraPose, velocity: CameraPose, target: CameraPose,
  placement: ArtworkPlacement, ticks: number) {
  const brakeScale = -Math.log(placement.scale) - 0.25;
  if (source.logScale >= brakeScale) return ticks / 60;
  for (let tick = 1; tick <= ticks; tick++) {
    const t = tick / ticks, a = source.logScale, b = target.logScale, v = velocity.logScale * ticks / 60;
    const z = (2*t**3-3*t**2+1)*a + (t**3-2*t**2+t)*v + (-2*t**3+3*t**2)*b;
    if (z >= brakeScale) return Math.max(1, Math.floor(tick * 0.8)) / 60;
  }
  return ticks / 60;
}

/** Independent B view: settle smoothly into its native full frame while A
 * continues through its authored aperture. Pure pose mapping, no extra clock. */
export function destinationView(source: CameraPose, placement: ArtworkPlacement, policy?: DestinationCamera): CameraPose {
  const raw = cameraInDestination(source, placement);
  if (!policy || raw.logScale <= -0.25) return raw;
  if (raw.logScale >= 0) return FULL_FRAME;
  const t = (raw.logScale + 0.25) / 0.25;
  const blend = t * t * (3 - 2 * t);
  return { x: raw.x + (FULL_FRAME.x - raw.x) * blend,
    y: raw.y + (FULL_FRAME.y - raw.y) * blend, rotation: raw.rotation * (1 - blend),
    logScale: -0.25 + 0.25 * (t + t * t - t * t * t) };
}

/** Express the independent view in the existing renderer's A coordinates.
 * The portal remains authored in A; this only compensates B's camera zoom. */
export function destinationRenderPlacement(source: CameraPose, placement: ArtworkPlacement, policy?: DestinationCamera): ArtworkPlacement {
  if (!policy) return placement;
  const view = destinationView(source, placement, policy);
  const scale = Math.exp(view.logScale - source.logScale), rotation = source.rotation - view.rotation;
  const x = (view.x - placement.anchorX) * scale, y = (view.y - placement.anchorY) * scale;
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return { ...placement, scale, rotation, x: source.x - c * x + s * y, y: source.y - s * x - c * y };
}
