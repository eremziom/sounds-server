export type ApplicationSessionStatus = "active" | "refreshing" | "ended";

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
    renew(renewal: () => Promise<boolean>): Promise<boolean> {
      if (status === "ended") return Promise.resolve(false);
      if (pending) return pending;
      // Defer invocation so synchronous callbacks cannot race assignment of pending.
      pending = Promise.resolve().then(() => status === "ended" ? false : renewal()).then(
        (confirmed) => {
          if (status === "ended") return false;
          publish(confirmed ? "active" : "ended");
          return confirmed;
        },
        () => {
          publish("ended");
          return false;
        },
      ).finally(() => { pending = undefined; });
      publish("refreshing");
      return pending;
    },
  };
}

export type ApplicationSession = ReturnType<typeof createApplicationSession>;
