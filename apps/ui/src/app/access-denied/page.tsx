import type { Metadata } from "next";
import { CircleMinus } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.accessDenied");
  return { title: t("title"), description: t("description") };
}

export default async function AccessDeniedPage() {
  const t = await getTranslations("errors.accessDenied");
  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-background p-6">
      <section className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <CircleMinus aria-hidden="true" className="size-16 shrink-0 text-destructive" />
        <div className="space-y-2 break-words">
          <h1 className="text-base font-medium">{t("title")}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("description")}</p>
        </div>
      </section>
    </main>
  );
}
