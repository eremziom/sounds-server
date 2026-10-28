import type { Metadata } from "next";
import Link from "next/link";
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
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">
        {t("placeholder")}
      </p>
      <Link href="/" className="inline-block underline underline-offset-4">
        {navigation("backHome")}
      </Link>
    </main>
  );
}
