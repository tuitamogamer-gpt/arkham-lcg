import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  reduceGame,
  party,
  fastOptions,
  testValue,
} from "../src/game/engine";
import { code as C } from "../src/game/data";
import { decodeSave } from "../src/game/storage";
import type { GameState, Action, Effect } from "../src/game/types";

const J = C(4),
  D = C(1),
  T = C(7);
function ack(s: GameState) {
  for (let n = 0; s.event; n++) {
    assert.ok(n < 500);
    s = reduceGame(s, { type: "continue", eventId: s.event.id });
  }
  return s;
}
const step = (s: GameState, a: Action) => ack(reduceGame(s, a));
const choose = (s: GameState, id: string) => step(s, { type: "choose", id });
const pass = (s: GameState) => step(s, { type: "passWindow" });
function fixture(codes = [J, D, T]) {
  let s = createGame("easy", 3481, codes);
  while (s.status === "mulligan") s = step(s, { type: "mulligan", ids: [] });
  if (s.window) s = pass(s);
  for (const p of party(s)) {
    p.hand = [];
    p.assets = [];
    p.deck = [{ id: `draw-${p.code}`, code: C(89) }];
  }
  s.bag = ["0"];
  return s;
}
const member = (s: GameState, c: string) => party(s).find((p) => p.code === c)!;
function asset(s: GameState, n: number, owner = s.player.code, uses = 0) {
  const id = `timing-${s.nextId++}`;
  member(s, owner).assets.push({
    id,
    code: C(n),
    exhausted: false,
    uses,
    damage: 0,
    horror: 0,
  });
  return id;
}
function hand(s: GameState, n: number, owner = s.player.code) {
  const id = `timing-${s.nextId++}`;
  member(s, owner).hand.push({ id, code: C(n) });
  return id;
}
function enemy(s: GameState, n = 121, owner = J) {
  const id = `timing-${s.nextId++}`;
  s.enemies.push({
    id,
    code: C(n),
    location: member(s, owner).location,
    damage: 0,
    exhausted: false,
    engaged: true,
    engagedWith: owner,
  });
  return id;
}
function run(s: GameState, ...effects: Effect[]) {
  s.decision = {
    title: "Fixture",
    description: "",
    choices: [{ id: "go", label: "Go", effects }],
  };
  return choose(s, "go");
}
function select(s: GameState, label: string) {
  const c = s.decision?.choices.find((c) => c.label.includes(label));
  assert.ok(c, `${s.decision?.title}: missing ${label}`);
  return choose(s, c.id);
}
function fast(s: GameState, label: string, owner?: string) {
  const o = fastOptions(s).find(
    (o) => o.label.includes(label) && (!owner || o.actor === owner),
  );
  assert.ok(o, `missing Fast option ${label}`);
  return step(s, { type: "fast", id: o.id });
}

test("Magnifying Glass can enter play before commitment and updates the running test", () => {
  let s = fixture([J]);
  const glass = hand(s, 34);
  s = step(s, { type: "act", kind: "investigate" });
  assert.equal(s.window?.timing, "beforeCommit");
  assert.equal(s.player.actions, 2);
  s = decodeSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(s.window);
  s = fast(s, "Magnifying Glass");
  assert.ok(s.player.assets.some((a) => a.id === glass));
  assert.equal(s.player.resources, 4);
  assert.equal(s.player.actions, 2);
  assert.equal(s.test?.stage, "commit");
  assert.equal(testValue(s), 5);
});

test("the second player window locks commitments and reveals only after passing", () => {
  let s = fixture([J]);
  hand(s, 38);
  const perception = hand(s, 93);
  s = step(s, { type: "act", kind: "investigate" });
  s = pass(s);
  s = step(s, { type: "commit", id: perception });
  s = step(s, { type: "reveal" });
  assert.equal(s.window?.timing, "beforeToken");
  assert.deepEqual(s.window?.test?.tokens, []);
  assert.equal(reduceGame(s, { type: "commit", id: perception }), s);
  s = fast(s, "Working a Hunch");
  assert.equal(s.player.clues, 1);
  assert.equal(s.test?.stage, "revealed");
  assert.deepEqual(s.test?.committed, [perception]);
});

