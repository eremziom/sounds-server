import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import {
  APP_ROLES,
  ADMIN_ROLES,
  hasRequiredRole,
} from "../src/lib/route-access.ts";

// Node tests run outside Next.js, which normally resolves the server-only marker.
register("./helpers/server-only-loader.mjs", import.meta.url);
const { fetchSessionUser } = await import("../src/api/auth.ts");

const userWithRoles = (...keys) => ({
  id: 1,
  isActive: true,
  roles: keys.map((key) => ({ key })),
  sessionExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
});

test("app accepts USER and ARTIST; admin requires ADMIN", () => {
  for (const [roles, app, admin] of [
    [["USER"], true, false],
    [["ARTIST"], true, false],
    [["ADMIN"], false, true],
    [["ADMIN", "USER"], true, true],
    [[], false, false],
    [["UNKNOWN"], false, false],
  ]) {
    assert.equal(hasRequiredRole(userWithRoles(...roles), APP_ROLES), app);
    assert.equal(hasRequiredRole(userWithRoles(...roles), ADMIN_ROLES), admin);
  }
  assert.equal(hasRequiredRole({ ...userWithRoles("ADMIN"), isActive: false }, ADMIN_ROLES), false);
});

test("missing cookie does not contact API", async () => {
  assert.equal(await fetchSessionUser(undefined, "http://api", () => {
    assert.fail("API must not be called without a token");
  }), null);
});

test("checks token with API and uses current roles instead of token claims", async () => {
  const user = userWithRoles("ARTIST");
  const result = await fetchSessionUser("test-token", "http://api/", async (url, options) => {
    assert.equal(url, "http://api/auth/me");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(user);
  });
  assert.deepEqual(result, user);
});

test("invalid, expired, revoked or forbidden session is rejected", async () => {
  for (const status of [401, 403]) {
    assert.equal(await fetchSessionUser("bad-token", "http://api", async () => new Response(null, { status })), null);
  }
  assert.equal(await fetchSessionUser("token", "http://api", async () => Response.json({ ...userWithRoles("ADMIN"), isActive: false })), null);
});

test("API failures and malformed responses never grant access", async () => {
  for (const body of [{}, { ...userWithRoles("ADMIN"), roles: [null] }, { ...userWithRoles("ADMIN"), roles: ["ADMIN"] }]) {
    await assert.rejects(fetchSessionUser("token", "http://api", async () => Response.json(body)));
  }
  await assert.rejects(fetchSessionUser("token", "http://api", async () => new Response(null, { status: 500 })));
  await assert.rejects(fetchSessionUser("token", "http://api", async () => { throw new Error("offline"); }));
});
