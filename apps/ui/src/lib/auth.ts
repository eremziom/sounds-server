import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACCESS_TOKEN_COOKIE,
  hasRequiredRole,
  type Role,
} from "./route-access";
import { fetchSessionUser } from "../api/auth";

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
  if (!user) redirect("/login");
  if (!hasRequiredRole(user, allowedRoles)) redirect("/access-denied");
  return user;
}
