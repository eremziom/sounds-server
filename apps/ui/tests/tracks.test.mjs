import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { translateApiError } from "../src/i18n/api-errors.ts";
register("./helpers/server-only-loader.mjs", import.meta.url);
const { getTracks } = await import("../src/api/tracks.ts");
const { proxyTrack } = await import("../src/api/track-proxy.ts");
const id = "c99d10b0-3235-4872-9585-01a44819b4fa";
const track = { id: 1, ownerId: null, hasAudio: false, title: "Historic", description: null, releaseDate: "2020-01-01", bpm: { bpmFrom: 120, bpmTo: 130 } };
const req = (method = "POST", body = "{}", headers = {}) => new Request("https://sounds.test/api/tracks/uploads", {
  method, headers: { origin: "https://sounds.test", "content-type": "application/json", ...headers },
  ...(!["GET", "HEAD", "DELETE"].includes(method) ? { body, duplex: "half" } : {}),
});

test("track list validates the whole response and projects public fields", async () => {
  const result = await getTracks("cookie-token", { request: async (url, init) => {
    assert.equal(init.headers.Authorization, "Bearer cookie-token");
    assert.equal(init.cache, "no-store");
    return Response.json([{ ...track, storageKey: "private" }, { ...track, id: 2, ownerId: 3, hasAudio: true }]);
  } });
  assert.deepEqual(result.data, [track, { ...track, id: 2, ownerId: 3, hasAudio: true }]);
  for (const data of [null, {}, [track, null], [{ ...track, id: "1" }], [{ ...track, hasAudio: undefined }], [{ ...track, ownerId: -1 }], [{ ...track, releaseDate: "2026-02-30" }], [{ ...track, bpm: { bpmFrom: 130, bpmTo: 120 } }]]) {
    assert.equal((await getTracks("token", { request: async () => Response.json(data) })).error.kind, "invalid-response");
  }
  assert.deepEqual((await getTracks("token", { request: async () => Response.json([]) })).data, []);
  assert.equal((await getTracks(undefined, { request: () => assert.fail() })).status, 401);
  for (const status of [401, 403, 503]) assert.equal((await getTracks("token", { request: async () => Response.json({ code: "AUTH_REQUIRED" }, { status }) })).status, status);
});

test("proxy rejects missing cookies, foreign/missing origin, invalid IDs and media types before contacting API", async () => {
  const options = { accessToken: "token", request: () => assert.fail("must not reach API") };
  assert.equal((await proxyTrack(req(), "complete", id, { ...options, accessToken: undefined })).status, 401);
  for (const origin of ["https://evil.test", "null", ""]) assert.equal((await proxyTrack(req("POST", "{}", { origin }), "complete", id, options)).status, 403);
  assert.equal((await proxyTrack(req("POST", "{}", { "sec-fetch-site": "cross-site" }), "complete", id, options)).status, 403);
  assert.equal((await proxyTrack(req(), "complete", "../auth", options)).status, 400);
  assert.equal((await proxyTrack(req(), "upload", undefined, options)).status, 400);
  assert.equal((await proxyTrack(req("GET"), "audio", "0", options)).status, 400);
});

test("proxy forwards only cookie authorization, preserves JSON validation fields and never retries mutation", async () => {
  let calls = 0;
  const response = await proxyTrack(req("POST", "{}", { authorization: "evil", cookie: "secret", "x-sounds-client-source": "spoof" }), "complete", id, {
    accessToken: "cookie-token", request: async (url, init) => {
      calls++;
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer cookie-token");
      assert.equal(new Headers(init.headers).get("cookie"), null);
      assert.equal(new Headers(init.headers).get("x-sounds-client-source"), null);
      assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
      assert.equal(await new Response(init.body).text(), "{}");
      return Response.json({ code: "VALIDATION_FAILED", message: "secret", fieldErrors: [{ field: "bpm.bpmFrom", code: "MIN", target: "private" }] }, { status: 400, headers: { "set-cookie": "evil", "x-secret": "private" } });
    },
  });
  assert.equal(calls, 1); assert.equal(response.status, 400);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { code: "VALIDATION_FAILED", fieldErrors: [{ field: "bpm.bpmFrom", code: "MIN" }] });
  calls = 0;
  assert.equal((await proxyTrack(req(), "complete", id, { accessToken: "token", request: async () => { calls++; throw Error("offline"); } })).status, 502);
  assert.equal(calls, 1);
});

test("direct proxy origin follows Host rather than Next's internal bind address and ignores forwarded headers", async () => {
  const input = headers => new Request("http://0.0.0.0:3001/api/tracks/uploads", {
    method: "POST", body: "{}", headers: { host: "localhost:3001", origin: "http://localhost:3001", "content-type": "application/json", ...headers },
  });
  let calls = 0;
  const options = { accessToken: "token", request: async () => { calls++; return Response.json(track, { status: 201 }); } };
  assert.equal((await proxyTrack(input({}), "complete", id, options)).status, 201);
  assert.equal(calls, 1);
  for (const headers of [
    { origin: "http://evil.test", "x-forwarded-host": "evil.test", "x-forwarded-proto": "http" },
    { origin: "null" }, { origin: "" }, { "sec-fetch-site": "cross-site" },
    { host: "localhost:3001@evil.test" }, { host: "localhost:3001/path" },
    { host: "localhost:3001,evil.test" },
  ]) assert.equal((await proxyTrack(input(headers), "complete", id, options)).status, 403);
  assert.equal(calls, 1);
  assert.equal((await proxyTrack(input({ origin: "https://public.test" }), "complete", id, { ...options, origin: "https://public.test" })).status, 201);
  assert.equal((await proxyTrack(input({}), "complete", id, { ...options, origin: "https://public.test" })).status, 403);
});

