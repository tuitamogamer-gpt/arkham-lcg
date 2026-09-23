import test from "node:test";
import assert from "node:assert/strict";
import { reduceGame } from "./helpers";
import {
  createGame,
  party,
  canAct,
  canPlay,
  commitValue,
  testValue,
  health,
  sanity,
} from "../src/game/engine";
import { code as C } from "../src/game/data";
import { decodeSave } from "../src/game/storage";
import type { Effect, GameState } from "../src/game/types";

const J = C(4),
  D = C(1),
  T = C(7);
function ready(codes = [J, D, T]) {
  let s = createGame("easy", 7331, codes);
  while (s.status === "mulligan")
    s = reduceGame(s, { type: "mulligan", ids: [] });
  for (const p of party(s)) {
    p.hand = [];
    p.assets = [];
  }
  s.bag = ["+1"];
  return s;
}
const member = (s: GameState, c: string) => party(s).find((p) => p.code === c)!;
function equip(s: GameState, n: number, p = s.player, uses = 0) {
  const id = `audit-${s.nextId++}`;
  p.assets.push({
    id,
    code: C(n),
    uses,
    damage: 0,
    horror: 0,
    exhausted: false,
  });
  return id;
}
function give(s: GameState, n: number, p = s.player) {
  const id = `audit-${s.nextId++}`;
  p.hand.push({ id, code: C(n) });
  return id;
}
function enemy(
  s: GameState,
  n = 121,
  owner = s.player.code,
  exhausted = false,
) {
  const id = `audit-${s.nextId++}`;
  s.enemies.push({
    id,
    code: C(n),
    location: member(s, owner).location,
    damage: 0,
    exhausted,
    engaged: true,
    engagedWith: owner,
  });
  return id;
}
function run(s: GameState, ...effects: Effect[]) {
  s.decision = {
    title: "fixture",
    description: "",
    choices: [{ id: "go", label: "go", effects }],
  };
  return reduceGame(s, { type: "choose", id: "go" });
}
const choose = (s: GameState, id: string) =>
  reduceGame(s, { type: "choose", id });
function finishTest(s: GameState) {
  s = reduceGame(s, { type: "reveal" });
  return reduceGame(s, { type: "resolve" });
}
function orderResults(s: GameState) {
  while (s.decision?.title === "Choose skill test result order")
    s = choose(s, s.decision.choices[0].id);
  return s;
}

test("Mutated! horror affects every investigator at the same location", () => {
  let s = ready();
  const other = member(s, T);
  s.locations.find((l) => l.code === C(117))!.active = true;
  other.location = C(117);
  s = choose(run(s, { kind: "mutated" }), "horror");
  assert.equal(member(s, J).horror, 1);
  assert.equal(member(s, D).horror, 1);
  assert.equal(member(s, T).horror, 0);
});

test("Bodyguard can soak teammate damage, with its reaction controlled by its owner", () => {
  let s = ready();
  const guard = equip(s, 16, member(s, D));
  member(s, D).assets[0].damage = 1;
  const target = enemy(s);
  s = run(s, { kind: "damage", damage: 1 });
  assert.ok(s.decision?.choices.some((c) => c.id === guard));
  s = choose(s, guard);
  assert.equal(member(s, J).damage, 0);
  assert.ok(member(s, D).discard.some((c) => c.id === guard));
  assert.equal(s.player.code, D);
  assert.equal(s.decision?.title, "Bodyguard");
  s = choose(s, target);
  assert.equal(s.enemies.find((e) => e.id === target)?.damage, 1);
});

test("Bodyguard cannot soak teammate horror, direct damage, or damage from another location", () => {
  for (const mode of ["horror", "direct", "remote"]) {
    let s = ready();
    equip(s, 16, member(s, D));
    if (mode === "remote") member(s, D).location = C(117);
    s = run(s, {
      kind: "damage",
      damage: mode === "horror" ? 0 : 1,
      horror: mode === "horror" ? 1 : 0,
      direct: mode === "direct",
    });
    assert.equal(s.decision, null);
    assert.equal(member(s, J)[mode === "horror" ? "horror" : "damage"], 1);
  }
});

