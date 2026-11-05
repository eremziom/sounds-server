import { createInfiniteZoomController } from "../../engines/infinite-zoom/index.ts";
import { createAudioModulation } from "../../engines/infinite-zoom/modulation/audio-modulation.ts";
import { createAdaptiveQuality } from "../../engines/infinite-zoom/quality/adaptive-quality.ts";
import { createSessionDiagnostics } from "../../engines/infinite-zoom/diagnostics/session-diagnostics.ts";
import type { prepareArtwork } from "../../engines/infinite-zoom/artwork/prepare-artwork.ts";
import type { AudioSignals } from "../../lib/audio-animation.ts";
import { bindPlaybackToVisuals } from "./playback-adapter.ts";
import type { VisualBridge } from "./visual-bridge.ts";

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
  let pendingResize = false;
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
        switch (command) {
          case "zoomIn": lease.camera.zoomIn(1.25, 1.5); break;
          case "zoomOut": lease.camera.zoomOut(1.25, 1.5); break;
          case "rotate": {
            const pose = lease.camera.getSnapshot().pose;
            lease.camera.retarget({ ...pose, logScale: Math.max(pose.logScale, Math.log(1.4)), rotation: pose.rotation + 0.1 }, 2); break;
          }
          case "return": lease.camera.returnTo("full-frame", 2); break;
          case "hold": lease.camera.hold(0.5); break;
          case "cancel": lease.transition.cancel(); break;
        }
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
        const prepared = await artworkModule.prepareArtwork({ canvas, manifest, instanceId: "initial", viewport: targetSize,
          onAvailabilityChange(available) {
            const status = engine.getSnapshot().status;
            diagnostics.event(available ? "CONTEXT_RESTORED" : "CONTEXT_LOST", engine.getSnapshot().session.tick, available ? "info" : "warning");
            if (!["disposed", "error"].includes(status)) engine.setSuspended("context-lost", !available);
          },
          onError() { diagnostics.event("CONTEXT_RESTORE_FAILED", engine.getSnapshot().session.tick, "error"); fault = true; publish(); },
          evaluate() { runCommands(); },
          modulation: () => modulation.getSnapshot(),
        }, signal);
        lease = prepared; pendingResize = false;
        return { ...prepared,
          step(context) {
            const levels = options.signals.current;
            modulation.step(bridge.getModulation() && options.analysisEnabled() ? {
              bass: levels?.bass?.level ?? NaN, mid: levels?.mid?.level ?? NaN, high: levels?.high?.level ?? NaN,
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
    if (!pendingResize || !lease || lease.transition.getSnapshot().qualityLocked || !lease.getDiagnostics().available) return;
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
    const transition = lease?.transition.getSnapshot().phase ?? "idle";
    if (snapshot.status !== lastState) {
      diagnostics.event(`ENGINE_${snapshot.status.toUpperCase()}`, snapshot.session.tick, snapshot.status === "error" ? "error" : "info");
      lastState = snapshot.status;
    }
    if (transition !== lastTransition) { diagnostics.event(`TRANSITION_${transition.toUpperCase()}`, snapshot.session.tick); lastTransition = transition; }
    bridge.publish({ status: snapshot.status, tick: snapshot.session.tick, artwork: lease?.instance.manifest.id ?? "",
      transition, error: fault || lastResizeError || snapshot.status === "error" || !!lease?.transition.getSnapshot().error,
      retryable: !hasPlayed && snapshot.status === "error",
      canTransition: lease?.transition.getSnapshot().canStart ?? false,
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
    prepareForPlayback() {
      options.enableAnalysis();
      if (hasPlayed && (fault || engine.getSnapshot().status === "error")) return Promise.resolve();
      return prepare();
    },
    retry: prepare,
    command(command: Parameters<VisualBridge["command"]>[0]) { if (commands.length < 32) commands.push(command); },
    async transition() {
      if (!lease || disposed || !lease.transition.getSnapshot().canStart) return;
      try { lease.transition.start(); fault = false; } catch { fault = true; }
      publish();
    },
    reset() {
      if (!lease || disposed) return;
      commands.length = 0; modulation.reset();
      try { engine.reset(); fault = false; playback.sync(); } catch { fault = true; }
      publish();
    },
    dispose() {
      if (disposed) return; disposed = true;
      observer.disconnect(); clearInterval(timer); playback.dispose(); commands.length = 0; engine.dispose(); lease = null;
    },
  };
  return { connection, prewarm: prepare };
}
