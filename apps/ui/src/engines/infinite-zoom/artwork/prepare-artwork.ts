import type { PreparedEngine, StepContext } from "../core/contracts.ts";
import { createArtworkRenderer, type ArtworkRendererOptions } from "../renderer/artwork-renderer.ts";
import { createArtworkInstance, coversViewport, getCoverView, type ArtworkInstance } from "./artwork-instance.ts";
import { loadArtwork, type AssetDecoder } from "./artwork-loader.ts";
import { createCameraController } from "../camera/camera-controller.ts";
import { FULL_FRAME } from "../camera/camera-math.ts";
import { createTransitionCoordinator, estimatedTextureBytes, type ArtworkLease } from "../transition/transition-coordinator.ts";
import type { BehaviorModulation } from "../modulation/audio-modulation.ts";
import { parseArtworkPackage } from "./artwork-package.ts";
import type { SceneComposition } from "../renderer/composition.ts";
import { artworkTextureBytes } from "../resources/texture-budget.ts";
import { validatePortalPlacement } from "../transition/portal.ts";
import type { TransitionRequest } from "../transition/transition-coordinator.ts";

export interface ArtworkPreparationOptions extends Omit<ArtworkRendererOptions, "camera"> {
  readonly canvas: HTMLCanvasElement;
  readonly manifest: unknown;
  readonly instanceId: string;
  readonly evaluate?: (instance: ArtworkInstance, context: StepContext) => void;
  readonly decode?: AssetDecoder;
  readonly resolveManifest?: (uri: string, signal: AbortSignal) => Promise<unknown>;
  readonly modulation?: () => BehaviorModulation;
  /** Admission estimate, not a measured device limit. Default: 256 MiB. */
  readonly gpuBudgetBytes?: number;
}

/** Persistent journey with a bounded three-world authored reset cache.
 * The embedded world participates in critical readiness before camera travel. */
