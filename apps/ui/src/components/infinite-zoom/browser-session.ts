import {STUDIO_ARTWORKS,type BehaviorKind,type VisualScene} from "../../engines/infinite-zoom/artwork/pilot-controls.ts";
import { createInfiniteZoomController } from "../../engines/infinite-zoom/index.ts";
import { createAudioModulation } from "../../engines/infinite-zoom/modulation/audio-modulation.ts";
import { sampleKickAttack } from "../../engines/infinite-zoom/modulation/kick-signal.ts";
import { sampleHighAttack, sampleMidAttack } from "../../engines/infinite-zoom/modulation/attack-signal.ts";
import { createAdaptiveQuality } from "../../engines/infinite-zoom/quality/adaptive-quality.ts";
import { createSessionDiagnostics } from "../../engines/infinite-zoom/diagnostics/session-diagnostics.ts";
import type { prepareArtwork } from "../../engines/infinite-zoom/artwork/prepare-artwork.ts";
import type { AudioSignals } from "../../lib/audio-animation.ts";
import { bindPlaybackToVisuals } from "./playback-adapter.ts";
import type { VisualBridge } from "./visual-bridge.ts";
import {setRimLightingVisibility} from "./rim-lighting.ts";
import {createSceneReveal,withSceneReveal} from "./scene-reveal.ts";

