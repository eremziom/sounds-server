import { getTranslations } from "next-intl/server";
import { LoadingIndicator } from "@/components/loading-indicator";

export default async function Loading() {
  const t = await getTranslations("common.status");
  return <LoadingIndicator label={t("loading")} />;
}
