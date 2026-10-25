import "server-only";

import type { SessionUser } from "./route-access";

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