export async function prepareArtwork(options: ArtworkPreparationOptions, signal: AbortSignal) {
  const budget = options.gpuBudgetBytes ?? 256 * 1024 * 1024;
  if (!Number.isFinite(budget) || budget <= 0) throw new Error("Invalid GPU budget");
  const initialLoaded = await loadArtwork(options.manifest, signal, options.decode);
  let graphics: ReturnType<typeof createArtworkRenderer> | undefined;
  const cached: ArtworkLease[] = [];
  const links = new Map<string, { request: TransitionRequest; destination: ArtworkLease }>();
  try {
    signal.throwIfAborted();
    const initial: ArtworkLease = { loaded: initialLoaded, instance: createArtworkInstance(options.instanceId, initialLoaded.manifest) };
    cached.push(initial);
    const targetBytes = Math.ceil(options.viewport.width * options.viewport.dpr * options.viewport.renderScale) *
      Math.ceil(options.viewport.height * options.viewport.dpr * options.viewport.renderScale) * 4;
    if (estimatedTextureBytes(initial) + targetBytes > budget) throw new Error("GPU_BUDGET_EXCEEDED: initial artwork");
    const resolve = options.resolveManifest ?? (async (uri: string, signal: AbortSignal) => {
      const response = await fetch(uri, { signal, credentials: "same-origin" });
      if (!response.ok) throw new Error("Cannot load embedded artwork manifest");
      return response.json();
    });
    // Bounded authored demo only: at most A, B and C, with no planner/recursion.
    for (let index = 0; index < cached.length; index++) {
      const source = cached[index], portal = source.loaded.manifest.portal;
      if (!portal) break;
      const manifest = parseArtworkPackage(await resolve(portal.destination.manifestUri, signal));
      signal.throwIfAborted();
      if (manifest.id === source.loaded.manifest.id) throw new Error("Self-linked demo artwork");
      if (manifest.id !== portal.destination.artworkId || manifest.version !== portal.destination.version) throw new Error("Embedded destination identity/version mismatch");
      const existing = cached.find(lease => lease.loaded.manifest.id === manifest.id);
      if (!existing && cached.length >= 3) throw new Error("Demo artwork chain exceeds three worlds");
      const anchor = manifest.anchors.find(anchor => anchor.id === portal.destination.anchorId);
      if (!anchor) throw new Error("Unknown transition anchor");
      validatePortalPlacement(portal.region, { x: portal.region.x, y: portal.region.y, rotation: portal.region.rotation,
        scale: portal.scale, anchorX: anchor.x, anchorY: anchor.y });
      if (!existing && cached.reduce((sum, lease) => sum + estimatedTextureBytes(lease), 0) + artworkTextureBytes(manifest) + targetBytes > budget) throw new Error("GPU_BUDGET_EXCEEDED: initial embedded chain");
      const loaded = existing?.loaded ?? await loadArtwork(manifest, signal, options.decode);
      const destination = existing ?? { loaded, instance: createArtworkInstance(`${options.instanceId}:embedded-${index + 1}`, loaded.manifest) };
      if (!existing) cached.push(destination);
      links.set(source.instance.id, { destination, request: { sourceInstanceId: source.instance.id, manifest: loaded.manifest,
        anchorId: portal.destination.anchorId, placement: { x: portal.region.x, y: portal.region.y, scale: portal.scale, rotation: portal.region.rotation },
        region: portal.region, durationSeconds: portal.durationSeconds, destinationCamera: portal.destinationCamera } });
    }
    let current = initial, viewport = options.viewport, disposed = false;
    const camera = createCameraController(pose => coversViewport(current.instance.getSnapshot().layers[0], getCoverView(viewport.width, viewport.height), pose));
    const renderer = createArtworkRenderer(options.canvas, initial.loaded, initial.instance, { ...options, camera });
    graphics = renderer; signal.throwIfAborted();
    // The three-world demo pins this bounded cache on GPU. Exact R8 masks let
    // all three fit the unchanged budget, preserving nested pixels and sync reset.
    const pinChain = cached.length === 3 || [...links.values()].some(link => link.destination === initial);
    let decorateEnabled = true, looping = false, travelPaused = false;
    const disabledLinks = new Set<string>();
    // Two turns of the three-world ring preserve nested pixels at handoff.
    // This bounds composition size while all placements reuse three GPU leases.
    function decorate(input: SceneComposition, depth = 0): SceneComposition {
      let node = input;
      const link = links.get(node.sourceId);
      if (decorateEnabled && link && depth < 5 && !disabledLinks.has(node.sourceId) && !node.destinationId) {
        const anchor = link.destination.loaded.manifest.anchors.find(a => a.id === link.request.anchorId)!;
        node = { ...node, destinationId: link.destination.instance.id,
          placement: { ...link.request.placement, anchorX: anchor.x, anchorY: anchor.y },
          portal: link.request.region, destinationCamera: link.request.destinationCamera };
      }
      return node.destinationId && links.has(node.destinationId) && decorateEnabled ?
        { ...node, destinationComposition: decorate({ sourceId: node.destinationId }, depth + 1) } : node;
    }
    function compose(input: SceneComposition) { renderer.setComposition(decorate(input)); }
    function release(lease: ArtworkLease) {
      if (pinChain && cached.includes(lease)) return;
      renderer.detach(lease.instance.id);
      if (!cached.includes(lease)) lease.loaded.dispose();
    }
    const transition = createTransitionCoordinator({
      camera, current: () => current, viewport: () => viewport, gpuBudgetBytes: budget,
      residentTextureBytes: () => renderer.getDiagnostics().estimatedTextureBytes,
      async load(manifest, loadSignal, id) {
        const loaded = await loadArtwork(manifest, loadSignal, options.decode);
        try { return { loaded, instance: createArtworkInstance(id, loaded.manifest) }; }
        catch (failure) { loaded.dispose(); throw failure; }
      },
      attach: lease => renderer.attach(lease.loaded, lease.instance),
      compose,
      release,
      commit(destination, placement) {
        const source = current;
        camera.rebaseCoordinates(placement);
        current = destination;
        compose({ sourceId: destination.instance.id });
        release(source);
      },
    });
    // Attach inner descendants before publishing the initial nested composition.
    for (const lease of cached.slice(2)) renderer.attach(lease.loaded, lease.instance);
    const initialLink = links.get(initial.instance.id);
    if (initialLink) transition.restore(initialLink.request, initialLink.destination);
    const nextLink = () => transition.getSnapshot().phase === "committed" && !disabledLinks.has(current.instance.id) ? links.get(current.instance.id) : undefined;
    const journeyTransition = {
      ...transition,
      cancel() { looping = false; travelPaused = false; transition.cancel(); },
      start() {
        travelPaused = false;
        const next = nextLink();
        if (next) transition.restore(next.request, next.destination);
        transition.start();
      },
      getSnapshot() { return Object.freeze({ ...transition.getSnapshot(), canStart: transition.getSnapshot().canStart || !!nextLink() }); },
    };
    renderer.render(); signal.throwIfAborted();
    if (!renderer.getDiagnostics().available) throw new Error("GPU unavailable during critical preparation");
    return {
      get instance() { return current.instance; }, camera, transition: journeyTransition,
      setLoop(enabled: boolean) {
        if (disposed) return;
        looping = enabled;
        travelPaused = !enabled && transition.getSnapshot().phase === "approaching";
      },
      getLoop() { return looping; },
      step(context: StepContext) {
        if (disposed) throw new Error("Artwork is disposed");
        options.evaluate?.(current.instance, context);
        const modulation = options.modulation?.();
        if (looping) {
          const state = journeyTransition.getSnapshot();
          if (state.error || state.phase === "rollingBack" || !state.canStart && state.phase === "committed") looping = false;
          else if (state.canStart) journeyTransition.start();
        }
        const sourceId = current.instance.id, pendingId = transition.getSnapshot().destinationInstanceId;
        transition.step(context, modulation, travelPaused);
        for (const lease of cached) {
          if (lease.instance.id !== sourceId && lease.instance.id !== pendingId) lease.instance.stepBehaviors(context, modulation);
        }
      },
      render() {
        try { renderer.render(); }
        catch (failure) {
          const phase = transition.getSnapshot().phase;
          if (phase !== "approaching" && phase !== "rollingBack") throw failure;
          disabledLinks.add(current.instance.id);
          transition.rejectDestination(failure);
          renderer.render(); // An A failure still propagates; never hide it.
        }
      },
      reset() {
        if (disposed) throw new Error("Artwork is disposed");
        looping = false; travelPaused = false;
        decorateEnabled = false;
        transition.reset();
        const previous = current;
        for (const lease of cached) lease.instance.reset();
        if (current !== initial) renderer.attach(initial.loaded, initial.instance);
        current = initial; camera.reset(FULL_FRAME);
        renderer.setComposition({ sourceId: initial.instance.id });
        if (!cached.includes(previous)) release(previous);
        disabledLinks.clear(); decorateEnabled = true;
        if (initialLink) transition.restore(initialLink.request, initialLink.destination);
        renderer.render();
      },
      resize(next: ArtworkRendererOptions["viewport"]) {
        if (transition.getSnapshot().qualityLocked) throw new Error("TRANSITION_VIEWPORT_LOCKED: retry resize after transaction");
        const frameBytes = Math.ceil(next.width * next.dpr * next.renderScale) * Math.ceil(next.height * next.dpr * next.renderScale) * 4;
        if (renderer.getDiagnostics().estimatedTextureBytes + frameBytes > budget) throw new Error("GPU_BUDGET_EXCEEDED: resize");
        renderer.resize(next); viewport = Object.freeze({ ...next });
      },
      getDiagnostics() { return Object.freeze({ ...renderer.getDiagnostics(), gpuBudgetBytes: budget,
        cachedInitialArtwork: current !== initial, transition: journeyTransition.getSnapshot() }); },
      dispose() {
        if (disposed) return; disposed = true;
        decorateEnabled = false;
        try { transition.dispose(); renderer.dispose(); }
        finally {
          if (!cached.includes(current)) current.loaded.dispose();
          for (const lease of cached) lease.loaded.dispose();
        }
      },
    } satisfies PreparedEngine & Record<string, unknown>;
  } catch (failure) { try { graphics?.dispose(); } finally { for (const lease of cached) lease.loaded.dispose(); initialLoaded.dispose(); } throw failure; }
}
