import { planCameraPath, type CameraWaypoint, type CameraPathOptions } from "./path-planner.ts";
import { FULL_FRAME, POSE_KEYS, ZERO_VELOCITY, validatePose, type CameraPose } from "./camera-math.ts";
import { cameraInDestination, velocityInDestination, type ArtworkPlacement } from "../transition/placement.ts";

interface Trajectory {
  readonly from: CameraPose;
  readonly velocity: CameraPose;
  readonly to: CameraPose;
  readonly ticks: number;
  readonly framingTicks: number;
  elapsed: number;
}

/** Cubic Hermite retargeting preserves incoming position/velocity and ends at
 * the exact target with zero velocity. No wall clock or scheduler lives here. */
function sample(path: Trajectory, tick: number) {
  if (tick === path.ticks) return { pose: path.to, velocity: ZERO_VELOCITY };
  const pose = { ...ZERO_VELOCITY }, velocity = { ...ZERO_VELOCITY };
  for (const key of POSE_KEYS) {
    const ticks = key === "x" || key === "y" ? path.framingTicks : path.ticks;
    if (tick >= ticks) { pose[key] = path.to[key]; velocity[key] = 0; continue; }
    const t = tick / ticks, duration = ticks / 60;
    const a = path.from[key], b = path.to[key], v = path.velocity[key] * duration;
    pose[key] = (2 * t ** 3 - 3 * t ** 2 + 1) * a + (t ** 3 - 2 * t ** 2 + t) * v + (-2 * t ** 3 + 3 * t ** 2) * b;
    velocity[key] = ((6 * t ** 2 - 6 * t) * a + (3 * t ** 2 - 4 * t + 1) * v + (-6 * t ** 2 + 6 * t) * b) / duration;
  }
  return { pose, velocity };
}

