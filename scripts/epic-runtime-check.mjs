#!/usr/bin/env node
/** Original live Epic integration proof. Run only after the full candidate and
 * migrations are installed:
 * EPIC_QA_CONFIRMED=1 node --import tsx scripts/epic-runtime-check.mjs
 * Native debug injections are explicitly recorded and confined to newly created
 * QA games; they are not assertions that those prerequisites were played out.
 */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, access, open } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { acceptanceManifest } from "./rules-qa-runtime-identity.mjs";

if (process.argv.includes("--help")) {
  console.log(
    "After full native installation: EPIC_QA_CONFIRMED=1 node --import tsx scripts/epic-runtime-check.mjs\n--prepare-client-setup creates two fresh events and six saved decks/seats, leaving all native ChooseDeck/setup questions unanswered and Ready/timers untouched for actual client setup proof.\n--prepare-table creates two fresh ready events and snapshot/seat baselines for browser QA; it does not run full acceptance checks.\n--prepare-labyrinth-hard checks one fresh Hard Labyrinth event, all three native setup paths and exact printed chaos bags; it does not run full acceptance checks.\n--resume-legacy-labyrinth with EPIC_LEGACY_REPORT resumes the retained failed private QA event in the same isolated data directory using its real saved seats/decks; no SQL state edits or full acceptance checks.\n--machinations-only runs the independent real Machinations action checks on fresh events; its one-event report cannot qualify as full two-Epic acceptance.\nOptional: ARKHAM_RULES_URL, QA_OUT, ARKHAM_RULES_PSQL, ARKHAM_RULES_PG_PORT. Provide ARKHAM_RULES_QA_ENGINE_LOG (or ARKHAM_RULES_DATA_DIR) when native errors redact their reason. Creates new QA events only.",
  );
  process.exit(0);
}
assert.equal(
  process.env.EPIC_QA_CONFIRMED,
  "1",
  "Root must confirm the full candidate and migrations before this live check.",
);
const protocol = await import("../src/game/companionProtocol.ts");
const base = process.env.ARKHAM_RULES_URL || "http://127.0.0.1:5194";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "QA is confined to the local rules service.",
);
const prepareTable = process.argv.includes("--prepare-table");
const prepareHard = process.argv.includes("--prepare-labyrinth-hard");
const resumeLegacy = process.argv.includes("--resume-legacy-labyrinth");
const machinationsOnly = process.argv.includes("--machinations-only");
const prepareClient = process.argv.includes("--prepare-client-setup");
assert.ok(
  [
    prepareTable,
    prepareHard,
    resumeLegacy,
    machinationsOnly,
    prepareClient,
  ].filter(Boolean).length <= 1,
  "Choose one preparation mode.",
);
const preparation =
  prepareTable || prepareHard || resumeLegacy || prepareClient;
const output = resolve(
  process.env.QA_OUT ||
    (prepareClient
      ? "output/epic-client-setup-seed"
      : machinationsOnly
        ? "output/epic-machinations-diagnostic"
        : resumeLegacy
          ? "output/epic-legacy-labyrinth"
          : prepareHard
            ? "output/epic-labyrinth-hard"
            : prepareTable
              ? "output/epic-table-seed"
              : "output/epic-runtime"),
);
const engineLog =
  process.env.ARKHAM_RULES_QA_ENGINE_LOG ||
  (process.env.ARKHAM_RULES_DATA_DIR &&
    resolve(process.env.ARKHAM_RULES_DATA_DIR, "engine.log"));
const foreignUndoMessage =
  "Cannot undo another group's shared effect; undo from the originating group";
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ownedGames = new Set(),
  ownedEvents = new Set(),
  secrets = new Map();