test("a teammate's Wrench interrupts a test without starting or spending their turn", () => {
  let s = fixture();
  const wrench = asset(s, 2, D);
  const target = enemy(s);
  s.enemies[0].exhausted = true;
  s = step(s, { type: "act", kind: "investigate" });
  assert.equal(s.window?.actor, J);
  s = fast(s, "Wrench", D);
  assert.equal(s.decision?.title, "Daniela strikes back");
  s = choose(s, "skip");
  assert.equal(s.player.code, J);
  assert.equal(s.turnInvestigator, J);
  assert.equal(s.test?.kind, "investigate");
  assert.equal(member(s, D).turnStarted, false);
  assert.equal(member(s, D).actions, 3);
  assert.equal(
    member(s, D).assets.find((a) => a.id === wrench)?.exhausted,
    true,
  );
  assert.equal(s.enemies.find((e) => e.id === target)?.engagedWith, D);
});

test("a Wrench counterattack inside a player window queues behind the original test", () => {
  let s = fixture();
  asset(s, 2, D);
  enemy(s);
  s.player.flags.joe = true;
  s.enemies[0].exhausted = true;
  s = step(s, { type: "act", kind: "investigate" });
  s = fast(s, "Wrench", D);
  s = choose(s, "basic");
  assert.equal(s.test?.kind, "investigate");
  assert.equal(s.queuedTests?.[0].actor, D);
  s = step(s, { type: "reveal" });
  s = step(s, { type: "resolve" });
  assert.equal(s.test?.kind, "fight");
  assert.equal(s.player.code, D);
  assert.ok(decodeSave(JSON.parse(JSON.stringify(s))));
});

test("Peril excludes teammate Fast abilities while allowing the tested investigator's boosts", () => {
  let s = fixture();
  asset(s, 2, D);
  asset(s, 35, J);
  enemy(s);
  s.peril = J;
  s = step(s, { type: "act", kind: "investigate" });
  assert.deepEqual([...new Set(fastOptions(s).map((o) => o.actor))], [J]);
  assert.ok(fastOptions(s).some((o) => o.label.includes("Sharp Rhetoric")));
});

test("own-turn Fast cards and abilities are excluded from mythos windows", () => {
  let s = fixture();
  for (const n of [34, 38, 52]) hand(s, n);
  asset(s, 46);
  asset(s, 2, D);
  enemy(s);
  s.phase = "mythos";
  s = run(s, { kind: "playerWindow", title: "After mythos encounters" });
  assert.ok(s.window);
  assert.ok(
    fastOptions(s).every((o) => o.actor === D && o.label.includes("Wrench")),
  );
  assert.equal(reduceGame(s, { type: "endTurn" }), s);
});

test("enemy attack membership is determined after the player window", () => {
  let s = fixture([J, D]);
  asset(s, 2, D);
  const target = enemy(s);
  s.phase = "enemy";
  s = run(s, { kind: "enemyAttacks", actor: "scenario" });
  assert.match(s.window!.title, /Joe Diamond/);
  s = fast(s, "Wrench", D);
  s = choose(s, "skip");
  assert.equal(s.decision?.title, "Daniela strikes back");
  assert.equal(s.enemies.find((e) => e.id === target)?.exhausted, false);
  assert.equal(member(s, J).damage, 0);
  assert.equal(member(s, D).damage, 2);
});

test("upkeep offers a window before readying, never between readying and drawing", () => {
  let s = fixture([D]);
  const wrench = asset(s, 2, D);
  const other = asset(s, 17, D);
  s.player.assets.find((a) => a.id === other)!.exhausted = true;
  enemy(s, 121, D);
  s = run(s, { kind: "upkeep", actor: "scenario" });
  assert.equal(s.window?.title, "Before readying cards");
  assert.equal(s.player.assets.find((a) => a.id === other)?.exhausted, true);
  s = fast(s, "Wrench", D);
  assert.equal(s.player.assets.find((a) => a.id === wrench)?.exhausted, true);
  assert.equal(s.decision?.title, "Daniela strikes back");
});

test("presentation checkpoints block Fast actions and preserve pending windows on reload", () => {
  let s = fixture([J]);
  hand(s, 34);
  s = reduceGame(s, { type: "act", kind: "investigate" });
  assert.ok(s.event);
  const id = fastOptions(s)[0].id;
  assert.equal(reduceGame(s, { type: "fast", id }), s);
  assert.equal(reduceGame(s, { type: "passWindow" }), s);
  assert.deepEqual(
    decodeSave(JSON.parse(JSON.stringify(s))),
    JSON.parse(JSON.stringify(s)),
  );
});

