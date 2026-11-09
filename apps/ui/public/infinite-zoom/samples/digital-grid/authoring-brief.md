# Digital Grid — light cycle / test artwork 0.2.4

Authoritative creator instructions: [shared guidelines v1.5](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md), read 2026-11-09.

User direction: a cinematic TRON: Legacy digital world, white/black futuristic motorcycle in the foreground, luminous roads, hexagonal domes, contrasting colors and completely black background. This is a standalone test scene, without a portal or changes to engine animation implementation.

## Scene-specific application

Revision 0.2.4 reverses the bass wave to **bottom-to-top** and changes only the
selected layer's base to **light turquoise**. Travel remains 0.3 s, local ribbon
duration 0.1 s, and the contrasting impulse palette remains unchanged. The
source-coordinate range is y=355/900 to y=0. An authored native SVG material
variant, `turquoise-material.svg`, embeds the same registered original plate and
uses the existing luminance color-matrix method with RGB tint [0.45,1,0.88].
Base intensity is 0.85. This retains texture and source registration, while the
other five layers keep their existing material/palette. No image generation,
mask/map revision, original raster modification or engine change is involved.
Previous revision notes below are historical for direction and base color.

Revision 0.2.3 follows the user's contrast/timing correction: an impulse must not
be blue or close to the fixed blue/cyan material. The attack palette is now
white, orange, green, red, pink and yellow; cyan/blue/nearby violet are removed
from this palette only. Other masks retain their existing palette and cycles.
Travel is shortened to 0.3 seconds and reversed to **top-to-bottom**, with a
0.1-second ribbon at each point (the last tail clears after 0.4 seconds).
Source-coordinate endpoints are y=0 to y=355/900. No mask, map, material image,
engine code or detector settings change. The previous 0.2.2 settings below are
historical, superseded for direction, timing and the bass-wave palette.

Revision 0.2.2 replaces the simultaneous whole-mask bass hue change with actual
traveling palette waves. The user explicitly approved a bounded extension of the
existing engine color effect for this purpose. Masks, images, mesh renderer,
camera and fixed-step clock stay unchanged. Shared guidelines v1.6 apply.

Each observed detector timestamp toggles the normalized `kickEvent` token once.
The existing kick envelope remains 160 ms; this token triggers a complete wave,
not merely 160 ms of whole-mask color. Each event selects the next color in
cyan/white/orange/green/blue/violet order. Independent events coexist, so a later
beat never restarts or recolors an earlier wave. Fixed-step wave ages stop on
pause/parking and reset only with the journey. The input token is also retained
by logical replay. Missing analysis clears active waves; disabling color strength
restores the untinted diagnostic material without changing wave timing.

The selected original mask is `visible-dome-ribs`, including dome ribs and the
upper tower. A vertical delay field is evaluated from source y=355/900 to y=0
without creating or modifying any mask/map asset. The old diagonal delay map
saturates across much of the tower and would compress its visible travel, so it
remains packaged unchanged and is not used for this attack mode. Travel is
0.8 seconds, and each point sees a smooth 0.24-second color ribbon. Texture is
stationary; only the masked material color changes. A 45% cyan base intensity
ensures that the cyan palette wave is visible too. Material shading and all
visibility/occlusion boundaries remain registered to the original artwork.

The effect retains at most 32 active events. Its supported <=1-second travel and
<=0.24-second pulse cover every supported 40 ms detector interval within that
bound. This is a vertical front across the authored material, not geodesic
tracing through every hexagonal branch. Overlapping ribbons blend in event
order. The other five masks retain their original cyclic descriptors. Previous
0.2.1 details below are historical and superseded for the selected layer.

Revision 0.2.1 configuration follows shared guidelines v1.6. The user's latest
instruction binds bass attacks to **one existing mask**, without changing masks
or restoring the rejected tower-specific experiment. The selected `dome-ribs`
layer retains its original `visible-dome-ribs` visibility mask and
`influence-dome-ribs` glow mask. This is the whole existing selection: cyan dome
ribs and upper-tower lights. It is deliberately not cropped to the tower.

Only this layer's color descriptors change: the two existing hue rotations use
zero frequency and a fixed phase, with existing `kick` replace bindings (range
0..1, attack/release smoothing 1/60 s). Their color amplitude follows each
detected bass impulse. The selected layer's free-running white pass is removed,
so its color is steady cyan in silence, shifts strongly on a hit and returns to
cyan after decay. Existing local glow remains unchanged. All five other layers
retain their original color/glow descriptors, masks and spatial delays. The
existing selected delay map remains packaged unchanged but is not used by this
attack-driven hue change: this step does not implement beat-relative spatial
propagation or persistent next-color stepping. The response follows the existing
160 ms kick envelope with the existing short binding-smoothing tail. It does not
hold white, black out the mask, or require a new FE controller or engine change.

