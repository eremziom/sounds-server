# Phase 2 runtime and artwork contract

Implemented 2026-11-07. The authoritative product specification remains
`docs/infinite-zoom/`. This document specifies the concrete runtime data choices
for Phase 2, so offline production can target a versioned, tested boundary.

## Package compatibility

`parseArtworkPackage` is the validating entry point. Packages and nested data are
detached and immutable; runtime phases, handles and camera state live separately.
Schema 1 retains its three operators, 3840×2160 assets and existing portal schema.
Schema 2 enables the extensions below. Unknown fields and versions are rejected.
Existing Forest/Nebula/Cavern packages remain schema 1 and retain their authored
composition. Their three-world Loop remains a bounded demo, not a scene planner.

Artwork coordinates are always 3840×2160, origin top left, x right, y down. Schema
2 assets may use different pixel resolutions with the same 16:9 aspect ratio;
both dimensions must be positive integers (minimum 16×9, maximum edge 8192).
This separates artwork coordinates from texel density; it does not generate or
upscale any content. Files must actually decode to the declared dimensions.
Root-relative PNG/WebP/SVG paths under `/infinite-zoom/` remain the URI policy.

## Asset semantics

| `kind` | Channels and interpretation | Storage estimate |
| --- | --- | --- |
| `image` | sRGB color, straight alpha; converted to linear for composition | RGBA8 |
| `mask` | red 0..1; separate visibility or motion-influence references | R8 |
| `depth` | red 0..1, increasing toward viewer; parallax reference depth is explicit | R8 |
| `flow` | linear RG mapped as `2*RG-1` to artwork x/y vector components | RGBA8 |
| `detail` | sRGB full-frame registered replacement for a layer image | RGBA8 |

All maps share normalized artwork coordinates and use linear filtering. No
per-texture mip chains are allocated. Referenced masks/depth/flow must be critical
readiness assets. Missing critical maps fail readiness; optional detail failures
retain the valid base image. No image inference runs during playback.

A visibility mask controls alpha, while an influence mask attenuates an operator.
Region influence blends inherited and overridden results. Maps may contain
gradients; their channels never serve interchangeably as alpha and motion data.

Layer `lods` is an optional list of `{assetId,minPixelsPerTexel}`. Assets are
noncritical `image`/`detail`, larger than the base image, registered to the whole
canvas. Threshold 1..8 measures projected pixels per **base-image texel**. The
highest eligible resident level is selected. Detail is requested only when its
decoded/GPU reservation plus critical residents and the target fits the budget.
Base layers and transition-critical assets are never evicted. Budget refusal,
load failure and device size limits retain the base image. Quality downgrade
evicts optional CPU/GPU assets; subsequent demand can reload them. Late async
results are cancelled/closed on eviction/disposal. Detail selection is frozen
during approach and rollback. Context restore rebuilds from owned descriptors.
Base-layer detail must be opaque; foreground detail may preserve transparency.
Production QA must verify identical registration/content and correct alpha at
LOD boundaries. This version supports full-frame LOD, not sparse tiled patches.

## Operators

Every operator has stable `id`, integer `order`, `kind` and typed `params`.
Common optional fields: `enabled` (default true), `weight` (0..1),
`influenceMaskAssetId` and `modulation`. All parameters are finite and checked.
All operators accept `frequencyHz` 0..10 and `phase` ±2π. Phase advances in fixed
1/60-second steps; rendering never advances it. Camera-relative parallax does
not oscillate on its own. Repeated placements share the same artwork phase.

| Kind | Additional parameters | Runtime meaning |
| --- | --- | --- |
| translate | x,y ±512 pixels | periodic displacement |
| rotate | radians ±0.2; pivotX,pivotY in artwork | periodic rotation about pivot |
| scale | x,y ±0.2; pivotX,pivotY | periodic relative scale, always positive |
| parallax | amount 0..256; depthAssetId; referenceDepth 0..1 | bounded camera-relative shift weighted by depth difference |
| bend | amount ±256; pivotX,pivotY; axis x/y | quadratic displacement increasing away from pivot |
| wave | amplitude ±256; wavelength 16..7680; axis x/y | periodic sinusoidal displacement |
| displace | amplitude 0..256; fieldAssetId | periodic field displacement sampled at original UV |
| flow | amplitude 0..256; fieldAssetId | periodic field displacement sampled at composed UV |
| pulse | amount 0..1 | oscillatory light intensity |
| opacity | base,amount 0..1, base±amount within 0..1 | bounded alpha envelope |
| colorShift | hue ±π; saturation ±1; lightness ±0.5 | hue rotation, saturation multiplier and lightness offset |
| glow | amount,threshold 0..1 | local emissive contribution above threshold |

