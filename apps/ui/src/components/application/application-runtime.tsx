"use client";

import {
  createContext, useContext, useState, useSyncExternalStore,
  type ReactNode,
} from "react";
import { createApplicationSession, type ApplicationSession } from "../../lib/application-session";
import { MediaRuntime } from "./media-runtime";

const SessionContext = createContext<ApplicationSession | null>(null);

export function useApplicationSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Application session requires the protected application layout");
  const status = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { status, renew: session.renew, end: session.end };
}

// Mounted once per authenticated account, outside page loading/error boundaries.
// No token, pathname or locale is part of this component's identity.
export function ApplicationRuntime({ children }: { children: ReactNode }) {
  const [session] = useState(createApplicationSession);
  const status = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  return (
    <SessionContext.Provider value={session}>
      <div className="flex flex-1 flex-col" data-application-runtime data-session-status={status}>
        {status !== "ended" && (
          <MediaRuntime session={session}>
            <div className="flex flex-1 flex-col" data-application-page>{children}</div>
          </MediaRuntime>
        )}
      </div>
    </SessionContext.Provider>
  );
}
