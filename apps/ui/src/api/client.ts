import "server-only";
import type { ApiFailure } from "../i18n/api-errors.ts";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiFailure; status?: number };

export type ApiOptions = {
  apiUrl?: string;
  request?: typeof fetch;
  timeoutMs?: number;
  authSource?: string;
};

export class ApiRequestError extends Error {
  readonly failure: ApiFailure;
  readonly status?: number;

  constructor(result: Extract<ApiResult<never>, { ok: false }>) {
    super("Authentication API request failed");
    this.name = "ApiRequestError";
    this.failure = result.error;
    this.status = result.status;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const fields = new Set([
  "username",
  "email",
  "login",
  "password",
  "confirmPassword",
]);
const safeCode = (value: unknown) =>
  typeof value === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(value);

// Keep only identifiers and numeric validation bounds. Never retain backend text,
// submitted values, tokens, targets or arbitrary metadata in an action error.
function safeErrorBody(body: unknown): Record<string, unknown> | undefined {
  if (!isRecord(body)) return undefined;
  const result: Record<string, unknown> = {};
  if (Object.hasOwn(body, "code"))
    result.code = safeCode(body.code) ? body.code : null;
  else if (
    typeof body.message === "string" ||
    (Array.isArray(body.message) &&
      body.message.every((entry) => typeof entry === "string"))
  ) {
    result.message = ""; // Shape marker for legacy operation/status mapping, not message content.
  } else return undefined;
  if (body.code === "VALIDATION_FAILED" && Array.isArray(body.fieldErrors)) {
    result.fieldErrors = body.fieldErrors.slice(0, 50).flatMap((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.field !== "string" ||
        !fields.has(entry.field)
      )
        return [];
      const error: Record<string, unknown> = {
        field: entry.field,
        code: safeCode(entry.code) ? entry.code : "INVALID_VALUE",
      };
      if (isRecord(entry.params)) {
        const { min, max } = entry.params;
        if (
          typeof min === "number" &&
          Number.isSafeInteger(min) &&
          min >= 0 &&
          typeof max === "number" &&
          Number.isSafeInteger(max) &&
          max >= min &&
          max <= 1_000_000
        ) {
          error.params = { min, max };
        }
      }
      return [error];
    });
  }
  return result;
}

type ApiRequestConfig<T> = {
  method: "GET" | "POST";
  expectedStatus: number;
  body?: object;
  accessToken?: string;
  parse: (value: unknown) => T | undefined;
  authSource?: string;
};

function resolveRequestOptions(options: ApiOptions) {
  const timeout = options.timeoutMs ?? 5000;
  try {
    const url = new URL(
      options.apiUrl ?? process.env.API_URL ?? "http://localhost:3000",
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !Number.isSafeInteger(timeout) ||
      timeout <= 0 ||
      timeout > 2_147_483_647
    )
      return undefined;
    return { url, timeout };
  } catch {
    return undefined;
  }
}

function createRequestInit<T>(
  config: ApiRequestConfig<T>,
  signal: AbortSignal,
): RequestInit {
  return {
    method: config.method,
    headers: {
      ...(config.authSource ? { "X-Sounds-Client-Source": config.authSource } : {}),
      ...(config.body ? { "Content-Type": "application/json" } : {}),
      ...(config.accessToken
        ? { Authorization: `Bearer ${config.accessToken}` }
        : {}),
    },
    ...(config.body ? { body: JSON.stringify(config.body) } : {}),
    cache: "no-store",
    redirect: "error",
    signal,
  };
}

function requestFailure(
  error: unknown,
  signal: AbortSignal,
  status?: number,
  readingBody = false,
): Extract<ApiResult<never>, { ok: false }> {
  const timeoutError =
    signal.aborted ||
    (error instanceof Error && error.name === "TimeoutError");
  const kind = timeoutError
    ? "timeout"
    : readingBody && error instanceof SyntaxError
      ? "invalid-response"
      : "network";
  return {
    ok: false,
    ...(status === undefined ? {} : { status }),
    error: { kind },
  };
}

async function parseApiResponse<T>(
  response: Response,
  config: ApiRequestConfig<T>,
  signal: AbortSignal,
): Promise<ApiResult<T>> {
  const status = response.status;
  let readingBody = false;
  try {
    if (!response.ok) {
      readingBody = true;
      const body = safeErrorBody(await response.json());
      return body
        ? { ok: false, status, error: { kind: "http", status, body } }
        : { ok: false, status, error: { kind: "invalid-response" } };
    }
    if (status !== config.expectedStatus)
      return { ok: false, status, error: { kind: "invalid-response" } };
    // 204 has no JSON body. The parser for logout deliberately ignores this value.
    readingBody = status !== 204;
    const data = config.parse(
      status === 204 ? undefined : await response.json(),
    );
    return data === undefined
      ? { ok: false, status, error: { kind: "invalid-response" } }
      : { ok: true, data };
  } catch (error) {
    return requestFailure(error, signal, status, readingBody);
  }
}

export async function apiRequest<T>(
  route: string,
  config: ApiRequestConfig<T>,
  options: ApiOptions = {},
): Promise<ApiResult<T>> {
  const resolved = resolveRequestOptions(options);
  if (!resolved)
    return { ok: false, error: { kind: "invalid-response" } };

  const signal = AbortSignal.timeout(resolved.timeout);
  try {
    const response = await (options.request ?? fetch)(
      `${resolved.url.href.replace(/\/+$/, "")}${route}`,
      createRequestInit({ ...config, authSource: options.authSource }, signal),
    );
    return await parseApiResponse(response, config, signal);
  } catch (error) {
    return requestFailure(error, signal);
  }
}
