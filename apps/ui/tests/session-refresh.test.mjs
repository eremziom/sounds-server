import assert from "node:assert/strict";
import { test } from "node:test";
import { createApplicationSession } from "../src/lib/application-session.ts";
import { createSessionRefresh } from "../src/lib/session-refresh.ts";

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test("timer uses actual expiry minus one minute and reschedules from each new response", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  const session = createApplicationSession();
  let calls = 0;
  const renewal = createSessionRefresh(session, Date.now() + 300_000, async () => {
    calls++;
    return { ok: true, accessTokenExpiresAt: Date.now() + (calls === 1 ? 120_000 : 3_600_000) };
  });
  t.after(renewal.start());
  t.mock.timers.tick(239_999);
  await flush();
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls, 1);
  assert.equal(session.getSnapshot(), "active");
  t.mock.timers.tick(59_999);
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls, 2);
  t.mock.timers.tick(3_539_999);
  await flush();
  assert.equal(calls, 2);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls, 3);
});

test("resume or protected request checks current time and shares a pending renewal", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  const session = createApplicationSession();
  let calls = 0;
  let resolve;
  const renewal = createSessionRefresh(session, Date.now() + 120_000, () => {
    calls++;
    return new Promise((done) => { resolve = done; });
  });
  t.after(renewal.start());
  assert.equal(await renewal.ensureFresh(), true);
  assert.equal(calls, 0);
  // Advance the wall clock without executing the suspended tab's timer.
  t.mock.timers.setTime(Date.now() + 180_000);
  const first = renewal.ensureFresh();
  const second = renewal.ensureFresh();
  await flush();
  assert.equal(calls, 1);
  assert.equal(session.getSnapshot(), "refreshing");
  resolve({ ok: true, accessTokenExpiresAt: Date.now() + 600_000 });
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(session.getSnapshot(), "active");
});

test("short-lived tokens renew without a tight refresh loop", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  let calls = 0;
  const renewal = createSessionRefresh(createApplicationSession(), Date.now() + 30_000, async () => {
    calls++;
    return { ok: true, accessTokenExpiresAt: Date.now() + 30_000 };
  });
  t.after(renewal.start());
  t.mock.timers.tick(0);
  await flush();
  assert.equal(calls, 1);
  assert.equal(await renewal.ensureFresh(), true);
  assert.equal(calls, 1);
  t.mock.timers.tick(14_999);
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls, 2);
});

test("new server expiry reschedules; cleanup and ended sessions prevent later renewal", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  const session = createApplicationSession();
  let calls = 0;
  const renewal = createSessionRefresh(session, Date.now() + 120_000, async () => {
    calls++;
    return { ok: true, accessTokenExpiresAt: Date.now() + 600_000 };
  });
  const stop = renewal.start();
  renewal.updateExpiry(Date.now() + 600_000);
  t.mock.timers.tick(60_000);
  await flush();
  assert.equal(calls, 0);
  stop();
  t.mock.timers.tick(600_000);
  await flush();
  assert.equal(calls, 0);
  const stopAgain = renewal.start();
  session.end();
  t.mock.timers.tick(600_000);
  await flush();
  assert.equal(await renewal.ensureFresh(), false);
  assert.equal(calls, 0);
  stopAgain();
});

test("rejected renewal ends the session; uncertain failure blocks it without scheduling a retry", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  for (const [result, status] of [
    [{ ok: false }, "ended"],
    [{ ok: false, reason: "unavailable" }, "unavailable"],
    [{ ok: true, accessTokenExpiresAt: Date.now() - 1 }, "unavailable"],
  ]) {
    const session = createApplicationSession();
    let calls = 0;
    const renewal = createSessionRefresh(session, Date.now(), async () => { calls++; return result; });
    const stop = renewal.start();
    assert.equal(await renewal.ensureFresh(), false);
    assert.equal(session.getSnapshot(), status);
    t.mock.timers.tick(600_000);
    await flush();
    assert.equal(calls, 1);
    stop();
  }
});
