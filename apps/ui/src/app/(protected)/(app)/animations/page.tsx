import { requireRoles } from "@/lib/auth";
import { APP_ROLES } from "@/lib/route-access";
import { InfiniteZoomControls } from "@/components/infinite-zoom/infinite-zoom-controls";
import { ProtectedLink } from "@/components/application/protected-link";
import { getTranslations } from "next-intl/server";

export default async function AnimationsPage() {
  await requireRoles(APP_ROLES);
  const t = await getTranslations("app.creator");
  return <main className="space-y-4 py-6"><ProtectedLink href="/animations/create" className="inline-block rounded-md border bg-background px-4 py-2 text-sm">{t("openCreator")}</ProtectedLink><InfiniteZoomControls /></main>;
}
