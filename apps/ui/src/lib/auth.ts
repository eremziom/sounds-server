import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACCESS_TOKEN_COOKIE,
  hasRequiredRole,
  type Role,
  REFRESH_TOKEN_COOKIE,
} from "./route-access";
import { fetchSessionUser } from "../api/auth";
import { resumeTarget, RESUMED_PARAM } from "./session-resume";

// React cache deduplicates checks within one server render, never across users.
export const getCurrentUser = cache(async () => {
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  return fetchSessionUser(
    accessToken,
    process.env.API_URL ?? "http://localhost:3000",
  );
});

export async function requireRoles(allowedRoles: readonly Role[]) {
  const user = await getCurrentUser();
  if (!user) return redirectToSessionResume();
  if (!hasRequiredRole(user, allowedRoles)) redirect("/access-denied");
  return user;
}

export async function redirectToSessionResume(): Promise<never> {
  const target = (await headers()).get("x-sounds-request-target") ?? "/";
  // A failed check immediately after recovery must not start another recovery.
  const alreadyResumed = new URL(target, "https://local.invalid").searchParams.has(RESUMED_PARAM);
  if (!alreadyResumed && (await cookies()).get(REFRESH_TOKEN_COOKIE)?.value) {
    redirect(`/resume?returnTo=${encodeURIComponent(resumeTarget(target))}`);
  }
  redirect("/login");
}
