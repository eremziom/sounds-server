import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");
  const navigation = await getTranslations("common.navigation");
  return (
    <main className="space-y-4 p-6">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p>{t("description")}</p>
      <Link href="/" className="inline-block underline underline-offset-4">
        {navigation("backHome")}
      </Link>
    </main>
  );
}
