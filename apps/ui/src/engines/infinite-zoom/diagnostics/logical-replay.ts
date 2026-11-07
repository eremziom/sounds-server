import { createSeededRandom } from "../core/seeded-random.ts";
import type { StepContext } from "../core/contracts.ts";
import type { NormalizedSignals } from "../modulation/bindings.ts";

export type JourneyCommand = "zoomIn" | "zoomOut" | "rotate" | "return" | "hold" | "cancel" | "transition" | "loopOn" | "loopOff";
const COMMANDS: readonly JourneyCommand[] = ["zoomIn","zoomOut","rotate","return","hold","cancel","transition","loopOn","loopOff"];
export interface ReplayFrame {
  readonly tick: number; readonly signals: NormalizedSignals | null; readonly commands: readonly JourneyCommand[];
}
export interface LogicalRecording {
  readonly schemaVersion: 1; readonly seed: number;
  readonly packages: readonly { readonly id: string; readonly version: string }[];
  readonly complete: boolean; readonly frames: readonly ReplayFrame[];
}

/** Recording stops at capacity rather than dropping the prefix required for
 * deterministic replay. Memory is bounded; no audio or images are recorded. */
export function createLogicalRecorder(seed: number, packages: LogicalRecording["packages"], capacity = 36000) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 432000) throw new Error("Invalid replay limits");
  if (!packages.length || packages.length > 64 || packages.some(p => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(p.id) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(p.version)) || new Set(packages.map(p => p.id)).size !== packages.length) throw new Error("Invalid replay package identity");
  const identities = Object.freeze(packages.map(p => Object.freeze({ id:p.id,version:p.version })));
  let frames: ReplayFrame[] = [], pending: JourneyCommand[] = [], complete = true, stopped = false;
  return {
    stop() { stopped=true; complete=false; pending=[]; },
    command(command: JourneyCommand) {
      if (stopped) return;
      if (!COMMANDS.includes(command)) throw new Error("Invalid replay command");
      if (pending.length >= 32) { complete = false; return; }
      pending.push(command);
    },
    capture(tick: number, signals: NormalizedSignals | null) {
      if (stopped) return;
      if (!Number.isSafeInteger(tick) || tick !== frames.length+1) {
        if (frames.length === capacity && tick > capacity) { complete = false; pending = []; return; }
        throw new Error("Replay requires consecutive fixed ticks from reset");
      }
      if (frames.length === capacity) { complete = false; pending = []; return; }
      const normalized: Partial<Record<keyof NormalizedSignals,number>> = {};
      for (const key of ["bass","mid","high","energy"] as const) {
        const value = signals?.[key];
        if (value !== undefined && Number.isFinite(value)) normalized[key] = Math.max(0,Math.min(1,value));
      }
      frames.push(Object.freeze({ tick, signals: signals === null ? null : Object.freeze(normalized), commands:Object.freeze(pending) })); pending = [];
    },
    getSnapshot() { return Object.freeze({ frames:frames.length, capacity, complete }); },
    export(): LogicalRecording { return Object.freeze({ schemaVersion:1, seed, packages:identities, complete, frames:Object.freeze([...frames]) }); },
    reset() { frames = []; pending = []; complete = true; stopped=false; },
  };
}

export function validateRecording(input: unknown): LogicalRecording {
  if (!input || typeof input !== "object") throw new Error("Invalid logical recording");
  const data = input as LogicalRecording;
  if (data.schemaVersion !== 1 || typeof data.complete !== "boolean" || !Array.isArray(data.frames) || data.frames.length > 432000 || !Array.isArray(data.packages)) throw new Error("Invalid logical recording schema");
  const recorder = createLogicalRecorder(data.seed,data.packages,Math.max(1,data.frames.length));
  for (const frame of data.frames) {
    if (!frame || !Array.isArray(frame.commands) || frame.commands.length > 32 || (frame.signals !== null && (!frame.signals || typeof frame.signals !== "object" || Array.isArray(frame.signals)))) throw new Error("Invalid replay frame");
    if (frame.signals !== null) for (const [key,value] of Object.entries(frame.signals)) if (!["bass","mid","high","energy"].includes(key) || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid normalized replay signal");
    for (const command of frame.commands) recorder.command(command);
    recorder.capture(frame.tick,frame.signals);
  }
  return Object.freeze({ ...recorder.export(), complete:data.complete });
}

/** Consumer owns preparation and disposal. Replay never opens audio or a RAF.
 * Identity matching prevents replaying commands against different artwork data. */
export function replayLogicalJourney(recording: unknown, ports: {
  readonly packages: LogicalRecording["packages"];
  readonly command: (command: JourneyCommand) => void;
  readonly step: (context: StepContext, signals: NormalizedSignals | null) => void;
}) {
  const data = validateRecording(recording);
  if (JSON.stringify([...data.packages].sort((a,b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) !== JSON.stringify([...ports.packages].map(p=>({id:p.id,version:p.version})).sort((a,b)=>(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))) throw new Error("Replay package version mismatch");
  const random = createSeededRandom(data.seed);
  for (const frame of data.frames) {
    for (const command of frame.commands) ports.command(command);
    ports.step({ tick:frame.tick, timeSeconds:frame.tick/60, dt:1/60, random:()=>random.next() },frame.signals);
  }
  return Object.freeze({ ticks:data.frames.length, complete:data.complete });
}
