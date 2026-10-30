"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "../ui/button";
import { completeLogout } from "../../lib/logout-event";

export function LogoutResult({ success, message, okLabel }: {
  success: boolean;
  message: string;
  okLabel: string;
}) {
  const router = useRouter();

  useEffect(() => { completeLogout(); }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => router.replace("/login"), 2000);
    return () => clearTimeout(timer);
  }, [success, router]);

  const Icon = success ? CircleCheck : TriangleAlert;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
      <section className="flex w-full max-w-md flex-col items-center gap-6 text-center" data-logout-result>
        <Icon aria-hidden="true" className={`size-24 shrink-0 ${success ? "text-emerald-500" : "text-amber-500"}`} />
        <p role="status" aria-live="polite" aria-atomic="true" className="break-words text-sm font-medium leading-relaxed">
          {message}
        </p>
        {!success && (
          <Button type="button" className="min-h-4 min-w-12" onClick={() => router.replace("/login")}>
            {okLabel}
          </Button>
        )}
      </section>
    </div>
  );
}
