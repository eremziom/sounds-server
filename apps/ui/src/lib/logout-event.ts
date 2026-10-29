// Same document only. Cross-tab sign-out belongs to the next plan step.
export const LOGOUT_EVENT = "sounds:logout";

export function notifyLogout() {
  window.dispatchEvent(new Event(LOGOUT_EVENT));
}
