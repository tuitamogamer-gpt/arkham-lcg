import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./helpers";
import { reduceGame, party } from "../src/game/engine";
import { card, code as C } from "../src/game/data";
import type { GameState } from "../src/game/types";

function ready(codes = ["12004", "12001", "12007"]) {
  let s = createGame("standard", 9001, codes);
  while (s.status === "mulligan")
    s = reduceGame(s, { type: "mulligan", ids: [] });
  while (s.event || s.window)
    s = reduceGame(
      s,
      s.event
        ? { type: "continue", eventId: s.event.id }
        : { type: "passWindow" },
    );
  return s;
}
function eliminate(s: GameState, code: string) {
  const p = party(s).find((p) => p.code === code)!;
  p.status = "defeated";
  p.turnEnded = true;
  p.actions = 0;
  // The eliminated investigator stays focused, exactly as after a fatal
  // enemy-phase attack on the last investigator in player order.
  const index = s.companions.findIndex((x) => x.code === code);
  if (index >= 0) [s.player, s.companions[index]] = [s.companions[index], s.player];
}
function settleEvents(s: GameState) {
  let n = 0;
  while (s.event || s.window) {
    assert.ok(++n < 500, "checkpoints terminate");
    s = reduceGame(
      s,
      s.event
        ? { type: "continue", eventId: s.event.id }
        : { type: "passWindow" },
    );
  }
  return s;
}

test("upkeep engagement resolves when the focused investigator has been eliminated", () => {
  let s = ready();
  eliminate(s, C(7));
  const id = `enemy-${s.nextId++}`;
  s.enemies.push({
    id,
    code: C(122),
    location: C(113),
    damage: 0,
    exhausted: true,
    engaged: false,
  });
  s.phase = "upkeep";
  s.queue = [{ kind: "readyCards", actor: "scenario" }];
  // Reuse the last recorded checkpoint so the reducer drains the queue.
  s.event = structuredClone(s.eventHistory.at(-1)!);
  s = reduceGame(s, { type: "continue", eventId: s.event.id });
  s = settleEvents(s);
  assert.equal(s.decision?.title, "Choose engagement");
  assert.deepEqual(
    s.decision!.choices.map((c) => c.id),
    [C(4), C(1)],
    "only surviving investigators are offered",
  );
  s = reduceGame(s, { type: "choose", id: C(4) });
  assert.equal(s.error, null);
  assert.notEqual(s.decision?.title, "Choose engagement");
  const hound = s.enemies.find((e) => e.id === id)!;
  assert.equal(hound.engaged, true);
  assert.equal(hound.engagedWith, C(4));
  s = settleEvents(s);
  for (let i = 0; i < 20 && s.decision; i++) {
    s = reduceGame(s, { type: "choose", id: s.decision.choices[0].id });
    s = settleEvents(s);
  }
  assert.ok(
    ["mythos", "investigation"].includes(s.phase) || s.round === 2,
    `the round continues past upkeep (phase ${s.phase})`,
  );
});

test("a decision that resolves nothing reports an error instead of looping silently", () => {
  let s = ready();
  eliminate(s, C(7));
  const id = `enemy-${s.nextId++}`;
  s.enemies.push({
    id,
    code: C(121),
    location: C(113),
    damage: 0,
    exhausted: false,
    engaged: false,
  });
  s.decision = {
    title: "Choose engagement",
    description: "Cantor of Flame must engage an investigator here.",
    choices: [C(4), C(1)].map((code) => ({
      id: code,
      label: card(code).name,
      // Explicitly owned by the eliminated investigator: every effect is skipped.
      effects: [
        { kind: "assignEngagement", id, target: code, actor: C(7) },
        { kind: "engagement", actor: C(7) },
      ],
    })),
  };
  const before = structuredClone(s);
  s = reduceGame(s, { type: "choose", id: C(4) });
  assert.equal(s.decision?.title, before.decision!.title);
  assert.match(s.error || "", /same decision returned/);
});
