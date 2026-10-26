import { getTranslations } from "next-intl/server";

export default async function Loading() {
  const t = await getTranslations("common.status");
  return <p className="p-6" role="status">{t("loading")}</p>;
}
