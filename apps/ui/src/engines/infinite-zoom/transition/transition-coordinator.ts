import type { ArtworkInstance } from "../artwork/artwork-instance.ts";
import { coversViewport, getCoverView } from "../artwork/artwork-instance.ts";
import { parseArtworkPackage } from "../artwork/artwork-package.ts";
import type { LoadedArtwork } from "../artwork/artwork-loader.ts";
import type { StepContext } from "../core/contracts.ts";
import type { CameraController } from "../camera/camera-controller.ts";
import type { CameraPose } from "../camera/camera-math.ts";
import type { ArtworkViewport, SceneComposition } from "../renderer/artwork-renderer.ts";
import { validatePlacement, type ArtworkPlacement } from "./placement.ts";
import { portalCoversViewport, portalTarget, validatePortalPlacement, type PortalRegion } from "./portal.ts";
import type { BehaviorModulation } from "../modulation/audio-modulation.ts";

import { destinationView, destinationRenderPlacement, destinationFramingSeconds, type DestinationCamera } from "./destination-view.ts";

import { artworkTextureBytes } from "../resources/texture-budget.ts";

export interface ArtworkLease { readonly loaded: LoadedArtwork; readonly instance: ArtworkInstance }
export interface TransitionRequest {
  readonly sourceInstanceId: string;
  readonly manifest: unknown;
  readonly anchorId: string;
  readonly placement: Readonly<{ x: number; y: number; scale: number; rotation: number }>;
  readonly durationSeconds: number;
  readonly region: PortalRegion;
  readonly destinationCamera?: DestinationCamera;
  readonly signal?: AbortSignal;
  readonly loadTimeoutMs?: number;
}
interface TransitionPorts {
  readonly camera: CameraController;
  readonly current: () => ArtworkLease;
  readonly viewport: () => ArtworkViewport;
  readonly gpuBudgetBytes: number;
  readonly residentTextureBytes?: () => number;
  readonly load: (manifest: unknown, signal: AbortSignal, id: string) => Promise<ArtworkLease>;
  readonly attach: (lease: ArtworkLease) => void;
  readonly compose: (composition: SceneComposition) => void;
  readonly release: (lease: ArtworkLease) => void;
  readonly commit: (destination: ArtworkLease, placement: ArtworkPlacement) => void;
}
type Phase = "idle" | "preparing" | "prepared" | "approaching" | "rollingBack" | "committed" | "cancelled" | "failed" | "disposed";

export function estimatedTextureBytes(lease: ArtworkLease) {
  return artworkTextureBytes(lease.loaded.manifest);
}

/** request embeds a visible B; start requests camera travel only.
 * Authored placement/aperture and the optional B camera mapping are time-free. */
