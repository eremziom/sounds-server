# Obca planeta — miasto insektoidów

Revision 0.5.0 adds a new **Światło w chitynowych obramowaniach** experiment.
It lights selected pixels of the existing painted ribs, preserving their facets
and shadows. Full-resolution material masks protect glazing and openings; no
new stroke image or replacement building is drawn. The old rejected fiber draft
remains archived and is not reused.

In `/animations`, enable this separate checkbox and **Rozbłyski** to see packets
travel through three selected rib bands every six seconds. The checkbox starts
off; it retains phase and its preference across pause, scene parking and Reset.
Off restores the underlying scene. See [the new brief](rim-authoring-brief.md)
and [QA](qa.md). Static mask/lighting review precedes animated review; final
artistic acceptance remains with the user.

Revision 0.4.1 withdraws the rejected 0.4.0 fiber-outline experiment and its
checkbox. The earlier 0.3.0 scene/effects are restored. The manually drawn lines
did not fit the architecture or align adequately with its actual contours.
Technical motion checks did not establish visual acceptance. Rejected draft
files are archived under `.tmp/rejected-fiber-overlay/` at repository root and
are not referenced by the active manifest or served with the artwork package.

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

Nineteen compositing layers use the registered plate and separate transparent
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
are preserved. Critical GPU texture estimate: 61,920,000 bytes (59.05 MiB), before
viewport target/driver overhead.

See [authoring brief](authoring-brief.md), [prompt](prompts.md),
[production data](production.json) and [QA evidence and limitations](qa.md).
The volcanic-plume revision has its own [brief](smoke-authoring-brief.md) and
[exact generation/editing prompts](smoke-prompts.md).

Rebuild package after authored-mask changes:
`node apps/ui/scripts/create-insectoid-planet.mjs` from the repository root.

## Optional 60-second reveal

In the alien studio controls, enable **Odsłanianie sceny z ciemności — 60 s**.
The opening keeps the chitin rim material and selected lava visible while the
rest of the scene is almost black. Rim lighting is enabled automatically; keep
the existing glow effect enabled for travelling impulses. The scene fades to its
normal exposure over 60 seconds of confirmed playback. Pause freezes progress.
**Odsłoń ponownie** restarts just this reveal; disabling it restores full exposure
immediately. The mode is off by default and does not reset the camera or music.

The application adapter builds the optional composition from the ordinary
manifest plus `reveal-black.svg`. The protected lava copy now retains the original
color/pulse/glow behaviors from the first frame. A subsequent renderer correction
adds optional RGBA16F composition and static output dithering to preserve shadow
gradations during the long reveal. Engine operators and the simulation clock are
unchanged. See the appended authoring brief and QA entry for scope and evidence.
