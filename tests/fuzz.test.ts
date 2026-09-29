import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  reduceGame,
  fastOptions,
  canAct,
  canPlay,
  availableConnections,
} from "../src/game/engine";
import { validSave, decodeSave } from "../src/game/storage";
import type { Action, GameState } from "../src/game/types";

// Random legal play across many seeds. This is not a rules oracle: it only
// asserts that the engine never throws, never produces an invalid save, and
// never repeats the same decision without progress.
function legalActions(s: GameState, rnd: () => number): Action[] {
  if (s.introduction && s.introduction !== "complete")
    return [{ type: "continueIntroduction", page: s.introduction }];
  if (s.event) return [{ type: "continue", eventId: s.event.id }];
  if (s.decision)
    return s.decision.choices.map((c) => ({ type: "choose", id: c.id }));
  if (s.window)
    return [
      { type: "passWindow" },
      ...fastOptions(s).map((o) => ({ type: "fast", id: o.id }) as Action),
    ];
  if (s.test)
    return s.test.stage === "commit"
      ? [
          { type: "reveal" },
          ...s.player.hand.map((c) => ({ type: "commit", id: c.id }) as Action),
        ]
      : [{ type: "resolve" }];
  if (s.status === "mulligan")
    return [
      {
        type: "mulligan",
        ids: s.player.hand.slice(0, Math.floor(rnd() * 3)).map((c) => c.id),
      },
    ];
  if (s.status !== "playing") return [];
  const acts: Action[] = [];
  for (const kind of [
    "resource",
    "draw",
    "investigate",
    "rest",
    "library",
    "extinguish",
    "resign",
    "jumpsuit",
  ])
    if (!canAct(s, kind)) acts.push({ type: "act", kind });
  for (const target of availableConnections(s))
    for (const kind of ["move", "olivier"])
      if (!canAct(s, kind, target)) acts.push({ type: "act", kind, target });
  for (const e of s.enemies) {
    for (const kind of ["fight", "evade", "engage", "parley", "clueDamage", "wrench"])
      if (!canAct(s, kind, e.id)) acts.push({ type: "act", kind, target: e.id });
    for (const a of s.player.assets)
      if (!canAct(s, "fight", e.id, a.id))
        acts.push({ type: "act", kind: "fight", target: e.id, source: a.id });
  }
  for (const a of s.player.assets)
    if (!canAct(s, "investigate", undefined, a.id))
      acts.push({ type: "act", kind: "investigate", source: a.id });
  for (const c of s.player.hand)
    if (!canPlay(s, c.id)) acts.push({ type: "play", id: c.id });
  for (const t of s.player.threats)
    if (!canAct(s, "removeThreat", t))
      acts.push({ type: "act", kind: "removeThreat", target: t });
  acts.push({ type: "endTurn" });
  return acts;
}
const parties = [
  ["12004"],
  ["12001"],
  ["12007"],
  ["12004", "12001"],
  ["12007", "12001"],
  ["12004", "12001", "12007"],
  ["12004", "12001", "12007"],
  ["12007", "12004", "12001"],
];
const difficulties = ["easy", "standard", "hard", "expert"] as const;

test("random legal play never throws, never corrupts saves and never loops on a decision", () => {
  let finished = 0;
  for (let g = 0; g < 40; g++) {
    let seed = 1000 + g * 7919;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const party = parties[g % parties.length];
    let s = createGame(difficulties[g % 4], 5000 + g, party);
    let repeats = 0;
    let lastDecision = "";
    for (let n = 0; n < 1500; n++) {
      const acts = legalActions(s, rnd);
      if (!acts.length) break;
      const a = acts[Math.floor(rnd() * acts.length)];
      s = reduceGame(s, a);
      if (s.decision) {
        const key = s.decision.title + s.decision.choices.map((c) => c.id).join();
        repeats = key === lastDecision ? repeats + 1 : 0;
        lastDecision = key;
        assert.ok(
          repeats < 12,
          `game ${g} (${party.join("/")}) repeats "${s.decision.title}" in round ${s.round}, phase ${s.phase}`,
        );
      }
      assert.equal(
        s.error && /same decision returned/.test(s.error) ? s.error : null,
        null,
        `game ${g} hit the decision loop guard`,
      );
      if (n % 150 === 0) {
        const json = JSON.parse(JSON.stringify(s));
        assert.ok(validSave(json), `game ${g} produced an invalid save at step ${n}`);
        assert.ok(decodeSave(json), `game ${g} produced an undecodable save at step ${n}`);
      }
      if (s.status === "resolution") {
        finished++;
        break;
      }
    }
  }
  assert.ok(finished > 10, `most random games reach a resolution (${finished}/40)`);
});
