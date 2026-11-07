export interface DiagnosticEvent {
  readonly code: string; readonly tick: number; readonly sessionId: string;
  readonly severity: "debug" | "info" | "warning" | "error" | "critical";
  readonly artworkInstanceId?: string; readonly transitionId?: string;
  readonly details?: Readonly<Record<string, number | boolean>>;
}

/** Bounded, serializable data only: no URLs, audio, images or exception text.
 * Frame intervals measure browser delivery, not GPU timer-query duration. */
export function createSessionDiagnostics(sessionId: string) {
  const events: DiagnosticEvent[] = [], frames: number[] = [];
  let eventCursor = 0, frameCursor = 0, totalFrames = 0, totalIntervalMs = 0;
  return {
    event(code: string, tick: number, severity: DiagnosticEvent["severity"] = "info", context?: Pick<DiagnosticEvent,"artworkInstanceId" | "transitionId" | "details">) {
      if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(code) || !Number.isSafeInteger(tick) || tick < 0) throw new Error("Invalid diagnostic event");
      if (!["debug","info","warning","error","critical"].includes(severity)) throw new Error("Invalid diagnostic severity");
      for (const identity of [context?.artworkInstanceId,context?.transitionId]) if (identity !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(identity)) throw new Error("Invalid diagnostic identity");
      const details = context?.details;
      if (details && (Object.keys(details).length > 16 || Object.entries(details).some(([key,value]) => !/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key) || !(typeof value === "boolean" || typeof value === "number" && Number.isFinite(value))))) throw new Error("Invalid diagnostic details");
      const entry = Object.freeze({ code, tick, sessionId, severity,
        ...(context?.artworkInstanceId ? { artworkInstanceId:context.artworkInstanceId } : {}),
        ...(context?.transitionId ? { transitionId:context.transitionId } : {}),
        ...(details ? { details:Object.freeze({ ...details }) } : {}) });
      if (events.length < 128) events.push(entry); else { events[eventCursor] = entry; eventCursor = (eventCursor + 1) % 128; }
    },
    frame(milliseconds: number) {
      if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
      totalFrames++; totalIntervalMs += milliseconds;
      if (frames.length < 600) frames.push(milliseconds); else { frames[frameCursor] = milliseconds; frameCursor = (frameCursor + 1) % 600; }
    },
    getSnapshot() {
      const sorted = [...frames].sort((a, b) => a - b);
      const percentile = (p: number) => sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : 0;
      return Object.freeze({ sessionId, totalFrames, totalIntervalMs, retainedFrames: frames.length,
        frameMsP50: percentile(0.5), frameMsP95: percentile(0.95),
        averageFps: totalIntervalMs ? totalFrames * 1000 / totalIntervalMs : 0,
        events: Object.freeze([...events.slice(eventCursor), ...events.slice(0, eventCursor)]),
      });
    },
  };
}
