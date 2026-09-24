import test from "node:test";
import assert from "node:assert/strict";
import { createGame, reduceGame as raw, gameSummary } from "../src/game/engine";
import { createGame as prepared, reduceGame as step } from "./helpers";
import { decodeSave } from "../src/game/storage";
import { scenarioResolution } from "../src/game/story";
import { eventMotion, tableMotion } from "../src/game/motion";
import type { GameState, Effect, VisibleEvent } from "../src/game/types";

const ready = (codes = ["12004"]) => {
  let s = prepared("easy", 91827, codes);
  while (s.status === "mulligan") s = step(s, { type: "mulligan", ids: [] });
  return s;
};
function effects(s: GameState, effects: Effect[]) {
  s.decision = {
    title: "Fixture",
    description: "",
    choices: [{ id: "go", label: "Go", effects }],
  };
  return step(s, { type: "choose", id: "go" });
}

test("new campaigns require both story pages and reject gameplay or stale story clicks", () => {
  let s = createGame("easy", 123, ["12004", "12001", "12007"]);
  assert.equal(s.introduction, "campaign");
  assert.equal(gameSummary(s).paused, true);
  assert.equal(scenarioResolution(s), null);
  for (const action of [
    { type: "mulligan", ids: [] },
    { type: "endTurn" },
    { type: "act", kind: "resource" },
    { type: "continueIntroduction", page: "scenario" },
  ] as const)
    assert.strictEqual(raw(s, action as Parameters<typeof raw>[1]), s);
  const original = structuredClone(s);
  s = raw(s, { type: "continueIntroduction", page: "campaign" });
  assert.equal(s.introduction, "scenario");
  assert.deepEqual(s.player, original.player);
  assert.deepEqual(s.encounterDeck, original.encounterDeck);
  assert.strictEqual(
    raw(s, { type: "continueIntroduction", page: "campaign" }),
    s,
  );
  s = raw(s, { type: "continueIntroduction", page: "scenario" });
  assert.equal(s.introduction, "complete");
  s = step(s, { type: "mulligan", ids: [] });
  assert.equal(s.player.code, "12001");
  assert.equal(s.status, "mulligan");
});

test("introduction resumes its exact page, accepts old saves, and rejects corrupt progress", () => {
  let s = createGame("easy", 123);
  for (const page of ["campaign", "scenario"] as const) {
    assert.equal(decodeSave(JSON.parse(JSON.stringify(s)))?.introduction, page);
    s = raw(s, { type: "continueIntroduction", page });
  }
  const legacy = ready();
  delete legacy.introduction;
  assert.equal(decodeSave(legacy)?.status, "playing");
  for (const introduction of ["unknown", 2, null])
    assert.equal(decodeSave({ ...s, introduction }), null);
  assert.equal(decodeSave({ ...ready(), introduction: "campaign" }), null);
});

test("victory branches award only their reached resolution, with personal XP and trauma", () => {
  for (const id of ["save", "leave"]) {
    let s = ready(["12004", "12001"]);
    s.player.flags.game_xpPenalty = 2;
    s.player.physicalTrauma = 1;
    s = effects(s, [{ kind: "victory" }]);
    assert.equal(s.decision?.title, "Choose Armitage’s bearer");
    assert.equal(scenarioResolution(s), null);
    s = step(s, { type: "choose", id: "12001" });
    assert.equal(s.decision?.title, "The masked pursuer falls");
    assert.equal(scenarioResolution(s), null);
    s = step(s, { type: "choose", id });
    const resolution = scenarioResolution(s)!;
    assert.equal(resolution.number, id === "save" ? 2 : 3);
    assert.equal(resolution.bonusXp, id === "save" ? 4 : 3);
    assert.equal(s.campaign.armitageBearer, "12001");
    assert.equal(s.player.xp, resolution.bonusXp - 2);
    assert.equal(s.companions[0].xp, resolution.bonusXp);
    assert.equal(s.player.physicalTrauma, id === "save" ? 2 : 1);
    assert.equal(s.player.mentalTrauma, id === "save" ? 0 : 1);
    assert.equal(
      s.campaign.notes.some((n) => n.includes("saved Miskatonic")),
      id === "save",
    );
    assert.deepEqual(
      scenarioResolution(decodeSave(JSON.parse(JSON.stringify(s)))!),
      resolution,
    );
  }
});

