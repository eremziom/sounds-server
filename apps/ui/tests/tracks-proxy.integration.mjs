import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const uploadId = "c99d10b0-3235-4872-9585-01a44819b4fa";
const receipt = { uploadId, expiresAt: new Date(Date.now() + 86400000).toISOString() };
const track = { id: 1, ownerId: 7, hasAudio: true, title: "Audio", description: "Test", releaseDate: "2026-01-01", bpm: { bpmFrom: 120, bpmTo: 130 } };
let mode = "normal", received = [], apiError, firstChunk, upstreamAborted, audioClosed;
const json = (response, status, body) => { response.writeHead(status, { "Content-Type": "application/json", "Set-Cookie": "evil=secret", "X-Private": "secret" }); response.end(JSON.stringify(body)); };
const api = createServer((request, response) => {
  void (async () => {
    received.push({ url: request.url, headers: request.headers, method: request.method });
    assert.equal(request.headers.authorization, "Bearer cookie-token");
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers["x-sounds-client-source"], undefined);
    if (request.url === "/tracks/upload-config") return json(response, 200, { maxFileBytes: 65536, formats: [{ extension: ".wav", mimeType: "audio/wav" }] });
    if (request.url === "/tracks/uploads") {
      assert.match(request.headers["content-type"], /boundary=actual-boundary/);
      request.once("aborted", () => upstreamAborted?.());
      request.on("data", () => firstChunk?.());
      await once(request, "end").catch(() => {});
      if (!request.aborted) json(response, 201, { ...receipt, storageKey: "private" });
      return;
    }
    if (request.url === `/tracks/uploads/${uploadId}/complete`) {
      for await (const chunk of request) { void chunk; }
      if (mode === "normal") return json(response, 201, { ...track, storageKey: "private" });
      const status = Number(mode);
      return json(response, status, { code: ({ 400: "VALIDATION_FAILED", 401: "AUTH_SESSION_INVALID", 403: "ACCESS_DENIED", 409: "AUDIO_UPLOAD_CONSUMED", 410: "AUDIO_UPLOAD_EXPIRED", 503: "AUDIO_STORAGE_FAILED" })[status], message: "private backend detail" });
    }
    if (request.method === "DELETE") { response.writeHead(204); response.end(); return; }
    if (request.url === "/tracks/1/audio") {
      if (mode === "416") {
        response.setHeader("Content-Range", "bytes */48");
        return json(response, 416, { code: "AUDIO_RANGE_INVALID" });
      }
      const range = request.headers.range;
      assert.ok(!range || range === "bytes=0-1");
      response.writeHead(range ? 206 : 200, { "Content-Type": "audio/wav", "Content-Length": range ? "2" : "48", "Accept-Ranges": "bytes", ...(range ? { "Content-Range": "bytes 0-1/48" } : {}), "Set-Cookie": "evil=secret" });
      if (request.method === "HEAD") { response.end(); return; }
      if (mode === "stream") { response.once("close", () => audioClosed?.()); response.write(Buffer.from([1, 2])); }
      else response.end(Buffer.alloc(range ? 2 : 48));
      return;
    }
    throw Error("Unexpected upstream path");
  })().catch(error => { apiError = error; if (!response.headersSent) response.writeHead(500); response.end(); });
});

