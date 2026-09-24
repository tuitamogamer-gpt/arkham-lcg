import test from "node:test";
import assert from "node:assert/strict";
import { createGame, reduceGame as step } from "./helpers";
import { gameSummary, reduceGame as raw } from "../src/game/engine";

import {
  availableCards,
  campaignKnowledge,
  canInspectCard,
  canReadReverse,
} from "../src/game/knowledge";
import { rememberEvent } from "../src/game/presentation";
import { decodeSave } from "../src/game/storage";
import { tableMotion } from "../src/game/motion";
import type { Effect, GameState } from "../src/game/types";

const ready = () =>
  step(createGame("easy", 712), { type: "mulligan", ids: [] });
function trigger(s: GameState, effects: Effect[]) {
  s.decision = {
    title: "Fixture",
    description: "",
    choices: [{ id: "go", label: "Go", effects }],
  };
  return raw(s, { type: "choose", id: "go" });
}

test("the archive hides future chapters, campaign rewards and hidden identities before play", () => {
  const available = availableCards(null).map((c) => c.code);
  assert.ok(available.includes("12004") && available.includes("12019"));
  for (const code of [
    "12109",
    "12114",
    "12115",
    "12133",
    "12137",
    "12168",
    "12179",
    "12179b",
    "12181",
  ])
    assert.ok(!available.includes(code), `${code} is still a story discovery`);
});

test("current public faces are available but story reverses and future locations stay sealed", () => {
  const s = ready();
  for (const code of ["12105", "12106", "12109", "12113"])
    assert.ok(canInspectCard(s, code));
  assert.ok(canReadReverse(s, "12004"));
  assert.ok(canReadReverse(s, "12105"));
  assert.ok(!canReadReverse(s, "12106"));
  assert.ok(!canReadReverse(s, "12109"));
  assert.ok(!canInspectCard(s, "12114"));
  assert.ok(!canInspectCard(s, "12117"));
  s.locations.find((l) => l.code === "12117")!.active = true;
  assert.ok(
    !canInspectCard(s, "12117"),
    "an unexplored card is not its revealed face",
  );
  assert.ok(
    !("clues" in gameSummary(s).locations.find((l) => l.code === "12117")!),
  );
});

test("reading the public state never discovers hidden draw order or queued future effects", () => {
  const s = ready();
  s.encounterDeck = ["12179b", "12114"];
  s.queue = [{ kind: "revelation", code: "12137" }];
  const snapshot = JSON.stringify(s);
  const knowledge = campaignKnowledge(s);
  for (const code of ["12179b", "12114", "12137"])
    assert.ok(!knowledge.fronts.has(code));
  assert.equal(
    JSON.stringify(s),
    snapshot,
    "read-only discovery does not change the save",
  );
});

test("a real story transition unlocks only the completed reverse and the new front", () => {
  for (const kind of ["act", "agenda"] as const) {
    const s = ready();
    if (kind === "agenda") s.doom = 2;
    const next = trigger(s, [
      { kind: kind === "act" ? "advanceAct" : "doom", amount: 1 },
    ]);
    const previous = kind === "act" ? "12109" : "12106";
    const current = kind === "act" ? "12110" : "12107";
    assert.ok(canReadReverse(next, previous));
    assert.ok(canInspectCard(next, current));
    assert.ok(!canReadReverse(next, current));
    assert.ok(!canInspectCard(next, kind === "act" ? "12111" : "12108"));
    const restored = decodeSave(JSON.parse(JSON.stringify(next)))!;
    assert.ok(restored && canReadReverse(restored, previous));
    assert.ok(!canReadReverse(restored, current));
  }
});

test("encounter discovery survives deck reshuffle, journal rollover and save import", () => {
  let s = ready();
  s.encounterDeck = ["12125"];
  assert.ok(!canInspectCard(s, "12125"));
  s = trigger(s, [{ kind: "encounter" }]);
  assert.ok(canInspectCard(s, "12125"));
  s.event = null;
  s.queue = [];
  s.resolutionDepth = 0;
  s.encounterDeck = ["12125"];
  for (let i = 0; i < 501; i++)
    rememberEvent(
      s,
      {
        title: "Public checkpoint",
        description: "Continue",
        changes: [],
        tone: "neutral",
        continueLabel: "Continue",
      },
      false,
    );
  assert.equal(s.eventHistory.length, 500);
  const restored = decodeSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(restored && canInspectCard(restored, "12125"));
  assert.ok(!canInspectCard(restored, "12126"));
  assert.ok(
    !canInspectCard(ready(), "12125"),
    "a new case has its own discoveries",
  );
});

test("older saves recover visible discoveries and invalid discovery metadata is rejected", () => {
  const s = ready();
  delete s.discoveries;
  s.encounterDiscard = ["12130"];
  const restored = decodeSave(s)!;
  assert.ok(restored && canInspectCard(restored, "12130"));
  assert.ok(!canInspectCard(restored, "12114"));
  for (const discoveries of [
    { cards: ["missing"], storyBacks: [] },
    { cards: [], storyBacks: ["12019"] },
    { cards: null, storyBacks: [] },
  ])
    assert.equal(decodeSave({ ...s, discoveries }), null);
});

test("motion follows resolved public changes and never announces a future draw or injury", () => {
  const before = ready();
  const next = structuredClone(before);
  next.encounterDeck.reverse();
  next.player.deck.reverse();
  next.queue = [{ kind: "damage", damage: 3, horror: 2 }];
  assert.deepEqual(tableMotion(before, next), []);
  next.player.damage = 2;
  next.player.horror = 1;
  next.player.resources += 1;
  const saved = JSON.stringify(next);
  const cues = tableMotion(before, next);
  assert.ok(cues.some((c) => c.kind === "damage" && c.delta === 2));
  assert.ok(cues.some((c) => c.kind === "horror" && c.delta === 1));
  assert.ok(cues.some((c) => c.kind === "gain" && c.delta === 1));
  assert.equal(JSON.stringify(next), saved);
  assert.deepEqual(tableMotion(before, createGame("easy", 713)), []);
});

test("card and pawn motion refer to stable public instances across a play and a move", () => {
  const before = ready();
  before.player.hand = [{ id: "tool", code: "12034" }];
  const after = structuredClone(before);
  after.player.hand = [];
  after.player.assets = [
    {
      id: "tool",
      code: "12034",
      uses: 0,
      exhausted: false,
      damage: 0,
      horror: 0,
    },
  ];
  after.player.location = "12117";
  const l = after.locations.find((l) => l.code === "12117")!;
  l.active = true;
  l.revealed = true;
  const cues = tableMotion(before, after);
  assert.ok(
    cues.some(
      (c) =>
        c.kind === "play" && c.target === "card-tool" && c.from === "card-tool",
    ),
  );
  assert.ok(cues.some((c) => c.kind === "move" && c.target === "pawn-12004"));
  assert.ok(
    cues.some((c) => c.kind === "reveal" && c.target === "location-12117"),
  );
});
