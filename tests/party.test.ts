import { reduceGame } from "./helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { card, code as C, STARTER_DECKS } from "../src/game/data";
import {
  createGame,
  party,
  partySize,
  canSwitch,
  canAct,
  canPlay,
  health,
  sanity,
  enemyHealth,
  testValue,
  stats,
} from "../src/game/engine";
import { validSave, decodeSave } from "../src/game/storage";
import type { GameState, Investigator } from "../src/game/types";
const codes = ["12004", "12001", "12007"];
function ready(cs = codes) {
  let s = createGame("easy", 7331, cs);
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
      s = reduceGame(s, { type: "choose", id });
    }
  }
  return s;
}
function addEnemy(
  s: GameState,
  n = 121,
  who = s.player.code,
  at = s.player.location,
) {
  const id = `enemy-${s.nextId++}`;
  s.enemies.push({
    id,
    code: C(n),
    location: at,
    damage: 0,
    exhausted: false,
    engaged: true,
    engagedWith: who,
  });
  return id;
}
function equip(s: GameState, n: number, uses = 0, p = s.player) {
  const id = `asset-${s.nextId++}`;
  p.assets.push({
    id,
    code: C(n),
    uses,
    exhausted: false,
    damage: 0,
    horror: 0,
  });
  return id;
}
function give(s: GameState, n: number, p = s.player) {
  const id = `hand-${s.nextId++}`;
  p.hand.push({ id, code: C(n) });
  return id;
}
function member(s: GameState, c: string) {
  return party(s).find((p) => p.code === c)!;
}
function queue(s: GameState, effect: object) {
  s.decision = {
    title: "fixture",
    description: "",
    choices: [{ id: "go", label: "go", effects: [effect as any] }],
  };
  return reduceGame(s, { type: "choose", id: "go" });
}
function endAll(s: GameState) {
  const r = s.round;
  let n = 0;
  while (s.round === r && s.status === "playing") {
    assert.ok(++n < 10);
    s = settle(reduceGame(s, { type: "endTurn" }));
  }
  return s;
}

