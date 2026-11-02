// One active editor. No credentials or draft data are stored here.
let blocker: (() => Promise<boolean>) | undefined;
let dirty: (() => boolean) | undefined;
export function registerNavigationBlocker(confirm: () => Promise<boolean>, isDirty = () => true) {
  blocker = confirm;
  dirty = isDirty;
  return () => { if (blocker === confirm) { blocker = undefined; dirty = undefined; } };
}
export function hasNavigationBlocker() { return !!blocker && dirty?.() === true; }
export function confirmNavigation() { return hasNavigationBlocker() ? blocker!() : Promise.resolve(true); }
