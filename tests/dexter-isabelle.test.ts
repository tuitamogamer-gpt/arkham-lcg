import test from "node:test";
import assert from "node:assert/strict";
import { createGame, reduceGame } from "./helpers";
import {
  reduceGame as raw,
  party,
  canAct,
  canPlay,
  stats,
  fastOptions,
  testValue,
} from "../src/game/engine";
import { card, code as C, STARTER_DECKS } from "../src/game/data";
import type { GameState, Investigator } from "../src/game/types";

const DEXTER = C(10),
  ISABELLE = C(13);
function ready(codes: string[], seed = 4242) {
  let s = createGame("standard", seed, codes);
  while (s.status === "mulligan")
    s = reduceGame(s, { type: "mulligan", ids: [] });
  return s;
}
function settle(s: GameState, choices: Record<string, string> = {}) {
  let n = 0;
  while ((s.test || s.decision) && s.status === "playing") {
    assert.ok(++n < 200, "effects terminate");
    if (s.test)
      s = reduceGame(s, {
        type: s.test.stage === "commit" ? "reveal" : "resolve",
      });
    else {
      const d = s.decision!;
      const id =
        choices[d.title] ||
        d.choices.find((c) =>
          ["skip", "keep", "stay", "wait", "doom"].includes(c.id),
        )?.id ||
        d.choices[0].id;
      assert.ok(
        d.choices.some((c) => c.id === id),
        `${d.title} offers ${id}`,
      );
      s = reduceGame(s, { type: "choose", id });
    }
  }
  return s;
}
function addEnemy(
  s: GameState,
  n: number,
  who = s.player.code,
  at = s.player.location,
  engaged = true,
) {
  const id = `enemy-${s.nextId++}`;
  s.enemies.push({
    id,
    code: C(n),
    location: at,
    damage: 0,
    exhausted: false,
    engaged,
    engagedWith: engaged ? who : undefined,
  });
  return id;
}
function equip(s: GameState, n: number, uses = 0, p: Investigator = s.player) {
  const id = `asset-${s.nextId++}`;
  p.assets.push({ id, code: C(n), uses, exhausted: false, damage: 0, horror: 0 });
  return id;
}
function give(s: GameState, n: number, p: Investigator = s.player) {
  const id = `hand-${s.nextId++}`;
  p.hand.push({ id, code: C(n) });
  return id;
}
const icons = (code: string, skill: string) =>
  (card(code)[`skill_${skill}` as "skill_willpower"] || 0) +
  (card(code).skill_wild || 0);

test("Dexter and Isabelle receive their exact 33-card starters with no weakness in the opening hand", () => {
  for (const code of [DEXTER, ISABELLE]) {
    const s = createGame("standard", 77, [code]);
    const p = s.player;
    assert.deepEqual(
      [...p.deck, ...p.hand].map((c) => c.code).sort(),
      [...STARTER_DECKS[code]].sort(),
    );
    assert.equal(STARTER_DECKS[code].length, 33);
    assert.ok(p.hand.every((c) => !card(c.code).subtype_code));
    assert.equal(p.hand.length, 5);
  }
  const both = ready([DEXTER, ISABELLE, C(4)]);
  assert.equal(party(both).length, 3);
  assert.equal(stats(both, "willpower", "", party(both)[0]), 5);
});

test("Dexter's reaction after playing an asset can return another asset to hand once per round", () => {
  let s = ready([DEXTER]);
  const jim = equip(s, 60);
  const charm = give(s, 61);
  s = reduceGame(s, { type: "play", id: charm });
  assert.equal(s.decision?.title, "Dexter Drake · a magician’s trick");
  s = reduceGame(s, { type: "choose", id: `return:${jim}` });
  s = settle(s);
  assert.ok(s.player.hand.some((c) => c.id === jim), "Jim returns to hand");
  assert.deepEqual(
    s.player.assets.map((a) => a.code),
    [C(61)],
  );
  assert.equal(s.player.flags.dexter, true);
  const cloak = give(s, 58);
  s = reduceGame(s, { type: "play", id: cloak });
  assert.equal(s.decision, null, "the reaction is once per round");
});

test("Dexter's reaction can play a different asset from hand without spending an action", () => {
  let s = ready([DEXTER]);
  s.player.resources = 5;
  const charm = give(s, 61);
  const cloak = give(s, 58);
  s = reduceGame(s, { type: "play", id: charm });
  assert.equal(s.decision?.title, "Dexter Drake · a magician’s trick");
  assert.ok(s.decision!.choices.some((c) => c.id === `play:${cloak}`));
  s = reduceGame(s, { type: "choose", id: `play:${cloak}` });
  s = settle(s);
  assert.deepEqual(
    s.player.assets.map((a) => a.code).sort(),
    [C(58), C(61)],
  );
  assert.equal(s.player.resources, 0);
  assert.equal(s.player.actions, 2, "only the first play cost an action");
});

