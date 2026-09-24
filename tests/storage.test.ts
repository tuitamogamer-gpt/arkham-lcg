import { reduceGame, createGame } from "./helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { validSave } from "../src/game/storage";

test("save validation accepts initial, active and pending-test states", () => {
  let s = createGame("standard", 34);
  assert.ok(validSave(JSON.parse(JSON.stringify(s))));
  s = reduceGame(s, { type: "mulligan", ids: [] });
  assert.ok(validSave(s));
  s = reduceGame(s, { type: "act", kind: "investigate" });
  assert.ok(validSave(JSON.parse(JSON.stringify(s))));
});
test("save validation rejects malformed data without throwing", () => {
  for (const x of [
    null,
    {},
    [],
    42,
    "hello",
    { version: 1, player: { code: "12004" } },
  ])
    assert.equal(validSave(x), false);
  for (const field of ["deck", "discard", "hand", "assets", "threats"]) {
    const s = createGame("easy", 5);
    (s.player as unknown as Record<string, unknown>)[field] = null;
    assert.equal(validSave(s), false);
  }
  const s = createGame("easy", 5);
  s.player.location = "bogus";
  assert.equal(validSave(s), false);
});