test("1–3 unique investigators each receive their exact official 33-card starter and safe mulligan", () => {
  for (let n = 1; n <= 3; n++) {
    let s = createGame("standard", 100, codes.slice(0, n));
    assert.equal(partySize(s), n);
    assert.equal(s.locations[0].clues, 2 * n);
    for (const p of party(s)) {
      assert.deepEqual(
        [...p.deck, ...p.hand].map((c) => c.code).sort(),
        [...STARTER_DECKS[p.code]].sort(),
      );
      assert.ok(p.hand.every((c) => !card(c.code).subtype_code));
    }
    const ids = party(s).flatMap((p) =>
      [...p.hand, ...p.deck].map((c) => c.id),
    );
    assert.equal(new Set(ids).size, 33 * n);
    for (let i = 0; i < n; i++) {
      assert.equal(s.player.code, codes[i]);
      const old = s.player.hand.map((c) => c.id);
      s = reduceGame(s, { type: "mulligan", ids: old });
      assert.ok(member(s, codes[i]).hand.every((c) => !old.includes(c.id)));
    }
    assert.equal(s.status, "playing");
    assert.ok(validSave(JSON.parse(JSON.stringify(s))));
  }
  assert.throws(() => createGame("easy", 1, []));
  assert.throws(() => createGame("easy", 1, ["12004", "12004"]));
  assert.throws(() => createGame("easy", 1, ["12010"]));
});
test("seat changes preserve ownership and cannot interleave investigator turns", () => {
  let s = ready();
  s = reduceGame(s, { type: "switchInvestigator", code: "12001" });
  assert.equal(s.player.code, "12001");
  s = reduceGame(s, { type: "act", kind: "resource" });
  assert.equal(s.player.resources, 6);
  assert.equal(s.player.actions, 2);
  assert.equal(canSwitch(s, "12004"), false);
  s = reduceGame(s, { type: "switchInvestigator", code: "12004" });
  assert.equal(s.player.code, "12001");
  s = reduceGame(s, { type: "endTurn" });
  assert.equal(s.player.code, "12004");
  assert.equal(s.player.actions, 3);
  assert.equal(s.player.resources, 5);
  assert.equal(s.round, 1);
  assert.equal(s.doom, 0);
  assert.equal(member(s, "12001").turnEnded, true);
  assert.equal(canSwitch(s, "12001"), false);
});
test("one shared round gives each investigator upkeep and one encounter, with one doom", () => {
  let s = ready();
  for (const p of party(s)) {
    p.deck = [{ id: `safe-${p.code}`, code: C(89) }];
    p.hand = [];
  }
  s.encounterDeck = [C(125), C(125), C(125)];
  s = endAll(s);
  assert.equal(s.round, 2);
  assert.equal(s.doom, 1);
  assert.equal(s.phase, "investigation");
  assert.equal(s.encounterDeck.length, 0);
  for (const p of party(s)) {
    assert.equal(p.resources, 6);
    assert.equal(p.hand.length, 1);
    assert.equal(p.actions, 3);
    assert.equal(p.turnEnded, false);
    assert.deepEqual(p.threats, [C(125)]);
  }
  assert.equal(s.player.code, s.leadInvestigator);
});
test("enemy opportunity attacks and movement follow only their engaged investigator", () => {
  let s = ready(["12004", "12007"]);
  const id = addEnemy(s, 121, "12007");
  s = reduceGame(s, { type: "act", kind: "resource" });
  assert.equal(s.decision, null);
  assert.equal(s.player.damage, 0);
  s = reduceGame(s, { type: "endTurn" });
  s.bag = ["0"];
  s = settle(reduceGame(s, { type: "act", kind: "resource" }));
  assert.ok(s.player.damage + s.player.horror > 0);
  assert.equal(member(s, "12004").damage, 0);
  s.locations.find((l) => l.code === C(117))!.active = true;
  s = settle(reduceGame(s, { type: "act", kind: "move", target: C(117) }));
  assert.equal(s.enemies.find((e) => e.id === id)?.location, C(117));
  assert.equal(member(s, "12004").location, C(113));
});
test("engage transfers an enemy from a teammate, and a failed fight damages that teammate", () => {
  let s = ready(["12004", "12007"]);
  const id = addEnemy(s, 123, "12007");
  s.bag = ["auto_fail"];
  s = settle(reduceGame(s, { type: "act", kind: "fight", target: id }));
  assert.equal(member(s, "12007").damage, 1);
  assert.equal(member(s, "12004").damage, 0);
  s = settle(reduceGame(s, { type: "act", kind: "engage", target: id }));
  assert.equal(s.enemies[0].engagedWith, "12004");
});
test("teammates at the same location each commit at most one card; cards return to the correct discard", () => {
  let s = ready();
  s.bag = ["0"];
  const d = member(s, "12001"),
    t = member(s, "12007");
  const a = give(s, 94, d),
    b = give(s, 94, d),
    c = give(s, 93, t);
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "commit", id: a });
  assert.equal(testValue(s), 6);
  s = reduceGame(s, { type: "commit", id: b });
  assert.match(s.error!, /at most one/);
  s = reduceGame(s, { type: "commit", id: c });
  s = settle(s);
  assert.ok(member(s, "12001").discard.some((x) => x.id === a));
  assert.ok(member(s, "12007").discard.some((x) => x.id === c));
  assert.ok(!s.player.discard.some((x) => x.id === a));
});
test("a teammate at another location cannot commit and cannot switch while a test is pending", () => {
  let s = ready();
  const d = member(s, "12001");
  d.location = C(117);
  s.locations[1].active = true;
  const a = give(s, 94, d);
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "commit", id: a });
  assert.deepEqual(s.test!.committed, []);
  assert.equal(canSwitch(s, "12001"), false);
  assert.ok(validSave(JSON.parse(JSON.stringify(s))));
});
test("acts scale clue cost, require the whole party to escape, and scale the Servant health", () => {
  let s = ready();
  for (const p of party(s)) {
    p.clues = 2;
    p.deck = [{ id: `draw-${p.code}`, code: C(89) }];
  }
  s.encounterDeck = [C(125), C(125), C(125)];
  s = reduceGame(s, { type: "endTurn" });
  s = reduceGame(s, { type: "endTurn" });
  s = reduceGame(s, { type: "endTurn" });
  s = settle(s, { "Advance the act?": "advance" });
  assert.equal(s.act, 2);
  assert.equal(
    party(s).reduce((n, p) => n + p.clues, 0),
    0,
  );
  assert.equal(enemyHealth(s, s.enemies[0]), 15);
  s.enemies = [];
  for (const p of party(s)) p.location = C(116);
  s.player.location = C(117);
  s = settle(queue(s, { kind: "act2check" }));
  assert.equal(s.act, 2);
  s.player.location = C(116);
  s = settle(queue(s, { kind: "act2check" }));
  assert.equal(s.act, 3);
  assert.equal(s.locations[0].active, false);
  assert.equal(canAct(s, "move", C(118)), null);
  s.player.actions = 0;
  assert.match(canAct(s, "move", C(118))!, /action/);
});
test("only clues from investigators at the library can pay Act 3; boss damage spends group clues", () => {
  let s = ready();
  s.act = 3;
  s.locations.forEach((l) => (l.active = l.code !== C(113)));
  for (const p of party(s)) {
    p.location = C(120);
    p.clues = 3;
  }
  s.player.location = C(116);
  s = queue(s, { kind: "roundEnd", actor: "scenario" });
  assert.notEqual(s.decision?.title, "Advance the act?");
  s = ready();
  s.act = 4;
  for (const p of party(s)) p.clues = 1;
  const id = addEnemy(s, 114);
  s = settle(reduceGame(s, { type: "act", kind: "clueDamage", target: id }));
  assert.equal(s.enemies[0].damage, 3);
  assert.equal(
    party(s).reduce((n, p) => n + p.clues, 0),
    0,
  );
  assert.equal(s.player.actions, 3);
});
test("fire resolves once after all turns, and agenda tests target every surviving investigator", () => {
  let s = ready();
  s.locations[0].fire = true;
  for (const p of party(s)) {
    p.deck = [{ id: `draw-${p.code}`, code: C(89) }];
  }
  s.encounterDeck = [C(125), C(125), C(125)];
  s = reduceGame(s, { type: "endTurn" });
  assert.equal(
    party(s).reduce((n, p) => n + p.damage, 0),
    0,
  );
  s = reduceGame(s, { type: "endTurn" });
  assert.equal(
    party(s).reduce((n, p) => n + p.damage, 0),
    0,
  );
  s = settle(reduceGame(s, { type: "endTurn" }));
  assert.ok(party(s).every((p) => p.damage === 1));
  s = ready();
  s.bag = ["auto_fail"];
  s.doom = 2;
  s = settle(queue(s, { kind: "doom", amount: 1 }));
  assert.equal(s.agenda, 2);
  assert.ok(party(s).every((p) => p.horror === 1));
});
test("defeat drops clues, preserves the rest of the party, and keeps original player scaling", () => {
  let s = ready();
  s.player.damage = 6;
  s.player.clues = 2;
  s = settle(queue(s, { kind: "damage", damage: 1, direct: true }));
  assert.equal(member(s, "12004").status, "defeated");
  assert.equal(member(s, "12004").physicalTrauma, 1);
  assert.equal(s.locations[0].clues, 8);
  assert.equal(s.status, "playing");
  assert.equal(s.player.code, "12001");
  assert.equal(s.leadInvestigator, "12001");
  assert.equal(partySize(s), 3);
  assert.ok(validSave(s));
});
test("resignation ends one investigator, and the scenario ends only when everyone leaves", () => {
  let s = ready();
  s.act = 4;
  for (let i = 0; i < 3; i++) {
    s = settle(reduceGame(s, { type: "act", kind: "resign" }));
    if (i < 2) assert.equal(s.status, "playing");
  }
  assert.equal(s.status, "resolution");
  assert.equal(s.campaign.result, "resigned");
  assert.ok(party(s).every((p) => p.status === "resigned"));
});
test("Daniela and Trish use their printed health and sanity; Joe ability never leaks", () => {
  let s = ready(["12001", "12007"]);
  assert.equal(health(s), 9);
  assert.equal(sanity(s), 5);
  s.bag = ["+1"];
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "reveal" });
  s = reduceGame(s, { type: "resolve" });
  assert.notEqual(s.decision?.title, "A detective’s intuition");
  s = settle(reduceGame(s, { type: "endTurn" }));
  assert.equal(health(s), 8);
  assert.equal(sanity(s), 6);
});
test("Trish gets one extra evade, and the Operative reengages her without a clue", () => {
  let s = ready(["12007"]);
  s.bag = ["0"];
  const id = addEnemy(s, 9);
  s = settle(reduceGame(s, { type: "act", kind: "evade", target: id }));
  assert.equal(s.player.actions, 3);
  assert.equal(s.player.flags.extraEvade, true);
  assert.equal(s.enemies[0].exhausted, false);
  assert.equal(s.enemies[0].engagedWith, "12007");
  assert.ok(s.player.damage + s.player.horror > 0);
  s.player.clues = 1;
  s = settle(reduceGame(s, { type: "act", kind: "evade", target: id }));
  assert.equal(s.player.actions, 2);
  assert.equal(s.enemies[0].exhausted, true);
  assert.equal(s.player.clues, 0);
});
test("Daniela can react to an attack on a teammate using her own weapon, then control returns", () => {
  let s = ready(["12004", "12001"]);
  s.bag = ["0"];
  equip(s, 2, 0, member(s, "12001"));
  const id = addEnemy(s, 121);
  s = queue(s, { kind: "attack", id });
  s = settle(s, { "Daniela strikes back": "basic" });
  assert.equal(s.player.code, "12004");
  assert.equal(member(s, "12001").flags.daniela, true);
  assert.equal(member(s, "12001").actions, 3);
  assert.ok(!s.enemies.length || s.enemies[0].damage > 0);
});
test("new starter weapons and Thieves Kit consume uses and use their correct skills", () => {
  let s = ready(["12007"]);
  s.bag = ["0"];
  const kit = equip(s, 49, 6);
  s = reduceGame(s, { type: "act", kind: "investigate", source: kit });
  assert.equal(s.decision?.title, "Thieves’ Kit");
  s = reduceGame(s, { type: "choose", id: "agility" });
  assert.equal(s.test!.skill, "agility");
  s = settle(s);
  assert.equal(s.player.resources, 6);
  assert.equal(s.player.assets[0].uses, 5);
  const gun = equip(s, 45, 4),
    id = addEnemy(s, 121);
  s.enemies[0].exhausted = true;
  s.enemies[0].engaged = false;
  s = reduceGame(s, { type: "act", kind: "fight", target: id, source: gun });
  assert.equal(s.test!.skill, "agility");
  assert.equal(s.player.assets.find((a) => a.id === gun)!.uses, 3);
});
test("Timely Intervention can change a revealed failure without drawing another token", () => {
  let s = ready(["12001"]);
  s.bag = ["-1"];
  const id = give(s, 81);
  s = queue(s, {
    kind: "test",
    skill: "willpower",
    difficulty: card("12001").skill_willpower!,
    title: "Smoke",
    source: "12130",
  });
  s = reduceGame(s, { type: "reveal" });
  assert.equal(s.test!.success, false);
  const tokens = [...s.test!.tokens];
  s = reduceGame(s, { type: "commit", id });
  assert.equal(s.test!.success, true);
  assert.deepEqual(s.test!.tokens, tokens);
});
test("Bandages can heal a teammate and spends the owner’s supply, preserving active seat", () => {
  let s = ready(["12004", "12001"]);
  equip(s, 73, 3, member(s, "12001"));
  s = queue(s, { kind: "damage", damage: 1, direct: true });
  s = settle(s, { Bandages: "heal" });
  assert.equal(member(s, "12004").damage, 0);
  assert.equal(member(s, "12001").assets[0].uses, 2);
  assert.equal(s.player.code, "12004");
});
test("new revelation weaknesses are personal, forced costs trigger, and removing them uses two actions", () => {
  let s = ready(["12007"]);
  s.player.deck = [{ id: "weak", code: C(103) }];
  s = reduceGame(s, { type: "act", kind: "draw" });
  assert.ok(s.player.threats.includes(C(103)));
  const c = give(s, 88);
  s = settle(reduceGame(s, { type: "play", id: c }));
  assert.equal(s.player.damage, 1);
  s.player.actions = 2;
  s = reduceGame(s, { type: "act", kind: "removeThreat", target: C(103) });
  assert.equal(s.player.actions, 0);
  assert.ok(!s.player.threats.length);
  assert.ok(s.player.discard.some((c) => c.code === C(103)));
});
test("legacy solo saves migrate and party saves preserve an encounter owner and pending test", () => {
  let s = ready(["12004"]);
  const x = JSON.parse(JSON.stringify(s));
  x.version = 1;
  x.actions = 2;
  x.actionsTaken = 1;
  delete x.companions;
  delete x.partyOrder;
  delete x.leadInvestigator;
  delete x.turnInvestigator;
  const migrated = decodeSave(x);
  assert.ok(migrated);
  assert.equal(migrated.player.actions, 2);
  assert.equal(migrated.partyOrder.length, 1);
  s = ready();
  s = queue(s, {
    kind: "test",
    actor: "12007",
    skill: "willpower",
    difficulty: 3,
    title: "Encounter",
    source: "12130",
  });
  const saved = decodeSave(JSON.parse(JSON.stringify(s)));
  assert.ok(saved);
  assert.equal(saved.player.code, "12007");
  assert.equal(
    JSON.stringify(reduceGame(saved, { type: "reveal" })),
    JSON.stringify(reduceGame(s, { type: "reveal" })),
  );
  const invalid = JSON.parse(JSON.stringify(s));
  invalid.companions[0].code = invalid.player.code;
  assert.equal(validSave(invalid), false);
});