const proof = {
  startedAt: new Date().toISOString(),
  ...(preparation
    ? {
        mode: prepareClient
          ? "client-setup-seed"
          : resumeLegacy
            ? "legacy-labyrinth-resume"
            : prepareHard
              ? "hard-labyrinth-setup"
              : "table-seed",
        prepared: false,
        acceptance: "full acceptance checks not run",
      }
    : {
        passed: false,
        ...(machinationsOnly
          ? {
              mode: "machinations-only",
              acceptance:
                "Machinations only; full two-event acceptance not run",
            }
          : {}),
      }),
  events: [],
  checks: [],
  setupAnswers: [],
  debugSeeds: [],
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const groups = ["GroupA", "GroupB", "GroupC"],
  eras = ["PastEra", "PresentEra", "FutureEra"];
const values = (value) =>
  Array.isArray(value)
    ? value.map((v) => (Array.isArray(v) ? v[1] : v))
    : Object.values(value || {});
const pairs = (value) =>
  Array.isArray(value) ? value : Object.entries(value || {});
const structuralKey = (value) =>
  JSON.stringify(value, (_, nested) =>
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(
          Object.keys(nested)
            .sort()
            .map((key) => [key, nested[key]]),
        )
      : nested,
  );
const mapGet = (value, key) =>
  pairs(value).find(([k]) =>
    typeof key === "object" && key !== null
      ? structuralKey(k) === structuralKey(key)
      : String(k) === String(key),
  )?.[1];
const unbox = (value) =>
  ["EncounterCard", "PlayerCard", "VengeanceCard"].includes(value?.tag)
    ? value.contents
    : value;
const code = (value) =>
  protocol.companionCatalogCode(
    String(unbox(value)?.cardCode || unbox(value)?.art || ""),
  );
const tokenCount = (entity, key) => Number(mapGet(entity?.tokens, key) || 0);
const own = (snapshot) => values(snapshot.game.investigators)[0];
const scenario = (snapshot) =>
  snapshot.game.scenario ||
  snapshot.game.mode?.That ||
  snapshot.game.mode?.These?.[1];
const meta = (snapshot) => scenario(snapshot)?.meta || {};
const journalTable = (event) =>
  event.scenarioId === "70001"
    ? "chronicle_labyrinth_events"
    : "chronicle_machinations_events";
const checkpoint = async () =>
  writeFile(resolve(output, "report.json"), JSON.stringify(proof, null, 2));
const redact = (message) => {
  let safe = String(message);
  for (const value of secrets.values())
    if (value) safe = safe.replaceAll(value, "[session redacted]");
  return safe;
};
async function http(
  path,
  body,
  method = body === undefined ? "GET" : "POST",
  token,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { authorization: `Token ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw.slice(0, 500);
  }
  return { ok: response.ok, status: response.status, data };
}
async function request(...args) {
  const result = await http(...args);
  assert.ok(
    result.ok,
    redact(
      `${args[2] || (args[1] === undefined ? "GET" : "POST")} ${args[0]}: ${result.status} ${JSON.stringify(result.data).slice(0, 1200)}`,
    ),
  );
  return result.data;
}
async function seatToken(seat) {
  if (!secrets.has(seat.id)) {
    const result = await request(`/chronicle/session?seat=${seat.id}`);
    secrets.set(seat.id, result.token);
  }
  return secrets.get(seat.id);
}
const seatPath = (seat, suffix = "") =>
  `/chronicle/play/games/${seat.gameId}${suffix}?seat=${seat.id}`;
async function snapshot(seat) {
  return request(seatPath(seat));
}
async function answer(seat, reply) {
  assert.ok(
    ownedGames.has(seat.gameId),
    "Cannot mutate a game that this QA run did not create.",
  );
  return request(seatPath(seat, "/answer"), reply);
}
async function undo(seat) {
  assert.ok(ownedGames.has(seat.gameId));
  return request(seatPath(seat, "/undo"), {});
}
async function native(seat, path, body, method) {
  assert.ok(ownedGames.has(seat.gameId));
  return request(`/api/v1/arkham/${path}`, body, method, await seatToken(seat));
}
async function seed(seat, message, reason) {
  assert.ok(ownedGames.has(seat.gameId));
  proof.debugSeeds.push({ gameId: seat.gameId, reason, message });
  await checkpoint();
  // Raw is used only by this local debug harness, never by the Chronicle UI.
  await native(
    seat,
    `games/${seat.gameId}`,
    { tag: "Raw", contents: message },
    "PUT",
  );
  return snapshot(seat);
}
const specific = (name, value) => ({
  tag: "ScenarioSpecific",
  contents: [name, value],
});
async function operation(seat, event, operation, id = randomUUID()) {
  const payload =
    event.scenarioId === "70001"
      ? {
          requestId: id,
          requestOrigin: groups[seat.ordinal],
          requestOperation: operation,
        }
      : {
          machinationsRequestId: id,
          machinationsRequestEra: eras[seat.ordinal],
          machinationsRequestOperation: operation,
        };
  await seed(
    seat,
    specific(
      event.scenarioId === "70001"
        ? "epicLabyrinth.request"
        : "epicMachinations.request",
      payload,
    ),
    "Inject one typed coordinator operation to test the real API transaction and replay identity.",
  );
  return id;
}

const runFile = promisify(execFile);
let psql;
async function sql(command) {
  if (!psql) {
    const candidates = [
      process.env.ARKHAM_RULES_PSQL,
      process.env.ARKHAM_RULES_RUNTIME &&
        resolve(process.env.ARKHAM_RULES_RUNTIME, "pgsql/bin/psql"),
      "output/rules-server/derived-runtime/game/pgsql/bin/psql",
      "output/rules-server/runtime/game/pgsql/bin/psql",
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        await access(candidate);
        psql = resolve(candidate);
        break;
      } catch {}
    }
    assert.ok(
      psql,
      "Provide the installed local ARKHAM_RULES_PSQL for authoritative coordinator proof.",
    );
  }
  const result = await runFile(
    psql,
    [
      "--no-psqlrc",
      "-h",
      "127.0.0.1",
      "-p",
      process.env.ARKHAM_RULES_PG_PORT || "5196",
      "-U",
      "arkham_chronicle",
      "-d",
      "arkham_chronicle",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      command,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  return result.stdout.trim();
}
async function coordinator(event) {
  assert.ok(ownedEvents.has(event.id) && uuid.test(event.id));
  return JSON.parse(
    await sql(
      `SELECT state::text FROM ${journalTable(event)} WHERE event_id='${event.id}'::uuid`,
    ),
  );
}
function ownedParticipants(event) {
  assert.ok(ownedEvents.has(event.id) && uuid.test(event.id));
  assert.equal(event.seats.length, 3);
  for (const seat of event.seats)
    assert.ok(ownedGames.has(seat.gameId) && uuid.test(seat.gameId));
  return event.seats.map((seat) => `'${seat.gameId}'::uuid`).join(",");
}
async function mutationFingerprint(event) {
  const ids = ownedParticipants(event),
    history = journalTable(event).replace(/_events$/, "_journal");
  // Hash complete database rows without copying private hands/queues into the
  // report. Step/log rows and journal bodies detect a partially committed undo
  // even when the rendered cards happen to remain unchanged.
  const database = JSON.parse(
    await sql(`SELECT jsonb_build_object(
    'games', (SELECT jsonb_agg(jsonb_build_object('id',g.id,'step',g.step,'md5',md5(to_jsonb(g)::text)) ORDER BY g.id) FROM arkham_games g WHERE g.id IN (${ids})),
    'steps', (SELECT jsonb_agg(jsonb_build_object('gameId',s.arkham_game_id,'step',s.step,'md5',md5(to_jsonb(s)::text)) ORDER BY s.arkham_game_id,s.step) FROM arkham_steps s WHERE s.arkham_game_id IN (${ids})),
    'logs', (SELECT jsonb_agg(jsonb_build_object('id',l.id,'md5',md5(to_jsonb(l)::text)) ORDER BY l.id) FROM arkham_log_entries l WHERE l.arkham_game_id IN (${ids})),
    'players', (SELECT jsonb_agg(jsonb_build_object('id',p.id,'md5',md5(to_jsonb(p)::text)) ORDER BY p.id) FROM arkham_players p WHERE p.arkham_game_id IN (${ids})),
    'event', (SELECT md5(to_jsonb(e)::text) FROM arkham_epic_events e WHERE e.id='${event.id}'::uuid),
    'coordinator', (SELECT md5(to_jsonb(c)::text) FROM ${journalTable(event)} c WHERE c.event_id='${event.id}'::uuid),
    'journal', (SELECT jsonb_agg(jsonb_build_object('originGameId',j.origin_game_id,'originStep',j.origin_step,'md5',md5(to_jsonb(j)::text)) ORDER BY j.origin_game_id,j.origin_step) FROM ${history} j WHERE j.event_id='${event.id}'::uuid)
  )::text`),
  );
  const groups = await Promise.all(
    event.seats.map(async (seat) => ({
      gameId: seat.gameId,
      sha256: digest(await publicFingerprint(seat)),
    })),
  );
  return { database, groups };
}
async function logSize() {
  if (!engineLog) return undefined;
  const file = await open(engineLog, "r");
  try {
    return (await file.stat()).size;
  } finally {
    await file.close();
  }
}
async function loggedReason(offset, reason = foreignUndoMessage) {
  if (!engineLog || offset === undefined) return false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const file = await open(engineLog, "r");
    try {
      const length = (await file.stat()).size - offset;
      assert.ok(
        length >= 0 && length <= 1024 * 1024,
        "QA engine log must retain this request's bounded new suffix.",
      );
      const buffer = Buffer.alloc(length);
      await file.read(buffer, 0, length, offset);
      if (buffer.toString("utf8").includes(reason)) return true;
    } finally {
      await file.close();
    }
    await new Promise((done) => setTimeout(done, 50));
  }
  return false;
}
async function foreignUndoChecks(event, participant, origin) {
  ownedParticipants(event);
  for (const seat of [participant, origin])
    assert.ok(event.seats.some((member) => member.gameId === seat.gameId));
  assert.notEqual(participant.gameId, origin.gameId);
  const history = journalTable(event).replace(/_events$/, "_journal");
  const precondition = JSON.parse(
    await sql(`SELECT jsonb_build_object(
    'cursor',g.step,'scenarioSteps',(g.current_data->>'gameScenarioSteps')::integer,
    'undoFloor',COALESCE(f.floor_step,0),'choice',s.choice::jsonb,
    'previousStepExists',EXISTS(SELECT 1 FROM arkham_steps p WHERE p.arkham_game_id=g.id AND p.step=g.step-1),
    'ownOriginJournalAtCursor',EXISTS(SELECT 1 FROM ${history} j WHERE j.event_id='${event.id}'::uuid AND j.origin_game_id=g.id AND j.origin_step=g.step),
    'foreignJournals',(SELECT jsonb_agg(jsonb_build_object('originGameId',j.origin_game_id,'originStep',j.origin_step,'expectedSteps',j.body->'journalExpectedSteps')) FROM ${history} j WHERE j.event_id='${event.id}'::uuid AND j.origin_game_id='${origin.gameId}'::uuid AND j.origin_step=(SELECT step FROM arkham_games WHERE id=j.origin_game_id) AND (j.body->'journalExpectedSteps') @> jsonb_build_array(jsonb_build_array(g.id::text,g.step))),
    'scenarioUndoSteps',(SELECT jsonb_agg(p.step ORDER BY p.step DESC) FROM arkham_steps p WHERE p.arkham_game_id=g.id AND p.step>GREATEST(COALESCE(f.floor_step,0),g.step-((g.current_data->>'gameScenarioSteps')::integer-1)) AND p.step<>0)
  )::text FROM arkham_games g JOIN arkham_steps s ON s.arkham_game_id=g.id AND s.step=g.step LEFT JOIN arkham_game_undo_floors f ON f.arkham_game_id=g.id WHERE g.id='${participant.gameId}'::uuid`),
  );
  assert.ok(
    precondition.cursor > 0 && precondition.cursor > precondition.undoFloor,
  );
  assert.equal(
    precondition.previousStepExists,
    true,
    "The foreign cursor has a valid preceding native step.",
  );
  assert.deepEqual(
    precondition.choice.choicePatchDown,
    [],
    "The exact current cursor is a synthetic empty inverse.",
  );
  assert.equal(
    precondition.ownOriginJournalAtCursor,
    false,
    "This table did not originate the current shared step.",
  );
  assert.equal(
    precondition.foreignJournals?.length,
    1,
    "The current originating transaction owns the participant's exact cursor.",
  );
  assert.ok(
    precondition.foreignJournals[0].expectedSteps.some(
      ([id, step]) => id === participant.gameId && step === precondition.cursor,
    ),
  );
  assert.ok(
    precondition.scenarioSteps > 1 &&
      precondition.scenarioUndoSteps?.length > 1,
  );
  assert.ok(
    precondition.scenarioUndoSteps.includes(precondition.cursor),
    "The valid scenario-undo range crosses the foreign synthetic cursor.",
  );
  proof.undoBoundaryProbes ??= [];
  proof.undoBoundaryProbes.push({
    eventId: event.id,
    participantGameId: participant.gameId,
    originGameId: origin.gameId,
    cursor: precondition.cursor,
    scenarioSteps: precondition.scenarioSteps,
    undoFloor: precondition.undoFloor,
    syntheticEmptyInverse: true,
    previousStepExists: true,
    ownOriginJournalAtCursor: false,
    foreignJournal: precondition.foreignJournals[0],
    scenarioUndoSteps: precondition.scenarioUndoSteps,
  });
  await checkpoint();
  const before = await mutationFingerprint(event);
  for (const [kind, path, method, token] of [
    ["single", seatPath(participant, "/undo"), "POST", undefined],
    [
      "scenario",
      `/api/v1/arkham/games/${participant.gameId}/undo/scenario`,
      "PUT",
      await seatToken(participant),
    ],
  ]) {
    const offset = await logSize(),
      refused = await http(path, {}, method, token);
    assert.ok(
      [400, 500].includes(refused.status),
      `${kind} undo must reject a valid foreign cursor, not fail authentication/routing.`,
    );
    const after = await mutationFingerprint(event);
    assert.deepEqual(
      after,
      before,
      `Rejected foreign ${kind} undo preserves all three groups, native cursors/steps/logs, coordinator and journal.`,
    );
    const explicitReason = JSON.stringify(refused.data).includes(
      foreignUndoMessage,
    );
    assert.ok(
      explicitReason || (await loggedReason(offset)),
      "Require the foreign-boundary reason in the response or fresh QA engine log; configure ARKHAM_RULES_QA_ENGINE_LOG for redacted native errors.",
    );
    proof.checks.push({
      eventId: event.id,
      foreignParticipantUndo: kind,
      participantGameId: participant.gameId,
      originGameId: origin.gameId,
      cursor: precondition.cursor,
      scenarioUndoSteps: precondition.scenarioUndoSteps,
      foreignJournal: precondition.foreignJournals[0],
      httpStatus: refused.status,
      rejectionReason: foreignUndoMessage,
      reasonEvidence: explicitReason
        ? "native response"
        : "fresh QA engine log suffix",
      groupFingerprints: before.groups,
      beforeSha256: digest(before),
      afterSha256: digest(after),
      databaseAndAllGroupsUnchanged: true,
    });
    await checkpoint();
  }
}
async function wrongSeatChecks(event) {
  ownedParticipants(event);
  const [target, foreign] = event.seats,
    before = await mutationFingerprint(event);
  const wrong = { ...foreign, gameId: target.gameId };
  for (const [method, suffix, body] of [
    ["GET", "", undefined],
    ["POST", "/undo", {}],
  ]) {
    const refused = await http(seatPath(wrong, suffix), body, method);
    assert.equal(
      refused.status,
      403,
      "A valid local seat cannot read or undo another group's game.",
    );
    const after = await mutationFingerprint(event);
    assert.deepEqual(
      after,
      before,
      "Wrong-seat rejection leaves all participant games and authoritative state unchanged.",
    );
    proof.checks.push({
      eventId: event.id,
      wrongSeatGameRejected: method,
      gameId: target.gameId,
      foreignSeatGameId: foreign.gameId,
      httpStatus: refused.status,
      groupFingerprints: before.groups,
      beforeSha256: digest(before),
      afterSha256: digest(after),
      databaseAndAllGroupsUnchanged: true,
    });
    await checkpoint();
  }
}
async function expireTimer(event) {
  assert.ok(ownedEvents.has(event.id) && uuid.test(event.id));
  proof.debugSeeds.push({
    eventId: event.id,
    reason:
      "Move only this new QA event timer into the past so the real time-up endpoint can execute.",
    timerStartedAt: 1,
  });
  await checkpoint();
  // The bound id was returned by this run's create request and validated above.
  await sql(
    `UPDATE arkham_epic_events SET shared_state=jsonb_set(shared_state::jsonb,'{sharedCounters,timer-started-at}','1'::jsonb)::jsonb WHERE id='${event.id}'::uuid RETURNING id`,
  );
  const organizer = secrets.get("organizer");
  await request(
    `/api/v1/arkham/events/${event.id}/time-up`,
    {},
    "POST",
    organizer,
  );
}
async function satisfyNativeDoomThreshold(seat, includeImmediateCheck) {
  const current = await snapshot(seat),
    question = model(current),
    selected = question?.choices.find(
      (choice) =>
        choice.raw?.tag === "Label" &&
        choice.raw.label ===
          "$standalone.theLabyrinthsOfLunacy.label.satisfyDoomThreshold",
    ),
    agenda = values(current.game.agendas)[0];
  assert.equal(question?.tag, "ChooseOne");
  assert.ok(
    selected,
    "Answer the real native Mythos doom confirmation before expecting an agenda advance.",
  );
  assert.deepEqual(agenda.doomThreshold, { tag: "Static", contents: 6 });
  assert.deepEqual(selected.raw.messages, [
    {
      tag: "TokenMessage",
      contents: {
        tag: "PlaceTokens_",
        contents: [
          { tag: "ScenarioSource" },
          { tag: "AgendaTarget", contents: agenda.id },
          "Doom",
          6,
        ],
      },
    },
    ...(includeImmediateCheck
      ? [
          {
            tag: "ForTarget",
            contents: [
              { tag: "AgendaTarget", contents: agenda.id },
              { tag: "AdvanceAgendaIfThresholdSatisfied" },
            ],
          },
        ]
      : []),
  ]);
  proof.setupAnswers.push({
    gameId: seat.gameId,
    category: "timer-native-doom-confirmation",
    tag: question.tag,
    answerIndex: selected.answerIndex,
    label: selected.label,
    messages: selected.raw.messages,
  });
  await answer(
    seat,
    protocol.buildChoiceAnswer(question, selected.answerIndex),
  );
}
let context, allCards;
function model(current) {
  const normalized = { ...current.game, scenario: scenario(current) };
  return protocol.companionQuestion(normalized, current.playerId, context);
}
async function choose(seat, predicate, explanation) {
  const current = await snapshot(seat),
    question = model(current);
  assert.ok(question, `${explanation}: the seat has no current decision.`);
  const selected = question.choices.find(predicate);
  assert.ok(
    selected,
    `${explanation}: ${question.tag} offers ${question.choices.map((v) => v.label).join(" | ")}`,
  );
  await answer(
    seat,
    protocol.buildChoiceAnswer(question, selected.answerIndex),
  );
  return snapshot(seat);
}
const setupComplete = (current) =>
  current.game.gameState?.tag === "IsActive" &&
  current.game.phase === "InvestigationPhase" &&
  current.game.inSetup === false &&
  scenario(current)?.started === true;
async function settle(seat, category = "setup", stopAtReady = false) {
  for (let n = 0; n < 120; n++) {
    const current = await snapshot(seat),
      question = model(current);
    assert.ok(
      question,
      `${seat.name}: native question absent during ${category}.`,
    );
    if (stopAtReady && setupComplete(current)) return current;
    if (
      question.isPlayerWindow ||
      question.choices.some((v) => /Waiting/i.test(v.label))
    )
      return current;
    let reply, selected;
    if (question.kind === "deck")
      reply = protocol.buildDeckAnswer(question, seat.deckId);
    else if (
      question.kind === "settings" &&
      question.tag === "PickScenarioSettings"
    )
      reply = protocol.buildSettingsAnswer(
        question,
        protocol.standaloneSettingsForAnswer(
          question.settings,
          protocol.standaloneSettingsState(question.settings),
        ),
      );
    else if (question.kind === "choices") {
      selected =
        question.choices.find((v) =>
          /doneWithMulligan|done with mulligan/i.test(JSON.stringify(v.raw)),
        ) ||
        question.choices.find((v) => v.tag === "SkipTriggersButton") ||
        question.choices.find(
          (v) =>
            /^(Done|Continue|Begin|Proceed|Finish)\b/i.test(v.label) &&
            !v.disabled,
        ) ||
        (category === "setup" ||
        question.tag === "Read" ||
        question.choices.length === 1
          ? question.choices.find((v) => !v.disabled)
          : undefined);
      assert.ok(
        selected,
        `No documented ${category} fixture answer for ${question.tag}: ${question.choices.map((v) => v.label).join(" | ")}`,
      );
      reply = protocol.buildChoiceAnswer(question, selected.answerIndex);
    } else
      throw new Error(
        `Unsupported ${category} fixture question ${question.tag}; no automatic guessed answer.`,
      );
    proof.setupAnswers.push({
      gameId: seat.gameId,
      category,
      tag: question.tag,
      ...(selected
        ? { answerIndex: selected.answerIndex, label: selected.label }
        : { answerTag: reply.tag }),
    });
    await answer(seat, reply);
  }
  throw new Error(`Native ${category} did not settle for ${seat.gameId}.`);
}
function deck(name) {
  const names = new Set();
  const legal = allCards.filter(
    (c) =>
      c.pack_code === "core" &&
      ["guardian", "neutral"].includes(c.faction_code) &&
      ["asset", "event", "skill"].includes(c.type_code) &&
      c.xp === 0 &&
      !c.subtype_code &&
      !c.restrictions &&
      !c.hidden &&
      !c.permanent &&
      !names.has(c.name) &&
      names.add(c.name),
  );
  assert.ok(
    legal.length >= 15,
    "Core fixture has 15 distinct legal Roland cards.",
  );
  const flashlight = legal.find((card) => card.code === "01087");
  assert.ok(
    flashlight,
    "The real Roland deck contains two native Flashlights for the attachment transport fixture.",
  );
  const selected = [
    flashlight,
    ...legal.filter((card) => card !== flashlight),
  ].slice(0, 15);
  return {
    name,
    investigator_code: "01001",
    slots: {
      ...Object.fromEntries(selected.map((c) => [c.code, 2])),
      "01006": 1,
      "01007": 1,
      "01096": 1,
    },
  };
}
async function loadLegacyLabyrinth() {
  assert.ok(
    process.env.ARKHAM_RULES_QA_MANIFEST,
    "Legacy resumption requires the verified private Linux QA manifest.",
  );
  assert.ok(
    process.env.EPIC_LEGACY_REPORT && process.env.ARKHAM_RULES_DATA_DIR,
    "Provide the original failed private QA report and its data directory.",
  );
  const sourceReport = resolve(process.env.EPIC_LEGACY_REPORT);
  assert.ok(
    sourceReport.startsWith(
      dirname(resolve(process.env.ARKHAM_RULES_DATA_DIR)) + sep,
    ),
    "Resume only the report belonging to this isolated data directory.",
  );
  assert.notEqual(
    sourceReport,
    resolve(output, "report.json"),
    "Preserve the original failure report.",
  );
  const bytes = await readFile(sourceReport);
  const previous = JSON.parse(bytes);
  assert.equal(previous.passed, false);
  assert.equal(previous.candidate?.kind, "chronicle-linux-native-qa");
  assert.equal(previous.candidate?.scope, "native-acceptance");
  assert.equal(previous.events.length, 1);
  const recorded = previous.events[0];
  assert.equal(recorded.scenarioId, "70001");
  assert.match(recorded.name, /^Chronicle Epic native QA 70001 /);
  assert.equal(previous.setupAnswers[0]?.answerTag, "DeckAnswer");
  const event = await request(`/chronicle/epic/events/${recorded.id}`);
  assert.equal(event.id, recorded.id);
  assert.equal(event.name, recorded.name);
  event.scenarioId = "70001";
  event.difficulty = "Standard";
  event.seats = event.localSeats.sort((a, b) => a.ordinal - b.ordinal);
  assert.deepEqual(
    event.seats.map(({ gameId, ordinal }) => ({ gameId, ordinal })),
    recorded.games,
  );
  assert.deepEqual(
    event.seats.map((seat) => seat.ordinal),
    [0, 1, 2],
  );
  const storedScenarioId = await sql(
    `SELECT scenario_id FROM public.arkham_epic_events WHERE id='${event.id}'`,
  );
  assert.equal(
    storedScenarioId,
    '"70001"',
    "Legacy acceptance must use the untouched original quoted scenario row.",
  );
  const first = await snapshot(event.seats[0]);
  const failureSnapshot = JSON.parse(
    await readFile(
      resolve(
        dirname(sourceReport),
        "..",
        "labyrinth-initial-failure-snapshot.json",
      ),
      "utf8",
    ),
  );
  assert.equal(
    digest(first.game),
    digest(failureSnapshot.game),
    "The retained failed game remains byte-equivalent before the real retry.",
  );
  assert.equal(model(first).kind, "deck");
  for (const seat of event.seats) {
    assert.ok(
      uuid.test(seat.deckId),
      "Retained native seat owns its actual saved deck.",
    );
    ownedGames.add(seat.gameId);
  }
  ownedEvents.add(event.id);
  proof.sourceReport = sourceReport;
  proof.sourceReportSha256 = createHash("sha256").update(bytes).digest("hex");
  proof.previousRuntime = previous.runtime;
  proof.events.push({ ...recorded, difficulty: "Standard" });
  proof.checks.push({
    eventId: event.id,
    nativeStoredScenarioId: storedScenarioId,
    nativeStoredScenarioIdLength: storedScenarioId.length,
    untouchedFailureSnapshot: true,
    legacyQuotedRowResumed: true,
  });
  await checkpoint();
  return event;
}
async function createEvent(scenarioId, difficulty = "Standard", finish = true) {
  const name = `Chronicle Epic ${prepareHard ? "Hard setup" : prepareTable ? "table" : "native"} QA ${scenarioId} ${new Date().toISOString()}`;
  const event = await request("/chronicle/epic/events", {
    name,
    scenarioId,
    difficulty,
    groups: groups.map((group, ordinal) => ({
      name: `${name} ${scenarioId === "70001" ? group : eras[ordinal]}`,
      playerCount: 1,
    })),
  });
  assert.ok(uuid.test(event.id));
  ownedEvents.add(event.id);
  event.scenarioId = scenarioId;
  event.difficulty = difficulty;
  const storedScenarioId = await sql(
    `SELECT scenario_id FROM public.arkham_epic_events WHERE id='${event.id}'`,
  );
  assert.equal(
    storedScenarioId,
    scenarioId,
    "New native events must store the canonical raw scenario code.",
  );
  proof.checks.push({
    eventId: event.id,
    nativeStoredScenarioId: storedScenarioId,
    nativeStoredScenarioIdLength: storedScenarioId.length,
  });
  event.seats = event.localSeats.sort((a, b) => a.ordinal - b.ordinal);
  assert.deepEqual(
    event.seats.map((s) => s.ordinal),
    [0, 1, 2],
  );
  for (const seat of event.seats) {
    assert.ok(uuid.test(seat.gameId));
    ownedGames.add(seat.gameId);
  }
  proof.events.push({
    id: event.id,
    scenarioId,
    difficulty,
    name,
    games: event.seats.map(({ gameId, ordinal }) => ({ gameId, ordinal })),
  });
  await checkpoint();
  for (const seat of event.seats) {
    const fixture = deck(`${name} ${seat.ordinal}`);
    const prepared = await request(`/chronicle/epic/seats/${seat.id}`, {
      deckName: fixture.name,
      deckList: fixture,
    });
    seat.deckId = prepared.deckId;
  }
  return finish ? finishEventSetup(event) : event;
}
async function finishEventSetup(event) {
  const { scenarioId, difficulty } = event;
  const ready = new Set();
  for (let round = 0; round < 20 && ready.size < 3; round++)
    for (const seat of event.seats) {
      if (ready.has(seat.id)) continue;
      const current = await settle(seat, "setup", true);
      if (setupComplete(current)) {
        const checkpointQuestion = current.game.question;
        await native(seat, `events/${event.id}/ready`, {}, "POST");
        const afterReady = await snapshot(seat);
        assert.deepEqual(
          afterReady.game.question,
          checkpointQuestion,
          "Native readiness preserves the actual pending setup/optional window.",
        );
        proof.checks.push({
          eventId: event.id,
          gameId: seat.gameId,
          nativeReadyCheckpoint: {
            gameState: current.game.gameState.tag,
            phase: current.game.phase,
            inSetup: current.game.inSetup,
            scenarioStarted: scenario(current).started,
            pendingDecisionTag: model(current).tag,
          },
          pendingQuestionPreservedByReady: true,
        });
        ready.add(seat.id);
      } else {
        const waiting = model(current)?.choices.find((v) =>
          /Waiting/i.test(v.label),
        );
        if (waiting)
          await answer(
            seat,
            protocol.buildChoiceAnswer(model(current), waiting.answerIndex),
          );
      }
    }
  assert.equal(ready.size, 3, "All three native setup paths finish.");
  const dashboard = await request(`/chronicle/epic/events/${event.id}`);
  assert.equal(
    Number(dashboard.sharedState.sharedCounters["groups-ready-mask"]),
    7,
  );
  assert.ok(
    Number(dashboard.sharedState.sharedCounters["timer-started-at"]) > 0,
  );
  await refreshPlayerWindows(event);
  for (const seat of event.seats) {
    const current = await snapshot(seat);
    assert.equal(
      code(own(current)),
      "01001",
      "Separate groups may use the same printed investigator.",
    );
    const replica =
      meta(current)[
        scenarioId === "70001"
          ? "epicLabyrinthReplica"
          : "epicMachinationsReplica"
      ];
    assert.equal(
      scenarioId === "70001" ? replica.replicaGroup : replica.currentEra,
      (scenarioId === "70001" ? groups : eras)[seat.ordinal],
    );
    if (scenarioId === "87001") {
      assert.equal(
        Object.keys(current.game.locations).length,
        seat.ordinal === 2 ? 5 : 6,
      );
      assert.equal(
        values(current.game.locations).filter((l) => code(l) === "87005b")
          .length,
        1,
      );
    } else {
      // The printed standalone bag has sixteen base tokens, then each group
      // adds exactly two of its own symbol during actual native Epic setup.
      const expected = (
        difficulty === "Hard"
          ? [
              "PlusOne",
              "Zero",
              "MinusOne",
              "MinusOne",
              "MinusOne",
              "MinusTwo",
              "MinusTwo",
              "MinusTwo",
              "MinusThree",
              "MinusFour",
              "MinusFive",
              "MinusSix",
              "Skull",
              "Skull",
              "AutoFail",
              "ElderSign",
            ]
          : [
              "PlusOne",
              "Zero",
              "Zero",
              "Zero",
              "MinusOne",
              "MinusOne",
              "MinusOne",
              "MinusTwo",
              "MinusTwo",
              "MinusThree",
              "MinusFour",
              "MinusFive",
              "Skull",
              "Skull",
              "AutoFail",
              "ElderSign",
            ]
      )
        .concat(
          Array(2).fill(["ElderThing", "Tablet", "Cultist"][seat.ordinal]),
        )
        .sort();
      const actual = scenario(current)
        .chaosBag.chaosTokens.map((token) => token.chaosTokenFace)
        .sort();
      assert.deepEqual(
        actual,
        expected,
        `${difficulty} ${groups[seat.ordinal]} has its exact printed Epic chaos bag.`,
      );
      proof.checks.push({
        eventId: event.id,
        gameId: seat.gameId,
        difficulty,
        group: groups[seat.ordinal],
        printedChaosBag: actual,
      });
    }
  }
  proof.checks.push({
    eventId: event.id,
    setup: true,
    groupOrdinals: [0, 1, 2],
    duplicateInvestigatorAllowed: true,
    timerStarted: true,
  });
  if (!preparation) await wrongSeatChecks(event);
  return event;
}
async function redeemEvent() {
  // Native setup randomly chooses one of three printed machinations. Keep the
  // genuine setup and record unused fresh branches; never replace its choice.
  for (let attempt = 0; attempt < 18; attempt++) {
    const event = await createEvent("87001");
    const selected = protocol.companionCatalogCode(
      (await coordinator(event)).machinationsMachination || "",
    );
    if (selected === "87034") return event;
    proof.branchAttempts ??= [];
    proof.branchAttempts.push({
      eventId: event.id,
      machination: selected,
      games: event.seats.map(({ gameId, ordinal }) => ({ gameId, ordinal })),
      reason:
        "Actual randomized native setup chose another printed branch; retained untouched after setup.",
    });
    proof.events = proof.events.filter((entry) => entry.id !== event.id);
    await checkpoint();
  }
  throw new Error(
    "Native random setup did not select Redeem a Former Colleague within the bounded fresh-event attempts.",
  );
}
async function refreshPlayerWindows(event) {
  // The first group can still be holding its legitimate setup-wait question
  // when the third group becomes ready. Refresh only documented native setup
  // checkpoints; leave every table at a real, unspent player action window.
  for (let round = 0; round < 20; round++) {
    let ready = 0;
    for (const seat of event.seats) {
      const current = await snapshot(seat),
        question = model(current);
      if (
        question?.isPlayerWindow &&
        current.game.phase === "InvestigationPhase"
      ) {
        ready++;
        continue;
      }
      const waiting = question?.choices.find(
        (choice) => /Waiting/i.test(choice.label) && !choice.disabled,
      );
      if (waiting) {
        proof.setupAnswers.push({
          gameId: seat.gameId,
          category: "table-ready",
          tag: question.tag,
          answerIndex: waiting.answerIndex,
          label: waiting.label,
        });
        await answer(
          seat,
          protocol.buildChoiceAnswer(question, waiting.answerIndex),
        );
      } else await settle(seat);
    }
    if (ready === 3) break;
  }
  for (const seat of event.seats) {
    const current = await snapshot(seat);
    assert.equal(current.game.phase, "InvestigationPhase");
    assert.equal(
      model(current)?.isPlayerWindow,
      true,
      "Fresh native setup must release all three real player windows.",
    );
  }
}
async function prepareTableEvent(scenarioId, difficulty = "Standard") {
  const event = await createEvent(scenarioId, difficulty);
  await refreshPlayerWindows(event);
  const saved = proof.events.find((entry) => entry.id === event.id);
  saved.seats = [];
  for (const seat of event.seats) {
    const current = await snapshot(seat),
      question = model(current),
      investigator = own(current);
    assert.equal(
      current.game.phase,
      "InvestigationPhase",
      "Browser seed must reach native investigation.",
    );
    assert.equal(
      question?.isPlayerWindow,
      true,
      "Browser seed must retain an explicit native player window.",
    );
    assert.ok(
      question.choices.some(
        (choice) => choice.label === "Take 1 resource" && !choice.disabled,
      ),
      "Browser seed exposes the real resource action.",
    );
    const snapshotPath = resolve(
      output,
      `table-${scenarioId}-group-${seat.ordinal}.json`,
    );
    await writeFile(snapshotPath, JSON.stringify(current, null, 2), {
      mode: 0o600,
    });
    saved.seats.push({
      id: seat.id,
      gameId: seat.gameId,
      ordinal: seat.ordinal,
      seatIndex: seat.seatIndex,
      name: seat.name,
      deckId: seat.deckId,
      snapshotPath,
      snapshotSha256: digest(current.game),
      tableHash: `#${new URLSearchParams({ investigation: seat.gameId, seat: seat.id })}`,
      baseline: {
        playerId: current.playerId,
        investigatorId: investigator.id,
        role: (scenarioId === "70001" ? groups : eras)[seat.ordinal],
        phase: current.game.phase,
        scenarioSteps: current.game.scenarioSteps,
        decisionTag: question.tag,
        resources: tokenCount(investigator, "Resource"),
        remainingActions: investigator.remainingActions,
      },
    });
  }
  await checkpoint();
}
async function prepareClientSetupEvent(scenarioId) {
  const event = await createEvent(scenarioId, "Standard", false);
  const saved = proof.events.find((entry) => entry.id === event.id);
  saved.seats = [];
  const dashboard = await request(`/chronicle/epic/events/${event.id}`);
  assert.equal(
    Number(dashboard.sharedState.sharedCounters["groups-ready-mask"] || 0),
    0,
  );
  assert.equal(
    Number(dashboard.sharedState.sharedCounters["timer-started-at"] || 0),
    0,
  );
  for (const seat of event.seats) {
    const current = await snapshot(seat);
    const question = model(current);
    assert.equal(
      question.kind,
      "deck",
      "Client seed retains the genuine first ChooseDeck question.",
    );
    assert.equal(current.game.inSetup, true);
    const snapshotPath = resolve(
      output,
      `client-setup-${scenarioId}-group-${seat.ordinal}.json`,
    );
    await writeFile(snapshotPath, JSON.stringify(current, null, 2), {
      mode: 0o600,
    });
    saved.seats.push({
      id: seat.id,
      gameId: seat.gameId,
      ordinal: seat.ordinal,
      seatIndex: seat.seatIndex,
      name: seat.name,
      deckId: seat.deckId,
      snapshotPath,
      snapshotSha256: digest(current.game),
      tableHash: `#${new URLSearchParams({ investigation: seat.gameId, seat: seat.id })}`,
      baseline: {
        playerId: current.playerId,
        role: (scenarioId === "70001" ? groups : eras)[seat.ordinal],
        phase: current.game.phase,
        gameState: current.game.gameState,
        decisionTag: question.tag,
      },
    });
  }
  assert.equal(
    proof.setupAnswers.length,
    0,
    "No native setup answer was sent by client seed preparation.",
  );
  assert.equal(proof.debugSeeds.length, 0);
  proof.checks.push({
    eventId: event.id,
    clientSetupUntouched: true,
    readyMask: 0,
    timerStartedAt: 0,
    nativeDeckAnswers: 0,
    nativeSetupAnswers: 0,
    nativeReadyCalls: 0,
  });
  await checkpoint();
}
async function advanceReceipt(seat) {
  const current = await snapshot(seat),
    question = model(current);
  if (question.isPlayerWindow)
    await choose(
      seat,
      (c) => c.label === "Take 1 resource",
      "Yield the pending player window through a real resource action so durable receipts can execute.",
    );
  return settle(seat);
}
async function publicFingerprint(seat) {
  const current = await snapshot(seat);
  return {
    investigators: current.game.investigators,
    locations: current.game.locations,
    stories: current.game.stories,
    enemies: current.game.enemies,
    question: current.game.question,
  };
}
const vent = (current) =>
  values(current.game.stories).find((s) => code(s) === "70035");
