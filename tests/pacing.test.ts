import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  reduceGame,
  party,
  canAct,
  canPlay,
  canSwitch,
} from "../src/game/engine";
import { card, code as C } from "../src/game/data";
import { decodeSave, validSave } from "../src/game/storage";
import type { Action, GameState } from "../src/game/types";
function ready(codes = ["12004"]) {
  let s = createGame("easy", 42, codes);
  while (s.status === "mulligan")
    s = reduceGame(s, { type: "mulligan", ids: [] });
  for (const p of party(s)) {
    p.hand = [];
    p.deck = [{ id: `safe-${p.code}`, code: C(89) }];
  }
  s.encounterDeck = [C(125), C(125), C(125)];
  s.bag = ["0"];
  return s;
}
function next(s: GameState) {
  assert.ok(s.event, "an explicit checkpoint is required");
  return reduceGame(s, { type: "continue", eventId: s.event.id });
}
function until(s: GameState, title: string) {
  for (let i = 0; i < 100; i++) {
    if (s.event?.title === title) return s;
    if (!s.event)
      throw Error(
        `Expected ${title}, got ${s.decision?.title || s.test?.title || s.phase}`,
      );
    s = next(s);
  }
  throw Error("Checkpoint loop");
}
test("every resource action pauses and no unrelated input can bypass its checkpoint", () => {
  let s = ready(["12004", "12001"]);
  s.player.hand = [{ id: "playable", code: C(89) }];
  s = reduceGame(s, { type: "act", kind: "resource" });
  assert.equal(s.player.resources, 6);
  assert.equal(s.event?.title, "Resource gained");
  assert.ok(
    s.event!.changes.some(
      (c) => c.label.includes("Actions") && c.before === "3" && c.after === "2",
    ),
  );
  for (const a of [
    { type: "endTurn" },
    { type: "act", kind: "draw" },
    { type: "switchInvestigator", code: "12001" },
    { type: "play", id: "playable" },
    { type: "reveal" },
    { type: "resolve" },
    { type: "choose", id: "skip" },
  ] as Action[])
    assert.equal(reduceGame(s, a), s);
  assert.ok(canAct(s, "draw"));
  assert.ok(canPlay(s, "playable"));
  assert.equal(canSwitch(s, "12001"), false);
  const id = s.event!.id;
  assert.equal(reduceGame(s, { type: "continue", eventId: id + 1 }), s);
  s = next(s);
  assert.equal(s.event, null);
  assert.equal(s.player.resources, 6);
  s = reduceGame(s, { type: "act", kind: "resource" });
  assert.equal(
    reduceGame(s, { type: "continue", eventId: id }),
    s,
    "stale/double click must not skip a later event",
  );
});
test("ending a turn pauses at phase boundaries before upkeep or the next mythos can run", () => {
  let s = ready();
  s = reduceGame(s, { type: "endTurn" });
  assert.equal(s.event?.title, "Investigation phase complete");
  assert.equal(s.round, 1);
  assert.equal(s.doom, 0);
  assert.equal(s.player.resources, 5);
  assert.equal(s.player.deck.length, 1);
  s = next(s);
  assert.equal(s.event?.title, "Enemy phase");
  assert.equal(s.round, 1);
  s = next(s);
  assert.equal(s.event?.title, "Upkeep phase");
  assert.equal(s.player.resources, 5);
  assert.equal(s.player.deck.length, 1);
  s = next(s);
  assert.equal(s.event?.title, "Card drawn");
  assert.equal(s.player.resources, 5);
  assert.equal(s.player.hand[0].code, C(89));
  s = next(s);
  assert.equal(s.event?.title, "Resources gained");
  assert.equal(s.player.resources, 6);
  assert.equal(s.round, 1);
  s = until(s, "Mythos · Round 2");
  assert.equal(s.doom, 0);
  assert.equal(s.encounterDeck.length, 3);
  s = next(s);
  assert.equal(s.event?.title, "Doom placed");
  assert.equal(s.event?.card, C(106));
  assert.equal(s.doom, 1);
  assert.equal(s.encounterDeck.length, 3);
});
test("an enemy attack is announced before damage, and damage pauses before later phases", () => {
  let s = ready();
  s.enemies = [
    {
      id: "attacker",
      code: C(123),
      location: s.player.location,
      damage: 0,
      engaged: true,
      engagedWith: s.player.code,
      exhausted: false,
    },
  ];
  s = until(reduceGame(s, { type: "endTurn" }), "Enemy attack");
  assert.equal(s.event!.card, C(123));
  assert.equal(s.player.damage, 0);
  assert.equal(s.player.horror, 0);
  assert.equal(s.event!.continueLabel, "Resolve attack");
  s = next(s);
  assert.equal(s.event?.title, "Damage and horror resolved");
  assert.equal(s.player.damage, card(C(123)).enemy_damage);
  assert.equal(s.player.horror, card(C(123)).enemy_horror || 0);
  assert.equal(s.round, 1);
  assert.equal(s.player.resources, 5);
  assert.ok(s.queue.length);
});
test("an encounter is revealed with no revelation side effects until acknowledged", () => {
  let s = ready();
  s.encounterDeck = [C(123)];
  s = until(reduceGame(s, { type: "endTurn" }), "Encounter revealed");
  assert.equal(s.event!.card, C(123));
  assert.equal(s.enemies.length, 0);
  assert.equal(s.queue[0].kind, "revelation");
  assert.equal(s.event!.continueLabel, "Resolve revelation");
  s = next(s);
  assert.equal(s.event?.title, "Revelation resolves");
  assert.equal(s.enemies.length, 1);
  assert.equal(s.enemies[0].engaged, false);
  s = next(s);
  assert.equal(s.event?.title, "Enemy engagement");
  assert.equal(s.enemies[0].engagedWith, "12004");
});
test("pending encounter reveal survives export, reload and import without early resolution", () => {
  let s = ready();
  s.encounterDeck = [C(125)];
  s = until(reduceGame(s, { type: "endTurn" }), "Encounter revealed");
  const restored = decodeSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(restored);
  assert.deepEqual(restored.event, JSON.parse(JSON.stringify(s.event)));
  assert.equal(restored.player.threats.length, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(next(restored))),
    JSON.parse(JSON.stringify(next(s))),
  );
});
test("each investigator's encounter is shown individually and the next round waits for all confirmations", () => {
  let s = ready(["12004", "12001", "12007"]);
  const encounters: string[] = [];
  let steps = 0;
  while (!(s.round === 2 && s.phase === "investigation" && !s.event)) {
    assert.ok(++steps < 100);
    if (s.event) {
      assert.ok(validSave(JSON.parse(JSON.stringify(s))));
      if (s.event.title === "Encounter revealed") {
        encounters.push(s.event.actor);
        assert.equal(
          party(s).find((p) => p.code === s.event!.actor)!.threats.length,
          0,
        );
      }
      s = next(s);
    } else s = reduceGame(s, { type: "endTurn" });
  }
  assert.deepEqual(encounters, ["12004", "12001", "12007"]);
  assert.ok(party(s).every((p) => p.threats.includes(C(125))));
});
test("skill result pauses after its consequence before investigator reactions are offered", () => {
  let s = ready();
  s = reduceGame(s, { type: "act", kind: "investigate" });
  assert.equal(s.event, null);
  assert.equal(s.test?.stage, "commit");
  s = reduceGame(s, { type: "reveal" });
  assert.equal(s.event, null);
  assert.equal(s.test?.stage, "revealed");
  s = reduceGame(s, { type: "resolve" });
  assert.equal(s.event?.title, "Clues discovered");
  assert.equal(s.player.clues, 1);
  assert.equal(s.decision, null);
  assert.equal(s.player.deck.length, 1);
  s = next(s);
  assert.equal(s.decision?.title, "A detective’s intuition");
});
test("draw events show only the card actually drawn, never the next card in the deck", () => {
  let s = ready();
  s.player.deck = [
    { id: "now", code: C(30) },
    { id: "future", code: C(45) },
  ];
  s = reduceGame(s, { type: "act", kind: "draw" });
  assert.equal(s.event?.card, C(30));
  assert.ok(!JSON.stringify(s.eventHistory).includes("M1903"));
  assert.ok(!JSON.stringify(s.eventHistory).includes("12045"));
  assert.equal(s.player.deck[0].id, "future");
});
test("reshuffling an empty player deck pauses before its horror and replacement draw", () => {
  let s = ready();
  s.player.deck = [];
  s.player.discard = [{ id: "replacement", code: C(89) }];
  s = reduceGame(s, { type: "act", kind: "draw" });
  assert.equal(s.event?.title, "Deck reshuffled");
  assert.equal(s.event?.card, undefined);
  assert.match(s.event!.description, /empty deck/);
  assert.equal(s.player.horror, 0);
  assert.equal(s.player.hand.length, 0);
  s = next(s);
  assert.equal(s.event?.title, "Damage and horror resolved");
  assert.equal(s.player.horror, 1);
  assert.equal(s.player.hand.length, 0);
  s = next(s);
  assert.equal(s.event?.title, "Card drawn");
  assert.equal(s.event?.card, C(89));
  assert.equal(s.player.hand[0].id, "replacement");
});
test("forced damage keeps its source card and pauses before resuming a boosted test", () => {
  let s = ready(["12007"]);
  s.player.threats = [C(103)];
  s.player.assets = [
    {
      id: "booster",
      code: C(35),
      damage: 0,
      horror: 0,
      uses: 0,
      exhausted: false,
    },
  ];
  s = reduceGame(s, { type: "act", kind: "investigate" });
  assert.equal(s.test?.stage, "commit");
  s = reduceGame(s, { type: "boost", id: "booster" });
  assert.equal(s.event?.title, "Damage and horror resolved");
  assert.equal(s.event?.card, C(103));
  assert.equal(s.event?.actor, "12007");
  assert.equal(s.player.damage, 1);
  assert.equal(s.test, null);
  assert.ok(
    s.event!.changes.some(
      (c) =>
        c.label.includes("Resources") && c.before === "5" && c.after === "4",
    ),
  );
  assert.equal(reduceGame(s, { type: "reveal" }), s);
  s = next(s);
  assert.equal(s.event, null);
  assert.equal(s.test?.stage, "commit");
  assert.equal(s.test?.bonus, 2);
});
test("fire identifies its source and owner before injury and the enemy phase can proceed", () => {
  let s = ready(["12001"]);
  s.locations.find((l) => l.code === s.player.location)!.fire = true;
  s = reduceGame(s, { type: "endTurn" });
  assert.equal(s.event?.actor, "scenario");
  s = next(s);
  assert.equal(s.event?.title, "Fire damage");
  assert.equal(s.event?.card, C(129));
  assert.equal(s.event?.actor, "12001");
  assert.match(s.event!.description, /Daniela Reyes/);
  assert.equal(s.player.damage, 0);
  assert.equal(s.round, 1);
  s = next(s);
  assert.equal(s.event?.title, "Damage and horror resolved");
  assert.equal(s.event?.card, C(129));
  assert.equal(s.player.damage, 1);
  assert.ok(!s.eventHistory.some((e) => e.title === "Enemy phase"));
});
test("version 2 saves acquire the new pacing state without losing party data", () => {
  const old: any = ready(["12004", "12001"]);
  old.version = 2;
  delete old.event;
  delete old.eventSerial;
  delete old.eventHistory;
  const s = decodeSave(old)!;
  assert.ok(s);
  assert.equal(s.version, 3);
  assert.equal(s.event, null);
  assert.deepEqual(s.eventHistory, []);
  assert.equal(party(s).length, 2);
  assert.ok(reduceGame(s, { type: "act", kind: "resource" }).event);
});
test("malformed or mismatched pending events are rejected rather than resumed", () => {
  const s = reduceGame(ready(), { type: "act", kind: "resource" });
  for (const mutate of [
    (x: any) => x.event.id++,
    (x: any) => (x.event.actor = "not-a-seat"),
    (x: any) => (x.event.changes = [{}]),
    (x: any) => (x.event.card = "not-a-card"),
    (x: any) => (x.eventHistory = []),
  ]) {
    const broken = structuredClone(s);
    mutate(broken);
    assert.equal(validSave(broken), false);
  }
});
