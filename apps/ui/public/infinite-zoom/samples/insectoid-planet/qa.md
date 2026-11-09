# QA — insectoid planet, 2026-11-07

## Revision 0.5.4 — downhill volcanic color, 2026-11-09

Follows shared artwork guidelines v1.3 and `lava-authoring-brief.md`. The existing
source plate supplies all visible lava texture. A 1600x900 source-chroma material
mask selects branching seams on the two distant volcanoes and middle slope;
253 / 594 / 588 texels exceed 10% visibility. The separate 400x225 delay field
gradually delays the color envelope from each summit toward its lower slope by
up to five seconds. Orange-to-purple-to-orange cycles repeat every twelve
seconds after the initial source-orange frame. Existing near-plan colors,
precise sky silhouettes, smoke and membrane motion are retained.

The two critical R8 data maps add 1,530,000 estimated texture bytes. Total package
texture estimate is 66,330,000 bytes; reveal adds its existing 576-byte curtain,
remaining below the existing 64 MiB artwork regression bound. New layers reuse
the plate and delay mask, including the fully animated protected lava copy above
the reveal curtain. No additional image texture, renderer, clock or audio owner.

Engine work is separate: `colorShift` gains optional paired delay-map/travel-time
parameters, documented in `phase2-contract.md`; legacy colors retain their sine
envelope. Fixed-tick startup and periodic wrapping preserve orange initialization,
downhill direction, pause, Reset, control strength and context restoration.

Validation from `apps/ui`:

- `node --experimental-strip-types --test tests/infinite-zoom-*.test.mjs`:
  all 143 pass, including three new mask/timing/blackout tests. The existing
  emission-validation test now finds its sky layer by ID rather than assuming
  it is the final raw layer in the package.
- `node tests/infinite-zoom-renderer.browser.mjs --lava-only --sky-high-precision`:
  actual WebGL2/RGBA16F passes initial orange, color control, pause, Reset,
  full-blackout animation and context restoration. At 2/4/6/8/10/12/16 seconds,
  242 / 885 / 1,186 / 1,236 / 1,222 / 791 / 885 pixels differ by more than five
  display-code levels. Outside-mask difference is zero. Eighteen logical seconds
  of combined movement and zoom cover a full cycle plus initial downhill delay.
- `node tests/infinite-zoom-renderer.browser.mjs`: complete renderer regression
  passes, including ordinary RGBA8 studio effects, local boundaries, transitions,
  Loop, camera continuity, context recovery and existing reveal checks.
- `pnpm --filter ui build` from repository root: passes translations, TypeScript
  and the production build.
- `node tests/infinite-zoom-integration.browser.mjs`: passes actual application
  readiness/cancel, shared audio graph, scene selection, pause/end/next-track,
  immersive controls, Reset, transitions and audio/visual failure isolation.

Evidence in repository-root `.tmp/infinite-zoom-artwork/`: source overlay
`volcano-lava-mask-review.png`, `lava-initial.png`, `lava-{2,4,6,8,10,12,16}s.png`,
`lava-blackout-6s.png`, `lava-motion-{0,60,...,480}.png`, `lava-motion.webm` and
`lava-qa.json`. Source overlay, full-frame transition and zoomed animated cycle
samples were visually inspected: the upper streams turn purple while lower
branches retain orange, followed by the delayed return. Color remains attached
to the original source seams as the camera moves.

Remaining uncertainty: source resolution and warm antialias/glow around the
craters limit exact separation of the faintest lava from reflected light. The
mask intentionally retains warm textured stream edges; it does not recolor
whole mountains. The propagated parameter follows vertical height, not a
fluid simulation or per-branch path length. These samples and technical tests
do not replace user artistic acceptance or target-device performance review.

## Revision 0.5.3 — static sky contours, 2026-11-09

Shared authoring guidelines v1.2 apply; see `authoring-brief.md` and
`sky-authoring-brief.md`. Source-traced curved chitin silhouettes, separate narrow
antennae, connected city roofs, mountain skyline and open sky through upper
arches replace the coarse polygons. Static clearance is now a 0–1.2-source-pixel
sky-side antialias ramp, rather than the previous 8–16 pixel horizon and 2–7 pixel
architectural guards. The moving smoke's 55-source-pixel exclusion is unchanged.
The source plate, all motion masks, audio timing and engine code are unchanged.