Flow is a bounded procedural deformation, not accumulated particle advection.
Glow is emission in the existing composition pass, not a screen-space bloom
buffer. These choices keep memory bounded and map requirements explicit. A
future advection/bloom implementation must declare its additional contract.

Inheritance is artwork → layer → region; the same ID replaces an inherited
definition. `enabled:false` explicitly disables inherited behavior. Stable order
is numeric `order`, then ASCII ID. Spatial sampling inverses run in reverse
composition order. Visual stage order is ColorShift → Pulse → Opacity → Glow.
Final output uses premultiplied alpha in linear light.

## Constraints and audio bindings

Artwork, layer and region may define `constraints`:
`maxDisplacement` (0..512 pixels), `maxSlope` (0..0.5), `maxIntensity` (1..4) and
`softStrength` (0..1). Hard limits intersect across scopes; soft strength can only
attenuate. Conservative operator envelopes are checked after inheritance;
unsafe compositions are rejected. The shader additionally caps composed sampling
displacement. This is not a proof of arbitrary field smoothness: map gradients,
layer edges, inpainting and artistic deformation still require production QA.
The opaque base must remain unmasked and cannot use nonneutral spatial or alpha
operators until an extended-coverage contract is separately implemented. This
preserves coverage under all foreground deformations.

Bindings target an operator's strength, not arbitrary JSON parameters. Each has
`id`, signal (`bass`,`mid`,`high`,`energy`), operation (`multiply`,`add`,`replace`),
integer `priority`, `min`,`max` within -1..1, attack/release seconds 1/60..10.
Lower priority executes first, ties use ASCII ID. Each binding owns smoothing
state. Missing/nonfinite input approaches neutral (0 for add, 1 otherwise).
The combined strength is clamped to 0..1, so audio cannot exceed authored limits.
The existing overall intensity adapter remains bounded to 1..1.25.

## Camera

`planCameraPath` creates bounded-duration waypoint segments; `anchorTour` creates
a zoom/translate/return route from authored anchors. `camera.followPath` certifies
every fixed-step pose, velocity and acceleration before replacing live motion.
Unsafe paths fail transactionally. Default maxima: translation 960 px/s and
1920 px/s², zoom 0.75/s and 1.5/s², angle 0.25 rad/s and 0.5 rad/s². Callers can
set stricter/different positive limits. Segments last 1/60..60 seconds, at most 64
per path. C0/C1 retargeting, exact bookmarks and scene-local rebasing remain.
Bookmark count is bounded to 64, including full frame.

Audio timing is smoothed to 0.75..1.25 and changes the duration of **new camera
intentions**. It does not change coordinates, warp an active trajectory or alter
the authored zoomThrough endpoint/timing. Thus active transition proofs and
handoff continuity remain valid. Full semantic music-driven planning is Phase 4.

## Diagnostics, quality and replay

Diagnostics retain 128 events and 600 frame samples. Events support all five
severities, bounded instance/transition IDs, and at most 16 numeric/boolean detail
fields. No arbitrary URLs, exception payloads or images enter the event log.
Resource snapshots include optional-load counts, decoded texture admission
estimates, camera timing and recording status. These are not GPU timing queries.

Four existing quality profiles remain. Downgrades need two pressured windows;
upgrades need ten nearly entirely <14ms windows; both use cooldown. Critical
handoff freezes adaptive decisions. Only target size/DPR and optional detail
change; operator semantics and simulation never depend on quality.

The application records fixed-tick commands and normalized signals after reset.
`recordLogical` opts in; default recorder capacity is 36,000 ticks (10 minutes),
configurable to at most 432,000 (2 hours). At capacity recording stops and marks
`complete:false`; it never silently drops the prefix. Export is available under
session diagnostics as JSON. Reset starts a new recording. Package IDs/versions,
seed and replay schema are captured; version mismatches are rejected before
execution. `replayLogicalJourney` applies commands and fixed steps to prepared
ports, with no audio playback, RAF, or promise of cross-device identical pixels.
The caller prepares/disposes its one engine and supplies the same modulation
adapter. Recordings start from Reset, not arbitrary mid-journey snapshots.

## Verification and remaining product work

`tests/infinite-zoom-phase2.test.mjs` covers schema compatibility, all operators,
constraints, bindings, optional ownership, camera preflight and logical replay.
The WebGL suite exercises real pixel changes for all 12, stationary rendering,
reset, combined depth/flow/gradient shaders, context recovery, detail eviction,
budget fallback and replay through real prepared-engine commands. Existing
three-world handoff/loop and application audio integration remain regression gates.

This delivers the Phase 2 runtime capabilities. Final artwork production,
authoring UI, AI generation, arbitrary scene streaming/planning, sparse detail
tiles, accumulated fluid simulation and artistic approval are not claimed by
these technical tests. The current three samples do not automatically acquire
the nine new authored effects merely because the engine supports them.