test("saved windows reject mismatched tests and invalid resolution scopes", () => {
  let s = fixture([J]);
  hand(s, 34);
  s = step(s, { type: "act", kind: "investigate" });
  assert.equal(decodeSave({ ...s, resolutionDepth: 88 }), null);
  assert.equal(
    decodeSave({ ...s, window: { ...s.window, actor: "unknown" } }),
    null,
  );
  assert.equal(decodeSave({ ...s, window: { ...s.window, test: null } }), null);
});

test("multiple Fire locations resolve in the chosen order, before enemy phase", () => {
  let s = fixture([J, D]);
  const remote = s.locations.find((l) => l.code === C(117))!;
  remote.active = remote.revealed = remote.fire = true;
  s.locations.find((l) => l.code === C(113))!.fire = true;
  member(s, D).location = remote.code;
  s = run(s, { kind: "investigationEnd", actor: "scenario" });
  assert.equal(s.decision?.title, "Choose Fire order");
  assert.ok(party(s).every((p) => p.damage === 0));
  const selected = s.decision!.choices.find((c) =>
    c.label.includes("Dormitories"),
  )!;
  s = reduceGame(s, { type: "choose", id: selected.id });
  assert.match(s.event!.description, /Dormitories/);
  assert.equal(s.phase, "investigation");
  s = reduceGame(s, { type: "continue", eventId: s.event!.id });
  assert.equal(member(s, D).damage, 1);
  assert.equal(member(s, J).damage, 0);
});

test("the lead orders simultaneous scenario Forced abilities for the affected investigator", () => {
  let s = fixture([J, D]);
  s.leadInvestigator = D;
  const hall = s.locations.find((l) => l.code === C(118))!;
  hall.active = hall.revealed = true;
  hall.clues = 2;
  s.player.location = hall.code;
  s.player.threats = [C(125)];
  const discard = hand(s, 89);
  s = run(s, { kind: "discover", amount: 1 });
  assert.equal(s.decision?.title, "Choose discovery effect order");
  assert.equal(s.player.code, D);
  s = select(s, "Science Hall");
  assert.equal(s.player.code, J);
  assert.equal(s.player.horror, 0);
  s = choose(s, discard);
  assert.equal(member(s, J).horror, 1);
  assert.equal(member(s, D).horror, 0);
});

test("scenario Forced effects precede player Forced effects after enemy damage", () => {
  let s = fixture([D]);
  s.player.threats = [C(3)];
  const target = enemy(s, 123, D);
  s.decision = {
    title: "Fixture",
    description: "",
    choices: [
      {
        id: "go",
        label: "Go",
        effects: [{ kind: "enemyDamage", id: target, amount: 2 }],
      },
    ],
  };
  s = reduceGame(s, { type: "choose", id: "go" });
  while (s.event && s.doom === 0)
    s = reduceGame(s, { type: "continue", eventId: s.event.id });
  assert.equal(s.doom, 1);
  assert.equal(s.player.damage, 0);
  s = ack(s);
  assert.equal(s.player.damage, 1);
});

test("evasion reactions can be ordered and each remains optional", () => {
  let s = fixture([T]);
  asset(s, 8, T);
  const fingers = asset(s, 48, T);
  const target = enemy(s, 121, T);
  s = run(s, { kind: "evadeEnemy", id: target });
  assert.equal(s.decision?.title, "Choose evasion effect order");
  s = select(s, "Sticky Fingers");
  s = choose(s, "use");
  assert.equal(s.player.resources, 6);
  assert.equal(s.player.assets.find((a) => a.id === fingers)?.exhausted, true);
  assert.equal(s.decision?.title, "Covert Ops");
});

test("Bandages choices are recalculated after the final supply is spent", () => {
  let s = fixture([D, J]);
  asset(s, 73, D, 1);
  s = run(s, { kind: "fireLocation", actor: "scenario", target: C(113) });
  assert.equal(s.decision?.choices.length, 2);
  s = select(s, "Joe Diamond");
  s = choose(s, "heal");
  assert.equal(member(s, J).damage, 0);
  assert.equal(member(s, D).damage, 1);
  assert.equal(s.decision, null);
});

test("a committed draw result can be resolved before Science Hall's clue/discard result", () => {
  let s = fixture([J]);
  const hall = s.locations.find((l) => l.code === C(118))!;
  hall.active = hall.revealed = true;
  hall.clues = 2;
  s.player.location = hall.code;
  s.player.flags.joe = true;
  const committed = hand(s, 93);
  s = step(s, { type: "act", kind: "investigate" });
  s = step(s, { type: "commit", id: committed });
  s = step(s, { type: "reveal" });
  s = step(s, { type: "resolve" });
  assert.equal(s.decision?.title, "Choose skill test result order");
  s = select(s, "Perception");
  assert.equal(s.decision?.title, "Science Hall");
  assert.ok(s.player.hand.some((c) => c.id === `draw-${J}`));
  assert.ok(s.limbo?.some((c) => c.id === committed));
  s = choose(s, `draw-${J}`);
  assert.ok(s.player.discard.some((c) => c.id === committed));
});