All image, visibility, influence and delay assets remain byte-identical to 0.2.0.
The original source/brief provenance below retains guideline version 1.5. The
shared bass detector UI and existing blackout control are reused unchanged.

All geometry is fixed: motorcycle, wheel silhouettes, black panel gaps, domes and roads. Only selected source-material light changes. No displacement means no new background is exposed and no inpainting margin is required. Camera sampling uses existing coverage constraints; no added clock or renderer.

Numerous integrated white panel strips, segmented wheel rims, architectural joints and road bands provide local impulse sites across foreground, middle and distant planes. Source luminance/chroma determines fine material visibility within inspected selection domains. Domain boundaries alone never draw luminous lines. Keep visibility, lighting influence and phase/delay files distinct. Actual dark gaps and opaque foreground occlusion are retained from the source plate.

Continuous timing fields cover the whole domain independently of visibility. Wheel bands use angular travel; body strips use longitudinal rear-to-front travel; road bands travel from the vanishing point toward foreground; dome bands use spatially staggered travel (not individual geodesic path tracing). Twelve-second cycles and up to four-second travel give distinct gradients.

Revision 0.2.0 follows the user's explicit diagnostic request: make cyan, white, orange, green, blue and violet plainly visible before refining motorcycle masks. Existing mask pixels and domains remain unchanged. An authored SVG material variant applies a luminance-to-cyan color matrix to the embedded registered plate, preserving shading/texture and registration. The original image remains untouched. Neutral white cannot be hue-rotated into saturated colors; this chromatic material supplies that missing source chroma. Two existing delayed colorShift descriptors, each bounded at pi, compose a full 2pi hue excursion. A separate existing periodic saturation/lightness descriptor adds a white pass, with deliberately exaggerated colors/contrast on its return. Gentle untinted local glow preserves the diagnostic hue instead of washing it out. This is package authoring only: no new shader, behavior, renderer, clock, React animation or engine edit. Color strength applies to the diagnostic material; turning it off leaves its cyan base rather than restoring the original white material. This temporary diagnostic is not a final lighting grade.

Optional blackout is an authored variant manifest: opaque black coverage beneath identical animated protected light layers. Their phases, masks and behaviors remain present from tick zero. In the normal manifest, environment is a separate source layer; its opacity can be varied continuously 0..1 through the existing layer-transform API. The blackout variant starts with an opacity behavior at zero; changing existing opacity behavior strength from 1 to 0 reveals the environment. These are two alternative controls, not additive reveal controllers. Protected light remains the same source material over the environment; there is no doubled additive emission. The normal manifest shares this composition at full environment opacity. No custom reveal controller or engine extension is part of this package. The application exposes the normal scene; the blackout variant and continuous reveal are package/API capabilities verified in the offline browser harness, without a new application toggle.

## Validation and boundaries

Application integration amendment: `/animations` now exposes the normal package's
environment opacity through **Wygaszenie otoczenia**, also in immersive controls.
The presentation adapter sets opacity to exactly zero when enabled and smoothly
returns to one over 180 existing fixed steps when disabled. Protected light
layers, phases, masks and color controls remain untouched. Pause/suspension and
scene parking freeze reveal progress; returning to this scene or resetting the
journey reapplies the retained state. This supersedes the earlier statement that
blackout was available only in the offline package/API. No asset revision or
engine extension is involved; `blackout-manifest.json` remains a separate option
for package consumers, not the manifest used by the application checkbox.

Inspect source, mask overlay, full cycles and repeats, combined lighting during camera movement/zoom, pause, exact black endpoint, environment opacity ramp and normal endpoint. Source reflections excluded from protected selections may disappear in blackout intentionally. Thresholds around antialiased white panels, fine dome ribs and wheel highlights require close-up review; this remains a test pilot until artistic acceptance. Record actual checks in qa.md, provenance and dimensions in production.json, and exact generation prompt in prompts.md. Do not claim native 4K from registered or enlarged raster assets.


## Aircraft test amendment ? 0.3.0 (2026-11-09)

This revision follows [shared artwork-authoring guidelines 1.6](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md). Earlier provenance and fixed-geometry descriptions above document the earlier releases; this amendment adds one separated moving layer.

