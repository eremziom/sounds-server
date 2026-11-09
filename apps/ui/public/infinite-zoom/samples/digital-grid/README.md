# Digital Grid

Standalone cinematic light-cycle test artwork, inspired by TRON: Legacy.
Select **Cyfrowy świat — motocykl świetlny** in `/animations`.

The scene panel retains the shared bass-attack monitor and frequency-range
configuration, also in immersive mode. **No bass attack is bound to any mask.**
The tower uses the original multicolor artwork again; the white/black tower
experiment, its additional masks and its propagation adapter were withdrawn.

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