test("upload streams before source completion, preserves boundary and enforces actual config limit", async () => {
  let controller;
  const source = new ReadableStream({ start(c) { controller = c; c.enqueue(new TextEncoder().encode("first")); } });
  const request = req("POST", source, { "content-type": "multipart/form-data; boundary=abc" });
  const response = await proxyTrack(request, "upload", undefined, { accessToken: "token", request: async (url, init) => {
    if (url.endsWith("upload-config")) return Response.json({ maxFileBytes: 32, formats: [{ extension: ".wav", mimeType: "audio/wav" }] });
    assert.equal(init.headers.get("content-type"), "multipart/form-data; boundary=abc");
    const reader = init.body.getReader();
    assert.equal(new TextDecoder().decode((await reader.read()).value), "first");
    controller.enqueue(new Uint8Array(17000)); controller.close();
    await reader.read();
    assert.fail("limit must interrupt body");
  } });
  assert.equal(response.status, 413);
});

test("audio streams with backpressure, preserves Range/status/headers and cancellation aborts upstream", async () => {
  let upstreamSignal;
  const upstream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2])); } });
  const response = await proxyTrack(req("GET", undefined, { range: "bytes=0-1" }), "audio", "1", { accessToken: "token", request: async (_, init) => {
    upstreamSignal = init.signal;
    assert.equal(init.headers.get("range"), "bytes=0-1");
    return new Response(upstream, { status: 206, headers: { "content-type": "audio/wav", "content-range": "bytes 0-1/48", "accept-ranges": "bytes", "content-length": "2", "set-cookie": "bad" } });
  } });
  assert.equal(response.status, 206); assert.equal(response.headers.get("content-range"), "bytes 0-1/48");
  assert.equal(response.headers.get("set-cookie"), null);
  const reader = response.body.getReader(); assert.deepEqual([...(await reader.read()).value], [1, 2]);
  await reader.cancel(); assert.equal(upstreamSignal.aborted, true);
  const out = await proxyTrack(req("GET"), "audio", "1", { accessToken: "token", request: async () => Response.json({ code: "AUDIO_RANGE_INVALID" }, { status: 416, headers: { "content-range": "bytes */48" } }) });
  assert.equal(out.status, 416); assert.equal(out.headers.get("content-range"), "bytes */48");
});

test("proxy HEAD has no body; timeout and client abort remain distinguishable", async () => {
  const out = await proxyTrack(req("HEAD"), "audio", "1", { accessToken: "token", request: async () => new Response(null, { headers: { "content-length": "48" } }) });
  assert.equal(out.body, null); assert.equal(out.headers.get("content-length"), "48");
  const stalled = async (_, init) => new Promise((resolve, reject) => {
    if (init.signal.aborted) reject(init.signal.reason);
    else init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });
  const result = await proxyTrack(req(), "complete", id, { accessToken: "token", timeoutMs: 10, request: stalled });
  assert.equal(result.status, 504);
  const abort = new AbortController(); abort.abort();
  const input = new Request(req(), { signal: abort.signal });
  assert.equal((await proxyTrack(input, "complete", id, { accessToken: "token", request: stalled })).status, 499);
});

test("proxy rejects malformed and oversized upstream JSON without exposing details", async () => {
  for (const body of ["private invalid JSON", JSON.stringify({ code: "AUTH_REQUIRED", message: "x".repeat(70000) })]) {
    const result = await proxyTrack(req(), "complete", id, { accessToken: "token", request: async () => new Response(body, { status: 401 }) });
    assert.equal(result.status, 502);
    assert.equal((await result.json()).code, "UPSTREAM_INVALID_RESPONSE");
  }
  const invalid = await proxyTrack(req(), "complete", id, { accessToken: "token", apiUrl: "invalid URL", request: () => assert.fail() });
  assert.equal(invalid.status, 502);
});

test("new upload errors have specific translations and require matching statuses", () => {
  for (const [code, status, key] of [["AUDIO_UPLOAD_NOT_FOUND", 404, "audioUploadNotFound"], ["AUDIO_UPLOAD_CONSUMED", 409, "audioUploadConsumed"], ["AUDIO_UPLOAD_EXPIRED", 410, "audioUploadExpired"]]) {
    assert.equal(translateApiError({ kind: "http", status, body: { code } }, "track", key => key).message, `errors.${key}`);
    assert.equal(translateApiError({ kind: "http", status: 400, body: { code } }, "track", key => key).message, "errors.unexpected");
  }
});
