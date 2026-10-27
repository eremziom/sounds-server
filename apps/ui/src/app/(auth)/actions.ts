"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { login, register } from "../../api/auth.ts";
import type { AuthActionState } from "../../components/auth/form-state.ts";
import {
  readRegisterValues,
  translateRegisterIssues,
  validateRegistration,
} from "../../components/auth/register-validation.ts";
import { getAuthActionError } from "../../lib/auth-action-state.ts";
import { setAuthCookies } from "../../lib/auth-cookies.ts";
import {
  readLoginValues,
  translateLoginIssues,
  validateLogin,
} from "../../components/auth/login-validation.ts";
import { APP_ROLES, ADMIN_ROLES, hasRequiredRole } from "../../lib/route-access.ts";

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

  const result = await login({ login: input.login, password: input.password });
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
  });
  if (!result.ok)
    return { ...(await getAuthActionError(result.error, "register")), values };

  await setAuthCookies(result.data);
  redirect("/");
}