test("Dexter's elder sign may return a non-story asset at his location to its owner's hand", () => {
  let s = ready([DEXTER]);
  s.bag = ["elder_sign"];
  const jim = equip(s, 60);
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = settle(s, { "Dexter’s elder sign": jim });
  assert.equal(s.player.clues, 1);
  assert.ok(s.player.hand.some((c) => c.id === jim));
  assert.equal(s.player.assets.length, 0);
});

test("For my next trick plays a Spell or Item from the deck at a discount and provokes no attack", () => {
  let s = ready([DEXTER]);
  s.player.resources = 2;
  s.player.deck = [
    { id: "flame", code: C(59) },
    { id: "cache", code: C(89) },
    { id: "guts", code: C(90) },
  ];
  const trick = give(s, 11);
  addEnemy(s, 121);
  s = reduceGame(s, { type: "play", id: trick });
  assert.equal(s.decision?.title, "For my next trick…");
  s = reduceGame(s, { type: "choose", id: "flame" });
  s = settle(s);
  assert.ok(s.player.assets.some((a) => a.code === C(59)));
  assert.equal(s.player.resources, 1, "cost 3 reduced by 2");
  assert.equal(s.player.damage, 0, "no attack of opportunity");
  assert.equal(s.player.deck.length, 2);
});

test("The Necronomicon forbids asset play and abilities until a willpower (5) test discards it", () => {
  let s = ready([DEXTER]);
  s.player.threats.push(C(12));
  const charm = give(s, 61);
  assert.match(canPlay(s, charm) || "", /Necronomicon/);
  const flame = equip(s, 59, 3);
  const enemy = addEnemy(s, 121);
  assert.match(canAct(s, "fight", enemy, flame) || "", /Necronomicon/);
  assert.equal(canAct(s, "fight", enemy), null, "a basic fight is still legal");
  s.bag = ["+1"];
  s = reduceGame(s, { type: "act", kind: "necronomicon" });
  assert.equal(s.test?.skill, "willpower");
  assert.equal(s.test?.difficulty, 5);
  s = settle(s);
  assert.ok(!s.player.threats.includes(C(12)));
  assert.ok(s.player.discard.some((c) => c.code === C(12)));
  let f = ready([DEXTER]);
  f.player.threats.push(C(12));
  f.bag = ["-8"];
  f = reduceGame(f, { type: "act", kind: "necronomicon" });
  f = settle(f);
  assert.ok(!f.player.threats.includes(C(12)));
  assert.ok(f.player.deck.some((c) => c.code === C(12)), "shuffled into the deck");
  assert.equal(f.player.horror, 1);
});

test("Isabelle takes 1 direct horror to commit a skill from her discard pile, which returns to her deck", () => {
  let s = ready([ISABELLE]);
  const sight = equip(s, 62, 3);
  s.player.discard.push({ id: "guts", code: C(90) });
  s.bag = ["0"];
  s = raw(s, { type: "act", kind: "investigate", source: sight });
  while (s.event) s = raw(s, { type: "continue", eventId: s.event.id });
  assert.equal(s.window?.timing, "beforeCommit");
  const option = fastOptions(s).find((o) => o.id === `${ISABELLE}:isabelle:guts`);
  assert.ok(option, "the discard pile skill is offered");
  s = raw(s, { type: "fast", id: option!.id });
  while (s.event) s = raw(s, { type: "continue", eventId: s.event.id });
  assert.equal(s.player.horror, 1);
  while (s.window) {
    s = raw(s, { type: "passWindow" });
    while (s.event) s = raw(s, { type: "continue", eventId: s.event.id });
  }
  assert.ok(s.test, "the test resumes");
  assert.deepEqual(s.test!.committed, ["guts"]);
  assert.equal(testValue(s), 4 + icons(C(90), "willpower"));
  assert.ok(!fastOptions(s).length);
  s = reduceGame(s, { type: "commit", id: "guts" });
  assert.deepEqual(s.test!.committed, ["guts"], "the recovered card cannot be taken back");
  s = settle(s);
  assert.ok(s.player.deck.some((c) => c.id === "guts"), "back in the deck");
  assert.ok(!s.player.discard.some((c) => c.id === "guts"));
  assert.equal(s.player.flags.isabelle, true);
});

test("Isabelle's elder sign heals 1 horror on a success", () => {
  let s = ready([ISABELLE]);
  s.player.horror = 2;
  s.bag = ["elder_sign"];
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = settle(s);
  assert.equal(s.player.clues, 1);
  assert.equal(s.player.horror, 1);
});

