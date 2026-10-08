import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

/** Validate every group before the scheduler can submit another answer. */
export function epicReadResolution(question, scenarioKind) {
  if (question?.tag !== "Read") return;
  const namespace = {labyrinth: "theLabyrinthsOfLunacy", machinations: "machinationsThroughTime"}[scenarioKind];
  assert.ok(namespace);
  let native = question.raw;
  for (let n = 0; n < 8 && ["QuestionLabel", "QuestionLabelWithCard", "QuestionWithTooltip", "QuestionWithSource", "PayCostQuestion"].includes(native?.tag); n++)
    native = native.question;
  if (native?.tag !== "Read" || typeof native.flavorText?.title !== "string") return;
  // Native resolutionWithXp uses one Int variable, serialized by I18n as
  // " xp=i:0.0". Machinations R1/R2/R4 use it; Labyrinth and fatal R3 do not.
  const match = new RegExp(`^\\$?standalone\\.${namespace}\\.resolutions\\.resolution([1-4])\\.title(?: xp=i:(0|[1-9][0-9]*)\\.0)?$`).exec(native.flavorText.title);
  if (!match || match[0] !== native.flavorText.title || (match[2] !== undefined && (scenarioKind !== "machinations"
    || match[1] === "3" || !Number.isSafeInteger(Number(match[2]))))) return;
  return Number(match[1]);
}

export function assertEpicResumeStates({states, validatedWinningReadGameIds, winningResolution}) {
  assert.ok([1, 4].includes(winningResolution));
  assert.equal(states.length, 3);
  const ids = states.map((state) => state.gameId);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.every((id) => uuid.test(id)));
  assert.ok(validatedWinningReadGameIds.every((id) => ids.includes(id)));
  for (const {gameId, snapshot, resolution} of states) {
    assert.equal(snapshot?.game?.id, gameId);
    const status = snapshot.game.gameState?.tag;
    assert.ok(["IsActive", "IsOver"].includes(status), "Only active or validated winning native groups can resume.");
    if (resolution !== undefined)
      assert.equal(resolution, winningResolution, "An actual printed losing Epic resolution cannot resume the event.");
    if (status === "IsOver")
      assert.ok(validatedWinningReadGameIds.includes(gameId), "A terminal losing Epic group cannot resume the event.");
  }
}

/** A failed seat read must not prevent capture of the remaining groups. */
export async function captureEpicStoppedStates({participants, previousStates = [], capture}) {
  const states = [], errors = [];
  for (const participant of participants) {
    try {
      states.push(await capture(participant));
    } catch (error) {
      errors.push({gameId: participant.gameId, group: participant.group, message: error.message});
      const retained = previousStates.find((state) => state.gameId === participant.gameId);
      if (retained) states.push(retained);
    }
  }
  return {states, errors, current: errors.length === 0 && states.length === participants.length};
}

/** A stopped run may acquire newly created unrelated games, but none of its
 * original protected rows may be removed or changed. The retained full SQL
 * checkpoint must hash to that run's exact prior baseline. */
export function assertAddOnlyResumeBaseline(previous, current, expectedSha256) {
  assert.match(expectedSha256, /^[a-f0-9]{64}$/);
  assert.equal(createHash("sha256").update(JSON.stringify(previous)).digest("hex"), expectedSha256);
  const tables = ["games", "players", "steps", "logs"];
  assert.deepEqual(Object.keys(previous).sort(), [...tables].sort());
  assert.deepEqual(Object.keys(current).sort(), [...tables].sort());
  const added = {};
  for (const table of tables) {
    const rows = (input) => {
      assert.ok(Array.isArray(input[table]));
      const result = new Map();
      for (const row of input[table]) {
        assert.ok(object(row));
        assert.deepEqual(Object.keys(row).sort(), table === "steps" ? ["game", "hash", "step"] : ["hash", "id"]);
        assert.match(row.hash, /^[a-f0-9]{32}$/);
        const id = table === "steps" ? row.game : row.id;
        assert.ok(table === "logs" ? Number.isSafeInteger(id) && id > 0 : uuid.test(id));
        if (table === "steps") assert.ok(Number.isSafeInteger(row.step) && row.step >= 0);
        const key = table === "steps" ? `${id}:${row.step}` : id;
        assert.ok(!result.has(key), `Duplicate ${table} row in the protected checkpoint.`);
        result.set(key, row.hash);
      }
      return result;
    };
    const oldRows = rows(previous), newRows = rows(current);
    for (const [key, hash] of oldRows)
      assert.equal(newRows.get(key), hash, `Protected ${table} row changed or disappeared: ${key}`);
    added[table] = newRows.size - oldRows.size;
  }
  return added;
}

