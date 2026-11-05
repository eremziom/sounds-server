export interface CameraPose {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly logScale: number;
}

export const FULL_FRAME: CameraPose = Object.freeze({ x: 1920, y: 1080, rotation: 0, logScale: 0 });
export const ZERO_VELOCITY: CameraPose = Object.freeze({ x: 0, y: 0, rotation: 0, logScale: 0 });
export const POSE_KEYS = ["x", "y", "rotation", "logScale"] as const;

export function validatePose(pose: CameraPose) {
  if (POSE_KEYS.some(key => !Number.isFinite(pose[key])) || Math.abs(pose.x) > 1e7 || Math.abs(pose.y) > 1e7 ||
      Math.abs(pose.rotation) > 1e6 || pose.logScale < -8 || pose.logScale > 8) throw new Error("Invalid camera pose");
}

/** Row-major storage, column-vector multiplication. Artwork pixels -> centered
 * view pixels: S(exp(logScale)) R(-rotation) T(-center). y remains down. */
export function cameraMatrix(pose: CameraPose): readonly number[] {
  validatePose(pose);
  const s = Math.exp(pose.logScale), c = Math.cos(pose.rotation), n = Math.sin(pose.rotation);
  return Object.freeze([s * c, s * n, -s * (c * pose.x + n * pose.y),
    -s * n, s * c, s * (n * pose.x - c * pose.y), 0, 0, 1]);
}

export function viewportCorners(pose: CameraPose, view: { width: number; height: number }) {
  validatePose(pose);
  const s = Math.exp(-pose.logScale), c = Math.cos(pose.rotation), n = Math.sin(pose.rotation);
  return [-1, 1].flatMap(x => [-1, 1].map(y => ({
    x: pose.x + s * (c * x * view.width / 2 - n * y * view.height / 2),
    y: pose.y + s * (n * x * view.width / 2 + c * y * view.height / 2),
  })));
}