test("Isabelle's Twin .45s fire a second agility shot for 1 ammo and an exhaust", () => {
  let s = ready([ISABELLE]);
  const guns = equip(s, 14, 6);
  const enemy = addEnemy(s, 132);
  s.bag = ["+1"];
  s = reduceGame(s, { type: "act", kind: "fight", target: enemy, source: guns });
  assert.equal(s.test?.skill, "combat");
  s = settle(s, { "Isabelle’s Twin .45s": "fire" });
  assert.ok(!s.enemies.some((e) => e.id === enemy), "two shots of 2 damage defeat it");
  const a = s.player.assets.find((x) => x.id === guns)!;
  assert.equal(a.uses, 4);
  assert.equal(a.exhausted, true);
});

test("Breaking Point deals extra direct damage at low remaining sanity", () => {
  for (const [horror, expected] of [
    [0, 1],
    [4, 2],
    [7, 3],
  ] as const) {
    let s = ready([ISABELLE]);
    s.player.horror = horror;
    s.player.deck = [{ id: "bp", code: C(15) }, { id: "cache", code: C(89) }];
    s = reduceGame(s, { type: "act", kind: "draw" });
    s = settle(s);
    assert.equal(s.player.damage, expected, `${horror} horror → ${expected} damage`);
    assert.ok(s.player.discard.some((c) => c.id === "bp"));
  }
});

test("Cloak of Resonance strikes back when horror is placed on it", () => {
  let s = ready([ISABELLE]);
  const cloak = equip(s, 58);
  const hound = addEnemy(s, 122);
  s.bag = ["0"];
  s = reduceGame(s, { type: "act", kind: "resource" });
  s = settle(s, {
    "Assign 1 damage and 1 horror": "self",
    "Assign 1 horror": cloak,
    "Cloak of Resonance": hound,
  });
  const a = s.player.assets.find((x) => x.id === cloak)!;
  assert.equal(a.horror, 1);
  assert.equal(a.exhausted, true);
  assert.equal(s.enemies.find((e) => e.id === hound)?.damage, 1);
});

test("Cosmic Flame fights with willpower, may spend a charge for damage, and loses a charge to the skull", () => {
  let s = ready([DEXTER]);
  const flame = equip(s, 59, 3);
  const cantor = addEnemy(s, 121);
  s.bag = ["skull"];
  s = reduceGame(s, { type: "act", kind: "fight", target: cantor, source: flame });
  assert.equal(s.test?.skill, "willpower");
  s = settle(s, { "Cosmic Flame": "spend" });
  assert.ok(!s.enemies.some((e) => e.id === cantor), "2 damage defeats the Cantor");
  assert.equal(s.player.assets.find((x) => x.id === flame)?.uses, 1);
});

test("Jim Culver adds willpower and draws a card after damage", () => {
  let s = ready([ISABELLE]);
  const jim = equip(s, 60);
  assert.equal(stats(s, "willpower"), 5);
  s.player.deck = [{ id: "bp", code: C(15) }, { id: "cache", code: C(89) }, { id: "guts", code: C(90) }];
  const hand = s.player.hand.length;
  s = reduceGame(s, { type: "act", kind: "draw" });
  s = settle(s, { "Jim Culver": "draw" });
  assert.equal(s.player.damage, 1);
  assert.equal(s.player.assets.find((x) => x.id === jim)?.exhausted, true);
  assert.equal(s.player.hand.length, hand + 1);
});

test("Lucky Charm moves 1 damage from an ally to the investigator for a charge", () => {
  let s = ready([ISABELLE]);
  const charm = equip(s, 61, 4);
  const jim = equip(s, 60);
  s.player.assets.find((x) => x.id === jim)!.damage = 1;
  assert.equal(canAct(s, "charm", "damage"), null);
  assert.match(canAct(s, "charm", "horror") || "", /Nothing/);
  s = reduceGame(s, { type: "act", kind: "charm", target: "damage" });
  assert.equal(s.decision?.title, "Lucky Charm");
  s = reduceGame(s, { type: "choose", id: jim });
  assert.equal(s.decision?.title, "Lucky Charm");
  s = reduceGame(s, { type: "choose", id: ISABELLE });
  s = settle(s);
  assert.equal(s.player.assets.find((x) => x.id === jim)?.damage, 0);
  assert.equal(s.player.damage, 1);
  const a = s.player.assets.find((x) => x.id === charm)!;
  assert.equal(a.uses, 3);
  assert.equal(a.exhausted, true);
  assert.equal(s.player.actions, 3, "a fast ability costs no action");
});