test("tablet and failed-test consequences can be ordered before Retaliate or test cleanup", () => {
  let s = fixture([J]);
  s.bag = ["tablet"];
  s = run(s, {
    kind: "test",
    skill: "willpower",
    difficulty: 8,
    title: "Agenda",
    source: "agenda1",
  });
  s = step(s, { type: "reveal" });
  s = step(s, { type: "resolve" });
  assert.equal(s.decision?.title, "Choose skill test result order");
  const tablet = s.decision!.choices.find((c) => c.label.includes("Tablet"))!;
  s = reduceGame(s, { type: "choose", id: tablet.id });
  assert.equal(s.player.damage, 1);
  assert.equal(s.player.horror, 0);
  s = ack(s);
  assert.equal(s.player.horror, 1);
});

test("drawing the last encounter resets after the completed revelation, before later doom", () => {
  let s = fixture([J]);
  s.agenda = 3;
  s.encounterDeck = [C(121)];
  s.encounterDiscard = [C(129)];
  s = run(s, { kind: "encounter" }, { kind: "doom", amount: 1 });
  assert.deepEqual(s.encounterDeck, [C(129)]);
  assert.equal(s.encounterDiscard.length, 0);
  assert.equal(
    s.locations.some((l) => l.fire),
    false,
  );
});

test("the last treachery stays in limbo through its test, then participates in the reset", () => {
  let s = fixture([J]);
  s.encounterDeck = [C(130)];
  s.encounterDiscard = [C(129)];
  s = run(s, { kind: "encounter" });
  s = choose(s, "willpower");
  assert.ok(s.test);
  assert.deepEqual(s.encounterDeck, []);
  assert.deepEqual(s.encounterDiscard, [C(129)]);
  s = decodeSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(s);
  s.bag = ["+1"];
  s = step(s, { type: "reveal" });
  s = step(s, { type: "resolve" });
  assert.deepEqual([...s.encounterDeck].sort(), [C(129), C(130)]);
  assert.equal(s.resolutionDepth, 0);
});

test("Paint the Town Red searches a reset deck and finishes before the new empty-deck reset", () => {
  let s = fixture([T]);
  const paint = hand(s, 51);
  s.encounterDeck = [];
  s.encounterDiscard = [C(121)];
  s = step(s, { type: "play", id: paint });
  assert.equal(s.decision?.title, "Paint the Town Red");
  assert.deepEqual(s.encounterDeck, [C(121)]);
  s.encounterDiscard = [C(129)];
  s = reduceGame(s, { type: "choose", id: C(121) });
  assert.equal(s.encounterDeck.length, 0);
  assert.deepEqual(s.encounterDiscard, [C(129)]);
  assert.ok(s.limbo?.some((c) => c.id === paint));
  s = ack(s);
  assert.deepEqual(s.encounterDeck, [C(129)]);
  assert.ok(s.player.discard.some((c) => c.id === paint));
});

test("a Fire discard target stays available inside the last encounter's unresolved test", () => {
  let s = fixture([J]);
  s.encounterDeck = [C(130)];
  s.encounterDiscard = [C(129)];
  s.bag = ["elder_thing"];
  s = run(s, { kind: "encounter" });
  s = choose(s, "willpower");
  s = step(s, { type: "reveal" });
  s = step(s, { type: "resolve" });
  assert.equal(s.decision?.title, "Choose skill test result order");
  s = select(s, "Elder thing");
  assert.equal(s.locations.find((l) => l.code === C(113))!.fire, true);
  assert.ok(!s.encounterDeck.includes(C(129)));
  assert.deepEqual(s.encounterDeck, [C(130)]);
});

test("defeat while boosting in a saved window cleans up the suspended test's commitments", () => {
  let s = fixture([J, D]);
  const committed = hand(s, 93);
  asset(s, 35);
  s.player.threats = [C(103)];
  s.player.damage = 6;
  s = step(s, { type: "act", kind: "investigate" });
  s = pass(s);
  s = step(s, { type: "commit", id: committed });
  s = step(s, { type: "reveal" });
  s = decodeSave(JSON.parse(JSON.stringify(s)))!;
  s = fast(s, "Sharp Rhetoric");
  assert.equal(member(s, J).status, "defeated");
  assert.equal(s.leadInvestigator, D);
  assert.ok(member(s, J).discard.some((c) => c.id === committed));
  assert.equal(s.testInProgress, false);
  assert.equal(s.window, undefined);
  assert.equal(s.resolutionDepth, 0);
  assert.ok(decodeSave(JSON.parse(JSON.stringify(s))));
});

