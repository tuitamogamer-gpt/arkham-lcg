import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers";
import { reduceGame, party, successChance } from "../src/game/engine";
import { eventImportance } from "../src/game/presentation";
import { code as C } from "../src/game/data";
import type { GameState } from "../src/game/types";

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
  while (s.event || s.window)
    s = reduceGame(
      s,
      s.event
        ? { type: "continue", eventId: s.event.id }
        : { type: "passWindow" },
    );
  return s;
}
function run(s: GameState, tempo: "detailed" | "smart" | "fast", limit = 60) {
  const titles: string[] = [];
  for (let i = 0; i < limit && (s.event || s.window); i++) {
    if (s.event) titles.push(s.event.title);
    s = reduceGame(
      s,
      s.event
        ? { type: "continue", eventId: s.event.id }
        : { type: "passWindow" },
      { tempo },
    );
  }
  return { s, titles };
}

test("the detailed tempo still pauses on a resource action and records every event", () => {
  let s = ready();
  s = reduceGame(s, { type: "act", kind: "resource" }, { tempo: "detailed" });
  assert.equal(s.event?.title, "Resource gained");
});

test("smart and fast tempos skip minor events but keep them in the history", () => {
  for (const tempo of ["smart", "fast"] as const) {
    let s = ready();
    const serial = s.eventSerial;
    s = reduceGame(s, { type: "act", kind: "resource" }, { tempo });
    assert.equal(s.event, null, `${tempo}: no pause for a resource action`);
    assert.equal(s.player.resources, 6);
    assert.equal(s.player.actions, 2);
    const recorded = s.eventHistory.filter((e) => e.id > serial);
    assert.equal(recorded[0]?.title, "Resource gained");
    assert.ok(
      recorded[0].changes.some((c) => c.label.endsWith("Actions")),
      "the action's own cost is attached to the recorded event",
    );
  }
});

test("smart pauses at the new round and the encounter reveal; fast only at the reveal", () => {
  let base = ready();
  base = reduceGame(base, { type: "act", kind: "resource" }, { tempo: "fast" });
  const smart = run(reduceGame(base, { type: "endTurn" }, { tempo: "smart" }), "smart");
  assert.ok(
    smart.titles.some((t) => /^Mythos · Round 2/.test(t)),
    `smart pauses at the mythos phase (${smart.titles.join(" | ")})`,
  );
  assert.ok(smart.titles.includes("Encounter revealed"));
  assert.ok(!smart.titles.includes("Upkeep phase"), "upkeep does not pause");
  const fast = run(reduceGame(base, { type: "endTurn" }, { tempo: "fast" }), "fast");
  assert.ok(!fast.titles.some((t) => /^Mythos · Round 2/.test(t)));
  assert.equal(fast.titles[0], "Encounter revealed");
});

test("story transitions pause in every tempo", () => {
  let s = ready();
  s.player.clues = 2;
  s = reduceGame(s, { type: "endTurn" }, { tempo: "fast" });
  let guard = 0;
  while (!s.decision && guard++ < 60) {
    assert.ok(s.event || s.window, `progress towards the act decision (${s.phase})`);
    s = reduceGame(
      s,
      s.event
        ? { type: "continue", eventId: s.event.id }
        : { type: "passWindow" },
      { tempo: "fast" },
    );
  }
  assert.equal(s.decision?.title, "Advance the act?");
  s = reduceGame(s, { type: "choose", id: "advance" }, { tempo: "fast" });
  const { titles } = run(s, "fast", 5);
  assert.ok(
    s.event?.story || titles.some((t) => t === "The story advances"),
    `the act transition pauses (${s.event?.title})`,
  );
});

test("event importance classifies attacks and story as critical and bookkeeping as minor", () => {
  const base = { changes: [], encounter: undefined, story: undefined, card: undefined };
  assert.equal(eventImportance({ ...base, title: "Enemy attack" }), "critical");
  assert.equal(eventImportance({ ...base, title: "Cards ready" }), "minor");
  assert.equal(eventImportance({ ...base, title: "Damage and horror resolved" }), "notable");
  assert.equal(
    eventImportance({ ...base, title: "Encounter revealed", encounter: { stage: "revealed", destination: "" } }),
    "critical",
  );
  assert.equal(
    eventImportance({ ...base, title: "Revelation resolves", encounter: { stage: "resolving", destination: "" }, card: C(122) }),
    "notable",
  );
});

test("success chance follows the scenario token rules", () => {
  const s = ready();
  s.bag = ["0", "0", "auto_fail", "+1"];
  assert.equal(successChance(s, 3, 3), 0.75);
  s.bag = ["tablet", "0"];
  assert.equal(successChance(s, 3, 3), 0.5);
  s.bag = ["skull", "elder_sign"];
  s.act = 2;
  // Skull is −2 in act 2 on easy; the elder sign is +1 for Joe.
  assert.equal(successChance(s, 4, 3), 0.5);
  assert.equal(successChance(s, 5, 3), 1);
  s.bag = ["-8"];
  assert.equal(successChance(s, 2, 0), 1, "a zero difficulty always succeeds");
});

test("success chance stays exact and fast with many tablets in the bag", () => {
  const s = ready();
  s.bag = ["tablet", "tablet", "0"];
  // 0 first (1/3) succeeds; tablet then 0 (2/3·1/2) succeeds at −1; two
  // tablets then 0 (2/3·1/2) fails at −2.
  assert.ok(Math.abs(successChance(s, 4, 3) - 2 / 3) < 1e-9);
  assert.ok(Math.abs(successChance(s, 3, 3) - 1 / 3) < 1e-9);
  s.bag = [...Array(19).fill("tablet"), "+1"];
  const started = Date.now();
  const chance = successChance(s, 3, 3);
  assert.ok(Date.now() - started < 200, "no combinatorial explosion");
  assert.ok(chance > 0 && chance < 1);
});
