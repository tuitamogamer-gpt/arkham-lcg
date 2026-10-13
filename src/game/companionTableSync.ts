import { createCompanionSync } from "./companionSync";

export type CompanionConnectionStatus =
  | "connecting"
  | "updating"
  | "confirming"
  | "confirmed"
  | "disconnected"
  | "unconfirmed";

/** A response can be lost after the companion accepts an action. Keep the
 * displayed decision locked until a full read establishes the current table.
 * A successful read confirms that table, not durable storage on the device. */
export function createCompanionTableSync<T>(options: {
  readStep: () => Promise<{ step: number }>;
  readGame: () => Promise<T>;
  change: (game: T) => void;
  error: (cause: unknown, operation: "load" | "poll" | "action") => void;
  status: (status: CompanionConnectionStatus) => void;
}) {
  let status: CompanionConnectionStatus = "connecting";
  let disposed = false;
  const update = (next: CompanionConnectionStatus) => {
    if (disposed) return;
    status = next;
    options.status(next);
  };
  const sync = createCompanionSync({
    readStep: options.readStep,
    readGame: options.readGame,
    change: (game) => {
      options.change(game);
      update("confirmed");
    },
    error: (cause, operation) => {
      update(
        operation === "action" || status === "unconfirmed"
          ? "unconfirmed"
          : "disconnected",
      );
      options.error(cause, operation);
    },
    busy: (busy) => {
      if (busy) update("updating");
    },
  });
  return {
    get status() {
      return status;
    },
    refresh: () => sync.refresh(),
    // After an error, an unchanged revision is insufficient: the full table
    // must be read before stale choices become interactive again.
    poll: () => (status === "confirmed" ? sync.poll() : sync.refresh()),
    async perform(action: () => Promise<unknown>) {
      if (disposed) return;
      if (status !== "confirmed")
        throw new Error(
          "Wait for the latest table to be confirmed before choosing again.",
        );
      await sync.perform(async () => {
        const result = await action();
        update("confirming");
        return result;
      });
    },
    dispose() {
      disposed = true;
      sync.dispose();
    },
  };
}
