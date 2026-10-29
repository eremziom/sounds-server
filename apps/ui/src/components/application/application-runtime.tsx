"use client";

import {
  createContext, startTransition, useContext, useEffect, useState, useSyncExternalStore,
  type ReactNode,
} from "react";
import { createApplicationSession, type ApplicationSession } from "../../lib/application-session";
import { MediaRuntime } from "./media-runtime";
import { refreshAction } from "../../app/(auth)/actions";
import { createSessionRefresh, type RefreshResult } from "../../lib/session-refresh";
import { SessionFooter, type SessionFooterLabels } from "./session-footer";
import { createProtectedRequest } from "../../lib/protected-request";
import { ApplicationNavigation } from "./application-navigation";

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
  return { status, renew: session.renew, end: session.end, ensureFresh, runProtected };
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
export function ApplicationRuntime({ children, accessTokenExpiresAt, footerLabels, adminLabel }: {
  children: ReactNode;
  accessTokenExpiresAt: number | null;
  footerLabels: SessionFooterLabels;
  adminLabel: string;
}) {
  const [session] = useState(createApplicationSession);
  const [renewal] = useState(() => createSessionRefresh(session, accessTokenExpiresAt, renewSession));
  const [context] = useState(() => ({
    session,
    ensureFresh: renewal.ensureFresh,
    runProtected: createProtectedRequest(session, renewal.ensureFresh),
  }));
  const status = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => { renewal.updateExpiry(accessTokenExpiresAt); }, [renewal, accessTokenExpiresAt]);
  useEffect(() => {
    const stop = renewal.start();
    const check = () => {
      if (document.visibilityState === "visible") void renewal.ensureFresh();
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
  }, [renewal]);

  return (
    <SessionContext.Provider value={context}>
      <div className="flex flex-1 flex-col" data-application-runtime data-session-status={status}>
        {status !== "ended" && (
          <MediaRuntime session={session}>
            <ApplicationNavigation adminLabel={adminLabel} />
            <div className="flex flex-1 flex-col" data-application-page>{children}</div>
          </MediaRuntime>
        )}
        <SessionFooter accessTokenExpiresAt={accessTokenExpiresAt} status={status} labels={footerLabels} />
      </div>
    </SessionContext.Provider>
  );
}
