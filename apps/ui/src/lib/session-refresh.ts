import type { ApplicationSession } from "./application-session.ts";

export type RefreshResult =
  | { ok: true; accessTokenExpiresAt: number; sessionExpiresAt: number }
  | { ok: false; reason?: "unavailable"; rateLimited?: boolean };

const REFRESH_AHEAD_MS = 60_000;
const MAX_TIMER_MS = 2_147_483_647;

type RefreshState = {
  expiry: number | null;
  dueAt: number | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  sessionExpiresAt: number;
  deadlineTimer: ReturnType<typeof setTimeout> | undefined;
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

// One scheduler per mounted runtime. Contains timestamps only, never tokens.
export function createSessionRefresh(
  session: ApplicationSession,
  initialExpiry: number | null,
  refresh: () => Promise<RefreshResult>,
  initialSessionExpiry: number,
) {
  const state: RefreshState = {
    expiry: initialExpiry,
    dueAt: initialExpiry === null ? null : initialExpiry - REFRESH_AHEAD_MS,
    timer: undefined,
    sessionExpiresAt: initialSessionExpiry,
    deadlineTimer: undefined,
    running: false,
  };

  // This check also runs before requests and on resume, because browser timers
  // can be delayed while a tab is suspended. It never authorizes API requests.
  function checkDeadline(): boolean {
    if (session.getSnapshot() === "ended") return false;
    if (!Number.isFinite(state.sessionExpiresAt) || Date.now() >= state.sessionExpiresAt) {
      session.end();
      return false;
    }
    return true;
  }

  function scheduleDeadline() {
    clearTimeout(state.deadlineTimer);
    state.deadlineTimer = undefined;
    if (!state.running || !checkDeadline()) return;
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, state.sessionExpiresAt - Date.now()));
    state.deadlineTimer = setTimeout(() => {
      // Re-arm long deadlines and tolerate a backwards wall-clock adjustment.
      if (checkDeadline()) scheduleDeadline();
    }, delay);
  }

  function schedule() {
    scheduleDeadline();
    scheduleTimer(state, session, ensureFresh);
  }

  async function renewToken(): Promise<boolean | "unavailable"> {
    try {
      if (!checkDeadline()) return false;
      const result = await refresh();
      if (!checkDeadline()) return false;
      if (!result.ok) return result.reason === "unavailable" ? "unavailable" : false;
      if (!Number.isFinite(result.sessionExpiresAt)) return "unavailable";
      // Renewals may shorten the known deadline, but never extend this session.
      state.sessionExpiresAt = Math.min(state.sessionExpiresAt, result.sessionExpiresAt);
      scheduleDeadline();
      if (!checkDeadline()) return false;
      const now = Date.now();
      if (!Number.isFinite(result.accessTokenExpiresAt) || result.accessTokenExpiresAt <= now) return "unavailable";
      state.expiry = result.accessTokenExpiresAt;
      state.dueAt = getNextRefreshTime(state.expiry, now);
      return true;
    } finally {
      // A failed/throwing renewal must also respect a deadline reached in flight.
      checkDeadline();
    }
  }

  async function ensureFresh(): Promise<boolean> {
    if (!checkDeadline()) return false;
    if (session.getSnapshot() === "active" && (state.dueAt === null || Date.now() < state.dueAt)) {
      schedule();
      return true;
    }
    clearTimer(state);
    const confirmed = await session.renew(renewToken);
    schedule();
    return checkDeadline() && confirmed;
  }

  function updateSessionExpiry(next: number) {
    state.sessionExpiresAt = Math.min(state.sessionExpiresAt, next);
    if (checkDeadline()) scheduleDeadline();
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
      if (session.getSnapshot() === "ended") {
        clearTimeout(state.deadlineTimer);
        state.deadlineTimer = undefined;
      }
    });
    schedule();
    return () => {
      state.running = false;
      clearTimer(state);
      clearTimeout(state.deadlineTimer);
      state.deadlineTimer = undefined;
      unsubscribe();
    };
  }

  return { ensureFresh, checkDeadline, updateExpiry, updateSessionExpiry, start };
}
