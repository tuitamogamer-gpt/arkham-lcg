import { reduceGame } from "./helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { BAGS, JOE_DECK, card, cards, code } from "../src/game/data";
import {
  canAct,
  canPlay,
  createGame,
  stats,
  testValue,
} from "../src/game/engine";
import type { Action, GameState } from "../src/game/types";
const C = code;
const game = () =>
  reduceGame(createGame("standard", 123456), { type: "mulligan", ids: [] });
function settle(
  s: GameState,
  overrides: Record<string, string> = {},
): GameState {
  let n = 0;
  while ((s.test || s.decision) && s.status === "playing") {
    assert.ok(++n < 100, "resolution must terminate");
    if (s.test) {
      s = reduceGame(s, {
        type: s.test.stage === "commit" ? "reveal" : "resolve",
      });
    } else {
      const d = s.decision!;
      const id =
        overrides[d.title] ||
        d.choices.find((c) =>
          ["skip", "keep", "stay", "resource", "damage", "doom"].includes(c.id),
        )?.id ||
        d.choices[0].id;
      s = reduceGame(s, { type: "choose", id });
    }
  }
  return s;
}
function hand(s: GameState, ...ns: number[]) {
  s.player.hand = ns.map((n, i) => ({ id: `h${i}`, code: C(n) }));
}
function equip(s: GameState, n: number, uses = 0) {
  s.player.assets.push({
    id: `a${n}`,
    code: C(n),
    exhausted: false,
    uses,
    damage: 0,
    horror: 0,
  });
  return `a${n}`;
}
function enemy(s: GameState, n: number, extra = {}) {
  s.enemies.push({
    id: `e${n}`,
    code: C(n),
    location: s.player.location,
    damage: 0,
    exhausted: false,
    engaged: true,
    ...extra,
  });
  return `e${n}`;
}
function attempt(s: GameState, action: Action) {
  return settle(reduceGame(s, action));
}

