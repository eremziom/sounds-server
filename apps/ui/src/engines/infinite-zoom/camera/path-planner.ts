import { FULL_FRAME, validatePose, type CameraPose } from "./camera-math.ts";

export interface CameraWaypoint { readonly pose: CameraPose; readonly seconds: number }
export interface CameraPathOptions {
  readonly maxSpeed?: number; readonly maxZoomRate?: number; readonly maxAngularSpeed?: number;
  readonly speedFactor?: number;
  readonly maxAcceleration?: number; readonly maxZoomAcceleration?: number; readonly maxAngularAcceleration?: number;
}

/** Rest-to-rest Hermite has peak rate 1.5 * distance / duration. Plan parameters,
 * never audio-driven coordinates. Controller certifies every actual sample. */
export function planCameraPath(from: CameraPose, waypoints: readonly CameraWaypoint[], options: CameraPathOptions = {}) {
  validatePose(from);
  if (!waypoints.length || waypoints.length > 64) throw new Error("Camera path requires 1..64 waypoints");
  const speed = options.maxSpeed ?? 960, zoom = options.maxZoomRate ?? 0.75, angle = options.maxAngularSpeed ?? 0.25, factor = options.speedFactor ?? 1;
  const acceleration=options.maxAcceleration ?? 1920, zoomAcceleration=options.maxZoomAcceleration ?? 1.5, angularAcceleration=options.maxAngularAcceleration ?? 0.5;
  if (![speed,zoom,angle,factor,acceleration,zoomAcceleration,angularAcceleration].every(n => Number.isFinite(n) && n > 0) || factor < 0.5 || factor > 2) throw new Error("Invalid camera path limits");
  let previous = from;
  return Object.freeze(waypoints.map(point => {
    validatePose(point.pose);
    if (!Number.isFinite(point.seconds) || point.seconds < 1/60 || point.seconds > 60) throw new Error("Invalid waypoint duration");
    const seconds = Math.ceil(Math.max(point.seconds/factor,
      1.5*Math.hypot(point.pose.x-previous.x,point.pose.y-previous.y)/speed,
      1.5*Math.abs(point.pose.logScale-previous.logScale)/zoom,
      1.5*Math.abs(point.pose.rotation-previous.rotation)/angle,
      Math.sqrt(6*Math.hypot(point.pose.x-previous.x,point.pose.y-previous.y)/acceleration),
      Math.sqrt(6*Math.abs(point.pose.logScale-previous.logScale)/zoomAcceleration),
      Math.sqrt(6*Math.abs(point.pose.rotation-previous.rotation)/angularAcceleration))*60)/60;
    if (seconds > 60) throw new Error("Camera path exceeds segment duration limit");
    previous = point.pose;
    return Object.freeze({ pose: Object.freeze({ ...point.pose }), seconds });
  }));
}

/** Author-controlled anchor tour. Travel zooms into a safe envelope before
 * translation/rotation, then returns to the exact supplied bookmark pose. */
export function anchorTour(anchors: readonly { readonly x: number; readonly y: number }[], returnPose: CameraPose = FULL_FRAME,
  logScale = Math.log(2), seconds = 4): readonly CameraWaypoint[] {
  if (!anchors.length || anchors.length > 30) throw new Error("Anchor tour requires 1..30 anchors");
  const waypoints = [{ pose: { ...returnPose, logScale }, seconds },
    ...anchors.map(anchor => ({ pose: { ...returnPose, ...anchor, logScale }, seconds })),
    { pose: { ...returnPose, logScale }, seconds }, { pose: returnPose, seconds }];
  for (const point of waypoints) validatePose(point.pose);
  return Object.freeze(waypoints.map(point => Object.freeze({ pose: Object.freeze({ ...point.pose }), seconds: point.seconds })));
}
