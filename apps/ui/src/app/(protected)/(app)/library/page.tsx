import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getTracks } from "@/api/tracks";
import { requireRoles, redirectToSessionResume } from "@/lib/auth";
import { ACCESS_TOKEN_COOKIE, APP_ROLES } from "@/lib/route-access";
import { formatCalendarDate, formatNumber } from "@/i18n/format";
import { formats } from "@/i18n/formats";
import { LibraryRetry } from "@/components/application/library-retry";
import { TrackPlayButton } from "@/components/application/track-play-button";
import { ProtectedLink } from "@/components/application/protected-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
      <div className="overflow-hidden rounded-lg border bg-card/80">
        <Table aria-label={t("tracks")} className="table-fixed text-xs [&_td]:overflow-hidden [&_td]:px-3 [&_td]:py-1 [&_td]:text-ellipsis [&_td:first-child]:px-0 [&_th]:h-8 [&_th]:overflow-hidden [&_th]:px-3 [&_th]:text-xs [&_th]:text-ellipsis [&_th:first-child]:px-0">
          <colgroup>
            <col style={{ width: "1.5rem" }} />
            <col style={{ width: "35%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead scope="col"><span className="sr-only">{t("playColumn")}</span></TableHead>
              <TableHead scope="col">{t("trackTitle")}</TableHead>
              <TableHead scope="col">{t("author")}</TableHead>
              <TableHead scope="col">{t("genre")}</TableHead>
              <TableHead scope="col">{t("subgenre")}</TableHead>
              <TableHead scope="col">{t("bpm")}</TableHead>
              <TableHead scope="col">{t("publicationDate")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.map((track) => <TableRow key={track.id} data-track-id={track.id}>
              <TableCell>{track.hasAudio && <TrackPlayButton track={{ id: track.id, title: track.title, author: track.author ?? null }} labels={{
                play: t("playTrack", { title: track.title }), pause: t("pauseTrack", { title: track.title }),
              }} />}</TableCell>
              <TableCell className="!whitespace-normal">
                {track.hasAudio ? <ProtectedLink href={`/library/${track.id}/analysis`} className="break-words font-medium underline underline-offset-4">{track.title}</ProtectedLink>
                  : <span className="break-words font-medium">{track.title}</span>}
              </TableCell>
              <TableCell>{track.author ?? "—"}</TableCell>
              <TableCell>{track.genre ?? "—"}</TableCell>
              <TableCell>{track.subgenre ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{track.bpm
                ? `${formatNumber(track.bpm.bpmFrom, locale, formats.number.bpm)}–${formatNumber(track.bpm.bpmTo, locale, formats.number.bpm)}`
                : "—"}</TableCell>
              <TableCell className="tabular-nums"><time dateTime={track.publicationDate}>{formatCalendarDate(track.publicationDate, locale, formats.dateTime.publicationDateNumeric)}</time></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>}
  </main>;
}
