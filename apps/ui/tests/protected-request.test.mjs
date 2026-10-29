import assert from "node:assert/strict";
import { test } from "node:test";
import { createApplicationSession } from "../src/lib/application-session.ts";
import { createSessionRefresh } from "../src/lib/session-refresh.ts";
import { createProtectedRequest } from "../src/lib/protected-request.ts";

test("concurrent requests wait for one renewal and dispatch only after replacement cookies are written", async () => {
  const session = createApplicationSession();
  let finishRefresh;
  const gate = new Promise((resolve) => { finishRefresh = resolve; });
  const events = [];
  let accessCookie = "old";
  const renewal = createSessionRefresh(session, Date.now(), async () => {
    events.push("refresh");
    await gate;
    accessCookie = "rotated";
    events.push("cookies-written");
    return { ok: true, accessTokenExpiresAt: Date.now() + 900_000 };
  });
  const run = createProtectedRequest(session, renewal.ensureFresh);
  const read = run(() => { events.push(`read:${accessCookie}`); return "data"; });
  const write = run(() => { events.push(`write:${accessCookie}`); return "saved"; });
  await Promise.resolve();
  assert.deepEqual(events, ["refresh"]);
  assert.equal(session.getSnapshot(), "refreshing");
  finishRefresh();
  assert.deepEqual(await Promise.all([read, write]), [
    { executed: true, value: "data" }, { executed: true, value: "saved" },
  ]);
  assert.deepEqual(events, ["refresh", "cookies-written", "read:rotated", "write:rotated"]);
});

test("requests also wait for renewal already started by the background timer", async () => {
  const session = createApplicationSession();
  let finishRefresh;
  const gate = new Promise((resolve) => { finishRefresh = resolve; });
  let calls = 0;
  const renewal = createSessionRefresh(session, Date.now(), async () => {
    await gate;
    return { ok: true, accessTokenExpiresAt: Date.now() + 900_000 };
  });
  const background = renewal.ensureFresh();
  const run = createProtectedRequest(session, renewal.ensureFresh);
  const request = run(() => ++calls);
  await Promise.resolve();
  assert.equal(calls, 0);
  finishRefresh();
  assert.equal(await background, true);
  assert.deepEqual(await request, { executed: true, value: 1 });
});

test("failed renewal or session ending while awaiting blocks request dispatch", async () => {
  for (const success of [false, true]) {
    const session = createApplicationSession();
    const run = createProtectedRequest(session, async () => {
      if (success) session.end();
      return success;
    });
    assert.deepEqual(await run(() => assert.fail("Request must not be sent")), { executed: false });
  }
});

test("403 and 401 responses are returned once without triggering refresh or retry", async () => {
  for (const status of [401, 403]) {
    const session = createApplicationSession();
    const renewal = createSessionRefresh(session, Date.now() + 900_000,
      () => assert.fail("HTTP errors must not trigger token refresh"));
    const run = createProtectedRequest(session, renewal.ensureFresh);
    let writes = 0;
    const result = await run(() => { writes++; return new Response(null, { status }); });
    assert.equal(result.executed, true);
    assert.equal(result.value.status, status);
    assert.equal(writes, 1);
    assert.equal(session.getSnapshot(), "active");
  }
});

test("an uncertain mutation failure propagates without repeating a possibly completed write", async () => {
  const session = createApplicationSession();
  const run = createProtectedRequest(session, async () => true);
  let writes = 0;
  await assert.rejects(run(async () => {
    writes++;
    throw new TypeError("Connection lost after the server accepted the write");
  }), TypeError);
  assert.equal(writes, 1);
});

test("unavailable sessions block requests without automatically retrying an uncertain refresh", async () => {
  const session = createApplicationSession();
  await session.renew(async () => "unavailable");
  const run = createProtectedRequest(session, () => assert.fail("Recovery requires an explicit retry"));
  assert.deepEqual(await run(() => assert.fail("Request must not run")), { executed: false });
});
