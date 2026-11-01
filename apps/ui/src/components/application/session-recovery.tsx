"use client";

import { useTransition } from "react";
import { AuthSubmitButton } from "../auth/auth-submit-button";

export function SessionRecovery({ message, retryLabel, retry }: {
  message: string;
  retryLabel: string;
  retry: () => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center" data-session-recovery>
      <p role="alert">{message}</p>
      <div className="w-full max-w-sm space-y-4">
        <AuthSubmitButton type="button" label={retryLabel} pending={pending}
          onClick={() => startTransition(async () => { await retry(); })} />
      </div>
    </div>
  );
}
