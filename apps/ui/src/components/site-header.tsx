"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import SoftAurora from "./react-bits/SoftAurora";

export function SiteHeader({ children }: { children: ReactNode }) {
  // Root layouts persist across client navigation, so follow the live pathname.
  if (usePathname() === "/access-denied") return null;
  return <header className="relative isolate z-10 flex flex-wrap items-center justify-end gap-3 border-b px-4 py-3 sm:px-6">
    <div aria-hidden="true" className="site-header-aurora" style={{
      position: "absolute", inset: 0, zIndex: -1, overflow: "hidden", pointerEvents: "none",
      background: "radial-gradient(ellipse at center, rgb(225 0 255 / 8%), transparent 75%)",
    }}>
      <SoftAurora
        style={{ position: "absolute", top: "50%", height: "max(100%, 160px)", transform: "translateY(-50%)" }}
        speed={0.6}
        scale={1.2}
        brightness={0.6}
        color1="#f7f7f7"
        color2="#e100ff"
        bandHeight={0.49}
        bandSpread={1}
        enableMouseInteraction
        mouseInfluence={0}
        noiseFrequency={0.5}
        noiseAmplitude={0.6}
        octaveDecay={0.33}
        clickPulse={false}
        intro={false}
      />
    </div>
    {children}
  </header>;
}
