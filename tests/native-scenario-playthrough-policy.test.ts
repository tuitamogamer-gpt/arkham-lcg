import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLegalMutation,
  assertOfferedAnswer,
  assertLabyrinthResumeRoster,
  assertMachinationsResumeRoster,
} from "../scripts/native-scenario-playthrough-policy.mjs";

const gameId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const seatId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const participant = {
  gameId,
  id: seatId,
  deckId: "new-deck",
  investigatorCode: "01001",
};
const question = {
  kind: "choices",
  tag: "PlayerWindowChooseOne",
  playerId: "player",
  questionVersion: 7,
  choices: [
    { answerIndex: 0, disabled: false },
    { answerIndex: 1, disabled: true },
  ],
};
const reply = {
  tag: "Answer",
  contents: { choice: 0, playerId: "player", questionVersion: 7 },
};
const input = {
  path: `/chronicle/play/games/${gameId}/answer?seat=${seatId}`,
  method: "POST",
  body: reply,
  participants: [participant],
  importedDecks: new Set<string>(),
  question,
};

test("legal runner accepts only the current offered enabled choice", () => {
  assert.equal(assertLegalMutation(input), "answer-offered-native-question");
  assert.throws(() =>
    assertOfferedAnswer(
      { ...reply, contents: { ...reply.contents, choice: 1 } },
      question,
      participant,
    ),
  );
  assert.throws(() =>
    assertOfferedAnswer(
      { ...reply, contents: { ...reply.contents, questionVersion: 6 } },
      question,
      participant,
    ),
  );
});
test("fresh game ownership does not permit Raw, scenario operations, undo or forced time", () => {
  for (const tag of [
    "Raw",
    "ScenarioSpecificAnswer",
    "CampaignSpecificAnswer",
  ]) {
    assert.throws(() =>
      assertLegalMutation({
        ...input,
        body: { tag, contents: { playerId: "player", questionVersion: 7 } },
      }),
    );
  }
  for (const path of [
    `/api/v1/arkham/games/${gameId}/undo/scenario`,
    `/api/v1/arkham/events/${gameId}/time-up`,
  ])
    assert.throws(() => assertLegalMutation({ ...input, path }));
});
test("neither a foreign game nor a sibling seat is writable", () => {
  assert.throws(() => assertLegalMutation({ ...input, participants: [] }));
  assert.throws(() =>
    assertLegalMutation({ ...input, path: input.path.replace(seatId, gameId) }),
  );
});
test("typed native answers cannot smuggle messages in extra fields", () => {
  assert.throws(() =>
    assertOfferedAnswer(
      {
        ...reply,
        contents: { ...reply.contents, message: { tag: "PlaceTokens" } },
      },
      question,
      participant,
    ),
  );
  assert.throws(() =>
    assertOfferedAnswer(
      { ...reply, message: { tag: "ScenarioSpecific" } },
      question,
      participant,
    ),
  );
});
test("Ready remains unavailable until the actual setup checkpoint", () => {
  const ready = {
    ...input,
    path: `/chronicle/play/games/${gameId}/ready?seat=${seatId}`,
    body: {},
  };
  assert.throws(() => assertLegalMutation(ready));
  assert.equal(
    assertLegalMutation({
      ...ready,
      participants: [{ ...participant, setupCompleted: true }],
    }),
    "mark-owned-native-setup-ready",
  );
});
test("standalone creation requires a deck imported by this run and native Solo settings", () => {
  const create = {
    ...input,
    path: "/api/v1/arkham/games",
    body: {
      deckIds: ["new-deck"],
      scenarioId: ":barkham:022",
      campaignId: null,
      campaignName: "Fresh legal QA",
      multiplayerVariant: "Solo",
      playerCount: 1,
      includeTarotReadings: false,
      options: [],
      difficulty: "Easy",
    },
  };
  assert.throws(() => assertLegalMutation(create));
  assert.equal(
    assertLegalMutation({ ...create, importedDecks: new Set(["new-deck"]) }),
    "create-fresh-standalone",
  );
  assert.throws(() =>
    assertLegalMutation({
      ...create,
      importedDecks: new Set(["new-deck"]),
      body: { ...create.body, options: [{ tag: "Debug" }] },
    }),
  );
});
test("bounded payment rows cannot evade the native exact total", () => {
  const amountQuestion = {
    kind: "amounts",
    playerId: "player",
    questionVersion: 7,
    tag: "ChoosePaymentAmounts",
    amountChoices: [{ id: "own", min: 0, max: 5 }],
    amountTarget: { tag: "TotalAmountTarget", contents: 2 },
  };
  const amountReply = {
    tag: "PaymentAmountsAnswer",
    contents: { playerId: "player", questionVersion: 7, amounts: { own: 1 } },
  };
  assert.throws(() =>
    assertOfferedAnswer(amountReply, amountQuestion, participant),
  );
  assert.doesNotThrow(() =>
    assertOfferedAnswer(
      {
        ...amountReply,
        contents: { ...amountReply.contents, amounts: { own: 2 } },
      },
      amountQuestion,
      participant,
    ),
  );
});
test("Vent notes are bound to the actual native note prompt and owned seat", () => {
  const noteQuestion = {
    kind: "specific", playerId: "player", questionVersion: 7,
    specific: {scope: "scenario", key: "epicLabyrinth.note",
      payload: {story: "c70035", investigator: "c01001"}},
  };
  const note = {...input,
    path: `/chronicle/play/games/${gameId}/vent-note?seat=${seatId}`,
    question: noteQuestion,
    body: {playerId: "player", questionVersion: 7, storyId: "c70035",
      investigatorId: "c01001", text: "My revealed chamber is the Chamber of Secrets."},
  };
  assert.equal(assertLegalMutation(note), "answer-offered-Vent-note");
  for (const body of [
    {...note.body, storyId: "foreign"},
    {...note.body, investigatorId: "foreign"},
    {...note.body, questionVersion: 6},
    {...note.body, messages: [{tag: "Raw"}]},
    {...note.body, text: "x".repeat(4001)},
  ]) assert.throws(() => assertLegalMutation({...note, body}));
  assert.throws(() => assertLegalMutation({...note, question}));
});
test("Labyrinth resume requires exactly one unchanged A/B/C seat and snapshot each", () => {
  const eventId = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
  const roster = {
    eventId,
    games: [0, 1, 2].map((ordinal) => ({
      ordinal, group: ["GroupA", "GroupB", "GroupC"][ordinal], eventId,
      gameId: `aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa${ordinal}`,
      id: `bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb${ordinal}`,
      seatIndex: 0, investigatorCode: "01001",
    })),
    stoppedStates: [0, 1, 2].map((ordinal) => ({gameId: `aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa${ordinal}`})),
  };
  assert.doesNotThrow(() => assertLabyrinthResumeRoster(roster));
  const variants = [
    {...roster, games: [...roster.games].reverse()},
    {...roster, games: [roster.games[0], roster.games[0], roster.games[2]]},
    {...roster, games: roster.games.map((g, i) => i === 1 ? {...g, id: roster.games[0].id} : g)},
    {...roster, games: roster.games.map((g, i) => i === 2 ? {...g, group: "GroupA"} : g)},
    {...roster, stoppedStates: [roster.stoppedStates[0], roster.stoppedStates[0], roster.stoppedStates[2]]},
    {...roster, stoppedStates: roster.stoppedStates.map((s, i) => i === 2 ? {gameId} : s)},
  ];
  for (const bad of variants) assert.throws(() => assertLabyrinthResumeRoster(bad));
});