let next, output = "";
try {
  api.listen(0, "127.0.0.1"); await once(api, "listening");
  const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  next = spawn(process.execPath, ["server.mjs", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("..", import.meta.url), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, API_URL: `http://127.0.0.1:${api.address().port}`, UI_ORIGIN: origin },
  });
  next.stdout.on("data", chunk => output += chunk); next.stderr.on("data", chunk => output += chunk);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${origin}/register`)).ok) break; } catch {}
    assert.equal(next.exitCode, null, output);
    if (i === 99) throw Error(output);
    await delay(100);
  }
  const call = (path, method = "GET", body, headers = {}, signal) => fetch(`${origin}/api/tracks${path}`, {
    method, headers: { cookie: "accessToken=cookie-token; refreshToken=never-forward", origin,
      authorization: "Bearer attacker", "x-sounds-client-source": "spoof", ...headers },
    ...(body ? { body, duplex: "half" } : {}), signal,
  });
  let response = await call(`/uploads/${uploadId}/complete`, "POST", "{}", { "content-type": "application/json", cookie: "", authorization: "Bearer attacker" });
  assert.equal(response.status, 401); assert.equal(received.length, 0);
  for (const badOrigin of ["https://evil.test", "null", ""]) {
    response = await call(`/uploads/${uploadId}/complete`, "POST", "{}", { "content-type": "application/json", origin: badOrigin });
    assert.equal(response.status, 403);
  }
  assert.equal(received.length, 0);
  let source;
  const stream = new ReadableStream({ start(c) { source = c; c.enqueue(new TextEncoder().encode('--actual-boundary\r\nContent-Disposition: form-data; name="file"; filename="recording.wav"\r\nContent-Type: audio/wav\r\n\r\nfirst')); } });
  const reached = new Promise(resolve => firstChunk = resolve);
  const transfer = call("/uploads", "POST", stream, { "content-type": "multipart/form-data; boundary=actual-boundary" });
  await Promise.race([reached, delay(5000).then(() => { throw Error("Upload buffered before upstream"); })]);
  source.enqueue(new TextEncoder().encode("last\r\n--actual-boundary--\r\n")); source.close();
  response = await transfer;
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), receipt);
  assert.equal(response.headers.get("set-cookie"), null); assert.equal(response.headers.get("cache-control"), "private, no-store");
  response = await call(`/uploads/${uploadId}/complete`, "POST", JSON.stringify(track), { "content-type": "application/json" });
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), track);
  for (const status of [400, 401, 403, 409, 410, 503]) {
    mode = String(status);
    const count = received.length;
    response = await call(`/uploads/${uploadId}/complete`, "POST", "{}", { "content-type": "application/json" });
    const errorBody = await response.json();
    assert.equal(response.status, status, JSON.stringify({ errorBody, apiError: apiError?.stack, last: received.at(-1) })); assert.equal(received.length, count + 1);
    assert.ok(!JSON.stringify(errorBody).includes("private"));
  }
  mode = "normal";
  response = await call(`/uploads/${uploadId}`, "DELETE"); assert.equal(response.status, 204);
  for (const method of ["GET", "HEAD"]) {
    for (const range of [undefined, "bytes=0-1"]) {
      response = await call("/1/audio", method, undefined, range ? { range } : {});
      assert.equal(response.status, range ? 206 : 200);
      assert.equal(response.headers.get("content-length"), range ? "2" : "48");
      assert.equal(response.headers.get("accept-ranges"), "bytes");
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal((await response.arrayBuffer()).byteLength, method === "HEAD" ? 0 : range ? 2 : 48);
    }
  }
  mode = "416";
  for (const method of ["GET", "HEAD"]) {
    response = await call("/1/audio", method, undefined, { range: "bytes=999-" });
    assert.equal(response.status, 416); assert.equal(response.headers.get("content-range"), "bytes */48");
    if (method === "GET") assert.equal((await response.json()).code, "AUDIO_RANGE_INVALID");
  }
  mode = "stream";
  const closed = new Promise(resolve => audioClosed = resolve);
  const abortAudio = new AbortController();
  response = await call("/1/audio", "GET", undefined, {}, abortAudio.signal);
  const reader = response.body.getReader(); assert.deepEqual([...(await reader.read()).value], [1, 2]);
  abortAudio.abort(); await reader.cancel().catch(() => {});
  await Promise.race([closed, delay(5000).then(() => { throw Error("Audio disconnect did not close upstream"); })]);
  mode = "normal";
  const aborted = new Promise(resolve => upstreamAborted = resolve);
  const uploadStarted = new Promise(resolve => firstChunk = resolve);
  const abortUpload = new AbortController();
  const partial = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("partial")); } });
  const interrupted = call("/uploads", "POST", partial, { "content-type": "multipart/form-data; boundary=actual-boundary" }, abortUpload.signal).catch(() => {});
  await uploadStarted; abortUpload.abort(); await interrupted;
  await Promise.race([aborted, delay(5000).then(() => { throw Error("Upload disconnect did not abort upstream"); })]);
  assert.equal(apiError, undefined, apiError?.stack);
  console.log("Next.js HTTP proxy: HttpOnly cookie credential source, CSRF, streaming in both directions, complete/cancel, Range/HEAD/416, API errors, header allowlist and client disconnect propagation passed.");
} finally {
  if (next && next.exitCode === null) { next.kill(); await once(next, "exit"); }
  api.closeAllConnections(); await new Promise(resolve => api.close(resolve));
}