test("Peril blocks teammate Bandages, then releases the restriction before surge", () => {
  let s = ready();
  equip(s, 73, member(s, D), 3);
  s.encounterDeck = [C(127)];
  s = run(s, { kind: "revelation", code: C(124) });
  s = choose(s, "pain");
  assert.equal(s.decision?.title, "Extraplanar Visions");
  s = choose(s, "intellect");
  const assist = give(s, 93, member(s, T));
  assert.ok(commitValue(s, assist) > 0, "surged card has no Peril restriction");
});

test("Peril also blocks help on a nested agenda test and survives reload", () => {
  let s = ready();
  const assist = give(s, 94, member(s, D));
  s.doom = 2;
  s = choose(run(s, { kind: "revelation", code: C(124) }), "doom");
  assert.ok(s.test);
  assert.equal(s.test.skill, "willpower");
  assert.ok(commitValue({ ...s, peril: undefined }, assist) > 0);
  s = decodeSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(s);
  assert.equal(commitValue(s, assist), 0);
  assert.equal(
    reduceGame(s, { type: "commit", id: assist }).test!.committed.length,
    0,
  );
});

test("investigating an empty location is legal and can trigger Joe", () => {
  let s = ready([J]);
  s.locations[0].clues = 0;
  assert.equal(canAct(s, "investigate"), null);
  s = finishTest(reduceGame(s, { type: "act", kind: "investigate" }));
  assert.equal(s.decision?.title, "A detective’s intuition");
  assert.equal(s.player.clues, 0);
});

test("exhausted engaged enemies can be evaded and count against Machete's bonus", () => {
  let s = ready([D]);
  const target = enemy(s, 114),
    second = enemy(s, 121, D, true);
  const machete = equip(s, 20);
  assert.equal(canAct(s, "evade", second), null);
  s = finishTest(
    reduceGame(s, { type: "act", kind: "fight", target, source: machete }),
  );
  assert.notEqual(s.decision?.title, "Machete");
  assert.equal(s.enemies.find((e) => e.id === target)?.damage, 1);
});

test("Wrench's explicit immediate attack works even if the enemy is exhausted", () => {
  let s = ready([D]);
  equip(s, 2);
  const target = enemy(s, 121, D, true);
  s = reduceGame(s, { type: "act", kind: "wrench", target });
  assert.ok(s.player.damage + s.player.horror > 0);
  assert.equal(
    s.enemies[0].exhausted,
    true,
    "explicit attack does not ready the enemy",
  );
});

test("enemy-phase attack exhausts after reactions, but opportunity attacks never exhaust", () => {
  for (const source of ["enemy", "opportunity"]) {
    let s = ready([J]);
    const target = enemy(s);
    s.phase = source === "enemy" ? "enemy" : "investigation";
    s = run(s, { kind: "attack", id: target, source });
    assert.equal(s.enemies[0].exhausted, source === "enemy");
  }
});

test("committed cards leave the hand and cannot be reshuffled by their own draw", () => {
  let s = ready([J]);
  const committed = give(s, 93);
  s.player.deck = [];
  s.player.discard = [{ id: "only-discard", code: C(89) }];
  s.player.flags.joe = true;
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "commit", id: committed });
  assert.ok(!s.player.hand.some((c) => c.id === committed));
  s = decodeSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(s?.test?.committed.includes(committed));
  s = finishTest(s);
  s = orderResults(s);
  assert.ok(s.player.hand.some((c) => c.id === "only-discard"));
  assert.ok(s.player.discard.some((c) => c.id === committed));
  assert.ok(!s.player.hand.some((c) => c.id === committed));
});

test("committed cards can be withdrawn before reveal and return to their correct owner's hand", () => {
  let s = ready();
  const id = give(s, 93, member(s, T));
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "commit", id });
  assert.ok(!member(s, T).hand.some((c) => c.id === id));
  s = reduceGame(s, { type: "commit", id });
  assert.ok(member(s, T).hand.some((c) => c.id === id));
});

