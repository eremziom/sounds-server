"use client";

import { useTransition } from "react";
import { Button } from "../ui/button";

export function SessionRecovery({ message, retryLabel, retry }: {
  message: string;
  retryLabel: string;
  retry: () => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center" data-session-recovery>
      <p role="alert">{message}</p>
      <Button disabled={pending} onClick={() => startTransition(async () => { await retry(); })}>
        {retryLabel}
      </Button>
    </div>
  );
}
