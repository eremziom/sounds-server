"use client";

import { AttackMonitor } from "./attack-monitor";

export function KickMonitor({ active }: { active: boolean }) {
  return <AttackMonitor active={active} source="kick" />;
}
