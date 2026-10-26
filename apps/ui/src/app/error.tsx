"use client";

import { useTranslations } from "next-intl";

export default function PageError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("errors.page");
  const actions = useTranslations("common.actions");
  return (
    <main className="space-y-4 p-6" role="alert">
      <title>{t("title")}</title>
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p>{t("description")}</p>
      <button type="button" onClick={retry} className="rounded-md border px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {actions("retry")}
      </button>
    </main>
  );
}
