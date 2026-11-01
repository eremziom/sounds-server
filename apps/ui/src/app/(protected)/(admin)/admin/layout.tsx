import { Suspense, type ReactNode } from "react";
import { RouteGuard } from "@/components/route-guard";
import { LoadingIndicator } from "@/components/loading-indicator";
import { ADMIN_ROLES } from "@/lib/route-access";
import { getTranslations } from "next-intl/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("common.status");
  return (
    <Suspense
      fallback={<LoadingIndicator label={t("checkingAccess")} />}
    >
      <RouteGuard roles={ADMIN_ROLES}>
        <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col border-x px-4 sm:px-6">{children}</div>
      </RouteGuard>
    </Suspense>
  );
}
