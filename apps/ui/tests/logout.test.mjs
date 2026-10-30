import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";

register("./helpers/auth-environment-loader.mjs", import.meta.url);
const { logoutAction, logoutAllAction, expireSessionAction } = await import("../src/app/(auth)/actions.ts");

function context(tokens = { accessToken: "cookie-access", refreshToken: "a".repeat(64) }) {
  const values = new Map(Object.entries({ locale: "pl", preference: "keep", ...tokens }));
  const writes = [];
  globalThis.__authTestContext = {
    cookies: () => ({
      get: (name) => values.has(name) ? { value: values.get(name) } : undefined,
      set: (name, value, options) => { writes.push({ name, value, options }); values.set(name, value); },
    }),
  };
  return { values, writes };
}

function assertCleared({ values, writes }) {
  assert.deepEqual(writes.map(({ name }) => name), ["accessToken", "refreshToken"]);
  for (const write of writes) {
    assert.equal(write.value, "");
    assert.equal(write.options.httpOnly, true);
    assert.equal(write.options.sameSite, "lax");
    assert.equal(write.options.path, "/");
    assert.equal(write.options.maxAge, 0);
    assert.equal(write.options.expires.getTime(), 0);
  }
  assert.equal(values.get("locale"), "pl");
  assert.equal(values.get("preference"), "keep");
}

test("session expiry clears only auth cookies and redirects to login without calling the API", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = () => assert.fail("Expiry cleanup must not depend on API availability");
    const state = context();
    const untrusted = new FormData();
    untrusted.set("returnTo", "https://example.com");
    await assertRedirect(() => expireSessionAction(untrusted), "/login");
    assertCleared(state);
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});
async function assertRedirect(action, path) {
  await assert.rejects(action(), (error) => error.message === "NEXT_REDIRECT" && error.path === path);
}

test("logout uses only the server refresh cookie, requires no access token and clears only auth cookies", async () => {
  const originalFetch = globalThis.fetch;
  const environment = process.env.NODE_ENV;
  try {
    for (const mode of ["test", "production"]) {
      process.env.NODE_ENV = mode;
      const state = context({ refreshToken: "b".repeat(64) });
      let calls = 0;
      globalThis.fetch = async (url, init) => {
        calls++;
        assert.ok(url.endsWith("/auth/logout"));
        assert.equal(init.method, "POST");
        assert.equal(init.headers.Authorization, undefined);
        assert.deepEqual(JSON.parse(init.body), { refreshToken: "b".repeat(64) });
        return new Response(null, { status: 204 });
      };
      const untrusted = new FormData();
      untrusted.set("refreshToken", "attacker-supplied");
      untrusted.set("returnTo", "https://example.com");
      await assertRedirect(() => logoutAction(untrusted), "/logout?status=success");
      assert.equal(calls, 1);
      assertCleared(state);
      assert.ok(state.writes.every((write) => write.options.secure === (mode === "production")));
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (environment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = environment;
    delete globalThis.__authTestContext;
  }
});

test("logout clears local cookies on HTTP, invalid response, network and timeout failures without claiming revocation", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const request of [
      async () => Response.json({ code: "INTERNAL_ERROR", message: "private backend details" }, { status: 503 }),
      async () => new Response("private invalid response", { status: 200 }),
      async () => { throw new TypeError("private connection details"); },
      async () => { throw new DOMException("private timeout", "TimeoutError"); },
    ]) {
      const state = context();
      globalThis.fetch = request;
      await assertRedirect(logoutAction, "/logout?status=local");
      assertCleared(state);
    }
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});

test("logout-all uses server access cookie and API authentication without a UI role or permission check", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const state = context();
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.ok(url.endsWith("/auth/logout-all"));
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization, "Bearer cookie-access");
      assert.equal(init.body, undefined);
      return new Response(null, { status: 204 });
    };
    await assertRedirect(logoutAllAction, "/logout?status=success");
    assert.equal(calls, 1);
    assertCleared(state);
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});

test("logout-all always clears local cookies but reports unconfirmed remote logout on rejection or outage", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const request of [
      async () => Response.json({ code: "AUTH_REQUIRED" }, { status: 401 }),
      async () => Response.json({ code: "ACCESS_DENIED" }, { status: 403 }),
      async () => new Response("private invalid response", { status: 503 }),
      async () => { throw new TypeError("private network details"); },
      async () => { throw new DOMException("private timeout", "TimeoutError"); },
    ]) {
      const state = context();
      globalThis.fetch = request;
      await assertRedirect(logoutAllAction, "/logout?status=all-unconfirmed");
      assertCleared(state);
    }
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});

test("missing cookies avoid API requests and never claim remote logout with incomplete credentials", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail("No network request is expected");
  try {
    for (const action of [logoutAction, logoutAllAction]) {
      const state = context({});
      await assertRedirect(action, "/logout?status=success");
      assertCleared(state);
    }
    const accessOnly = context({ accessToken: "access-only" });
    await assertRedirect(logoutAction, "/logout?status=local");
    assertCleared(accessOnly);
    const refreshOnly = context({ refreshToken: "a".repeat(64) });
    await assertRedirect(logoutAllAction, "/logout?status=all-unconfirmed");
    assertCleared(refreshOnly);
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});

test("cookie write failures propagate instead of falsely reporting a local sign-out", async () => {
  globalThis.__authTestContext = { cookies: () => ({ get: () => undefined, set: () => { throw Error("cookie write failed"); } }) };
  try { await assert.rejects(logoutAction(), /cookie write failed/); }
  finally { delete globalThis.__authTestContext; }
});