test("an event resolving a test is not in the discard pile until its effects finish", () => {
  let s = ready([T]);
  const id = give(s, 50);
  s = reduceGame(s, { type: "play", id });
  assert.ok(s.test);
  assert.ok(!s.player.discard.some((c) => c.id === id));
  s = finishTest(s);
  if (s.decision) s = choose(s, "skip");
  assert.ok(s.player.discard.some((c) => c.id === id));
});

test("current skill modifiers reflect a stat ally defeated while paying for a boost", () => {
  let s = ready([T]);
  const ally = equip(s, 30),
    boost = equip(s, 35);
  s.player.threats.push(C(103));
  s = reduceGame(s, { type: "act", kind: "investigate" });
  assert.equal(testValue(s), 5);
  s = reduceGame(s, { type: "boost", id: boost });
  s = choose(s, ally);
  assert.equal(
    testValue(s),
    6,
    "4 intellect + 2 boost; defeated Dorothy no longer grants +1",
  );
});

test("Trish's additional evade is an action for first-action restrictions", () => {
  let s = ready([T]);
  const target = enemy(s),
    scene = give(s, 24);
  s = finishTest(reduceGame(s, { type: "act", kind: "evade", target }));
  assert.equal(s.player.actions, 3);
  assert.equal(s.player.actionsTaken, 1);
  assert.equal(canPlay(s, scene), "Play only as your first action.");
});

test("simultaneous health and sanity defeat lets the investigator choose one trauma", () => {
  let s = ready();
  s.player.damage = health(s) - 1;
  s.player.horror = sanity(s) - 1;
  s = run(s, { kind: "damage", damage: 1, horror: 1, direct: true });
  assert.equal(s.decision?.title, "Choose trauma");
  s = choose(s, "physical");
  assert.equal(member(s, J).physicalTrauma, 1);
  assert.equal(member(s, J).mentalTrauma, 0);
  assert.equal(member(s, J).status, "defeated");
});

test("a teammate can spend actions to discard a nearby investigator's threat", () => {
  let s = ready();
  member(s, D).threats.push(C(104));
  assert.equal(canAct(s, "removeThreat", C(104), D), null);
  s = reduceGame(s, {
    type: "act",
    kind: "removeThreat",
    target: C(104),
    source: D,
  });
  assert.ok(!member(s, D).threats.includes(C(104)));
  assert.ok(member(s, D).discard.some((c) => c.code === C(104)));
  assert.equal(member(s, J).actions, 1);
});

test("Fire applies damage to investigators and assets together before Bandages reactions", () => {
  let s = ready([D]);
  const ally = equip(s, 72),
    bandages = equip(s, 73, s.player, 3);
  s = run(s, { kind: "fireDamage" });
  assert.equal(s.player.damage, 1);
  assert.equal(s.player.assets.find((a) => a.id === ally)?.damage, 1);
  assert.equal(s.decision?.title, "Choose damage effect order");
  assert.ok(
    s.decision?.choices.some((c) =>
      c.effects.some((e) => e.kind === "bandage" && e.target === ally),
    ),
    "ally damage also offers Bandages",
  );
  assert.equal(s.player.assets.find((a) => a.id === bandages)?.uses, 3);
});

test("Fire at a location damages the whole party and enemies before offering reactions", () => {
  let s = ready();
  const ally = equip(s, 72, member(s, D));
  equip(s, 73, member(s, D), 3);
  const target = enemy(s, 121);
  s = run(s, { kind: "fireLocation", target: C(113), actor: "scenario" });
  assert.ok(party(s).every((p) => p.damage === 1));
  assert.equal(member(s, D).assets.find((a) => a.id === ally)!.damage, 1);
  assert.equal(s.enemies.find((e) => e.id === target)?.damage, 1);
  assert.equal(s.decision?.title, "Choose damage effect order");
});