Combined source-derived light support above 3% now covers 207,580 texels, with
eight-sector distribution 27,400 / 32,504 / 29,683 / 25,082 / 37,607 / 11,865 /
19,708 / 23,731. This retains cloud texture and fills the formerly withheld sky
around buildings, including real gaps between architecture and antennae.

Validation from `apps/ui`:

- `node --experimental-strip-types --test tests/infinite-zoom-sky.test.mjs tests/infinite-zoom-high-attack.test.mjs tests/infinite-zoom-insectoid.test.mjs`:
  15 passing. Includes source-inspected protected material/clear-sky landmarks,
  packaged-mask reproducibility, silence/release, blackout and existing local
  membrane, heat, vapor, smoke and chitin behavior checks.
- `node tests/infinite-zoom-renderer.browser.mjs --sky-only --sky-high-precision`:
  RGBA16F passes pause, release, blackout, controls, context recovery, 15 logical
  seconds with all authored moving layers, full-frame flashes and left/right
  camera zooms. Outside-support pixel difference is at most 1 display code
  value, matching deterministic output dithering tolerance.
- `node tests/infinite-zoom-renderer.browser.mjs --sky-only`: RGBA8 passes the
  same checks, with zero outside-support difference and zero silent difference.

Review evidence: repository-root `.tmp/infinite-zoom-artwork/sky-mask-review.png`,
`sky-peak.png`, `sky-blackout-peak.png`, `sky-motion-{0,30,...,420}.png`,
`sky-zoom-peak.png`, `sky-motion.webm` and `sky-qa.json`. Source, enlarged left
silhouettes, full-frame peak, blackout and left/right zoom-cycle samples were
visually inspected. The clip includes combined moving smoke, membranes and
lights instead of isolating the sky overlay. This is fixed-tick QA evidence,
not a real-time performance certification or final artistic approval.

Remaining uncertainty: source antialiasing and the one-runtime-texel limits of
very fine antennae/barbs can leave small edge differences under extreme zoom.
The conspicuous, deliberately conservative dark boundary around the moving
plume is retained under the user's instruction. No per-frame plume occlusion
or engine extension was introduced. Prior QA below describes earlier masks.

## Revision 0.5.2 — high-attack sky lighting

Uses shared guidelines v1.2; see `sky-authoring-brief.md`. Two 1600x900 grayscale
data masks preserve separate safe-sky visibility and source-derived bright-cloud
influence. Final support includes 159,484 texels above 3% combined weight, spread
across all eight sky sectors (17,981 / 21,641 / 22,339 / 21,034 / 32,400 / 9,541 /
17,498 / 17,050). A 55-source-pixel expansion of the independent volcanic-smoke
alpha excludes its full motion envelope, conservatively withholding some nearby
sky light. Existing textures/source provenance, membrane breathing, local lamps,
lava, cloud-periodic glows and chitin groups are retained. Full blackout now uses
curtain opacity 1, with sky emission above it and opaque environmental coverage.

Static review inspected the source painting, red support overlay
`.tmp/infinite-zoom-artwork/sky-mask-review.png`, and actual renderer peak/full-frame
and zoom captures (`sky-peak.png`, `sky-zoom-peak.png`). The initial hard exclusion
edges were feathered before final packaging. Light follows existing cloud texture
and bright openings; no drawn light blobs or new painting. Thin spire and mountain
contours remain conservative manually authored boundaries requiring artistic
review. The expanded smoke exclusion intentionally reduces highlights around the
plume; no claim of exact per-frame semantic segmentation is made.

Validation performed from `apps/ui`:

- `node --test tests/infinite-zoom-*.test.mjs`: 140 passing, including mask
  distribution, protected landmarks, emission-only schema/base restrictions,
  silent initialization, release, glow control and blackout placement.
- `node tests/infinite-zoom-renderer.browser.mjs`: full existing renderer,
  transition, three-world Loop, Phase 2, studio, smoke and rim regression passes.