const tindalos = (current) =>
  values(current.game.locations).find((l) => code(l) === "87005b");
async function labyrinthChecks(event) {
  const [a, b, c] = event.seats;
  const selectionId = await operation(a, event, {
    tag: "SelectStory",
    contents: [1, "70035"],
  });
  for (const seat of event.seats) await advanceReceipt(seat);
  for (const seat of event.seats)
    assert.ok(
      vent(await snapshot(seat)),
      "The real shared-story selection installs the Vent in every group.",
    );
  const chosen = await coordinator(event);
  assert.equal(
    protocol.companionCatalogCode(mapGet(chosen.eventStoryChoices, 1)),
    "70035",
  );
  const revision = chosen.eventRevision;
  await operation(
    a,
    event,
    { tag: "SelectStory", contents: [1, "70035"] },
    selectionId,
  );
  assert.equal(
    (await coordinator(event)).eventRevision,
    revision,
    "Replayed native operation identity changes no coordinator state.",
  );
  const before = await snapshot(a),
    iid = own(before).id;
  const storyCommand = (command) => ({
    tag: "SendMessage",
    contents: [
      { tag: "StoryTarget", contents: "70035" },
      specific("epicLabyrinth.story", command),
    ],
  });
  await seed(
    a,
    storyCommand({ tag: "DepositVentToken", contents: [iid, "Resource", 2] }),
    "Deposit actual native investigator resources into the Vent; bypass only opening its fast-ability menu.",
  );
  await choose(
    a,
    (v) => /Finish placing objects/.test(v.label),
    "Finish the printed Vent deposit menu.",
  );
  const sourceBefore = await snapshot(a),
    receiverBefore = await snapshot(b);
  assert.equal(tokenCount(vent(sourceBefore), "Resource"), 2);
  const receiverQuestion = receiverBefore.game.question;
  await seed(
    a,
    storyCommand({ tag: "SendVent", contents: [iid, "GroupB"] }),
    "Exercise the printed Vent sending effect without waiting for a real round-end trigger.",
  );
  let sent = await snapshot(a),
    received = await snapshot(b);
  assert.equal(tokenCount(vent(sent), "Resource"), 0);
  assert.equal(
    tokenCount(vent(received), "Resource"),
    tokenCount(vent(receiverBefore), "Resource") + 2,
  );
  assert.deepEqual(
    received.game.question,
    receiverQuestion,
    "A physical transfer preserves the receiver's pending decision.",
  );
  const shippedState = await coordinator(event);
  assert.equal(values(shippedState.eventParcels).length, 1);
  const journalCount = Number(
    await sql(
      `SELECT count(*) FROM chronicle_labyrinth_journal WHERE event_id='${event.id}'::uuid`,
    ),
  );
  assert.ok(journalCount > 0);
  await foreignUndoChecks(event, b, a);
  await undo(a);
  sent = await snapshot(a);
  received = await snapshot(b);
  assert.equal(tokenCount(vent(sent), "Resource"), 2);
  assert.equal(
    tokenCount(vent(received), "Resource"),
    tokenCount(vent(receiverBefore), "Resource"),
  );
  assert.equal(
    values((await coordinator(event)).eventParcels).length,
    0,
    "Coupled undo restores the authoritative parcel ledger.",
  );
  await seed(
    a,
    storyCommand({ tag: "SendVent", contents: [iid, "GroupB"] }),
    "Replay the same printed shipment with a new native parcel identity after coupled undo.",
  );
  await advanceReceipt(b);
  const protectedState = [
    await publicFingerprint(a),
    await publicFingerprint(b),
    await publicFingerprint(c),
  ];
  const refused = await http(seatPath(a, "/undo"), {}, "POST");
  assert.ok(
    !refused.ok,
    "Coupled undo is rejected after the receiving group has acted.",
  );
  assert.deepEqual(
    [
      await publicFingerprint(a),
      await publicFingerprint(b),
      await publicFingerprint(c),
    ],
    protectedState,
    "Rejected undo changes no native group.",
  );
  proof.checks.push({
    eventId: event.id,
    sharedStory: "70035",
    transaction: "two resources sent through native Vent",
    receiverDecisionPreserved: true,
    operationReplay: true,
    coupledUndo: true,
    staleUndoRejected: true,
    journalCount,
  });
  // Trigger the real gate; first two groups cannot open the native round window.
  for (const [index, seat] of event.seats.entries()) {
    await seed(
      seat,
      {
        tag: "Run",
        contents: [{ tag: "EndRoundWindow" }, { tag: "EndRound" }],
      },
      "Queue the exact native Upkeep round-end pair to exercise arrival, actual trigger decisions and finish release; bypass playing remaining actions, Enemy phase and Upkeep prerequisites only.",
    );
    const state = await coordinator(event),
      barrier = mapGet(state.eventBarriers, {
        tag: "RoundBarrier",
        contents: 1,
      });
    assert.ok(barrier, "Native gate records the printed round number.");
    if (index < 2) assert.equal(barrier.barrierOpened, false);
  }
  for (let tries = 0; tries < 20; tries++) {
    const state = await coordinator(event),
      barrier = mapGet(state.eventBarriers, {
        tag: "RoundBarrier",
        contents: 1,
      });
    if (barrier?.barrierReleased) break;
    for (const seat of event.seats) {
      const current = await snapshot(seat),
        question = model(current);
      const decline = question?.choices.find(
        (v) => v.tag === "SkipTriggersButton",
      );
      if (decline)
        await answer(
          seat,
          protocol.buildChoiceAnswer(question, decline.answerIndex),
        );
      else if (question?.choices.some((v) => /Waiting/i.test(v.label)))
        await choose(
          seat,
          (v) => /Waiting/i.test(v.label),
          "Refresh the native barrier waiting checkpoint.",
        );
      else await settle(seat, "round-end");
    }
  }
  assert.equal(
    mapGet((await coordinator(event)).eventBarriers, {
      tag: "RoundBarrier",
      contents: 1,
    })?.barrierReleased,
    true,
  );
  proof.checks.push({
    eventId: event.id,
    nativeRoundGate: true,
    firstTwoGroupsWaited: true,
    allThreeWindowsFinished: true,
  });
  const timed = await Promise.all(event.seats.map(snapshot));
  await expireTimer(event);
  for (const [index, seat] of event.seats.entries()) {
    const current = await snapshot(seat);
    assert.equal(meta(current).epicLabyrinthTimeExpired, true);
    assert.deepEqual(
      current.game.question,
      timed[index].game.question,
      "Labyrinth time-up defers to Mythos and preserves the existing question.",
    );
  }
  await seed(
    a,
    { tag: "Begin", contents: "MythosPhase" },
    "Start the next native Mythos to prove deferred Labyrinth timer advancement enters the real stage barrier.",
  );
  await satisfyNativeDoomThreshold(a, true);
  const stageBarrier = mapGet((await coordinator(event)).eventBarriers, {
    tag: "StageBarrier",
    contents: 1,
  });
  assert.ok(
    stageBarrier,
    "Deferred timer advancement is held at the real three-group stage gate.",
  );
  assert.deepEqual(stageBarrier.barrierArrived, ["GroupA"]);
  assert.equal(stageBarrier.barrierOpened, false);
  assert.equal(stageBarrier.barrierReleased, false);
  assert.ok(
    model(await snapshot(a)).choices.some((choice) =>
      /Waiting/i.test(choice.label),
    ),
    "The source waits for the other groups after its real native agenda threshold check.",
  );
  proof.checks.push({
    eventId: event.id,
    printedTimeLimitMinutes: 60,
    timeoutDefersUntilMythos: true,
    nativeStageBarrier: true,
    nativeDoomConfirmationAnswered: true,
    stageBarrierArrived: stageBarrier.barrierArrived,
    stageBarrierOpened: stageBarrier.barrierOpened,
  });
  await satisfyNativeDoomThreshold(b, false);
  const twoArrivals = mapGet((await coordinator(event)).eventBarriers, {
    tag: "StageBarrier",
    contents: 1,
  });
  assert.deepEqual(twoArrivals.barrierArrived, ["GroupA", "GroupB"]);
  assert.equal(twoArrivals.barrierOpened, false);
  await satisfyNativeDoomThreshold(event.seats[2], false);
  const releasedStage = mapGet((await coordinator(event)).eventBarriers, {
    tag: "StageBarrier",
    contents: 1,
  });
  assert.deepEqual(releasedStage.barrierArrived, groups);
  assert.deepEqual(releasedStage.barrierFinished, groups);
  assert.equal(releasedStage.barrierOpened, true);
  assert.equal(releasedStage.barrierReleased, true);
  const physicalAgendas = [];
  for (const seat of event.seats) {
    const saved = await snapshot(seat),
      actualAgenda = values(saved.game.agendas)[0],
      nativeQuestion = model(saved),
      localBarrier = mapGet(meta(saved).epicLabyrinthBarriers, {
        tag: "StageBarrier",
        contents: 1,
      });
    assert.equal(actualAgenda.id, "c70002");
    assert.equal(actualAgenda.flipped, true);
    assert.deepEqual(actualAgenda.sequence, {
      agendaSequenceSide: "B",
      agendaSequenceStep: 1,
    });
    assert.equal(localBarrier.barrierReleased, true);
    assert.equal(nativeQuestion.tag, "ChooseOne");
    assert.equal(nativeQuestion.choices.length, 1);
    assert.deepEqual(nativeQuestion.choices[0].raw, {
      tag: "TargetLabel",
      target: { tag: "AgendaTarget", contents: actualAgenda.id },
      messages: [
        {
          tag: "AdvanceAgendaBy",
          contents: [actualAgenda.id, "AgendaAdvancedWithDoom"],
        },
      ],
    });
    const savedQueue = JSON.parse(
      await sql(
        `SELECT s.choice->'choiceMessages' FROM arkham_games g JOIN arkham_steps s ON s.arkham_game_id=g.id AND s.step=g.step WHERE g.id='${seat.gameId}'::uuid`,
      ),
    );
    assert.ok(
      !savedQueue.some(
        (message) =>
          message.tag === "ScenarioSpecific" &&
          message.contents?.[0] === "epicLabyrinth.delivery" &&
          message.contents?.[1]?.envelopeBody?.tag === "ReleaseBarrier" &&
          structuralKey(message.contents[1].envelopeBody.contents[0]) ===
            structuralKey({ tag: "StageBarrier", contents: 1 }),
      ),
      "The real Stage release was consumed before the unrelated native Mythos tail.",
    );
    physicalAgendas.push({
      gameId: seat.gameId,
      cardId: actualAgenda.cardId,
      agendaId: actualAgenda.id,
      sequence: actualAgenda.sequence,
      flipped: actualAgenda.flipped,
      barrierReleased: localBarrier.barrierReleased,
      nativeConfirmation: nativeQuestion.choices[0].raw,
      savedQueueSha256: digest(savedQueue),
    });
  }
  proof.checks.push({
    eventId: event.id,
    nativeStageReleased: true,
    allThreeNativeAgendasFlipped: true,
    pendingPrintedConfirmationsPreserved: true,
    actTwoPrerequisitesPlayed: false,
    physicalAgendas,
  });
}
async function edwinFlags(event, expectedEra) {
  const authoritative = await coordinator(event);
  for (const era of eras) {
    const progress = mapGet(authoritative.machinationsEras, era);
    assert.equal(
      progress.eraEdwinEnemy,
      era === expectedEra,
      "Authoritative physical Edwin ownership must be current without a clue operation.",
    );
    assert.equal(progress.eraEdwinAsset, false);
  }
  for (const seat of event.seats) {
    const replica = meta(await snapshot(seat)).epicMachinationsReplica;
    for (const era of eras) {
      assert.equal(
        mapGet(replica.eraProgress, era).eraEdwinEnemy,
        era === expectedEra,
        "Every saved native replica must immediately reflect the physical owner.",
      );
      assert.equal(mapGet(replica.eraProgress, era).eraEdwinAsset, false);
    }
  }
}
async function printedEdwinChecks(event) {
  const [past, present] = event.seats;
  await refreshPlayerWindows(event);
  assert.equal(
    protocol.companionCatalogCode(
      (await coordinator(event)).machinationsMachination,
    ),
    "87034",
  );
  await edwinFlags(event, "PresentEra");
  const rival = (saved) =>
    values(saved.game.enemies).filter((enemy) =>
      ["87037", "87037a"].includes(code(enemy)),
    );
  const actor = await snapshot(past),
    donor = await snapshot(present);
  assert.equal(
    rival(actor).length,
    0,
    "Remote era starts with no physical Edwin.",
  );
  assert.equal(
    rival(donor).length,
    1,
    "Actual Redeem setup places the single physical Edwin in the Present.",
  );
  const edwin = rival(donor)[0];
  const printedBring = (choice) =>
    !choice.disabled &&
    choice.raw.ability?.index === 1 &&
    code({ cardCode: choice.raw.ability?.cardCode }) === "87034";
  assert.ok(
    model(actor).choices.some(printedBring),
    "The remote printed double action must be offered immediately after setup, before any clue/progress operation.",
  );

  // Add only documented native fixtures to this new QA game. These are real
  // cards from its validated deck; paying/playing their prerequisites is not
  // claimed by this acceptance check.
  const flashes = values(donor.game.cards).filter(
    (card) => code(card) === "01087" && unbox(card).owner === own(donor).id,
  );
  assert.equal(
    flashes.length,
    2,
    "The source native deck has two distinct actual Flashlight cards.",
  );
  const attachments = [];
  for (const [index, card] of flashes.entries()) {
    await seed(
      present,
      {
        tag: "PutCardIntoPlay",
        contents: [own(donor).id, card, null, { tag: "NoPayment" }, []],
      },
      "Put one actual validated-deck Flashlight into play solely for the physical recursive attachment fixture; bypass its printed cost.",
    );
    const saved = await snapshot(present);
    const asset = values(saved.game.assets).find(
      (entity) => entity.cardId === unbox(card).id,
    );
    assert.ok(asset, "The real engine creates the matching actual-card asset.");
    attachments.push(asset.id);
    await seed(
      present,
      {
        tag: "PlaceAsset",
        contents: [
          asset.id,
          index === 0
            ? { tag: "AttachedToEnemy", contents: edwin.id }
            : { tag: "AttachedToAsset", contents: [attachments[0], null] },
        ],
      },
      "Attach the actual source-owned player card to Edwin or to the first attachment through native placement.",
    );
  }
  await seed(
    present,
    {
      tag: "PlaceTokens",
      contents: [
        { tag: "GameSource" },
        { tag: "EnemyTarget", contents: edwin.id },
        "Target",
        2,
      ],
    },
    "Give the physical Edwin two non-resolution fixture tokens to verify exact transfer identity and counters.",
  );
  await seed(
    present,
    {
      tag: "PlaceTokens",
      contents: [
        { tag: "GameSource" },
        { tag: "AssetTarget", contents: attachments[0] },
        "Damage",
        1,
      ],
    },
    "Mark one native attachment to verify its exact physical state survives the cross-era transaction.",
  );
  await seed(
    present,
    {
      tag: "Exhaust",
      contents: {
        exhaustionSource: { tag: "GameSource" },
        exhaustionTarget: { tag: "EnemyTarget", contents: edwin.id },
        exhaustionThen: [],
      },
    },
    "Exhaust the actual QA Edwin; his printed bring action must ready the same entity.",
  );
  const before = await snapshot(present),
    beforePast = await snapshot(past);
  const physical = rival(before)[0];
  const graph = attachments.map((id) =>
    values(before.game.assets).find((asset) => asset.id === id),
  );
  const question = before.game.question;
  const cardIdentities = flashes.map((card) => unbox(card).id);
  async function assertMoved() {
    const source = await snapshot(present),
      destination = await snapshot(past);
    assert.equal(rival(source).length, 0);
    assert.equal(rival(destination).length, 1);
    const moved = rival(destination)[0];
    assert.equal(moved.id, physical.id);
    assert.equal(moved.cardId, physical.cardId);
    assert.deepEqual(moved.tokens, physical.tokens);
    assert.equal(moved.exhausted, false);
    assert.deepEqual(moved.placement, {
      tag: "AtLocation",
      contents: own(destination).placement.contents,
    });
    for (const original of graph) {
      assert.equal(
        values(source.game.assets).some((asset) => asset.id === original.id),
        false,
      );
      assert.deepEqual(
        values(destination.game.assets).find(
          (asset) => asset.id === original.id,
        ),
        original,
        "Recursive source-owned attachment retains exact ID/card/tokens/placement/controller.",
      );
    }
    for (const id of cardIdentities) {
      assert.equal(
        unbox(mapGet(destination.game.cards, id)).owner,
        own(before).id,
        "Player attachment keeps its original investigator owner.",
      );
      assert.equal(
        mapGet(meta(destination).epicLabyrinthOwners, id),
        "GroupB",
        "Equal printed investigator IDs in different eras cannot replace the original Present owner group.",
      );
    }
    assert.deepEqual(
      source.game.question,
      question,
      "Physical transport preserves the donor's pending native player decision.",
    );
    await edwinFlags(event, "PastEra");
    return destination;
  }
  await choose(
    past,
    printedBring,
    "Use the actual remote Redeem a Former Colleague printed double action.",
  );
  const moved = await assertMoved();
  assert.equal(
    own(moved).remainingActions,
    own(beforePast).remainingActions - 2,
    "Native printed movement spends two real actions.",
  );
  await foreignUndoChecks(event, present, past);
  await undo(past);
  const restored = await snapshot(present),
    restoredPast = await snapshot(past);
  assert.deepEqual(
    rival(restored)[0],
    physical,
    "Origin undo restores the exact original exhausted physical Edwin.",
  );
  for (const original of graph)
    assert.deepEqual(
      values(restored.game.assets).find((asset) => asset.id === original.id),
      original,
    );
  assert.equal(rival(restoredPast).length, 0);
  assert.equal(
    own(restoredPast).remainingActions,
    own(beforePast).remainingActions,
  );
  await edwinFlags(event, "PresentEra");

  await choose(
    past,
    printedBring,
    "Repeat the real printed action after a successful coupled origin undo.",
  );
  await assertMoved();
  await choose(
    present,
    (choice) => choice.label === "Take 1 resource" && !choice.disabled,
    "Continue the donor's preserved real player decision after the shared movement.",
  );
  const fingerprint = await mutationFingerprint(event),
    offset = await logSize();
  const refused = await http(seatPath(past, "/undo"), {});
  const reason =
    "Cannot undo this timeline effect after another group has continued";
  assert.ok([400, 500].includes(refused.status));
  assert.ok(
    JSON.stringify(refused.data).includes(reason) ||
      (await loggedReason(offset, reason)),
    "A continued participant must reject the coupled origin undo for the native continuation reason.",
  );
  assert.deepEqual(
    await mutationFingerprint(event),
    fingerprint,
    "Rejected continued-participant undo leaves all physical groups, histories, ledger and journal exactly unchanged.",
  );
  proof.checks.push({
    eventId: event.id,
    nativeRedeemSetup: true,
    printedRemoteBringBeforeClueOperations: true,
    actualEdwinId: physical.id,
    actualEdwinCardId: physical.cardId,
    recursiveAttachmentIds: attachments,
    exactPhysicalIdentityTokensAndOriginalOwners: true,
    movedEdwinReadied: true,
    printedActionCost: 2,
    immediateAllEraReplicaOwnership: true,
    donorDecisionPreserved: true,
    coupledOriginUndo: true,
    continuedParticipantUndoRejected: true,
    continuedParticipantHttpStatus: refused.status,
    rejectedUndoBeforeSha256: digest(fingerprint),
    rejectedUndoAfterSha256: digest(await mutationFingerprint(event)),
  });
  await checkpoint();
}
async function machinationsChecks(event) {
  const [past, present] = event.seats;
  await printedEdwinChecks(event);
  let current = await snapshot(past),
    iid = own(current).id;
  await seed(
    past,
    {
      tag: "PlaceTokens",
      contents: [
        { tag: "GameSource" },
        { tag: "InvestigatorTarget", contents: iid },
        "Clue",
        1,
      ],
    },
    "Give the new QA investigator one clue so the printed native Tindalos choice can be exercised without an investigation roll.",
  );
  const fastClues = (c) =>
    c.tag === "AbilityLabel" &&
    c.raw.ability?.index === 1 &&
    code({ cardCode: c.raw.ability?.cardCode }) === "87005b";
  await choose(past, fastClues, "Use the printed Tindalos fast ability.");
  await choose(
    past,
    (c) => /Place one of your clues/.test(c.label),
    "Choose the native clue deposit.",
  );
  current = await snapshot(past);
  assert.equal(tokenCount(own(current), "Clue"), 0);
  assert.equal(tokenCount(tindalos(current), "Clue"), 1);
  assert.equal(
    mapGet((await coordinator(event)).machinationsEras, "PastEra")
      .eraTindalosClues,
    1,
  );
  // Change the actual physical pool through a native transaction. The replica
  // must immediately publish its new count, and pickup must debit it once.
  await seed(
    past,
    {
      tag: "PlaceTokens",
      contents: [
        { tag: "GameSource" },
        { tag: "LocationTarget", contents: tindalos(current).id },
        "Clue",
        1,
      ],
    },
    "Increase the actual native pool to test immediate authoritative publication and exactly-once cross-era pickup.",
  );
  assert.equal(
    mapGet((await coordinator(event)).machinationsEras, "PastEra")
      .eraTindalosClues,
    2,
    "Every native transaction publishes the current physical clue pool before another era acts.",
  );
  const originQuestion = (await snapshot(past)).game.question;
  await choose(
    present,
    fastClues,
    "Use another era's printed Tindalos fast ability.",
  );
  await choose(
    present,
    (c) => /Take one clue.*PastEra/.test(c.label),
    "Choose a cross-era clue from the Past.",
  );
  current = await snapshot(past);
  const receiver = await snapshot(present);
  assert.equal(
    tokenCount(tindalos(current), "Clue"),
    1,
    "One physical debit; no duplicate delivery debit.",
  );
  assert.equal(
    tokenCount(own(receiver), "Clue"),
    1,
    "One physical credit; no duplicate delivery credit.",
  );
  assert.deepEqual(
    current.game.question,
    originQuestion,
    "Cross-era pickup preserves the source's pending decision.",
  );
  assert.equal(
    mapGet((await coordinator(event)).machinationsEras, "PastEra")
      .eraTindalosClues,
    1,
    "Native clue pool was refreshed before pickup.",
  );
  await foreignUndoChecks(event, past, present);
  await undo(present);
  assert.equal(tokenCount(tindalos(await snapshot(past)), "Clue"), 2);
  assert.equal(tokenCount(own(await snapshot(present)), "Clue"), 0);
  assert.equal(
    mapGet((await coordinator(event)).machinationsEras, "PastEra")
      .eraTindalosClues,
    2,
    "Undo restores the exact prior authoritative native pool and ledger.",
  );
  proof.checks.push({
    eventId: event.id,
    printedTindalosDeposit: true,
    printedCrossEraPickup: true,
    authoritativeNativeRefresh: true,
    noDoubleDebitOrCredit: true,
    sourceDecisionPreserved: true,
    coupledClueUndo: true,
  });
  for (const seat of event.seats) {
    const saved = await snapshot(seat);
    let card = (scenario(saved).setAsideCards || []).find(
      (c) => code(c) === "87043",
    );
    if (!card) {
      const template =
        (scenario(saved).setAsideCards || []).find(
          (c) => c.tag === "EncounterCard",
        ) || values(saved.game.cards).find((c) => c.tag === "EncounterCard");
      assert.ok(
        template,
        "The native scenario supplies a valid encounter-card wire template.",
      );
      card = {
        tag: "EncounterCard",
        contents: {
          ...unbox(template),
          id: randomUUID(),
          cardCode: "c87043",
          originalCardCode: "c87043",
          owner: null,
          facedown: null,
          isFlipped: false,
        },
      };
      proof.debugSeeds.push({
        gameId: seat.gameId,
        reason:
          "The randomly selected printed plot removed Tyrthrha; generate one registered native QA copy solely for the shared-health probe.",
        cardCode: "87043",
        cardId: unbox(card).id,
      });
    }
    await seed(
      seat,
      {
        tag: "CreateEnemy",
        contents: {
          enemyCreationCard: card,
          enemyCreationEnemyId: unbox(card).id,
          enemyCreationMethod: {
            tag: "SpawnAtLocation",
            contents: tindalos(saved).id,
          },
          enemyCreationTarget: null,
          enemyCreationExhausted: true,
          enemyCreationBefore: [],
          enemyCreationAfter: [],
          enemyCreationInvestigator: null,
        },
      },
      "Place a native Tyrthrha copy to inspect shared health mirroring without playing the selected plot prerequisites.",
    );
  }
  const bossOperation = await operation(past, event, {
    tag: "DamageTyrthrha",
    contents: 2,
  });
  for (const seat of event.seats) {
    const boss = values((await snapshot(seat)).game.enemies).find(
      (e) => code(e) === "87043",
    );
    assert.ok(boss);
    assert.equal(tokenCount(boss, "Damage"), 2);
  }
  const bossState = await coordinator(event);
  assert.equal(bossState.machinationsBossHealth, 18);
  assert.equal(bossState.machinationsBossRemaining, 16);
  await operation(
    past,
    event,
    { tag: "DamageTyrthrha", contents: 2 },
    bossOperation,
  );
  assert.equal(
    (await coordinator(event)).machinationsBossRemaining,
    16,
    "Shared boss damage replay is idempotent.",
  );
  proof.checks.push({
    eventId: event.id,
    globalPlayers: 3,
    sharedTyrthrhaMaxHealth: 18,
    sharedTyrthrhaRemaining: 16,
    threePhysicalDamageMapsAgree: true,
    damageReplayIdempotent: true,
  });
  const beforeExpiry = await Promise.all(event.seats.map(snapshot));
  await expireTimer(event);
  const ended = await coordinator(event);
  assert.equal(
    ended.machinationsResolution,
    3,
    "The actual Envious Rival world chooses printed Resolution 3 on expiry.",
  );
  const endings = [];
  for (const [index, seat] of event.seats.entries()) {
    const saved = await snapshot(seat),
      question = model(saved),
      original = own(beforeExpiry[index]),
      investigator = own(saved);
    assert.deepEqual(
      Object.keys(saved.game.investigators),
      Object.keys(beforeExpiry[index].game.investigators),
      "Printed defeat retains the actual local investigator roster at the resolution checkpoint.",
    );
    assert.equal(investigator.id, original.id);
    assert.equal(investigator.cardCode, original.cardCode);
    assert.equal(investigator.playerId, original.playerId);
    assert.equal(investigator.defeated, true);
    assert.equal(investigator.eliminated, true);
    assert.equal(investigator.mentalTrauma, original.mentalTrauma + 1);
    assert.equal(investigator.physicalTrauma, original.physicalTrauma);
    assert.equal(meta(saved).epicMachinationsReplica.globalResolution, 3);
    assert.equal(scenario(saved).inResolution, true);
    assert.equal(
      question?.tag,
      "Read",
      "Expiry presents the real printed resolution prose immediately.",
    );
    assert.ok(JSON.stringify(question.raw).includes("resolution3"));
    assert.ok(
      !JSON.stringify(saved.game.question).includes("AdvanceAgenda"),
      "No agenda flip confirmation delays immediate timeout.",
    );
    assert.equal(question.choices.length, 1);
    const continuation = question.choices[0];
    assert.ok(/continue/i.test(continuation.label));
    proof.setupAnswers.push({
      gameId: seat.gameId,
      category: "printed-timeout-resolution",
      tag: question.tag,
      answerIndex: continuation.answerIndex,
      label: continuation.label,
    });
    await answer(
      seat,
      protocol.buildChoiceAnswer(question, continuation.answerIndex),
    );
    const completed = await snapshot(seat);
    assert.equal(
      completed.game.gameState?.tag,
      "IsOver",
      "The legitimate printed Continue reaches the actual native game ending.",
    );
    assert.equal(Object.keys(completed.game.question || {}).length, 0);
    const completedInvestigator = own(completed);
    assert.equal(completedInvestigator.id, original.id);
    assert.equal(completedInvestigator.playerId, original.playerId);
    assert.equal(completedInvestigator.cardCode, original.cardCode);
    assert.equal(
      completedInvestigator.drivenInsane,
      true,
      "The real printed Resolution 3 applies its insanity consequence after Continue.",
    );
    endings.push({
      gameId: seat.gameId,
      investigatorId: investigator.id,
      playerId: investigator.playerId,
      defeated: investigator.defeated,
      eliminated: investigator.eliminated,
      mentalTraumaBefore: original.mentalTrauma,
      mentalTraumaAtResolution: investigator.mentalTrauma,
      printedResolution: 3,
      resolutionQuestionSha256: digest(question.raw),
      completedNativeGameState: completed.game.gameState,
      completedInvestigatorDrivenInsane: completedInvestigator.drivenInsane,
      completedSnapshotSha256: digest(completed.game),
    });
  }
  const finalBefore = (await coordinator(event)).machinationsRevision,
    replayBefore = await mutationFingerprint(event);
  const expiryReplay = await http(
    `/api/v1/arkham/events/${event.id}/time-up`,
    {},
    "POST",
    secrets.get("organizer"),
  );
  assert.ok(
    expiryReplay.ok || expiryReplay.status === 400,
    "Completed timer replay may be a no-op or reject a timer that has stopped.",
  );
  assert.equal(
    (await coordinator(event)).machinationsRevision,
    finalBefore,
    "Repeated event expiry does not apply a second ending.",
  );
  assert.deepEqual(
    await mutationFingerprint(event),
    replayBefore,
    "Repeated expiry preserves all three completed native games, histories, coordinator and journal.",
  );
  proof.checks.push({
    eventId: event.id,
    immediateTimeExpiry: true,
    resolution: ended.machinationsResolution,
    noAgendaConfirmation: true,
    expiryIdempotent: true,
    nativePrintedResolutionProse: true,
    retainedDefeatedRosterAtResolution: true,
    exactlyOneAddedMentalTrauma: true,
    legitimateContinueEndsAllThreeNativeGames: true,
    endings,
    expiryReplayBeforeSha256: digest(replayBefore),
    expiryReplayAfterSha256: digest(await mutationFingerprint(event)),
  });
}