test("group horror is assigned to all investigators before it is applied to anyone", () => {
  let s = ready([J, D]);
  equip(s, 87, member(s, J));
  equip(s, 87, member(s, D));
  s = choose(run(s, { kind: "mutated" }), "horror");
  s = choose(s, "self");
  assert.ok(party(s).every((p) => p.horror === 0));
  assert.equal(s.player.code, D);
  s = choose(s, "self");
  assert.ok(party(s).every((p) => p.horror === 1));
});

test("multi-card draw finishes before an Overzealous revelation sees the new hand", () => {
  let s = ready([J]);
  s.player.deck = [
    { id: "zeal", code: C(100) },
    { id: "cache", code: C(89) },
  ];
  s.encounterDeck = [C(127), C(125)];
  s = run(s, { kind: "draw", amount: 2 });
  assert.ok(s.player.hand.some((c) => c.id === "cache"));
  assert.equal(s.decision?.title, "Extraplanar Visions");
  s = choose(s, "intellect");
  assert.equal(
    s.test?.difficulty,
    1,
    "Overzealous is in limbo; the other drawn card is in hand",
  );
});

test("drawing with both deck and discard empty defeats the investigator with mental trauma", () => {
  let s = ready();
  s.player.deck = [];
  s.player.discard = [];
  s = reduceGame(s, { type: "act", kind: "draw" });
  assert.equal(member(s, J).status, "defeated");
  assert.equal(member(s, J).mentalTrauma, 1);
  assert.equal(member(s, J).physicalTrauma, 0);
});

test("a reshuffle draw and its horror apply together, even when the horror defeats you", () => {
  let s = ready();
  s.player.horror = sanity(s) - 1;
  s.player.deck = [];
  s.player.discard = [{ id: "last-draw", code: C(89) }];
  s = reduceGame(s, { type: "act", kind: "draw" });
  assert.equal(member(s, J).status, "defeated");
  assert.ok(member(s, J).hand.some((c) => c.id === "last-draw"));
});

test("the player chooses the order of multiple opportunity attacks", () => {
  let s = ready([J]);
  const first = enemy(s, 121),
    second = enemy(s, 123);
  s = reduceGame(s, { type: "act", kind: "resource" });
  assert.equal(s.decision?.title, "Choose attack order");
  assert.deepEqual(
    s.decision!.choices.map((c) => c.id).sort(),
    [first, second].sort(),
  );
  s = choose(s, second);
  const attacks = s.log.filter((l) => l.text.includes(" attacks "));
  assert.match(attacks[0].text, /Bystander/);
  assert.equal(s.player.resources, 6);
  assert.ok(s.enemies.every((e) => !e.exhausted));
});

test("enemy-phase attacks wait for Daniela's reaction before exhausting the attacker", () => {
  let s = ready([D]);
  const id = enemy(s, 114);
  s.phase = "enemy";
  s = run(s, { kind: "attack", id, source: "enemy" });
  assert.equal(s.decision?.title, "Daniela strikes back");
  assert.equal(s.enemies[0].exhausted, false);
  s = choose(s, "skip");
  assert.equal(s.enemies[0].exhausted, true);
});

test("Retaliate happens after failed-test tablet damage and never exhausts", () => {
  let s = ready([J]);
  const id = enemy(s, 114);
  s.bag = ["tablet", "auto_fail"];
  s = finishTest(reduceGame(s, { type: "act", kind: "fight", target: id }));
  const damage = s.log.findIndex((l) => /took 1 damage/.test(l.text));
  const attack = s.log.findIndex((l) => /attacks Joe Diamond/.test(l.text));
  assert.ok(damage >= 0 && attack > damage);
  assert.equal(s.enemies[0].exhausted, false);
});

test("Doomed triggers on defeat but not on a successful parley discard", () => {
  let s = ready([J]);
  const id = enemy(s, 123);
  s = finishTest(reduceGame(s, { type: "act", kind: "parley", target: id }));
  assert.equal(s.doom, 0);
  s = ready([J]);
  const defeated = enemy(s, 123);
  s = run(s, { kind: "enemyDamage", id: defeated, amount: 10 });
  assert.equal(s.doom, 1);
});

