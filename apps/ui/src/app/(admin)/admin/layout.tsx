import { Suspense, type ReactNode } from "react";
import { RouteGuard } from "@/components/route-guard";
import { ADMIN_ROLES } from "@/lib/route-access";
import { getTranslations } from "next-intl/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("common.status");
  return (
    <Suspense
      fallback={<p className="p-6" role="status">{t("checkingAccess")}</p>}
    >
      <RouteGuard roles={ADMIN_ROLES}>
        <div className="flex flex-1 flex-col">{children}</div>
      </RouteGuard>
    </Suspense>
  );
}
