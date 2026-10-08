import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { assertAddOnlyResumeBaseline } from "../scripts/native-scenario-playthrough-policy.mjs";

const first = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const later = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const baseline = () => ({
  games: [{ id: first, hash: "1".repeat(32) }],
  players: [{ id: first, hash: "2".repeat(32) }],
  steps: [{ game: first, step: 0, hash: "3".repeat(32) }],
  logs: [{ id: 1, hash: "4".repeat(32) }],
});

test("retained resume baseline permits added unrelated rows and protects the original complete checkpoint", () => {
  const old = baseline(),
    current = structuredClone(old);
  current.games.push({ id: later, hash: "5".repeat(32) });
  current.players.push({ id: later, hash: "6".repeat(32) });
  current.steps.push({ game: later, step: 0, hash: "7".repeat(32) });
  current.steps.push({ game: later, step: 1, hash: "8".repeat(32) });
  current.logs.push({ id: 2, hash: "9".repeat(32) });
  const before = JSON.stringify([old, current]);
  assert.deepEqual(assertAddOnlyResumeBaseline(old, current, hash(old)), {
    games: 1,
    players: 1,
    steps: 2,
    logs: 1,
  });
  assert.equal(JSON.stringify([old, current]), before);
});

test("resume rejects changed or removed original rows in every protected table and rejects duplicate keys", () => {
  const old = baseline();
  for (const table of ["games", "players", "steps", "logs"] as const) {
    const changed = structuredClone(old);
    changed[table][0].hash = "0".repeat(32);
    assert.throws(() => assertAddOnlyResumeBaseline(old, changed, hash(old)));
    const removed = structuredClone(old);
    removed[table] = [];
    assert.throws(() => assertAddOnlyResumeBaseline(old, removed, hash(old)));
    const duplicate = structuredClone(old);
    duplicate[table].push({
      ...duplicate[table][0],
      hash: "0".repeat(32),
    } as any);
    assert.throws(() => assertAddOnlyResumeBaseline(old, duplicate, hash(old)));
    assert.throws(() =>
      assertAddOnlyResumeBaseline(duplicate, duplicate, hash(duplicate)),
    );
  }
});

test("resume requires the exact prior baseline hash and complete SQL key shapes", () => {
  const old = baseline();
  assert.throws(() => assertAddOnlyResumeBaseline(old, old, "f".repeat(64)));
  for (const mutate of [
    (v: any) => {
      delete v.logs;
    },
    (v: any) => {
      v.unprotected = [];
    },
    (v: any) => {
      v.steps[0].step = 0.5;
    },
    (v: any) => {
      v.steps[0].game = "foreign-name";
    },
    (v: any) => {
      v.players[0].id = "not-a-uuid";
    },
    (v: any) => {
      v.games[0].hash = "not-a-row-hash";
    },
    (v: any) => {
      v.logs[0].extra = "ignored mutation";
    },
    (v: any) => {
      v.logs[0].id = first;
    },
    (v: any) => {
      v.logs[0].id = 1.5;
    },
  ]) {
    const invalid = structuredClone(old);
    mutate(invalid);
    assert.throws(() => assertAddOnlyResumeBaseline(old, invalid, hash(old)));
    assert.throws(() =>
      assertAddOnlyResumeBaseline(invalid, invalid, hash(invalid)),
    );
  }
});
