"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { resumeSessionAction } from "../../app/(auth)/resume/actions";
import { AuthSubmitButton } from "./auth-submit-button";

export function SessionResume({ target, labels, chooseHome = false }: {
  target: string;
  chooseHome?: boolean;
  labels: { resuming: string; unavailable: string; rateLimited: string; retry: string };
}) {
  const started = useRef(false);
  const [failure, setFailure] = useState<"rateLimited" | "unavailable">();
  const message = failure ? labels[failure] : undefined;
  const [pending, startTransition] = useTransition();

  function resume() {
    startTransition(async () => {
      try {
        const result = await resumeSessionAction(target, chooseHome);
        setFailure(result.rateLimited ? "rateLimited" : "unavailable");
      } catch (error) {
        unstable_rethrow(error);
        setFailure("unavailable");
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
    <section className="space-y-4 text-center" data-session-resume aria-busy={pending}>
      <p role={message ? "alert" : "status"}>{message ?? labels.resuming}</p>
      {message && <AuthSubmitButton type="button" label={labels.retry} pending={pending} onClick={resume} />}
    </section>
  );
}
