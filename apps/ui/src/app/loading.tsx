import { getTranslations } from "next-intl/server";
import { LoaderCircle } from "lucide-react";

export default async function Loading() {
  const t = await getTranslations("common.status");
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-0 flex items-center justify-center gap-3 p-6 text-muted-foreground"
    >
      <LoaderCircle aria-hidden="true" className="size-6 shrink-0 animate-spin motion-reduce:animate-none" />
      <span>{t("loading")}</span>
    </div>
  );
}
