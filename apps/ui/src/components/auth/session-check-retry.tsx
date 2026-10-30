"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "../ui/button";

export function SessionCheckRetry({ message, retry }: { message: string; retry: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <section className="space-y-4 text-center" data-session-check aria-busy={pending}>
    <p role="alert">{message}</p>
    <Button disabled={pending} onClick={() => startTransition(() => router.refresh())}>{retry}</Button>
  </section>;
}
