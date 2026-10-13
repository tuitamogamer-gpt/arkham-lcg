/** Worker activation can happen well after its update request has returned.
 * Save at the actual reload boundary, using the latest state from the caller. */
export function createPwaUpdateCoordinator(options: {
  activate: () => Promise<void>;
  reload: () => void;
  announceUpdate: () => void;
}) {
  let requested = false;
  let switched = false;
  let activating = false;
  let beforeReload: () => Promise<boolean> = async () => true;
  let reloadAttempt: Promise<void> | undefined;

  const cancelReload = () => {
    requested = false;
    options.announceUpdate();
  };
  const reloadWhenReady = (): Promise<void> => {
    if (reloadAttempt) return reloadAttempt;
    if (!requested || !switched) return Promise.resolve();
    const attempt = Promise.resolve().then(async () => {
      try {
        if (await beforeReload()) {
          requested = false;
          options.reload();
        } else cancelReload();
      } catch {
        cancelReload();
      } finally {
        if (reloadAttempt === attempt) reloadAttempt = undefined;
      }
    });
    reloadAttempt = attempt;
    return attempt;
  };

  return {
    async applyUpdate(guard: () => Promise<boolean> = async () => true) {
      if (requested) return reloadAttempt;
      requested = true;
      beforeReload = guard;
      if (!switched) {
        activating = true;
        try {
          await options.activate();
        } catch (error) {
          cancelReload();
          throw error;
        } finally {
          activating = false;
        }
      }
      await reloadWhenReady();
    },
    onNeedReload() {
      switched = true;
      // An external tab may activate the worker. This tab still chooses when
      // to save and reload; an in-flight activation finishes before saving.
      if (!requested) options.announceUpdate();
      else if (!activating) void reloadWhenReady();
    },
  };
}
