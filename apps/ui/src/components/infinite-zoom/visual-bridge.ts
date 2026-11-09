import type { BehaviorKind, PilotControl, VisualScene } from "../../engines/infinite-zoom/artwork/pilot-controls.ts";
import type { LogicalRecording } from "../../engines/infinite-zoom/diagnostics/logical-replay.ts";
import type { EngineStatus } from "../../engines/infinite-zoom/core/contracts.ts";

export class VisualReadinessError extends Error {
  constructor() { super("Critical visualization is not ready"); this.name = "VisualReadinessError"; }
}

export interface VisualView {
  readonly status: EngineStatus; readonly tick: number; readonly artwork: string; readonly transition: string;
  readonly error: boolean; readonly ready: boolean; readonly retryable: boolean;
  readonly diagnostics?: Readonly<Record<string, unknown>>;
  readonly canTransition?: boolean;
  readonly looping?: boolean;
  readonly scene?: VisualScene; readonly sceneLoading?: boolean;
  readonly pilotControls?: readonly PilotControl[]; readonly pilotCameraMotion?: boolean;
  readonly rimLightingEnabled?: boolean;
  readonly sceneRevealEnabled?: boolean; readonly sceneRevealProgress?: number;
  readonly environmentBlackoutEnabled?: boolean;
}
export interface VisualConnection {
  prepareForPlayback(): Promise<void>;
  retry(): Promise<void>;
  command(command: "zoomIn" | "zoomOut" | "rotate" | "return" | "hold" | "cancel"): void;
  transition(): Promise<void>;
  setLoop?(enabled: boolean): void;
  exportReplay?(): LogicalRecording | null;
  selectScene?(scene: VisualScene): Promise<void>;
  setPilotControl?(kind: BehaviorKind, enabled: boolean, strength: number): void;
  setPilotPreset?(preset: "subtle" | "all" | "none" | BehaviorKind): void;
  setPilotCameraMotion?(enabled: boolean): void;
  setRimLightingEnabled?(enabled: boolean): void;
  setSceneRevealEnabled?(enabled: boolean): void;
  restartSceneReveal?(): void;
  setEnvironmentBlackoutEnabled?(enabled: boolean): void;
  reset(): void;
  dispose(): void;
}
const INITIAL_VIEW: VisualView = Object.freeze({ status: "idle", tick: 0, artwork: "", transition: "idle", error: false, ready: false, retryable: false });

/** Stable React/application boundary. A connection owns one terminal engine;
 * replacing an effect during development creates a fresh connection, never
 * reactivates a disposed engine. Pages and display modes do not own it. */
export function createVisualBridge() {
  let connection: VisualConnection | null = null, view = INITIAL_VIEW;
  let mode: "background" | "immersive" = "background", modulation = true;
  let restoreFocus: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => view, getServerSnapshot: () => INITIAL_VIEW,
    getMode: () => mode, getServerMode: () => "background" as const,
    getModulation: () => modulation,
    setMode(next: typeof mode, onExit?: () => void) { if (next === "immersive") restoreFocus = onExit ?? null; mode = next; notify(); },
    restoreFocus() { const restore = restoreFocus; restoreFocus = null; restore?.(); },
    setModulation(enabled: boolean) { modulation = enabled; notify(); },
    publish(next: VisualView) { view = Object.freeze({ ...next }); notify(); },
    connect(next: VisualConnection) {
      if (connection) throw new Error("Infinite Zoom already has a connection");
      connection = next;
      return () => { if (connection === next) { connection = null; view = INITIAL_VIEW; mode = "background"; notify(); } };
    },
    prepareForPlayback() { return connection?.prepareForPlayback() ?? Promise.reject(new Error("Visual host is not mounted")); },
    retry() { return connection?.retry() ?? Promise.reject(new Error("Visual host is not mounted")); },
    command(command: Parameters<VisualConnection["command"]>[0]) { connection?.command(command); },
    transition() { return connection?.transition() ?? Promise.reject(new Error("Visual host is not mounted")); },
    setLoop(enabled: boolean) { connection?.setLoop?.(enabled); },
    selectScene(scene: VisualScene) { return connection?.selectScene?.(scene) ?? Promise.reject(new Error("Visual host is not mounted")); },
    setPilotControl(kind: BehaviorKind, enabled: boolean, strength: number) { connection?.setPilotControl?.(kind,enabled,strength); },
    setPilotPreset(preset: "subtle" | "all" | "none" | BehaviorKind) { connection?.setPilotPreset?.(preset); },
    setPilotCameraMotion(enabled: boolean) { connection?.setPilotCameraMotion?.(enabled); },
    setRimLightingEnabled(enabled: boolean) { connection?.setRimLightingEnabled?.(enabled); },
    setSceneRevealEnabled(enabled: boolean) { connection?.setSceneRevealEnabled?.(enabled); },
    restartSceneReveal() { connection?.restartSceneReveal?.(); },
    setEnvironmentBlackoutEnabled(enabled: boolean) { connection?.setEnvironmentBlackoutEnabled?.(enabled); },
    exportReplay() { return connection?.exportReplay?.() ?? null; },
    reset() { connection?.reset(); },
    dispose() { const current = connection; connection = null; current?.dispose(); mode = "background"; view = Object.freeze({ ...view, status: "disposed", ready: false, retryable: false }); notify(); },
  };
}
export type VisualBridge = ReturnType<typeof createVisualBridge>;
