# Forest stream — layered artwork pilot

Select **Leśny strumień — scena warstwowa** on `/animations`, then play music.
The technical twelve-operator scene and the original three-world journey remain
separate choices. All use one renderer/context, canvas, clock and audio element.

## Actual artwork layers

The scene has three independently generated raster sources: a complete opaque
forest/river plate, transparent finely painted foreground ferns, and translucent
river mist. Built-in `image_gen` was used; no CLI or separately billed API call
was made. See [prompts.md](prompts.md) and [production.json](production.json).

| Layer | Source / matte | Motion |
| --- | --- | --- |
| Background | full opaque plate | fixed environment and coverage behind moving layers |
| River | same registered plate, traced river visibility and shore influence masks | wave + flow on the actual water texture |
| Stationary banks/rocks | registered plate, complementary stationary mask | fixed above the river deformation |
| Mushroom light | plate, localized masks following mushroom clusters | pulse, glow and restrained colorShift |
| River mist | generated raster alpha matte, no filled vector shapes | translate, displace and opacity |
| Left ferns | generated raster alpha, left-cluster mask, root influence | bend and rotate |
| Right ferns | generated raster alpha, right-cluster mask, root influence and depth | scale and camera-relative parallax |

The ground and water exist *before* the foreground plants and mist are added.
Moving a frond reveals complete moss, rocks or earth rather than a hole or a
second copy of that frond. This is clean-plate-first authoring, not a claim of
semantic segmentation or AI inpainting of the old neon Forest sample.

At rest the water layer samples the exact same source as the background. Version
0.2.0 retraces both banks and explicitly excludes three exposed rock/islet shapes.
A complementary fixed layer preserves those rocks and banks above the river.
The separate influence map uses an offline conservative distance to non-water:
wave and flow together cannot reach protected source pixels even at full strength.
It includes three texels of safety for mask edges/filtering; sampling strength is
rounded down. Near obstacles the water slows to zero, rather than dragging rock
pixels into neighboring water. This avoids needing an inpainted water texture in
this bounded pilot; no new raster generation or source-pixel edits were made.
See `scripts/lib/forest-river-masks.mjs` for authored polygons and guard parameters.
The water is a textured painted area, not moving strokes on a still river.
Flow remains periodic deformation; it does not simulate continuous advection.
Generated foliage and mist retain their original alpha, including partial edges.
Roots are pinned with a separate gradient, not a visibility fade used as motion.

## Resolution and ownership

The generated sources are **1672×941** (plate/mist) and **1671×941** (foliage).
They are preserved unmodified as PNGs. This is **not native 4K**. Embedded-image
SVG containers register those rounded dimensions to the same normalized 16:9
frame; the renderer decodes 1600×900 textures. SVGs here contain the actual raster
paintings; only invisible masks/maps are drawn as vector data. There are no
runtime image-generation calls, external SVG dependencies or upscaled 4K files.
The authored coordinate domain remains 3840×2160, as required by schema 2.
Critical texture estimate is 34,560,000 bytes plus the viewport target/driver
overhead, within the unchanged 256 MiB budget.

Only the active scene is GPU-resident. The two bounded studio CPU packages are
cached independently. Switching between them parks each phase/camera state;
the original journey remains parked until explicitly selected. Audio pause/end
freeze animation; scene selection does not pause/seek playing music. Studio
controls share strength settings, and Reset affects only the selected scene.
These studio views have no authored zoomThrough portal. Replay export remains
disabled there because the current replay schema does not encode studio choices.

## Rebuild and review

From `apps/ui`:

```sh
node scripts/create-layered-forest.mjs
node --experimental-strip-types --test tests/infinite-zoom-layered.test.mjs
node tests/infinite-zoom-renderer.browser.mjs --layered-only
node tests/infinite-zoom-integration.browser.mjs
```

The generator packages existing source PNGs and rebuilds masks/maps/manifest; it
does not call image generation or modify the PNG pixels. The WebGL fixture checks
all twelve effects on actual painted regions, genuine alpha, opaque background,
exact studio/journey restoration, GPU budget, one context and portrait/wide
camera coverage. River regression also checks exact stationary rock/bank patches
over 24 combined wave/flow frames, while requiring visible water movement. A unit
test independently probes the worst-case displacement and bilinear footprints
against the authored water map. Integration checks the actual selector, pause, playback and
immersive controls. Captures are in `.tmp/infinite-zoom-artwork/forest-layered-*`.

Artistic acceptance, target-device performance and a separately prepared native
4K master remain review gates. No claim of a full automated production pipeline.
