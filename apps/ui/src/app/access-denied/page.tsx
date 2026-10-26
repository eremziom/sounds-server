import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.accessDenied");
  return { title: t("title"), description: t("description") };
}

export default async function AccessDeniedPage() {
  const t = await getTranslations("errors.accessDenied");
  const navigation = await getTranslations("common.navigation");
  return (
    <main className="space-y-4 p-6">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p>{t("description")}</p>
      <Link href="/login" className="underline underline-offset-4">
        {navigation("goToLogin")}
      </Link>
    </main>
  );
}
