# Time mechanism — black and gold

On `/animations`, select **Mechanizm czasu — czerń i złoto** and play music.
The original journey, layered stream and technical behavior pilot remain available.

The dark machine plate contains complete recessed backing before moving wheels
are added. Five separated raster rotors have actual transparent teeth gaps, spoke
openings and axle holes. Their pivot registration is authored from the measured
source hub. Fixed bearing caps are composited above the rotors. Local source-based
highlight masks follow moving rotors; three separate pulse masks select only
small fixed bearing interiors. No lighting pass covers the whole frame.

Three large rotors make one revolution in 24 simulation seconds; the middle
counter-rotates. The two smaller rotors turn in opposite directions with a
12-second period. A common user speed multiplier preserves their timing ratios.
This is an artistic mechanism driven through hidden stages, not a CAD tooth-contact
or physics simulation. The background's detailed microgears are stationary.

## Controls and lifecycle

Only applicable controls are offered: gear-drive speed (`rotate`), selected bearing
`pulse`, and metal edge glints (`glow`). Turning drive off freezes its current orientation;
turning it back on resumes from there. Changing speed does not snap teeth to a new
phase. Audio pause/end freeze the one simulation clock. Reset restores authored
initial rotor phases. Camera motion inspects details without restarting the scene.
Immersive mode uses the same controls, audio element, canvas and renderer.

Version 0.4.0 keeps lighting localized. Pulse affects only three
small jewel/bearing interiors (upper left, upper right, lower center), with
different phases and gain 0.2..1.8. Glints use a source-luminance ramp from 0.46
to 0.70 sRGB inside a small soft reflection footprint on each rotor. This selects
bright tooth edges and engraved highlights while leaving dark spokes/backing
unchanged. The reflection adds warm-white light `[1,.92,.72]` from source
luminance above 0.06 linear, at authored intensity 3 and temporal sharpness 3.
This produces bright specular edges rather than only scaling their existing gold
color. Each rotor has a different phase/frequency; the first rotor begins at a
peak, so a paused initial comparison is meaningful too. Specular contribution
fades out on partial-alpha silhouette pixels, protecting holes and dark backing.
No exposure, contrast or blanket brightness adjustment is applied. Subtle mode
attenuates controls to 25%. The glint mask moves with its rotor; structural axle
caps remain protected. There is no screen-space bloom halo.

Each studio retains its own camera, rigid angles and behavior phases while parked.
Only the selected scene is GPU-resident. Selection does not pause/seek playing
music. No portal has been added to the original Loop. Studio changes are excluded
from the current logical replay format, so replay export stays disabled here.

## Mask and source review

See [authoring-brief.md](authoring-brief.md) for the generic production rules and
their application to this artwork. The first rotor generation had unwanted pale
partial-alpha background; it was rejected and a targeted built-in image edit
cleaned the matte. `gear-source.png` retains that intermediate for provenance;
only `gear.png` is packaged for the renderer. No CLI/API fallback was used.
Exact prompts are in [prompts.md](prompts.md). Original PNGs remain unchanged;
hashes, actual sizes and pivot metadata are in [production.json](production.json).

The plate is 1672×941 and the cleaned rotor source is 1254×1254. Full-frame SVG
image containers register the raster artwork into the engine's normalized 16:9
domain. They are not vector stand-ins. Runtime textures are 1600×900 and the
critical GPU texture estimate is 47,520,000 bytes plus the viewport target/driver
overhead, within the unchanged 256 MiB admission budget. **This pilot is not a
native-4K master.** No AI inference or image-generation call runs during playback.

## Rebuild and verify

From `apps/ui`:

```sh
node scripts/create-clockwork.mjs
node --experimental-strip-types --test tests/infinite-zoom-spin.test.mjs tests/infinite-zoom-clockwork.test.mjs
node tests/infinite-zoom-renderer.browser.mjs --clockwork-only
node tests/infinite-zoom-integration.browser.mjs
```

The packaging script makes no generation calls. Unit checks cover strict schema,
immutable metadata, fixed pivot through complete turns, deterministic speed,
freeze/resume/reset, source hashes and budget. WebGL checks genuine axle-hole
alpha for all five assets, counter-rotation, exact fixed bearing/bridge pixels,
parked-state return, context recovery and portrait/wide coverage. App integration
checks the selector, applicable controls, speed slider, actual playback/pause and
one canvas/context. Captures are in `.tmp/infinite-zoom-artwork/clockwork-*`.

Artistic acceptance and performance on target hardware remain review gates.
