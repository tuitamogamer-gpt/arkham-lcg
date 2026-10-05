import test from "node:test";
import assert from "node:assert/strict";
import { createGame, reduceGame } from "./helpers";
import { reduceGame as step } from "../src/game/engine";
import { isUndoBarrier } from "../src/game/undo";
import type { Action, GameState } from "../src/game/types";

function ready(codes = ["12004"]) {
  let s = createGame("easy", 42, codes);
  while (s.status === "mulligan")
    s = reduceGame(s, { type: "mulligan", ids: [] });
  return s;
}
test("a resource action remains undoable but drawing clears earlier undo in every tempo", () => {
  for (const tempo of ["detailed", "smart", "fast"] as const) {
    let s = ready();
    s.player.deck = [{ id: "unseen", code: "12089" }];
    const resource: Action = { type: "act", kind: "resource" };
    const next = step(s, resource, { tempo });
    assert.equal(isUndoBarrier(s, next, resource), false, tempo);
    s = reduceGame(next, { type: "clearError" });
    const draw: Action = { type: "act", kind: "draw" };
    let after = step(s, draw, { tempo });
    let blocked = isUndoBarrier(s, after, draw);
    for (let guard = 0; guard < 30 && (after.event || after.window); guard++) {
      const action: Action = after.event
        ? { type: "continue", eventId: after.event.id }
        : { type: "passWindow" };
      const current = after;
      after = step(current, action, { tempo });
      blocked ||= isUndoBarrier(current, after, action);
    }
    assert.ok(after.player.hand.some((c) => c.id === "unseen"));
    assert.ok(
      blocked,
      `${tempo}: newly drawn identity cannot be hidden with undo`,
    );
  }
});
test("switching seats before the first action cannot retain another seat's undo", () => {
  const s = ready(["12004", "12010"]);
  const action: Action = { type: "switchInvestigator", code: "12010" };
  const after = reduceGame(s, action);
  assert.equal(after.player.code, "12010");
  assert.ok(isUndoBarrier(s, after, action));
});
test("searching the encounter deck with Paint the Town Red cannot be undone", () => {
  const s = ready(["12007"]);
  s.player.hand.push({ id: "paint", code: "12051" });
  s.player.resources = 5;
  s.encounterDeck = ["12121", "12129", "12122"];
  const play: Action = { type: "play", id: "paint" };
  let after = step(s, play);
  assert.equal(after.error, null);
  let blocked = isUndoBarrier(s, after, play);
  for (let guard = 0; guard < 30 && !after.decision; guard++) {
    const action: Action = after.event
      ? { type: "continue", eventId: after.event.id }
      : { type: "passWindow" };
    const current = after;
    after = step(current, action);
    blocked ||= isUndoBarrier(current, after, action);
  }
  assert.equal(after.decision?.title, "Paint the Town Red");
  assert.ok(after.decision!.choices.some((c) => c.id === "12121"));
  assert.ok(blocked, "the searched cards are now known");
});
test("new location faces and search choices cannot be undone to peek", () => {
  const s = ready();
  const after: GameState = structuredClone(s);
  after.locations.find((l) => !l.revealed)!.revealed = true;
  assert.ok(
    isUndoBarrier(s, after, { type: "continue", eventId: s.eventSerial }),
  );
  const search = structuredClone(s);
  search.decision = {
    title: "Right Tool for the Job",
    description: "Search the top 9 cards.",
    choices: [
      { id: s.player.deck[0].id, label: "A searched card", effects: [] },
    ],
  };
  assert.ok(isUndoBarrier(s, search, { type: "play", id: "right-tool" }));
});
