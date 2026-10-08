import assert from "node:assert/strict";
import {
  standaloneSettingsForAnswer,
  standaloneSettingsState,
  validateCompanionAmounts,
  buildVentNoteRequest,
} from "../src/game/companionProtocol.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const scenarioCodes = new Set([":barkham:022", "70001", "87001"]);
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The scheduler relies on exact A/B/C ordering, never a caller-provided alias. */
export function assertLabyrinthResumeRoster({games, stoppedStates, eventId}) {
  assert.ok(uuid.test(eventId));
  assert.equal(games.length, 3);
  assert.equal(stoppedStates.length, 3);
  assert.deepEqual(games.map((p) => p.ordinal), [0, 1, 2]);
  assert.deepEqual(games.map((p) => p.group), ["GroupA", "GroupB", "GroupC"]);
  for (const participant of games) {
    assert.ok(uuid.test(participant.gameId) && uuid.test(participant.id));
    assert.equal(participant.eventId, eventId);
    assert.equal(participant.seatIndex, 0);
    assert.equal(participant.investigatorCode, "01001");
  }
  assert.equal(new Set(games.map((p) => p.gameId)).size, 3);
  assert.equal(new Set(games.map((p) => p.id)).size, 3);
  assert.equal(new Set(stoppedStates.map((p) => p.gameId)).size, 3);
  assert.deepEqual(stoppedStates.map((p) => p.gameId).sort(), games.map((p) => p.gameId).sort());
}

/** The legal runner submits responses to offered questions. It never submits
 * native messages, coordinator operations, clock changes or save edits. */
export function assertOfferedAnswer(reply, question, participant) {
  assert.ok(
    object(reply) && question,
    "A real offered native question is required.",
  );
  const contents = reply.contents;
  if (reply.tag === "DeckAnswer") {
    assert.equal(question.kind, "deck");
    assert.equal(reply.deckId, participant.deckId);
    assert.equal(reply.playerId, question.playerId);
    assert.equal(reply.overlay, null);
    assert.deepEqual(Object.keys(reply).sort(), [
      "deckId",
      "overlay",
      "playerId",
      "tag",
    ]);
    return;
  }
  if (reply.tag === "StandaloneSettingsAnswer") {
    assert.equal(question.tag, "PickScenarioSettings");
    assert.equal(question.kind, "settings");
    assert.ok(Array.isArray(contents));
    assert.deepEqual(
      contents,
      standaloneSettingsForAnswer(
        question.settings,
        standaloneSettingsState(question.settings),
      ),
      "Only the actual printed default standalone settings are used by this runner.",
    );
    assert.deepEqual(Object.keys(reply).sort(), ["contents", "tag"]);
    return;
  }
  assert.ok(object(contents), "Only a typed question answer is permitted.");
  assert.equal(contents.playerId, question.playerId);
  assert.equal(contents.questionVersion, question.questionVersion);
  if (reply.tag === "Answer") {
    assert.equal(question.kind, "choices");
    assert.ok(Number.isSafeInteger(contents.choice));
    const choice = question.choices.find(
      (row) => row.answerIndex === contents.choice,
    );
    assert.ok(
      choice && !choice.disabled,
      "The chosen option must actually be offered and enabled.",
    );
    assert.deepEqual(Object.keys(contents).sort(), [
      "choice",
      "playerId",
      "questionVersion",
    ]);
  } else if (reply.tag === "OrderedAnswer") {
    assert.equal(question.canOrder, true);
    const count =
      question.choices.length -
      (question.tag === "ChooseOneAtATimeWithAuto" ? 1 : 0);
    assert.ok(
      Array.isArray(contents.choices) && contents.choices.length === count,
    );
    assert.equal(new Set(contents.choices).size, count);
    assert.ok(
      contents.choices.every(
        (n) => Number.isSafeInteger(n) && n >= 0 && n < count,
      ),
    );
    assert.deepEqual(Object.keys(contents).sort(), [
      "choices",
      "playerId",
      "questionVersion",
    ]);
  } else if (["AmountsAnswer", "PaymentAmountsAnswer"].includes(reply.tag)) {
    assert.equal(question.kind, "amounts");
    assert.ok(object(contents.amounts));
    assert.deepEqual(
      Object.keys(contents.amounts).sort(),
      question.amountChoices.map((row) => row.id).sort(),
    );
    for (const row of question.amountChoices) {
      const n = contents.amounts[row.id];
      assert.ok(Number.isSafeInteger(n) && n >= row.min && n <= row.max);
    }
    assert.equal(
      validateCompanionAmounts(question, contents.amounts),
      undefined,
      "A payment must satisfy the actual native aggregate target as well as row bounds.",
    );
    assert.deepEqual(Object.keys(contents).sort(), [
      "amounts",
      "playerId",
      "questionVersion",
    ]);
  } else {
    throw new Error(`Legal playthrough does not permit ${reply.tag}.`);
  }
  assert.deepEqual(Object.keys(reply).sort(), ["contents", "tag"]);
}

