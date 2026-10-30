import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { authSession } from "./helpers/auth-fixtures.mjs";

register("./helpers/auth-environment-loader.mjs", import.meta.url);
const { checkLoginSession } = await import("../src/lib/login-session.ts");
const { resumeSessionAction } = await import("../src/app/(auth)/resume/actions.ts");

test("login validates API sessions, chooses current roles and preserves cookies on failure", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [roles, destination] of [
      [["USER"], "/"], [["ARTIST"], "/"], [["ADMIN"], "/admin"],
      [["ADMIN", "USER"], "/"], [[], "/access-denied"], [["OTHER"], "/access-denied"],
    ]) {
      const session = authSession();
      const values = new Map([["accessToken", session.accessToken], ["refreshToken", session.refreshToken], ["locale", "pl"]]);
      globalThis.__authTestContext = { cookies: () => ({
        get: (key) => values.has(key) ? { value: values.get(key) } : undefined,
        set: (key, value) => values.set(key, value),
      }) };
      let status = 200;
      globalThis.fetch = async (url, init) => {
        if (url.endsWith("/auth/refresh")) {
          assert.equal(init.method, "POST");
          return Response.json(session);
        }
        assert.equal(init.cache, "no-store");
        return status === 200
          ? Response.json({ ...session.user, roles: roles.map(key => ({ key })), sessionExpiresAt: session.refreshTokenExpiresAt })
          : new Response("private backend details", { status });
      };
      assert.deepEqual(await checkLoginSession(), { destination });
      await assert.rejects(resumeSessionAction("//evil.test", true), error =>
        error.path === (destination === "/access-denied" ? destination : `${destination}?__session_resumed=1`));
      for (status of [429, 503]) {
        assert.deepEqual(await checkLoginSession(), { unavailable: true, rateLimited: status === 429 });
        assert.equal(values.get("refreshToken"), session.refreshToken);
      }
      for (status of [401, 403]) {
        assert.deepEqual(await checkLoginSession(), { destination: "/resume?mode=login" });
        assert.deepEqual(await checkLoginSession(true), {});
      }
      values.delete("accessToken");
      assert.deepEqual(await checkLoginSession(), { destination: "/resume?mode=login" });
      values.delete("refreshToken");
      assert.deepEqual(await checkLoginSession(), {});
      assert.equal(values.get("locale"), "pl");
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__authTestContext;
  }
});
