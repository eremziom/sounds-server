import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { authSession } from "./helpers/auth-fixtures.mjs";

register("./helpers/auth-environment-loader.mjs", import.meta.url);
const { refreshAction } = await import("../src/app/(auth)/actions.ts");

function context(tokens = { refreshToken: "b".repeat(64) }) {
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

test("refresh action uses only the server cookie and replaces both HttpOnly cookies before reporting success", async () => {
  const originalFetch = globalThis.fetch;
  const environment = process.env.NODE_ENV;
  try {
    for (const mode of ["test", "production"]) {
      process.env.NODE_ENV = mode;
      const state = context(); // Renewal also works after the access cookie expires.
      const session = authSession();
      let calls = 0;
      globalThis.fetch = async (url, init) => {
        calls++;
        assert.ok(url.endsWith("/auth/refresh"));
        assert.equal(init.method, "POST");
        assert.equal(init.cache, "no-store");
        assert.equal(init.headers.Authorization, undefined);
        assert.deepEqual(JSON.parse(init.body), { refreshToken: "b".repeat(64) });
        return Response.json(session);
      };
      const untrusted = new FormData();
      untrusted.set("refreshToken", "attacker-supplied");
      assert.deepEqual(await refreshAction(untrusted), { ok: true });
      assert.equal(calls, 1);
      assert.deepEqual(state.writes.map(({ name }) => name), ["accessToken", "refreshToken"]);
      for (const write of state.writes) {
        assert.equal(write.value, session[write.name]);
        assert.equal(write.options.expires.toISOString(), session[`${write.name}ExpiresAt`]);
        assert.equal(write.options.httpOnly, true);
        assert.equal(write.options.sameSite, "lax");
        assert.equal(write.options.path, "/");
        assert.equal(write.options.secure, mode === "production");
        assert.equal(write.options.domain, undefined);
      }
      assert.equal(state.values.get("locale"), "pl");
      assert.equal(state.values.get("preference"), "keep");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (environment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = environment;
    delete globalThis.__authTestContext;
  }
});

test("missing refresh cookie returns failure without calling the API or writing cookies", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = () => assert.fail("No API call expected");
    for (const tokens of [{}, { accessToken: "access-only" }]) {
      const state = context(tokens);
      assert.deepEqual(await refreshAction(), { ok: false });
      assert.deepEqual(state.writes, []);
    }
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});

test("rejected or uncertain refresh returns only failure, without retry or cookie changes", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const request of [
      async () => Response.json({ code: "AUTH_SESSION_INVALID", message: "private details" }, { status: 401 }),
      async () => Response.json({ code: "ACCESS_DENIED" }, { status: 403 }),
      async () => new Response("private details", { status: 503 }),
      async () => new Response("invalid JSON", { status: 200 }),
      async () => Response.json(authSession({ refreshToken: "invalid" })),
      async () => { throw new TypeError("private network details"); },
      async () => { throw new DOMException("private timeout details", "TimeoutError"); },
    ]) {
      const state = context();
      let calls = 0;
      globalThis.fetch = (...args) => { calls++; return request(...args); };
      assert.deepEqual(await refreshAction(), { ok: false });
      assert.equal(calls, 1);
      assert.deepEqual(state.writes, []);
      assert.equal(state.values.get("refreshToken"), "b".repeat(64));
      assert.equal(state.values.get("locale"), "pl");
    }
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});

test("cookie write failure propagates instead of reporting a successful refresh", async () => {
  const originalFetch = globalThis.fetch;
  try {
    context();
    globalThis.__authTestContext.cookies = () => ({
      get: () => ({ value: "b".repeat(64) }),
      set: () => { throw new Error("cookie write failed"); },
    });
    globalThis.fetch = async () => Response.json(authSession());
    await assert.rejects(refreshAction(), /cookie write failed/);
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});