test("Premonition seals a token that is revealed instead of the next draw", () => {
  let s = ready([DEXTER]);
  const premonition = give(s, 64);
  const size = s.bag.length;
  s = reduceGame(s, { type: "play", id: premonition });
  s = settle(s);
  const sealed = s.player.assets.find((a) => a.code === C(64))?.sealed;
  assert.ok(sealed, "a token is sealed");
  assert.equal(s.bag.length, size - 1);
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "reveal" });
  assert.equal(s.test?.tokens[0], sealed);
  assert.equal(s.bag.length, size);
  assert.ok(!s.player.assets.some((a) => a.code === C(64)));
  assert.ok(s.player.discard.some((c) => c.code === C(64)));
});

test("Ward of Protection cancels a treachery's revelation for 1 resource and 1 horror", () => {
  let s = ready([ISABELLE]);
  const ward = give(s, 65);
  s.player.resources = 3;
  s.encounterDeck = [C(130)];
  s.bag = ["0"];
  s = reduceGame(s, { type: "endTurn" });
  s = settle(s, { "Ward of Protection": "ward" });
  assert.equal(s.player.resources, 3, "1 spent, 1 gained at upkeep");
  assert.equal(s.player.horror, 1);
  assert.equal(s.player.damage, 0, "Noxious Smoke never tested");
  assert.ok(s.player.discard.some((c) => c.id === ward));
  // The single-card encounter deck is reshuffled from the discard at once.
  assert.ok([...s.encounterDiscard, ...s.encounterDeck].includes(C(130)));
});

test("Will of the Cosmos places doom on a player card and discovers two clues", () => {
  let s = ready([DEXTER]);
  const dorm = s.locations.find((l) => l.code === C(117))!;
  dorm.active = true;
  dorm.revealed = true;
  dorm.clues = 1;
  const will = give(s, 66);
  s = reduceGame(s, { type: "play", id: will });
  s = settle(s, { "Will of the Cosmos": C(117) });
  assert.equal(s.doom, 1);
  assert.equal(s.player.clues, 2);
  assert.equal(dorm.clues, 1, "the fixture object is not mutated in place");
  assert.equal(s.locations.find((l) => l.code === C(117))!.clues, 0);
});

test("Soul Link costs 1 horror to commit and cannot be withdrawn", () => {
  let s = ready([ISABELLE]);
  const link = give(s, 67);
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "commit", id: link });
  assert.equal(s.player.horror, 1);
  assert.deepEqual(s.test!.committed, [link]);
  s = reduceGame(s, { type: "commit", id: link });
  assert.deepEqual(s.test!.committed, [link]);
  assert.equal(testValue(s), 2 + icons(C(67), "intellect"));
});

test("Paranoia loses every resource and Pursued punishes an enemy entering the location", () => {
  let s = ready([DEXTER]);
  s.player.deck = [{ id: "paranoia", code: C(101) }, { id: "cache", code: C(89) }];
  s = reduceGame(s, { type: "act", kind: "draw" });
  s = settle(s);
  assert.equal(s.player.resources, 0);
  assert.ok(s.player.discard.some((c) => c.id === "paranoia"));
  let p = ready([ISABELLE]);
  p.player.threats.push(C(102));
  p.decision = {
    title: "Fixture",
    description: "",
    choices: [{ id: "go", label: "Go", effects: [{ kind: "revelation", code: C(121) }] }],
  };
  p = reduceGame(p, { type: "choose", id: "go" });
  p = settle(p);
  assert.equal(p.player.horror, 1);
  assert.equal(canAct(p, "removeThreat", C(102)), null);
  p = reduceGame(p, { type: "act", kind: "removeThreat", target: C(102) });
  p = settle(p);
  assert.ok(!p.player.threats.includes(C(102)));
  assert.ok(p.player.discard.some((c) => c.code === C(102)));
});

test("Second Sight investigates with willpower and can spend a charge for an extra clue", () => {
  let s = ready([ISABELLE]);
  const sight = equip(s, 62, 3);
  s.bag = ["+1"];
  s = reduceGame(s, { type: "act", kind: "investigate", source: sight });
  assert.equal(s.test?.skill, "willpower");
  s = settle(s, { "Second Sight": "spend" });
  assert.equal(s.player.clues, 2);
  assert.equal(s.player.assets.find((x) => x.id === sight)?.uses, 2);
});

test("Spiritual Intuition boosts willpower by 2 on a Spell test", () => {
  let s = ready([DEXTER]);
  const intuition = equip(s, 63);
  const flame = equip(s, 59, 3);
  const enemy = addEnemy(s, 121);
  s = reduceGame(s, { type: "act", kind: "fight", target: enemy, source: flame });
  const before = testValue(s);
  s = reduceGame(s, { type: "boost", id: intuition });
  assert.equal(testValue(s), before + 2);
  assert.equal(s.player.resources, 4);
});
