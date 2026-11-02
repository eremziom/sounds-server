"use client";

import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApplicationSession } from "./application-runtime";
import { usePlayback } from "./media-runtime";
import type { PlaybackTrack } from "./use-audio-playback";

export function TrackPlayButton({ track, labels }: {
  track: PlaybackTrack;
  labels: { play: string; pause: string };
}) {
  const playback = usePlayback();
  const { status } = useApplicationSession();
  const playing = playback.track?.id === track.id && playback.playing;
  const label = playing ? labels.pause : labels.play;
  return <Button type="button" variant="ghost" size="icon-xs" className="px-0" onClick={() => void playback.toggle(track)}
    disabled={status !== "active"} aria-label={label} title={label} aria-pressed={playing}>
    {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
  </Button>;
}
