export interface TravelPoint { readonly x: number; readonly y: number }
export interface TravelSegment {
  readonly control1: TravelPoint;
  readonly control2: TravelPoint;
  readonly to: TravelPoint;
}
export type TravelPath =
  | { readonly kind: "bezier"; readonly segments: readonly TravelSegment[] }
  | { readonly kind: "spline"; readonly points: readonly TravelPoint[]; readonly tension: number };
type Cubic = readonly [TravelPoint, TravelPoint, TravelPoint, TravelPoint];
const ORIGIN = Object.freeze({x: 0, y: 0});

function record(input: unknown, keys: readonly string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid travel path object");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error("Unsupported travel path field");
  return value;
}
function point(input: unknown): TravelPoint {
  const value = record(input, ["x", "y"]);
  if (typeof value.x !== "number" || !Number.isFinite(value.x) || Math.abs(value.x) > 3840 ||
      typeof value.y !== "number" || !Number.isFinite(value.y) || Math.abs(value.y) > 2160) throw new Error("Invalid travel path point");
  return Object.freeze({x: value.x, y: value.y});
}
export function parseTravelPath(input: unknown): TravelPath {
  const value = record(input, ["kind", "segments", "points", "tension"]);
  let path: TravelPath;
  if (value.kind === "bezier") {
    if (value.points !== undefined || value.tension !== undefined || !Array.isArray(value.segments) || value.segments.length < 1 || value.segments.length > 64) throw new Error("Invalid Bezier travel path");
    path = Object.freeze({kind: "bezier", segments: Object.freeze(value.segments.map(input => {
      const segment = record(input, ["control1", "control2", "to"]);
      return Object.freeze({control1: point(segment.control1), control2: point(segment.control2), to: point(segment.to)});
    }))});
  } else if (value.kind === "spline") {
    if (value.segments !== undefined || !Array.isArray(value.points) || value.points.length < 2 || value.points.length > 65) throw new Error("Invalid spline travel path");
    const tension = value.tension ?? 0;
    if (typeof tension !== "number" || !Number.isFinite(tension) || tension < 0 || tension > .95) throw new Error("Invalid spline tension");
    const points = Object.freeze(value.points.map(point));
    if (points[0].x !== 0 || points[0].y !== 0) throw new Error("Spline travel must begin at the source origin");
    path = Object.freeze({kind: "spline", points, tension});
  } else throw new Error("Unsupported travel path kind");
  // Fail at package validation, before readiness, not during playback.
  validateCurves(curves(path));
  return path;
}

