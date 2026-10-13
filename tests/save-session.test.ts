import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createGame, reduceGame } from "./helpers";
import {
  SAVE_KEY,
  activeSaveId,
  listSaves,
  loadSave,
  loadSaveSnapshot,
  readRecord,
  readSaveSnapshot,
  writeSave,
} from "../src/game/storage";
import {
  createSaveDeletion,
  createSaveSession,
  isSaveStorageKey,
  SaveConflictError,
} from "../src/game/saveSession";

function installStorage(t: TestContext, locks?: Pick<LockManager, "request">) {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { locks },
  });
  t.after(() => {
    if (navigatorDescriptor)
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  });
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
  return store;
}
const slot = (id: string) => `arkham-chronicle:save:${id}`;
const activeGame = (seed: number) =>
  reduceGame(createGame("standard", seed), { type: "mulligan", ids: [] });

test("a snapshot binds the decoded game to the exact single payload read", (t) => {
  const store = installStorage(t);
  const original = createGame("standard", 801);
  const progressed = activeGame(801);
  const raw = JSON.stringify(original, null, 2);
  store.set(slot(original.id), raw);
  let reads = 0;
  localStorage.getItem = (key) => {
    const value = store.get(key) ?? null;
    if (key === slot(original.id)) {
      reads++;
      store.set(key, JSON.stringify(progressed));
    }
    return value;
  };
  const snapshot = loadSaveSnapshot(original.id)!;
  assert.equal(reads, 1);
  assert.equal(snapshot.game.status, "mulligan");
  assert.equal(snapshot.revision, raw);
  assert.equal(createSaveSession(snapshot).isCurrent(), false);
});

test("a stale session cannot overwrite or delete another tab's later progress", async (t) => {
  const store = installStorage(t);
  const initial = createGame("standard", 802);
  writeSave(initial);
  const snapshot = loadSaveSnapshot(initial.id)!;
  const first = createSaveSession(snapshot);
  const second = createSaveSession(snapshot);
  await first.save(activeGame(802));
  const newer = new Map(store);
  assert.equal(first.isCurrent(), true);
  assert.equal(second.isCurrent(), false);
  await assert.rejects(second.save(initial), SaveConflictError);
  await assert.rejects(second.delete(), SaveConflictError);
  assert.deepEqual(store, newer);
  assert.equal(loadSave(initial.id)?.status, "playing");
});

test("global Web Locks serialize competing sessions and distinct-slot index publications", async (t) => {
  const names: string[] = [];
  let tail = Promise.resolve();
  const locks = {
    request(name: string, callback: () => void) {
      names.push(name);
      const run = tail.then(callback);
      tail = run.catch(() => {});
      return run;
    },
  } as Pick<LockManager, "request">;
  installStorage(t, locks);
  const original = createGame("standard", 803);
  writeSave(original);
  const snapshot = loadSaveSnapshot(original.id)!;
  const first = createSaveSession(snapshot);
  const second = createSaveSession(snapshot);
  const result = await Promise.allSettled([
    first.save(activeGame(803)),
    second.save({ ...original, round: 2 }),
  ]);
  assert.equal(result[0].status, "fulfilled");
  assert.equal(result[1].status, "rejected");
  if (result[1].status === "rejected")
    assert.ok(result[1].reason instanceof SaveConflictError);
  const third = createGame("easy", 804);
  const fourth = createGame("hard", 805);
  await Promise.all([
    createSaveSession({ game: third, revision: null }).save(third),
    createSaveSession({ game: fourth, revision: null }).save(fourth),
  ]);
  assert.deepEqual(
    new Set(listSaves().map((s) => s.id)),
    new Set([original.id, third.id, fourth.id]),
  );
  assert.equal(names.length, 4);
  assert.equal(new Set(names).size, 1, "all slots share the index lock");
});

test("one session queues exact requested states and advances its own revision", async (t) => {
  installStorage(t);
  const initial = createGame("easy", 806);
  const session = createSaveSession({ game: initial, revision: null });
  const next = activeGame(806);
  const first = session.save(initial);
  const second = session.save(next);
  next.round = 99;
  await Promise.all([first, second]);
  assert.equal(loadSave(initial.id)?.status, "playing");
  assert.equal(
    loadSave(initial.id)?.round,
    1,
    "later caller mutations are not saved",
  );
  assert.equal(session.isCurrent(), true);
  await assert.rejects(
    session.save(createGame("easy", 807)),
    /one investigation/,
  );
  assert.equal(loadSave("case-807"), null);
});

test("unchanged saves preserve payload and recency while opening another slot updates active", async (t) => {
  installStorage(t);
  const first = createGame("easy", 808);
  const second = createGame("easy", 809);
  writeSave(first);
  writeSave(second);
  const summary = listSaves().find((s) => s.id === first.id);
  const writes: string[] = [];
  const originalSet = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    writes.push(key);
    originalSet(key, value);
  };
  const snapshot = loadSaveSnapshot(first.id)!;
  const session = createSaveSession(snapshot);
  await session.save(snapshot.game);
  assert.equal(activeSaveId(), first.id);
  assert.deepEqual(writes, ["arkham-chronicle:saves"]);
  assert.deepEqual(
    listSaves().find((s) => s.id === first.id),
    summary,
  );
  writes.length = 0;
  await session.save(snapshot.game);
  assert.deepEqual(writes, []);
});

