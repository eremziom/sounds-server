"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import SoftAurora from "./react-bits/SoftAurora";

export function SiteHeader({ navigation, userMenu, languageSwitcher }: {
  navigation: ReactNode;
  userMenu: ReactNode;
  languageSwitcher: ReactNode;
}) {
  // Root layouts persist across client navigation, so follow the live pathname.
  if (usePathname() === "/access-denied") return null;
  return <header className="relative isolate z-10 border-b">
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
    <div className="grid w-full grid-cols-[minmax(max-content,1fr)_minmax(0,1200px)_minmax(max-content,1fr)] items-center gap-3 px-4 py-3 sm:px-6">
      <span className="justify-self-start font-semibold">LOGO</span>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">{navigation}</div>
        <div className="ml-auto flex shrink-0 items-center gap-3" data-header-user-menu>{userMenu}</div>
      </div>
      <div className="justify-self-end">{languageSwitcher}</div>
    </div>
  </header>;
}
