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
  assert.equal(
    loadSave(first.id)?.id,
    first.id,
    "the older game is still stored",
  );
  const summaries = listSaves();
  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries.find((v) => v.id === second.id)?.party, [
    "12001",
    "12007",
  ]);
  setActiveSave(first.id);
  assert.equal(readSave()?.id, first.id);
  const progressed = reduceGame(first, { type: "mulligan", ids: [] });
  writeSave(progressed);
  assert.equal(listSaves().length, 2, "saving progress updates the same slot");
  deleteSave(first.id);
  assert.equal(loadSave(first.id), null);
  assert.equal(
    readSave(),
    null,
    "deleting the active slot leaves no active game",
  );
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

test("damaged save summaries recover from their investigation and keep healthy slots", () => {
  const store = installStorage();
  const first = createGame("easy", 301);
  const second = createGame("hard", 302, ["12001", "12007"]);
  writeSave(first);
  writeSave(second);
  const key = "arkham-chronicle:saves";
  const index = JSON.parse(store.get(key)!);
  delete index.slots[0].party;
  index.slots[0].updatedAt = "broken date";
  index.slots.push({ id: "missing", updatedAt: "broken" });
  index.slots.push(index.slots[1]);
  store.set(key, JSON.stringify(index));
  const saves = listSaves();
  assert.equal(saves.length, 2);
  assert.deepEqual(
    saves.find((v) => v.id === first.id)?.party,
    first.partyOrder,
  );
  assert.equal(readSave()?.id, second.id);
});

test("invalid legacy data does not hide an active investigation", () => {
  const store = installStorage();
  const s = createGame("standard", 303);
  writeSave(s);
  for (const malformed of ["{", "{}"]) {
    store.set(SAVE_KEY, malformed);
    assert.equal(readSave()?.id, s.id);
  }
});

test("a legacy investigation remains resumable when migration cannot add a slot", () => {
  const store = installStorage();
  for (let i = 0; i < MAX_SLOTS; i++) writeSave(createGame("easy", 400 + i));
  const legacy = createGame("expert", 499);
  store.set(SAVE_KEY, JSON.stringify(legacy));
  assert.equal(readSave()?.id, legacy.id);
  assert.equal(listSaves().length, MAX_SLOTS);
  assert.equal(
    store.has(SAVE_KEY),
    true,
    "failed migration preserves its source",
  );
  deleteSave(listSaves()[0].id);
  assert.equal(readSave()?.id, legacy.id);
  assert.equal(
    store.has(SAVE_KEY),
    false,
    "migration retries when space is available",
  );
  assert.equal(listSaves().length, MAX_SLOTS);
});

test("an index write failure restores the prior payload and active investigation", () => {
  const store = installStorage();
  const original = createGame("standard", 501);
  writeSave(original);
  const originalSet = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === "arkham-chronicle:saves") throw new Error("quota");
    originalSet(key, value);
  };
  const progressed = reduceGame(original, { type: "mulligan", ids: [] });
  assert.throws(() => writeSave(progressed), /quota/);
  assert.equal(loadSave(original.id)?.status, "mulligan");
  const imported = createGame("easy", 502);
  assert.throws(() => writeSave(imported), /quota/);
  assert.equal(store.has(`arkham-chronicle:save:${imported.id}`), false);
  assert.equal(readSave()?.id, original.id);
});

test("a payload from a different slot and malformed result history fail closed", () => {
  const store = installStorage();
  const first = createGame("standard", 601);
  const second = createGame("easy", 602);
  writeSave(first);
  store.set(`arkham-chronicle:save:${first.id}`, JSON.stringify(second));
  assert.equal(loadSave(first.id), null);
  first.status = "resolution";
  first.campaign.result = "saved";
  recordResult(first);
  const key = "arkham-chronicle:record";
  const entries = JSON.parse(store.get(key)!);
  entries.push({ id: "broken", result: "saved" });
  store.set(key, JSON.stringify(entries));
  assert.equal(readRecord().length, 1);
  assert.deepEqual(readRecord()[0].party, first.partyOrder);
});
