import "server-only";
import { getUploadConfig, parseTrack } from "./tracks.ts";
import { isRecord, safeErrorBody } from "./client.ts";

export const TRANSFER_TIMEOUT_MS = 15 * 60 * 1000;
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
type ProxyOptions = {
  accessToken?: string;
  apiUrl?: string;
  request?: typeof fetch;
  timeoutMs?: number;
  origin?: string;
};
type Operation = "upload" | "complete" | "cancel" | "audio";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const failure = (status: number, code: string) =>
  Response.json({ statusCode: status, code }, { status, headers: privateHeaders });

async function boundedJson(body: ReadableStream<Uint8Array> | null) {
  if (!body) throw new SyntaxError("Missing JSON");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw new SyntaxError("JSON limit");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function proxyTrack(
  request: Request,
  operation: Operation,
  id: string | undefined,
  options: ProxyOptions,
) {
  const mutation = operation !== "audio";
  if (mutation) {
    const origin = options.origin ?? process.env.UI_ORIGIN ?? new URL(request.url).origin;
    if (
      request.headers.get("origin") !== origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return failure(403, "ACCESS_DENIED");
  }
  if (!options.accessToken) return failure(401, "AUTH_REQUIRED");
  if (
    operation === "audio"
      ? !id || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))
      : operation !== "upload" && (!id || !uuid.test(id))
  )
    return failure(400, "INVALID_REQUEST");
  let api: URL;
  try {
    api = new URL(options.apiUrl ?? process.env.API_URL ?? "http://localhost:3000");
  } catch {
    return failure(502, "UPSTREAM_INVALID_RESPONSE");
  }
  if (
    !["http:", "https:"].includes(api.protocol) ||
    api.username ||
    api.password ||
    api.search ||
    api.hash
  )
    return failure(502, "UPSTREAM_INVALID_RESPONSE");
  const fetcher = options.request ?? fetch;
  let limit = 8192;
  const contentType = request.headers.get("content-type");
  if (operation === "upload") {
    if (
      !contentType ||
      !/^multipart\/form-data\s*;/i.test(contentType) ||
      !/boundary=/i.test(contentType)
    )
      return failure(400, "INVALID_REQUEST");
    const config = await getUploadConfig(options.accessToken, {
      apiUrl: api.href.replace(/\/$/, ""),
      request: fetcher,
    });
    if (!config.ok) {
      if (config.error.kind === "http")
        return Response.json(config.error.body, {
          status: config.error.status,
          headers: privateHeaders,
        });
      return failure(
        config.error.kind === "timeout" ? 504 : 502,
        config.error.kind === "invalid-response"
          ? "UPSTREAM_INVALID_RESPONSE"
          : "UPSTREAM_UNAVAILABLE",
      );
    }
    limit = config.data.maxFileBytes + 16384;
  }
  if (operation === "complete" && !/^application\/json(?:\s*;|$)/i.test(contentType ?? ""))
    return failure(400, "INVALID_REQUEST");
  const length = request.headers.get("content-length");
  if (mutation && length && (!/^\d+$/.test(length) || Number(length) > limit))
    return failure(413, "AUDIO_FILE_TOO_LARGE");

  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(new Error("Transfer timeout")),
    options.timeoutMs ?? TRANSFER_TIMEOUT_MS,
  );
  const disconnect = () => abort.abort(request.signal.reason);
  request.signal.addEventListener("abort", disconnect, { once: true });
  if (request.signal.aborted) disconnect();
  const cleanup = () => {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", disconnect);
  };
  let tooLarge = false;
  let size = 0;
  const headers = new Headers({ Authorization: `Bearer ${options.accessToken}` });
  if (operation === "upload" || operation === "complete") headers.set("Content-Type", contentType!);
  if (operation === "audio" && request.headers.has("range"))
    headers.set("Range", request.headers.get("range")!);
  const path =
    operation === "upload"
      ? "/tracks/uploads"
      : operation === "audio"
        ? `/tracks/${id}/audio`
        : `/tracks/uploads/${id}${operation === "complete" ? "/complete" : ""}`;
  const body =
    (operation === "upload" || operation === "complete") && request.body
      ? request.body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              size += chunk.byteLength;
              if (size > limit) {
                tooLarge = true;
                controller.error(new Error("Transfer limit"));
              } else controller.enqueue(chunk);
            },
          }),
        )
      : undefined;
  try {
    const init: RequestInit & { duplex?: "half" } = {
      method: operation === "audio" ? request.method : operation === "cancel" ? "DELETE" : "POST",
      // Bearer authentication is explicit. Disable fetch's HTTP-auth handling:
      // a 401 with a non-rewindable request stream otherwise becomes a network error.
      headers,
      body,
      ...(body ? { duplex: "half" as const } : {}),
      signal: abort.signal,
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
    };
    const upstream = await fetcher(`${api.href.replace(/\/+$/, "")}${path}`, init);
    if (operation === "audio" && [200, 206].includes(upstream.status)) {
      const responseHeaders = new Headers(privateHeaders);
      for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      if (request.method === "HEAD" || !upstream.body) {
        await upstream.body?.cancel();
        cleanup();
        return new Response(null, { status: upstream.status, headers: responseHeaders });
      }
      const reader = upstream.body.getReader();
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { value, done } = await reader.read();
            if (done) {
              cleanup();
              controller.close();
            } else controller.enqueue(value);
          } catch (error) {
            cleanup();
            abort.abort();
            controller.error(error);
          }
        },
        async cancel(reason) {
          abort.abort(reason);
          cleanup();
          await reader.cancel(reason).catch(() => {});
        },
      });
      return new Response(stream, { status: upstream.status, headers: responseHeaders });
    }
    if (operation === "cancel" && upstream.status === 204) {
      cleanup();
      return new Response(null, { status: 204, headers: privateHeaders });
    }
    // HEAD errors have headers/status but no JSON body.
    if (operation === "audio" && request.method === "HEAD") {
      const out = new Headers(privateHeaders);
      for (const name of ["content-range", "accept-ranges", "content-type", "content-length"]) {
        const value = upstream.headers.get(name);
        if (value) out.set(name, value);
      }
      await upstream.body?.cancel();
      cleanup();
      return new Response(null, { status: upstream.status, headers: out });
    }
    const json = await boundedJson(upstream.body);
    cleanup();
    if (!upstream.ok) {
      const error = safeErrorBody(json);
      if (!error) return failure(502, "UPSTREAM_INVALID_RESPONSE");
      const out = new Headers(privateHeaders);
      if (upstream.status === 416) {
        for (const name of ["content-range", "accept-ranges"]) {
          const value = upstream.headers.get(name);
          if (value) out.set(name, value);
        }
      }
      return Response.json(error, { status: upstream.status, headers: out });
    }
    const result =
      operation === "complete"
        ? parseTrack(json)
        : operation === "upload" &&
            isRecord(json) &&
            typeof json.uploadId === "string" &&
            uuid.test(json.uploadId) &&
            typeof json.expiresAt === "string" &&
            Number.isFinite(Date.parse(json.expiresAt))
          ? { uploadId: json.uploadId, expiresAt: json.expiresAt }
          : undefined;
    return upstream.status === 201 && result
      ? Response.json(result, { status: 201, headers: privateHeaders })
      : failure(502, "UPSTREAM_INVALID_RESPONSE");
  } catch (error) {
    const timedOut = abort.signal.aborted && !request.signal.aborted;
    abort.abort();
    cleanup();
    return failure(
      tooLarge ? 413 : request.signal.aborted ? 499 : timedOut ? 504 : 502,
      tooLarge
        ? "AUDIO_FILE_TOO_LARGE"
        : request.signal.aborted
          ? "TRANSFER_ABORTED"
          : timedOut
            ? "UPSTREAM_TIMEOUT"
            : error instanceof SyntaxError
              ? "UPSTREAM_INVALID_RESPONSE"
              : "UPSTREAM_UNAVAILABLE",
    );
  }
}
