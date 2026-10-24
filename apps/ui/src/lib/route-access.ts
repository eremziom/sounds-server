export type Role = "USER" | "ARTIST" | "ADMIN";

export const APP_ROLES: readonly Role[] = ["USER", "ARTIST"];
export const ADMIN_ROLES: readonly Role[] = ["ADMIN"];
export const ACCESS_TOKEN_COOKIE = "accessToken";

export type SessionUser = {
  id: number;
  isActive: boolean;
  roles: { key: string }[];
};

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<SessionUser>;
  return (
    typeof user.id === "number" &&
    typeof user.isActive === "boolean" &&
    Array.isArray(user.roles) &&
    user.roles.every(
      (role) => role && typeof role === "object" && typeof role.key === "string",
    )
  );
}

export function hasRequiredRole(user: SessionUser, allowedRoles: readonly Role[]) {
  return (
    user.isActive &&
    user.roles.some((role) => allowedRoles.some((key) => key === role.key))
  );
}

export async function fetchSessionUser(
  accessToken: string | undefined,
  apiUrl: string,
  request: typeof fetch = fetch,
): Promise<SessionUser | null> {
  if (!accessToken) return null;

  const response = await request(`${apiUrl.replace(/\/$/, "")}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Nie udało się zweryfikować sesji.");

  const user: unknown = await response.json();
  if (!isSessionUser(user)) {
    throw new Error("Nieprawidłowa odpowiedź weryfikacji sesji.");
  }
  return user.isActive ? user : null;
}
