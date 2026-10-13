/** A single seat's reads share one flight. Choices supersede those reads, and
 * only the resulting authoritative reload may publish after a choice starts. */
export function createCompanionSync<T>(options: {
  readStep: () => Promise<{ step: number }>;
  readGame: () => Promise<T>;
  change: (game: T) => void;
  error: (cause: unknown, operation: "load" | "poll" | "action") => void;
  busy: (busy: boolean) => void;
}) {
  let disposed = false;
  let generation = 0;
  let step = -1;
  let acting = false;
  let flight: Promise<void> | undefined;
  const current = (version: number) => !disposed && version === generation;

  const read = async (version: number) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await options.readStep();
      if (!current(version)) return;
      const raw = await options.readGame();
      if (!current(version)) return;
      const after = await options.readStep();
      if (!current(version)) return;
      if (before.step !== after.step && attempt < 2) continue;
      // Retain the earlier revision if another seat changed the final read,
      // so the next poll still detects that newer revision.
      step = before.step;
      options.change(raw);
      return;
    }
  };

  const refresh = (checkStep: boolean): Promise<void> => {
    if (disposed || acting) return Promise.resolve();
    if (flight) return flight;
    const version = generation;
    const pending = Promise.resolve().then(async () => {
      try {
        if (!current(version)) return;
        if (checkStep) {
          const latest = await options.readStep();
          if (!current(version) || latest.step === step) return;
        }
        await read(version);
      } catch (cause) {
        if (current(version)) options.error(cause, checkStep ? "poll" : "load");
      } finally {
        if (flight === pending) flight = undefined;
      }
    });
    flight = pending;
    return pending;
  };

  return {
    refresh: () => refresh(false),
    poll: () => refresh(true),
    async perform(action: () => Promise<unknown>) {
      if (disposed || acting) return;
      acting = true;
      const version = ++generation;
      // A slow, obsolete read must neither block this choice's reload nor
      // clear a newer read's flight when its own request eventually settles.
      flight = undefined;
      options.busy(true);
      try {
        await action();
        if (current(version)) await read(version);
      } catch (cause) {
        if (current(version)) options.error(cause, "action");
        throw cause;
      } finally {
        acting = false;
        if (current(version)) options.busy(false);
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
