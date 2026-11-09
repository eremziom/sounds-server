# Digital Grid 0.2.4 — test-artwork QA

Created 2026-11-09 with shared creator guidelines v1.5. Status: **test pilot, artistic acceptance pending**.

## 0.2.4 — upward wave and light turquoise base

User requested bottom-to-top travel and a light turquoise base. Selected source
range is now y=355/900 to y=0; travel/pulse remain 0.3/0.1 s. Existing source
luminance is tinted through a registered native SVG material variant with RGB
[0.45,1,0.88] and base intensity 0.85. Only `dome-ribs` uses this material. Masks,
delay maps, original rasters, all other layer descriptors and the engine remain
unchanged. The impulse palette still excludes cyan/blue/nearby violet.

Eight focused package/wave tests passed. Real WebGL2 motion QA passed for all
six colors, repeated/overlapping beats, upward movement, pause/reset, blackout,
zoom and recovery of active waves after context loss. The first front moves
upward from y=296 at 0.10 s to y=142 at 0.23 s, with its tail near y=20 at 0.37 s.
The idle material and moving fronts were inspected visually. Current evidence
is in `.tmp/digital-grid-bass-color-qa/`, superseding earlier captures in that
directory. Existing mask-resolution/branch-routing limitations remain; this
parameter/material update does not imply final artistic acceptance.

## 0.2.3 — contrasting palette and faster downward travel

User correction: omit impulse colors that blend into the fixed blue/cyan mask.
The bass palette is white/orange/green/red/pink/yellow. Only that palette changes;
all other mask cycles remain intact. Configuration now sets 0.3 s top-to-bottom
travel and 0.1 s local ribbon duration. This is 0.4 s including the last tail.
No new/revised masks, image assets, engine changes or detector settings.

Eight focused package/wave unit checks passed, including hue separation from
blue/cyan/nearby violet and exact timing/direction settings. The real WebGL2
recording passed for six distinct colors, shorter travel, repeated/overlapping
attacks, pause, reset, blackout, zoom and recovery of active waves after context
loss. Against a quiet reference, the first front moves downward from y=63 at
0.10 s to y=215 at 0.23 s, and y=340 at 0.37 s in its trailing band. Source-mask
boundaries remain unchanged. Current evidence is in
`.tmp/digital-grid-bass-color-qa/`; this supersedes earlier recordings in the same
directory. The application integration fixture uses 250 ms detected bass spacing
to verify overlapping waves with the shorter lifetime. Artistic acceptance and
the previously recorded mask/zoom limitations remain separate from these checks.

## 0.2.2 — independent color wave on every bass beat

The user explicitly approved the required bounded engine extension. Existing
`colorShift` now has an opt-in attackWave mode; the selected original
`visible-dome-ribs` mask is unchanged. All PNG/SVG files remain byte-identical.
No new image, mask, mesh renderer, audio graph or clock was added. Only the
selected layer changes; the other five retain their original cyclic descriptors.
Each new bass detector timestamp starts the next palette color as an independent
upward ribbon, even while previous colors continue traveling. This supersedes
0.2.1's simultaneous whole-mask hue modulation described below.

Actual timings: 0.8 s bottom-to-top travel, 0.24 s smooth ribbon per material
point, cyan/white/orange/green/blue/violet palette, 45% cyan background material
to make the cyan wave visible. Bass still has its original 160 ms input envelope;
that input launches rather than truncates the longer spatial wave. The vertical
delay field is computed in source coordinates without changing the original
diagonal delay-map file. This is an upward front across real ribs, not routed
hexagon-branch transport. Known material boundary/zoom resolution limitations
remain, and artistic acceptance is pending.

Validation passed:

- 153 Infinite Zoom unit tests, including palette wrap, weaker overlapping
  attacks, bounded memory at supported detector cadence, no events in silence,
  pause/reset, isolation of the other masks, legacy mapped lava flow and logical
  record/replay of event tokens.
- Real WebGL2 wave recording with six successive attacks: all six palette colors
  launch on their own hit and older waves retain independent ages. Against a
  quiet reference, the first wave's changed-material centroid moves upward from
  y=341 to y=246 between 0.10 s and 0.37 s; this establishes spatial movement,
  not only pixel differences. Initial, lower/upper front, overlapping-color and
  blackout/zoom frames were visually inspected.
- Active-wave pause and context loss/recovery preserve the exact rendered frame;
  reset clears waves/palette. Tests include complete travel after the final beat.
- The full existing WebGL2 renderer suite passed, including journey transitions,
  legacy behaviors, insectoid artwork and context recovery. Production build and
  translation validation passed.
