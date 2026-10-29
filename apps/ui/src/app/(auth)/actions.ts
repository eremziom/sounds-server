"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { login, register, refresh, logout, logoutAll } from "../../api/auth.ts";
import type { AuthActionState } from "../../components/auth/form-state.ts";
import {
  readRegisterValues,
  translateRegisterIssues,
  validateRegistration,
} from "../../components/auth/register-validation.ts";
import { getAuthActionError } from "../../lib/auth-action-state.ts";
import { setAuthCookies, getAuthCookies, clearAuthCookies } from "../../lib/auth-cookies.ts";
import {
  readLoginValues,
  translateLoginIssues,
  validateLogin,
} from "../../components/auth/login-validation.ts";
import { APP_ROLES, ADMIN_ROLES, hasRequiredRole } from "../../lib/route-access.ts";
import type { RefreshResult } from "../../lib/session-refresh.ts";
import { authSource } from "../../lib/auth-source.ts";
import { isRecord } from "../../api/client.ts";

// Temporary switch for previewing the unconfirmed logout notices locally.
const SIMULATE_LOGOUT_FAILURE = false;

// Invoked as a Next.js POST Server Action. Credentials come only from HttpOnly
// cookies; the serialized result never includes tokens or the API response.
export async function refreshAction(): Promise<RefreshResult> {
  const { refreshToken } = await getAuthCookies();
  if (!refreshToken) return { ok: false };

  const result = await refresh(refreshToken, { authSource: await authSource() });
  if (!result.ok) {
    if (result.status === 401 || result.status === 400) return { ok: false };
    if (result.status === 429 && result.error.kind === "http" && isRecord(result.error.body) && result.error.body.code === "AUTH_RATE_LIMITED") {
      return { ok: false, reason: "unavailable", rateLimited: true };
    }
    return { ok: false, reason: "unavailable" };
  }

  await setAuthCookies(result.data);
  return { ok: true, accessTokenExpiresAt: Date.parse(result.data.accessTokenExpiresAt) };
}

export async function expireSessionAction(): Promise<never> {
  await clearAuthCookies();
  redirect("/login");
}

async function endSession(scope: "current" | "all"): Promise<never> {
  const { accessToken, refreshToken } = await getAuthCookies();
  const hasTokens = Boolean(accessToken || refreshToken);
  let confirmed = !hasTokens;
  try {
    if (SIMULATE_LOGOUT_FAILURE && process.env.NODE_ENV === "development" && hasTokens) {
      throw new Error("Temporary simulated logout API failure");
    }
    if (scope === "all" && hasTokens) {
      // The API checks the active session with JwtAuthGuard. No application
      // role or read-own permission is required to revoke one's own sessions.
      confirmed = (await logoutAll(accessToken ?? "")).ok;
    } else if (refreshToken) {
      confirmed = (await logout(refreshToken)).ok;
    }
  } catch {
    // Unexpected transport failures must not prevent local sign-out either.
    confirmed = false;
  }

  await clearAuthCookies();
  const notice = scope === "all" ? "all-unconfirmed" : "local";
  redirect(confirmed ? "/logout?status=success" : `/logout?status=${notice}`);
}

export async function logoutAction(): Promise<never> {
  return endSession("current");
}

export async function logoutAllAction(): Promise<never> {
  return endSession("all");
}

export async function loginAction(formData: FormData): Promise<AuthActionState> {
  const locale = await getLocale();
  const input = readLoginValues(formData);
  const values = { login: input.login };
  const issues = validateLogin(input);
  if (Object.keys(issues).length) {
    const t = await getTranslations();
    return {
      status: "error",
      locale,
      message: t("errors.invalidInput"),
      fieldErrors: translateLoginIssues(issues, (key, params) =>
        t(`validation.${key}`, params),
      ),
      values,
    };
  }

  const result = await login({ login: input.login, password: input.password }, { authSource: await authSource() });
  if (!result.ok)
    return { ...(await getAuthActionError(result.error, "login")), values };

  await setAuthCookies(result.data);
  const user = result.data.user;
  if (hasRequiredRole(user, APP_ROLES)) redirect("/");
  if (hasRequiredRole(user, ADMIN_ROLES)) redirect("/admin");
  redirect("/access-denied");
}

export async function registerAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const locale = await getLocale();
  const input = readRegisterValues(formData);
  const values = { username: input.username, email: input.email };
  const issues = validateRegistration(input);
  if (Object.keys(issues).length) {
    const t = await getTranslations();
    return {
      status: "error",
      locale,
      message: t("errors.invalidInput"),
      fieldErrors: translateRegisterIssues(issues, (key, params) =>
        t(`validation.${key}`, params),
      ),
      values,
    };
  }

  const result = await register({
    username: input.username,
    email: input.email,
    password: input.password,
  }, { authSource: await authSource() });
  if (!result.ok)
    return { ...(await getAuthActionError(result.error, "register")), values };

  await setAuthCookies(result.data);
  redirect("/");
}
