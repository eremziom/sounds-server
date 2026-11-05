import type { ArtworkInstance } from "../artwork/artwork-instance.ts";
import { coversViewport, getCoverView } from "../artwork/artwork-instance.ts";
import { parseArtworkPackage } from "../artwork/artwork-package.ts";
import type { LoadedArtwork } from "../artwork/artwork-loader.ts";
import type { StepContext } from "../core/contracts.ts";
import type { CameraController } from "../camera/camera-controller.ts";
import type { CameraPose } from "../camera/camera-math.ts";
import type { ArtworkViewport, SceneComposition } from "../renderer/artwork-renderer.ts";
import { cameraInDestination, placePoint, validatePlacement, type ArtworkPlacement } from "./placement.ts";
import type { BehaviorModulation } from "../modulation/audio-modulation.ts";

export interface ArtworkLease { readonly loaded: LoadedArtwork; readonly instance: ArtworkInstance }
export interface TransitionRequest {
  readonly sourceInstanceId: string;
  readonly manifest: unknown;
  readonly anchorId: string;
  readonly placement: Readonly<{ x: number; y: number; scale: number; rotation: number }>;
  readonly durationSeconds: number;
  readonly signal?: AbortSignal;
  readonly loadTimeoutMs?: number;
}
interface TransitionPorts {
  readonly camera: CameraController;
  readonly current: () => ArtworkLease;
  readonly viewport: () => ArtworkViewport;
  readonly gpuBudgetBytes: number;
  readonly load: (manifest: unknown, signal: AbortSignal, id: string) => Promise<ArtworkLease>;
  readonly attach: (lease: ArtworkLease) => void;
  readonly compose: (composition: SceneComposition) => void;
  readonly release: (lease: ArtworkLease) => void;
  readonly commit: (destination: ArtworkLease, placement: ArtworkPlacement) => void;
}
type Phase = "idle" | "preparing" | "prepared" | "revealing" | "rollingBack" | "committed" | "cancelled" | "failed" | "disposed";

export function estimatedTextureBytes(lease: ArtworkLease) {
  return lease.loaded.manifest.assets.filter(asset => asset.critical).reduce((sum, asset) => sum + asset.width * asset.height * 4, 0);
}

/** One transaction, driven exclusively by the existing fixed-step clock.
 * Async completion only makes B prepared; it cannot start motion or commit. */
