import type { Metadata } from "next";
import { ProtectedLink } from "@/components/application/protected-link";
import { requireRoles } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/route-access";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.admin");
  return { title: t("title"), description: t("description") };
}

export default async function AdminPage() {
  await requireRoles(ADMIN_ROLES);
  const t = await getTranslations("admin.home");
  const navigation = await getTranslations("common.navigation");
  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold sm:text-3xl">{t("title")}</h1>
      <p className="text-muted-foreground">
        {t("placeholder")}
      </p>
      <ProtectedLink href="/" className="inline-block underline underline-offset-4">
        {navigation("backHome")}
      </ProtectedLink>
    </main>
  );
}
