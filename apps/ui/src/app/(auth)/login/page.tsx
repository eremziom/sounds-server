import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.login");
  return { title: t("title"), description: t("description") };
}

export default async function LoginPage() {
  const t = await getTranslations("auth");
  const navigation = await getTranslations("common.navigation");
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold">{t("login.title")}</h1>
      <p className="text-muted-foreground">
        {t("login.placeholder")}
      </p>
      <p>
        {t("login.noAccount")}{" "}
        <Link href="/register" className="underline underline-offset-4">
          {t("register.action")}
        </Link>
      </p>
      <Link href="/" className="inline-block underline underline-offset-4">
        {navigation("backHome")}
      </Link>
    </section>
  );
}
