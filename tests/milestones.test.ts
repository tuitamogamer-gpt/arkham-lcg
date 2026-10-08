import test from "node:test";
import assert from "node:assert/strict";
import { createGame, reduceGame as step } from "./helpers";
import { reduceGame as raw } from "../src/game/engine";
import type { Effect, GameState } from "../src/game/types";
import {
  companionSnapshot,
  type CompanionSnapshot,
} from "../src/game/companionProtocol";
import {
  selectCompanionMilestone,
  selectCoreMilestone,
} from "../src/game/milestones";

const ready = () =>
  step(createGame("easy", 712), { type: "mulligan", ids: [] });
function effects(s: GameState, queue: Effect[]): GameState {
  const prepared = structuredClone(s);
  prepared.decision = {
    title: "Milestone fixture",
    description: "",
    choices: [{ id: "go", label: "Go", effects: queue }],
  };
  return raw(prepared, { type: "choose", id: "go" });
}

// Public wire excerpt from the pinned native Barkham run: positional ActSequence,
// record AgendaSequence, independent physical CardIds, and an integer deckId.
function native(): CompanionSnapshot {
  return companionSnapshot({
    playerId: "own-player",
    investigatorIds: ["c:barkham:004"],
    game: {
      id: "native-game",
      scenarioSteps: 50,
      gameState: { tag: "IsActive" },
      inSetup: false,
      mode: { That: { id: "c:barkham:022", started: true } },
      acts: {
        "c:barkham:025": {
          id: "c:barkham:025",
          cardId: "physical-act-one",
          deckId: 1,
          sequence: [1, "A"],
        },
      },
      agendas: {
        "c:barkham:023": {
          id: "c:barkham:023",
          cardId: "physical-agenda-one",
          deckId: 1,
          sequence: { agendaSequenceStep: 1, agendaSequenceSide: "A" },
        },
      },
    },
  });
}
function next(snapshot: CompanionSnapshot): CompanionSnapshot {
  const updated = structuredClone(snapshot);
  updated.step++;
  return updated;
}
function advance(
  snapshot: CompanionSnapshot,
  kind: "act" | "agenda",
  index = 2,
  deck = 1,
) {
  const entity = {
    id: `${kind}-${deck}-${index}`,
    cardId: `physical-${kind}-${deck}-${index}`,
    deckId: deck,
    sequence:
      kind === "act"
        ? [index, "A"]
        : {
            agendaSequenceStep: index,
            agendaSequenceSide: "A",
          },
  };
  snapshot.game = {
    ...snapshot.game,
    [kind === "act" ? "acts" : "agendas"]: { [entity.id]: entity },
  };
}

test("actual Core act and agenda transitions emit one significant cue", () => {
  const initial = ready();
  assert.equal(
    selectCoreMilestone(initial, effects(initial, [{ kind: "advanceAct" }]))
      ?.kind,
    "act",
  );
  const impending = ready();
  impending.doom = 2;
  const advanced = effects(impending, [{ kind: "doom", amount: 1 }]);
  assert.equal(selectCoreMilestone(impending, advanced)?.kind, "agenda");
  assert.equal(
    selectCoreMilestone(advanced, structuredClone(advanced)),
    undefined,
  );
  assert.equal(
    selectCoreMilestone(advanced, impending),
    undefined,
    "A restored earlier checkpoint is not an advance.",
  );
});

test("the actual final Core agenda emits defeat instead of an agenda accent", () => {
  const before = ready();
  before.agenda = 3;
  before.doom = 9;
  const after = effects(before, [{ kind: "doom", amount: 1 }]);
  assert.equal(after.campaign.result, "overrun");
  assert.equal(selectCoreMilestone(before, after)?.kind, "defeat");
  assert.equal(selectCoreMilestone(after, structuredClone(after)), undefined);
});

test("Core endings use authoritative result fields rather than log text or victory cards", () => {
  const before = ready();
  const results = new Map([
    ["saved", "victory"],
    ["pursuer", "victory"],
    ["defeat", "defeat"],
    ["overrun", "defeat"],
    ["resigned", "ended"],
    ["unrecognized", "ended"],
  ]);
  for (const [result, expected] of results) {
    const after = structuredClone(before);
    after.status = "resolution";
    after.campaign.result = result;
    after.act++;
    after.agenda++;
    after.campaign.notes = ["The investigators won a victory."];
    after.victory = ["12114"];
    assert.equal(selectCoreMilestone(before, after)?.kind, expected);
  }
  const unknown = structuredClone(before);
  unknown.status = "resolution";
  assert.equal(selectCoreMilestone(before, unknown)?.kind, "ended");
});

