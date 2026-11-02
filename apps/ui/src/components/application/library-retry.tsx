"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useApplicationSession } from "./application-runtime";

export function LibraryRetry({ label }: { label: string }) {
  const router = useRouter();
  const { runProtected, status } = useApplicationSession();
  const [pending, startTransition] = useTransition();

  return <Button type="button" disabled={pending || status === "ended" || status === "unavailable"}
    aria-busy={pending} onClick={() => startTransition(async () => {
      await runProtected(() => router.refresh());
    })}>{label}</Button>;
}
