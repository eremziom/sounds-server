"use client";

import { useTranslations } from "next-intl";
import { Pause, Play } from "lucide-react";
import { Button } from "../ui/button";
import { usePlayback } from "./media-runtime";
import { useApplicationSession } from "./application-runtime";

function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function AudioPlayer() {
  const t = useTranslations("app.player");
  const player = usePlayback();
  const { status } = useApplicationSession();
  if (!player.track) return null;
  const disabled = status !== "active";
  return <section aria-label={t("label")} data-audio-player className="border-t">
    <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium">{player.track.title}</p>
        <p className="min-h-4 truncate text-xs text-muted-foreground">{player.track.author}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => void player.toggle()}
        data-player-toggle aria-pressed={player.playing} aria-label={t(player.playing ? "pause" : "play")}>
        {player.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </Button>
      <div className="flex w-full items-center gap-3 sm:w-auto sm:flex-1">
        <span className="w-[8ch] shrink-0 text-right font-mono text-xs tabular-nums" data-player-time aria-label={t("currentTime")}>{clock(player.currentTime)}</span>
        <input type="range" min={0} max={player.duration || 0} step={0.1} value={Math.min(player.currentTime, player.duration)}
          disabled={disabled || !player.duration || !!player.error} onChange={event => player.seek(Number(event.target.value))}
          onKeyDown={event => {
            const target = event.key === "Home" ? 0 : event.key === "End" ? player.duration
              : ["ArrowRight", "ArrowUp"].includes(event.key) ? player.currentTime + 5
              : ["ArrowLeft", "ArrowDown"].includes(event.key) ? player.currentTime - 5 : null;
            if (target !== null) { event.preventDefault(); player.seek(target); }
          }}
          aria-label={t("seek")} aria-valuetext={`${clock(player.currentTime)} / ${clock(player.duration)}`}
          className="min-w-0 flex-1 accent-primary" />
        <span className="w-[8ch] shrink-0 font-mono text-xs tabular-nums" aria-label={t("duration")}>{clock(player.duration)}</span>
      </div>
      <p className="min-h-4 w-full truncate text-xs text-muted-foreground" role="status" aria-atomic="true">
        {!player.error && (player.waiting ? t("waiting") : player.ended ? t("ended") : "")}
      </p>
      {player.error && <div className="flex w-full flex-wrap items-center gap-2 text-xs">
        <p role="alert" className="text-destructive">{t(player.error)}</p>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void player.toggle()}>{t("retry")}</Button>
      </div>}
    </div>
  </section>;
}
