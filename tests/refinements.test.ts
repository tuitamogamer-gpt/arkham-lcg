import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  reduceGame as raw,
  canAct,
  testValue,
} from "../src/game/engine";
import { reduceGame as step } from "./helpers";
import { decodeSave } from "../src/game/storage";
import type { GameState, Effect } from "../src/game/types";

function ready(code = "12004") {
  let s = createGame("easy", 712, [code]);
  s = step(s, { type: "mulligan", ids: [] });
  s.player.hand = [];
  s.player.assets = [];
  s.player.deck = [{ id: "safe", code: "12089" }];
  s.bag = ["0"];
  s.enemies = [
    {
      id: "enemy",
      code: "12122",
      location: s.player.location,
      engaged: true,
      engagedWith: code,
      exhausted: false,
      damage: 0,
    },
  ];
  s.player.assets.push({
    id: "pistol",
    code: "12019",
    uses: 4,
    exhausted: false,
    damage: 0,
    horror: 0,
  });
  return s;
}
function trigger(s: GameState, effects: Effect[]) {
  s.decision = {
    title: "Fixture",
    description: "",
    choices: [{ id: "go", label: "Go", effects }],
  };
  return raw(s, { type: "choose", id: "go" });
}
function drain(s: GameState) {
  for (let n = 0; s.event; n++) {
    assert.ok(n < 100);
    s = raw(s, { type: "continue", eventId: s.event.id });
  }
  return s;
}
test("M1911 Fight spends one action and ammo and deals two damage on success", () => {
  let s = ready();
  s = step(s, {
    type: "act",
    kind: "fight",
    target: "enemy",
    source: "pistol",
  });
  assert.equal(s.player.actions, 2);
  assert.equal(s.player.assets[0].uses, 3);
  assert.equal(s.test?.source, "pistol");
  assert.equal(testValue(s), 5);
  s = step(s, { type: "reveal" });
  s = step(s, { type: "resolve" });
  assert.equal(s.enemies[0].damage, 2);
  assert.equal(
    s.player.damage,
    0,
    "Fight does not provoke an attack of opportunity",
  );
});
test("empty firearms explain their own name and cannot spend ammo below zero", () => {
  const s = ready("12007");
  s.player.assets[0].code = "12045";
  s.player.assets[0].uses = 0;
  assert.equal(
    canAct(s, "fight", "enemy", "pistol"),
    "M1903 Hammerless is out of ammunition.",
  );
  const next = step(s, {
    type: "act",
    kind: "fight",
    target: "enemy",
    source: "pistol",
  });
  assert.equal(next.player.assets[0].uses, 0);
  assert.equal(next.player.actions, 3);
});
test("Daniela's actual post-attack reaction uses ammo, costs no action, and never prevents injuries", () => {
  let s = ready("12001");
  s.enemies[0].code = "12123";
  s = drain(
    trigger(s, [{ kind: "attack", id: "enemy", source: "opportunity" }]),
  );
  while (s.decision && s.decision.title !== "Daniela strikes back") {
    const choice =
      s.decision.choices.find((c) => /Daniela/.test(c.label)) ||
      s.decision.choices.find((c) => c.id === "self") ||
      s.decision.choices[0];
    s = step(s, { type: "choose", id: choice.id });
  }
  assert.equal(s.decision?.title, "Daniela strikes back");
  assert.match(s.decision!.description, /does not prevent/);
  assert.ok(s.player.damage + s.player.horror > 0);
  const injuries = [s.player.damage, s.player.horror];
  s = step(s, { type: "choose", id: "pistol" });
  assert.equal(s.player.actions, 3);
  assert.equal(s.player.assets[0].uses, 3);
  assert.deepEqual([s.player.damage, s.player.horror], injuries);
  assert.equal(s.test?.source, "pistol");
});
test("act and agenda transitions preserve both story faces and survive saves", () => {
  for (const kind of ["act", "agenda"] as const) {
    const s = ready();
    s.enemies = [];
    if (kind === "agenda") s.doom = 2;
    const next = trigger(s, [
      { kind: kind === "act" ? "advanceAct" : "doom", amount: 1 },
    ]);
    assert.deepEqual(
      next.event?.story,
      kind === "act"
        ? { kind, previous: "12109", current: "12110" }
        : { kind, previous: "12106", current: "12107" },
    );
    assert.deepEqual(
      decodeSave(JSON.parse(JSON.stringify(next)))?.event?.story,
      next.event?.story,
    );
  }
});
test("a resolved treachery visibly enters encounter discard after its effects", () => {
  let s = ready();
  s.enemies = [];
  s = trigger(s, [{ kind: "endEncounter", code: "12130" }]);
  assert.equal(s.event?.title, "Encounter complete");
  assert.equal(s.event?.encounter?.destination, "Encounter discard pile");
  assert.ok(s.event?.changes.some((c) => c.after === "Encounter discard"));
  assert.equal(
    decodeSave(JSON.parse(JSON.stringify(s)))?.event?.encounter?.stage,
    "resolved",
  );
});
test("malformed optional story metadata is rejected on import", () => {
  const s = trigger(ready(), [{ kind: "advanceAct" }]);
  const malformed = JSON.parse(JSON.stringify(s));
  malformed.event.story = { kind: "act", previous: "not-a-card" };
  assert.equal(decodeSave(malformed), null);
});

test("a duplicate threat reports discard without claiming it attached again", () => {
  let s = ready();
  s.player.threats = ["12125"];
  s.encounterDeck = ["12125"];
  s = trigger(s, [{ kind: "encounter" }]);
  s = raw(s, { type: "continue", eventId: s.event!.id });
  assert.match(s.event!.encounter!.destination, /Encounter discard pile/);
  s = raw(s, { type: "continue", eventId: s.event!.id });
  assert.equal(s.event!.title, "Encounter complete");
  assert.match(s.event!.encounter!.destination, /Encounter discard pile/);
  assert.equal(s.player.threats.length, 1);
});

test("Fire! reports the actual attachment or discard destination", () => {
  for (const alreadyBurning of [false, true]) {
    let s = ready();
    s.enemies = [];
    s.locations
      .filter((l) => l.active)
      .forEach((l) => (l.fire = alreadyBurning));
    s.encounterDeck = ["12129"];
    s = trigger(s, [{ kind: "encounter" }]);
    for (let n = 0; n < 10 && s.event?.title !== "Encounter complete"; n++) {
      assert.ok(s.event);
      s = raw(s, { type: "continue", eventId: s.event.id });
    }
    assert.equal(s.event?.title, "Encounter complete");
    assert.match(
      s.event!.encounter!.destination,
      alreadyBurning
        ? /Encounter discard pile/
        : /Your Friend's Room · attached Fire!/,
    );
  }
});
