import "server-only";

import type { SessionUser } from "../lib/route-access";
import {
  apiRequest,
  ApiRequestError,
  isRecord,
  type ApiOptions,
  type ApiResult,
} from "./client.ts";

export type LoginInput = { login: string; password: string };
export type RegisterInput = {
  username: string;
  email: string;
  password: string;
};
export type AuthUser = SessionUser & { username: string; email: string };
export type CurrentSessionUser = SessionUser & { sessionExpiresAt: string };
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: AuthUser;
};

function parseSessionUser(value: unknown): SessionUser | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    typeof value.isActive !== "boolean" ||
    !Array.isArray(value.roles) ||
    !value.roles.every(
      (role) =>
        isRecord(role) &&
        typeof role.key === "string" &&
        /^[A-Z][A-Z0-9_]{0,63}$/.test(role.key),
    )
  )
    return undefined;
  return {
    id: value.id,
    isActive: value.isActive,
    roles: value.roles.map((role) => ({ key: role.key as string })),
  };
}

function parseExpiry(value: unknown, now: number): string | undefined {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now)
    return undefined;
  const canonical = value.replace(
    /(?:\.(\d{1,3}))?Z$/,
    (_, fraction: string | undefined) => `.${(fraction ?? "").padEnd(3, "0")}Z`,
  );
  return date.toISOString() === canonical ? canonical : undefined;
}

function parseCurrentSessionUser(value: unknown): CurrentSessionUser | undefined {
  const user = parseSessionUser(value);
  if (!user || !isRecord(value)) return undefined;
  const sessionExpiresAt = parseExpiry(value.sessionExpiresAt, Date.now());
  return sessionExpiresAt ? { ...user, sessionExpiresAt } : undefined;
}

export function parseAuthSession(
  value: unknown,
  now = Date.now(),
): AuthSession | undefined {
  if (!isRecord(value)) return undefined;
  const user = parseSessionUser(value.user);
  if (
    !user?.isActive ||
    !isRecord(value.user) ||
    typeof value.user.username !== "string" ||
    !value.user.username.trim() ||
    typeof value.user.email !== "string" ||
    !value.user.email.trim()
  )
    return undefined;
  if (
    typeof value.accessToken !== "string" ||
    value.accessToken.length > 3800 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
      value.accessToken,
    ) ||
    typeof value.refreshToken !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.refreshToken)
  )
    return undefined;
  const accessTokenExpiresAt = parseExpiry(value.accessTokenExpiresAt, now);
  const refreshTokenExpiresAt = parseExpiry(value.refreshTokenExpiresAt, now);
  if (!accessTokenExpiresAt || !refreshTokenExpiresAt) return undefined;
  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    user: { ...user, username: value.user.username, email: value.user.email },
  };
}

export function login(
  input: LoginInput,
  options?: ApiOptions,
): Promise<ApiResult<AuthSession>> {
  return apiRequest(
    "/auth/login",
    {
      method: "POST",
      expectedStatus: 201,
      body: { login: input.login, password: input.password },
      parse: parseAuthSession,
    },
    options,
  );
}

export function register(
  input: RegisterInput,
  options?: ApiOptions,
): Promise<ApiResult<AuthSession>> {
  return apiRequest(
    "/auth/register",
    {
      method: "POST",
      expectedStatus: 201,
      body: {
        username: input.username,
        email: input.email,
        password: input.password,
      },
      parse: parseAuthSession,
    },
    options,
  );
}

export function refresh(
  refreshToken: string,
  options?: ApiOptions,
): Promise<ApiResult<AuthSession>> {
  return apiRequest(
    "/auth/refresh",
    {
      method: "POST",
      expectedStatus: 200,
      body: { refreshToken },
      parse: parseAuthSession,
    },
    options,
  );
}

export function logout(
  refreshToken: string,
  options?: ApiOptions,
): Promise<ApiResult<true>> {
  return apiRequest(
    "/auth/logout",
    {
      method: "POST",
      expectedStatus: 204,
      body: { refreshToken },
      parse: () => true,
    },
    options,
  );
}

export function logoutAll(
  accessToken: string,
  options?: ApiOptions,
): Promise<ApiResult<true>> {
  if (!accessToken)
    return Promise.resolve({
      ok: false,
      status: 401,
      error: { kind: "http", status: 401, body: { code: "AUTH_REQUIRED" } },
    });
  return apiRequest(
    "/auth/logout-all",
    { method: "POST", expectedStatus: 204, accessToken, parse: () => true },
    options,
  );
}

export function getSessionUser(
  accessToken: string | undefined,
  options?: ApiOptions,
): Promise<ApiResult<CurrentSessionUser>> {
  if (!accessToken)
    return Promise.resolve({
      ok: false,
      status: 401,
      error: { kind: "http", status: 401, body: { code: "AUTH_REQUIRED" } },
    });
  return apiRequest(
    "/auth/me",
    {
      method: "GET",
      expectedStatus: 200,
      accessToken,
      parse: parseCurrentSessionUser,
    },
    options,
  );
}

export async function fetchSessionUser(
  accessToken: string | undefined,
  apiUrl: string,
  request: typeof fetch = fetch,
): Promise<CurrentSessionUser | null> {
  if (!accessToken) return null;

  const result = await getSessionUser(accessToken, { apiUrl, request });
  // Preserve the existing route-guard policy. New action callers use getSessionUser
  // directly to distinguish 401 from 403 (including invalid error bodies).
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return null;
    throw new ApiRequestError(result);
  }
  return result.data.isActive ? result.data : null;
}
