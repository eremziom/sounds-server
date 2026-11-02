"use client";

import { useEffect } from "react";
import { confirmNavigation, hasNavigationBlocker } from "@/lib/unsaved-navigation";

// Track entries from the root so Back/Forward can be restored before Next handles
// popstate. Preserve all framework history fields and never add sentinel entries.
export function UnsavedNavigation() {
  useEffect(() => {
    const key = "__soundsEntry";
    let current = Number(history.state?.[key] ?? 0);
    const push = history.pushState;
    const replace = history.replaceState;
    replace.call(history, { ...history.state, [key]: current }, "");
    history.pushState = function (state, unused, url) {
      current++;
      return push.call(this, { ...state, [key]: current }, unused, url);
    };
    history.replaceState = function (state, unused, url) {
      return replace.call(this, { ...state, [key]: current }, unused, url);
    };
    let replay = false;
    let restoring: (() => void) | undefined;
    let traversing = false;
    function pop(event: PopStateEvent) {
      const next = event.state?.[key];
      if (restoring) {
        event.stopImmediatePropagation();
        const restored = restoring; restoring = undefined; restored();
        return;
      }
      if (replay || !hasNavigationBlocker() || typeof next !== "number") {
        replay = false;
        if (typeof next === "number") current = next;
        return;
      }
      event.stopImmediatePropagation();
      const delta = next - current;
      if (!delta || traversing) return;
      traversing = true;
      restoring = () => { void confirmNavigation().then(leave => {
        traversing = false;
        if (leave) { replay = true; history.go(delta); }
      }); };
      history.go(-delta);
    }
    let replayClick = false;
    function click(event: MouseEvent) {
      if (replayClick || !hasNavigationBlocker() || event.defaultPrevented || event.button !== 0 ||
          event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.download || (anchor.target && anchor.target !== "_self")) return;
      if (anchor.href === location.href) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void confirmNavigation().then(leave => {
        if (leave) { replayClick = true; anchor.click(); replayClick = false; }
      });
    }
    window.addEventListener("popstate", pop, true);
    document.addEventListener("click", click, true);
    return () => {
      history.pushState = push; history.replaceState = replace;
      window.removeEventListener("popstate", pop, true);
      document.removeEventListener("click", click, true);
    };
  }, []);
  return null;
}
