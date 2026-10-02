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
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";

if (process.argv.includes("--help")) {
  console.log(
    "After full native installation: EPIC_QA_CONFIRMED=1 node --import tsx scripts/epic-runtime-check.mjs\nOptional: ARKHAM_RULES_URL, QA_OUT, ARKHAM_RULES_PSQL, ARKHAM_RULES_PG_PORT. Creates new QA events only.",
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
const output = resolve(process.env.QA_OUT || "output/epic-runtime");
const ownedGames = new Set(),
  ownedEvents = new Set(),
  secrets = new Map();
const proof = {
  startedAt: new Date().toISOString(),
  passed: false,
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
const mapGet = (value, key) =>
  pairs(value).find(([k]) =>
    typeof key === "object" && key !== null
      ? JSON.stringify(k) === JSON.stringify(key)
      : String(k) === String(key),
  )?.[1];
const unbox = (value) =>
  ["EncounterCard", "PlayerCard", "VengeanceCard"].includes(value?.tag)
    ? value.contents
    : value;
const code = (value) =>
  protocol.companionCatalogCode(String(unbox(value)?.cardCode || ""));
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
async function settle(seat, category = "setup") {
  for (let n = 0; n < 120; n++) {
    const current = await snapshot(seat),
      question = model(current);
    assert.ok(
      question,
      `${seat.name}: native question absent during ${category}.`,
    );
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
  return {
    name,
    investigator_code: "01001",
    slots: {
      ...Object.fromEntries(legal.slice(0, 15).map((c) => [c.code, 2])),
      "01006": 1,
      "01007": 1,
      "01096": 1,
    },
  };
}
async function createEvent(scenarioId) {
  const name = `Chronicle Epic native QA ${scenarioId} ${new Date().toISOString()}`;
  const event = await request("/chronicle/epic/events", {
    name,
    scenarioId,
    difficulty: "Standard",
    groups: groups.map((group, ordinal) => ({
      name: `${name} ${scenarioId === "70001" ? group : eras[ordinal]}`,
      playerCount: 1,
    })),
  });
  assert.ok(uuid.test(event.id));
  ownedEvents.add(event.id);
  event.scenarioId = scenarioId;
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
  const ready = new Set();
  for (let round = 0; round < 20 && ready.size < 3; round++)
    for (const seat of event.seats) {
      if (ready.has(seat.id)) continue;
      const current = await settle(seat);
      if (
        model(current)?.isPlayerWindow &&
        current.game.phase === "InvestigationPhase"
      ) {
        await native(seat, `events/${event.id}/ready`, {}, "POST");
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
    }
  }
  proof.checks.push({
    eventId: event.id,
    setup: true,
    groupOrdinals: [0, 1, 2],
    duplicateInvestigatorAllowed: true,
    timerStarted: true,
  });
  return event;
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
      { tag: "EndRoundWindow" },
      "Reach the real native round-end gate without playing all remaining actions and upkeep.",
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
  assert.ok(
    mapGet((await coordinator(event)).eventBarriers, {
      tag: "StageBarrier",
      contents: 1,
    }),
    "Deferred timer advancement is held at the real three-group stage gate.",
  );
  proof.checks.push({
    eventId: event.id,
    printedTimeLimitMinutes: 60,
    timeoutDefersUntilMythos: true,
    nativeStageBarrier: true,
  });
}
async function machinationsChecks(event) {
  const [past, present] = event.seats;
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
  // Alter physical clue state independently: take must refresh its authoritative
  // native pool rather than debit a stale replicated count.
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
    "Make the native pool newer than the saved replica to test authoritative refresh before taking a clue.",
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
  await undo(present);
  assert.equal(tokenCount(tindalos(await snapshot(past)), "Clue"), 2);
  assert.equal(tokenCount(own(await snapshot(present)), "Clue"), 0);
  assert.equal(
    mapGet((await coordinator(event)).machinationsEras, "PastEra")
      .eraTindalosClues,
    1,
    "Undo restores the exact prior ledger; the next transaction refreshes native state again.",
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
      const template = (scenario(saved).setAsideCards || []).find(
        (c) => c.tag === "EncounterCard",
      );
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
  await expireTimer(event);
  const ended = await coordinator(event);
  assert.ok(
    [2, 3, 4].includes(ended.machinationsResolution),
    "Printed immediate failure resolution committed.",
  );
  for (const seat of event.seats) {
    const saved = await snapshot(seat),
      question = model(saved);
    assert.ok(
      !question?.isPlayerWindow,
      "Expiry interrupts the normal action decision.",
    );
    assert.ok(
      !JSON.stringify(saved.game.question).includes("AdvanceAgenda"),
      "No agenda flip confirmation delays immediate timeout.",
    );
  }
  const finalBefore = ended.machinationsRevision;
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
  proof.checks.push({
    eventId: event.id,
    immediateTimeExpiry: true,
    resolution: ended.machinationsResolution,
    noAgendaConfirmation: true,
    expiryIdempotent: true,
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
  };
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
  const existingList = await request("/chronicle/play/games");
  const prior = [];
  for (const listed of values(existingList))
    if (uuid.test(listed?.id)) {
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
  await labyrinthChecks(await createEvent("70001"));
  await checkpoint();
  await machinationsChecks(await createEvent("87001"));
  for (const p of prior) {
    const saved = await request(`/chronicle/play/games/${p.gameId}`);
    assert.equal(
      createHash("sha256").update(JSON.stringify(saved.game)).digest("hex"),
      p.hash,
      `Pre-existing game ${p.gameId} remains unchanged.`,
    );
  }
  proof.passed = true;
  proof.finishedAt = new Date().toISOString();
  await checkpoint();
  console.log(
    `Epic native API proof passed: ${proof.events.length} new events, ${proof.checks.length} check groups. Report: ${resolve(output, "report.json")}`,
  );
} catch (error) {
  proof.error = redact(error.stack || error.message);
  await checkpoint();
  console.error(proof.error);
  process.exitCode = 1;
}
