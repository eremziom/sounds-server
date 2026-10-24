import { Suspense, type ReactNode } from "react";
import { RouteGuard } from "@/components/route-guard";
import { ADMIN_ROLES } from "@/lib/route-access";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={<p className="p-6" role="status">Sprawdzanie dostępu…</p>}
    >
      <RouteGuard roles={ADMIN_ROLES}>
        <div className="flex flex-1 flex-col">{children}</div>
      </RouteGuard>
    </Suspense>
  );
}
