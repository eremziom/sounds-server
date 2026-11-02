"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApplicationSession } from "./application-runtime";
import { useMediaRuntime } from "./media-runtime";

export function TrackPlayButton({ trackId, labels }: {
  trackId: number;
  labels: { play: string; pause: string; failed: string };
}) {
  const { audio } = useMediaRuntime();
  const { status, ensureFresh, getStatus } = useApplicationSession();
  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = `/api/tracks/${trackId}/audio`;

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const sync = () => setPlaying(element.getAttribute("src") === src && !element.paused && !element.ended);
    const onError = () => {
      if (element.getAttribute("src") === src) setFailed(true);
      sync();
    };
    const events = ["play", "pause", "ended", "emptied", "loadstart"];
    events.forEach(event => element.addEventListener(event, sync));
    element.addEventListener("error", onError);
    sync();
    return () => {
      events.forEach(event => element.removeEventListener(event, sync));
      element.removeEventListener("error", onError);
    };
  }, [audio, src]);

  async function toggle() {
    const element = audio.current;
    if (!element || pending) return;
    setFailed(false);
    if (element.getAttribute("src") === src && !element.paused) {
      element.pause();
      return;
    }
    setPending(true);
    try {
      if (!await ensureFresh() || getStatus() !== "active") return;
      if (element.getAttribute("src") !== src || element.error) element.setAttribute("src", src);
      await element.play();
    } catch (error) {
      // Switching tracks or ending a session can interrupt a pending play().
      if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
    } finally {
      setPending(false);
    }
  }

  const label = playing ? labels.pause : labels.play;
  return <>
    <Button type="button" variant="ghost" size="icon-xs" className="px-0" onClick={toggle}
      disabled={pending || status !== "active"} aria-label={label} title={label} aria-pressed={playing}>
      {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
    </Button>
    {failed && <span role="alert" className="block max-w-32 whitespace-normal text-xs text-destructive">{labels.failed}</span>}
  </>;
}
