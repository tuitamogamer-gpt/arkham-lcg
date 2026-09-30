import test from "node:test";
import assert from "node:assert/strict";
import { createGame, reduceGame as step } from "./helpers";
import { party, reduceGame as raw } from "../src/game/engine";
import { code as C } from "../src/game/data";
import { decodeSave } from "../src/game/storage";
import type { GameState } from "../src/game/types";

function ready(codes = [C(4), C(7)]) {
  let s = createGame("easy", 2924, codes);
  while (s.status === "mulligan") s = step(s, { type: "mulligan", ids: [] });
  for (const p of party(s)) {
    p.hand = [];
    p.assets = [];
    p.resources = 20;
    p.deck = [{ id: `draw-${p.code}`, code: C(89) }];
    p.flags.joe = true;
    p.flags.dexter = true;
  }
  s.bag = ["0"];
  return s;
}
const member = (s: GameState, code: string) =>
  party(s).find((p) => p.code === code)!;
function asset(s: GameState, n: number) {
  const id = `followup-${s.nextId++}`;
  s.player.assets.push({
    id,
    code: C(n),
    uses: 3,
    damage: 0,
    horror: 0,
    exhausted: false,
  });
  return id;
}
function hand(s: GameState, n: number) {
  const id = `followup-${s.nextId++}`;
  s.player.hand.push({ id, code: C(n) });
  return id;
}
function select(s: GameState, label: string) {
  const option = s.decision?.choices.find((c) => c.label.includes(label));
  assert.ok(option, `${s.decision?.title}: missing ${label}`);
  return step(s, { type: "choose", id: option.id });
}

test("a teammate's successful skill draw belongs to its committer and preserves test ownership", () => {
  let s = ready();
  const assist = `assist-${s.nextId++}`;
  member(s, C(7)).hand.push({ id: assist, code: C(93) });
  s = step(s, { type: "act", kind: "investigate" });
  s = step(s, { type: "commit", id: assist });
  s = decodeSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(s);
  s = step(s, { type: "reveal" });
  s = step(s, { type: "resolve" });
  assert.equal(s.decision?.title, "Choose skill test result order");
  s = select(s, "Perception");
  assert.equal(member(s, C(7)).hand[0]?.id, `draw-${C(7)}`);
  assert.equal(member(s, C(4)).hand.length, 0);
  assert.equal(member(s, C(4)).clues, 1);
  assert.equal(s.player.code, C(4));
  assert.equal(s.turnInvestigator, C(4));
  assert.ok(member(s, C(7)).discard.some((c) => c.id === assist));
  assert.equal(s.testInProgress, false);
});

test("a skill reward resolves the assisting investigator's drawn weakness", () => {
  let s = ready();
  const assist = `assist-${s.nextId++}`;
  member(s, C(7)).hand.push({ id: assist, code: C(93) });
  member(s, C(7)).deck = [{ id: "assistant-paranoia", code: C(101) }];
  s = step(s, { type: "act", kind: "investigate" });
  s = step(s, { type: "commit", id: assist });
  s = step(s, { type: "reveal" });
  s = step(s, { type: "resolve" });
  s = select(s, "Perception");
  assert.equal(member(s, C(7)).resources, 0);
  assert.equal(member(s, C(4)).resources, 20);
  assert.ok(member(s, C(7)).discard.some((c) => c.id === "assistant-paranoia"));
  assert.equal(s.player.code, C(4));
});

test("a two-handed asset replaces both occupied hands and charges its play costs once", () => {
  let s = ready([C(13)]);
  const first = asset(s, 34),
    second = asset(s, 88);
  const twin = hand(s, 14);
  s = step(s, { type: "play", id: twin });
  assert.match(s.decision?.title || "", /Make room/);
  s = step(s, { type: "choose", id: first });
  assert.match(s.decision?.title || "", /Make room/);
  assert.ok(!s.player.assets.some((a) => a.id === twin));
  s = decodeSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(s);
  s = step(s, { type: "choose", id: second });
  assert.deepEqual(
    s.player.assets.map((a) => a.id),
    [twin],
  );
  assert.equal(s.player.resources, 16);
  assert.equal(s.player.actions, 2);
  assert.ok(s.player.discard.some((c) => c.id === first));
  assert.ok(s.player.discard.some((c) => c.id === second));
});

test("a single-handed asset conflicts with a two-handed asset", () => {
  let s = ready([C(13)]);
  const twin = asset(s, 14);
  const flashlight = hand(s, 88);
  s = step(s, { type: "play", id: flashlight });
  assert.deepEqual(
    s.decision?.choices.map((c) => c.id),
    [twin],
  );
  s = step(s, { type: "choose", id: twin });
  assert.deepEqual(
    s.player.assets.map((a) => a.id),
    [flashlight],
  );
});

test("investigators have two arcane slots and replace an asset for the third spell", () => {
  let s = ready([C(10)]);
  const first = asset(s, 62);
  const second = hand(s, 59);
  s = step(s, { type: "play", id: second });
  assert.equal(s.decision, null);
  assert.deepEqual(
    s.player.assets.map((a) => a.id),
    [first, second],
  );
  const third = hand(s, 62);
  s = step(s, { type: "play", id: third });
  assert.deepEqual(
    s.decision?.choices.map((c) => c.id),
    [first, second],
  );
  s = step(s, { type: "choose", id: first });
  assert.deepEqual(
    s.player.assets.map((a) => a.id),
    [second, third],
  );
});

test("The Necronomicon occupies an arcane slot in its threat area", () => {
  let s = ready([C(10)]);
  const first = asset(s, 62),
    second = asset(s, 59);
  s.player.deck = [{ id: "draw-necro", code: C(12) }];
  s = step(s, { type: "act", kind: "draw" });
  assert.match(s.decision?.title || "", /Make room for The Necronomicon/);
  assert.deepEqual(
    s.decision?.choices.map((c) => c.id),
    [first, second],
  );
  s = step(s, { type: "choose", id: first });
  assert.equal(s.decision, null);
  assert.deepEqual(
    s.player.assets.map((a) => a.id),
    [second],
  );
  assert.ok(s.player.threats.includes(C(12)));
});

test("player-card doom has a visible confirmation before Will of the Cosmos discovers clues", () => {
  let s = ready([C(10)]);
  const event = hand(s, 66);
  s = raw(s, { type: "play", id: event });
  while (s.event) s = raw(s, { type: "continue", eventId: s.event.id });
  assert.equal(s.decision?.title, "Will of the Cosmos · place doom");
  s = raw(s, { type: "choose", id: C(10) });
  assert.equal(s.event?.title, "Doom placed");
  assert.equal(s.event?.card, C(66));
  assert.ok(
    s.event?.changes.some(
      (c) => c.label === "Doom" && c.before === "0" && c.after === "1",
    ),
  );
  assert.equal(s.player.clues, 0);
  assert.ok(decodeSave(JSON.parse(JSON.stringify(s))));
});