test("Machinations resume binds each owned seat to its original Past/Present/Future era", () => {
  const eventId = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
  const roster = {
    eventId,
    games: ["Past", "Present", "Future"].map((group, ordinal) => ({
      ordinal, group, eventId,
      gameId: `aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa${ordinal}`,
      id: `bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb${ordinal}`,
      seatIndex: 0, investigatorCode: "01001",
    })),
    stoppedStates: [0, 1, 2].map((ordinal) => ({
      gameId: `aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa${ordinal}`,
    })),
  };
  assert.doesNotThrow(() => assertMachinationsResumeRoster(roster));
  assert.doesNotThrow(() => assertMachinationsResumeRoster({
    ...roster, stoppedStates: [...roster.stoppedStates].reverse(),
  }), "snapshot storage order must not reassign the native era seats");
  const variants = [
    {
      name: "Past and Present renamed without changing their owned games",
      games: roster.games.map((seat, ordinal) => ({
        ...seat, group: ["Present", "Past", "Future"][ordinal],
      })),
    },
    {
      name: "Labyrinth aliases substituted for Machinations eras",
      games: roster.games.map((seat, ordinal) => ({
        ...seat, group: ["GroupA", "GroupB", "GroupC"][ordinal],
      })),
    },
    {
      name: "era order changed",
      games: [...roster.games].reverse(),
    },
    {
      name: "Future replaced by a second Present",
      games: roster.games.map((seat, ordinal) => ordinal === 2
        ? { ...seat, group: "Present" } : seat),
    },
    {
      name: "seat imported from another epic event",
      games: roster.games.map((seat, ordinal) => ordinal === 1
        ? { ...seat, eventId: gameId } : seat),
    },
    {
      name: "another seat in the same era substituted",
      games: roster.games.map((seat, ordinal) => ordinal === 1
        ? { ...seat, seatIndex: 1 } : seat),
    },
    {
      name: "unreviewed investigator substituted",
      games: roster.games.map((seat, ordinal) => ordinal === 1
        ? { ...seat, investigatorCode: "01002" } : seat),
    },
    {
      name: "two eras share a game",
      games: roster.games.map((seat, ordinal) => ordinal === 2
        ? { ...seat, gameId: roster.games[0].gameId } : seat),
    },
    {
      name: "two eras share a seat identity",
      games: roster.games.map((seat, ordinal) => ordinal === 2
        ? { ...seat, id: roster.games[0].id } : seat),
    },
  ];
  for (const variant of variants)
    assert.throws(() => assertMachinationsResumeRoster({
      ...roster, games: variant.games,
    }), variant.name);
  for (const stoppedStates of [
    roster.stoppedStates.slice(0, 2),
    [roster.stoppedStates[0], roster.stoppedStates[1], roster.stoppedStates[1]],
    [...roster.stoppedStates.slice(0, 2), { gameId }],
  ]) assert.throws(() => assertMachinationsResumeRoster({ ...roster, stoppedStates }),
    "every original era must retain exactly one matching stopped snapshot");
  assert.throws(() => assertLabyrinthResumeRoster(roster),
    "Machinations era names cannot qualify as a Labyrinth resume");
});
