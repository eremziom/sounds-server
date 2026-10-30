export type ApplicationSessionStatus = "active" | "refreshing" | "unavailable" | "ended";

// One mounted application's UI lifecycle. This is NOT the server-side refresh
// coordinator: a renewal callback must use that coordinator before rotating tokens.
export function createApplicationSession() {
  let status: ApplicationSessionStatus = "active";
  let pending: Promise<boolean> | undefined;
  const listeners = new Set<() => void>();

  function publish(next: ApplicationSessionStatus) {
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    end() {
      publish("ended");
    },
    renew(renewal: () => Promise<boolean | "unavailable">): Promise<boolean> {
      if (status === "ended") return Promise.resolve(false);
      if (pending) return pending;
      // Defer invocation so synchronous callbacks cannot race assignment of pending.
      pending = Promise.resolve().then(() => status === "ended" ? false : renewal()).then(
        (confirmed) => {
          if (status === "ended") return false;
          publish(confirmed === true ? "active" : confirmed === "unavailable" ? "unavailable" : "ended");
          return confirmed === true;
        },
        () => {
          if (status !== "ended") publish("unavailable");
          return false;
        },
      ).finally(() => { pending = undefined; });
      // A recovery attempt keeps the protected UI blocked until confirmed.
      if (status !== "unavailable") publish("refreshing");
      return pending;
    },
  };
}

export type ApplicationSession = ReturnType<typeof createApplicationSession>;
