import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
register("./helpers/server-only-loader.mjs", import.meta.url);
const { proxyArtwork, artworkRoute } = await import("../src/api/artwork-proxy.ts");
const id = "c99d10b0-3235-4872-9585-01a44819b4fa";
const route = ["projects", id], origin = "http://localhost:3001";
const req = (method = "GET", body, headers = {}) => new Request(`${origin}/api/artworks/${route.join("/")}`, {
  method, headers: { origin, ...(body ? { "content-type": "application/json" } : {}), ...headers }, body,
});

test("BFF allowlists project routes, methods and v4 identifiers", () => {
  for (const [parts, method] of [[["tools"], "GET"], [["projects", "../auth"], "GET"], [route, "DELETE"], [[...route, "jobs", id, "unknown"], "POST"], [[...route, "file"], "GET"]]) assert.equal(artworkRoute(parts, method), null);
  for (const [parts, method] of [[["projects"], "POST"], [route, "GET"], [[...route, "revisions", id], "GET"], [[...route, "jobs", id, "cancel"], "POST"], [[...route, "artifacts", id, "file"], "GET"]]) assert.ok(artworkRoute(parts, method));
});

test("missing cookie token and cross-origin POST never reach upstream", async () => {
  const request = async () => { throw Error("Must not call upstream"); };
  assert.equal((await proxyArtwork(req(), route, { request })).status, 401);
  for (const headers of [{ origin: "https://evil.test" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }, { host: "bad/host" }]) {
    assert.equal((await proxyArtwork(req("POST", "{}", headers), ["projects"], { accessToken: "token", request, origin })).status, 403);
  }
});

test("only cookie bearer is forwarded, cursor preserved, responses stay private", async () => {
  const request = new Request(`${origin}/api/artworks/projects?cursor=${id}`, { headers: { cookie: "secret=cookie", authorization: "Bearer attacker", "x-extra": "secret" } });
  const response = await proxyArtwork(request, ["projects"], { accessToken: "cookie-token", request: async (url, init) => {
    assert.equal(url, `http://localhost:3000/artworks/projects?cursor=${id}`);
    assert.deepEqual(init.headers, { Authorization: "Bearer cookie-token" });
    assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
    return Response.json([{ id }], { headers: { "set-cookie": "bad=secret", "x-private": "secret" } });
  } });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-private"), null);
  assert.deepEqual(await response.json(), [{ id }]);
});

test("unknown queries and oversized chunked requests are rejected before upstream", async () => {
  const options = { accessToken: "token", request: async () => { throw Error("No upstream"); } };
  for (const query of ["?url=http://evil.test", "?cursor=invalid", `?cursor=${id}&cursor=${id}`]) {
    assert.equal((await proxyArtwork(new Request(`${origin}/api/artworks/projects${query}`), ["projects"], options)).status, 400);
  }
  const response = await proxyArtwork(req("POST", "x".repeat(1024 * 1024 + 1)), ["projects"], options);
  assert.equal(response.status, 413);
});

test("private PNG proxy strips filenames, cookies and arbitrary content types", async () => {
  const path = [...route, "artifacts", id, "file"];
  const response = await proxyArtwork(req(), path, { accessToken: "token", request: async () => new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/png", "content-disposition": "attachment; filename=private-path.png", "set-cookie": "secret=token" } }) });
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("content-disposition"), "inline");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2]);
  assert.equal((await proxyArtwork(req(), path, { accessToken: "token", request: async () => new Response("<script>", { headers: { "content-type": "text/html" } }) })).status, 502);
});

test("upstream errors retain safe code and status without private details", async () => {
  const response = await proxyArtwork(req(), route, { accessToken: "token", request: async () => Response.json({ code: "ARTWORK_REVISION_CONFLICT", message: "private filesystem path", stack: "secret" }, { status: 409 }) });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: "ARTWORK_REVISION_CONFLICT" });
});

test("multipart PNG reference reaches artifact API without manual JSON or exposed token", async () => {
  const data = new FormData(); data.set("file", new Blob(["PNG"], { type: "image/png" }), "reference.png");
  data.set("metadata", JSON.stringify({ kind: "image" }));
  const response = await proxyArtwork(new Request(origin, { method: "POST", headers: { origin }, body: data }), [...route, "artifacts"], {
    accessToken: "token", request: async (url, init) => {
      assert.equal(url, `http://localhost:3000/artworks/projects/${id}/artifacts`);
      const received = await new Request(origin, init).formData();
      assert.equal(received.get("file").name, "reference.png");
      assert.equal(received.get("metadata"), '{"kind":"image"}');
      return Response.json({ id }, { status: 201 });
    },
  });
  assert.equal(response.status, 201);
});

test("network failure and timeout never return successful operation", async () => {
  const response = await proxyArtwork(req(), route, { accessToken: "token", request: async () => { throw Error("secret network info"); } });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { code: "UPSTREAM_UNAVAILABLE" });
  const timeout = await proxyArtwork(req(), route, { accessToken: "token", timeoutMs: 1, request: async (url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("Timeout")))) });
  assert.equal(timeout.status, 504);
});

test("timeout covers stalled upload body and upstream body after headers", async () => {
  const stalled = () => new ReadableStream({ start() {} });
  const request = new Request(origin, { method: "POST", headers: { origin, "content-type": "application/json" }, body: stalled(), duplex: "half" });
  const upload = await proxyArtwork(request, ["projects"], { accessToken: "token", timeoutMs: 5, request: async () => { throw Error("Must not dispatch"); } });
  assert.equal(upload.status, 504);
  const download = await proxyArtwork(req(), route, { accessToken: "token", timeoutMs: 5, request: async () => new Response(stalled()) });
  assert.equal(download.status, 504);
});
