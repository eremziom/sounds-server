import { defaultPilotControls, validateBehaviorControl, STUDIO_ARTWORKS, type BehaviorKind, type VisualScene } from "./pilot-controls.ts";
import { createCameraTiming } from "../modulation/camera-timing.ts";
import { createLogicalRecorder, type JourneyCommand } from "../diagnostics/logical-replay.ts";
import type { PreparedEngine, StepContext } from "../core/contracts.ts";
import { createArtworkRenderer, type ArtworkRendererOptions } from "../renderer/artwork-renderer.ts";
import { createArtworkInstance, coversViewport, getCoverView, type ArtworkInstance } from "./artwork-instance.ts";
import { loadArtwork, type AssetDecoder } from "./artwork-loader.ts";
import { createCameraController, type SavedCameraState } from "../camera/camera-controller.ts";
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
  readonly recordLogical?: boolean;
  readonly seed?: number;
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
    const packages = Object.freeze(cached.map(lease => Object.freeze({ id:lease.loaded.manifest.id, version:lease.loaded.manifest.version })));
    const recording = options.recordLogical ? createLogicalRecorder(options.seed ?? 181, packages) : null;
    const timing = createCameraTiming(), pendingCommands: JourneyCommand[] = [];
    let commandError = false, scene: VisualScene = "journey", selecting = false;
    let pilot: ArtworkLease | null = null, journeyCamera: SavedCameraState | null = null;
    const studioCache = new Map<VisualScene, ArtworkLease>();
    const studioCameras = new Map<VisualScene, SavedCameraState>();
    let journeyResidents: readonly ArtworkLease[] | null = null;
    let journeyComposition: SceneComposition | null = null, pilotCameraMotion=false, pilotDirection=1;
    let pilotControls=defaultPilotControls();
    const selectionLifetime=new AbortController();
    let current = initial, viewport = options.viewport, disposed = false;
    const camera = createCameraController(pose => coversViewport((scene !== "journey" ? pilot!.instance : current.instance).getSnapshot().layers[0], getCoverView(viewport.width, viewport.height), pose));
    const renderer = createArtworkRenderer(options.canvas, initial.loaded, initial.instance, { ...options, camera, gpuBudgetBytes: budget });
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
    let portsComposeEnabled=true;
    function compose(input: SceneComposition) { if (portsComposeEnabled) renderer.setComposition(decorate(input)); }
    function release(lease: ArtworkLease) {
      if ((pinChain || scene !== "journey") && cached.includes(lease)) return;
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
      cancel() { if (scene !== "journey") return; looping = false; travelPaused = false; transition.cancel(); },
      start() {
        if (scene !== "journey") throw new Error("Pilot has no journey portal");
        travelPaused = false;
        const next = nextLink();
        if (next) transition.restore(next.request, next.destination);
        transition.start();
      },
      getSnapshot() { return scene !== "journey" ? Object.freeze({ ...transition.getSnapshot(), phase:"idle" as const, error:null, canStart:false, qualityLocked:false }) : Object.freeze({ ...transition.getSnapshot(), canStart: transition.getSnapshot().canStart || !!nextLink() }); },
    };
    renderer.render(); signal.throwIfAborted();
    if (!renderer.getDiagnostics().available) throw new Error("GPU unavailable during critical preparation");
    return {
      get instance() { return scene !== "journey" ? pilot!.instance : current.instance; }, camera, transition: journeyTransition,
      getScene() { return scene; },
      getPilotControls() {
        if(scene === "journey" || !pilot)return pilotControls;
        const used=new Set(pilot.instance.manifest.behaviors.map(b=>b.kind));
        for(const layer of pilot.instance.manifest.layers){
          for(const behavior of [...layer.behaviors,...layer.regions.flatMap(region=>region.behaviors)])used.add(behavior.kind);
          if(layer.spin)used.add("rotate");
        }
        return Object.freeze(pilotControls.filter(control=>used.has(control.kind)));
      },
      getPilotCameraMotion() { return pilotCameraMotion; },
      setPilotPreset(preset: "subtle" | "all" | "none" | BehaviorKind) {
        if (!["subtle","all","none"].includes(preset)) validateBehaviorControl(preset as BehaviorKind,1);
        pilotControls=Object.freeze(pilotControls.map(c=>Object.freeze({ ...c,
          enabled:preset === "subtle" || preset === "all" || c.kind === preset,
          strength:preset === "subtle" ? 0.25 : preset === "none" ? c.strength : 1,
        })));
        for (const control of pilotControls) pilot?.instance.setBehaviorStrength(control.kind,control.enabled ? control.strength : 0);
        if (scene !== "journey") renderer.render();
      },
      setPilotControl(kind: BehaviorKind, enabled: boolean, strength: number) {
        validateBehaviorControl(kind,strength);
        if (typeof enabled !== "boolean") throw new Error("Invalid enabled flag");
        pilotControls=Object.freeze(pilotControls.map(c=>c.kind===kind ? Object.freeze({kind,enabled,strength}) : c));
        pilot?.instance.setBehaviorStrength(kind,enabled ? strength : 0);
        if (scene !== "journey") renderer.render();
      },
      setPilotCameraMotion(enabled: boolean) {
        if (typeof enabled !== "boolean") throw new Error("Invalid camera motion flag");
        pilotCameraMotion=enabled;
        if (!enabled && scene !== "journey") { try { camera.returnTo("full-frame",2); } catch { camera.halt(); } }
      },
      async selectScene(next: VisualScene, manifest?: unknown, requestSignal: AbortSignal = new AbortController().signal) {
        if (disposed || selecting || !["journey",...Object.keys(STUDIO_ARTWORKS)].includes(next)) throw new Error("Cannot select artwork");
        if (next===scene) return;
        selecting=true;
        let acquired: ArtworkLease | null = null;
        const previousPilot=pilot;
        try {
          const selectionSignal=AbortSignal.any([requestSignal,selectionLifetime.signal]);
          selectionSignal.throwIfAborted();
          if (next !== "journey" && !studioCache.has(next)) {
            const loaded=await loadArtwork(manifest,selectionSignal,options.decode);
            acquired={loaded,instance:createArtworkInstance(`${options.instanceId}:${next}`,loaded.manifest)};
            if (loaded.manifest.id !== STUDIO_ARTWORKS[next] || loaded.manifest.portal) throw new Error("Invalid pilot artwork");
          }
          selectionSignal.throwIfAborted();
          if (disposed) throw new Error("Artwork is disposed");
          const previousScene=scene, previousCamera=camera.captureState(), composition=renderer.getComposition();
          if (scene === "journey") { journeyCamera=previousCamera; journeyComposition=composition; journeyResidents=renderer.getArtworks(); }
          else studioCameras.set(scene,previousCamera);
          if (next !== "journey") {
            pilot=studioCache.get(next) ?? acquired;
            for (const control of pilotControls) pilot!.instance.setBehaviorStrength(control.kind,control.enabled ? control.strength : 0);
          }
          const target=next !== "journey" ? [{...pilot!}] : journeyResidents!;
          renderer.replaceArtworks(target,next !== "journey" ? {sourceId:pilot!.instance.id} : journeyComposition!,{
            apply() { scene=next; if (next !== "journey") { const saved=studioCameras.get(next); if (saved) camera.restoreState(saved); else camera.reset(FULL_FRAME); } else camera.restoreState(journeyCamera!); },
            rollback() { scene=previousScene; pilot=previousPilot; camera.restoreState(previousCamera); },
          });
          if (acquired) studioCache.set(next,acquired);
          pendingCommands.length=0; commandError=false; recording?.stop();
          acquired=null;
        } catch (failure) { pilot=previousPilot; acquired?.loaded.dispose(); throw failure; }
        finally { selecting=false; }
      },
      command(command: JourneyCommand) {
        if (disposed) throw new Error("Artwork is disposed");
        if (pendingCommands.length >= 32) throw new Error("Journey command queue is full");
        pendingCommands.push(command); recording?.command(command);
      },
      getPackages() { return packages; },
      getLogicalSnapshot() { return Object.freeze({ artwork:current.instance.id, camera:camera.getSnapshot(),
        artworks:Object.freeze(cached.map(lease=>lease.instance.getSnapshot())), transition:journeyTransition.getSnapshot(), looping, travelPaused, commandError }); },
      exportReplay() { return recording?.export() ?? null; },
      setLoop(enabled: boolean) {
        if (disposed || scene !== "journey") return;
        recording?.command(enabled ? "loopOn" : "loopOff");
        looping = enabled;
        travelPaused = !enabled && transition.getSnapshot().phase === "approaching";
      },
      getLoop() { return scene === "journey" && looping; },
      step(context: StepContext) {
        if (disposed) throw new Error("Artwork is disposed");
        const modulation = options.modulation?.();
        timing.step(modulation?.signals,context.dt);
        options.evaluate?.(scene !== "journey" ? pilot!.instance : current.instance, context);
        for (const command of pendingCommands.splice(0)) {
          try {
          switch (command) {
            case "zoomIn": camera.zoomIn(1.25,timing.duration(1.5)); break;
            case "zoomOut": camera.zoomOut(1.25,timing.duration(1.5)); break;
            case "rotate": { const pose=camera.getSnapshot().pose; camera.retarget({ ...pose,logScale:Math.max(pose.logScale,Math.log(1.4)),rotation:pose.rotation+0.1 },timing.duration(2)); break; }
            case "return": camera.returnTo("full-frame",timing.duration(2)); break;
            case "hold": camera.hold(timing.duration(0.5)); break;
            case "cancel": journeyTransition.cancel(); break;
            case "transition": journeyTransition.start(); break;
            case "loopOn": looping=true; travelPaused=false; break;
            case "loopOff": looping=false; travelPaused=transition.getSnapshot().phase==="approaching"; break;
            default: throw new Error("Invalid journey command");
          }
          commandError=false;
          } catch { commandError=true; }
        }
        if (scene !== "journey") {
          if (pilotCameraMotion && !camera.getSnapshot().moving) {
            const pose=camera.getSnapshot().pose;
            const x=pose.logScale<0.6 ? 1920 : 1920+pilotDirection*600;
            try { camera.retarget({x,y:1080,rotation:0,logScale:0.65},3); pilotDirection*=-1; } catch { pilotCameraMotion=false; }
          }
          camera.step(); pilot!.instance.stepBehaviors(context,modulation); return;
        }
        recording?.capture(context.tick,modulation?.signals ?? null);
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
        renderer.setDetailLocked(scene === "journey" && transition.getSnapshot().qualityLocked);
        try { renderer.render(); }
        catch (failure) {
          if (scene !== "journey") throw failure;
          const phase = transition.getSnapshot().phase;
          if (phase !== "approaching" && phase !== "rollingBack") throw failure;
          disabledLinks.add(current.instance.id);
          transition.rejectDestination(failure);
          renderer.render(); // An A failure still propagates; never hide it.
        }
      },
      reset() {
        if (disposed) throw new Error("Artwork is disposed");
        if (scene !== "journey") {
          pilot!.instance.reset(); camera.reset(FULL_FRAME); pilotDirection=1; commandError=false;
          pendingCommands.length=0; timing.reset(); recording?.stop(); renderer.render(); return;
        }
        looping = false; travelPaused = false; commandError=false; timing.reset(); pendingCommands.length=0; recording?.reset();
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
      setDetailEnabled(enabled: boolean) { renderer.setDetailEnabled(enabled); },
      resize(next: ArtworkRendererOptions["viewport"]) {
        if (scene === "journey" && transition.getSnapshot().qualityLocked) throw new Error("TRANSITION_VIEWPORT_LOCKED: retry resize after transaction");
        const frameBytes = Math.ceil(next.width * next.dpr * next.renderScale) * Math.ceil(next.height * next.dpr * next.renderScale) * 4;
        if (renderer.getDiagnostics().estimatedTextureBytes + frameBytes > budget) renderer.evictOptional();
        if (renderer.getDiagnostics().estimatedTextureBytes + frameBytes > budget) throw new Error("GPU_BUDGET_EXCEEDED: resize");
        renderer.resize(next); viewport = Object.freeze({ ...next });
      },
      getDiagnostics() { return Object.freeze({ ...renderer.getDiagnostics(), gpuBudgetBytes: budget,
        scene, cachedInitialArtwork: current !== initial, commandError, recording: recording?.getSnapshot() ?? null, cameraTiming: timing.getSnapshot(), transition: journeyTransition.getSnapshot() }); },
      dispose() {
        if (disposed) return; disposed = true;
        selectionLifetime.abort();
        decorateEnabled = false;
        try {
          // The dormant journey must not republish its composition over a pilot.
          if (scene !== "journey") { const original=portsComposeEnabled; portsComposeEnabled=false; try { transition.dispose(); } finally { portsComposeEnabled=original; } }
          else transition.dispose();
          renderer.dispose();
        }
        finally {
          if (!cached.includes(current)) current.loaded.dispose();
          for (const lease of cached) lease.loaded.dispose();
          for (const studio of studioCache.values()) studio.loaded.dispose();
        }
      },
    } satisfies PreparedEngine & Record<string, unknown>;
  } catch (failure) { try { graphics?.dispose(); } finally { for (const lease of cached) lease.loaded.dispose(); initialLoaded.dispose(); } throw failure; }
}
