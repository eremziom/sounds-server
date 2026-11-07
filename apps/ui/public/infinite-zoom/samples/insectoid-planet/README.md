# Obca planeta — miasto insektoidów

Standalone test scene in `/animations` → **Obca planeta — miasto insektoidów**.
Start music to advance the existing simulation. Solo each of the eight controls,
then combine them and try camera movement. Pause preserves the current state.

- **Oddychanie membran / scale:** three separately pinned internal membranes,
  distinct pivots, frequencies and phases; fixed ribs and architecture.
- **Kolory / colorShift:** independently timed city lamps, foreground cool edge
  reflections, lava seams, wet ground reflections and organic membrane interiors.
- **Pulsowanie / pulse:** local light and membrane envelopes.
- **Rozbłyski / glow:** material highlights plus three occasional internal-cloud
  electrical glows, with different deterministic periodic envelopes.
- **Falowanie gorącego powietrza / wave:** three small guarded pockets above lava.
- **Pojawianie się i zanikanie oparów / opacity:** two separately phased wisps.
  Disabling opacity leaves static vapor visible; it stops the fading effect.
- **Kłębienie dymu / flow** and **Odchylanie pióropusza / bend:** one distant
  plume above the right volcano. Its lower attachment stays fixed; upper curls
  deform, sway and fade. Opacity also softens its upper body. For combined smoke
  review, enable flow, bend, opacity and glow; Solo isolates each operator.

Fifteen compositing layers use the registered plate and separate transparent
vapor/smoke assets. The original painting is preserved as `source.png`; a soft
local clean-background patch replaces its fixed lower smoke column in the
runtime plate. The crater and solid terrain are excluded. Four material masks
select actual colored details within authored boundaries; three membrane pairs
separate visibility from distance-guarded influence; three storm masks attenuate
illumination within the cloud sky. Painted foreground/midground/background depth
does not imply movable parallax planes. There is no portal or engine extension.

Source generated with built-in image_gen: **1672×941**. Runtime SVG registration:
**1600×900**, engine coordinates 3840×2160. This is not native 4K artwork.
Source, hash, exact prompt, authored boundaries and reproducible packaging script
are preserved. Critical GPU texture estimate: 51,840,000 bytes (49.44 MiB), before
viewport target/driver overhead.

See [authoring brief](authoring-brief.md), [prompt](prompts.md),
[production data](production.json) and [QA evidence and limitations](qa.md).
The volcanic-plume revision has its own [brief](smoke-authoring-brief.md) and
[exact generation/editing prompts](smoke-prompts.md).

Rebuild package after authored-mask changes:
`node apps/ui/scripts/create-insectoid-planet.mjs` from the repository root.
