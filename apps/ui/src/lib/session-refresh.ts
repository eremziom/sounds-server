import type { ApplicationSession } from "./application-session.ts";

export type RefreshResult =
  | { ok: true; accessTokenExpiresAt: number }
  | { ok: false; reason?: "unavailable" };

const REFRESH_AHEAD_MS = 60_000;
const MAX_TIMER_MS = 2_147_483_647;

type RefreshState = {
  expiry: number | null;
  dueAt: number | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  running: boolean;
};

function clearTimer(state: RefreshState) {
  clearTimeout(state.timer);
  state.timer = undefined;
}

function scheduleTimer(
  state: RefreshState,
  session: ApplicationSession,
  onDue: () => Promise<boolean>,
) {
  clearTimer(state);
  if (!state.running || state.dueAt === null || session.getSnapshot() !== "active") return;
  const delay = Math.min(MAX_TIMER_MS, Math.max(0, state.dueAt - Date.now()));
  state.timer = setTimeout(() => { void onDue(); }, delay);
}

function getNextRefreshTime(expiry: number, now: number): number {
  const remaining = expiry - now;
  // A full minute's headroom is impossible for short-lived tokens. Renew
  // halfway through their remaining time to avoid an immediate rotation loop.
  const headroom = remaining <= REFRESH_AHEAD_MS ? remaining / 2 : REFRESH_AHEAD_MS;
  return expiry - headroom;
}

async function renewToken(state: RefreshState, refresh: () => Promise<RefreshResult>): Promise<boolean | "unavailable"> {
  const result = await refresh();
  const now = Date.now();
  if (!result.ok) return result.reason === "unavailable" ? "unavailable" : false;
  if (!Number.isFinite(result.accessTokenExpiresAt) || result.accessTokenExpiresAt <= now) return "unavailable";
  state.expiry = result.accessTokenExpiresAt;
  state.dueAt = getNextRefreshTime(state.expiry, now);
  return true;
}

// One scheduler per mounted runtime. Contains timestamps only, never tokens.
export function createSessionRefresh(
  session: ApplicationSession,
  initialExpiry: number | null,
  refresh: () => Promise<RefreshResult>,
) {
  const state: RefreshState = {
    expiry: initialExpiry,
    dueAt: initialExpiry === null ? null : initialExpiry - REFRESH_AHEAD_MS,
    timer: undefined,
    running: false,
  };

  function schedule() {
    scheduleTimer(state, session, ensureFresh);
  }

  async function ensureFresh(): Promise<boolean> {
    if (session.getSnapshot() === "ended") return false;
    if (session.getSnapshot() === "active" && (state.dueAt === null || Date.now() < state.dueAt)) {
      schedule();
      return true;
    }
    clearTimer(state);
    const confirmed = await session.renew(() => renewToken(state, refresh));
    schedule();
    return confirmed;
  }

  function updateExpiry(next: number | null) {
    if (next === state.expiry) return;
    state.expiry = next;
    state.dueAt = next === null ? null : next - REFRESH_AHEAD_MS;
    schedule();
  }

  function start() {
    state.running = true;
    const unsubscribe = session.subscribe(() => {
      if (session.getSnapshot() !== "active") clearTimer(state);
    });
    schedule();
    return () => {
      state.running = false;
      clearTimer(state);
      unsubscribe();
    };
  }

  return { ensureFresh, updateExpiry, start };
}
