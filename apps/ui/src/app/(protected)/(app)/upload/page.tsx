import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUploadConfig } from "@/api/tracks";
import { requireRoles, redirectToSessionResume } from "@/lib/auth";
import { ACCESS_TOKEN_COOKIE, APP_ROLES } from "@/lib/route-access";
import { canCreateTrack } from "@/lib/track-access";
import { ClientMessages } from "@/i18n/client-messages";
import { UploadForm } from "@/components/application/upload-form";
import { LibraryRetry } from "@/components/application/library-retry";

export default async function UploadPage() {
  const user = await requireRoles(APP_ROLES);
  if (!canCreateTrack(user)) redirect("/access-denied");
  const config = await getUploadConfig((await cookies()).get(ACCESS_TOKEN_COOKIE)?.value);
  if (!config.ok && config.status === 401) await redirectToSessionResume();
  if (!config.ok && config.status === 403) redirect("/access-denied");
  const t = await getTranslations("app.upload");
  return <main className="space-y-6 py-6" data-upload>
    <h1 className="text-2xl font-semibold">{t("title")}</h1>
    {config.ok ? <ClientMessages namespaces={["app", "errors", "validation", "auth"]}>
      <UploadForm config={config.data} />
    </ClientMessages> : <section className="space-y-4">
      <p role="alert">{t("configFailed")}</p><LibraryRetry label={t("retry")} />
    </section>}
  </main>;
}