await mkdir(output, { recursive: true });
try {
  const status = await request("/chronicle/status");
  assert.equal(status.ready, true);
  for (const extension of ["barkham", "epic-labyrinth", "epic-machinations"])
    assert.ok(
      status.extensions.includes(extension),
      `Install the verified ${extension} candidate before live QA.`,
    );
  proof.runtime = {
    version: status.version,
    binarySha256: status.binarySha256,
    extensionSourceSha256: status.extensionSourceSha256,
    extensions: status.extensions,
    ...(status.runtimeScope
      ? {
          scope: status.runtimeScope,
          platform: status.platform,
          capabilityCertified: false,
        }
      : {}),
  };
  if (process.env.ARKHAM_RULES_QA_MANIFEST) {
    const candidate = await acceptanceManifest(
      resolve(process.env.ARKHAM_RULES_QA_MANIFEST),
    );
    assert.equal(status.binarySha256, candidate.binarySha256);
    assert.equal(status.extensionSourceSha256, candidate.extensionSourceSha256);
    assert.deepEqual(
      [...status.extensions].sort(),
      [...candidate.extensions].sort(),
    );
    proof.candidate = {
      kind: candidate.kind,
      ...(candidate.scope
        ? {
            scope: candidate.scope,
            platform: candidate.platform,
            capabilityCertified: false,
          }
        : {}),
    };
  }
  secrets.set("organizer", (await request("/chronicle/session")).token);
  const presentation = await request("/chronicle/play/presentation");
  const manifest = JSON.parse(
    await readFile("public/data/catalog.json", "utf8"),
  );
  allCards = (
    await Promise.all(
      manifest.cardFiles.map(async (path) =>
        JSON.parse(await readFile(`public${path}`, "utf8")),
      ),
    )
  ).flat();
  const cardMap = new Map(allCards.map((c) => [c.code, c]));
  context = {
    card: (code) => cardMap.get(code),
    translate: protocol.companionTranslator(presentation.strings),
    scenarioSettings: (id) => presentation.scenarioSettings[id],
    campaignSettings: (id) => presentation.campaignSettings[id],
    sideStories: presentation.sideStories,
  };
  const legacyEvent = resumeLegacy ? await loadLegacyLabyrinth() : undefined;
  const existingList = await request("/chronicle/play/games");
  const prior = [];
  for (const listed of values(existingList))
    if (uuid.test(listed?.id) && !ownedGames.has(listed.id)) {
      const saved = await request(`/chronicle/play/games/${listed.id}`);
      prior.push({
        gameId: listed.id,
        hash: createHash("sha256")
          .update(JSON.stringify(saved.game))
          .digest("hex"),
      });
    }
  proof.existingGamesReadOnly = prior.map((p) => p.gameId);
  await checkpoint();
  if (prepareClient) {
    await prepareClientSetupEvent("70001");
    await prepareClientSetupEvent("87001");
  } else if (resumeLegacy) {
    await finishEventSetup(legacyEvent);
    await refreshPlayerWindows(legacyEvent);
  } else if (prepareHard) {
    await prepareTableEvent("70001", "Hard");
  } else if (prepareTable) {
    await prepareTableEvent("70001");
    await prepareTableEvent("87001");
  } else if (machinationsOnly) {
    await machinationsChecks(await redeemEvent());
  } else {
    await labyrinthChecks(await createEvent("70001"));
    await checkpoint();
    await machinationsChecks(await redeemEvent());
  }
  for (const p of prior) {
    const saved = await request(`/chronicle/play/games/${p.gameId}`);
    assert.equal(
      createHash("sha256").update(JSON.stringify(saved.game)).digest("hex"),
      p.hash,
      `Pre-existing game ${p.gameId} remains unchanged.`,
    );
  }
  if (preparation) proof.prepared = true;
  else proof.passed = true;
  proof.finishedAt = new Date().toISOString();
  await checkpoint();
  console.log(
    preparation
      ? `Epic native ${prepareClient ? "untouched client setup seed" : resumeLegacy ? "legacy Labyrinth resumption" : prepareHard ? "Hard Labyrinth setup" : "table seed"} prepared: ${proof.events.length} ${resumeLegacy ? "retained" : "new"} events with three ${prepareClient ? "unanswered ChooseDeck" : "ready"} seats each. Full acceptance checks not run. Report: ${resolve(output, "report.json")}`
      : `${machinationsOnly ? "Machinations scoped" : "Epic"} native API proof passed: ${proof.events.length} new events, ${proof.checks.length} check groups. Report: ${resolve(output, "report.json")}`,
  );
} catch (error) {
  proof.error = redact(error.stack || error.message);
  await checkpoint();
  console.error(proof.error);
  process.exitCode = 1;
}