test("a history-only failure can retry the saved revision and records the result once", async (t) => {
  installStorage(t);
  const initial = activeGame(810);
  writeSave(initial);
  const session = createSaveSession(loadSaveSnapshot(initial.id)!);
  const resolved = structuredClone(initial);
  resolved.status = "resolution";
  resolved.campaign.result = "saved";
  resolved.campaign.xp = 4;
  let failHistory = true;
  let payloadWrites = 0;
  const originalSet = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === slot(initial.id)) payloadWrites++;
    if (key === "arkham-chronicle:record" && failHistory)
      throw new Error("history quota");
    originalSet(key, value);
  };
  await assert.rejects(session.save(resolved), /history quota/);
  assert.equal(session.isCurrent(), true);
  assert.equal(loadSave(initial.id)?.status, "resolution");
  failHistory = false;
  await session.save(resolved);
  await session.save(resolved);
  assert.equal(payloadWrites, 1);
  assert.equal(readRecord().length, 1);
  assert.equal(readRecord()[0].xp, 4);
});

test("failed index publication retains the original revision and retry succeeds", async (t) => {
  const store = installStorage(t);
  const original = createGame("standard", 811);
  writeSave(original);
  const before = new Map(store);
  const session = createSaveSession(loadSaveSnapshot(original.id)!);
  const originalSet = localStorage.setItem;
  let fail = true;
  localStorage.setItem = (key, value) => {
    if (fail && key === "arkham-chronicle:saves") throw new Error("quota");
    originalSet(key, value);
  };
  await assert.rejects(session.save(activeGame(811)), /quota/);
  assert.deepEqual(store, before);
  assert.equal(session.isCurrent(), true);
  fail = false;
  await session.save(activeGame(811));
  assert.equal(loadSave(original.id)?.status, "playing");
});

test("removed and corrupt payloads are conflicts, and deletion cannot resurrect its session", async (t) => {
  const store = installStorage(t);
  const original = createGame("standard", 812);
  writeSave(original);
  const stale = createSaveSession(loadSaveSnapshot(original.id)!);
  store.delete(slot(original.id));
  await assert.rejects(stale.save(activeGame(812)), SaveConflictError);
  assert.equal(store.has(slot(original.id)), false);
  const fresh = createSaveSession({ game: original, revision: null });
  store.set(slot(original.id), "broken");
  await assert.rejects(fresh.save(original), SaveConflictError);
  assert.equal(store.get(slot(original.id)), "broken");
  writeSave(original);
  const deleting = createSaveSession(loadSaveSnapshot(original.id)!);
  await deleting.delete();
  await assert.rejects(deleting.save(original), SaveConflictError);
  assert.equal(store.has(slot(original.id)), false);
});

test("legacy loading is read-only, valid current progress wins, and migration retires only its source", async (t) => {
  const store = installStorage(t);
  const legacy = createGame("standard", 813);
  store.set(SAVE_KEY, JSON.stringify(legacy));
  const before = new Map(store);
  const snapshot = readSaveSnapshot()!;
  assert.equal(snapshot.revision, null);
  assert.deepEqual(store, before);
  const session = createSaveSession(snapshot);
  const replacement = JSON.stringify(createGame("hard", 814));
  store.set(SAVE_KEY, replacement);
  await assert.rejects(session.save(activeGame(813)), SaveConflictError);
  assert.equal(
    store.has(slot(legacy.id)),
    false,
    "a stale migration cannot publish a modern slot",
  );
  assert.equal(
    store.get(SAVE_KEY),
    replacement,
    "a new legacy write is not removed",
  );
  store.set(SAVE_KEY, JSON.stringify(legacy));
  await session.save(activeGame(813));
  assert.equal(
    store.has(SAVE_KEY),
    false,
    "successful migration retires its exact source",
  );
  store.set(SAVE_KEY, JSON.stringify(legacy));
  const current = readSaveSnapshot()!;
  assert.equal(current.game.status, "playing");
  assert.equal(current.revision, store.get(slot(legacy.id)));
  assert.equal(
    store.get(SAVE_KEY),
    JSON.stringify(legacy),
    "divergent legacy bytes are preserved",
  );
  const other = createGame("easy", 815);
  writeSave(other);
  assert.equal(
    readSaveSnapshot()?.game.id,
    other.id,
    "stale legacy cannot reactivate an old case",
  );
});