export function assertLegalMutation({
  path,
  method,
  body,
  participants,
  importedDecks,
  question,
}) {
  assert.ok(["POST", "PUT"].includes(method));
  const url = new URL(path, "http://127.0.0.1");
  if (url.pathname === "/chronicle/decks" && method === "POST") {
    assert.ok(object(body.deckList) && typeof body.deckName === "string");
    assert.ok(!url.search);
    return "import-validated-deck";
  }
  if (url.pathname === "/api/v1/arkham/games" && method === "POST") {
    assert.deepEqual(Object.keys(body).sort(), [
      "campaignId",
      "campaignName",
      "deckIds",
      "difficulty",
      "includeTarotReadings",
      "multiplayerVariant",
      "options",
      "playerCount",
      "scenarioId",
    ]);
    assert.equal(body.scenarioId, ":barkham:022");
    assert.equal(body.campaignId, null);
    assert.equal(body.multiplayerVariant, "Solo");
    assert.equal(body.playerCount, 1);
    assert.equal(body.includeTarotReadings, false);
    assert.deepEqual(body.options, []);
    assert.equal(body.deckIds.length, 1);
    assert.ok(
      importedDecks.has(body.deckIds[0]),
      "A newly imported owned deck is required.",
    );
    assert.ok(["Easy", "Standard", "Hard", "Expert"].includes(body.difficulty));
    return "create-fresh-standalone";
  }
  if (url.pathname === "/chronicle/epic/events" && method === "POST") {
    assert.deepEqual(Object.keys(body).sort(), [
      "difficulty",
      "groups",
      "name",
      "scenarioId",
    ]);
    assert.ok(
      scenarioCodes.has(body.scenarioId) && body.scenarioId !== ":barkham:022",
    );
    assert.ok(["Standard", "Hard"].includes(body.difficulty));
    assert.equal(body.groups.length, 3);
    assert.ok(body.groups.every((group) => group.playerCount === 1));
    for (const group of body.groups)
      assert.deepEqual(Object.keys(group).sort(), ["name", "playerCount"]);
    return "create-fresh-epic";
  }
  const seatImport = url.pathname.match(
    /^\/chronicle\/epic\/seats\/([a-f0-9-]+)$/,
  );
  if (seatImport && method === "POST") {
    const participant = participants.find((seat) => seat.id === seatImport[1]);
    assert.ok(
      participant && uuid.test(participant.gameId),
      "Only this run's fresh seat may import a deck.",
    );
    assert.equal(body.deckList.investigator_code, participant.investigatorCode);
    return "prepare-owned-seat";
  }
  const native = url.pathname.match(/^\/api\/v1\/arkham\/games\/([a-f0-9-]+)$/);
  const companion = url.pathname.match(
    /^\/chronicle\/play\/games\/([a-f0-9-]+)\/(answer|ready|vent-note)$/,
  );
  const gameId = native?.[1] || companion?.[1];
  assert.ok(
    gameId && uuid.test(gameId),
    "Only a real question response or legitimate Ready operation is permitted.",
  );
  const participant = participants.find(
    (seat) =>
      seat.gameId === gameId &&
      (!seat.id || seat.id === url.searchParams.get("seat")),
  );
  assert.ok(
    participant,
    "Cannot mutate any game or seat this run did not create.",
  );
  if (companion?.[2] === "ready" && method === "POST") {
    assert.deepEqual(body, {});
    assert.equal(participant.setupCompleted, true);
    return "mark-owned-native-setup-ready";
  }
  if (companion?.[2] === "vent-note" && method === "POST") {
    assert.equal(typeof body.text, "string");
    assert.deepEqual(body, buildVentNoteRequest(question, body.text));
    return "answer-offered-Vent-note";
  }
  assert.ok(
    (native && method === "PUT") ||
      (companion?.[2] === "answer" && method === "POST"),
  );
  assertOfferedAnswer(body, question, participant);
  return "answer-offered-native-question";
}
