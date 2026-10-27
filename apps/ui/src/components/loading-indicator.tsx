import { LoaderCircle } from "lucide-react";

export function LoadingIndicator({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-0 flex items-center justify-center gap-3 p-6 text-muted-foreground"
    >
      <LoaderCircle aria-hidden="true" className="size-6 shrink-0 animate-spin motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  );
}