- `node tests/infinite-zoom-renderer.browser.mjs --sky-only`: RGBA8 proof of
  zero-emission identity, exact unchanged outside support, release, paused flash,
  black environment with active lights, six-second motion sequence, zoom and
  context recovery. A six-second WebM is exported to
  `.tmp/infinite-zoom-artwork/sky-motion.webm`.
- `node tests/infinite-zoom-renderer.browser.mjs --sky-only --sky-high-precision`:
  final masks also pass with RGBA16F and output dithering; all eight sectors light.
  Maximum outside-support and no-emission display differences are 1/255, versus
  exact zero in RGBA8. This is the measured conversion/dithering precision limit,
  not evidence of brightening buildings. Final high-precision review artifacts
  overwrite the corresponding review PNG/WebM filenames.
- `node --test tests/infinite-zoom-kick.browser.mjs`: actual high-frequency WAV
  playback drives five GPU sky-emission peaks, median 200.4 ms apart for 200 ms
  input spacing. Bass breathing and mid/high indicators still pass; one graph,
  source and canvas are retained.
- `pnpm --filter ui build` (from repo root) and focused ESLint pass.

Motion/zoom tests establish bounded operation, masking and synchronization;
final visual acceptance of brightness and fast repetition remains separate.
No remaining automated failures. High-precision display quantization and the
manual conservative silhouette/smoke margins above are known limits.

## Revision 0.5.1 — bass-attack breathing

Only the three membrane scale bindings/carriers change; their painted textures,
mask boundaries, pivots and x=.06/y=.045 envelopes stay unchanged. Source-material
rim lighting, protected lava and reveal controls are retained. The historical
near-black curtain (.995 opacity) still does not establish exact environmental
blackout required by shared authoring guidelines v1.2. No new image generation.

Focused unit command: `node --test tests/infinite-zoom-kick.test.mjs
tests/infinite-zoom-modulation.test.mjs tests/infinite-zoom-behaviors.test.mjs
tests/infinite-zoom-phase2.test.mjs tests/infinite-zoom-insectoid.test.mjs` —
38 passing. Covers one real-manifest membrane expansion per 100/150 BPM kick,
synchronized membranes, initialization/reset at rest, missing-signal relaxation,
strength controls, existing sampling guards and unchanged continuous fallbacks.

`node --test tests/infinite-zoom-kick.browser.mjs` also passes with actual
100/150 BPM WAV playback. It selects the alien scene and observes the real
membrane scale uniforms submitted to WebGL: six expansion peaks at each tempo,
median peak spacing 600.4 ms / 399 ms respectively. Preview attack spacing was
602 ms / 395 ms. Pause freezes deformation; disabling modulation preserves
music playback; seek clears stale attacks; only one audio graph/source/canvas
is used. The journey recording retains normalized kick samples. Focused ESLint
passes for changed runtime, authoring script and test files.

`node tests/infinite-zoom-renderer.browser.mjs --insectoid-only` passes with
150 BPM fixed-clock impulses supplied through the real modulation port. It runs
15-second individual and combined cycles, renders camera motion/zoom and
portrait/wide coverage, verifies fixed material sites (maximum difference 0),
pause, scene parking and context restoration. At scale peak, 7,250 of 518,400
pixels differ by more than 8, maximum difference 127, while fixed sites stay
unchanged. Review captures: `.tmp/infinite-zoom-artwork/insectoid-scale-peak.png`
and `insectoid-scale-cycle-*.png`; reviewed the peak full-frame composition.
These motion-sequence assertions and captures do not replace artistic acceptance
of fast membrane motion or prove every hand-traced boundary at every zoom level.
Existing membrane-edge uncertainty remains; no mask correction was needed by
the bounded tests. Build (TypeScript and translation checks included) passes.

## Revision 0.5.0 — source-material rim-lighting retry

This is a new experiment after the user's rejection of approximate strokes.
No source illustration is edited and no new visible vector/raster line is added.
Four overlay groups reuse `plate`, with 1600×900 material masks derived from source
RGB inside manually inspected chitin bands. Painted facets, small cyan reflections
and dark crevices shape the light. Warm glass and explicit glazing polygons are
excluded. Coarser 400×225 phase maps control emission timing only.

### Static review performed before integration