test("Core routine actions and cross-game/loading states have no milestone", () => {
  const before = ready();
  const routine = structuredClone(before);
  routine.player.resources++;
  routine.player.damage++;
  routine.player.location = "12117";
  routine.phase = "mythos";
  routine.eventSerial++;
  assert.equal(selectCoreMilestone(before, routine), undefined);
  const foreign = structuredClone(before);
  foreign.id = "another-game";
  foreign.act++;
  assert.equal(selectCoreMilestone(before, foreign), undefined);
  const mulligan = structuredClone(before);
  mulligan.status = "mulligan";
  assert.equal(selectCoreMilestone(mulligan, foreign), undefined);
});

test("pinned native positional act and record agenda sequences detect physical deck advances", () => {
  const before = native();
  for (const kind of ["act", "agenda"] as const) {
    const after = next(before);
    advance(after, kind);
    const cue = selectCompanionMilestone(before, after);
    assert.equal(cue?.kind, kind);
    assert.equal(cue?.title, `${kind === "act" ? "Act" : "Agenda"} 2`);
    assert.equal(selectCompanionMilestone(after, next(after)), undefined);
  }
});

test("native endings remain neutral even with fabricated success text and defeated bosses", () => {
  const before = native(),
    after = next(before);
  advance(after, "act");
  advance(after, "agenda");
  after.game = {
    ...after.game,
    gameState: { tag: "IsOver" },
    log: ["Victory! The investigators escaped."],
    campaign: { result: "saved" },
    victoryDisplay: [{ cardCode: "c:barkham:037" }],
  };
  assert.deepEqual(selectCompanionMilestone(before, after), {
    key: "native:native-game:c:barkham:022:ending",
    kind: "ended",
    title: "Investigation ended",
  });
  assert.equal(selectCompanionMilestone(after, next(after)), undefined);
});

test("native setup cancellation and unknown scenario context cannot announce an ending", () => {
  const played = native();
  const over = next(played);
  over.game = { ...over.game, gameState: { tag: "IsOver" } };
  // Real Barkham and Labyrinth terminal snapshots retain inSetup:false and the
  // same scenario id. IsActive during setup alone cannot establish played context.
  assert.equal(selectCompanionMilestone(played, over)?.kind, "ended");
  for (const update of [
    (s: CompanionSnapshot) => {
      s.game = { ...s.game, inSetup: true };
    },
    (s: CompanionSnapshot) => {
      s.game = { ...s.game, inSetup: undefined };
    },
    (s: CompanionSnapshot) => {
      s.game = { ...s.game, mode: {} };
    },
    (s: CompanionSnapshot) => {
      s.game = { ...s.game, mode: { That: { started: true } } };
    },
  ]) {
    const before = structuredClone(played),
      after = structuredClone(over);
    update(before);
    update(after);
    assert.equal(selectCompanionMilestone(before, after), undefined);
  }
  const staleTerminal = structuredClone(over);
  staleTerminal.game = { ...staleTerminal.game, inSetup: true };
  assert.equal(selectCompanionMilestone(played, staleTerminal), undefined);
  const compactPlayed = structuredClone(played),
    compactOver = structuredClone(over);
  for (const snapshot of [compactPlayed, compactOver])
    snapshot.game = {
      ...snapshot.game,
      mode: { That: { id: "c:barkham:022" } },
    };
  assert.equal(
    selectCompanionMilestone(compactPlayed, compactOver)?.kind,
    "ended",
    "A started field is not required when completed setup and the scenario identity are explicit.",
  );
});

test("agenda has priority when native act and agenda advance together", () => {
  const before = native(),
    after = next(before);
  advance(after, "act");
  advance(after, "agenda");
  assert.equal(selectCompanionMilestone(before, after)?.kind, "agenda");
});

