import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getTrack } from "@/api/tracks";
import { requireRoles, redirectToSessionResume } from "@/lib/auth";
import { ACCESS_TOKEN_COOKIE, APP_ROLES } from "@/lib/route-access";
import { AudioAnalysisPanel } from "@/components/application/audio-analysis-panel";
import { ProtectedLink } from "@/components/application/protected-link";
import { LibraryRetry } from "@/components/application/library-retry";
import { ClientMessages } from "@/i18n/client-messages";
import { LiveAudioAnalysisPanel } from "@/components/application/live-audio-analysis-panel";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRoles(APP_ROLES);
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const result = await getTrack(Number(id), (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value);
  if (!result.ok && result.status === 401) await redirectToSessionResume();
  if (!result.ok && result.status === 403) redirect("/access-denied");
  if (!result.ok && result.status === 404) notFound();
  const t = await getTranslations("app.analysis");
  return <main className="space-y-6 py-6" data-audio-analysis>
    <ProtectedLink href="/library" className="underline underline-offset-4">{t("back")}</ProtectedLink>
    <h1 className="text-2xl font-semibold">{t("title")}</h1>
    {!result.ok ? <section className="space-y-3"><p role="alert">{t("failed")}</p><LibraryRetry label={t("retry")} /></section>
      : !result.data.hasAudio ? <p>{t("noAudio")}</p>
      : <ClientMessages namespaces={["app"]}>
        <LiveAudioAnalysisPanel key={`live-${id}`} track={{ id: result.data.id, title: result.data.title, author: result.data.author }} />
        <AudioAnalysisPanel key={id} track={{ id: result.data.id, title: result.data.title }} />
      </ClientMessages>}
  </main>;
}
