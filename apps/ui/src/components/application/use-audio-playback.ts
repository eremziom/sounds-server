"use client";

import { useEffect, useRef, useState } from "react";
import { useApplicationSession } from "./application-runtime";
import { VisualReadinessError } from "../infinite-zoom/visual-bridge";

export type PlaybackTrack = { id: number; title: string; author: string | null };
export type PlaybackError = "failed" | "blocked" | "denied" | "missing" | "visual";

export function useAudioPlayback(beforePlay?: () => Promise<void>) {
  const audio = useRef<HTMLAudioElement>(null);
  const actualPlayback = useRef(false);
  const { runProtected, getStatus, end, subscribe } = useApplicationSession();
  const [track, setTrack] = useState<PlaybackTrack | null>(null);
  const [state, setState] = useState({ playing: false, waiting: false, ended: false, currentTime: 0, duration: 0 });
  const [error, setError] = useState<PlaybackError | null>(null);
  const [volumeState, setVolumeState] = useState({ volume: 1, muted: false });
  const lastVolume = useRef(1);
  const selected = useRef<PlaybackTrack | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);

  useEffect(() => subscribe(() => {
    if (["ended", "unavailable"].includes(getStatus())) {
      generation.current++;
      pending.current = false;
      setState(previous => ({ ...previous, playing: false, waiting: false }));
    }
  }), [subscribe, getStatus]);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const syncVolume = () => {
      if (element.volume > 0) lastVolume.current = element.volume;
      setVolumeState({ volume: element.volume, muted: element.muted });
    };
    syncVolume();
    element.addEventListener("volumechange", syncVolume);
    const sync = (event: Event) => {
      if (event.type === "playing") actualPlayback.current = true;
      else if (["pause", "ended", "emptied", "loadstart"].includes(event.type)) actualPlayback.current = false;
      setState({
        playing: !element.paused && !element.ended,
        waiting: ["waiting", "stalled", "loadstart"].includes(event.type)
          ? !element.paused : event.type === "playing" || element.paused ? false : element.readyState < 3,
        ended: element.ended,
        currentTime: Number.isFinite(element.currentTime) ? element.currentTime : 0,
        duration: Number.isFinite(element.duration) ? element.duration : 0,
      });
    };
    const onError = () => {
      actualPlayback.current = false;
      if (!selected.current || !element.error || element.getAttribute("src") !== `/api/tracks/${selected.current.id}/audio`) return;
      element.pause();
      setError("failed");
      const revision = generation.current;
      const id = selected.current.id;
      // Media errors hide HTTP status. A HEAD checks access without downloading
      // another recording; a failed check never starts playback automatically.
      void runProtected(async () => {
        if (revision !== generation.current || getStatus() !== "active") return;
        const response = await fetch(`/api/tracks/${id}/audio`, { method: "HEAD", cache: "no-store" });
        if (revision !== generation.current) return;
        if (response.status === 401) end();
        else setError(response.status === 403 ? "denied" : response.status === 404 ? "missing" : "failed");
      }).catch(() => { /* The generic error remains available for explicit retry. */ });
    };
    const events = ["play", "playing", "pause", "timeupdate", "durationchange", "loadedmetadata", "waiting", "stalled", "canplay", "seeking", "seeked", "ended", "emptied", "loadstart"];
    events.forEach(name => element.addEventListener(name, sync));
    element.addEventListener("error", onError);
    return () => {
      // Invalidate the latest operation, including one started after mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      events.forEach(name => element.removeEventListener(name, sync));
      element.removeEventListener("error", onError);
      element.removeEventListener("volumechange", syncVolume);
    };
  }, [audio, runProtected, getStatus, end]);

  async function toggle(next: PlaybackTrack = selected.current!) {
    const element = audio.current;
    if (!element || !next || getStatus() !== "active") return;
    const same = selected.current?.id === next.id;
    if (same && (!element.paused || pending.current)) {
      generation.current++;
      pending.current = false;
      element.pause();
      setState(previous => ({ ...previous, waiting: false, playing: false }));
      return;
    }
    const revision = ++generation.current;
    pending.current = true;
    element.pause();
    selected.current = next;
    setTrack(next);
    setError(null);
    setState(previous => ({ ...previous, playing: false, waiting: true, ended: false,
      ...(!same ? { currentTime: 0, duration: 0 } : {}) }));
    try {
      // Begin visual preparation and graph resume in the user's activation
      // task. Only guarded audio.play below can start playback after readiness.
      const preparation = beforePlay?.();
      const readiness = preparation?.then(() => ({ ok: true as const }), failure => ({ ok: false as const, failure }));
      await runProtected(async () => {
        if (revision !== generation.current || getStatus() !== "active") return;
        const src = `/api/tracks/${next.id}/audio`;
        if (element.getAttribute("src") !== src || element.error) {
          element.src = src;
          element.load();
        }
        if (element.ended) element.currentTime = 0;
        const result = await readiness;
        if (result && !result.ok) throw result.failure;
        if (revision !== generation.current || getStatus() !== "active") return;
        await element.play();
      });
    } catch (failure) {
      if (revision === generation.current && getStatus() === "active" && !(failure instanceof DOMException && failure.name === "AbortError")) {
        setError(failure instanceof VisualReadinessError ? "visual" : failure instanceof DOMException && failure.name === "NotAllowedError" ? "blocked" : "failed");
      }
    } finally {
      if (revision === generation.current) {
        pending.current = false;
        setState(previous => ({ ...previous, waiting: false }));
      }
    }
  }

  function seek(time: number) {
    const element = audio.current;
    if (element && getStatus() === "active" && Number.isFinite(time) && Number.isFinite(element.duration)) {
      element.currentTime = Math.max(0, Math.min(time, element.duration));
    }
  }

  function setVolume(volume: number) {
    const element = audio.current;
    if (!element || getStatus() !== "active" || !Number.isFinite(volume)) return;
    element.volume = Math.max(0, Math.min(volume, 1));
    element.muted = false;
  }

  function toggleMute() {
    const element = audio.current;
    if (!element || getStatus() !== "active") return;
    if (element.muted || element.volume === 0) {
      if (element.volume === 0) element.volume = lastVolume.current;
      element.muted = false;
    } else {
      element.muted = true;
    }
  }

  return { audio, actualPlayback, track, ...state, ...volumeState, error, toggle, seek, setVolume, toggleMute };
}
