import type { PreparedEngine, StepContext } from "../core/contracts.ts";
import { createArtworkRenderer, type ArtworkRendererOptions } from "../renderer/artwork-renderer.ts";
import { createArtworkInstance, coversViewport, getCoverView, type ArtworkInstance } from "./artwork-instance.ts";
import { loadArtwork, type AssetDecoder } from "./artwork-loader.ts";
import { createCameraController } from "../camera/camera-controller.ts";

export interface ArtworkPreparationOptions extends Omit<ArtworkRendererOptions, "camera"> {
  readonly canvas: HTMLCanvasElement;
  readonly manifest: unknown;
  readonly instanceId: string;
  /** Optional fixed-dt input hook; must not render or schedule frames. */
  readonly evaluate?: (instance: ArtworkInstance, context: StepContext) => void;
  readonly decode?: AssetDecoder;
}

/** Loads critical CPU resources and draws the initial GPU frame before resolving
 * readiness. Wire render to the controller's existing single frame loop. */
export async function prepareArtwork(options: ArtworkPreparationOptions, signal: AbortSignal) {
  const loaded = await loadArtwork(options.manifest, signal, options.decode);
  let graphics: ReturnType<typeof createArtworkRenderer> | undefined;
  try {
    signal.throwIfAborted();
    const instance = createArtworkInstance(options.instanceId, loaded.manifest);
    let viewport = options.viewport;
    const camera = createCameraController(pose => {
      const base = instance.getSnapshot().layers.find(layer => layer.id === loaded.manifest.coverage.baseLayerId)!;
      return coversViewport(base, getCoverView(viewport.width, viewport.height), pose);
    });
    graphics = createArtworkRenderer(options.canvas, loaded, instance, { ...options, camera });
    signal.throwIfAborted();
    let disposed = false;
    const renderer = graphics;
    const lease = {
      instance,
      camera,
      step(context: StepContext) {
        if (disposed) throw new Error("Artwork is disposed");
        options.evaluate?.(instance, context);
        instance.stepBehaviors(context);
        camera.step();
      },
      render() { renderer.render(); },
      reset() { instance.reset(); camera.reset(); renderer.render(); },
      resize(next: ArtworkRendererOptions["viewport"]) { renderer.resize(next); viewport = Object.freeze({ ...next }); },
      getDiagnostics: renderer.getDiagnostics,
      dispose() {
        if (disposed) return;
        disposed = true;
        try { renderer.dispose(); } finally { loaded.dispose(); }
      },
    } satisfies PreparedEngine & Record<string, unknown>;
    return lease;
  } catch (failure) {
    try { graphics?.dispose(); } finally { loaded.dispose(); }
    throw failure;
  }
}
