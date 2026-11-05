import type { PreparedEngine, StepContext } from "../core/contracts.ts";
import { createArtworkRenderer, type ArtworkRendererOptions } from "../renderer/artwork-renderer.ts";
import { createArtworkInstance, coversViewport, getCoverView, type ArtworkInstance } from "./artwork-instance.ts";
import { loadArtwork, type AssetDecoder } from "./artwork-loader.ts";
import { createCameraController } from "../camera/camera-controller.ts";
import { FULL_FRAME } from "../camera/camera-math.ts";
import { createTransitionCoordinator, estimatedTextureBytes, type ArtworkLease } from "../transition/transition-coordinator.ts";

export interface ArtworkPreparationOptions extends Omit<ArtworkRendererOptions, "camera"> {
  readonly canvas: HTMLCanvasElement;
  readonly manifest: unknown;
  readonly instanceId: string;
  readonly evaluate?: (instance: ArtworkInstance, context: StepContext) => void;
  readonly decode?: AssetDecoder;
  /** Admission estimate, not a measured device limit. Default: 256 MiB. */
  readonly gpuBudgetBytes?: number;
}

/** Persistent visual journey. Initial CPU artwork is a bounded one-package
 * reset cache; only active and pending artwork own GPU leases. */
export async function prepareArtwork(options: ArtworkPreparationOptions, signal: AbortSignal) {
  const budget = options.gpuBudgetBytes ?? 256 * 1024 * 1024;
  if (!Number.isFinite(budget) || budget <= 0) throw new Error("Invalid GPU budget");
  const initialLoaded = await loadArtwork(options.manifest, signal, options.decode);
  let graphics: ReturnType<typeof createArtworkRenderer> | undefined;
  try {
    signal.throwIfAborted();
    const initial: ArtworkLease = { loaded: initialLoaded, instance: createArtworkInstance(options.instanceId, initialLoaded.manifest) };
    const targetBytes = Math.ceil(options.viewport.width * options.viewport.dpr * options.viewport.renderScale) *
      Math.ceil(options.viewport.height * options.viewport.dpr * options.viewport.renderScale) * 4;
    if (estimatedTextureBytes(initial) + targetBytes > budget) throw new Error("GPU_BUDGET_EXCEEDED: initial artwork");
    let current = initial, viewport = options.viewport, disposed = false;
    const camera = createCameraController(pose => coversViewport(current.instance.getSnapshot().layers[0], getCoverView(viewport.width, viewport.height), pose));
    const renderer = createArtworkRenderer(options.canvas, initial.loaded, initial.instance, { ...options, camera });
    graphics = renderer; signal.throwIfAborted();
    function release(lease: ArtworkLease) {
      renderer.detach(lease.instance.id);
      if (lease !== initial) lease.loaded.dispose();
    }
    const transition = createTransitionCoordinator({
      camera, current: () => current, viewport: () => viewport, gpuBudgetBytes: budget,
      async load(manifest, loadSignal, id) {
        const loaded = await loadArtwork(manifest, loadSignal, options.decode);
        try { return { loaded, instance: createArtworkInstance(id, loaded.manifest) }; }
        catch (failure) { loaded.dispose(); throw failure; }
      },
      attach: lease => renderer.attach(lease.loaded, lease.instance),
      compose: renderer.setComposition,
      release,
      commit(destination, placement) {
        const source = current;
        camera.rebaseCoordinates(placement);
        current = destination;
        renderer.setComposition({ sourceId: destination.instance.id });
        release(source);
      },
    });
    return {
      get instance() { return current.instance; }, camera, transition,
      step(context: StepContext) {
        if (disposed) throw new Error("Artwork is disposed");
        options.evaluate?.(current.instance, context);
        transition.step(context);
      },
      render() {
        try { renderer.render(); }
        catch (failure) {
          const phase = transition.getSnapshot().phase;
          if (phase !== "revealing" && phase !== "rollingBack") throw failure;
          transition.rejectDestination(failure);
          renderer.render(); // An A failure still propagates; never hide it.
        }
      },
      reset() {
        if (disposed) throw new Error("Artwork is disposed");
        transition.reset();
        const previous = current;
        initial.instance.reset();
        if (current !== initial) renderer.attach(initial.loaded, initial.instance);
        current = initial; camera.reset(FULL_FRAME);
        renderer.setComposition({ sourceId: initial.instance.id });
        if (previous !== initial) release(previous);
        renderer.render();
      },
      resize(next: ArtworkRendererOptions["viewport"]) {
        if (transition.getSnapshot().qualityLocked) throw new Error("TRANSITION_VIEWPORT_LOCKED: retry resize after transaction");
        const frameBytes = Math.ceil(next.width * next.dpr * next.renderScale) * Math.ceil(next.height * next.dpr * next.renderScale) * 4;
        if (estimatedTextureBytes(current) + frameBytes > budget) throw new Error("GPU_BUDGET_EXCEEDED: resize");
        renderer.resize(next); viewport = Object.freeze({ ...next });
      },
      getDiagnostics() { return Object.freeze({ ...renderer.getDiagnostics(), gpuBudgetBytes: budget,
        cachedInitialArtwork: current !== initial, transition: transition.getSnapshot() }); },
      dispose() {
        if (disposed) return; disposed = true;
        try { transition.dispose(); renderer.dispose(); }
        finally { if (current !== initial) current.loaded.dispose(); initial.loaded.dispose(); }
      },
    } satisfies PreparedEngine & Record<string, unknown>;
  } catch (failure) { try { graphics?.dispose(); } finally { initialLoaded.dispose(); } throw failure; }
}