test("Prey lowest agility uses current skill bonuses when choosing an investigator", () => {
  let s = ready([J, D]);
  equip(s, 46, member(s, J));
  const id = enemy(s, 114);
  s.enemies[0].engaged = false;
  delete s.enemies[0].engagedWith;
  s = run(s, { kind: "engagement" });
  assert.equal(s.enemies.find((e) => e.id === id)?.engagedWith, D);
});

test("Wounded's first-move limit resets each investigator turn, including moves out of turn", () => {
  let s = ready([D, J]);
  s.locations.forEach((l) => {
    l.active = true;
    l.revealed = true;
  });
  s.act = 3;
  s.player.threats.push(C(104));
  s = reduceGame(s, { type: "act", kind: "move", target: C(117) });
  assert.equal(member(s, D).damage, 1);
  s = reduceGame(s, { type: "endTurn" });
  s = reduceGame(s, { type: "act", kind: "resource" });
  s = run(s, { kind: "move", actor: D, target: C(113) });
  assert.equal(member(s, D).damage, 2);
});

test("Prestidigitation resolves Syndicate Obligations before the new Item enters play", () => {
  let s = ready([T]);
  const item = give(s, 87);
  s.player.threats.push(C(103));
  // This command is the Item payment window, after choosing the discount target.
  // M1911 costs 4, so it actually spends resources after the discount.
  member(s, T).hand.find((c) => c.id === item)!.code = C(19);
  s = run(s, { kind: "discountEquip", id: item });
  assert.equal(s.player.damage, 1);
  const damageIndex = s.eventHistory.findIndex(
    (e) => e.title === "Damage and horror resolved",
  );
  const equipIndex = s.eventHistory.findIndex(
    (e) => e.title === "Asset enters play",
  );
  assert.ok(damageIndex >= 0 && equipIndex > damageIndex);
});

test("Fast play does not consume the first action and no-effect healing choices are excluded", () => {
  let s = ready([J]);
  const hunch = give(s, 38),
    scene = give(s, 24),
    intuition = give(s, 5);
  s = reduceGame(s, { type: "play", id: hunch });
  assert.equal(s.player.actionsTaken, 0);
  assert.equal(canPlay(s, scene), null);
  s = reduceGame(s, { type: "play", id: intuition });
  assert.equal(s.decision, null);
});

test("a treachery is kept out of the encounter discard until its test fully resolves", () => {
  let s = ready([J]);
  s.encounterDiscard = [];
  s = run(s, { kind: "revelation", code: C(128) });
  assert.ok(s.test);
  assert.ok(!s.encounterDiscard.includes(C(128)));
  s = finishTest(s);
  assert.ok(s.encounterDiscard.includes(C(128)));
});

test("the player chooses a replacement lead, and subsequent encounter order starts with that lead", () => {
  let s = ready();
  s.player.damage = health(s) - 1;
  s = run(s, { kind: "damage", damage: 1, direct: true });
  assert.equal(s.decision?.title, "Choose lead investigator");
  s = choose(s, T);
  assert.equal(s.leadInvestigator, T);
  s.encounterDeck = [C(128), C(128)];
  s = run(s, { kind: "newRound", actor: "scenario" });
  assert.equal(s.player.code, T);
  assert.ok(s.test);
});

test("Armitage's campaign bearer is chosen independently of his current controller", () => {
  let s = ready();
  equip(s, 115, member(s, D));
  s = run(s, { kind: "victory" });
  assert.equal(s.decision?.title, "Choose Armitage’s bearer");
  s = choose(s, T);
  s = choose(s, "leave");
  assert.equal(s.status, "resolution");
  assert.equal(s.campaign.armitageBearer, T);
  assert.ok(
    s.campaign.notes.some((n) => n.includes("Trish Scarborough is the bearer")),
  );
});

