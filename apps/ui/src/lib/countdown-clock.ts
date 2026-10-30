// Align updates with the next displayed-second boundary of either deadline.
// Deadlines can have different millisecond offsets, so a fixed interval cannot
// reliably drive both countdowns. Every callback recalculates from wall time.
export function countdownTickDelay(expiries: readonly (number | null)[], now: number): number | null {
  let delay = Infinity;
  for (const expiry of expiries) {
    if (expiry === null || !Number.isFinite(expiry) || expiry <= now) continue;
    const remaining = expiry - now;
    delay = Math.min(delay, remaining - (Math.ceil(remaining / 1000) - 1) * 1000);
  }
  return Number.isFinite(delay) ? Math.max(1, delay) : null;
}

export function startCountdownClock(expiries: readonly (number | null)[], onTick: (now: number) => void) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function sync() {
    if (stopped) return;
    clearTimeout(timer);
    const now = Date.now();
    onTick(now);
    const delay = countdownTickDelay(expiries, now);
    if (!stopped && delay !== null) timer = setTimeout(sync, delay);
  }

  // Preserve the identical server/first-client placeholder, then read the clock
  // immediately after mount rather than waiting a whole second.
  timer = setTimeout(sync, 0);
  return {
    sync,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