test("native flips, replacement printings and new parallel decks do not invent sequence advances", () => {
  const before = native(),
    flipped = next(before);
  flipped.game = {
    ...flipped.game,
    acts: {
      flipped: {
        id: "same-act-back",
        cardId: "physical-act-one",
        deckId: 1,
        sequence: [1, "B"],
      },
    },
    agendas: {
      flipped: {
        id: "same-agenda-back",
        cardId: "physical-agenda-one",
        deckId: 1,
        sequence: { agendaSequenceStep: 1, agendaSequenceSide: "B" },
      },
    },
  };
  assert.equal(selectCompanionMilestone(before, flipped), undefined);
  const newDeck = next(before);
  advance(newDeck, "act", 4, 2);
  assert.equal(selectCompanionMilestone(before, newDeck), undefined);
});

test("native context rejects game, seat, scenario and stale/undo snapshot changes", () => {
  const before = native(),
    advancing = next(before);
  advance(advancing, "act");
  for (const change of [
    (s: CompanionSnapshot) => {
      s.gameId = "another-game";
    },
    (s: CompanionSnapshot) => {
      s.playerId = "another-seat";
    },
    (s: CompanionSnapshot) => {
      s.game = { ...s.game, id: "mismatched-native-game" };
    },
    (s: CompanionSnapshot) => {
      s.game = { ...s.game, mode: { That: { id: "another-scenario" } } };
    },
    (s: CompanionSnapshot) => {
      s.step = before.step;
    },
    (s: CompanionSnapshot) => {
      s.step = before.step - 1;
    },
  ]) {
    const invalid = structuredClone(advancing);
    change(invalid);
    assert.equal(selectCompanionMilestone(before, invalid), undefined);
  }
});

test("unknown, malformed, setup and ambiguous physical native records cannot trigger an accent", () => {
  const before = native();
  const valid = next(before);
  advance(valid, "act");
  for (const entity of [
    { id: "unknown", cardId: "physical", deckId: 1, sequence: [2, "Unknown"] },
    { id: "unknown", cardId: "physical", deckId: 1, sequence: [2.5, "A"] },
    {
      id: "unknown",
      cardId: "physical",
      deckId: 1,
      sequence: { actSequenceStep: 2, actSequenceSide: "A" },
    },
    { id: "unknown", cardId: "physical", sequence: [2, "A"] },
    { id: "unknown", deckId: 1, sequence: [2, "A"] },
  ]) {
    const after = next(before);
    after.game = { ...after.game, acts: { unknown: entity } };
    assert.equal(selectCompanionMilestone(before, after), undefined);
  }
  const setup = structuredClone(valid);
  setup.game = { ...setup.game, inSetup: true };
  assert.equal(selectCompanionMilestone(before, setup), undefined);
  const ambiguous = structuredClone(valid);
  ambiguous.game = {
    ...ambiguous.game,
    acts: {
      invalid: { id: "invalid", deckId: 1 },
      ...(valid.game.acts as Record<string, unknown>),
    },
  };
  assert.equal(selectCompanionMilestone(before, ambiguous), undefined);
});

test("campaign/scenario These mode and multiple public deck identities remain distinct", () => {
  const before = native();
  before.game = {
    ...before.game,
    mode: { These: [{ id: "campaign" }, { id: "c:barkham:022" }] },
    acts: {
      ...(before.game.acts as Record<string, unknown>),
      parallel: {
        id: "parallel",
        cardId: "physical-parallel",
        deckId: 2,
        sequence: [3, "A"],
      },
    },
  };
  const after = next(before);
  advance(after, "act", 4, 2);
  assert.match(selectCompanionMilestone(before, after)!.key, /:act:2:4$/);
});

test("native milestone projection neither reads concealed identities nor mutates snapshots", () => {
  const before = native(),
    after = next(before);
  advance(after, "act");
  const serialized = JSON.stringify({ before, after });
  for (const snapshot of [before, after]) {
    for (const key of ["encounterDeck", "question", "log", "focusedCards"]) {
      Object.defineProperty(snapshot.game, key, {
        get() {
          throw new Error(`Milestones must not inspect ${key}`);
        },
        configurable: true,
      });
    }
    const mode = snapshot.game.mode as { That: Record<string, unknown> };
    for (const key of ["actStack", "agendaStack", "chaosBag"]) {
      Object.defineProperty(mode.That, key, {
        get() {
          throw new Error(`Milestones must not inspect ${key}`);
        },
        configurable: true,
      });
    }
  }
  assert.equal(selectCompanionMilestone(before, after)?.kind, "act");
  assert.equal(JSON.stringify({ before, after }), serialized);
});