test("a resumed window preserves teammate commitments and shows the test owner's live value", () => {
  let s = fixture();
  asset(s, 2, D);
  hand(s, 38);
  const assist = hand(s, 93, D);
  enemy(s);
  s.enemies[0].exhausted = true;
  s = step(s, { type: "act", kind: "investigate" });
  s = pass(s);
  s = step(s, { type: "commit", id: assist });
  s = step(s, { type: "reveal" });
  s = fast(s, "Wrench", D);
  s = choose(s, "skip");
  assert.equal(s.player.code, J);
  assert.equal(testValue({ ...s, test: s.window!.test! }), 6);
  assert.deepEqual(s.window?.test?.committed, [assist]);
});

test("the lead chooses which Hunter moves first", () => {
  let s = fixture([J]);
  const room = s.locations.find((l) => l.code === C(117))!;
  room.active = room.revealed = true;
  const first = enemy(s, 122),
    second = enemy(s, 9);
  for (const en of s.enemies) {
    en.location = room.code;
    en.engaged = false;
    delete en.engagedWith;
  }
  s = run(s, { kind: "enemyPhase", actor: "scenario" });
  assert.equal(s.decision?.title, "Choose Hunter order");
  assert.ok(s.decision?.choices.some((c) => c.effects[0].id === first));
  assert.ok(s.decision?.choices.some((c) => c.effects[0].id === second));
});

test("all investigators at an enemy's arrival can order their Gather Intel reactions", () => {
  let s = fixture([J, T]);
  hand(s, 36, J);
  hand(s, 36, T);
  s.encounterDeck = [C(121)];
  s = run(s, { kind: "encounter" });
  s = choose(s, J); // automatic engagement happens before arrival reactions
  assert.equal(s.decision?.title, "Choose arrival reaction order");
  s = select(s, "Trish Scarborough");
  assert.equal(s.player.code, T);
  assert.equal(s.decision?.title, "Gather Intel");
});

test("a reaction that becomes affordable during another reaction remains available", () => {
  let s = fixture([D]);
  asset(s, 18);
  hand(s, 22);
  s.player.resources = 0;
  const target = enemy(s, 121, D);
  s.enemies[0].damage = 2;
  s = run(s, { kind: "attack", id: target });
  while (s.decision?.choices.some((c) => c.id === "self"))
    s = choose(s, "self");
  assert.equal(s.decision?.title, "Daniela strikes back");
  s = choose(s, "basic");
  s = step(s, { type: "reveal" });
  s = step(s, { type: "resolve" });
  assert.equal(s.decision?.title, "Logan Hastings");
  s = choose(s, "gain");
  assert.equal(s.player.resources, 1);
  assert.equal(s.decision?.title, "Lesson Learned");
});

test("older v3 encounter saves restore a boundary around their pending revelation and test", () => {
  for (const pause of ["revealed", "test"]) {
    let s = fixture([J]);
    s.encounterDeck = [C(130)];
    s.encounterDiscard = [C(129)];
    if (pause === "revealed") {
      s.encounterDeck = [];
      s.queue = [{ kind: "revelation", code: C(130), actor: J }];
    } else {
      s = run(s, { kind: "encounter" });
      s = choose(s, "willpower");
    }
    delete s.resolutionDepth;
    s.queue = s.queue.filter((e) => e.kind !== "endResolution");
    s = decodeSave(JSON.parse(JSON.stringify(s)))!;
    assert.ok(s);
    assert.equal(s.resolutionDepth, 1);
    if (pause === "revealed") {
      s = run(s, { kind: "restoreTurn" });
      assert.equal(s.decision?.title, "Noxious Smoke");
      s = choose(s, "willpower");
    }
    assert.deepEqual(s.encounterDeck, []);
    assert.deepEqual(s.encounterDiscard, [C(129)]);
    s = step(s, { type: "reveal" });
    s = step(s, { type: "resolve" });
    assert.deepEqual([...s.encounterDeck].sort(), [C(129), C(130)]);
    assert.equal(s.resolutionDepth, 0);
  }
});
