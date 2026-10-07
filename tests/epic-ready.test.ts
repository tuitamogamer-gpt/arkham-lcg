import test from "node:test";
import assert from "node:assert/strict";
import {
  companionEpicReady,
  epicReadyStatus,
  nativeEpicSetupComplete,
  type EpicReadyStatus,
} from "../scripts/companion-epic-ready.mjs";
import { createEpicReadyGate, type EpicReadyState } from "../src/game/epicReady";

const seat = { gameId: "past-game", eventId: "shared-event", ordinal: 0 };
const game = () => ({
  id: seat.gameId,
  gameState: { tag: "IsActive" },
  phase: "InvestigationPhase",
  inSetup: false,
  mode: { That: { started: true } },
  question: { player: { tag: "WindowChooseOne", choices: [
    { tag: "AbilityLabel", ability: { cardCode: "c87005b", type: { tag: "FastAbility'" } } },
    { tag: "SkipTriggersButton" },
  ] } },
});
const event = (mask = 0, started = 0) => ({
  id: seat.eventId,
  groups: [0, 1, 2].map((ordinal) => ({
    ordinal,
    gameId: ordinal === 0 ? seat.gameId : `game-${ordinal}`,
  })),
  sharedState: { sharedCounters: { "groups-ready-mask": mask, "timer-started-at": started } },
});
const status = (mask = 0, started = 0) => epicReadyStatus(event(mask, started), seat);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("Epic readiness starts at completed native setup before the first player window", () => {
  const saved = game(), before = structuredClone(saved);
  assert.equal(nativeEpicSetupComplete({ game: saved }), true);
  assert.deepEqual(saved, before, "Readiness must preserve the native optional fast question.");
  for (const changed of [
    { ...saved, inSetup: true },
    { ...saved, phase: "UpkeepPhase" },
    { ...saved, gameState: { tag: "IsOver" } },
    { ...saved, mode: { That: { started: false } } },
  ]) assert.equal(nativeEpicSetupComplete(changed), false);
});

test("the seat-ready proxy refuses missing or foreign game seats before native requests", async () => {
  let calls = 0;
  const engine = async () => { calls++; return {}; };
  for (const [bound, gameId] of [[null, seat.gameId], [seat, "future-game"]] as const) {
    await assert.rejects(companionEpicReady(bound, gameId, "POST", engine), { status: 403 });
  }
  assert.equal(calls, 0);
});

test("the ready proxy uses only its persisted seat's event and completed native game", async () => {
  const calls: { path: string; method: string }[] = [];
  let marked = false;
  const result = await companionEpicReady(seat, seat.gameId, "POST", async (path, _body, method) => {
    calls.push({ path, method });
    if (path === `arkham/games/${seat.gameId}`) return { game: game() };
    if (method === "POST") { marked = true; return undefined; }
    return event(marked ? 1 : 0);
  });
  assert.deepEqual(calls, [
    { path: "arkham/events/shared-event", method: "GET" },
    { path: "arkham/games/past-game", method: "GET" },
    { path: "arkham/events/shared-event/ready", method: "POST" },
    { path: "arkham/events/shared-event", method: "GET" },
  ]);
  assert.equal(result.groupReady, true);
  assert.equal(result.ready, false);
});

test("unfinished setup and a mismatched event cannot mark an Epic group ready", async () => {
  let mutations = 0;
  await assert.rejects(companionEpicReady(seat, seat.gameId, "POST", async (path, _body, method) => {
    if (method === "POST") mutations++;
    return path.includes("/games/") ? { game: { ...game(), inSetup: true } } : event();
  }), { status: 409 });
  await assert.rejects(companionEpicReady(seat, seat.gameId, "POST", async () => ({
    ...event(), groups: event().groups.map((group) => ({ ...group, gameId: "another-game" })),
  })), { status: 403 });
  assert.equal(mutations, 0);
});

test("all three ready bits and a started native timer are required to release answers", async () => {
  assert.equal(status(7, 0).ready, false);
  assert.equal(status(3, 123).ready, false);
  assert.equal(status(7, 123).ready, true);
  let calls = 0;
  await companionEpicReady(seat, seat.gameId, "POST", async () => { calls++; return event(1); });
  assert.equal(calls, 1, "An already-ready seat does not repeat its native mark request.");
});

test("concurrent readiness refreshes make one read and one mark, then poll the other groups", async () => {
  const first = deferred<EpicReadyStatus>();
  let reads = 0, marks = 0;
  const changes: EpicReadyState[] = [];
  const gate = createEpicReadyGate({
    read: async () => ++reads === 1 ? first.promise : status(7, 123),
    mark: async () => { marks++; return status(1); },
    change: (state) => changes.push(state),
  });
  const saved = game(), before = structuredClone(saved);
  const pending = gate.refresh(saved);
  assert.equal(gate.refresh(saved), pending);
  await Promise.resolve();
  assert.equal(reads, 1);
  first.resolve(status());
  await pending;
  assert.equal(marks, 1);
  assert.equal(changes.at(-1)?.status?.ready, false);
  await gate.refresh(saved);
  assert.equal(changes.at(-1)?.status?.ready, true);
  assert.equal(marks, 1);
  assert.deepEqual(saved, before);
});

test("leaving a seat cancels stale readiness updates and a later mark after its pending read", async () => {
  const pending = deferred<EpicReadyStatus>();
  let marks = 0, updates = 0;
  const gate = createEpicReadyGate({
    read: () => pending.promise,
    mark: async () => { marks++; return status(1); },
    change: () => { updates++; },
  });
  const flight = gate.refresh(game());
  await Promise.resolve();
  gate.dispose();
  const before = updates;
  pending.resolve(status());
  await flight;
  await gate.refresh(game(), true);
  assert.equal(updates, before);
  assert.equal(marks, 0);
});

test("failed readiness stays visible until an explicit retry, without repeating background requests", async () => {
  let reads = 0;
  const changes: EpicReadyState[] = [];
  const gate = createEpicReadyGate({
    read: () => { if (++reads === 1) throw new Error("Connection interrupted"); return Promise.resolve(status()); },
    mark: async () => status(1),
    change: (state) => changes.push(state),
  });
  await gate.refresh(game());
  assert.equal(changes.at(-1)?.error, "Connection interrupted");
  await gate.refresh(game());
  assert.equal(reads, 1);
  await gate.refresh(game(), true);
  assert.equal(reads, 2);
  assert.equal(changes.at(-1)?.error, "");
  assert.equal(changes.at(-1)?.status?.groupReady, true);
});
