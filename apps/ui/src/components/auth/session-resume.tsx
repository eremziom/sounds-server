"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { resumeSessionAction } from "../../app/(auth)/resume/actions";
import { Button } from "../ui/button";

export function SessionResume({ target, labels }: {
  target: string;
  labels: { resuming: string; unavailable: string; rateLimited: string; retry: string };
}) {
  const started = useRef(false);
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();

  function resume() {
    startTransition(async () => {
      try {
        const result = await resumeSessionAction(target);
        setMessage(result.rateLimited ? labels.rateLimited : labels.unavailable);
      } catch (error) {
        unstable_rethrow(error);
        setMessage(labels.unavailable);
      }
    });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    resume();
    // One automatic attempt per mount; later attempts require the retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-4 text-center" data-session-resume>
      <p role={message ? "alert" : "status"}>{pending || !message ? labels.resuming : message}</p>
      {message && <Button disabled={pending} onClick={resume}>{labels.retry}</Button>}
    </section>
  );
}