export function createCameraController(isPoseValid: (pose: CameraPose) => boolean, initial: CameraPose = FULL_FRAME) {
  validatePose(initial);
  if (!isPoseValid(initial)) throw new Error("COVERAGE_INVALID: initial camera");
  let origin = Object.freeze({ ...initial });
  let pose: CameraPose = origin, velocity: CameraPose = ZERO_VELOCITY;
  let path: Trajectory | null = null;
  let constraintReached = false;
  let queue: readonly CameraWaypoint[] = [];
  const bookmarks = new Map<string, CameraPose>([["full-frame", origin]]);

  function retarget(target: CameraPose, durationSeconds: number, framingSeconds = durationSeconds) {
    validatePose(target);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 / 60 || durationSeconds > 60) throw new Error("Camera duration must be 1/60..60 seconds");
    if (!Number.isFinite(framingSeconds) || framingSeconds < 1 / 60 || framingSeconds > durationSeconds) throw new Error("Camera framing duration must fit the trajectory");
    const candidate: Trajectory = { from: pose, velocity, to: Object.freeze({ ...target }),
      ticks: Math.round(durationSeconds * 60), framingTicks: Math.round(framingSeconds * 60), elapsed: 0 };
    // Certify every state that this fixed-step trajectory can present. Renderer
    // uses current states, with no interpolated poses between these samples.
    for (let tick = 0; tick <= candidate.ticks; tick++) {
      const state = sample(candidate, tick).pose;
      validatePose(state);
      if (!isPoseValid(state)) throw new Error("CAMERA_CONSTRAINT_REACHED: unsafe trajectory");
    }
    path = candidate; queue = [];
    constraintReached = false;
  }

  return {
    retarget,
    followPath(waypoints: readonly CameraWaypoint[], options?: CameraPathOptions) {
      const planned = planCameraPath(pose,waypoints,options);
      // Transactional preflight uses temporary state and preserves the live
      // camera, trajectory and bookmarks if any segment is unsafe.
      const previous = { pose, velocity, path, queue, constraintReached };
      try {
        for (const point of planned) {
          retarget(point.pose,point.seconds);
          let previousVelocity=velocity;
          for(let tick=0;tick<=path!.ticks;tick++) {
            const rate=sample(path!,tick).velocity;
            const acceleration={x:(rate.x-previousVelocity.x)*60,y:(rate.y-previousVelocity.y)*60,rotation:(rate.rotation-previousVelocity.rotation)*60,logScale:(rate.logScale-previousVelocity.logScale)*60};
            if(Math.hypot(rate.x,rate.y)>(options?.maxSpeed ?? 960)+1e-7 || Math.abs(rate.logScale)>(options?.maxZoomRate ?? 0.75)+1e-7 || Math.abs(rate.rotation)>(options?.maxAngularSpeed ?? 0.25)+1e-7 ||
              Math.hypot(acceleration.x,acceleration.y)>(options?.maxAcceleration ?? 1920)+1e-7 || Math.abs(acceleration.logScale)>(options?.maxZoomAcceleration ?? 1.5)+1e-7 || Math.abs(acceleration.rotation)>(options?.maxAngularAcceleration ?? 0.5)+1e-7) throw new Error("CAMERA_RATE_LIMIT: unsafe path dynamics");
            previousVelocity=rate;
          }
          pose = point.pose; velocity = ZERO_VELOCITY;
        }
      } finally { pose = previous.pose; velocity = previous.velocity; path = previous.path; queue = previous.queue; constraintReached = previous.constraintReached; }
      retarget(planned[0].pose,planned[0].seconds); queue = planned.slice(1);
    },
    zoomIn(factor: number, seconds: number) {
      if (!Number.isFinite(factor) || factor <= 1) throw new Error("Zoom factor must exceed one");
      retarget({ ...pose, logScale: pose.logScale + Math.log(factor) }, seconds);
    },
    zoomOut(factor: number, seconds: number) {
      if (!Number.isFinite(factor) || factor <= 1) throw new Error("Zoom factor must exceed one");
      retarget({ ...pose, logScale: pose.logScale - Math.log(factor) }, seconds);
    },
    move(x: number, y: number, seconds: number) { retarget({ ...pose, x, y }, seconds); },
    rotate(radians: number, seconds: number) { retarget({ ...pose, rotation: radians }, seconds); },
    hold(seconds = 0.5) {
      // A moving camera decelerates rather than dropping its velocity instantly.
      const ticks = Math.round(seconds * 60), duration = ticks / 60;
      const target = { ...pose };
      for (const key of POSE_KEYS) target[key] += velocity[key] * duration / 2;
      retarget(target, seconds);
    },
    saveBookmark(name: string) {
      if (!name.trim() || name === "full-frame") throw new Error("Invalid/reserved camera bookmark");
      if (!bookmarks.has(name) && bookmarks.size >= 64) throw new Error("Camera bookmark limit reached");
      bookmarks.set(name, Object.freeze({ ...pose }));
    },
    returnTo(name: string, seconds: number) {
      const target = bookmarks.get(name);
      if (!target) throw new Error(`Unknown camera bookmark: ${name}`);
      retarget(target, seconds);
    },
    rebaseCoordinates(placement: ArtworkPlacement) {
      // Prepare the complete replacement before changing live state. The same
      // curve in B coordinates retains its elapsed tick and both derivatives.
      const nextPose = cameraInDestination(pose, placement);
      const nextVelocity = velocityInDestination(velocity, placement);
      const nextPath = path ? { ...path, from: cameraInDestination(path.from, placement),
        to: cameraInDestination(path.to, placement), velocity: velocityInDestination(path.velocity, placement) } : null;
      pose = nextPose; velocity = nextVelocity; origin = FULL_FRAME; path = nextPath;
      // Bookmarks are local to the active artwork. A can be unloaded after the
      // handoff, so its bookmarks must not become unsafe returns in B. Journey
      // reset separately restores its initial artwork and original camera.
      queue = []; bookmarks.clear(); bookmarks.set("full-frame", FULL_FRAME);
    },
    halt() { queue = []; path = null; velocity = ZERO_VELOCITY; },
    step() {
      if (!path && queue.length) {
        const [next,...remaining] = queue;
        try { retarget(next.pose,next.seconds); queue = remaining; }
        catch { path=null; queue=[]; velocity=ZERO_VELOCITY; constraintReached=true; return; }
      }
      if (!path) return;
      const next = sample(path, path.elapsed + 1);
      if (!isPoseValid(next.pose)) {
        // Geometry/viewport may have changed since preflight. Preserve the last
        // safe pose, stop here and expose the hard constraint to diagnostics.
        path = null; queue = []; velocity = ZERO_VELOCITY; constraintReached = true; return;
      }
      path.elapsed++;
      pose = Object.freeze({ ...next.pose }); velocity = Object.freeze({ ...next.velocity });
      if (path.elapsed === path.ticks) path = null;
    },
    getSnapshot() { return Object.freeze({ pose, velocity, moving: path !== null || queue.length > 0, constraintReached }); },
    reset(initialPose: CameraPose = origin) {
      validatePose(initialPose);
      origin = Object.freeze({ ...initialPose }); pose = origin; velocity = ZERO_VELOCITY; path = null;
      constraintReached = false; queue = []; bookmarks.clear(); bookmarks.set("full-frame", origin);
    },
  };
}

export type CameraController = ReturnType<typeof createCameraController>;