export function createTransitionCoordinator(ports: TransitionPorts) {
  let phase: Phase = "idle", generation = 0, pending: ArtworkLease | null = null;
  let placement: ArtworkPlacement | null = null, ticks = 0, elapsed = 0, reveal = 0;
  let startPose: CameraPose | null = null, abort: AbortController | null = null;
  let error: unknown = null, rollbackResult: "cancelled" | "failed" = "cancelled";
  let unsubscribe: (() => void) | null = null;
  let handoff: Readonly<{ before: ReturnType<CameraController["getSnapshot"]>; after: ReturnType<CameraController["getSnapshot"]> }> | null = null;
  const busy = () => ["preparing", "prepared", "revealing", "rollingBack"].includes(phase);
  function cleanListener() { unsubscribe?.(); unsubscribe = null; }
  function finish(result: "cancelled" | "failed") {
    ports.compose({ sourceId: ports.current().instance.id });
    const lease = pending; pending = null;
    if (lease) ports.release(lease);
    reveal = 0; phase = result; cleanListener();
  }
  function cancel(failure?: unknown) {
    if (!busy() || phase === "rollingBack") return;
    error = failure ?? null; rollbackResult = failure ? "failed" : "cancelled";
    if (phase === "preparing") {
      generation++; abort?.abort(failure ?? new Error("Transition cancelled")); abort = null;
      phase = rollbackResult; cleanListener(); return;
    }
    if (phase === "prepared") { finish(rollbackResult); return; }
    phase = "rollingBack"; elapsed = 0;
    try { ports.camera.retarget(startPose!, ticks / 60); }
    catch { ports.camera.halt(); } // Hold last safe A pose if a smooth return is unsafe.
  }
  function destinationCovered() {
    if (!pending || !placement) return false;
    const pose = cameraInDestination(ports.camera.getSnapshot().pose, placement);
    const viewport = ports.viewport();
    const magnification = Math.max(viewport.width * viewport.dpr * viewport.renderScale / 3840,
      viewport.height * viewport.dpr * viewport.renderScale / 2160) * Math.exp(pose.logScale);
    // First slice has no LOD: cap destination texel magnification at 2x.
    return magnification <= 2 && coversViewport(pending.instance.getSnapshot().layers[0], getCoverView(viewport.width, viewport.height), pose);
  }
  return {
    async request(request: TransitionRequest): Promise<void> {
      if (phase === "disposed" || busy()) throw new Error(`Cannot request transition in ${phase}`);
      if (request.sourceInstanceId !== ports.current().instance.id) throw new Error("Stale transition source");
      const manifest = parseArtworkPackage(request.manifest);
      const anchor = manifest.anchors.find(anchor => anchor.id === request.anchorId);
      if (!anchor) throw new Error("Unknown transition anchor");
      const resolved = Object.freeze({ ...request.placement, anchorX: anchor.x, anchorY: anchor.y });
      validatePlacement(resolved);
      if (!Number.isFinite(request.durationSeconds) || request.durationSeconds < 1 / 60 || request.durationSeconds > 60) throw new Error("Invalid transition duration");
      const timeoutMs = request.loadTimeoutMs ?? 15_000;
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("Invalid transition load timeout");
      const viewport = ports.viewport();
      const targetBytes = Math.ceil(viewport.width * viewport.dpr * viewport.renderScale) * Math.ceil(viewport.height * viewport.dpr * viewport.renderScale) * 4;
      const destinationBytes = manifest.assets.filter(asset => asset.critical).reduce((sum, asset) => sum + asset.width * asset.height * 4, 0);
      if (estimatedTextureBytes(ports.current()) + destinationBytes + targetBytes > ports.gpuBudgetBytes) throw new Error("GPU_BUDGET_EXCEEDED: A/B admission rejected");
      request.signal?.throwIfAborted();
      phase = "preparing"; error = null; handoff = null; reveal = 0;
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
      } catch (failure) {
        if (revision === generation) { error = failure; finish("failed"); }
        throw failure;
      } finally { clearTimeout(timeout); if (abort === operation) abort = null; }
    },
    step(context: StepContext, modulation?: BehaviorModulation) {
      if (phase === "disposed") throw new Error("Transition coordinator is disposed");
      const source = ports.current();
      source.instance.stepBehaviors(context, modulation);
      pending?.instance.stepBehaviors(context, modulation);
      if (phase === "prepared") {
        startPose = ports.camera.getSnapshot().pose;
        const center = placePoint({ x: 1920, y: 1080 }, placement!);
        try {
          ports.camera.retarget({ ...center, rotation: placement!.rotation, logScale: Math.log(1.15 / placement!.scale) }, ticks / 60);
          elapsed = 0; phase = "revealing";
        } catch (failure) { error = failure; finish("failed"); }
      }
      ports.camera.step();
      if (phase === "revealing") {
        elapsed++;
        const progress = Math.min(1, elapsed / Math.max(1, Math.round(ticks * 0.6)));
        reveal = progress * progress * (3 - 2 * progress);
        ports.compose({ sourceId: source.instance.id, destinationId: pending!.instance.id, placement: placement!, reveal });
        if (ports.camera.getSnapshot().constraintReached) { cancel(new Error("CAMERA_CONSTRAINT_REACHED")); return; }
        if (reveal === 1 && destinationCovered()) {
          try {
            const before = ports.camera.getSnapshot();
            ports.commit(pending!, placement!);
            handoff = Object.freeze({ before, after: ports.camera.getSnapshot() });
            pending = null; phase = "committed"; cleanListener();
          } catch (failure) { cancel(failure); }
        } else if (elapsed >= ticks) cancel(new Error("TRANSITION_HANDOFF_BLOCKED: coverage/resolution"));
      } else if (phase === "rollingBack") {
        elapsed++;
        reveal *= Math.max(0, 1 - 1 / Math.max(1, ticks - elapsed + 1));
        ports.compose(pending ? { sourceId: source.instance.id, destinationId: pending.instance.id, placement: placement!, reveal }
          : { sourceId: source.instance.id });
        if (elapsed >= ticks) finish(rollbackResult);
      }
    },
    cancel,
    rejectDestination(failure: unknown) {
      cancel(failure);
      if (phase === "rollingBack" && pending) {
        ports.compose({ sourceId: ports.current().instance.id });
        const rejected = pending; pending = null; reveal = 0; ports.release(rejected);
      }
    },
    reset() {
      if (phase === "disposed") throw new Error("Transition coordinator is disposed");
      generation++; abort?.abort(new Error("Transition reset")); abort = null;
      if (pending) finish("cancelled"); cleanListener();
      phase = "idle"; error = null; reveal = 0; handoff = null;
    },
    getSnapshot() { return Object.freeze({ phase, reveal, error, handoff, sourceInstanceId: ports.current().instance.id,
      destinationInstanceId: pending?.instance.id ?? null, qualityLocked: busy() }); },
    dispose() {
      if (phase === "disposed") return;
      generation++; abort?.abort(new Error("Transition disposed")); abort = null;
      if (pending) finish("cancelled"); cleanListener(); phase = "disposed";
    },
  };
}
export type TransitionCoordinator = ReturnType<typeof createTransitionCoordinator>;
