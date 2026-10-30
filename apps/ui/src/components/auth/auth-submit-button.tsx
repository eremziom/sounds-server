"use client";

import { Button } from "../ui/button";
import WarpText from "../ui/warp-text";

export function AuthSubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <>
      <div aria-hidden="true" className="relative left-1/2 h-[2px] w-screen -translate-x-1/2 bg-fuchsia-900" />
      <Button variant="auth" type="submit" disabled={pending} className="h-auto min-h-11 w-full whitespace-normal px-4 py-2">
        <span className="sr-only">{label}</span>
        <span aria-hidden="true" className="w-full">
          <WarpText
            text={label}
            warpStrength={0}
            warpScale={2.8}
            speed={1.5}
            lens="swirl"
            pointerInfluence={0.75}
            pointerStrength={0.56}
            refraction={0.03}
            chromatic={0.8}
            idleDrift={1}
            ripple
            clickRipple
            intro
            fontSize={104}
            fontWeight={700}
            style={{ minHeight: 28 }}
            color="var(--color-white)"
            letterSpacing="-0.02em"
          />
        </span>
      </Button>
    </>
  );
}
