import { registerSW } from "virtual:pwa-register";
import { createPwaUpdateCoordinator } from "./game/pwaUpdate";

let available = false;
let updateWorker: (() => Promise<void>) | undefined;
const listeners = new Set<() => void>();

function announceUpdate() {
  available = true;
  listeners.forEach((listener) => listener());
}
const updates = createPwaUpdateCoordinator({
  activate: async () => {
    await updateWorker?.();
  },
  reload: () => window.location.reload(),
  announceUpdate,
});

export const getUpdateAvailable = () => available;
export const subscribeUpdate = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The guard saves current progress immediately before the eventual reload. */
export async function applyUpdate(beforeReload?: () => Promise<boolean>) {
  if (!available) return;
  await updates.applyUpdate(beforeReload);
}

export function registerOfflineShell() {
  updateWorker = registerSW({
    immediate: true,
    onNeedRefresh: announceUpdate,
    onNeedReload: updates.onNeedReload,
  });
}
