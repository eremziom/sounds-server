import "server-only";

import { getSessionUser } from "../api/auth.ts";
import { getAuthCookies } from "./auth-cookies.ts";
import { sessionHome } from "./route-access.ts";

// Rendering only checks the session. Cookie rotation belongs to the resume POST.
export async function checkLoginSession(alreadyResumed = false) {
  const { accessToken, refreshToken } = await getAuthCookies();
  const current = await getSessionUser(accessToken);
  if (current.ok && current.data.isActive) {
    return { destination: sessionHome(current.data) };
  }
  if (!current.ok && current.status !== 401 && current.status !== 403) {
    return { unavailable: true, rateLimited: current.status === 429 };
  }
  if (refreshToken && !alreadyResumed) return { destination: "/resume?mode=login" };
  return {};
}
