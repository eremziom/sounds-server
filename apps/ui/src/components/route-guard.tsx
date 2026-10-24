import type { ReactNode } from "react";
import { requireRoles } from "@/lib/auth";
import type { Role } from "@/lib/route-access";

export async function RouteGuard({
  roles,
  children,
}: {
  roles: readonly Role[];
  children: ReactNode;
}) {
  await requireRoles(roles);
  return children;
}
