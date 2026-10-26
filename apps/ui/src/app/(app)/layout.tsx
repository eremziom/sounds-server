import { Suspense, type ReactNode } from "react";
import { RouteGuard } from "@/components/route-guard";
import { APP_ROLES } from "@/lib/route-access";
import { getTranslations } from "next-intl/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("common.status");
  return (
    <Suspense
      fallback={<p className="p-6" role="status">{t("checkingAccess")}</p>}
    >
      <RouteGuard roles={APP_ROLES}>
        <div className="flex flex-1 flex-col">{children}</div>
      </RouteGuard>
    </Suspense>
  );
}
