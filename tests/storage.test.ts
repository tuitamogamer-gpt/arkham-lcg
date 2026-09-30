import { reduceGame, createGame } from "./helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { decodeSave, validSave } from "../src/game/storage";
import { card } from "../src/game/data";

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

test("save validation rejects duplicate physical cards and malformed rendered values", () => {
  const original = createGame("standard", 35, ["12004", "12001"]);
  const duplicate = structuredClone(original);
  duplicate.companions[0].hand.push({ ...duplicate.player.hand[0] });
  assert.equal(validSave(duplicate), false);
  const emptyId = structuredClone(original);
  emptyId.player.hand[0].id = "";
  assert.equal(validSave(emptyId), false);
  for (const [field, value] of [
    ["error", {}],
    ["id", ""],
  ] as const) {
    const malformed = structuredClone(original) as unknown as Record<
      string,
      unknown
    >;
    malformed[field] = value;
    assert.equal(validSave(malformed), false, field);
  }
  const flags = structuredClone(original);
  (flags.player.flags as Record<string, unknown>).broken = {};
  assert.equal(validSave(flags), false);
  const result = structuredClone(original);
  (result.campaign as unknown as Record<string, unknown>).result = {};
  assert.equal(validSave(result), false);
  let pending = reduceGame(createGame("standard", 36), {
    type: "mulligan",
    ids: [],
  });
  pending = reduceGame(pending, { type: "act", kind: "investigate" });
  assert.ok(pending.test);
  (pending.test.tokens as unknown[]).push({ token: "skull" });
  assert.equal(validSave(pending), false);
});

test("an enemy's stored location must belong to the scenario", () => {
  const s = createGame("easy", 37);
  s.enemies.push({
    id: "enemy-regression",
    code: "12114",
    location: s.player.code,
    damage: 0,
    exhausted: false,
    engaged: false,
  });
  assert.equal(validSave(s), false);
  s.enemies[0].location = s.player.location;
  assert.ok(validSave(s));
});

test("player-card doom survives a save while omitted legacy doom remains valid", () => {
  const s = createGame("standard", 38);
  assert.ok(validSave(s));
  const assetIndex = s.player.deck.findIndex(
    (c) => card(c.code).type_code === "asset",
  );
  const [asset] = s.player.deck.splice(assetIndex, 1);
  s.player.assets.push({
    ...asset,
    uses: 0,
    damage: 0,
    horror: 0,
    exhausted: false,
    doom: 2,
  });
  s.player.doom = 1;
  const restored = decodeSave(JSON.parse(JSON.stringify(s)));
  assert.equal(restored?.player.doom, 1);
  assert.equal(restored?.player.assets[0].doom, 2);
  for (const value of [-1, 1.5, null, "2"]) {
    const badInvestigator = structuredClone(s);
    (badInvestigator.player as unknown as Record<string, unknown>).doom = value;
    assert.equal(validSave(badInvestigator), false);
    const badAsset = structuredClone(s);
    (badAsset.player.assets[0] as unknown as Record<string, unknown>).doom =
      value;
    assert.equal(validSave(badAsset), false);
  }
});
