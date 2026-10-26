import { requireRoles } from "@/lib/auth";
import { APP_ROLES } from "@/lib/route-access";
import { getTranslations } from "next-intl/server";

export default async function Home() {
  await requireRoles(APP_ROLES);
  const t = await getTranslations("app.home");
  return (
    <main className="p-6">
      <h1>{t("title")}</h1>
    </main>
  );
}
