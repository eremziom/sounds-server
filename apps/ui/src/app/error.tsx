"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";

export default function PageError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("errors.page");
  const actions = useTranslations("common.actions");
  const [pending, startTransition] = useTransition();
  return (
    <main className="flex flex-1 items-center justify-center p-6" data-page-error>
      <title>{t("title")}</title>
      <section className="w-full max-w-md space-y-4 text-center" aria-busy={pending}>
        <h1 className="sr-only">{t("title")}</h1>
        <p role="alert">{t("description")}</p>
        <AuthSubmitButton type="button" label={actions("retry")} pending={pending}
          onClick={() => startTransition(() => retry())} />
      </section>
    </main>
  );
}
