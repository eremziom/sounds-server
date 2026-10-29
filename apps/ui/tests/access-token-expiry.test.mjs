import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";

register("./helpers/server-only-loader.mjs", import.meta.url);
const { readAccessTokenExpiry } = await import("../src/lib/access-token-expiry.ts");
const token = (payload) => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

test("server extracts only the actual JWT expiry in milliseconds for scheduling", () => {
  for (const exp of [1_800_000_000, 1_900_000_000]) {
    assert.equal(readAccessTokenExpiry(token({ exp, roles: ["ADMIN"] })), exp * 1000);
  }
  for (const value of [undefined, "invalid", "header.payload.signature", token(null), token({}),
    token({ exp: "1900000000" }), token({ exp: -1 }), token({ exp: 1.5 }), token({ exp: Number.MAX_SAFE_INTEGER })]) {
    assert.equal(readAccessTokenExpiry(value), null);
  }
});
