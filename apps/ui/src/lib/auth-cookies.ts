import "server-only";
import { cookies } from "next/headers";
import { parseAuthSession, type AuthSession } from "../api/auth.ts";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./route-access.ts";

// Invoke mutations only inside Server Actions or Route Handlers. Next.js enforces
// that boundary; these are helpers, not publicly callable Server Actions.
export async function setAuthCookies(session: AuthSession) {
  const parsed = parseAuthSession(session);
  if (!parsed) throw new Error("Invalid authentication session");
  const store = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
  store.set(ACCESS_TOKEN_COOKIE, parsed.accessToken, {
    ...options,
    expires: new Date(parsed.accessTokenExpiresAt),
  });
  store.set(REFRESH_TOKEN_COOKIE, parsed.refreshToken, {
    ...options,
    expires: new Date(parsed.refreshTokenExpiresAt),
  });
}

export async function getAuthCookies() {
  const store = await cookies();
  return {
    accessToken: store.get(ACCESS_TOKEN_COOKIE)?.value,
    refreshToken: store.get(REFRESH_TOKEN_COOKIE)?.value,
  };
}

export async function clearAuthCookies() {
  const store = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    maxAge: 0,
  };
  store.set(ACCESS_TOKEN_COOKIE, "", options);
  store.set(REFRESH_TOKEN_COOKIE, "", options);
}
