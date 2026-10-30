import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { resumeTarget, resumedTarget } from "../src/lib/session-resume.ts";

register("./helpers/auth-environment-loader.mjs", import.meta.url);
const { resumeSessionAction } = await import("../src/app/(auth)/resume/actions.ts");

test("recovery accepts only local protected destinations and preserves their query", () => {
  for (const value of [undefined, [], "https://evil.test", "//evil.test", "/\\evil.test", "/login", "/resume?returnTo=/resume", "/admin/../login", "/%61dmin", "/admin\n"]) {
    assert.equal(resumeTarget(value), "/");
  }
  assert.equal(resumeTarget("/admin?view=users&__session_resumed=1&_rsc=private"), "/admin?view=users");
  assert.equal(resumedTarget("/admin?view=users"), "/admin?view=users&__session_resumed=1");
});

test("recovery rotates cookies, checks current roles and distinguishes rejection from outage", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const mode of ["success", "denied", "invalid", "missing", "outage", "limited", "me-outage", "me-invalid"]) {
      const session = authSession();
      const values = new Map([["locale", "pl"], ...(mode === "missing" ? [] : [["refreshToken", "b".repeat(64)]])]);
      const writes = [];
      globalThis.__authTestContext = { cookies: () => ({
        get: (key) => values.has(key) ? { value: values.get(key) } : undefined,
        set: (key, value, options) => { values.set(key, value); writes.push({ key, value, options }); },
      }) };
      const calls = [];
      globalThis.fetch = async (url, init) => {
        calls.push(url);
        if (url.endsWith("/auth/refresh")) {
          assert.equal(init.method, "POST");
          assert.equal(JSON.parse(init.body).refreshToken, "b".repeat(64));
          if (mode === "invalid") return Response.json({ code: "AUTH_SESSION_INVALID" }, { status: 401 });
          if (mode === "outage") throw new TypeError("Network unavailable");
          if (mode === "limited") return Response.json({ code: "AUTH_RATE_LIMITED" }, { status: 429 });
          return Response.json(session);
        }
        assert.equal(init.headers.Authorization, `Bearer ${session.accessToken}`);
        if (mode === "me-outage") return new Response("", { status: 503 });
        if (mode === "me-invalid") return new Response("", { status: 401 });
        return Response.json({ ...session.user, roles: [{ key: mode === "denied" ? "USER" : "ADMIN" }] });
      };
      if (["outage", "limited", "me-outage"].includes(mode)) {
        const result = await resumeSessionAction("/admin?view=users");
        assert.equal(result.reason, "unavailable");
        assert.equal(result.rateLimited === true, mode === "limited");
        assert.ok(values.get("refreshToken"));
        if (mode !== "me-outage") assert.equal(writes.length, 0);
      } else {
        const expected = mode === "success" ? "/admin?view=users&__session_resumed=1" : mode === "denied" ? "/access-denied" : "/login";
        await assert.rejects(resumeSessionAction("/admin?view=users"), (error) => error.path === expected);
        if (["missing", "invalid", "me-invalid"].includes(mode)) {
          assert.equal(values.get("refreshToken"), "");
          assert.equal(values.get("accessToken"), "");
        } else {
          assert.equal(values.get("refreshToken"), session.refreshToken);
          assert.ok(writes.every(({ options }) => options.httpOnly));
        }
      }
      assert.equal(values.get("locale"), "pl");
      assert.equal(calls.length, mode === "missing" ? 0 : ["invalid", "outage", "limited"].includes(mode) ? 1 : 2);
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__authTestContext;
  }
});