test("three investigators can pay the library objective, choose Armitage, and finish the scaled boss", () => {
  let s = ready();
  s.act = 3;
  s.locations.forEach((l) => {
    l.active = l.code !== C(113);
    l.revealed = l.active;
  });
  for (const p of party(s)) {
    p.location = C(120);
    p.clues = 3;
  }
  s.encounterDeck = [C(125), C(125), C(125)];
  s.encounterDiscard = [];
  s = queue(s, { kind: "roundEnd", actor: "scenario" });
  assert.equal(s.decision?.title, "Advance the act?");
  s = settle(s, {
    "Advance the act?": "advance",
    "Dr. Henry Armitage": "12001",
  });
  assert.equal(s.act, 4);
  assert.ok(member(s, "12001").assets.some((a) => a.code === C(115)));
  assert.equal(s.locations.find((l) => l.code === C(116))!.clues, 9);
  const boss = s.enemies.find((e) => e.code === C(114))!;
  assert.equal(enemyHealth(s, boss), 15);
  s.player.location = C(116);
  for (const p of party(s)) p.clues = 5;
  for (let i = 0; i < 5; i++)
    s = settle(
      reduceGame(s, { type: "act", kind: "clueDamage", target: boss.id }),
      { "The masked pursuer falls": "save" },
    );
  assert.equal(s.status, "resolution");
  assert.equal(s.campaign.result, "saved");
  assert.ok(party(s).every((p) => p.physicalTrauma === 1 && p.xp >= 4));
  assert.ok(
    s.campaign.notes.some((n) => n.includes("Daniela Reyes is the bearer")),
  );
});
test("hunters pursue the nearest investigator and attack the correct seat", () => {
  let s = ready();
  s.act = 2;
  s.locations.forEach(
    (l) => (l.active = [C(113), C(117), C(116)].includes(l.code)),
  );
  member(s, "12007").location = C(117);
  s.encounterDeck = [C(125), C(125), C(125)];
  for (const p of party(s)) p.deck = [{ id: `safe-${p.code}`, code: C(89) }];
  const id = addEnemy(s, 122, "12004", C(116));
  s.enemies[0].engaged = false;
  delete s.enemies[0].engagedWith;
  s = settle(queue(s, { kind: "enemyPhase", actor: "scenario" }));
  assert.equal(s.enemies.find((e) => e.id === id)!.location, C(117));
  assert.equal(s.enemies[0].engagedWith, "12007");
  assert.equal(member(s, "12007").damage, 1);
  assert.equal(member(s, "12007").horror, 1);
  assert.equal(member(s, "12004").damage, 0);
});
test("a death during phase-end fire does not start an extra round or duplicate the encounter phase", () => {
  let s = ready(["12004", "12007"]);
  member(s, "12007").damage = 7;
  s.locations[0].fire = true;
  s.encounterDeck = [C(125), C(125), C(125)];
  s = endAll(s);
  assert.equal(member(s, "12007").status, "defeated");
  assert.equal(s.round, 2);
  assert.equal(s.doom, 1);
  assert.equal(s.encounterDeck.length, 2);
  assert.equal(s.player.code, "12004");
  assert.equal(s.player.actions, 3);
});
test("unique allies are shared across the party, and personal limit assets cannot be duplicated", () => {
  let s = ready();
  equip(s, 18, 0, member(s, "12001"));
  const c = give(s, 18);
  assert.match(canPlay(s, c)!, /unique/);
  s = ready(["12007"]);
  equip(s, 48);
  assert.match(canPlay(s, give(s, 48))!, /Limit 1/);
});
test("Daniela’s Wrench provokes an attack then allows her free retaliation with the damage bonus", () => {
  let s = ready(["12001"]);
  s.bag = ["0"];
  const weapon = equip(s, 2),
    id = addEnemy(s, 122);
  s = settle(reduceGame(s, { type: "act", kind: "wrench", target: id }), {
    "Daniela strikes back": weapon,
  });
  assert.equal(s.player.actions, 3);
  assert.ok(s.player.assets.find((a) => a.id === weapon)!.exhausted);
  assert.equal(s.enemies[0].damage, 2);
  assert.ok(s.player.flags.daniela);
});
test("Covert Ops and Sticky Fingers resolve as separate optional reactions after evasion", () => {
  let s = ready(["12007"]);
  s.bag = ["0"];
  equip(s, 8);
  equip(s, 48);
  const id = addEnemy(s, 123);
  const before = s.player.hand.length;
  s = settle(reduceGame(s, { type: "act", kind: "evade", target: id }), {
    "Covert Ops": "draw",
    "Sticky Fingers": "use",
  });
  assert.equal(s.player.hand.length, before + 1);
  assert.equal(s.player.resources, 6);
  assert.ok(s.player.assets.every((a) => a.exhausted));
  assert.equal(s.player.actions, 3);
});
test("Look what I found rewards a narrow failure, and Breaking and Entering can evade without an attack", () => {
  let s = ready(["12001"]);
  s.player.hand = [];
  give(s, 78);
  s.bag = ["-1"];
  s = settle(reduceGame(s, { type: "act", kind: "investigate" }), {
    "Look what I found!": "play",
  });
  assert.equal(s.player.clues, 2);
  assert.equal(s.player.resources, 3);
  s = ready(["12007"]);
  s.bag = ["0"];
  const en = addEnemy(s, 123),
    event = give(s, 50);
  s = settle(reduceGame(s, { type: "play", id: event }), {
    "Breaking and Entering": en,
  });
  assert.equal(s.player.damage, 0);
  assert.equal(s.player.clues, 1);
  assert.ok(s.enemies[0].exhausted);
  assert.equal(s.player.actions, 2);
});
test("Prestidigitation discounts an item and returns one at the end of that investigator’s turn", () => {
  let s = ready(["12007", "12004"]);
  s.player.hand = [];
  const event = give(s, 52),
    item = give(s, 49);
  s = settle(reduceGame(s, { type: "play", id: event }), {
    Prestidigitation: item,
  });
  assert.equal(s.player.resources, 3);
  assert.equal(s.player.actions, 3);
  assert.ok(s.player.assets.some((a) => a.id === item));
  s = settle(reduceGame(s, { type: "endTurn" }));
  assert.equal(s.player.code, "12004");
  assert.ok(member(s, "12007").hand.some((c) => c.id === item));
  assert.equal(member(s, "12007").assets.length, 0);
});
test("Syndicate Obligations damage resolves during a boost before the pending test can continue", () => {
  let s = ready(["12007"]);
  s.player.threats = [C(103)];
  const boost = equip(s, 35);
  equip(s, 46); // An ally creates a real damage-assignment decision.
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "boost", id: boost });
  assert.equal(s.test, null);
  assert.ok(s.decision);
  assert.ok(validSave(JSON.parse(JSON.stringify(s))));
  assert.equal(reduceGame(s, { type: "reveal" }).test, null);
  s = settle(s);
  assert.equal(s.player.damage, 1);
  assert.equal(s.player.resources, 4);
  assert.ok(validSave(s));
  // With no eligible soak, the forced damage resolves immediately, before drawing a token.
  s = ready(["12007"]);
  s.player.threats = [C(103)];
  const unsoakedBoost = equip(s, 35);
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s = reduceGame(s, { type: "boost", id: unsoakedBoost });
  assert.equal(s.player.damage, 1);
  assert.equal(s.test?.stage, "commit");
});
test("a missed Wrench attack includes its damage bonus against an engaged teammate", () => {
  let s = ready(["12001", "12004"]);
  const weapon = equip(s, 2),
    enemy = addEnemy(s, 123, "12004");
  s.player.flags[`attacked_${enemy}`] = true;
  s.bag = ["auto_fail"];
  s = settle(
    reduceGame(s, {
      type: "act",
      kind: "fight",
      target: enemy,
      source: weapon,
    }),
  );
  assert.equal(member(s, "12004").damage, 2);
});
test("damage during a skill boost preserves the waiting effect queue until that test finishes", () => {
  let s = ready(["12007", "12004"]);
  s.bag = ["0"];
  s.player.threats = [C(103)];
  const boost = equip(s, 35);
  s = reduceGame(s, { type: "act", kind: "investigate" });
  s.queue.push({ kind: "gain", amount: 3, actor: "12004" });
  s = reduceGame(s, { type: "boost", id: boost });
  assert.equal(s.test?.stage, "commit");
  assert.equal(s.player.code, "12007");
  assert.equal(member(s, "12004").resources, 5);
  s = settle(s);
  assert.equal(member(s, "12004").resources, 8);
  assert.equal(s.player.code, "12007");
});
test("legacy completed investigations preserve earned experience, trauma and resignation", () => {
  const old = JSON.parse(JSON.stringify(ready(["12004"])));
  old.version = 1;
  old.actions = old.player.actions;
  old.actionsTaken = old.player.actionsTaken;
  old.status = "resolution";
  old.campaign = {
    notes: [],
    result: "resigned",
    xp: 3,
    physicalTrauma: 1,
    mentalTrauma: 2,
  };
  const restored = decodeSave(old)!;
  assert.ok(restored);
  assert.equal(restored.player.xp, 3);
  assert.equal(restored.player.physicalTrauma, 1);
  assert.equal(restored.player.mentalTrauma, 2);
  assert.equal(restored.player.status, "resigned");
});
test("In Harm’s Way counts three damage events and Jumpsuit recovers a tool without using an action", () => {
  let s = ready(["12001"]);
  s.player.threats = [C(3)];
  const id = addEnemy(s, 114);
  for (let i = 0; i < 3; i++)
    s = settle(queue(s, { kind: "enemyDamage", id, amount: 1 }));
  assert.equal(s.player.damage, 3);
  assert.ok(!s.player.threats.includes(C(3)));
  assert.ok(s.player.discard.some((c) => c.code === C(3)));
  s = ready(["12001"]);
  equip(s, 75);
  s.player.discard.push({ id: "old-wrench", code: C(2) });
  s = settle(reduceGame(s, { type: "act", kind: "jumpsuit" }));
  assert.equal(s.player.actions, 3);
  assert.ok(s.player.hand.some((c) => c.id === "old-wrench"));
  assert.ok(s.player.discard.some((c) => c.code === C(75)));
});
