"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ProtectedLink } from "./protected-link";

// The root layout owns this permanent header slot. Rendering through a portal
// keeps the link inside the protected runtime's session context.
const subscribe = () => () => {};
const getHeaderSlot = () => document.getElementById("application-navigation");
const getServerSlot = () => null;

export function ApplicationNavigation({ adminLabel }: { adminLabel: string }) {
  const slot = useSyncExternalStore(subscribe, getHeaderSlot, getServerSlot);
  if (!slot) return null;

  return createPortal(
    <ProtectedLink href="/admin"
      className="inline-flex min-h-10 items-center rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {adminLabel}
    </ProtectedLink>,
    slot,
  );
}
