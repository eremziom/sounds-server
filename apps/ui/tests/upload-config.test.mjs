import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { canCreateTrack } from "../src/lib/track-access.ts";

register("./helpers/server-only-loader.mjs", import.meta.url);
const { getUploadConfig } = await import("../src/api/tracks.ts");
const { getSessionUser } = await import("../src/api/auth.ts");

test("creation uses live permissions, regardless of role names", async () => {
  for (const [roles, permissions, allowed] of [
    [["USER"], ["tracks:read"], false],
    [["ARTIST"], ["tracks:create"], true],
    [["ADMIN"], ["tracks:read"], false],
    [["ADMIN", "ARTIST"], ["tracks:create"], true],
    [["ARTIST"], [], false],
  ]) {
    const result = await getSessionUser("token", { request: async () => Response.json({
      id: 1, isActive: true, roles: roles.map(key => ({ key })), permissions,
      sessionExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    }) });
    assert.equal(result.ok, true);
    assert.equal(canCreateTrack(result.data), allowed);
    assert.equal(canCreateTrack({ ...result.data, isActive: false }), false);
  }
  assert.equal(canCreateTrack(null), false);
});

test("session parsing rejects missing/malformed grants and projects unique keys", async () => {
  const user = { id: 1, isActive: true, roles: [{ key: "ARTIST" }], sessionExpiresAt: new Date(Date.now() + 86400000).toISOString() };
  for (const permissions of [undefined, null, "tracks:create", [null], [{}], [""], ["TRACKS:CREATE"], ["tracks:create extra"]]) {
    const result = await getSessionUser("token", { request: async () => Response.json({ ...user, permissions }) });
    assert.equal(result.error.kind, "invalid-response");
  }
  const result = await getSessionUser("token", { request: async () => Response.json({ ...user, permissions: ["tracks:create", "tracks:create"], password: "secret" }) });
  assert.deepEqual(result.data.permissions, ["tracks:create"]);
  assert.equal(Object.hasOwn(result.data, "password"), false);
});

test("upload config uses server limits, no-store and only safe response fields", async () => {
  for (const maxFileBytes of [1024, 52428800, 2147483647]) {
    const formats = [{ extension: ".mp3", mimeType: "audio/mpeg" }, { extension: ".wav", mimeType: "audio/wav" }];
    const result = await getUploadConfig("private-token", { apiUrl: "http://api", request: async (url, init) => {
      assert.equal(url, "http://api/tracks/upload-config");
      assert.equal(init.headers.Authorization, "Bearer private-token");
      assert.equal(init.cache, "no-store");
      assert.equal(init.redirect, "error");
      return Response.json({ maxFileBytes, formats, directory: "private", storageKey: "private" });
    } });
    assert.deepEqual(result, { ok: true, data: { maxFileBytes, formats } });
  }
});

test("upload config fails closed for invalid data and preserves auth/transport failures", async () => {
  const valid = { maxFileBytes: 1024, formats: [{ extension: ".wav", mimeType: "audio/wav" }] };
  for (const body of [null, {}, ...[0, -1, 1.5, "1024", 2147483648].map(maxFileBytes => ({ ...valid, maxFileBytes })),
    ...[[], [null], [{ extension: ".exe", mimeType: "audio/wav" }], [{ extension: ".wav", mimeType: "audio/mpeg" }], [valid.formats[0], valid.formats[0]]].map(formats => ({ ...valid, formats }))]) {
    const result = await getUploadConfig("token", { request: async () => Response.json(body) });
    assert.equal(result.error.kind, "invalid-response");
  }
  const missing = await getUploadConfig(undefined, { request: () => assert.fail("missing token must not contact API") });
  assert.equal(missing.status, 401);
  for (const status of [401, 403, 503]) {
    const result = await getUploadConfig("token", { request: async () => Response.json({ code: "AUTH_REQUIRED" }, { status }) });
    assert.equal(result.status, status);
  }
  const result = await getUploadConfig("token", { request: async () => { throw Error("offline"); } });
  assert.equal(result.error.kind, "network");
});