function curves(path: TravelPath): Cubic[] {
  if (path.kind === "bezier") return path.segments.map((segment, i) =>
    [i === 0 ? ORIGIN : path.segments[i-1].to, segment.control1, segment.control2, segment.to]);
  const p = path.points;
  const tangents = p.map((_, i) => {
    const a = p[Math.max(0, i-1)], b = p[Math.min(p.length-1, i+1)];
    const gain = (1-path.tension)*(i === 0 || i === p.length-1 ? 1 : .5);
    return {x: (b.x-a.x)*gain, y: (b.y-a.y)*gain};
  });
  return p.slice(0, -1).map((a, i) => [a,
    point({x: a.x+tangents[i].x/3, y: a.y+tangents[i].y/3}),
    point({x: p[i+1].x-tangents[i+1].x/3, y: p[i+1].y-tangents[i+1].y/3}), p[i+1]]);
}
function position(c: Cubic, u: number): TravelPoint {
  const v = 1-u;
  return {x: v*v*v*c[0].x+3*v*v*u*c[1].x+3*v*u*u*c[2].x+u*u*u*c[3].x,
    y: v*v*v*c[0].y+3*v*v*u*c[1].y+3*v*u*u*c[2].y+u*u*u*c[3].y};
}
function tangent(c: Cubic, u: number): TravelPoint {
  const v = 1-u;
  return {x: 3*v*v*(c[1].x-c[0].x)+6*v*u*(c[2].x-c[1].x)+3*u*u*(c[3].x-c[2].x),
    y: 3*v*v*(c[1].y-c[0].y)+6*v*u*(c[2].y-c[1].y)+3*u*u*(c[3].y-c[2].y)};
}
// Five-point Gauss-Legendre integration on a short lookup-table interval.
// Unlike chord length, this also retains speed accuracy near tight turns.
function arcLength(c: Cubic, from: number, to: number) {
  const mid = (from+to)/2, half = (to-from)/2;
  const nodes = [0, -.5384693101056831, .5384693101056831, -.906179845938664, .906179845938664];
  const weights = [.5688888888888889, .4786286704993665, .4786286704993665, .2369268850561891, .2369268850561891];
  let sum = 0;
  for (let i=0;i<5;i++) { const t = tangent(c,mid+half*nodes[i]); sum += weights[i]*Math.hypot(t.x,t.y); }
  return half*sum;
}
function roots(a: number, b: number, c: number) {
  if (Math.abs(a) < 1e-10) return Math.abs(b) < 1e-10 ? [] : [-c/b];
  const d = b*b-4*a*c;
  return d < 0 ? [] : [(-b-Math.sqrt(d))/(2*a), (-b+Math.sqrt(d))/(2*a)];
}
function validateCurves(list: readonly Cubic[]) {
  for (const [i, c] of list.entries()) {
    const candidates = [0, 1];
    for (const key of ["x", "y"] as const) candidates.push(...roots(
      3*(-c[0][key]+3*c[1][key]-3*c[2][key]+c[3][key]),
      6*(c[0][key]-2*c[1][key]+c[2][key]), 3*(c[1][key]-c[0][key])));
    if (candidates.some(u => { const t = tangent(c, u); return u >= 0 && u <= 1 && Math.hypot(t.x, t.y) < 1e-6; })) throw new Error("Travel path has a stationary tangent/cusp");
    if (i > 0) {
      const a = tangent(list[i-1], 1), b = tangent(c, 0), length = Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);
      if (a.x*b.x+a.y*b.y <= 0 || Math.abs(a.x*b.y-a.y*b.x)/length > 1e-6) throw new Error("Travel path has a sharp join");
    }
  }
}

/** Compile once per layer. Distance lookup decouples speed from control-point
 * spacing. The bounded table is deterministic and never depends on render fps. */
export function compileTravelPath(path: TravelPath) {
  const list = curves(path);
  const table: {distance: number; segment: number; u: number; heading: number}[] = [];
  let distance = 0, heading = Math.atan2(tangent(list[0],0).y,tangent(list[0],0).x);
  table.push({distance, segment: 0, u: 0, heading});
  for (const [segment, c] of list.entries()) for (let n = 1; n <= 256; n++) {
    const u = n/256, t = tangent(c,u), angle = Math.atan2(t.y,t.x);
    distance += arcLength(c,(n-1)/256,u);
    heading += Math.atan2(Math.sin(angle-heading),Math.cos(angle-heading));
    table.push({distance, segment, u, heading});
  }
  return (progress: number) => {
    const target = Math.max(0,Math.min(1,progress))*distance;
    let low = 0, high = table.length-1;
    while (high-low > 1) { const mid = (low+high) >>> 1; if (table[mid].distance < target) low = mid; else high = mid; }
    const a = table[low], b = table[high], fraction = (target-a.distance)/(b.distance-a.distance);
    const startU = a.segment === b.segment ? a.u : 0;
    let u = startU+(b.u-startU)*fraction, lo = startU, hi = b.u;
    const c = list[b.segment];
    // Refine inverse arc length; the table provides a bounded bracket. This
    // avoids piecewise speed changes from linear interpolation of parameters.
    for (let n=0;n<8;n++) {
      const error = arcLength(c,startU,u)-(target-a.distance);
      if (Math.abs(error) < 1e-9) break;
      if (error > 0) hi = u; else lo = u;
      const t = tangent(c,u), next = u-error/Math.hypot(t.x,t.y);
      u = next > lo && next < hi ? next : (lo+hi)/2;
    }
    const p = position(c,u), t = tangent(c,u);
    const reference = a.heading+(b.heading-a.heading)*fraction, angle = Math.atan2(t.y,t.x);
    return {...p, heading: reference+Math.atan2(Math.sin(angle-reference),Math.cos(angle-reference))};
  };
}
