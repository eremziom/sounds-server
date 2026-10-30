export type Role = "USER" | "ARTIST" | "ADMIN";

export const APP_ROLES: readonly Role[] = ["USER", "ARTIST"];
export const ADMIN_ROLES: readonly Role[] = ["ADMIN"];
export const ACCESS_TOKEN_COOKIE = "accessToken";
export const REFRESH_TOKEN_COOKIE = "refreshToken";

export type SessionUser = {
  id: number;
  isActive: boolean;
  roles: { key: string }[];
};

export function hasRequiredRole(user: SessionUser, allowedRoles: readonly Role[]) {
  return (
    user.isActive &&
    user.roles.some((role) => allowedRoles.some((key) => key === role.key))
  );
}

export function sessionHome(user: SessionUser): "/" | "/admin" | "/access-denied" {
  if (hasRequiredRole(user, APP_ROLES)) return "/";
  if (hasRequiredRole(user, ADMIN_ROLES)) return "/admin";
  return "/access-denied";
}
