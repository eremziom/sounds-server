export const LOGOUT_EVENT = "sounds:logout";
const LOGOUT_CHANNEL = "sounds:auth";
let logoutRequested = false;

export function notifyLogout() {
  logoutRequested = true;
  window.dispatchEvent(new Event(LOGOUT_EVENT));
}

function openChannel() {
  try { return new BroadcastChannel(LOGOUT_CHANNEL); }
  catch { return null; } // Local sign-out still works if the browser disables it.
}

export function broadcastLogout() {
  const channel = openChannel();
  if (!channel) return;
  try { channel.postMessage("logout"); }
  finally { channel.close(); }
}

// Called after the logout action cleared cookies. A plain visit/reload of the
// result page must not sign out a newer session in another tab.
export function completeLogout() {
  if (!logoutRequested) return;
  logoutRequested = false;
  broadcastLogout();
}

export function subscribeToLogout(onLogout: () => void) {
  const channel = openChannel();
  if (!channel) return () => {};
  channel.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (data === "logout") onLogout();
  };
  return () => channel.close();
}
