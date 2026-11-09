# Smooth layer flight paths

Implemented 2026-11-09 following the user's request for curved flights, heading
alignment and acceleration/deceleration. This extends the existing schema-2
`layer.travel` contract, independently of camera trajectories and the local
sinusoidal `translate` operator. The current Digital Grid package keeps its
approved straight flight; only the engine and test fixtures gain curved routes.

## Coordinates and timing

Existing `{startSeconds, durationSeconds, x, y}` remains valid and unchanged.
Alternatively supply `path` instead of `x`/`y`. Every path starts at displacement
`{x:0,y:0}` and uses artwork pixels (3840 by 2160, positive y downward), relative
to the separated object's source location. All point/control offsets are bounded
to x in [-3840,3840], y in [-2160,2160]. A layer's base transform composes with
the resulting rigid pose. The package parser detaches and freezes path data.

The existing instance's 60 Hz ticks determine position. Travel is hidden before
`startSeconds` and at/after `startSeconds + durationSeconds`. It does not repeat.
Pause, stop, track end and scene parking preserve the journey; seeking or changing
tracks does not reset it. Reset rewinds it. Context restoration reconstructs the
same pose; logical replay requires the same package/version and fixed-step inputs.
There is no new audio graph, renderer, timer or React animation loop.

## Waypoints: wave or rounded turns

```json
{
  "startSeconds": 30,
  "durationSeconds": 120,
  "path": {
    "kind": "spline",
    "points": [
      {"x": 0, "y": 0},
      {"x": 350, "y": -100},
      {"x": 750, "y": 100},
      {"x": 1200, "y": -100},
      {"x": 1700, "y": 0}
    ],
    "tension": 0
  },
  "easing": "ease-in-out",
  "orientToPath": true,
  "pivot": {"x": 1646.4, "y": 432}
}
```

`points` contains 2 to 65 positions, including an explicit first `{0,0}`.
The engine constructs a cardinal/Catmull-Rom spline through every waypoint.
`tension` defaults to 0 and accepts 0 to 0.95: higher values shorten the handles
and tighten turns. The path can overshoot between waypoints; inspect it rather
than treating the waypoint polygon as an exact motion boundary. Derived controls
must satisfy the same offset bounds. Consecutive duplicates, zero tangents and
cusps are rejected. A reversal needs an authored smooth turn, not a sharp U-turn
at the same point. A point count of 65 produces at most 64 cubic segments.

## Explicit cubic Bezier: arc or composed route

```json
{
  "startSeconds": 30,
  "durationSeconds": 120,
  "path": {
    "kind": "bezier",
    "segments": [
      {
        "control1": {"x": 400, "y": -220},
        "control2": {"x": 1200, "y": 160},
        "to": {"x": 1700, "y": 0}
      }
    ]
  },
  "easing": "linear",
  "orientToPath": true,
  "pivot": {"x": 1646.4, "y": 432},
  "headingOffsetRadians": 0
}
```

`segments` contains 1 to 64 cubics. The first segment begins at `{0,0}`; each
following segment begins at the previous `to`. At joins the incoming and outgoing
tangents must have the same direction (positive dot product, normalized cross
product magnitude at most 1e-6). Arc-length parametrization then preserves
continuous direction and velocity despite differing handle lengths. Stationary
tangents at endpoints or inside a cubic (norm below 1e-6) are rejected during
package validation; sharp corners cannot be silently accepted as smooth flights.
Circular arcs can be approximated with cubic Beziers; there is no separate exact
circle/arc primitive or sine-wave operator in this contract.

## Speed

`durationSeconds` sets total travel time. Optional `easing` applies to normalized
**distance along the whole path**, not to each segment's raw cubic parameter:

| Easing | Distance fraction at time fraction t | Result |
| --- | --- | --- |
| `linear` (default) | t | Constant speed |
| `ease-in` | t squared | Accelerates from rest |
| `ease-out` | 1 - (1-t) squared | Decelerates to rest |
| `ease-in-out` | t squared times (3-2t) | Starts and ends at rest |

This also works with legacy straight displacement. There is no per-waypoint
dwell, authored per-segment speed profile, live retargeting or automatic banking.
Every separated layer compiles its immutable curve once. A bounded 256-interval
table per cubic, five-point quadrature and bracketed inverse-length refinement
decouple speed from control-point spacing. This is deterministic numerical
integration, not an analytic exact arc-length solution. Heading is sampled from
the cubic's actual tangent and unwrapped through positive/negative pi so normal
turns and loops do not cause full-turn snaps.

## Rotation, pivot and occlusion

`orientToPath` defaults to false. Enabling it requires `pivot` in absolute source
artwork coordinates: choose a point inside the actual hull. Otherwise rotating a
full-canvas separated texture would make the object orbit the canvas center.
The pivot follows the displacement path exactly. `headingOffsetRadians` defaults
to 0, accepts [-2*pi,2*pi], and compensates for artwork whose forward direction
is not positive x. Pivot and heading offset are rejected without orientation.

For multipart objects give hull, attached wake and beacon identical travel data,
including the same absolute pivot. Their relative registration is preserved.
Existing `occlusionMaskAssetId` stays fixed in artwork coordinates and clips each
fragment after translation/rotation, also during zoom and blackout. Motion cannot
be assigned to the coverage base or combined with rigid spin. Glow-only emission
layers may travel and align to heading. Existing color and flash behavior clocks
remain independent of path speed.

The current wake is an **attached rigid sprite**. It rotates with the aircraft;
it does not accumulate a curved trail along the history of its route. Authors
must separately assess artwork sampling margins, material details and occlusion
under maximum rotation/combined effects using the shared artwork guidelines.
This engine extension does not establish artistic acceptance of a new artwork.

## Verification

From `apps/ui`:

```text
node --experimental-strip-types --test tests/infinite-zoom-travel.test.mjs tests/infinite-zoom-digital-grid.test.mjs tests/infinite-zoom-artwork.test.mjs tests/infinite-zoom-spin.test.mjs tests/infinite-zoom-phase2.test.mjs tests/infinite-zoom-environment-blackout.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node tests/infinite-zoom-digital-grid.browser.mjs --trajectories
```

41 focused tests pass, including nine new flight tests for curve shape, distance
speed, easing, pivot/base-transform composition, tangent continuity/unwrapping,
validation and deterministic replay/reset. Constant-speed samples of the tested
arc stay within a 0.2% distance variation bound. This is a tested fixture bound,
not a universal error bound for every possible control configuration.

The WebGL fixture clones the existing package in memory without changing its
published scene assets. It covers an arc, a waypoint wave and a multi-segment
loop over 18 simulation seconds, with actual heading rotation, speed easing,
blackout, zoom, pause, reset and context restoration. Measured changed pixels
never leak into fully opaque architecture in the sampled frames, including after
rotation/zoom. Samples from the arc, wave and rotated loop were inspected at full
frame: the hull stays registered to its wake and is occluded by the dome during
the turn. Reproducible artifacts are in `.tmp/infinite-zoom-trajectories-qa/`:
`report.json`, `motion.webm` and the per-route PNG samples. This verifies runtime
integration, not production mask quality, every extreme curve or live playback
on all hardware. Existing dark skyline boundary uncertainties remain.