export function createTransitionCoordinator(ports: TransitionPorts) {
  let phase: Phase = "idle", generation = 0, pending: ArtworkLease | null = null;
  let placement: ArtworkPlacement | null = null, region: PortalRegion | null = null, ticks = 0, elapsed = 0, startRequested = false;
  let destinationCamera: DestinationCamera | undefined;
  let startPose: CameraPose | null = null, abort: AbortController | null = null;
  let error: unknown = null, rollbackResult: "cancelled" | "failed" = "cancelled";
  let unsubscribe: (() => void) | null = null;
  let handoff: Readonly<{ before: ReturnType<CameraController["getSnapshot"]>; after: ReturnType<CameraController["getSnapshot"]>; placement: ArtworkPlacement }> | null = null;
  const busy = () => ["preparing", "approaching", "rollingBack"].includes(phase);
  function cleanListener() { unsubscribe?.(); unsubscribe = null; }
  function finish(result: "cancelled" | "failed") {
    ports.compose({ sourceId: ports.current().instance.id });
    const lease = pending; pending = null;
    if (lease) ports.release(lease);
    phase = result; cleanListener();
  }
  function cancel(failure?: unknown) {
    if (phase === "disposed" || phase === "rollingBack") return;
    startRequested = false;
    error = failure ?? null; rollbackResult = failure ? "failed" : "cancelled";
    if (phase === "preparing") {
      generation++; abort?.abort(failure ?? new Error("Transition cancelled")); abort = null;
      phase = rollbackResult; cleanListener(); return;
    }
    if (phase !== "approaching") { if (pending) phase = rollbackResult; cleanListener(); return; }
    phase = "rollingBack"; elapsed = 0;
    try { ports.camera.retarget(startPose!, ticks / 60); }
    catch { ports.camera.halt(); } // Hold last safe A pose if a smooth return is unsafe.
  }
  function destinationCovered(sourcePose = ports.camera.getSnapshot().pose) {
    if (!pending || !placement || !region) return false;
    const pose = destinationView(sourcePose, placement, destinationCamera);
    const viewport = ports.viewport();
    const magnification = Math.max(viewport.width * viewport.dpr * viewport.renderScale / 3840,
      viewport.height * viewport.dpr * viewport.renderScale / 2160) * Math.exp(pose.logScale);
    // First slice has no LOD: cap destination texel magnification at 2x.
    const view = getCoverView(viewport.width, viewport.height);
    return magnification <= 2 && portalCoversViewport(region, sourcePose, view) && coversViewport(pending.instance.getSnapshot().layers[0], view, pose);
  }
  return {
    async request(request: TransitionRequest): Promise<void> {
      if (phase === "disposed" || busy() || pending) throw new Error(`Cannot request transition in ${phase}`);
      if (request.sourceInstanceId !== ports.current().instance.id) throw new Error("Stale transition source");
      const manifest = parseArtworkPackage(request.manifest);
      const anchor = manifest.anchors.find(anchor => anchor.id === request.anchorId);
      if (!anchor) throw new Error("Unknown transition anchor");
      const resolved = Object.freeze({ ...request.placement, anchorX: anchor.x, anchorY: anchor.y });
      validatePlacement(resolved);
      validatePortalPlacement(request.region, resolved);
      if (request.destinationCamera !== undefined && request.destinationCamera !== "stop-at-full-frame") throw new Error("Invalid destination camera policy");
      if (!Number.isFinite(request.durationSeconds) || request.durationSeconds < 1 / 60 || request.durationSeconds > 60) throw new Error("Invalid transition duration");
      const timeoutMs = request.loadTimeoutMs ?? 15_000;
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("Invalid transition load timeout");
      const viewport = ports.viewport();
      const targetBytes = Math.ceil(viewport.width * viewport.dpr * viewport.renderScale) * Math.ceil(viewport.height * viewport.dpr * viewport.renderScale) * 4;
      const destinationBytes = artworkTextureBytes(manifest);
      if ((ports.residentTextureBytes?.() ?? estimatedTextureBytes(ports.current())) + destinationBytes + targetBytes > ports.gpuBudgetBytes) throw new Error("GPU_BUDGET_EXCEEDED: A/B admission rejected");
      request.signal?.throwIfAborted();
      phase = "preparing"; error = null; handoff = null;
      region = Object.freeze({ ...request.region });
      destinationCamera = request.destinationCamera;
      placement = resolved; ticks = Math.round(request.durationSeconds * 60);
      const revision = ++generation, operation = new AbortController(); abort = operation;
      const externalAbort = () => cancel();
      request.signal?.addEventListener("abort", externalAbort, { once: true });
      unsubscribe = () => request.signal?.removeEventListener("abort", externalAbort);
      const timeout = setTimeout(() => operation.abort(new Error("Transition load timeout")), timeoutMs);
      try {
        const acquired = await new Promise<ArtworkLease>((resolve, reject) => {
          const onAbort = () => reject(operation.signal.reason);
          operation.signal.addEventListener("abort", onAbort, { once: true });
          void Promise.resolve().then(() => {
            operation.signal.throwIfAborted();
            return ports.load(manifest, operation.signal, `${manifest.id}:transition-${revision}`);
          }).then(lease => {
            operation.signal.removeEventListener("abort", onAbort);
            if (operation.signal.aborted || revision !== generation) { ports.release(lease); reject(operation.signal.reason ?? new Error("Stale transition")); }
            else resolve(lease);
          }, failure => { operation.signal.removeEventListener("abort", onAbort); reject(failure); });
        });
        if (revision !== generation || operation.signal.aborted) { ports.release(acquired); throw new Error("Stale transition"); }
        pending = acquired;
        ports.attach(acquired);
        if (revision !== generation || operation.signal.aborted) {
          pending = null; ports.release(acquired); throw new Error("Stale transition");
        }
        phase = "prepared";
        ports.compose({ sourceId: ports.current().instance.id, destinationId: pending.instance.id, placement: placement!, portal: region!, destinationCamera });
      } catch (failure) {
        if (revision === generation) { error = failure; finish("failed"); }
        throw failure;
      } finally { clearTimeout(timeout); if (abort === operation) abort = null; }
    },
    /** Reattach the bounded initial destination cache on explicit reset. */
    restore(request: TransitionRequest, lease: ArtworkLease) {
      if (phase === "disposed" || busy() || pending) throw new Error("Cannot restore embedded artwork");
      if (request.sourceInstanceId !== ports.current().instance.id) throw new Error("Stale transition source");
      const anchor = lease.instance.manifest.anchors.find(a => a.id === request.anchorId);
      if (!anchor) throw new Error("Unknown transition anchor");
      const manifest = parseArtworkPackage(request.manifest);
      if (manifest.id !== lease.instance.manifest.id || manifest.version !== lease.instance.manifest.version) throw new Error("Invalid cached destination");
      const resolved = Object.freeze({ ...request.placement, anchorX: anchor.x, anchorY: anchor.y });
      validatePlacement(resolved); validatePortalPlacement(request.region, resolved);
      if (request.destinationCamera !== undefined && request.destinationCamera !== "stop-at-full-frame") throw new Error("Invalid destination camera policy");
      if (!Number.isFinite(request.durationSeconds) || request.durationSeconds < 1 / 60 || request.durationSeconds > 60) throw new Error("Invalid transition duration");
      const viewport = ports.viewport();
      const frameBytes = Math.ceil(viewport.width * viewport.dpr * viewport.renderScale) * Math.ceil(viewport.height * viewport.dpr * viewport.renderScale) * 4;
      if (estimatedTextureBytes(ports.current()) + estimatedTextureBytes(lease) + frameBytes > ports.gpuBudgetBytes) throw new Error("GPU_BUDGET_EXCEEDED: restoring embedded pair");
      destinationCamera = request.destinationCamera;
      placement = resolved; region = Object.freeze({ ...request.region }); ticks = Math.round(request.durationSeconds * 60);
      pending = lease; ports.attach(lease);
      ports.compose({ sourceId: ports.current().instance.id, destinationId: lease.instance.id, placement, portal: region, destinationCamera });
      phase = "prepared"; error = null; handoff = null; startRequested = false;
    },
    start() {
      if (!pending || !["prepared", "cancelled", "failed"].includes(phase)) throw new Error("No embedded portal ready for travel");
      startRequested = true;
    },
    step(context: StepContext, modulation?: BehaviorModulation) {
      if (phase === "disposed") throw new Error("Transition coordinator is disposed");
      const source = ports.current();
      source.instance.stepBehaviors(context, modulation);
      pending?.instance.stepBehaviors(context, modulation);
      if (startRequested) {
        startRequested = false;
        startPose = ports.camera.getSnapshot().pose;
        const viewport = ports.viewport(), target = portalTarget(region!, getCoverView(viewport.width, viewport.height));
        try {
          if (!destinationCovered(target)) throw new Error("TRANSITION_HANDOFF_BLOCKED: coverage/resolution");
          const camera = ports.camera.getSnapshot();
          const framingSeconds = destinationCamera ? destinationFramingSeconds(camera.pose, camera.velocity, target, placement!, ticks) : ticks / 60;
          ports.camera.retarget(target, ticks / 60, framingSeconds);
          elapsed = 0; phase = "approaching"; error = null;
        } catch (failure) { error = failure; phase = "failed"; }
      }
      ports.camera.step();
      if (phase === "approaching") {
        elapsed++;
        if (ports.camera.getSnapshot().constraintReached) { cancel(new Error("CAMERA_CONSTRAINT_REACHED")); return; }
        const cameraState = ports.camera.getSnapshot();
        const destinationSettled = !destinationCamera || (elapsed >= ticks && !cameraState.moving &&
          destinationView(cameraState.pose, placement!, destinationCamera).logScale === 0);
        if (destinationCovered() && destinationSettled) {
          try {
            const before = ports.camera.getSnapshot();
            ports.commit(pending!, destinationRenderPlacement(before.pose, placement!, destinationCamera));
            handoff = Object.freeze({ before, after: ports.camera.getSnapshot(), placement: destinationRenderPlacement(before.pose, placement!, destinationCamera) });
            pending = null; phase = "committed"; cleanListener();
          } catch (failure) { cancel(failure); }
        } else if (elapsed >= ticks) cancel(new Error("TRANSITION_HANDOFF_BLOCKED: coverage/resolution"));
      } else if (phase === "rollingBack") {
        elapsed++;
        // The portal remains visible at the same placement during rollback.
        if (elapsed >= ticks) { phase = rollbackResult; cleanListener(); }
      }
    },
    cancel,
    rejectDestination(failure: unknown) {
      cancel(failure);
      if (phase === "rollingBack" && pending) {
        ports.compose({ sourceId: ports.current().instance.id });
        const rejected = pending; pending = null; ports.release(rejected);
      }
    },
    reset() {
      if (phase === "disposed") throw new Error("Transition coordinator is disposed");
      generation++; abort?.abort(new Error("Transition reset")); abort = null;
      if (pending) finish("cancelled"); cleanListener();
      phase = "idle"; error = null; handoff = null; startRequested = false;
    },
    getSnapshot() { return Object.freeze({ phase, error, handoff, placement, region, destinationCamera, sourceInstanceId: ports.current().instance.id,
      destinationInstanceId: pending?.instance.id ?? null, canStart: !!pending && ["prepared", "cancelled", "failed"].includes(phase), qualityLocked: busy() }); },
    dispose() {
      if (phase === "disposed") return;
      generation++; abort?.abort(new Error("Transition disposed")); abort = null;
      if (pending) finish("cancelled"); cleanListener(); phase = "disposed";
    },
  };
}
export type TransitionCoordinator = ReturnType<typeof createTransitionCoordinator>;
