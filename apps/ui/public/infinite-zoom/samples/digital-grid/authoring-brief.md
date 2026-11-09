# Digital Grid — light cycle / test artwork 0.2.0

Authoritative creator instructions: [shared guidelines v1.5](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md), read 2026-11-09.

User direction: a cinematic TRON: Legacy digital world, white/black futuristic motorcycle in the foreground, luminous roads, hexagonal domes, contrasting colors and completely black background. This is a standalone test scene, without a portal or changes to engine animation implementation.

## Scene-specific application

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
