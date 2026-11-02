import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getTracks } from "@/api/tracks";
import { requireRoles, redirectToSessionResume } from "@/lib/auth";
import { ACCESS_TOKEN_COOKIE, APP_ROLES } from "@/lib/route-access";
import { formatCalendarDate, formatNumber } from "@/i18n/format";
import { formats } from "@/i18n/formats";
import { LibraryRetry } from "@/components/application/library-retry";

export default async function LibraryPage() {
  // Layout guards run independently: authorize here before requesting the list.
  await requireRoles(APP_ROLES);
  const result = await getTracks((await cookies()).get(ACCESS_TOKEN_COOKIE)?.value);
  if (!result.ok && result.status === 401) await redirectToSessionResume();
  if (!result.ok && result.status === 403) redirect("/access-denied");
  const t = await getTranslations("app.library");
  const locale = await getLocale();

  return <main className="space-y-6 py-6" data-library>
    <h1 className="text-2xl font-semibold">{t("title")}</h1>
    {!result.ok ? <section className="space-y-4" data-library-error>
      <p role="alert">{t("loadFailed")}</p>
      <LibraryRetry label={t("retry")} />
    </section> : result.data.length === 0 ? <p role="status" data-library-empty>{t("empty")}</p> :
      <ul aria-label={t("tracks")} className="space-y-4">
        {result.data.map((track) => <li key={track.id} className="min-w-0 rounded-lg border bg-card/80 p-4 sm:p-6" data-track-id={track.id}>
          <article className="space-y-3" aria-labelledby={`track-${track.id}`}>
            <h2 id={`track-${track.id}`} className="break-words text-xl font-semibold">{track.title}</h2>
            {track.description && <p className="whitespace-pre-wrap break-words text-muted-foreground">{track.description}</p>}
            <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div><dt className="text-muted-foreground">{t("publicationDate")}</dt>
                <dd><time dateTime={track.publicationDate}>{formatCalendarDate(track.publicationDate, locale)}</time></dd></div>
              {track.bpm && <div><dt className="text-muted-foreground">{t("bpm")}</dt>
                <dd>{formatNumber(track.bpm.bpmFrom, locale, formats.number.bpm)}–{formatNumber(track.bpm.bpmTo, locale, formats.number.bpm)}</dd></div>}
              <div><dt className="text-muted-foreground">{t("audio")}</dt>
                <dd>{track.hasAudio ? t("audioAvailable") : t("noAudio")}</dd></div>
            </dl>
          </article>
        </li>)}
      </ul>}
  </main>;
}