test("Daniela's elder sign resolves before test results; resulting agenda tests wait in FIFO order", () => {
  let s = ready([D, J, T]);
  const target = enemy(s, 123);
  s.enemies[0].damage = 1;
  s.doom = 2;
  s.bag = ["elder_sign"];
  const committed = give(s, 92);
  s = reduceGame(s, { type: "act", kind: "fight", target });
  s = reduceGame(s, { type: "commit", id: committed });
  s = reduceGame(s, { type: "reveal" });
  assert.equal(s.decision?.title, "Daniela’s elder sign");
  assert.ok(!s.player.discard.some((c) => c.id === committed));
  s = choose(s, target);
  assert.equal(s.agenda, 2);
  assert.equal(s.test?.kind, "fight");
  assert.equal(s.test?.stage, "revealed");
  assert.deepEqual(
    s.queuedTests?.map((q) => q.actor),
    [D, J, T],
  );
  s = decodeSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(s);
  s = reduceGame(s, { type: "resolve" });
  s = orderResults(s);
  assert.ok(member(s, D).discard.some((c) => c.id === committed));
  s.bag = ["+1"];
  for (const actor of [D, J, T]) {
    assert.equal(s.player.code, actor);
    assert.equal(s.test?.source, "agenda1");
    s = finishTest(s);
  }
  assert.equal(s.test, null);
  assert.equal(s.queuedTests?.length, 0);
});

test("Daniela's retaliation counterattack starts after the original test's committed cards are discarded", () => {
  let s = ready([D]);
  const target = enemy(s, 114),
    committed = give(s, 92);
  s.bag = ["auto_fail"];
  s = reduceGame(s, { type: "act", kind: "fight", target });
  s = reduceGame(s, { type: "commit", id: committed });
  s = finishTest(s);
  assert.equal(s.decision?.title, "Daniela strikes back");
  assert.ok(!s.player.discard.some((c) => c.id === committed));
  s = choose(s, "basic");
  assert.equal(s.test?.kind, "fight");
  assert.equal(s.test?.stage, "commit");
  assert.ok(s.player.discard.some((c) => c.id === committed));
});

test("old pending-test saves move commitments into limbo without losing cards", () => {
  let s = ready([J]);
  const id = give(s, 93);
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s.test!.committed = [id];
  delete s.testInProgress;
  delete s.limbo;
  const restored = decodeSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(restored);
  assert.equal(restored.testInProgress, true);
  assert.ok(!restored.player.hand.some((c) => c.id === id));
  assert.ok(restored.limbo?.some((c) => c.id === id && c.owner === J));
  assert.ok(
    testValue(restored) >
      testValue({ ...restored, test: { ...restored.test!, committed: [] } }),
  );
});

test("Overzealous and Cosmic Evils grant one Surge, because duplicate keywords do not stack", () => {
  let s = ready([J]);
  s.player.deck = [{ id: "zeal", code: C(100) }];
  s.encounterDeck = [C(124), C(125), C(128)];
  s = reduceGame(s, { type: "act", kind: "draw" });
  assert.equal(s.decision?.title, "Cosmic Evils");
  s = choose(s, "pain");
  assert.equal(s.test, null);
  assert.deepEqual(s.encounterDeck, [C(128)]);
  assert.ok(s.player.threats.includes(C(125)));
});

test("defeat while paying for a skill boost ends the suspended test and releases the next investigator", () => {
  let s = ready([T, J]);
  const boost = equip(s, 47),
    committed = give(s, 93);
  s.player.threats.push(C(103));
  s.player.damage = health(s) - 1;
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "commit", id: committed });
  s = reduceGame(s, { type: "boost", id: boost });
  assert.equal(member(s, T).status, "defeated");
  assert.ok(member(s, T).discard.some((c) => c.id === committed));
  assert.equal(s.testInProgress, false);
  assert.equal(s.player.code, J);
  s = reduceGame(s, { type: "act", kind: "investigate" });
  assert.equal(s.test?.kind, "investigate");
});
