import {
  nativeEpicSetupComplete,
  type EpicReadyStatus,
} from "../../scripts/companion-epic-ready.mjs";

export { nativeEpicSetupComplete };
export interface EpicReadyState {
  status?: EpicReadyStatus;
  pending: boolean;
  error: string;
}

/** One controller per seat. Preserve native questions while the other groups
 * finish setup; a disposed seat cannot publish or start a later ready request. */
export function createEpicReadyGate(options: {
  read: () => Promise<EpicReadyStatus>;
  mark: () => Promise<EpicReadyStatus>;
  change: (state: EpicReadyState) => void;
}) {
  let disposed = false;
  let flight: Promise<void> | undefined;
  let state: EpicReadyState = { pending: false, error: "" };
  const publish = (next: EpicReadyState) => {
    state = next;
    if (!disposed) options.change(state);
  };
  return {
    refresh(game: unknown, retry = false): Promise<void> {
      if (disposed || state.status?.ready || (state.error && !retry)) return Promise.resolve();
      if (flight) return flight;
      const completed = nativeEpicSetupComplete(game);
      publish({ ...state, pending: true, error: "" });
      flight = Promise.resolve().then(async () => {
        try {
          let status = await options.read();
          if (disposed) return;
          if (completed && !status.ready && !status.groupReady) {
            status = await options.mark();
            if (disposed) return;
          }
          publish({ status, pending: false, error: "" });
        } catch (cause) {
          if (!disposed) publish({
            ...state,
            pending: false,
            error: cause instanceof Error ? cause.message : "Could not confirm this group's readiness.",
          });
        }
      });
      void flight.then(() => { flight = undefined; });
      return flight;
    },
    dispose() { disposed = true; },
  };
}