Inspected enlarged original foreground/city crops, coordinate grids, mask-on-source
overlays and steady-light previews in `.tmp/chitin-rim-review/` at repository root.
The first city-band support touched glazing/incorrect leg positions; those bands
were corrected and warm glazing was more strongly excluded before animation was
wired. Material support is 19,822 nonzero texels out of 1,440,000, with over 150
distinct mask values. The visible shape is irregular source texture, not a line
drawn along the timing route. This review does not establish final acceptance.

### Technical and motion evidence

The new optional checkbox defaults off and uses existing layer opacity through
the application adapter. Global Glow strength controls emission. The new lighting
uses existing `glow`, 48 delayed phases, a six-second period, four groups with
twelve regions each and 14 samplers per material. No animation-engine algorithm,
clock, audio owner, renderer or source raster is changed. Critical texture estimate:
61,920,000 bytes. All masks are critical so toggling needs no later loading.

Focused run: 28 unit tests pass, including exact preservation of protected glazing,
nonbinary mask texture, original-plate references, ordered/repeating phases,
visibility without phase reset, rejection of old fiber assets and earlier engine
regressions. Production build passes. The original eight-effect WebGL scene
regression passes with the new lighting disabled.

Dedicated WebGL review passes two six-second cycles, actual per-pixel emission
timing at eleven material anchors across all three bands, protected glazing/sky/
rock pixels, exact disabled-frame restoration, pause-toggle identity, parked
scene return, context recovery, reset, zoom and portrait/wide coverage. Rendered
peaks land within two of the 48 phase samples of their authored anchor positions
in the measured cycles. Stronger/weaker material reflectance intentionally gives
unequal brightness; dark/occluded sections may have little or no visible emission.

Full application integration passes default-off state, visible on/off behavior,
exact paused off-frame restoration, retained scene preference, unchanged paused
tick, toggling with advancing music and the same context, and both Reset preference
states. Existing journey/Loop/readiness/failure-isolation checks also pass.

Commands from `apps/ui`:

```
node --test tests/infinite-zoom-insectoid.test.mjs tests/infinite-zoom-pilot.test.mjs tests/infinite-zoom-phase2.test.mjs tests/infinite-zoom-playback.test.mjs
node tests/infinite-zoom-renderer.browser.mjs --insectoid-only
node tests/infinite-zoom-renderer.browser.mjs --rims-only --rims-motion
node tests/infinite-zoom-integration.browser.mjs
```

Build: `pnpm --filter ui build` from repository root. Review artifacts are saved
as `.tmp/infinite-zoom-artwork/chitin-rims-*`, including native camera captures,
foreground/city detail frames, a same-phase off/on comparison and a 12-second
motion recording. The material-mask script uses installed Next's Sharp dependency
offline to read RGB and write grayscale data maps. It does not generate new art.
One comparison-image export exceeded the browser protocol's safe message size;
artifact export now reads image data in bounded chunks, like the existing video
export. Rendering/motion checks had completed before that transfer failure.

### Remaining artistic review

Hand-authored band/occlusion boundaries still need the user's assessment. Some
rib faces are deliberately dark, so packets soften/disappear there. Timing uses
an internal route coordinate, but that coordinate never draws visible geometry.
Check whether the result reads as integrated structural light at full-frame size,
not merely isolated reflections; inspect phase joins and corner transitions in
motion. Source resolution limits strong zoom. No production-readiness or artistic
acceptance claim follows from the static preview or technical test passes.

## Earlier rejected/accepted revisions

## Revision 0.4.1 — rejected fiber draft withdrawn

The user rejected revision 0.4.0: generic thin lines were stylistically foreign
to the insectoid architecture and poorly aligned with the painted building edges.
This is a failed artistic result. Ordered glow phases, pixel differences and
toggle tests did not validate material integration or contour accuracy. Earlier
claims that the inspected contour alignment was adequate were not justified.

The active package restores the 0.3.0 artwork/effects, omits all fiber assets and
layers, and removes the checkbox/application wiring. No further replacement is
introduced. Historical draft sources and the reverse patch are preserved for
review; the draft is not a production asset or an accepted sample. A future
attempt must begin with close inspection and masks of actual architectural ribs,
not another set of approximate curves over the painting.

