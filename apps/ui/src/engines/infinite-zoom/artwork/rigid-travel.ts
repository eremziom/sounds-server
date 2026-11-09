import {compileTravelPath, parseTravelPath, type TravelPath, type TravelPoint} from "./travel-path.ts";

interface TravelTiming {
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  readonly orientToPath?: boolean;
  readonly pivot?: TravelPoint;
  readonly headingOffsetRadians?: number;
}
export type RigidTravel = TravelTiming & (
  | {readonly x: number; readonly y: number; readonly path?: never}
  | {readonly path: TravelPath; readonly x?: never; readonly y?: never}
);

/** Validated, immutable one-shot travel on the existing simulation clock. */
export function parseRigidTravel(input: unknown): RigidTravel | undefined {
  if (input === undefined) return;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid layer travel");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["startSeconds", "durationSeconds", "x", "y", "path", "easing", "orientToPath", "pivot", "headingOffsetRadians"].includes(key))) throw new Error("Unsupported layer travel field");
  function finite(n: unknown, min: number, max: number) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new Error("Invalid layer travel parameter");
    return n;
  }
  const timing = {startSeconds: finite(value.startSeconds, 0, 3600), durationSeconds: finite(value.durationSeconds, 1/60, 3600)};
  if (value.easing !== undefined && (typeof value.easing !== "string" || !["linear", "ease-in", "ease-out", "ease-in-out"].includes(value.easing))) throw new Error("Invalid travel easing");
  if (value.orientToPath !== undefined && typeof value.orientToPath !== "boolean") throw new Error("Invalid travel orientation");
  let pivot: TravelPoint | undefined;
  if (value.orientToPath === true) {
    const p = value.pivot as Record<string, unknown>;
    if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).some(key => !["x", "y"].includes(key))) throw new Error("Heading alignment requires an authored pivot");
    pivot = Object.freeze({x: finite(p.x,0,3840), y: finite(p.y,0,2160)});
  } else if (value.pivot !== undefined || value.headingOffsetRadians !== undefined) throw new Error("Pivot/heading offset require path orientation");
  const options = {...timing,
    ...(value.easing === undefined ? {} : {easing: value.easing as TravelTiming["easing"]}),
    ...(value.orientToPath === undefined ? {} : {orientToPath: value.orientToPath as boolean}),
    ...(pivot ? {pivot} : {}),
    ...(value.headingOffsetRadians === undefined ? {} : {headingOffsetRadians: finite(value.headingOffsetRadians,-2*Math.PI,2*Math.PI)}),
  };
  if (value.path !== undefined) {
    if (value.x !== undefined || value.y !== undefined) throw new Error("Travel uses either straight displacement or a path");
    return Object.freeze({...options, path: parseTravelPath(value.path)});
  }
  const x = finite(value.x,-3840,3840), y = finite(value.y,-2160,2160);
  if (value.orientToPath && x === 0 && y === 0) throw new Error("Zero-length travel has no heading");
  return Object.freeze({...options, x, y});
}

export function createTravelSampler(travel: RigidTravel) {
  const path = travel.path ? compileTravelPath(travel.path) : (progress: number) =>
    ({x: travel.x!*progress, y: travel.y!*progress, heading: Math.atan2(travel.y!,travel.x!)});
  return (seconds: number) => {
    const t = Math.max(0, Math.min(1, (seconds-travel.startSeconds)/travel.durationSeconds));
    const progress = travel.easing === "ease-in" ? t*t : travel.easing === "ease-out" ? 1-(1-t)*(1-t) : travel.easing === "ease-in-out" ? t*t*(3-2*t) : t;
    const p = path(progress);
    const rotation = travel.orientToPath ? p.heading+(travel.headingOffsetRadians ?? 0) : 0;
    const px = (travel.pivot?.x ?? 1920)-1920, py = (travel.pivot?.y ?? 1080)-1080;
    // Rotate about the sprite's authored anchor, not the full-canvas center.
    const c = Math.cos(rotation), s = Math.sin(rotation);
    return {x: p.x+px-c*px+s*py, y: p.y+py-s*px-c*py, rotation,
      opacity: seconds >= travel.startSeconds && seconds < travel.startSeconds+travel.durationSeconds ? 1 : 0};
  };
}

/** Convenience pure sample; runtime instances compile once using the factory. */
export function travelTransform(travel: RigidTravel, seconds: number) {
  return createTravelSampler(travel)(seconds);
}
