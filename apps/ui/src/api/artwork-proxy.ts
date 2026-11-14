import "server-only";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const failure = (status: number, code: string) => Response.json({ code }, { status, headers: privateHeaders });

/** Deliberately allowlisted BFF. Cookies and upstream response headers never pass through. */
export function artworkRoute(parts: string[], method: string): { file: boolean; upload: boolean } | null {
  if (method === "POST" && parts.length === 3 && parts[0] === "projects" && parts[1] === "starter" && parts[2] === "night-garden") return { file: false, upload: false };
  if (parts[0] !== "projects" || !["GET", "POST"].includes(method)) return null;
  if (parts.length === 1) return { file: false, upload: false };
  if (!uuid.test(parts[1])) return null;
  const tail = parts.slice(2);
  const valid = method === "GET"
    ? tail.length === 0 || tail.length === 1 && ["revisions", "artifacts", "messages", "jobs"].includes(tail[0]) ||
      tail.length === 2 && ["revisions", "jobs"].includes(tail[0]) && uuid.test(tail[1]) ||
      tail.length === 3 && tail[0] === "artifacts" && uuid.test(tail[1]) && tail[2] === "file"
    : tail.length === 1 && ["revisions", "artifacts", "messages", "jobs", "restore"].includes(tail[0]) ||
      tail.length === 3 && tail[0] === "jobs" && uuid.test(tail[1]) && ["cancel", "retry"].includes(tail[2]);
  return valid ? { file: tail[2] === "file", upload: method === "POST" && tail[0] === "artifacts" } : null;
}

async function readLimited(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!body) return new Uint8Array();
  const reader = body.getReader(), chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new RangeError("Body limit");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { signal.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); }
}

type Options = { accessToken?: string; apiUrl?: string; origin?: string; request?: typeof fetch; timeoutMs?: number };
export async function proxyArtwork(request: Request, parts: string[], options: Options) {
  const route = artworkRoute(parts, request.method);
  if (!route) return failure(404, "NOT_FOUND");
  if (!options.accessToken) return failure(401, "AUTH_REQUIRED");
  const url = new URL(request.url);
  const queryKeys = [...url.searchParams.keys()];
  if (queryKeys.some(key => key !== "cursor") || queryKeys.length > 1 ||
    url.searchParams.has("cursor") && !uuid.test(url.searchParams.get("cursor")!)) return failure(400, "INVALID_REQUEST");
  if (request.method === "POST") {
    let origin: string | undefined;
    try {
      const host = request.headers.get("host");
      if (host !== null && (!host || /[\\/?#@\s,]/.test(host))) return failure(403, "ACCESS_DENIED");
      origin = options.origin ?? process.env.UI_ORIGIN ?? (host ? new URL(`${url.protocol}//${host}`).origin : url.origin);
    } catch { return failure(403, "ACCESS_DENIED"); }
    if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site")
      return failure(403, "ACCESS_DENIED");
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (request.method === "POST" && (route.upload ? !/^multipart\/form-data\s*;.*boundary=/i.test(contentType) :
    request.body && !/^application\/json(?:;|$)/i.test(contentType))) return failure(400, "INVALID_REQUEST");
  const abort = new AbortController();
  const disconnect = () => abort.abort();
  request.signal.addEventListener("abort", disconnect, { once: true });
  if (request.signal.aborted) disconnect();
  const timer = setTimeout(disconnect, options.timeoutMs ?? 60000);
  try {
    const api = new URL(options.apiUrl ?? process.env.API_URL ?? "http://localhost:3000");
    if (!["http:", "https:"].includes(api.protocol) || api.username || api.password || api.search || api.hash)
      return failure(502, "UPSTREAM_INVALID_RESPONSE");
    const limit = route.upload ? 32 * 1024 * 1024 + 24000 : 1024 * 1024;
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > limit)) return failure(413, "ARTWORK_TOO_LARGE");
    let bytes: Uint8Array | undefined;
    try { if (request.method === "POST") bytes = await readLimited(request.body, limit, abort.signal); }
    catch (error) { if (error instanceof RangeError) return failure(413, "ARTWORK_TOO_LARGE"); throw error; }
    const response = await (options.request ?? fetch)(`${api.href.replace(/\/+$/, "")}/artworks/${parts.join("/")}${url.search}`, {
      method: request.method, headers: { Authorization: `Bearer ${options.accessToken}`, ...(contentType ? { "Content-Type": contentType } : {}) },
      ...(bytes?.byteLength ? { body: new Blob([bytes as BlobPart]) } : {}),
      signal: abort.signal, redirect: "error", cache: "no-store", credentials: "omit",
    });
    const data = await readLimited(response.body, route.file ? 32 * 1024 * 1024 : 8 * 1024 * 1024, abort.signal);
    if (!response.ok) {
      let code = "ARTWORK_REQUEST_FAILED";
      try {
        const body = JSON.parse(Buffer.from(data).toString("utf8"));
        if (typeof body.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(body.code)) code = body.code;
      } catch { /* Omit upstream details. */ }
      return failure(response.status, code);
    }
    if (route.file) {
      const type = response.headers.get("content-type")?.split(";")[0];
      if (type !== "image/png" && type !== "application/json") return failure(502, "UPSTREAM_INVALID_RESPONSE");
      return new Response(data as BodyInit, { headers: { ...privateHeaders, "Content-Type": type, "Content-Disposition": "inline" } });
    }
    return Response.json(JSON.parse(Buffer.from(data).toString("utf8")), { status: response.status, headers: privateHeaders });
  } catch {
    return failure(abort.signal.aborted ? 504 : 502, abort.signal.aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", disconnect);
  }
}
