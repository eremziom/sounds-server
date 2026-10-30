import assert from "node:assert/strict";
import { test } from "node:test";
import { createApplicationSession } from "../src/lib/application-session.ts";
import { createSessionRefresh } from "../src/lib/session-refresh.ts";
import { createProtectedRequest } from "../src/lib/protected-request.ts";

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test("absolute session deadline ends a session before its still-valid access token", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  const session = createApplicationSession();
  const renewal = createSessionRefresh(session, Date.now() + 900_000,
    () => assert.fail("No renewal needed before the session ends"), Date.now() + 120_000);
  t.after(renewal.start());
  t.mock.timers.tick(119_999);
  assert.equal(session.getSnapshot(), "active");
  t.mock.timers.tick(1);
  assert.equal(session.getSnapshot(), "ended");
  assert.equal(await renewal.ensureFresh(), false);
});

test("unavailable sessions still end at their deadline without retrying the API", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  for (const throws of [false, true]) {
    const session = createApplicationSession();
    let calls = 0;
    const renewal = createSessionRefresh(session, Date.now(), async () => {
      calls++;
      if (throws) throw Error("offline");
      return { ok: false, reason: "unavailable" };
    }, Date.now() + 10_000);
    const stop = renewal.start();
    assert.equal(await renewal.ensureFresh(), false);
    assert.equal(session.getSnapshot(), "unavailable");
    t.mock.timers.tick(10_000);
    assert.equal(session.getSnapshot(), "ended");
    assert.equal(calls, 1);
    stop();
  }
});

test("a renewal finishing after the deadline cannot reactivate a session or dispatch a waiting request", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  for (const throws of [false, true]) {
    const session = createApplicationSession();
    let resolve, reject;
    const renewal = createSessionRefresh(session, Date.now(), () => new Promise((done, fail) => { resolve = done; reject = fail; }), Date.now() + 10_000);
    const stop = renewal.start();
    const run = createProtectedRequest(session, renewal.ensureFresh);
    const request = run(() => assert.fail("Expired session must not dispatch"));
    await flush();
    assert.equal(session.getSnapshot(), "refreshing");
    t.mock.timers.tick(10_000);
    assert.equal(session.getSnapshot(), "ended");
    if (throws) reject(Error("offline"));
    else resolve({ ok: true, accessTokenExpiresAt: Date.now() + 900_000, sessionExpiresAt: Date.now() + 86_400_000 });
    assert.deepEqual(await request, { executed: false });
    assert.equal(session.getSnapshot(), "ended");
    stop();
  }
});

test("resume and protected calls enforce the deadline even when the browser timer has not fired", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  for (const unavailable of [false, true]) {
    const session = createApplicationSession();
    const renewal = createSessionRefresh(session, Date.now() + 900_000,
      () => assert.fail("Expired session must not refresh"), Date.now() + 10_000);
    t.after(renewal.start());
    if (unavailable) await session.renew(async () => "unavailable");
    t.mock.timers.setTime(Date.now() + 10_000);
    assert.equal(renewal.checkDeadline(), false);
    assert.equal(session.getSnapshot(), "ended");
    const run = createProtectedRequest(session, renewal.ensureFresh);
    assert.deepEqual(await run(() => assert.fail("Expired session must not dispatch")), { executed: false });
  }
  // Also check the request path directly, without a preceding resume check.
  const session = createApplicationSession();
  const renewal = createSessionRefresh(session, Date.now() + 900_000,
    () => assert.fail("No refresh after the deadline"), Date.now() + 10_000);
  t.mock.timers.setTime(Date.now() + 10_000);
  assert.deepEqual(await createProtectedRequest(session, renewal.ensureFresh)(() => assert.fail("No dispatch")), { executed: false });
  assert.equal(session.getSnapshot(), "ended");
});

