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
}
export interface VisualConnection {
  prepareForPlayback(): Promise<void>;
  retry(): Promise<void>;
  command(command: "zoomIn" | "zoomOut" | "rotate" | "return" | "hold" | "cancel"): void;
  transition(): Promise<void>;
  setLoop?(enabled: boolean): void;
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
    reset() { connection?.reset(); },
    dispose() { const current = connection; connection = null; current?.dispose(); mode = "background"; view = Object.freeze({ ...view, status: "disposed", ready: false, retryable: false }); notify(); },
  };
}
export type VisualBridge = ReturnType<typeof createVisualBridge>;