A tiny angular black aircraft, approximately 25 by 10 pixels in the 1600?900 registered view, crosses at y=180. Its cyan inset rails, eight panel slots, engine and thin tapered 81-pixel luminous wake share the motorcycle's two hue rotations, white pass and gentle impulse settings. The scene retains all six dense source-material lighting groups and their original masks. The aircraft is deliberately subordinate to the architecture, barely identifiable at full frame. Its native SVG is authored in the packaging script; no generated bitmap or revised source plate is claimed. Visibility is SVG alpha; lighting influence is a separate luminance-derived mask of the inset rails, slots and wake, protecting the dark fuselage from the white pass; the independent delay map supplies longitudinal gradient timing. The wake is attached to and moves uniformly with the aircraft.

The source nose is x=701. One straight, constant-speed path moves it to x=1640 between simulation seconds 30 and 150, without repetition or easing. It emerges from the left large dome at the beginning, passes behind the intervening thin spires and main tower, and disappears behind the right dome. The wake follows through the same occlusion. These times count confirmed, unpaused scene simulation (the existing music-gated journey clock); seeking or changing tracks does not rewind that journey. Reset alone rearms the test. The aircraft is hidden before and after its single journey.

A separate, stationary opaque skyline matte is derived from the first source pixel above RGB maximum 24 in each column, retaining fine spires and filling dome interiors. Unlike the luminous rib selection, this matte represents solid foreground architecture. It clips aircraft alpha/emission in artwork coordinates, including under camera movement and zoom, independently of environment brightness. It has no influence on the motorcycle or architecture. No inpainting is needed: the moving separated SVG exposes the unchanged complete plate/black coverage. The path and wake fit the separated layer's full-canvas registered bounds until final occluded exit.

Blackout leaves aircraft colors and impulses running on the same phases, subject to the explicit 30-second appearance gate. Environment reveal uses the existing control. Pause freezes position, palette and wake. The extra critical assets are one 1600?900 SVG image, one R8 skyline matte, one R8 material-influence mask and one 400?225 R8 delay map; all are budgeted before readiness.

Engine extension, distinct from asset production: schema-2 optional rigid `travel` (startSeconds, durationSeconds, x/y displacement) and `occlusionMaskAssetId`, evaluated/composited by the existing instance/renderer. Coverage layers cannot travel or be occluded. Ordinary translate, spin, audio and camera implementations retain their existing contracts.

QA must cover the entire passage, first dome edge, tower entrance/exit, right dome and trailing wake, pause/reset, saturated/white color changes, blackout/reveal and camera zoom. The threshold-derived skyline is a pilot matte: very dark silhouette edges and anti-aliasing at dome contours remain uncertain and need artistic review; it is not a manually traced production mask. See qa.md for actual evidence and limitations.


## Aircraft correction - 0.3.1 (2026-11-09)

User feedback supersedes 0.3.0's shared hull color cycle. Following [shared authoring guidelines 1.6](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md), split the authored vector into three registered layers: fixed graphite hull with permanent cyan rails/panel slots, independently color-cycling tapered wake, and one tiny pale-cyan dorsal navigation reflection. Hull has no colorShift, white-pass, pulse or glow descriptors. Its material gradients preserve contour and dark gaps continuously, including blackout. Original numerous scene impulse sites remain unchanged. The wake alone retains the earlier motorcycle hue/white/impulse settings and delay map, so longitudinal color flow continues without bleaching or extinguishing the ship.

The dorsal beacon is an approximately two-pixel highlight with a restrained local halo, not a whole-hull exposure change. It emits a compact 100ms sin-squared flash once every 5 seconds, peaking 50ms into each interval and exactly off between pulses. All three layers share identical travel and stationary skyline occlusion; pause, parking and reset preserve their synchronization. Appearance gate/path/timing remain 30-150 seconds; the first fully visible flashes depend on architectural occlusion. No source raster, original lighting selection or scene geometry is revised. Native SVG assets are generated from the packaging script, without image-generation calls.

Engine extension separate from artwork: optional `glow.params.pulseSeconds` (1/60 to min(0.25, period)) supplies a compact pulse on the existing fixed-step evaluator. It requires positive frequency and excludes sharpness. Legacy glow remains unchanged. Glow-only emission layers may use validated rigid travel, with no spatial behavior operators/spin. This ensures the beacon is invisible between flashes instead of showing a permanent source sprite. Additional critical full-canvas assets are the separated wake and beacon; total package admission is checked below 64 MiB. The old combined influence image is no longer referenced.

QA requires stable rendered hull pixels through complete color/white cycles, changing wake pixels, brief isolated flashes, full occluded traversal, blackout, zoom and pause/reset. The skyline's very dark boundaries and small spire edges remain pilot uncertainties from 0.3.0.