test("refresh and server re-renders cannot move the absolute deadline forward, but may shorten it", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  const session = createApplicationSession();
  const renewal = createSessionRefresh(session, Date.now(), async () => ({
    ok: true, accessTokenExpiresAt: Date.now() + 900_000, sessionExpiresAt: Date.now() + 86_400_000,
  }), Date.now() + 20_000);
  t.after(renewal.start());
  assert.equal(await renewal.ensureFresh(), true);
  renewal.updateSessionExpiry(Date.now() + 86_400_000);
  t.mock.timers.tick(19_999);
  assert.equal(session.getSnapshot(), "active");
  t.mock.timers.tick(1);
  assert.equal(session.getSnapshot(), "ended");

  const second = createApplicationSession();
  const shorter = createSessionRefresh(second, Date.now() + 900_000, async () => assert.fail("No refresh"), Date.now() + 20_000);
  t.after(shorter.start());
  shorter.updateSessionExpiry(Date.now() + 5_000);
  t.mock.timers.tick(5_000);
  assert.equal(second.getSnapshot(), "ended");
});

test("long session deadlines re-arm safely and cleanup cancels the deadline timer", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  const max = 2_147_483_647;
  const session = createApplicationSession();
  const renewal = createSessionRefresh(session, null, () => assert.fail("No refresh"), Date.now() + max + 1_000);
  const stop = renewal.start();
  t.mock.timers.tick(max);
  assert.equal(session.getSnapshot(), "active");
  t.mock.timers.tick(1_000);
  assert.equal(session.getSnapshot(), "ended");
  stop();

  const other = createApplicationSession();
  const cleanup = createSessionRefresh(other, null, () => assert.fail("No refresh"), Date.now() + 1_000);
  cleanup.start()();
  t.mock.timers.tick(1_000);
  assert.equal(other.getSnapshot(), "active", "Unmount cancels timers");
  assert.equal(cleanup.checkDeadline(), false, "Remount/resume still checks the deadline");
});

test("invalid or elapsed session deadlines fail closed without contacting the API", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  for (const expiry of [NaN, Infinity, undefined, Date.now(), Date.now() - 1]) {
    const session = createApplicationSession();
    const renewal = createSessionRefresh(session, Date.now() + 900_000, () => assert.fail("No refresh"), expiry);
    t.after(renewal.start());
    assert.equal(await renewal.ensureFresh(), false);
    assert.equal(session.getSnapshot(), "ended");
  }
});

test("timer uses actual expiry minus one minute and reschedules from each new response", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  const session = createApplicationSession();
  let calls = 0;
  const renewal = createSessionRefresh(session, Date.now() + 300_000, async () => {
    calls++;
    return { ok: true, accessTokenExpiresAt: Date.now() + (calls === 1 ? 120_000 : 3_600_000), sessionExpiresAt: Date.now() + 86_400_000 };
  }, Date.now() + 86_400_000);
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
  }, Date.now() + 86_400_000);
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
  resolve({ ok: true, accessTokenExpiresAt: Date.now() + 600_000, sessionExpiresAt: Date.now() + 86_400_000 });
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(session.getSnapshot(), "active");
});

test("short-lived tokens renew without a tight refresh loop", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  let calls = 0;
  const renewal = createSessionRefresh(createApplicationSession(), Date.now() + 30_000, async () => {
    calls++;
    return { ok: true, accessTokenExpiresAt: Date.now() + 30_000, sessionExpiresAt: Date.now() + 86_400_000 };
  }, Date.now() + 86_400_000);
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
    return { ok: true, accessTokenExpiresAt: Date.now() + 600_000, sessionExpiresAt: Date.now() + 86_400_000 };
  }, Date.now() + 86_400_000);
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
    [{ ok: true, accessTokenExpiresAt: Date.now() - 1, sessionExpiresAt: Date.now() + 86_400_000 }, "unavailable"],
  ]) {
    const session = createApplicationSession();
    let calls = 0;
    const renewal = createSessionRefresh(session, Date.now(), async () => { calls++; return result; }, Date.now() + 86_400_000);
    const stop = renewal.start();
    assert.equal(await renewal.ensureFresh(), false);
    assert.equal(session.getSnapshot(), status);
    t.mock.timers.tick(600_000);
    await flush();
    assert.equal(calls, 1);
    stop();
  }
});