/** Select the actual successful investigation result, whose display label may
 * include a printed subtitle. Never match nested bonus options or just text. */
export function selectSuccessfulInvestigationChoice({snapshot, question}) {
  if (question?.kind !== "choices" || question.tag !== "ChooseOne"
    || question.isPlayerWindow || question.playerId !== snapshot?.playerId) return;
  const game = snapshot.game;
  const owners = Object.values(game.investigators || {}).filter((i) => i.playerId === snapshot.playerId);
  if (owners.length !== 1) return;
  const owner = owners[0], test = game.skillTest;
  const locationId = owner.placement?.tag === "AtLocation" ? owner.placement.contents : undefined;
  if (!locationId || game.locations?.[locationId]?.revealed !== true
    || test?.investigator !== owner.id || test.action !== "Investigate"
    || test.result?.tag !== "SucceededBy" || !Array.isArray(test.result.contents)
    || !Number.isSafeInteger(test.result.contents[1]) || test.result.contents[1] < 0
    || test.step !== "ApplySkillTestResultsStep" || test.target?.tag !== "LocationTarget"
    || test.source?.tag !== "AbilitySource" || !Array.isArray(test.source.contents)
    || test.source.contents[0]?.tag !== "LocationSource"
    || test.source.contents[0].contents !== locationId || test.source.contents[1] !== 103
    || test.target.contents !== locationId) return;
  const matches = question.choices.filter((choice) => choice.disabled === false
    && Number.isSafeInteger(choice.answerIndex) && choice.raw?.tag === "Label"
    && Array.isArray(choice.raw.messages) && choice.raw.messages.some((wrapped) => {
      const message = wrapped?.tag === "SkillTestMessage" ? wrapped.contents : wrapped;
      if (message?.tag !== "Successful_" || !Array.isArray(message.contents)) return false;
      const [action, investigator, source, target, margin] = message.contents;
      return Array.isArray(action) && action[0] === "Investigate"
        && action[1]?.tag === "LocationTarget" && action[1].contents === locationId
        && investigator === owner.id && source?.tag === "AbilitySource"
        && Array.isArray(source.contents) && source.contents[0]?.tag === "LocationSource"
        && source.contents[0].contents === locationId && source.contents[1] === 103
        && target?.tag === "LocationTarget" && target.contents === locationId
        && margin === test.result.contents[1];
    }));
  if (matches.length !== 1) return;
  return {choice: matches[0], reason: "Resolve the actually offered successful investigation at the owning actor's physical location; native clue discovery and subsequent skill-card bonuses remain authoritative."};
}

/** The scheduler relies on exact A/B/C ordering, never a caller-provided alias. */
function assertEpicResumeRoster({games, stoppedStates, eventId}, groups) {
  assert.ok(uuid.test(eventId));
  assert.equal(games.length, 3);
  assert.equal(stoppedStates.length, 3);
  assert.deepEqual(games.map((p) => p.ordinal), [0, 1, 2]);
  assert.deepEqual(games.map((p) => p.group), groups);
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

export function assertLabyrinthResumeRoster(input) {
  assertEpicResumeRoster(input, ["GroupA", "GroupB", "GroupC"]);
}

/** Machinations keeps the actual ordered Past/Present/Future seat identities. */
export function assertMachinationsResumeRoster(input) {
  assertEpicResumeRoster(input, ["Past", "Present", "Future"]);
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