test("final agenda and party resignation use the no-resolution passage with their actual cause", () => {
  let overrun = ready();
  overrun.agenda = 3;
  overrun.doom = 9;
  overrun = effects(overrun, [{ kind: "doom", amount: 1 }]);
  assert.equal(scenarioResolution(overrun)?.number, 0);
  assert.match(scenarioResolution(overrun)!.reason, /final agenda/);
  assert.equal(overrun.player.physicalTrauma, 1);
  assert.equal(overrun.player.mentalTrauma, 1);
  assert.equal(overrun.player.xp, 2);
  let resigned = ready(["12004", "12001"]);
  resigned.act = 4;
  resigned = step(resigned, { type: "act", kind: "resign" });
  // Replacing the lead is a separate, explicit choice.
  if (resigned.decision)
    resigned = step(resigned, {
      type: "choose",
      id: resigned.decision.choices[0].id,
    });
  resigned = step(resigned, { type: "act", kind: "resign" });
  assert.equal(scenarioResolution(resigned)?.number, 0);
  assert.match(
    scenarioResolution(resigned)!.reason,
    /Every investigator resigned/,
  );
  assert.equal(resigned.campaign.armitageBearer, undefined);
});

test("enemy motion distinguishes spawn, hunter movement, engagement, evasion and departure", () => {
  const before = ready();
  const spawned = structuredClone(before);
  spawned.enemies.push({
    id: "one",
    code: "12122",
    location: "12113",
    damage: 0,
    exhausted: false,
    engaged: false,
  });
  assert.ok(
    tableMotion(before, spawned).some(
      (c) =>
        c.target === "enemy-token-one" &&
        c.kind === "reveal" &&
        c.from === "encounter-deck",
    ),
  );
  const moved = structuredClone(spawned);
  moved.enemies[0].location = "12117";
  assert.ok(
    tableMotion(spawned, moved).some(
      (c) =>
        c.target === "enemy-token-one" &&
        c.kind === "move" &&
        c.from === c.target,
    ),
  );
  const engaged = structuredClone(moved);
  engaged.enemies[0].engaged = true;
  engaged.enemies[0].engagedWith = "12004";
  assert.ok(tableMotion(moved, engaged).some((c) => c.kind === "engage"));
  const evaded = structuredClone(engaged);
  evaded.enemies[0].engaged = false;
  evaded.enemies[0].exhausted = true;
  delete evaded.enemies[0].engagedWith;
  assert.ok(tableMotion(engaged, evaded).some((c) => c.kind === "evade"));
  const dead = structuredClone(evaded);
  dead.enemies = [];
  dead.victory.push("12114");
  assert.ok(
    tableMotion(evaded, dead).some(
      (c) => c.kind === "defeat" && c.to === "encounter-discard",
    ),
  );
  evaded.enemies[0].code = "12114";
  assert.ok(tableMotion(evaded, dead).some((c) => c.to === "victory-display"));
});

test("every action category has a distinct public motion, and event metadata survives saves", () => {
  const pairs = {
    investigate: "investigate",
    fight: "attack",
    evade: "evade",
    engage: "engage",
    parley: "parley",
    resource: "gain",
    drawBatch: "draw",
    play: "play",
    move: "move",
    extinguish: "extinguish",
    rest: "heal",
    resign: "resign",
    commit: "commit",
    boost: "boost",
    attachFire: "fire",
    enemyMove: "move",
  };
  for (const [kind, expected] of Object.entries(pairs))
    assert.equal(
      eventMotion({ title: "", motion: { kind } } as VisibleEvent),
      expected,
    );
  const s = raw(ready(), { type: "act", kind: "resource" });
  assert.equal(s.event?.motion?.kind, "resource");
  assert.deepEqual(
    decodeSave(JSON.parse(JSON.stringify(s)))?.event?.motion,
    JSON.parse(JSON.stringify(s.event?.motion)),
  );
  assert.equal(
    decodeSave({ ...s, event: { ...s.event, motion: { kind: 3 } } }),
    null,
  );
});

test("a skill-test animation starts when its dialog becomes visible after a checkpoint", () => {
  const before = raw(ready(), { type: "act", kind: "resource" });
  before.test = {
    kind: "investigate",
    skill: "intellect",
    difficulty: 2,
    base: 4,
    bonus: 0,
    title: "Investigate",
    committed: [],
    stage: "commit",
    tokens: [],
    modifier: 0,
  };
  const after = structuredClone(before);
  after.event = null;
  assert.ok(
    tableMotion(before, after).some(
      (cue) => cue.target === "test-scene" && cue.kind === "investigate",
    ),
  );
});
