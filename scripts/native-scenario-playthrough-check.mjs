#!/usr/bin/env node
/** Real native scenario play, using newly created QA games and only offered
 * question responses. No debug messages, coordinator operations or clock edits.
 * A stopped/failed run is retained; only an observed native winning resolution
 * followed by IsOver can qualify as a complete playthrough. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";
import { mkdir, readFile, writeFile, appendFile, open } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptanceManifest,
  qaFileSha256,
} from "./rules-qa-runtime-identity.mjs";
import { assertLegalMutation, assertLabyrinthResumeRoster } from "./native-scenario-playthrough-policy.mjs";
import { createNativeScenarioDeck } from "./native-scenario-decks.mjs";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = process.argv.slice(2);
if (options.includes("--help")) {
  console.log(`EPIC_QA_CONFIRMED=1 ARKHAM_RULES_QA_MANIFEST=<verified native manifest> ARKHAM_RULES_URL=<private loopback service> ARKHAM_RULES_PSQL=<private psql> ARKHAM_RULES_PG_PORT=<private port> QA_OUT=<new directory under output> node --import tsx scripts/native-scenario-playthrough-check.mjs [--scenario barkham|labyrinth] [--stop-after-setup] [--max-answers 1800] [--max-minutes 45] [--resume-report <own stopped report>]
This creates fresh legal XP0 decks/games, records a uniform actual Core Set basic weakness draw, and sends only responses to actual offered questions. Every pre-answer native snapshot is stored privately as gzip JSON with a SHA. Existing saves are protected by full SQL row fingerprints. Setup-only and unsupported-policy checkpoints do not claim a whole playthrough. Resume is confined to this runner's own newly created stopped games, unchanged binary/source, and a new output directory; the original trace/report remains intact.`);
  process.exit(0);
}
const valueOf = (flag, fallback) =>
  options.includes(flag) ? options[options.indexOf(flag) + 1] : fallback;
const allowed = new Set([
  "--scenario",
  "--stop-after-setup",
  "--max-answers",
  "--max-minutes",
  "--resume-report",
]);
for (let i = 0; i < options.length; i++) {
  assert.ok(allowed.has(options[i]), `Unknown option ${options[i]}.`);
  if (options[i] !== "--stop-after-setup")
    assert.ok(options[++i] && !options[i].startsWith("--"));
}
assert.equal(
  process.env.EPIC_QA_CONFIRMED,
  "1",
  "Explicit isolated native QA authorization is required.",
);
const scenarioKind = valueOf("--scenario", "barkham");
assert.ok(["barkham", "labyrinth"].includes(scenarioKind));
const setupOnly = options.includes("--stop-after-setup");
const maxAnswers = Number(valueOf("--max-answers", "1800"));
const maxMinutes = Number(valueOf("--max-minutes", "45"));
assert.ok(
  Number.isSafeInteger(maxAnswers) && maxAnswers > 0 && maxAnswers <= 5000,
);
assert.ok(Number.isFinite(maxMinutes) && maxMinutes > 0 && maxMinutes <= 55);
assert.ok(
  process.env.ARKHAM_RULES_URL &&
    process.env.ARKHAM_RULES_QA_MANIFEST &&
    process.env.ARKHAM_RULES_PSQL &&
    process.env.ARKHAM_RULES_PG_PORT &&
    process.env.QA_OUT,
);
const service = new URL(process.env.ARKHAM_RULES_URL);
assert.equal(service.protocol, "http:");
assert.ok(
  ["localhost", "127.0.0.1"].includes(service.hostname) && service.port,
);
assert.equal(service.pathname, "/");
assert.equal(
  service.search + service.hash + service.username + service.password,
  "",
);
const base = service.origin;
const output = resolve(project, process.env.QA_OUT);
assert.ok(output.startsWith(resolve(project, "output") + sep));
assert.ok(!output.startsWith(resolve(project, "output/rules-server") + sep));
const manifestPath = resolve(process.env.ARKHAM_RULES_QA_MANIFEST);
const candidate = await acceptanceManifest(manifestPath);
const protocol = await import("../src/game/companionProtocol.ts");
const runFile = promisify(execFile),
  compress = promisify(gzip),
  decompress = promisify(gunzip);
const sha = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest("hex");
const values = (value) =>
  Array.isArray(value)
    ? value.map((v) => (Array.isArray(v) ? v[1] : v))
    : Object.values(value || {});
const code = (entity) =>
  protocol.companionCatalogCode(String(entity?.cardCode || entity?.art || ""));
const scenario = (current) =>
  current.game.scenario ||
  current.game.mode?.That ||
  current.game.mode?.These?.[1];
const actor = (current) =>
  values(current.game.investigators).find(
    (i) => i.playerId === current.playerId,
  ) || values(current.game.investigators)[0];
const setupComplete = (current) =>
  current.game.gameState?.tag === "IsActive" &&
  current.game.phase === "InvestigationPhase" &&
  current.game.inSetup === false &&
  scenario(current)?.started === true;
const participants = [],
  importedDecks = new Set(),
  memories = new Map();
const proof = {
  schema: 1,
  mode: "native-scenario-legal-playthrough",
  scenario: scenarioKind,
  startedAt: new Date().toISOString(),
  passed: false,
  wholeScenarioCompleted: false,
  setupOnly,
  runtime: {
    binarySha256: candidate.binarySha256,
    extensionSourceSha256: candidate.extensionSourceSha256,
  },
  manifest: {
    path: manifestPath,
    sha256: await qaFileSha256(manifestPath),
    kind: candidate.kind,
    scope: candidate.scope,
    capabilityCertified: false,
  },
  harnessSha256: await qaFileSha256(fileURLToPath(import.meta.url)),
  maxAnswers,
  maxMinutes,
  games: [],
  decks: [],
  writes: [],
  milestones: [],
  snapshots: [],
  nativeMessagesSubmitted: 0,
  coordinatorOperationsSubmitted: 0,
  rngOrClockEdits: 0,
  scenarioAttempts: 1,
};
let context, cards, token, priorFingerprint, primaryError;
await mkdir(output, { recursive: true, mode: 0o700 });
await mkdir(resolve(output, "snapshots"), { mode: 0o700 });
await (await open(resolve(output, "report.json"), "wx", 0o600)).close();
const checkpoint = () => {
  proof.strategyMemories = Object.fromEntries(memories);
  return writeFile(
    resolve(output, "report.json"),
    JSON.stringify(proof, null, 2) + "\n",
    { mode: 0o600 },
  );
};
async function bindRunnerSources() {
  const sourcePaths = [
    "scripts/native-scenario-playthrough-check.mjs",
    "scripts/native-scenario-playthrough-policy.mjs",
    "scripts/native-scenario-decks.mjs",
    "scripts/native-scenario-barkham-policy.mjs",
    ...(scenarioKind === "labyrinth" ? [
      "scripts/native-scenario-labyrinth-policy.mjs",
      "scripts/native-scenario-labyrinth-run.mjs",
    ] : []),
    "scripts/rules-protocol.mjs",
    "src/game/companionProtocol.ts",
    "src/game/decks.ts",
  ];
  proof.runnerSources = [];
  for (const relativePath of sourcePaths) {
    const bytes = await readFile(resolve(project, relativePath)),
      archived = resolve(output, "sources", relativePath);
    await mkdir(dirname(archived), { recursive: true, mode: 0o700 });
    await writeFile(archived, bytes, { flag: "wx", mode: 0o600 });
    proof.runnerSources.push({
      path: relativePath,
      sha256: sha(bytes),
      archived: `sources/${relativePath}`,
    });
  }
}
async function verifyRunnerSources() {
  for (const entry of proof.runnerSources)
    assert.equal(
      await qaFileSha256(resolve(project, entry.path)),
      entry.sha256,
      `Legal response policy source changed while the runner was active: ${entry.path}`,
    );
}
async function sql(command) {
  const r = await runFile(
    resolve(process.env.ARKHAM_RULES_PSQL),
    [
      "--no-psqlrc",
      "-h",
      "127.0.0.1",
      "-p",
      process.env.ARKHAM_RULES_PG_PORT,
      "-U",
      "arkham_chronicle",
      "-d",
      "arkham_chronicle",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      command,
    ],
    {
      timeout: 20000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on" },
    },
  );
  return r.stdout.trim();
}
async function unrelatedFingerprint() {
  const excluded = participants
    .map((s) => {
      assert.match(s.gameId, /^[0-9a-f-]{36}$/);
      return `'${s.gameId}'::uuid`;
    })
    .join(",");
  const where = excluded ? `NOT IN (${excluded})` : "IS NOT NULL";
  return JSON.parse(
    await sql(`SELECT jsonb_build_object(
    'games',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'hash',md5(to_jsonb(g)::text)) ORDER BY id),'[]'::jsonb) FROM arkham_games g WHERE id ${where}),
    'players',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'hash',md5(to_jsonb(p)::text)) ORDER BY id),'[]'::jsonb) FROM arkham_players p WHERE arkham_game_id ${where}),
    'steps',(SELECT coalesce(jsonb_agg(jsonb_build_object('game',arkham_game_id,'step',step,'hash',md5(to_jsonb(s)::text)) ORDER BY arkham_game_id,step),'[]'::jsonb) FROM arkham_steps s WHERE arkham_game_id ${where}),
    'logs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'hash',md5(to_jsonb(l)::text)) ORDER BY id),'[]'::jsonb) FROM arkham_log_entries l WHERE arkham_game_id ${where})
  )::text`),
  );
}
async function request(
  path,
  body,
  method = body === undefined ? "GET" : "POST",
  question,
) {
  const operation =
    method === "GET"
      ? "read"
      : assertLegalMutation({
          path,
          method,
          body,
          participants,
          importedDecks,
          question,
        });
  const entry = {
    at: new Date().toISOString(),
    path,
    method,
    operation,
    ...(body !== undefined ? { body } : {}),
  };
  if (method !== "GET") {
    proof.writes.push(entry);
    await checkpoint();
  }
  const response = await fetch(`${base}${path}`, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: {
      "Content-Type": "application/json",
      ...(path.startsWith("/api/") && token
        ? { authorization: `Token ${token}` }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw.slice(0, 1000);
  }
  entry.status = response.status;
  assert.ok(
    response.ok,
    `${method} ${path}: ${response.status} ${JSON.stringify(data).slice(0, 1200)}`,
  );
  return data;
}
const pathFor = (participant, operation) =>
  participant.id
    ? `/chronicle/play/games/${participant.gameId}${operation ? `/${operation}` : ""}?seat=${participant.id}`
    : `/api/v1/arkham/games/${participant.gameId}`;
const snapshot = (participant) => request(pathFor(participant));
function questionFor(current) {
  return protocol.companionQuestion(
    { ...current.game, scenario: scenario(current) },
    current.playerId,
    context,
  );
}
async function saveSnapshot(participant, current, purpose) {
  const bytes = Buffer.from(JSON.stringify(current));
  const filename = `${String(proof.snapshots.length).padStart(5, "0")}-${participant.ordinal ?? 0}-${purpose}.json.gz`;
  const compressed = await compress(bytes);
  await writeFile(resolve(output, "snapshots", filename), compressed, {
    flag: "wx",
    mode: 0o600,
  });
  const entry = {
    file: `snapshots/${filename}`,
    outputDirectory: output,
    gameId: participant.gameId,
    purpose,
    at: new Date().toISOString(),
    snapshotSha256: sha(bytes),
    gzipSha256: sha(compressed),
    phase: current.game.phase,
    gameState: current.game.gameState?.tag,
    questionVersion: current.game.questionVersion,
  };
  proof.snapshots.push(entry);
  return entry;
}
async function archivedSnapshot(witness, gameId, defaultRoot) {
  assert.ok(witness && witness.gameId === gameId);
  const witnessRoot = resolve(witness.outputDirectory || defaultRoot);
  assert.ok(witnessRoot.startsWith(resolve(project, "output") + sep));
  const path = resolve(witnessRoot, witness.file);
  assert.ok(path.startsWith(resolve(witnessRoot, "snapshots") + sep));
  const compressed = await readFile(path);
  assert.equal(sha(compressed), witness.gzipSha256);
  const bytes = await decompress(compressed);
  assert.equal(sha(bytes), witness.snapshotSha256);
  const current = JSON.parse(bytes);
  assert.equal(current.game.id, gameId);
  return current;
}
async function respond(
  participant,
  current,
  question,
  reply,
  reason,
  selected,
) {
  const before = await saveSnapshot(participant, current, "before-answer");
  const trace = {
    number: proof.writes.filter(
      (r) => r.operation === "answer-offered-native-question",
    ).length,
    at: new Date().toISOString(),
    gameId: participant.gameId,
    reason,
    before,
    questionTag: question.tag,
    question: question.raw,
    offeredChoices: question.choices,
    reply,
    ...(selected
      ? {
          selected: {
            answerIndex: selected.answerIndex,
            label: selected.label,
            raw: selected.raw,
          },
        }
      : {}),
  };
  await appendFile(
    resolve(output, "answers.ndjson"),
    JSON.stringify(trace) + "\n",
    { mode: 0o600 },
  );
  await request(
    pathFor(participant, "answer"),
    reply,
    participant.id ? "POST" : "PUT",
    question,
  );
}
async function respondVentNote(participant, current, question, text, reason) {
  const before = await saveSnapshot(participant, current, "before-Vent-note");
  const reply = protocol.buildVentNoteRequest(question, text);
  await appendFile(resolve(output, "answers.ndjson"), JSON.stringify({
    at: new Date().toISOString(), gameId: participant.gameId, reason, before,
    questionTag: question.tag, question: question.raw, reply,
  }) + "\n", {mode: 0o600});
  await request(pathFor(participant, "vent-note"), reply, "POST", question);
}
function conventionalChoice(current, question, setup) {
  const enabled = question.choices.filter((c) => !c.disabled);
  if (question.isPlayerWindow && enabled.length === 1 && enabled[0].tag === "EndTurnButton"
    && enabled[0].raw?.investigatorId === actor(current)?.id)
    return {choice: enabled[0], reason: "End this actor's real native turn when it is the sole enabled response."};
  const automatic = enabled.find((c) => c.tag === "Label" && c.raw?.label === "$label.automaticallyHandleAll");
  if (automatic && question.tag === "ChooseOne" && current.game.phase === "EnemyPhase"
    && enabled.every((c) => c === automatic || c.tag === "TargetLabel"
      && c.raw?.target?.tag === "EnemyTarget" && current.game.enemies?.[c.raw.target.contents]))
    return {choice: automatic, reason: "Use the offered native automatic order for these actual public enemies."};
  if (!question.isPlayerWindow && ["ChooseOne", "ChooseOneAtATime"].includes(question.tag)
    && enabled.length > 0 && enabled.every((c) => c.tag === "TargetLabel"
      && c.raw?.target?.tag === "EnemyTarget" && current.game.enemies?.[c.raw.target.contents])) {
    const threat = (c) => {
      const enemy = current.game.enemies[c.raw.target.contents];
      return Number(enemy.healthDamage || 0) + Number(enemy.sanityDamage || 0);
    };
    const ordered = [...enabled].sort((a, b) => threat(b) - threat(a)
      || a.raw.target.contents.localeCompare(b.raw.target.contents));
    return {choice: ordered[0], reason: "Choose an actual offered public enemy target, using visible attack damage for the effect/order; native resolution remains authoritative."};
  }
  const owner = actor(current), hand = values(owner?.hand).map((c) => c?.contents || c);
  if (!question.isPlayerWindow && question.tag === "ChooseOne") {
    const locationId = owner?.placement?.tag === "AtLocation" ? owner.placement.contents : undefined;
    const location = values(current.game.locations).find((l) => l.id === locationId && l.revealed === true);
    const printed = location && cards.find((definition) => definition.code === code(location));
    const discover = printed && enabled.find((c) => c.tag === "Label"
      && c.label === `Discover Clue at ${printed.name}`);
    if (discover)
      return {choice: discover, reason: "Resolve the actual offered successful investigation at this actor's public location before its printed skill-card bonus; native draw order remains authoritative."};
  }
  const skipOptional = enabled.find((c) => c.tag === "Label" && c.raw?.label === "$label.skip");
  if (!question.isPlayerWindow && question.tag === "ChooseOne" && skipOptional)
    return {choice: skipOptional, reason: "Decline the genuinely offered optional native effect without spending a prerequisite clue."};
  const resourcePenalty = enabled.find((c) => c.tag === "Label"
    && /^Lose [123] resources?$/i.test(c.label));
  if (!question.isPlayerWindow && question.tag === "ChooseOne" && resourcePenalty)
    return {choice: resourcePenalty, reason: "Choose the actual offered printed resource penalty, preserving the own-hand cards; native payment remains authoritative."};
  if (question.tag === "ChooseN" && enabled.length > 0 && enabled.every((c) =>
    /^(Lose 3 resources|Lose 1 action|Discard 1 card at random)$/i.test(c.label))) {
    const loseResources = enabled.find((c) => /^Lose 3 resources$/i.test(c.label));
    const loseAction = enabled.find((c) => /^Lose 1 action$/i.test(c.label));
    return {choice: loseResources || loseAction || enabled[0],
      reason: "Choose an actual printed native encounter penalty; native payment/random discard remains authoritative."};
  }
  if (!question.isPlayerWindow && question.tag === "ChooseOne" && enabled.length > 0
    && enabled.every((c) => c.tag === "TargetLabel" && c.raw?.target?.tag === "CardIdTarget"
      && hand.some((card) => card.id === c.raw.target.contents && card.owner === owner.id))) {
    const ownedAssetCodes = values(current.game.assets).filter((a) => a.controller === owner.id).map(code);
    const duplicate = enabled.find((c) => ownedAssetCodes.includes(code(hand.find((card) => card.id === c.raw.target.contents))));
    return {choice: duplicate || enabled[0], reason: "Choose an actual own-hand card for the offered native discard/hand-limit effect, preferring an already installed asset copy."};
  }
  if (!question.isPlayerWindow && question.tag === "ChooseOne" && enabled.length > 0
    && enabled.every((c) => c.tag === "TargetLabel" && c.raw?.target?.tag === "AssetTarget"
      && current.game.assets?.[c.raw.target.contents]?.controller === owner?.id)) {
    const value = (c) => {
      const asset = current.game.assets[c.raw.target.contents], cardCode = code(asset);
      const printed = cards.find((definition) => definition.code === cardCode);
      return printed?.subtype_code === "story" || printed?.encounter_code || /^700/.test(cardCode)
        ? 1000 : Number(printed?.cost || 0);
    };
    const ordered = [...enabled].sort((a, b) => value(a) - value(b) || a.answerIndex - b.answerIndex);
    return {choice: ordered[0], reason: "Choose an actual controlled physical asset for the native effect, preserving printed story assets and higher-cost equipment."};
  }
  if (setup) {
    const label = enabled.find((c) =>
      /doneWithMulligan|done with mulligan|Follow the foul stench|Confront the retching cat/i.test(
        JSON.stringify(c.raw),
      ),
    );
    if (label)
      return {
        choice: label,
        reason: "Printed standalone introduction / keep legal opening hand.",
      };
  }
  const proceed =
    enabled.find((c) =>
      ["StartSkillTestButton", "SkillTestApplyResultsButton"].includes(c.tag),
    ) ||
    enabled.find((c) =>
      /^(Continue|Proceed|Begin|Finish|Done)\b/i.test(c.label),
    );
  if (question.tag === "Read" && proceed)
    return {
      choice: proceed,
      reason: "Continue the genuine native printed prose.",
    };
  if (setup && proceed)
    return { choice: proceed, reason: "Continue the genuine native setup." };
  if (enabled.length === 1 && !question.isPlayerWindow)
    return {
      choice: enabled[0],
      reason: "The genuine native prompt has one enabled response.",
    };
}
async function setup(participant) {
  const memory = memories.get(participant.gameId) || {};
  memories.set(participant.gameId, memory);
  const select =
    scenarioKind === "barkham"
      ? (await import("./native-scenario-barkham-policy.mjs"))
          .selectBarkhamChoice
      : undefined;
  for (let n = 0; n < 160; n++) {
    const current = await snapshot(participant),
      question = questionFor(current);
    assert.ok(question, "Native setup must offer a real question.");
    if (setupComplete(current)) {
      participant.setupCompleted = true;
      return current;
    }
    let reply, selected;
    if (question.kind === "deck")
      reply = protocol.buildDeckAnswer(question, participant.deckId);
    else if (question.kind === "settings")
      reply = protocol.buildSettingsAnswer(
        question,
        protocol.standaloneSettingsForAnswer(
          question.settings,
          protocol.standaloneSettingsState(question.settings),
        ),
      );
    else {
      selected =
        select?.({ snapshot: current, question, cards, memory }) ||
        conventionalChoice(current, question, true);
      assert.ok(
        selected,
        `No audited setup response for ${question.tag}: ${question.choices.map((c) => c.label).join(" | ")}`,
      );
      reply = protocol.buildChoiceAnswer(question, selected.choice.answerIndex);
    }
    await respond(
      participant,
      current,
      question,
      reply,
      selected?.reason ||
        "Load this run's native-validated legal deck/settings.",
      selected?.choice,
    );
  }
  throw new Error("Bounded native setup did not complete.");
}
async function createBarkham() {
  const built = createNativeScenarioDeck(
    "kate",
    cards,
    `Native legal Kate ${new Date().toISOString()}`,
  );
  proof.decks.push(built);
  const imported = await request("/chronicle/decks", {
    deckName: built.deck.name,
    deckList: built.deck,
  });
  importedDecks.add(imported.id);
  const game = await request("/api/v1/arkham/games", {
    deckIds: [imported.id],
    playerCount: 1,
    campaignId: null,
    scenarioId: ":barkham:022",
    difficulty: "Easy",
    campaignName: built.deck.name,
    multiplayerVariant: "Solo",
    includeTarotReadings: false,
    options: [],
  });
  const participant = {
    gameId: game.id,
    deckId: imported.id,
    investigatorCode: "barkham-004",
    ordinal: 0,
  };
  assert.match(participant.gameId, /^[0-9a-f-]{36}$/);
  participants.push(participant);
  proof.games.push(participant);
  await checkpoint();
  const current = await setup(participant);
  proof.milestones.push({
    name: "fresh-native-Easy-Kate-setup",
    gameId: game.id,
    snapshot: await saveSnapshot(participant, current, "setup-complete"),
  });
  return participant;
}
async function resumeBarkham() {
  const previousPath = resolve(valueOf("--resume-report"));
  assert.ok(previousPath.startsWith(resolve(project, "output") + sep));
  assert.notEqual(
    dirname(previousPath),
    output,
    "Never overwrite the original stopped attempt.",
  );
  const previousBytes = await readFile(previousPath),
    previous = JSON.parse(previousBytes);
  assert.equal(previous.mode, proof.mode);
  assert.equal(previous.scenario, "barkham");
  assert.equal(previous.passed, false);
  assert.equal(previous.wholeScenarioCompleted, false);
  assert.equal(previous.unrelatedSavesUnchanged, true);
  assert.deepEqual(previous.manifest, proof.manifest);
  for (const field of ["binarySha256", "extensionSourceSha256"])
    assert.equal(previous.runtime[field], proof.runtime[field]);
  assert.ok(
    previous.unsupportedDecision || previous.prepared,
    "Only an own legal setup/policy checkpoint can resume.",
  );
  assert.equal(previous.games.length, 1);
  assert.equal(
    previous.scenarioAttempts,
    1,
    "A resume is not a new random scenario attempt.",
  );
  assert.ok(
    (previous.resumeDepth || 0) < 12,
    "Policy checkpoint resumes are finite.",
  );
  const participant = { ...previous.games[0] };
  participants.push(participant);
  importedDecks.add(participant.deckId);
  proof.games.push(participant);
  proof.decks = previous.decks;
  proof.milestones = previous.milestones;
  for (const milestone of proof.milestones) {
    if (!["native-boss-victory-display", "native-printed-Barkham-R1"].includes(milestone.name)) continue;
    const retained = await archivedSnapshot(milestone.snapshot, participant.gameId, dirname(previousPath));
    if (milestone.name === "native-boss-victory-display")
      assert.ok(values(scenario(retained)?.victoryDisplay).some((card) => code(card?.contents || card) === "barkham-037"));
    else {
      const retainedQuestion = questionFor(retained);
      assert.equal(retainedQuestion.tag, "Read");
      assert.match(JSON.stringify(retainedQuestion.raw), /resolution1|resolution 1/i);
    }
  }
  if (previous.strategyMemories?.[participant.gameId])
    memories.set(
      participant.gameId,
      previous.strategyMemories[participant.gameId],
    );
  proof.resumeDepth = (previous.resumeDepth || 0) + 1;
  proof.previousTrace = {
    path: previousPath,
    sha256: sha(previousBytes),
    harnessSha256: previous.harnessSha256,
    previousAnswers:
      previous.cumulativeAnswerCount ||
      previous.writes.filter(
        (entry) => entry.operation === "answer-offered-native-question",
      ).length,
  };
  const witness =
    previous.unsupportedDecision?.snapshot ||
    previous.milestones.findLast(
      (entry) => entry.name === "fresh-native-Easy-Kate-setup",
    )?.snapshot;
  assert.ok(witness && witness.gameId === participant.gameId);
  // The witness may be inherited from a setup checkpoint through another trace.
  const witnessRoot = witness.outputDirectory || dirname(previousPath);
  assert.ok(resolve(witnessRoot).startsWith(resolve(project, "output") + sep));
  const witnessPath = resolve(witnessRoot, witness.file);
  assert.ok(witnessPath.startsWith(resolve(witnessRoot, "snapshots") + sep));
  const stored = await readFile(witnessPath);
  assert.equal(sha(stored), witness.gzipSha256);
  assert.equal(sha(await decompress(stored)), witness.snapshotSha256);
  assert.equal(
    sha(await snapshot(participant)),
    witness.snapshotSha256,
    "The exact stopped native state/question must still be present; never restore a cursor or edit a save.",
  );
  priorFingerprint = await unrelatedFingerprint();
  assert.equal(sha(priorFingerprint), previous.unrelatedBeforeSha256);
  proof.unrelatedBeforeSha256 = previous.unrelatedBeforeSha256;
  await checkpoint();
  return participant;
}
async function playBarkham(participant) {
  const { selectBarkhamChoice } =
    await import("./native-scenario-barkham-policy.mjs");
  const memory = memories.get(participant.gameId) || {};
  memories.set(participant.gameId, memory);
  const deadline = Date.now() + maxMinutes * 60000;
  let bossVictory = proof.milestones.some(
    (entry) => entry.name === "native-boss-victory-display",
  );
  let winningRead = proof.milestones.some(
    (entry) => entry.name === "native-printed-Barkham-R1",
  );
  for (let n = 0; n < maxAnswers && Date.now() < deadline; n++) {
    const current = await snapshot(participant),
      question = questionFor(current);
    const victory = values(scenario(current)?.victoryDisplay);
    const nowVictory = victory.some(
      (card) => code(card?.contents || card) === "barkham-037",
    );
    if (!bossVictory && nowVictory)
      proof.milestones.push({
        name: "native-boss-victory-display",
        snapshot: await saveSnapshot(participant, current, "boss-victory"),
      });
    bossVictory ||= nowVictory;
    if (question?.tag === "Read") {
      const actualResolution = JSON.stringify(question.raw).match(/resolution\s*([12])\b/i);
      if (actualResolution && proof.observedNativeResolution === undefined) {
        proof.observedNativeResolution = Number(actualResolution[1]);
        proof.milestones.push({name: "native-printed-Barkham-resolution", resolution: proof.observedNativeResolution,
          snapshot: await saveSnapshot(participant, current, "printed-resolution")});
      }
    }
    if (
      question?.tag === "Read" &&
      /resolution1|resolution 1/i.test(JSON.stringify(question.raw))
    ) {
      winningRead = true;
      proof.milestones.push({
        name: "native-printed-Barkham-R1",
        snapshot: await saveSnapshot(
          participant,
          current,
          "winning-resolution",
        ),
      });
    }
    if (current.game.gameState?.tag === "IsOver") {
      proof.nativeGameEnded = true;
      proof.milestones.push({
        name: "native-IsOver",
        bossVictory,
        winningRead,
        snapshot: await saveSnapshot(participant, current, "over"),
      });
      assert.ok(
        bossVictory && winningRead,
        "Native completion must be the actual boss victory and printed R1, never defeat/R2.",
      );
      proof.wholeScenarioCompleted = true;
      proof.winningResolution = 1;
      return;
    }
    assert.ok(
      question,
      "A non-ended game must offer an actual native question.",
    );
    const selection =
      selectBarkhamChoice({ snapshot: current, question, cards, memory }) ||
      conventionalChoice(current, question, false);
    if (!selection) {
      proof.unsupportedDecision = {
        gameId: participant.gameId,
        tag: question.tag,
        labels: question.choices.map((c) => c.label),
        snapshot: await saveSnapshot(
          participant,
          current,
          "unsupported-policy",
        ),
      };
      throw new Error(
        `No audited legal play policy for ${question.tag}: ${question.choices.map((c) => c.label).join(" | ")}`,
      );
    }
    await respond(
      participant,
      current,
      question,
      protocol.buildChoiceAnswer(question, selection.choice.answerIndex),
      selection.reason,
      selection.choice,
    );
    await checkpoint();
  }
  throw new Error(
    "Legal play reached its finite action/wall-time bound; no whole-scenario claim.",
  );
}
async function resumeLabyrinth() {
  const previousPath = resolve(valueOf("--resume-report"));
  assert.ok(previousPath.startsWith(resolve(project, "output") + sep));
  assert.notEqual(dirname(previousPath), output);
  const previousBytes = await readFile(previousPath), previous = JSON.parse(previousBytes);
  assert.equal(previous.mode, proof.mode);
  assert.equal(previous.scenario, "labyrinth");
  assert.equal(previous.passed, false);
  assert.equal(previous.wholeScenarioCompleted, false);
  assert.equal(previous.unrelatedSavesUnchanged, true);
  assert.ok(previous.unsupportedDecision || previous.prepared);
  assert.deepEqual(previous.manifest, proof.manifest);
  for (const field of ["binarySha256", "extensionSourceSha256"])
    assert.equal(previous.runtime[field], proof.runtime[field]);
  assert.equal(previous.scenarioAttempts, 1);
  assert.equal(previous.events.length, 1);
  assert.equal(previous.events[0].scenarioId, "70001");
  assert.equal(previous.games.length, 3);
  assert.ok((previous.resumeDepth || 0) < 12);
  assert.equal(previous.stoppedStates.length, 3);
  assertLabyrinthResumeRoster({games: previous.games, stoppedStates: previous.stoppedStates,
    eventId: previous.events[0].id});
  const actualEvent = await request(`/chronicle/epic/events/${previous.events[0].id}`);
  assert.equal(actualEvent.id, previous.events[0].id);
  for (const participant of previous.games) {
    const stored = actualEvent.localSeats.find((seat) => seat.id === participant.id);
    assert.ok(stored);
    for (const field of ["gameId", "ordinal", "seatIndex"])
      assert.equal(stored[field], participant[field]);
  }
  proof.games = previous.games.map((p) => ({...p}));
  participants.push(...proof.games);
  proof.events = previous.events;
  proof.decks = previous.decks;
  proof.milestones = previous.milestones;
  proof.validatedWinningReadGameIds = [];
  for (const milestone of proof.milestones.filter((m) => m.name === "native-printed-Labyrinth-R4")) {
    const participant = participants.find((p) => p.group === milestone.group);
    assert.ok(participant, "An inherited winning Read must belong to an actual A/B/C group.");
    assert.ok(!proof.validatedWinningReadGameIds.includes(participant.gameId), "Duplicate inherited winning Read.");
    const retained = await archivedSnapshot(milestone.snapshot, participant.gameId, dirname(previousPath));
    const retainedQuestion = questionFor(retained);
    assert.equal(retainedQuestion.tag, "Read");
    assert.match(JSON.stringify(retainedQuestion.raw), /resolution4|resolution 4/i);
    proof.validatedWinningReadGameIds.push(participant.gameId);
  }
  proof.resumeDepth = (previous.resumeDepth || 0) + 1;
  proof.previousTrace = {path: previousPath, sha256: sha(previousBytes),
    harnessSha256: previous.harnessSha256, previousAnswers: previous.cumulativeAnswerCount};
  for (const participant of participants) {
    memories.set(participant.gameId, previous.strategyMemories[participant.gameId] || {});
    const witness = previous.stoppedStates.find((s) => s.gameId === participant.gameId);
    assert.ok(witness);
    const witnessRoot = resolve(witness.outputDirectory), witnessPath = resolve(witnessRoot, witness.file);
    assert.ok(witnessRoot.startsWith(resolve(project, "output") + sep));
    assert.ok(witnessPath.startsWith(resolve(witnessRoot, "snapshots") + sep));
    const stored = await readFile(witnessPath);
    assert.equal(sha(stored), witness.gzipSha256);
    assert.equal(sha(await decompress(stored)), witness.snapshotSha256);
    assert.equal(sha(await snapshot(participant)), witness.snapshotSha256,
      "Every exact stopped native seat/question must remain; no save or cursor restoration.");
  }
  priorFingerprint = await unrelatedFingerprint();
  assert.equal(sha(priorFingerprint), previous.unrelatedBeforeSha256);
  proof.unrelatedBeforeSha256 = previous.unrelatedBeforeSha256;
  await checkpoint();
}
try {
  const status = await request("/chronicle/status");
  assert.equal(status.ready, true);
  assert.equal(status.binarySha256, candidate.binarySha256);
  assert.equal(status.extensionSourceSha256, candidate.extensionSourceSha256);
  proof.runtime.statusSha256 = sha(status);
  token = (await request("/chronicle/session")).token;
  const presentation = await request("/chronicle/play/presentation");
  proof.presentationSha256 = sha(presentation);
  const catalog = JSON.parse(
    await readFile(resolve(project, "public/data/catalog.json"), "utf8"),
  );
  cards = (
    await Promise.all(
      catalog.cardFiles.map((path) =>
        readFile(resolve(project, `public${path}`), "utf8").then(JSON.parse),
      ),
    )
  ).flat();
  proof.catalogCardsSha256 = sha(cards);
  const cardMap = new Map(cards.map((card) => [card.code, card]));
  context = {
    card: (id) => cardMap.get(id),
    translate: protocol.companionTranslator(presentation.strings),
    scenarioSettings: (id) => presentation.scenarioSettings[id],
    campaignSettings: (id) => presentation.campaignSettings[id],
    sideStories: presentation.sideStories,
  };
  await bindRunnerSources();
  if (scenarioKind === "labyrinth") {
    const resuming = options.includes("--resume-report");
    if (resuming) await resumeLabyrinth();
    else {
      priorFingerprint = await unrelatedFingerprint();
      proof.unrelatedBeforeSha256 = sha(priorFingerprint);
    }
    const {playFreshLabyrinth} = await import("./native-scenario-labyrinth-run.mjs");
    await playFreshLabyrinth({
      proof, participants, memories, cards, protocol, request, snapshot,
      questionFor, respond, respondVentNote, saveSnapshot, checkpoint, pathFor,
      createNativeScenarioDeck, maxAnswers, maxMinutes, setupOnly, resuming, conventionalChoice,
    });
    if (setupOnly) {
      proof.stoppedStates = [];
      for (const participant of participants)
        proof.stoppedStates.push(await saveSnapshot(participant, await snapshot(participant), "all-seats-prepared"));
    }
  } else {
    let participant;
    if (options.includes("--resume-report")) participant = await resumeBarkham();
    else {
    priorFingerprint = await unrelatedFingerprint();
    proof.unrelatedBeforeSha256 = sha(priorFingerprint);
    participant = await createBarkham();
    }
    if (setupOnly) {
    proof.prepared = true;
    proof.acceptance = "Fresh legal setup only; whole playthrough not run.";
    } else await playBarkham(participant);
  }
  assert.deepEqual(
    await unrelatedFingerprint(),
    priorFingerprint,
    "All unrelated original game/player/step/log rows must remain unchanged.",
  );
  proof.unrelatedSavesUnchanged = true;
  await acceptanceManifest(manifestPath);
  await verifyRunnerSources();
  proof.passed = !setupOnly && proof.wholeScenarioCompleted;
} catch (error) {
  primaryError = error;
  proof.failure = { message: error.message, stack: error.stack };
  if (scenarioKind === "labyrinth" && proof.unsupportedDecision) {
    try {
      proof.stoppedStates = [];
      for (const participant of participants)
        proof.stoppedStates.push(await saveSnapshot(participant, await snapshot(participant), "all-seats-stopped"));
    } catch (captureError) { proof.failureCaptureError = captureError.message; }
  }
  if (priorFingerprint) {
    try {
      proof.unrelatedSavesUnchanged =
        sha(await unrelatedFingerprint()) === sha(priorFingerprint);
    } catch (captureError) {
      proof.failureCaptureError = captureError.message;
    }
  }
} finally {
  proof.finishedAt = new Date().toISOString();
  proof.cumulativeAnswerCount =
    (proof.previousTrace?.previousAnswers || 0) +
    proof.writes.filter(
      (entry) => entry.operation === "answer-offered-native-question",
    ).length;
  await checkpoint();
}
if (primaryError) {
  console.error(primaryError.message);
  process.exitCode = 1;
} else
  console.log(
    JSON.stringify({
      passed: proof.passed,
      prepared: proof.prepared,
      wholeScenarioCompleted: proof.wholeScenarioCompleted,
      report: resolve(output, "report.json"),
    }),
  );
