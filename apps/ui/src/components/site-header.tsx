"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function SiteHeader({ children }: { children: ReactNode }) {
  // Root layouts persist across client navigation, so follow the live pathname.
  if (usePathname() === "/access-denied") return null;
  return <header className="flex flex-wrap items-center justify-end gap-3 border-b px-4 py-3 sm:px-6">
    {children}
  </header>;
}
