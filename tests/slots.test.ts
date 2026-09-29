import test from "node:test";
import assert from "node:assert/strict";
import { createGame, reduceGame } from "./helpers";
import {
  SAVE_KEY,
  MAX_SLOTS,
  readSave,
  writeSave,
  listSaves,
  loadSave,
  deleteSave,
  setActiveSave,
  recordResult,
  readRecord,
} from "../src/game/storage";

// A minimal Web Storage shim for the Node test runner.
function installStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
  return store;
}

test("the legacy single save migrates into a slot and stays active", () => {
  const store = installStorage();
  const s = createGame("standard", 11, ["12004"]);
  store.set(SAVE_KEY, JSON.stringify(s));
  const restored = readSave();
  assert.equal(restored?.id, s.id);
  assert.equal(store.has(SAVE_KEY), false, "the legacy key is retired");
  assert.deepEqual(
    listSaves().map((v) => v.id),
    [s.id],
  );
  // A newer legacy write for the same investigation replaces the slot.
  const progressed = reduceGame(s, { type: "mulligan", ids: [] });
  store.set(SAVE_KEY, JSON.stringify(progressed));
  assert.equal(readSave()?.status, "playing");
  assert.equal(listSaves().length, 1);
});

test("several investigations keep separate slots, and a new game does not replace an old one", () => {
  installStorage();
  const first = createGame("easy", 21, ["12004"]);
  writeSave(first);
  const second = createGame("hard", 22, ["12001", "12007"]);
  writeSave(second);
  assert.equal(readSave()?.id, second.id, "the newest game is active");
  assert.equal(loadSave(first.id)?.id, first.id, "the older game is still stored");
  const summaries = listSaves();
  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries.find((v) => v.id === second.id)?.party, ["12001", "12007"]);
  setActiveSave(first.id);
  assert.equal(readSave()?.id, first.id);
  const progressed = reduceGame(first, { type: "mulligan", ids: [] });
  writeSave(progressed);
  assert.equal(listSaves().length, 2, "saving progress updates the same slot");
  deleteSave(first.id);
  assert.equal(loadSave(first.id), null);
  assert.equal(readSave(), null, "deleting the active slot leaves no active game");
  assert.equal(listSaves().length, 1);
});

test("the slot limit is enforced and finished games are recorded once", () => {
  installStorage();
  for (let i = 0; i < MAX_SLOTS; i++) writeSave(createGame("easy", 100 + i));
  assert.throws(() => writeSave(createGame("easy", 999)), /slots/);
  const s = createGame("easy", 100);
  s.status = "resolution";
  s.campaign.result = "saved";
  s.campaign.xp = 7;
  recordResult(s);
  recordResult(s);
  assert.equal(readRecord().length, 1);
  assert.equal(readRecord()[0].xp, 7);
});
