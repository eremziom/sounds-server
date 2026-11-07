# Twelve-behavior test artwork

One authored schema 2 package with thirteen layers: an opaque labeled background
and one masked layer per operator. All operator layers share one transparent
3840×2160 object atlas. The separate `master.svg`/`master.png` is the static visual
reference; animation is defined by `manifest.json`, not baked into the PNG.

The SVG artwork is authored in 3840×2160 coordinates. `master.png` is rasterized
directly at 3840×2160 from that vector source, with no smaller raster or upscale.
Visibility/influence/depth/flow maps are deliberately 480×270 linear data, aligned
in normalized artwork coordinates. They are not color artwork substitutes.

From `apps/ui`:

```sh
node scripts/create-behavior-atlas.mjs
node scripts/preview-behavior-atlas.mjs
```

Open the printed local URL (default `http://127.0.0.1:4174`). The builder also
writes `.tmp/infinite-zoom-behavior-atlas/index.html` at the repository root: a
self-contained offline preview containing the actual engine, installed Three.js,
manifest and SVG assets, with no CDN, image API or other external requests.

Start/Pause and Reset control the one fixed-step test engine. The effect selector
isolates one layer without resetting phases. Strength zero provides a neutral
comparison. Enable camera motion for parallax: three towers use different depth
values, so their motion relative to the background differs. Bend uses a gradient
influence map to keep the lower stem still. Glow is local emission; flow is the
engine's bounded field deformation. The preview uses the same modules as the
application, but is a standalone technical test, with no music player or product
route. It does not modify the accepted three-artwork Loop.

Run the browser validation:

```sh
node --experimental-strip-types tests/infinite-zoom-behavior-atlas.browser.mjs
```

It checks real panel pixel changes for eleven periodic operators, camera-driven
parallax, pause/freeze, exact reset, layer isolation, one renderer, resource
admission and no external requests. It also exports `master.png` from the SVG and
checks the PNG header is exactly 3840×2160. This is technical behavior evidence;
artistic validation with final layered artwork remains a separate production step.
