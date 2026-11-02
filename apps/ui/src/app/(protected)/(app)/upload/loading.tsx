import { getTranslations } from "next-intl/server";
export default async function UploadLoading() {
  const t = await getTranslations("common.status");
  return <p role="status" className="py-6">{t("loading")}</p>;
}