test("196 complete 2026 definitions and exact 33-card Joe starter", () => {
  assert.equal(cards.length, 196);
  assert.ok(cards.every((c) => c.name && c.type_code));
  assert.equal(JOE_DECK.length, 33);
  assert.equal(JOE_DECK.filter((c) => card(c).subtype_code).length, 2);
  assert.equal(card(C(20)).name, "Machete");
  assert.match(card(C(20)).text!, /exhaust Machete/);
  assert.equal(cards.filter((c) => c.type_code === "investigator").length, 5);
});
test("deterministic setup, correct opening economy, no opening weaknesses, first mythos skipped", () => {
  const a = createGame("standard", 51),
    b = createGame("standard", 51);
  assert.deepEqual(a, b);
  assert.equal(a.player.hand.length, 5);
  assert.equal(a.player.deck.length, 28);
  assert.equal(a.encounterDeck.length, 24);
  assert.equal(a.player.resources, 5);
  assert.equal(a.doom, 0);
  assert.equal(a.player.actions, 3);
  assert.ok(a.player.hand.every((c) => !card(c.code).subtype_code));
});
test("mulligan replaces once, preserves exact deck contents, and cannot redraw set-aside cards", () => {
  const s = createGame("standard", 55);
  const old = s.player.hand.map((c) => c.id);
  const result = reduceGame(s, { type: "mulligan", ids: old });
  assert.equal(result.status, "playing");
  assert.equal(result.player.hand.length, 5);
  assert.ok(result.player.hand.every((c) => !old.includes(c.id)));
  assert.equal(
    new Set([...result.player.hand, ...result.player.deck].map((c) => c.id))
      .size,
    33,
  );
  assert.deepEqual(reduceGame(result, { type: "mulligan", ids: [] }), result);
});
test("failed actions do not mutate resources, actions or input state", () => {
  const s = game();
  const before = structuredClone(s);
  const r = reduceGame(s, { type: "act", kind: "move", target: C(120) });
  assert.ok(r.error);
  assert.equal(r.player.actions, 3);
  assert.deepEqual(s, before);
  assert.equal(r.player.location, C(113));
});
test("resource action and Emergency Cache have correct action and resource costs", () => {
  let s = game();
  hand(s, 89);
  s = reduceGame(s, { type: "act", kind: "resource" });
  assert.equal(s.player.resources, 6);
  s = reduceGame(s, { type: "play", id: "h0" });
  assert.equal(s.player.resources, 9);
  assert.equal(s.player.actions, 1);
  assert.equal(s.player.discard[0].code, C(89));
});
test("tie succeeds, Deduction adds a clue, Joe optional reaction is offered once per round", () => {
  let s = game();
  hand(s, 39);
  s.bag = ["-3"];
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "commit", id: "h0" });
  assert.equal(testValue(s), 5);
  s = reduceGame(s, { type: "reveal" });
  assert.equal(s.test?.success, true);
  s = reduceGame(s, { type: "resolve" });
  assert.equal(s.player.clues, 2);
  assert.equal(s.decision?.title, "A detective’s intuition");
  s = reduceGame(s, { type: "choose", id: "draw" });
  s = settle(s);
  assert.equal(s.player.flags.joe, true);
  assert.ok(s.player.discard.some((c) => c.code === C(39)));
});
test("auto-fail uses zero effective skill when calculating failure margin", () => {
  let s = game();
  s.bag = ["auto_fail"];
  s.encounterDeck = [C(130)];
  s.player.actions = 0;
  s = reduceGame(s, { type: "endTurn" });
  s = reduceGame(s, { type: "choose", id: "willpower" });
  s = reduceGame(s, { type: "reveal" });
  assert.equal(s.test?.success, false);
  assert.equal(s.test?.margin, -3);
  s = settle(s);
  assert.equal(s.player.damage, 3);
});
test("tablet reveals another token without putting drawn tokens back until test ends", () => {
  for (let seed = 1; seed < 100; seed++) {
    let s = game();
    s.seed = seed;
    s.bag = ["tablet", "0"];
    s = reduceGame(s, { type: "act", kind: "investigate" });
    s = reduceGame(s, { type: "reveal" });
    assert.ok(s.test!.tokens.filter((t) => t === "tablet").length <= 1);
    if (s.test!.tokens[0] === "tablet")
      assert.deepEqual(s.test!.tokens, ["tablet", "0"]);
  }
});
test("skill commits enforce matching icons, max one copy, and discard on failure", () => {
  let s = game();
  hand(s, 93, 93, 92);
  s.bag = ["auto_fail"];
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "commit", id: "h2" });
  assert.equal(s.test!.committed.length, 0);
  s = reduceGame(s, { type: "commit", id: "h0" });
  s = reduceGame(s, { type: "commit", id: "h1" });
  assert.match(s.error!, /one copy/);
  s = settle(s);
  assert.equal(s.player.clues, 0);
  assert.ok(s.player.discard.some((c) => c.id === "h0"));
  assert.equal(s.player.hand.length, 2);
});
test("fast Magnifying Glass plays with no remaining actions and boosts only investigations", () => {
  let s = game();
  hand(s, 34);
  s.player.actions = 0;
  assert.equal(canPlay(s, "h0"), null);
  s = reduceGame(s, { type: "play", id: "h0" });
  assert.equal(s.player.actions, 0);
  assert.equal(stats(s, "intellect"), 4);
  assert.equal(stats(s, "intellect", "investigate"), 5);
  assert.equal(s.player.resources, 4);
});
test("Fingerprint Kit spends a supply, exhausts, and discovers two clues", () => {
  let s = game();
  s.bag = ["0"];
  const id = equip(s, 31, 3);
  s = attempt(s, { type: "act", kind: "investigate", source: id });
  assert.equal(s.player.clues, 2);
  assert.equal(s.player.assets[0].uses, 2);
  assert.equal(s.player.assets[0].exhausted, true);
  s.locations[0].clues = 1;
  assert.match(canAct(s, "investigate", undefined, id)!, /exhausted/);
});
test("asset slot replacement pauses for a choice and preserves costs", () => {
  let s = game();
  equip(s, 34);
  equip(s, 88);
  hand(s, 19);
  s = reduceGame(s, { type: "play", id: "h0" });
  assert.match(s.decision!.title, /Make room/);
  s = reduceGame(s, { type: "choose", id: "a88" });
  assert.deepEqual(
    s.player.assets.map((a) => a.code),
    [C(34), C(19)],
  );
  assert.equal(s.player.assets[1].uses, 4);
  assert.equal(s.player.resources, 2);
  assert.equal(s.player.actions, 2);
});
test("M1911 + Vicious Blow deals three damage and spends exactly one ammo", () => {
  let s = game();
  s.bag = ["0"];
  hand(s, 25);
  const gun = equip(s, 19, 4),
    id = enemy(s, 122);
  s = reduceGame(s, { type: "act", kind: "fight", target: id, source: gun });
  s = reduceGame(s, { type: "commit", id: "h0" });
  s = settle(s);
  assert.equal(s.enemies.length, 0);
  assert.equal(s.player.assets[0].uses, 3);
  assert.equal(s.player.actions, 2);
});
test("Machete bonus requires exactly one engaged enemy and exhausts only on accepted success", () => {
  let s = game();
  s.bag = ["0"];
  const id = enemy(s, 121);
  const w = equip(s, 20);
  s = reduceGame(s, { type: "act", kind: "fight", target: id, source: w });
  s = reduceGame(s, { type: "reveal" });
  s = reduceGame(s, { type: "resolve" });
  assert.equal(s.decision?.title, "Machete");
  s = reduceGame(s, { type: "choose", id: "exhaust" });
  assert.equal(s.enemies.length, 0);
  assert.ok(s.player.assets[0].exhausted);
});
test("basic resource action provokes an attack of opportunity; fight does not", () => {
  let s = game();
  enemy(s, 121);
  s = attempt(s, { type: "act", kind: "resource" });
  assert.equal(s.player.damage, 1);
  s.bag = ["0"];
  s = attempt(s, { type: "act", kind: "fight", target: "e121" });
  assert.equal(s.player.damage, 1);
});
test("evading exhausts/disengages, permits movement, and enemy readies at upkeep", () => {
  let s = game();
  s.bag = ["0"];
  s.locations.find((l) => l.code === C(117))!.active = true;
  enemy(s, 123);
  s = attempt(s, { type: "act", kind: "evade", target: "e123" });
  assert.equal(s.enemies[0].exhausted, true);
  s = reduceGame(s, { type: "act", kind: "move", target: C(117) });
  assert.equal(s.player.damage, 0);
  assert.equal(s.enemies[0].location, C(113));
  s.encounterDeck = [C(125)];
  s = attempt(s, { type: "endTurn" });
  assert.equal(s.enemies[0].exhausted, false);
  assert.equal(s.player.damage, 0);
});
test("parley discards a Bystander without doom; defeating one advances doom immediately", () => {
  let s = game();
  s.bag = ["0"];
  enemy(s, 123);
  s = attempt(s, { type: "act", kind: "parley", target: "e123" });
  assert.equal(s.doom, 0);
  assert.equal(s.enemies.length, 0);
  enemy(s, 123);
  s.doom = 2;
  s = attempt(s, { type: "act", kind: "fight", target: "e123" });
  assert.equal(s.agenda, 2);
  assert.equal(s.doom, 0);
});
test("act 1 advances only at end of round, then sets up fire and the pursuing enemy", () => {
  let s = game();
  s.player.clues = 2;
  s.encounterDeck = [C(125)];
  assert.equal(s.act, 1);
  s = reduceGame(s, { type: "endTurn" });
  s = settle(s, { "Advance the act?": "advance" });
  assert.equal(s.act, 2);
  assert.equal(s.player.clues, 0);
  assert.ok(s.locations.find((l) => l.code === C(113))!.fire);
  assert.equal(s.enemies.find((e) => e.code === C(114))!.location, C(117));
  assert.equal(s.encounterDiscard.filter((c) => c === C(129)).length, 4);
  assert.equal(s.round, 2);
  assert.equal(s.doom, 1);
});
test("reaching the quad advances act 2 and reveals campus paths; quad move is free once per round", () => {
  let s = game();
  s.act = 2;
  s.player.location = C(117);
  s.locations
    .filter((l) => [C(113), C(117), C(116)].includes(l.code))
    .forEach((l) => (l.active = true));
  s = reduceGame(s, { type: "act", kind: "move", target: C(116) });
  assert.equal(s.act, 3);
  assert.equal(s.locations.filter((l) => l.active).length, 5);
  assert.ok(!s.locations[0].active);
  const actions = s.player.actions;
  s = reduceGame(s, { type: "act", kind: "move", target: C(118) });
  assert.equal(s.player.actions, actions);
  assert.ok(s.flags.quad);
  assert.equal(s.player.location, C(118));
});
test("Local Map cannot investigate current or unrevealed locations", () => {
  const s = game();
  const id = equip(s, 33, 4);
  assert.match(canAct(s, "investigate", s.player.location, id)!, /connecting/);
  s.locations.find((l) => l.code === C(117))!.active = true;
  assert.ok(canAct(s, "investigate", C(117), id));
});
test("Science Hall forces a chosen discard, never a weakness", () => {
  let s = game();
  s.bag = ["0"];
  s.player.location = C(118);
  const l = s.locations.find((l) => l.code === C(118))!;
  l.active = true;
  l.revealed = true;
  l.clues = 1;
  hand(s, 6, 89);
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "reveal" });
  s = reduceGame(s, { type: "resolve" });
  assert.equal(s.decision!.title, "Science Hall");
  assert.deepEqual(
    s.decision!.choices.map((c) => c.id),
    ["h1"],
  );
});
test("search finds Dead Ends, cancels search, and moves the weakness to hand", () => {
  let s = game();
  hand(s, 23);
  s.player.deck = [
    { id: "weak", code: C(6) },
    { id: "tool", code: C(19) },
  ];
  s = reduceGame(s, { type: "play", id: "h0" });
  assert.equal(s.decision, null);
  assert.equal(s.player.hand[0].code, C(6));
  assert.equal(s.player.deck.length, 1);
});
test("Overzealous draws two encounters, including an extra draw after a non-surge encounter", () => {
  let s = game();
  s.player.deck = [{ id: "weak", code: C(100) }];
  s.encounterDeck = [C(121), C(123)];
  s = attempt(s, { type: "act", kind: "draw" });
  assert.deepEqual(
    s.enemies.map((e) => e.code),
    [C(121), C(123)],
  );
});
test("end turn runs enemy, upkeep and mythos phases once and restores 3 actions", () => {
  let s = game();
  s.encounterDeck = [C(125)];
  s = attempt(s, { type: "endTurn" });
  assert.equal(s.round, 2);
  assert.equal(s.phase, "investigation");
  assert.equal(s.player.actions, 3);
  assert.equal(s.player.resources, 6);
  assert.equal(s.player.hand.length, 6);
  assert.equal(s.doom, 1);
  assert.deepEqual(s.player.threats, [C(125)]);
});
test("pending tests and decisions survive a JSON round trip without changing random outcomes", () => {
  let s = game();
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, {
    type: "commit",
    id: s.player.hand.find((c) => card(c.code).skill_intellect)!.id,
  });
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(
    JSON.stringify(reduceGame(s, { type: "reveal" })),
    JSON.stringify(reduceGame(restored, { type: "reveal" })),
  );
});
test("full scripted act chain ends in victory with correct saved university outcome", () => {
  let s = game();
  s.bag = ["0"];
  s.player.deck = Array.from({ length: 50 }, (_, i) => ({
    id: `deck${i}`,
    code: C(89),
  }));
  s.player.clues = 2;
  s.encounterDeck = Array(20).fill(C(125));
  s = settle(reduceGame(s, { type: "endTurn" }), {
    "Advance the act?": "advance",
  });
  s.enemies = [];
  s = attempt(s, { type: "act", kind: "move", target: C(117) });
  s = attempt(s, { type: "act", kind: "move", target: C(116) });
  assert.equal(s.act, 3);
  s = attempt(s, { type: "act", kind: "move", target: C(120) });
  s.player.clues = 3;
  s = settle(reduceGame(s, { type: "endTurn" }), {
    "Advance the act?": "advance",
  });
  assert.equal(s.act, 4);
  assert.ok(s.player.assets.some((a) => a.code === C(115)));
  assert.equal(s.locations.find((l) => l.code === C(116))!.clues, 3);
  s.player.actions = 3;
  s = attempt(s, { type: "act", kind: "move", target: C(116) });
  s.player.clues = 5;
  for (let i = 0; i < 5; i++)
    s = reduceGame(s, {
      type: "act",
      kind: "clueDamage",
      target: s.enemies.find((e) => e.code === C(114))!.id,
    });
  assert.equal(s.decision?.title, "The masked pursuer falls");
  s = reduceGame(s, { type: "choose", id: "save" });
  assert.equal(s.status, "resolution");
  assert.equal(s.campaign.result, "saved");
  assert.equal(s.campaign.physicalTrauma, 1);
  assert.ok(s.campaign.xp >= 6);
  assert.ok(
    s.campaign.notes.includes("The investigators saved Miskatonic University."),
  );
});
test("defeat, resignation, and final agenda produce explicit campaign outcomes", () => {
  let s = game();
  s.player.damage = 6;
  enemy(s, 121);
  s = attempt(s, { type: "act", kind: "resource" });
  assert.equal(s.status, "resolution");
  assert.equal(s.campaign.physicalTrauma, 1);
  assert.equal(s.campaign.mentalTrauma, 1);
  let r = game();
  r.act = 4;
  r = attempt(r, { type: "act", kind: "resign" });
  assert.equal(r.campaign.result, "resigned");
  let a = game();
  a.agenda = 3;
  a.doom = 9;
  a = attempt(a, { type: "endTurn" });
  assert.equal(a.campaign.result, "overrun");
  assert.equal(a.campaign.physicalTrauma, 1);
  assert.equal(a.campaign.mentalTrauma, 1);
});
test("damage and horror are applied simultaneously, allowing a Fedora to soak one of each", () => {
  let s = game();
  equip(s, 87);
  enemy(s, 122);
  s = reduceGame(s, { type: "act", kind: "resource" });
  assert.match(s.decision!.title, /Assign/);
  s = reduceGame(s, { type: "choose", id: "a87" });
  assert.equal(
    s.player.assets.length,
    1,
    "asset remains until all damage is assigned",
  );
  s = reduceGame(s, { type: "choose", id: "a87" });
  s = settle(s);
  assert.equal(s.player.damage, 0);
  assert.equal(s.player.horror, 0);
  assert.equal(s.player.assets.length, 0);
  assert.ok(s.player.discard.some((c) => c.code === C(87)));
});
test("Dr. Armitage prevents opportunity attacks on a two-action first action", () => {
  let s = game();
  equip(s, 115);
  enemy(s, 121);
  s.player.threats = [C(125)];
  s = attempt(s, { type: "act", kind: "removeThreat", target: C(125) });
  assert.equal(s.player.damage, 0);
  assert.equal(s.player.actions, 1);
});
