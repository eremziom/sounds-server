"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { VisualBridge } from "./visual-bridge";
import "./infinite-zoom.css";

const Context = createContext<VisualBridge | null>(null);
export function useInfiniteZoom() { const value = useContext(Context); if (!value) throw new Error("Infinite Zoom requires MediaRuntime"); return value; }
export function useVisualSnapshot() { const value = useInfiniteZoom(); return useSyncExternalStore(value.subscribe, value.getSnapshot, value.getServerSnapshot); }

export function InfiniteZoomProvider({ runtime, children }: { runtime: VisualBridge; children: ReactNode }) {
  const mode = useSyncExternalStore(runtime.subscribe, runtime.getMode, runtime.getServerMode);
  const t = useTranslations("app.infiniteZoom");
  const exit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (mode !== "immersive") return;
    exit.current?.focus();
    function key(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); runtime.setMode("background"); } }
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); runtime.restoreFocus(); };
  }, [mode, runtime]);
  return <Context.Provider value={runtime}>
    <div className="flex flex-1 flex-col" data-infinite-zoom-layout data-mode={mode}>
      {children}
      {mode === "immersive" && <button ref={exit} type="button" data-iz-exit className="fixed right-4 top-4 z-[70] rounded-md border bg-background px-4 py-2 text-sm focus-visible:outline-2" onClick={() => runtime.setMode("background")}>
        {t("exitImmersive")}
      </button>}
    </div>
  </Context.Provider>;
}