Withdrawal verification: 21 focused unit tests passed (insectoid package, pilot,
Phase 2), including absence of fiber layers/assets. The existing scene WebGL
suite passed; build passed on a standalone rerun after an initial concurrent
build worker crashed. These checks verify safe restoration, not visual acceptance
of any new overlay. No replacement overlay is delivered in this revision.

Experimental artwork prepared under shared authoring guidelines v1.0. Technical
passes and sampled visual inspection are separate from final artistic acceptance.

## Revision 0.3.0 — one distant volcanic plume

Current package has eight applicable controls and fifteen compositing layers.
The original `source.png` is retained, along with the generated clean-background
edit, smoke draft and selected darker/softer smoke refinement. Exact prompts are
in `smoke-prompts.md`, hashes/dimensions in `production.json`, and authored
boundaries/limits in `smoke-authoring-brief.md` and the packaging scripts.

The runtime plate incorporates only a softly blended patch above the right-hand
crater. All inherited overlays sample this same cleaned plate, so none reintroduce
the old fixed smoke column. Actual decoded-asset comparisons verify that pixels
outside the conservative local patch bounds remain unchanged within two channel
levels of rasterization tolerance. Terrain is explicitly excluded from the patch.

Flow uses a seeded smooth vector map and a height-dependent influence mask.
The base at source y>=197 has zero spatial influence; the same ramp protects it
from wind bending and opacity changes. The bend has a virtual pivot below the
crater (artwork y=1100); actual attachment is separately pinned by the mask. This
provides a readable sway on the small asset without changing the engine's
full-canvas bend definition. Upper opacity stays .62.. .94, while basal glow has
its own small mask. Estimated critical texture storage is 51,840,000 bytes.

Validation performed with the commands below: 20 focused unit tests and production
build pass. Full application integration also passes: the eight real controls,
new flow/bend Solo actions, paused audio, unchanged canvas/context, journey
restoration and critical-readiness failure/retry are covered. WebGL tests pass
full 15-second cycles for all eight operators,
combined full-strength effects, pinning, actual alpha, local backing, context
recovery, exact parked-scene restoration, pause, reset, zoom and portrait/wide
coverage. Flow/bend preserve every sampled pixel in a band containing the base
and crater (source x1200..1269, y198..245) throughout all sampled phases.

At 960×540, flow changes 1,169 pixels by >8 channel levels (max 44), and bend
changes 2,443 (max 54). These are localized effects; pixel changes alone do not
establish artistic acceptance. Neutral, flow/bend peaks, combined sampled frames,
and a camera zoom toward the volcano were visually inspected. The first plume
was too bright/sharp; the selected image-tool refinement darkens it and softens
the upper boundary. No still inspection is presented as full motion approval.

The motion run with `--insectoid-motion` also passes and regenerates two review
videos at repository root: `.tmp/infinite-zoom-artwork/insectoid-motion.webm`
(full scene, 15 logical seconds), and `insectoid-smoke-motion.webm` (camera zoom
on the plume, another 15 logical seconds). Selected zoom-cycle frames are saved
alongside them. These are review captures, not a frame-rate benchmark.

Remaining review: soft patch/cloud seam, the manually traced crater rim, perceived
wind reversal over long viewing, and whether upper wisps blend enough into the
storm. Flow is periodic deformation, not sustained upward advection or emitted
particles; source resolution limits extreme zoom. Final artistic approval and
target-device performance remain outstanding. No engine animation code changed.

## Earlier revisions (historical results)

## Checks performed

Commands from `apps/ui`:

```
node --test tests/infinite-zoom-insectoid.test.mjs tests/infinite-zoom-pilot.test.mjs tests/infinite-zoom-phase2.test.mjs
node tests/infinite-zoom-renderer.browser.mjs --insectoid-only
node tests/infinite-zoom-integration.browser.mjs
```

Production build from repository root: `pnpm --filter ui build`.

Revision 0.1.0 passed these checks with 17 focused unit tests. Revision 0.2.0
adds guarded heat refraction and an independent generated-alpha vapor overlay.
The updated focused unit run passes 19 tests; build, WebGL verification and the
full application integration test pass. The initial concurrent integration run
hit a browser-protocol evaluation timeout; its standalone rerun passed both
normal playback/lifecycle and critical-readiness failure/retry scenarios.

