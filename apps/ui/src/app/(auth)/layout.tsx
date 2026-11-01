import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-6 sm:px-6">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
