import assert from "node:assert/strict";
import { test } from "node:test";
import { clientAddress } from "../server-source.mjs";

test("direct clients cannot choose their address using forwarded headers", () => {
  assert.equal(clientAddress({ socket: { remoteAddress: "::ffff:192.0.2.1" }, headers: {
    "x-forwarded-for": "198.51.100.9", "x-sounds-client-source": "forged",
  } }), "192.0.2.1");
});

test("only explicitly trusted proxy hops are peeled from the right", () => {
  const request = { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "203.0.113.99, 192.0.2.1, 10.0.0.1" } };
  assert.equal(clientAddress(request, ["127.0.0.1", "10.0.0.1"]), "192.0.2.1");
  assert.equal(clientAddress(request), "127.0.0.1");
});
