"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { register } from "../../api/auth.ts";
import type { AuthActionState } from "../../components/auth/form-state.ts";
import {
  readRegisterValues,
  translateRegisterIssues,
  validateRegistration,
} from "../../components/auth/register-validation.ts";
import { getAuthActionError } from "../../lib/auth-action-state.ts";
import { setAuthCookies } from "../../lib/auth-cookies.ts";

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
