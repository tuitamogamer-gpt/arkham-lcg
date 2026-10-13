import type { GameState } from "./types";
import {
  SAVE_KEY,
  activeSaveId,
  deleteSave,
  recordResult,
  saveStorageRevision,
  setActiveSave,
  writeSave,
  type SaveSnapshot,
} from "./storage";

export {
  isSaveStorageKey,
  loadSaveSnapshot,
  readSaveSnapshot,
  type SaveSnapshot,
} from "./storage";

export class SaveConflictError extends Error {
  constructor() {
    super(
      "This investigation changed in another tab. Load its latest save or keep a separate copy.",
    );
    this.name = "SaveConflictError";
  }
}

// Every slot shares an index, so distinct investigations need the same lock.
// Modern secure browser contexts use Web Locks. The synchronous fallback
// still rejects observed stale copies, but cannot make localStorage writes
// across separate browsing contexts transactional.
const SAVE_LOCK = "arkham-chronicle:save-mutations";
function withSaveLock(operation: () => void): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.locks?.request)
    return navigator.locks.request(SAVE_LOCK, async () => operation());
  return Promise.resolve().then(operation);
}

export interface SaveSession {
  save(game: GameState): Promise<void>;
  delete(): Promise<void>;
  isCurrent(): boolean;
}

/** Capture a deletion confirmation even when its payload cannot be decoded. */
export function createSaveDeletion(id: string): Pick<SaveSession, "delete"> {
  const expected = saveStorageRevision(id);
  let deleted = false;
  return {
    delete: () =>
      withSaveLock(() => {
        if (deleted || saveStorageRevision(id) !== expected)
          throw new SaveConflictError();
        deleteSave(id);
        deleted = true;
      }),
  };
}

/** Owns the revision observed by one open investigation, never a live lookup. */
export function createSaveSession(snapshot: SaveSnapshot): SaveSession {
  const id = snapshot.game.id;
  let expected = snapshot.revision;
  let legacyRevision = snapshot.legacyRevision;
  let deleted = false;
  let pending: Promise<void> = Promise.resolve();

  const isCurrent = () =>
    !deleted &&
    saveStorageRevision(id) === expected &&
    (expected !== null ||
      legacyRevision === undefined ||
      localStorage.getItem(SAVE_KEY) === legacyRevision);
  const assertCurrent = () => {
    if (!isCurrent()) throw new SaveConflictError();
  };
  const serialize = (operation: () => void) => {
    const result = pending.then(() => withSaveLock(operation));
    // A failed save must not poison retry or later queued operations.
    pending = result.catch(() => {});
    return result;
  };
  const retireLegacy = () => {
    if (legacyRevision === undefined) return;
    // Cleanup is optional. Never remove a newer legacy write, or report a
    // successfully persisted investigation as failed due to old-key cleanup.
    try {
      if (localStorage.getItem(SAVE_KEY) === legacyRevision)
        localStorage.removeItem(SAVE_KEY);
      legacyRevision = undefined;
    } catch {
      /* A valid modern slot takes precedence on the next load. */
    }
  };

  return {
    isCurrent,
    save(game) {
      // Capture bytes now: a queued write must represent this exact request,
      // even if a caller mutates its object while waiting for another tab.
      if (game.id !== id)
        return Promise.reject(
          new Error("A save session belongs to one investigation."),
        );
      const payload = JSON.stringify(game);
      return serialize(() => {
        assertCurrent();
        const saved = JSON.parse(payload) as GameState;
        if (payload !== expected) {
          writeSave(saved);
          // Record history is a separate write. A failure there must leave
          // the new revision known so retry can finish history idempotently.
          expected = payload;
        } else if (activeSaveId() !== id) {
          setActiveSave(id);
        }
        retireLegacy();
        recordResult(saved);
      });
    },
    delete() {
      return serialize(() => {
        assertCurrent();
        deleteSave(id);
        deleted = true;
      });
    },
  };
}
