# Digital Grid

Standalone cinematic light-cycle test artwork, inspired by TRON: Legacy.
Select **Cyfrowy świat — motocykl świetlny** in `/animations`.

The shared bass-attack monitor and frequency-range configuration, also available
in immersive mode, drive the **existing `visible-dome-ribs` mask**. This selection
includes cyan dome ribs and upper-tower lights, not the tower alone. Each detected
attack selects the next palette color and launches an independent upward wave.
Waves overlap without restarting: cyan, white, orange, green, blue, violet, repeat.
Travel takes 0.8 s, with a 0.24 s ribbon at each point and a dim cyan material
base for clear contrast. It has no independent color cycle; the other five masks
keep their original cycles. Enable
music reaction; the color strength control adjusts the response. No masks or
images were changed. The withdrawn white/black tower experiment stays removed.

Use **Wygaszenie otoczenia** in this scene's panel (also available in immersive
mode). Enabling it immediately hides the environment while preserving animated
protected lights. Disabling it reveals the environment over three seconds of
playback; audio pause freezes the reveal. Scene parking and explicit journey
Reset retain the preference. No engine changes or new image assets are required.

- White/black foreground motorcycle, luminous cyan/amber roads, hexagonal domes and black sky.
- Existing **Traveling light and color** control drives exaggerated diagnostic color propagation through cyan, blue, violet, orange, green and white; **Local light impulses** controls six material groups. Turning color modulation off leaves the authored cyan diagnostic material. Mask refinement is deferred.
- No geometry displacement or portal. The existing camera can move/zoom over the image.
- `manifest.json`: normal scene. `blackout-manifest.json`: optional authored dark variant for package consumers. Environment reveal uses existing APIs, described in [authoring-brief.md](authoring-brief.md).
- [prompts.md](prompts.md): exact built-in image_gen prompt. [production.json](production.json): source dimensions, hash, timings and mask counts. [qa.md](qa.md): actual motion/zoom evidence and limitations.

Repackage from `apps/ui`: `node scripts/create-digital-grid.mjs`.
Original generated `source.png` is preserved; runtime `plate.png` is registered at 1600×900, not native 4K.