Actual WebGL2 renderer: 15 seconds of fixed-tick simulation for each individual
effect and another 15 seconds combined at 100%. These cover full authored cycles,
including the slowest cloud envelope (13.70 s) and color shift (14.29 s).
Stationary rendering preserves exact phases/pixels. Reset restores the neutral
frame; switching away/back and context loss/recovery restore the exact frame.
Camera movement/zoom, portrait 360×640 and wide 1280×360 retain opaque coverage.
The application integration verifies the real scene selector, six applicable
controls, Solo, paused audio, same canvas/context and existing journey behavior.

At 960×540, maximum pixels differing from neutral by >8 in any channel:

| Effect | Changed pixels | Frame share | Maximum channel difference |
| --- | ---: | ---: | ---: |
| Breathing | 9,072 | 1.75% | 154 |
| Heat refraction | 949 | 0.18% | 109 |
| Pulse | 39,835 | 7.68% | 76 |
| Vapor fading | 4,249 | 0.82% | 87 |
| Color | 41,172 | 7.94% | 159 |
| Glow | 26,784 | 5.17% | 107 |

Five explicitly selected rigid rock/rib/horizon sites remain exactly unchanged
for every sampled individual and combined frame. Separate full-map safety tests
check membrane inverse sampling at both scale extrema, including 1.25 overall
modulation: samples remain inside the traced interiors with a bilinear guard.
This establishes sampling safety relative to the authored polygons, not a proof
that every hand-traced boundary semantically matches the material.

Revision 0.2.0 adds exhaustive distance-guard checks for heat sampling and actual
WebGL pixel comparisons outside its mask support: those pixels remain identical
through sampled wave phases. Vapor has real localized alpha, bounded to .24 in
the registered asset, and fully transparent sky/foreground margins. Opacity
stays within 0..1 over full cycles; edits preserve phases. Two transparent wisps
fade independently and contain no duplicated scene backing. Three authored
foreground-rock exclusions keep those silhouettes in front of the wisps.

## Visual review and remaining uncertainty

Inspected neutral, mask atlas, effect peaks, combined frames at multiple phases,
and a camera zoom. Color remains localized to authored materials; cloud glows
preserve the painted cloud texture. Foreground ribs retain their fixed outlines.
At maximum strength the membrane hue changes are deliberately conspicuous;
their interior mask margins and fine fibres need the user's visual assessment
in continuous playback. The smaller source resolution softens details on zoom.
For revision 0.2.0, inspected neutral, opacity/wave extrema and combined/zoomed
frames. Heat shimmer is intentionally subtle in the full frame: use Solo and
zoom for review. Hand-traced heat and rock-occlusion contours remain the main
uncertain boundaries. Vapor fades in place, rather than rising or advecting.

Evidence is written to `.tmp/infinite-zoom-artwork/insectoid-*` at repository root.
Optional motion capture: append `--insectoid-motion` to the renderer command;
this records a 15-second logical combined cycle as `insectoid-motion.webm`.
The capture is a review artifact, not a frame-rate benchmark.
The revision 0.2.0 motion capture was regenerated with both new effects active;
the renderer command with `--insectoid-motion` completed successfully.

Not claimed: native 4K, independently moving depth planes, full silhouette
inflation, random lightning, physically advected clouds, AI inpainting, target
device performance certification, or production/artistic acceptance. No engine
extension, extra renderer, clock, audio owner or change to the Loop is included.

## Optional 60-second darkness reveal — 2026-11-07

Application presentation variant of the accepted 0.5.0 artwork; authored source
and ordinary manifest remain unchanged. Guidelines v1.1 apply to this revision;
see the appended section in `authoring-brief.md` for masks, layers and uncertainty.

Validation:

- `node --test tests/infinite-zoom-scene-reveal.test.mjs tests/infinite-zoom-insectoid.test.mjs tests/infinite-zoom-playback.test.mjs`: 15 passing tests.
- `node tests/infinite-zoom-renderer.browser.mjs --reveal-only`: passes actual
  WebGL2 rendering through 3,600 fixed steps with every scene effect enabled.
  Completed reveal and normal exposure have identical frame hashes at the same
  animation phase. The initial unlit sky is below 5% of its normal RGB sum.