export function createBrowserVisualSession(options: {
  canvas: HTMLCanvasElement; audio: HTMLAudioElement; bridge: VisualBridge;
  actualPlayback: { readonly current: boolean };
  signals: { readonly current: AudioSignals };
  enableAnalysis: () => void; analysisEnabled: () => boolean;
}) {
  const { canvas, audio, bridge } = options;
  const modulation = createAudioModulation();
  const quality = createAdaptiveQuality(), diagnostics = createSessionDiagnostics(crypto.randomUUID());
  let lastFrame: number | null = null, lastState = "", lastTransition = "", lastResizeError = false;
  let lease: Awaited<ReturnType<typeof prepareArtwork>> | null = null;
  let hasPlayed = false, disposed = false, fault = false;
  let targetSize = { width: 1, height: 1, dpr: 1, renderScale: 1 };
  let pendingResize = false, sceneLoading=false;
  let rimLightingEnabled=false;
  const reveal=createSceneReveal();
  const studioManifests=new Map<VisualScene,unknown>();
  let scenePreparation: Promise<void> | null = null;
  const selectionLifetime=new AbortController();
  const commands: Parameters<VisualBridge["command"]>[0][] = [];
  function measure() {
    const bounds = canvas.parentElement!.getBoundingClientRect();
    const profile = quality.getSnapshot();
    targetSize = { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height), dpr: Math.min(window.devicePixelRatio || 1, profile.maxDpr), renderScale: profile.renderScale };
    pendingResize = true;
  }
  function runCommands() {
    if (!lease) return;
    for (const command of commands.splice(0)) {
      try {
        lease.command(command);
        fault = false;
      } catch { fault = true; }
    }
  }
  function buildEngine() {
    return createInfiniteZoomController({ seed: 181,
      scheduler: {
        request(callback) { return requestAnimationFrame(time => {
          if (lastFrame !== null) {
            const interval = time - lastFrame;
            diagnostics.frame(interval);
            if (quality.sample(interval, !!lease?.transition.getSnapshot().qualityLocked)) {
              diagnostics.event("QUALITY_PROFILE_CHANGED", engine.getSnapshot().session.tick, "warning");
              measure();
            }
          }
          lastFrame = time;
          callback(time);
          if (engine.getSnapshot().status === "error") fault = true;
        }); },
        cancel(handle) { lastFrame = null; quality.interrupt(); cancelAnimationFrame(handle); },
      },
      prepare: async signal => {
        // One abortable deadline covers manifest, decode and critical GPU warmup.
        signal = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
        measure();
        const response = await fetch("/infinite-zoom/samples/forest/manifest.json", { signal });
        if (!response.ok) throw new Error("Cannot load initial artwork manifest");
        const manifest = await response.json();
        const artworkModule = await import("../../engines/infinite-zoom/artwork/prepare-artwork.ts");
        signal.throwIfAborted();
        const prepared = await artworkModule.prepareArtwork({ canvas, manifest, instanceId: "initial", viewport: targetSize, seed:181, recordLogical:true, highPrecisionColor:true,
          onAvailabilityChange(available) {
            const status = engine.getSnapshot().status;
            diagnostics.event(available ? "CONTEXT_RESTORED" : "CONTEXT_LOST", engine.getSnapshot().session.tick, available ? "info" : "warning");
            if (!["disposed", "error"].includes(status)) engine.setSuspended("context-lost", !available);
          },
          onError() { diagnostics.event("CONTEXT_RESTORE_FAILED", engine.getSnapshot().session.tick, "error"); fault = true; publish(); },
          evaluate(instance) { runCommands(); reveal.step(instance); },
          modulation: () => modulation.getSnapshot(),
        }, signal);
        lease = prepared; pendingResize = false;
        return { ...prepared,
          step(context) {
            const levels = options.signals.current;
            modulation.step(bridge.getModulation() && options.analysisEnabled() ? {
              bass: levels?.bass?.level ?? NaN, mid: levels?.mid?.level ?? NaN, high: levels?.high?.level ?? NaN,
              kick: sampleKickAttack(levels?.bass ?? null, performance.now()),
              highAttack: sampleHighAttack(levels?.high ?? null, performance.now()),
              midAttack: sampleMidAttack(levels?.mid ?? null, performance.now()),
            } : null, context.dt);
            prepared.step(context);
          },
        };
      },
    });
  }
  let engine = buildEngine();
  const playback = bindPlaybackToVisuals(audio, document, () => engine, () => modulation.reset(), () => { hasPlayed = true; }, options.actualPlayback.current);
  function applyResize() {
    if (!pendingResize || !lease || sceneLoading || lease.transition.getSnapshot().qualityLocked || !lease.getDiagnostics().available) return;
    try { lease.resize(targetSize); pendingResize = false; lastResizeError = false; }
    catch {
      // Keep the existing valid projection/frame. Never restart camera or
      // audio to make a resize fit; retry after movement/transition completes.
      if (!lastResizeError) diagnostics.event("RESIZE_DEFERRED", engine.getSnapshot().session.tick, "warning");
      lastResizeError = true;
    }
  }
  function publish() {
    if (disposed) return;
    applyResize();
    const snapshot = engine.getSnapshot();
    if (lease && !lease.transition.getSnapshot().qualityLocked) lease.setDetailEnabled(["Ultra","High"].includes(quality.getSnapshot().profile));
    const transition = lease?.transition.getSnapshot().phase ?? "idle";
    if (snapshot.status !== lastState) {
      diagnostics.event(`ENGINE_${snapshot.status.toUpperCase()}`, snapshot.session.tick, snapshot.status === "error" ? "error" : "info");
      lastState = snapshot.status;
    }
    if (transition !== lastTransition) { diagnostics.event(`TRANSITION_${transition.toUpperCase()}`, snapshot.session.tick); lastTransition = transition; }
    bridge.publish({ status: snapshot.status, tick: snapshot.session.tick, artwork: lease?.instance.manifest.id ?? "",
      transition, error: fault || !!lease?.getDiagnostics().commandError || lastResizeError || snapshot.status === "error" || !!lease?.transition.getSnapshot().error,
      retryable: !hasPlayed && snapshot.status === "error",
      canTransition: lease?.transition.getSnapshot().canStart ?? false,
      looping: lease?.getLoop() ?? false,
      scene:lease?.getScene() ?? "journey", sceneLoading,
      pilotControls:lease?.getPilotControls(), pilotCameraMotion:lease?.getPilotCameraMotion() ?? false,
      rimLightingEnabled,
      sceneRevealEnabled:reveal.getSnapshot().enabled, sceneRevealProgress:reveal.getSnapshot().progress,
      diagnostics: Object.freeze({ ...diagnostics.getSnapshot(), quality: quality.getSnapshot(),
        tick: snapshot.session.tick, status: snapshot.status, seed: snapshot.session.seed,
        resources: lease?.getDiagnostics() ?? null, camera: lease?.camera.getSnapshot() ?? null,
        suspensions: snapshot.suspensions, resizePending: pendingResize }),
      ready: !["idle", "preparing", "error", "disposed"].includes(snapshot.status) });
    canvas.dataset.simulationTick = String(snapshot.session.tick);
    canvas.dataset.visualStatus = snapshot.status;
    canvas.dataset.qualityProfile = quality.getSnapshot().profile;
    canvas.dataset.visualError = snapshot.error instanceof Error ? snapshot.error.message : "";
  }
  async function prepare() {
    if (disposed) throw new Error("Visual session is disposed");
    if (engine.getSnapshot().status === "error" && !hasPlayed) {
      engine.dispose(); lease = null; engine = buildEngine(); fault = false;
    }
    try { await engine.prepare(); playback.sync(); publish(); }
    catch (failure) { fault = true; publish(); throw failure; }
  }
  const observer = new ResizeObserver(() => { measure(); applyResize(); }); observer.observe(canvas.parentElement!);
  const timer = setInterval(publish, 200); // UI/resize polling only; never advances simulation.
  const connection = {
    async prepareForPlayback() {
      options.enableAnalysis();
      if (scenePreparation) await scenePreparation;
      if (hasPlayed && (fault || engine.getSnapshot().status === "error")) return Promise.resolve();
      return prepare();
    },
    retry: prepare,
    command(command: Parameters<VisualBridge["command"]>[0]) { if (commands.length < 32) commands.push(command); },
    async transition() {
      if (!lease || disposed || !lease.transition.getSnapshot().canStart) return;
      try { lease.command("transition"); fault = false; } catch { fault = true; }
      publish();
    },
    setLoop(enabled: boolean) {
      if (!lease || disposed) return;
      lease.setLoop(enabled); publish();
    },
    async selectScene(next: VisualScene) {
      if (!lease || disposed || sceneLoading || next === lease.getScene()) return;
      sceneLoading=true; commands.length=0;
      engine.setSuspended("artwork-loading",true); publish();
      const operation=(async()=>{
        try {
          const signal=AbortSignal.any([selectionLifetime.signal,AbortSignal.timeout(15000)]);
          if (next !== "journey" && !studioManifests.has(next)) {
            const response=await fetch(`/infinite-zoom/samples/${STUDIO_ARTWORKS[next]}/manifest.json`,{signal});
            if (!response.ok) throw new Error("Cannot load pilot manifest");
            const manifest=await response.json();
            studioManifests.set(next,next==="alien" ? withSceneReveal(manifest) : manifest);
          }
          await lease!.selectScene(next,studioManifests.get(next),signal);
          setRimLightingVisibility(lease!.instance,rimLightingEnabled);reveal.apply(lease!.instance);lease!.render();fault=false;
        } catch (failure) { if (!disposed) fault=true; throw failure; }
        finally {
          sceneLoading=false;
          if (!disposed) { engine.setSuspended("artwork-loading",false); publish(); }
        }
      })();
      scenePreparation=operation;
      try { await operation; } finally { if (scenePreparation===operation) scenePreparation=null; }
    },
    setPilotControl(kind: BehaviorKind, enabled: boolean, strength: number) { if (lease && !disposed && !sceneLoading) { lease.setPilotControl(kind,enabled,strength); publish(); } },
    setPilotPreset(preset: "subtle" | "all" | "none" | BehaviorKind) { if (lease && !disposed && !sceneLoading) { lease.setPilotPreset(preset); publish(); } },
    setPilotCameraMotion(enabled: boolean) { if (lease && !disposed && !sceneLoading) { lease.setPilotCameraMotion(enabled); publish(); } },
    setRimLightingEnabled(enabled:boolean){
      if(!lease||disposed||sceneLoading||lease.getScene()!=="alien")return;
      setRimLightingVisibility(lease.instance,enabled);rimLightingEnabled=enabled;lease.render();publish();
    },
    setSceneRevealEnabled(enabled:boolean) {
      if(!lease||disposed||sceneLoading||lease.getScene()!=="alien")return;
      if(enabled){rimLightingEnabled=true;setRimLightingVisibility(lease.instance,true);}
      reveal.setEnabled(enabled,lease.instance);lease.render();publish();
    },
    restartSceneReveal() {
      if(!lease||disposed||sceneLoading||lease.getScene()!=="alien")return;
      reveal.restart(lease.instance);lease.render();publish();
    },
    exportReplay() { return lease?.exportReplay() ?? null; },
    reset() {
      if (!lease || disposed) return;
      commands.length = 0; modulation.reset();
      try { engine.reset();setRimLightingVisibility(lease.instance,rimLightingEnabled);reveal.restart(lease.instance);lease.render();fault = false;playback.sync(); } catch { fault = true; }
      publish();
    },
    dispose() {
      if (disposed) return; disposed = true;
      selectionLifetime.abort(); observer.disconnect(); clearInterval(timer); playback.dispose(); commands.length = 0; engine.dispose(); lease = null;
    },
  };
  return { connection, prewarm: prepare };
}