- The authenticated application UI test uses pulsed 100 Hz audio and observes
  actual wave uniforms from live detection: at least two waves coexist. It also
  checks shared detector controls, playback pause/resume, blackout, reset, scene
  parking, immersive mode and the same audio/canvas/context.

Evidence is in `.tmp/digital-grid-bass-color-qa/`: `motion.webm`, `report.json`,
`idle.png`, `frame-36.png`, `frame-52.png`, `frame-90.png`, `frame-160.png` and
other phase samples. The recording uses a quiet second renderer as an offline
reference only; the product still uses one renderer. Timing follows the existing
60 Hz simulation. Wave geometry is intentionally broad and vertical, rather than
per-branch tracing; RGBA8 fallback was not separately evaluated for this new mode.

Commands:

```powershell
node --experimental-strip-types --test tests/infinite-zoom-*.test.mjs
node tests/infinite-zoom-digital-grid.browser.mjs --bass-color
node tests/infinite-zoom-renderer.browser.mjs
pnpm --filter ui build
node tests/infinite-zoom-integration.browser.mjs --digital-ui
```

## 0.2.1 — bass color on one unchanged mask (guidelines v1.6)

The latest user instruction supersedes the temporary unassigned state below.
`dome-ribs` alone binds its two static hue rotations to the existing `kick`
signal. The free-running white pass is removed only from this layer. Its original
visibility/influence masks are preserved, including both dome and upper-tower
material; the selection is not restricted to the tower. The other five masks
keep byte-identical descriptors and cycles. No white/black material or extra
mask/layer/controller was reintroduced. `git diff --name-only` reports no PNG/SVG
changes and no engine changes; package layer/asset counts remain unchanged.

Six focused unit checks passed, verifying repeated attack response, idle base
hue, independence of all five other mask cycles, pause/reset and blackout.
`node tests/infinite-zoom-digital-grid.browser.mjs --bass-color` passed with seven
synthetic detected attacks through the existing kick sampler and binding path,
including blackout, zoom, pause and reset. Initial and first/second attack-frame
captures were inspected: the existing material changes visibly from cyan to
warm/green hues, while motorcycle colors continue their cycle. The response is
an envelope-driven hue excursion returning to cyan, not a persistent palette
advance on every beat. The existing 160 ms input and 1/60 s binding smoothing
remain; no exact 160 ms visual cutoff or beat-relative travel is claimed.

Evidence: `.tmp/digital-grid-bass-color-qa/report.json`, `motion.webm`, `idle.png`
and `frame-*.png`. Production build/translation validation passed. The targeted
authenticated application UI check covers the reused detector controls and
existing blackout. Existing mask-boundary/zoom-resolution limitations remain.

Commands:

```powershell
node --experimental-strip-types --test tests/infinite-zoom-digital-grid.test.mjs tests/infinite-zoom-environment-blackout.test.mjs
node tests/infinite-zoom-digital-grid.browser.mjs --bass-color
pnpm --filter ui build
node tests/infinite-zoom-integration.browser.mjs --digital-ui
```

## Tower experiment withdrawn (2026-11-09)

At the user's request the white/black tower experiment was completely removed:
no extra tower masks/material, black backing, attack bindings or propagation
adapter remain. Original 0.2.0 manifests, source-material masks, full multicolor
tower flow and packaging script were restored byte-for-byte from the pre-test
repository revision. Existing environment blackout remains unchanged. The shared
KickMonitor, music-reaction checkbox and bass frequency configuration remain in
the digital panel/immersive controls, explicitly labeled as unassigned. Bass
attack configuration is not connected to any mask; assignment is deferred to
the user's next step. Historical `.tmp/tower-attack-qa/` captures describe only
the withdrawn experiment and are not evidence of current application behavior.

## Application blackout control (2026-11-09)

The application panel now exposes **Wygaszenie otoczenia** for Digital Grid,
including immersive mode. A presentation-only adapter controls the normal
manifest's `environment` layer: immediate exact blackout, then a three-second
smoothstep reveal on disable using existing simulation evaluation steps. Light
layers are not replaced, recolored, reset or covered. The adapter preserves its
preference and brightness across scene parking and journey Reset. Pause freezes
reveal; no wall-time animation, engine change or audio manipulation was added.

Focused checks:

```powershell
node --experimental-strip-types --test tests/infinite-zoom-environment-blackout.test.mjs tests/infinite-zoom-digital-grid.test.mjs tests/infinite-zoom-scene-reveal.test.mjs
pnpm --filter ui build
node tests/infinite-zoom-integration.browser.mjs --digital-ui
```

