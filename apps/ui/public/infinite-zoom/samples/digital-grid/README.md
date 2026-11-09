# Digital Grid

Standalone cinematic light-cycle test artwork, inspired by TRON: Legacy.
Select **Cyfrowy świat — motocykl świetlny** in `/animations`.

The shared bass-attack monitor and frequency-range configuration, also available
in immersive mode, drive the **existing `visible-dome-ribs` mask**. This selection
includes cyan dome ribs and upper-tower lights, not the tower alone. Each detected
attack selects the next palette color and launches an independent upward wave.
Waves overlap without restarting: white, orange, green, red, pink, yellow, repeat.
Cyan, blue and nearby violet remain excluded from the impulse palette.
Travel takes 0.3 s, with a 0.1 s ribbon at each point and a light turquoise material
base for clear contrast. It has no independent color cycle; the other five masks
keep their original cycles. Enable
music reaction; the color strength control adjusts the response. The selected
layer uses a registered turquoise SVG material variant; all masks and original
image assets remain unchanged. The withdrawn white/black tower experiment stays removed.

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


0.3.0 adds the tiny background aircraft and attached luminous wake: one constant-speed left-to-right passage at simulation seconds 30?150, with stationary skyline occlusion, motorcycle color cycle, blackout, pause/resume and reset. Review: `node tests/infinite-zoom-digital-grid.browser.mjs --aircraft` (from apps/ui); evidence in `.tmp/digital-grid-aircraft-qa/`. The test uses the music-gated scene clock, not track seek position. See the latest authoring brief and qa.md for pilot limitations.


0.3.1 fixes the aircraft palette: graphite hull/cyan rails stay constant; only the wake cycles colors. A tiny dorsal light flashes for 100ms every 5 seconds. The aircraft review now also includes 11 seconds of material/flash recording at normal speed after the accelerated path.