test("legacy migration retires its source once the primary is durable even if history fails", async (t) => {
  const store = installStorage(t);
  const resolved = activeGame(820);
  resolved.status = "resolution";
  resolved.campaign.result = "saved";
  store.set(SAVE_KEY, JSON.stringify(resolved));
  const session = createSaveSession(readSaveSnapshot()!);
  const originalSet = localStorage.setItem;
  let fail = true;
  localStorage.setItem = (key, value) => {
    if (fail && key === "arkham-chronicle:record")
      throw new Error("history unavailable");
    originalSet(key, value);
  };
  await assert.rejects(session.save(resolved), /history unavailable/);
  assert.equal(store.has(SAVE_KEY), false);
  assert.equal(loadSave(resolved.id)?.status, "resolution");
  assert.equal(session.isCurrent(), true);
  fail = false;
  await session.save(resolved);
  assert.equal(readRecord().length, 1);
});

test("storage notifications include clear and save keys but ignore preferences and other apps", () => {
  for (const key of [
    null,
    SAVE_KEY,
    "arkham-chronicle:saves",
    "arkham-chronicle:record",
    "arkham-chronicle:save:case-1",
  ])
    assert.equal(isSaveStorageKey(key), true);
  for (const key of [
    "arkham-chronicle:tempo",
    "arkham-chronicle:tutorial",
    "another-app",
    "",
  ])
    assert.equal(isSaveStorageKey(key), false);
});

test("a valid legacy fallback cannot overwrite unreadable modern bytes", async (t) => {
  const store = installStorage(t);
  const legacy = createGame("standard", 816);
  store.set(SAVE_KEY, JSON.stringify(legacy));
  store.set(slot(legacy.id), "unreadable modern save");
  const before = new Map(store);
  const snapshot = readSaveSnapshot()!;
  assert.equal(
    snapshot.game.id,
    legacy.id,
    "legacy remains available to export",
  );
  assert.equal(snapshot.revision, null);
  const session = createSaveSession(snapshot);
  assert.equal(session.isCurrent(), false);
  await assert.rejects(session.save(snapshot.game), SaveConflictError);
  assert.deepEqual(store, before);
});

test("explicit deletion removes the matching old-format case so it cannot reactivate", async (t) => {
  const store = installStorage(t);
  const legacy = createGame("standard", 817);
  writeSave(activeGame(817));
  store.set(SAVE_KEY, JSON.stringify(legacy));
  await createSaveSession(loadSaveSnapshot(legacy.id)!).delete();
  assert.equal(store.has(SAVE_KEY), false);
  assert.equal(readSaveSnapshot(), null);

  writeSave(activeGame(817));
  const foreign = JSON.stringify(createGame("easy", 818));
  for (const raw of [foreign, "unreadable legacy save"]) {
    store.set(SAVE_KEY, raw);
    await createSaveSession(loadSaveSnapshot(legacy.id)!).delete();
    assert.equal(
      store.get(SAVE_KEY),
      raw,
      "unrelated or unreadable sources are preserved",
    );
    writeSave(activeGame(817));
  }
});

test("failed legacy removal restores both investigation copies and the exact index", async (t) => {
  const store = installStorage(t);
  const legacy = createGame("standard", 819);
  writeSave(activeGame(819));
  store.set(SAVE_KEY, JSON.stringify(legacy));
  const before = new Map(store);
  const session = createSaveSession(loadSaveSnapshot(legacy.id)!);
  const originalRemove = localStorage.removeItem;
  let fail = true;
  localStorage.removeItem = (key) => {
    if (fail && key === SAVE_KEY) throw new Error("legacy removal unavailable");
    originalRemove(key);
  };
  await assert.rejects(session.delete(), /legacy removal unavailable/);
  assert.deepEqual(store, before);
  assert.equal(session.isCurrent(), true);
  fail = false;
  await session.delete();
  assert.equal(readSaveSnapshot(), null);
});

test("explicit deletion can remove corrupt or missing payload slots without decoding them", async (t) => {
  const store = installStorage(t);
  const original = createGame("standard", 821);
  for (const raw of ["corrupt save", null]) {
    writeSave(original);
    if (raw === null) store.delete(slot(original.id));
    else store.set(slot(original.id), raw);
    assert.equal(loadSaveSnapshot(original.id), null);
    assert.equal(
      listSaves().length,
      1,
      "indexed case remains available to delete",
    );
    await createSaveDeletion(original.id).delete();
    assert.equal(listSaves().length, 0);
    assert.equal(store.has(slot(original.id)), false);
    assert.equal(activeSaveId(), null);
  }
});

test("a confirmed deletion of damaged data cannot delete a subsequently repaired save", async (t) => {
  const store = installStorage(t);
  const original = createGame("standard", 822);
  for (const raw of ["corrupt save", null]) {
    writeSave(original);
    if (raw === null) store.delete(slot(original.id));
    else store.set(slot(original.id), raw);
    const confirmed = createSaveDeletion(original.id);
    writeSave(activeGame(822));
    const repaired = new Map(store);
    await assert.rejects(confirmed.delete(), SaveConflictError);
    assert.deepEqual(store, repaired);
  }
});
