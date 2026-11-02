import { getTranslations } from "next-intl/server";

export default async function LibraryLoading() {
  const t = await getTranslations("app.library");
  return <main className="space-y-6 py-6" aria-busy="true">
    <h1 className="text-2xl font-semibold">{t("title")}</h1>
    <p role="status">{t("loading")}</p>
  </main>;
}
