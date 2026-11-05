import type { PreparedEngine, StepContext } from "../core/contracts.ts";
import { createArtworkRenderer, type ArtworkRendererOptions } from "../renderer/artwork-renderer.ts";
import { createArtworkInstance, type ArtworkInstance } from "./artwork-instance.ts";
import { loadArtwork, type AssetDecoder } from "./artwork-loader.ts";

export interface ArtworkPreparationOptions extends ArtworkRendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly manifest: unknown;
  readonly instanceId: string;
  /** Future fixed-dt behavior evaluator; must not render or schedule frames. */
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
    graphics = createArtworkRenderer(options.canvas, loaded, instance, options);
    signal.throwIfAborted();
    let disposed = false;
    const renderer = graphics;
    const lease = {
      instance,
      step(context: StepContext) {
        if (disposed) throw new Error("Artwork is disposed");
        options.evaluate?.(instance, context);
      },
      render() { renderer.render(); },
      reset() { instance.reset(); renderer.render(); },
      resize: renderer.resize,
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