- Repeated presentation leaves progress/frame frozen. Scene parking freezes
  progress; returning and WebGL context restoration retain exposure and phases.
  Portrait 360x640 and wide 1280x360 zoom retain full opaque coverage.
- `pnpm --filter ui build`: passes translations, TypeScript and production build.
- `node tests/infinite-zoom-integration.browser.mjs`: passes the real application
  controls, paused activation, automatic rim enable, exact normal frame after
  disabling, progress during audio playback, freezing on audio pause, independent
  restart and explicit Reset. Existing readiness, journeys and audio error
  isolation tests also pass.

Review evidence at repository root `.tmp/infinite-zoom-artwork/`:
`scene-reveal-{0s,15s,30s,45s,60s,normal}.png`, zoom captures,
`scene-reveal-qa.json` and `scene-reveal-motion.webm`. The recording traverses the
full 60 simulation seconds with six fixed steps per captured frame, targeting a
3x preview at 30 fps; it is not a real-time performance measurement.

Visual inspection of 0s and 30s full-frame captures confirms the dark opening
and gradual appearance of the architecture, clouds and terrain. Source-based
lava selection also shows nearby illuminated mist and warm reflections. The
accepted textured chitin masks remain above the curtain, with original glass
exclusions and independent impulse phases. Boundaries inherit the existing
manual mask uncertainty. The minute-long technical test and review recording
do not replace the user's artistic acceptance or target-device performance QA.

### Corrections after feedback: lava phase and shadow banding

The initial reveal passed timing and final-frame checks but had two visible
defects reported by the user: its protected lava copy was static, and the RGBA8
linear composition target quantized dark surfaces into visibly coarse steps.
Earlier statements that the reveal needs no engine/shader change apply to that
initial implementation; this correction includes a renderer precision extension.

- `reveal-lava` now clones the original lava layer, including all behavior
  descriptors. Unit tests compare its color/pulse/glow phases with the original
  throughout a full minute. Actual initial-darkness rendering responds to the
  colorShift control (summed protected-region channel difference: 65,140).
- The application requests RGBA16F plus deterministic output dithering. A flat
  #303030 field exercises the same first ten seconds of the reveal. The original
  RGBA8 compositor produces only 2 distinct patch means with a maximum jump of
  13 display-code levels. The corrected compositor produces 99 distinct means
  and a maximum jump of 0.161, measured on a 32x32 patch at 5-tick intervals.
  This measures the tested ramp, not every monitor or source texture.
- Unsupported float-color extensions and a tight 60,000-byte fixture budget
  both retain a working RGBA8 output. Smaller/larger viewport changes restore
  RGBA16F/fall back to RGBA8 within budget, with opaque coverage throughout.
  RGBA8 fallback still has coarse shadow steps; output dithering alone cannot
  recover information lost in the composition buffer.
- The full 60-second WebGL2 reveal still passes final normal-frame identity,
  pause, scene parking, context restore and portrait/wide zoom checks. Updated
  full-minute accelerated recording and screenshots replace the earlier captures.
- `node --test tests/infinite-zoom-scene-reveal.test.mjs tests/infinite-zoom-insectoid.test.mjs tests/infinite-zoom-phase2.test.mjs tests/infinite-zoom-transition.test.mjs`: 43 passing tests.
- `pnpm --filter ui build`: passes translations, TypeScript and production build.

The dark and intermediate captures retain the textured material boundaries;
the lava now visibly shifts color while the surroundings remain dark. Full
artistic acceptance and target-device display/performance testing remain open.

Final regression validation also passes `node tests/infinite-zoom-renderer.browser.mjs`
(complete renderer suite, including authored transitions, loop, all operators,
other studio scenes and chitin rims) and
`node tests/infinite-zoom-integration.browser.mjs` (actual application with the
high-precision option enabled, controls, pause/restart, journey and audio failure
isolation). The integration harness retains its drawing buffer solely for stable
cross-task pixel comparisons; production retains its original buffer lifecycle.
