"use client";

import {
  createContext, startTransition, useContext, useEffect, useState, useSyncExternalStore,
  type ReactNode,
} from "react";
import { createApplicationSession, type ApplicationSession } from "../../lib/application-session";
import { MediaRuntime } from "./media-runtime";
import { AudioPlayer } from "./audio-player";
import { refreshAction, expireSessionAction } from "../../app/(auth)/actions";
import { createSessionRefresh, type RefreshResult } from "../../lib/session-refresh";
import { SessionFooter, type SessionFooterLabels } from "./session-footer";
import { createProtectedRequest } from "../../lib/protected-request";
import { ApplicationNavigation, type ApplicationNavigationLabels } from "./application-navigation";
import { ApplicationBackground } from "./application-background";
import { BackgroundSettingsProvider } from "./background-settings";
import { LOGOUT_EVENT, broadcastLogout, subscribeToLogout } from "../../lib/logout-event";
import { SessionRecovery } from "./session-recovery";
import { RESUMED_PARAM } from "../../lib/session-resume";

const SessionContext = createContext<{
  session: ApplicationSession;
  ensureFresh: () => Promise<boolean>;
  runProtected: ReturnType<typeof createProtectedRequest>;
} | null>(null);

export function useApplicationSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("Application session requires the protected application layout");
  const { session, ensureFresh, runProtected } = context;
  const status = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { status, renew: session.renew, end: session.end, subscribe: session.subscribe, getStatus: session.getSnapshot, ensureFresh, runProtected };
}

function renewSession(): Promise<RefreshResult> {
  return new Promise((resolve, reject) => {
    startTransition(async () => {
      try { resolve(await refreshAction()); }
      catch (error) { reject(error); }
    });
  });
}

// Mounted once per authenticated account, outside page loading/error boundaries.
// No token, pathname or locale is part of this component's identity.
export function ApplicationRuntime({ children, accessTokenExpiresAt, sessionExpiresAt, footerLabels, navigationLabels }: {
  children: ReactNode;
  accessTokenExpiresAt: number | null;
  sessionExpiresAt: number;
  footerLabels: SessionFooterLabels;
  navigationLabels: ApplicationNavigationLabels;
}) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has(RESUMED_PARAM)) {
      url.searchParams.delete(RESUMED_PARAM);
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);
  const [session] = useState(createApplicationSession);
  const [rateLimited, setRateLimited] = useState(false);
  const [renewal] = useState(() => createSessionRefresh(session, accessTokenExpiresAt, async () => {
    const result = await renewSession();
    setRateLimited(!result.ok && result.rateLimited === true);
    return result;
  }, sessionExpiresAt));
  const [context] = useState(() => ({
    session,
    ensureFresh: renewal.ensureFresh,
    runProtected: createProtectedRequest(session, renewal.ensureFresh),
  }));
  const status = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    let loggingOut = false;
    let expiring = false;
    let remoteLogout = false;
    const onLogout = () => {
      loggingOut = true;
      session.end();
    };
    const unsubscribe = session.subscribe(() => {
      if (session.getSnapshot() !== "ended" || loggingOut || expiring) return;
      expiring = true;
      if (!remoteLogout) broadcastLogout();
      // Next queues this after any in-flight refresh action. Cookie cleanup is
      // therefore last, even if that refresh has just written a replacement pair.
      startTransition(async () => { await expireSessionAction(); });
    });
    const stopListening = subscribeToLogout(() => {
      remoteLogout = true;
      session.end();
    });
    window.addEventListener(LOGOUT_EVENT, onLogout);
    return () => {
      unsubscribe();
      stopListening();
      window.removeEventListener(LOGOUT_EVENT, onLogout);
    };
  }, [session]);

  useEffect(() => { renewal.updateExpiry(accessTokenExpiresAt); }, [renewal, accessTokenExpiresAt]);
  useEffect(() => { renewal.updateSessionExpiry(sessionExpiresAt); }, [renewal, sessionExpiresAt]);
  useEffect(() => {
    const stop = renewal.start();
    const check = () => {
      if (document.visibilityState === "visible" && renewal.checkDeadline() && session.getSnapshot() !== "unavailable") void renewal.ensureFresh();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
    };
  }, [renewal, session]);

  return (
    <SessionContext.Provider value={context}>
      <BackgroundSettingsProvider>
        <div className="flex flex-1 flex-col" data-application-runtime data-session-status={status}>
          {status !== "ended" && (
            <MediaRuntime session={session} blocked={status === "unavailable"}>
              <div className="relative isolate flex flex-1 flex-col">
                {status !== "unavailable" && <ApplicationBackground />}
                {status !== "unavailable" && <ApplicationNavigation labels={navigationLabels} />}
                <div className={status === "unavailable" ? "hidden" : "relative z-10 flex flex-1 flex-col"} data-application-page>{children}</div>
                {status === "unavailable" && <SessionRecovery message={rateLimited ? footerLabels.rateLimited : footerLabels.unavailable} retryLabel={footerLabels.retry} retry={renewal.ensureFresh} />}
              </div>
              <div className="sticky bottom-0 z-20 mt-auto bg-background pb-[env(safe-area-inset-bottom)]" data-application-footer>
                <AudioPlayer />
                <SessionFooter accessTokenExpiresAt={accessTokenExpiresAt} sessionExpiresAt={sessionExpiresAt} status={status} labels={footerLabels} />
              </div>
            </MediaRuntime>
          )}
          {status === "ended" && <SessionFooter accessTokenExpiresAt={accessTokenExpiresAt} sessionExpiresAt={sessionExpiresAt} status={status} labels={footerLabels} />}
        </div>
      </BackgroundSettingsProvider>
    </SessionContext.Provider>
  );
}
