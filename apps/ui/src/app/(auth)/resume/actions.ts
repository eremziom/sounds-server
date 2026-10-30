"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "../../../api/auth.ts";
import { clearAuthCookies, getAuthCookies } from "../../../lib/auth-cookies.ts";
import { ADMIN_ROLES, APP_ROLES, hasRequiredRole } from "../../../lib/route-access.ts";
import { resumeTarget, resumedTarget } from "../../../lib/session-resume.ts";
import { refreshAction } from "../actions.ts";

export async function resumeSessionAction(target: string) {
  // All arguments are untrusted, even though the page also sanitizes the URL.
  const destination = resumeTarget(target);

  const result = await refreshAction();
  if (!result.ok) {
    if (result.reason === "unavailable") return result;
    await clearAuthCookies();
    redirect("/login");
  }

  const { accessToken } = await getAuthCookies();
  const current = await getSessionUser(accessToken);
  if (!current.ok) {
    if (current.status !== 401 && current.status !== 403) {
      return { ok: false as const, reason: "unavailable" as const };
    }
    await clearAuthCookies();
    redirect("/login");
  }
  const roles = new URL(destination, "https://local.invalid").pathname === "/admin" ? ADMIN_ROLES : APP_ROLES;
  if (!hasRequiredRole(current.data, roles)) redirect("/access-denied");
  redirect(resumedTarget(destination));
}