Eight focused unit tests passed, including exact zero/one endpoints, a half-way
brightness of 0.5 at 90 steps, untouched protected phases, parking/pause/reset,
bridge forwarding and the existing insectoid reveal. Production build and
translation validation passed. The targeted authenticated browser check passed and exercises
the visible checkbox, paused frame changes, retained preference/frame after
parking, reset, paused reveal, playback/resume and immersive controls with the
same audio element, canvas and WebGL context. The existing package motion/zoom
recording remains evidence for the unchanged protected artwork and masks; this
UI addition does not establish production acceptance of the known mask seams.

## 0.2.0 — exaggerated diagnostic colors

User-requested revision: much stronger visible cyan, white, orange, green, blue and violet before refining motorcycle boundaries. Mask domains, visibility/influence PNGs and delay maps were not edited. Original source and normal environment remain intact. Only the protected layers use the authored SVG luminance-to-cyan material variant, two composed existing delayed hue rotations and a periodic white pass. Untinted glow is deliberately reduced to avoid washing out the hues. No engine or application code was changed for this revision. See `diagnostic-color.json` for the material/operator contract.

The updated focused unit tests validate the material asset and full 2pi hue excursion in every light group, plus the existing blackout/pause/reset checks. The 28-second WebGL2 recording covers complete cycles, blackout, eight-second reveal and combined zoom/pan. Frame samples now include every simulation second. The browser palette check counts highly saturated colors only inside strong motorcycle masks before camera travel; all six colors must each occupy more than 500 pixels in a sampled frame. This verifies actual rendered material colors, not only changed pixels or descriptor values.

Visual review of the 3-, 8- and 10-second samples shows saturated blue/violet/orange, a light neutral pass, and clearly separated green/cyan/orange bands respectively. Remaining wheel/body timing seams are deliberately retained for later mask refinement. Colored texture includes shadow variation from the registered source. Disabling color modulation leaves the cyan diagnostic material; it does not restore original white panels. The white pass is synchronized across groups, while the hue propagation retains separate spatial delays. This is deliberately exaggerated mask inspection, not final artistic lighting.

The detailed original baseline checks below describe revision 0.1.0 unless superseded above.

## Executed checks

From `apps/ui`:

```powershell
node --experimental-strip-types --test tests/infinite-zoom-digital-grid.test.mjs tests/infinite-zoom-pilot.test.mjs
node --experimental-strip-types scripts/check-messages.mjs
node tests/infinite-zoom-digital-grid.browser.mjs
```

Six unit checks passed, including asset dimensions/critical references, package validation, six source-material light groups, unchanged protected behaviors in blackout, continuous opacity strength, pause/reset and existing pilot controls. Translation validation passed for Polish, English and Spanish.

The browser harness used the actual existing engine and WebGL2 renderer with RGBA16F color output. It recorded 28 simulation seconds (delayed startup plus two 12-second cycles), a complete 8-second environment reveal, blackout from zero, combined lights, camera zoom and pan. Checks passed for fully opaque coverage, exact black sky sample, active lights during blackout, render-only pause, exact reset and no runtime/shader errors. This is offline test playback, not a second application clock. No music or application audio integration was modified.

Evidence lives in repository-local `.tmp/digital-grid-qa/`: `motion.webm`, `report.json`, initial/blackout/time-series PNG captures. Inspect the recording for visual acceptance; numerical pixel changes alone do not prove readable flow. The neutral plate, source-mask overlay, blackout zero/three-second frames and zoomed combined-effects frame were inspected visually. Material masks follow real bright panels, seams, dome ribs and road lights; black gaps stay fixed. White panel shading and long body/wheel strips change locally rather than changing exposure of the whole image. No geometry deformation is assigned.

## Remaining limitations and uncertain boundaries

- Source is 1672×941; registered runtime texture/masks are 1600×900. Artwork coordinates are 3840×2160, **not native raster 4K**. Close zoom softens small details.
- Classification between wheel rings and adjacent body panels can change timing direction across white material. Review both boundaries and the angular phase wrap in close motion before production acceptance.
- Dome lighting is a spatially staggered field across integrated ribs. It is not individually routed along each hexagonal branch. Wheel and body timing supply the authored longitudinal strip flow.
- Some cyan road reflections are intentionally protected in blackout; neutral floor reflections are excluded. Fine antialiased highlights and threshold falloff need artistic review; blackout deliberately exposes the source-material selections sharply.
- Full-screen inspection and sampled zoom frames do not establish every aspect ratio, all shadow ramps or a manual review of every recorded frame. RGBA8 fallback, context recovery and an authenticated `/animations` UI session were not re-tested for this new package.
- Historical 0.1.0 limitation: blackout was only package/API-tested. The application control described above supersedes that limitation.
- No engine extensions were made. The only engine-directory edit for this task is the declarative `digital: "digital-grid"` studio catalog entry; animation implementations, renderer, clocks and audio lifecycle remain unchanged. Existing uncommitted engine changes predate this task.
