import { registerSW } from "virtual:pwa-register";

let available = false;
let requested = false;
let switched = false;
let updateWorker: (() => Promise<void>) | undefined;
const listeners = new Set<() => void>();

function announceUpdate() {
  available = true;
  listeners.forEach((listener) => listener());
}

export const getUpdateAvailable = () => available;
export const subscribeUpdate = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The caller saves the current investigation before explicitly reloading. */
export async function applyUpdate() {
  if (!available) return;
  requested = true;
  if (switched) window.location.reload();
  else await updateWorker?.();
}

export function registerOfflineShell() {
  updateWorker = registerSW({
    immediate: true,
    onNeedRefresh: announceUpdate,
    onNeedReload() {
      switched = true;
      // Another open tab can activate the waiting worker. Keep this table
      // running until its player chooses to save and refresh as well.
      if (requested) window.location.reload();
      else announceUpdate();
    },
  });
}
