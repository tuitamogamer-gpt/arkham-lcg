#!/usr/bin/env node
/** Capture/verify the six full-harness QA saves across a managed restart,
 * optionally including the five passed fresh Barkham saves.
 * This script starts no services and sends only GETs plus read-only SQL.
 * Bridge seat authentication can warm its cache and set beta=true on QA users;
 * users/authentication are outside the game/coordinator persistence comparison.
 * Event dashboard GETs are deliberately avoided: they can expire a timer.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, realpath } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptanceManifest, nativeQaKind } from "./rules-qa-runtime-identity.mjs";

if (process.argv.includes("--help")) {
  console.log(`EPIC_QA_CONFIRMED=1 node scripts/epic-persistence-check.mjs --baseline|--verify
Required: EPIC_REPORT=<passed full epic-runtime-check report>, ARKHAM_RULES_DATA_DIR=<isolated output directory>, ARKHAM_RULES_URL=<loopback bridge>, ARKHAM_RULES_PG_PORT, and ARKHAM_RULES_QA_MANIFEST (or ARKHAM_RULES_RUNTIME).
Optional: QA_OUT=output/epic-persistence, ARKHAM_RULES_PSQL, BARKHAM_REPORT=<passed fresh isolated native report>.
BARKHAM_REPORT includes five complete Barkham saves alongside the exact two Epic events / six games; provide the same report for baseline and verify.
Run --baseline after full acceptance, close other QA clients, then let the managed launcher stop/restart the SAME isolated data directory and run --verify with the SAME arguments. Verification requires a new PostgreSQL start time. Existing baseline evidence is never overwritten. No event dashboard, answers, timer operations, or service controls are used. Bridge auth warm-up may set beta=true on QA users; authoritative saves remain read-only.`);
  process.exit(0);
}
assert.equal(process.env.EPIC_QA_CONFIRMED, "1", "Confirm isolated candidate QA first.");
const modes = process.argv.slice(2);
assert.ok(
  modes.length === 1 && ["--baseline", "--verify"].includes(modes[0]),
  "Choose exactly --baseline or --verify.",
);
const mode = modes[0].slice(2),
  project = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  output = resolve(process.env.QA_OUT || resolve(project, "output/epic-persistence")),
  uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  hash = /^[a-f0-9]{64}$/,
  extensions = ["barkham", "epic-labyrinth", "epic-machinations"].sort(),
  sha = (value) => createHash("sha256").update(value).digest("hex"),
  canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
        : value,
  digest = (value) => sha(JSON.stringify(canonical(value))),
  runFile = promisify(execFile),
  required = (name) => {
    assert.ok(process.env[name], `Provide ${name} explicitly for isolated QA.`);
    return process.env[name];
  },
  reportPath = resolve(required("EPIC_REPORT")),
  barkhamReportPath = process.env.BARKHAM_REPORT && resolve(process.env.BARKHAM_REPORT),
  dataDir = await realpath(required("ARKHAM_RULES_DATA_DIR")),
  outputRoot = await realpath(resolve(project, "output")),
  pgData = await realpath(resolve(dataDir, "pgdata")),
  service = new URL(required("ARKHAM_RULES_URL")),
  pgPort = required("ARKHAM_RULES_PG_PORT"),
  manifestPath = resolve(
    process.env.ARKHAM_RULES_QA_MANIFEST ||
      resolve(required("ARKHAM_RULES_RUNTIME"), "chronicle-runtime.json"),
  ),
  baselinePath = resolve(output, "baseline.json");
assert.ok(dataDir.startsWith(outputRoot + sep), "QA data must be under this project's output directory.");
assert.notEqual(dataDir, resolve(outputRoot, "rules-server"), "The real QA saves are not an isolated data directory.");
assert.ok(pgData.startsWith(dataDir + sep), "The isolated pgdata must not link outside its data directory.");
assert.ok(["127.0.0.1", "localhost"].includes(service.hostname));
assert.equal(service.protocol, "http:");
assert.equal(service.username + service.password + service.search + service.hash, "");
assert.equal(service.pathname, "/");
assert.ok(service.port, "Use an explicit isolated bridge port.");
assert.ok(/^\d+$/.test(pgPort) && Number(pgPort) >= 1024 && Number(pgPort) <= 65535);

const proof = {
  schema: 1,
  mode,
  startedAt: new Date().toISOString(),
  ...(mode === "baseline" ? { captured: false } : { passed: false }),
  scope: { dataDir, pgData, service: service.origin, pgPort: Number(pgPort), events: 2,
    games: barkhamReportPath ? 11 : 6,
    ...(barkhamReportPath ? { epicGames: 6, barkhamGames: 5 } : {}),
  },
  authentication: "Bridge GETs can warm seat authentication and set beta=true on QA users; user rows are outside save comparisons.",
  timers: "Compare every stored timer/state field exactly. Elapsed wall time is observational and is never applied or normalized into saves.",
};
let seats = [], events = [], barkhamGames = [], expected;
const privateWrite = (path, value, flag = "wx") =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag });
async function get(path) {
  const response = await fetch(new URL(path, service), {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `QA bridge GET ${path} must succeed.`);
  return response.json();
}
const runtimeIdentity = (status) => ({
  version: status.version,
  binarySha256: status.binarySha256,
  extensionSourceSha256: status.extensionSourceSha256,
  sourceHash: status.sourceHash,
  extensions: [...status.extensions].sort(),
});
async function readRuntime() {
  const status = await get("/chronicle/status");
  assert.equal(status.ready, true, "Runtime readiness alone does not prove saves survived.");
  assert.deepEqual([...status.extensions].sort(), extensions);
  for (const key of ["binarySha256", "extensionSourceSha256"]) {
    assert.match(status[key], hash);
    assert.equal(status[key], expected[key], `Connected candidate ${key} must match the expected manifest.`);
  }
  return { ready: true, ...runtimeIdentity(status) };
}
let psql;
async function sql(command) {
  if (!psql) {
    const candidates = [
      process.env.ARKHAM_RULES_PSQL,
      process.env.ARKHAM_RULES_RUNTIME && resolve(process.env.ARKHAM_RULES_RUNTIME, "pgsql/bin/psql"),
      resolve(dirname(manifestPath), "pgsql/bin/psql"),
    ].filter(Boolean);
    for (const candidate of candidates) {
      try { psql = await realpath(candidate); break; } catch {}
    }
    assert.ok(psql, "Provide the candidate's local ARKHAM_RULES_PSQL.");
  }
  try {
    const result = await runFile(psql, [
      "--no-psqlrc", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", pgPort,
      "-U", "arkham_chronicle", "-d", "arkham_chronicle", "-v", "ON_ERROR_STOP=1", "-c", command,
    ], {
      env: { ...process.env, PGOPTIONS: `${process.env.PGOPTIONS || ""} -c default_transaction_read_only=on -c statement_timeout=20000` },
      timeout: 30000, maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(result.stdout.trim());
  } catch {
    throw new Error("Read-only isolated QA SQL failed; check the configured database and migrations privately.");
  }
}
function eventQuery(event) {
  const id = `'${event.id}'::uuid`,
    ids = event.games.map(({ gameId }) => `'${gameId}'::uuid`).join(","),
    coordinator = event.scenarioId === "70001" ? "chronicle_labyrinth_events" : "chronicle_machinations_events",
    journal = coordinator.replace(/_events$/, "_journal");
  // Full coordinator/event rows plus all-row fingerprints cover data hidden by
  // PublicGame (queues, undo patches, logs, journal, membership, and undo floors).
  return `jsonb_build_object(
    'event', (SELECT to_jsonb(e) FROM arkham_epic_events e WHERE e.id=${id}),
    'groups', (SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.ordinal),'[]'::jsonb) FROM arkham_epic_groups g WHERE g.arkham_epic_event_id=${id}),
    'coordinator', (SELECT to_jsonb(c) FROM ${coordinator} c WHERE c.event_id=${id}),
    'games', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'step',g.step,'md5',md5(to_jsonb(g)::text)) ORDER BY g.id),'[]'::jsonb) FROM arkham_games g WHERE g.id IN (${ids})),
    'players', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb) FROM arkham_players p WHERE p.arkham_game_id IN (${ids})),
    'steps', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'gameId',s.arkham_game_id,'step',s.step,'md5',md5(to_jsonb(s)::text)) ORDER BY s.arkham_game_id,s.step,s.id),'[]'::jsonb) FROM arkham_steps s WHERE s.arkham_game_id IN (${ids})),
    'logs', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'md5',md5(to_jsonb(l)::text)) ORDER BY l.id),'[]'::jsonb) FROM arkham_log_entries l WHERE l.arkham_game_id IN (${ids})),
    'undoFloors', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.arkham_game_id),'[]'::jsonb) FROM arkham_game_undo_floors f WHERE f.arkham_game_id IN (${ids})),
    'members', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]'::jsonb) FROM arkham_epic_members m WHERE m.arkham_epic_event_id=${id}),
    'epicSteps', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'step',s.step,'md5',md5(to_jsonb(s)::text)) ORDER BY s.step,s.id),'[]'::jsonb) FROM arkham_epic_steps s WHERE s.arkham_epic_event_id=${id}),
    'journal', (SELECT coalesce(jsonb_agg(jsonb_build_object('originGameId',j.origin_game_id,'originStep',j.origin_step,'md5',md5(to_jsonb(j)::text)) ORDER BY j.origin_game_id,j.origin_step),'[]'::jsonb) FROM ${journal} j WHERE j.event_id=${id})
  )`;
}
function barkhamQuery() {
  const ids = barkhamGames.map(({ gameId }) => `'${gameId}'::uuid`).join(",");
  // Hash every complete row, including queues, undo patches and private state;
  // public snapshots alone do not cover the native save/history tables.
  return `jsonb_build_object(
    'games', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'step',g.step,'md5',md5(to_jsonb(g)::text)) ORDER BY g.id),'[]'::jsonb) FROM arkham_games g WHERE g.id IN (${ids})),
    'players', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb) FROM arkham_players p WHERE p.arkham_game_id IN (${ids})),
    'steps', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'gameId',s.arkham_game_id,'step',s.step,'md5',md5(to_jsonb(s)::text)) ORDER BY s.arkham_game_id,s.step,s.id),'[]'::jsonb) FROM arkham_steps s WHERE s.arkham_game_id IN (${ids})),
    'logs', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'md5',md5(to_jsonb(l)::text)) ORDER BY l.id),'[]'::jsonb) FROM arkham_log_entries l WHERE l.arkham_game_id IN (${ids})),
    'undoFloors', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.arkham_game_id),'[]'::jsonb) FROM arkham_game_undo_floors f WHERE f.arkham_game_id IN (${ids}))
  )`;
}
const saveDatabase = (data) => barkhamReportPath
  ? { events: data.events, barkham: data.barkham }
  : data.events;
function authenticatedInvestigator(snapshot, player) {
  const databaseId = player.investigator_id;
  // InvestigatorId's public wire form prefixes printed codes with "c";
  // arkham_players stores their raw codes. Only these known code grammars may
  // use that encoding equivalence. UUIDs and other identifiers stay exact.
  const encodedId = /^(?:\d{5}|:barkham:\d{3})$/.test(databaseId)
    ? `c${databaseId}` : databaseId;
  const matches = Object.values(snapshot.game.investigators || {}).filter(
    (investigator) => investigator.id === databaseId || investigator.id === encodedId,
  );
  assert.equal(matches.length, 1, "The authenticated player's exact native investigator must be in this game.");
  assert.equal(matches[0].playerId, snapshot.playerId, "The native investigator must retain its authenticated player UUID.");
  return matches[0];
}
async function database() {
  const data = await sql(`SELECT jsonb_build_object(
    'identity', jsonb_build_object('dataDirectory',current_setting('data_directory'),'database',current_database(),'port',current_setting('port'),'readOnly',current_setting('transaction_read_only'),'serverStartedAt',pg_postmaster_start_time()),
    'events',jsonb_build_array(${events.map(eventQuery).join(",")})
    ${barkhamReportPath ? `,'barkham',${barkhamQuery()}` : ""}
  )::text`);
  assert.equal(await realpath(data.identity.dataDirectory), pgData, "SQL must read this exact isolated pgdata.");
  assert.equal(data.identity.database, "arkham_chronicle");
  assert.equal(Number(data.identity.port), Number(pgPort));
  assert.equal(data.identity.readOnly, "on");
  for (let i = 0; i < events.length; i++) {
    const source = events[i], stored = data.events[i];
    assert.equal(stored.event?.id, source.id);
    assert.equal(stored.event.scenario_id, source.scenarioId);
    assert.equal(stored.event.name, source.name, "The full report must identify these new QA events.");
    assert.equal(stored.coordinator?.event_id, source.id, "A durable coordinator row must exist.");
    assert.deepEqual(stored.groups.map((group) => ({ gameId: group.arkham_game_id, ordinal: group.ordinal })), source.games);
    assert.equal(stored.games.length, 3);
    assert.equal(stored.players.length, 3);
    for (const game of source.games) {
      assert.ok(stored.games.some((row) => row.id === game.gameId));
      assert.equal(stored.players.filter((player) => player.arkham_game_id === game.gameId).length, 1);
    }
  }
  if (barkhamReportPath) {
    assert.equal(data.barkham.games.length, 5);
    assert.equal(data.barkham.players.length, 5);
    for (const game of barkhamGames) {
      assert.ok(data.barkham.games.some((row) => row.id === game.gameId), "Every Barkham save must exist in this isolated database.");
      const players = data.barkham.players.filter((player) => player.arkham_game_id === game.gameId);
      assert.equal(players.length, 1, "Every passed fresh Barkham save must retain its sole native player.");
      assert.equal(players[0].investigator_id, game.investigatorCode.replace("barkham-", ":barkham:"));
    }
  }
  return data;
}
async function capture() {
  const runtime = await readRuntime(), before = await database(), snapshots = [], barkhamSnapshots = [];
  for (const seat of seats) {
    const snapshot = await get(`/chronicle/play/games/${seat.gameId}?seat=${seat.id}`),
      stored = before.events.find((entry) => entry.event.id === seat.eventId),
      player = stored.players.find((row) => row.arkham_game_id === seat.gameId);
    assert.ok(snapshot.game && typeof snapshot.game === "object");
    assert.equal(snapshot.game.id, seat.gameId);
    assert.equal(snapshot.eventId, seat.eventId);
    assert.equal(snapshot.playerId, player.id, "The correct local seat must authenticate its native player.");
    const investigator = authenticatedInvestigator(snapshot, player);
    const question = snapshot.game.question?.[snapshot.playerId] ?? null;
    snapshots.push({
      eventId: seat.eventId, scenarioId: seat.scenarioId, ordinal: seat.ordinal,
      gameId: seat.gameId, seatId: seat.id, seatIndex: seat.seatIndex,
      playerId: snapshot.playerId, investigatorId: player.investigator_id,
      publicInvestigatorId: investigator.id, investigatorPlayerId: investigator.playerId,
      gameSha256: digest(snapshot.game), snapshotSha256: digest(snapshot),
      questionsSha256: digest(snapshot.game.question ?? null),
      ownQuestionSha256: digest(question), ownQuestionPresent: question !== null,
      phase: snapshot.game.phase, scenarioSteps: snapshot.game.scenarioSteps,
      databaseStep: stored.games.find((game) => game.id === seat.gameId).step,
      snapshot,
    });
  }
  for (const source of barkhamGames) {
    // These standalone games use the bridge's original default session, exactly
    // as the fresh Barkham harness does; Epic seat credentials do not apply.
    const snapshot = await get(`/chronicle/play/games/${source.gameId}`),
      step = await get(`/chronicle/play/games/${source.gameId}/step`),
      player = before.barkham.players.find((row) => row.arkham_game_id === source.gameId),
      storedGame = before.barkham.games.find((row) => row.id === source.gameId);
    assert.ok(snapshot.game && typeof snapshot.game === "object");
    assert.equal(snapshot.game.id, source.gameId);
    assert.equal(snapshot.playerId, player.id, "The original Barkham session must authenticate its native player.");
    const investigator = authenticatedInvestigator(snapshot, player);
    assert.equal(step.step, storedGame.step, "Public and durable Barkham steps must agree.");
    const question = snapshot.game.question?.[snapshot.playerId] ?? null;
    barkhamSnapshots.push({
      gameId: source.gameId, investigatorCode: source.investigatorCode,
      playerId: snapshot.playerId, investigatorId: player.investigator_id,
      publicInvestigatorId: investigator.id, investigatorPlayerId: investigator.playerId,
      gameSha256: digest(snapshot.game), snapshotSha256: digest(snapshot),
      questionsSha256: digest(snapshot.game.question ?? null),
      ownQuestionSha256: digest(question), ownQuestionPresent: question !== null,
      phase: snapshot.game.phase, scenarioSteps: snapshot.game.scenarioSteps,
      databaseStep: storedGame.step, publicStep: step.step,
      snapshot,
    });
  }
  const after = await database();
  assert.equal(digest(saveDatabase(after)), digest(saveDatabase(before)), "All selected save state must stay quiescent throughout capture; close other QA clients.");
  assert.equal(after.identity.serverStartedAt, before.identity.serverStartedAt);
  assert.deepEqual(await readRuntime(), runtime);
  const observedAt = new Date().toISOString(), nowEpoch = Math.floor(Date.now() / 1000),
    timerObservations = after.events.map(({ event }) => {
      const counters = event.shared_state?.sharedCounters || {},
        startedAt = Number(counters["timer-started-at"] || 0),
        limitSeconds = Number(counters["time-limit-minutes"] || 0) * 60;
      return { eventId: event.id, observedAt, startedAt, limitSeconds,
        elapsedByWallClock: startedAt > 0 && limitSeconds > 0 && nowEpoch >= startedAt + limitSeconds };
    });
  return { observedAt, runtime, database: after, databaseSha256: digest(saveDatabase(after)), timerObservations, seats: snapshots,
    ...(barkhamReportPath ? { barkhamGames: barkhamSnapshots } : {}),
  };
}

await mkdir(output, { recursive: true, mode: 0o700 });
try {
  const reportBytes = await readFile(reportPath), source = JSON.parse(reportBytes),
    manifestBytes = await readFile(manifestPath);
  expected = await acceptanceManifest(manifestPath);
  assert.equal(source.passed, true, "Use a passed full Epic harness report, not a table seed or arbitrary saves.");
  assert.equal(source.mode, undefined, "Table preparation is not full acceptance.");
  assert.equal(expected.schema, 1);
  assert.equal(expected.upstreamRevision, "03a7f1e74925744f021f6e8fe0e39945d2c3a833");
  assert.deepEqual([...expected.extensions].sort(), extensions);
  assert.deepEqual([...source.runtime.extensions].sort(), extensions);
  for (const key of ["binarySha256", "extensionSourceSha256"]) {
    assert.match(expected[key], hash);
    assert.equal(source.runtime[key], expected[key], `Full QA ${key} must match the expected aggregate.`);
  }
  assert.equal(source.events.length, 2);
  assert.deepEqual(source.events.map((event) => event.scenarioId).sort(), ["70001", "87001"]);
  events = source.events.map((event) => {
    assert.ok(uuid.test(event.id));
    assert.ok(event.name.startsWith(`Chronicle Epic native QA ${event.scenarioId} `), "Only full-harness-created QA events qualify.");
    const games = event.games.map(({ gameId, ordinal }) => ({ gameId, ordinal })).sort((a, b) => a.ordinal - b.ordinal);
    assert.deepEqual(games.map((game) => game.ordinal), [0, 1, 2]);
    for (const game of games) assert.ok(uuid.test(game.gameId));
    return { id: event.id, name: event.name, scenarioId: event.scenarioId, games };
  }).sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  assert.equal(new Set(events.map((event) => event.id)).size, 2);
  assert.equal(new Set(events.flatMap((event) => event.games.map((game) => game.gameId))).size, 6);
  for (const event of events) {
    // Private credential files are read only to select public seat bindings.
    // Credentials are never copied into the persistence evidence or errors.
    const local = JSON.parse(await readFile(resolve(dataDir, "epic-seats", `${event.id}.json`), "utf8"));
    assert.equal(local.length, 3);
    for (const game of event.games) {
      const matches = local.filter((seat) => seat.gameId === game.gameId && seat.ordinal === game.ordinal);
      assert.equal(matches.length, 1);
      const seat = matches[0];
      assert.ok(uuid.test(seat.id));
      assert.equal(seat.eventId, event.id);
      assert.equal(seat.seatIndex, 0);
      seats.push({ id: seat.id, eventId: event.id, scenarioId: event.scenarioId, gameId: game.gameId, ordinal: game.ordinal, seatIndex: seat.seatIndex });
    }
  }
  assert.equal(new Set(seats.map((seat) => seat.id)).size, 6);
  proof.source = { path: reportPath, sha256: sha(reportBytes), events };
  if (barkhamReportPath) {
    const bytes = await readFile(barkhamReportPath), barkham = JSON.parse(bytes);
    assert.equal(expected.kind, nativeQaKind, "Combined Barkham persistence requires the verified private native aggregate.");
    assert.equal(expected.scope, "native-acceptance");
    assert.equal(expected.capabilityCertified, false);
    assert.equal(barkham.schema, 1);
    assert.equal(barkham.mode, "fresh-isolated");
    assert.equal(barkham.passed, true, "Use a passed fresh Barkham report, never a verification report or arbitrary saves.");
    assert.equal(barkham.scope, "native-acceptance");
    assert.deepEqual(barkham.candidate, { kind: nativeQaKind, platform: "linux", capabilityCertified: false });
    for (const key of ["binarySha256", "extensionSourceSha256"])
      assert.equal(barkham[key], expected[key], `Barkham QA ${key} must match the same aggregate as Epic QA.`);
    assert.equal(barkham.checks.length, 5);
    assert.deepEqual(barkham.checks.map((check) => check.investigatorCode).sort(),
      ["barkham-001", "barkham-004", "barkham-007", "barkham-010", "barkham-013"]);
    barkhamGames = barkham.checks.map(({ gameId, investigatorCode, savedRefetch }) => {
      assert.ok(uuid.test(gameId));
      assert.equal(savedRefetch, true, "Each fresh Barkham game must have passed its original saved-state refetch.");
      return { gameId, investigatorCode };
    }).sort((a, b) => a.investigatorCode.localeCompare(b.investigatorCode));
    assert.equal(new Set(barkhamGames.map((game) => game.gameId)).size, 5);
    assert.equal(new Set([...seats, ...barkhamGames].map((game) => game.gameId)).size, 11,
      "The five Barkham saves must be distinct from the six Epic saves.");
    proof.barkhamSource = { path: barkhamReportPath, sha256: sha(bytes), games: barkhamGames };
  }
  proof.candidate = { path: manifestPath, sha256: sha(manifestBytes), kind: expected.kind,
    ...(expected.scope ? { scope: expected.scope, platform: expected.platform, capabilityCertified: false } : {}), binarySha256: expected.binarySha256,
    extensionSourceSha256: expected.extensionSourceSha256, extensions };
  let baseline;
  if (mode === "verify") {
    baseline = JSON.parse(await readFile(baselinePath, "utf8"));
    assert.equal(baseline.schema, 1);
    assert.equal(baseline.mode, "baseline");
    assert.equal(baseline.captured, true);
    assert.deepEqual(baseline.scope, proof.scope);
    assert.deepEqual(baseline.source, proof.source);
    assert.deepEqual(baseline.barkhamSource, proof.barkhamSource);
    assert.deepEqual(baseline.candidate, proof.candidate);
    assert.equal(digest(saveDatabase(baseline.capture.database)), baseline.capture.databaseSha256);
    assert.equal(baseline.capture.seats.length, 6);
    if (barkhamReportPath) assert.equal(baseline.capture.barkhamGames.length, 5);
    for (const seat of [...baseline.capture.seats, ...(baseline.capture.barkhamGames || [])]) {
      const snapshot = JSON.parse(await readFile(resolve(output, `baseline-${seat.gameId}.json`), "utf8"));
      assert.equal(digest(snapshot), seat.snapshotSha256, "Saved baseline snapshot must match its proof.");
      assert.equal(digest(snapshot.game), seat.gameSha256);
    }
  } else {
    try { await readFile(baselinePath); assert.fail("Use a fresh QA_OUT; baseline evidence already exists."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const current = await capture();
  for (const seat of [...current.seats, ...(current.barkhamGames || [])]) {
    await privateWrite(resolve(output, `${mode}-${seat.gameId}.json`), seat.snapshot);
    delete seat.snapshot;
  }
  proof.capture = current;
  if (mode === "baseline") proof.captured = true;
  else {
    assert.ok(Date.parse(current.database.identity.serverStartedAt) > Date.parse(baseline.capture.database.identity.serverStartedAt), "A managed PostgreSQL restart must occur between baseline and verify.");
    proof.restartObserved = true;
    assert.deepEqual(current.runtime, baseline.capture.runtime, "Runtime identity must match independently of save persistence.");
    proof.runtimeMatched = true;
    assert.equal(current.databaseSha256, baseline.capture.databaseSha256, "Every authoritative game/coordinator/history row must survive exactly.");
    assert.deepEqual(current.seats, baseline.capture.seats, "All six full game snapshots, seat players, and current questions must survive exactly.");
    if (barkhamReportPath) assert.deepEqual(current.barkhamGames, baseline.capture.barkhamGames,
      "All five full Barkham snapshots, original players, current questions and durable/public steps must survive exactly.");
    proof.savesMatched = true;
    proof.passed = true;
  }
  proof.finishedAt = new Date().toISOString();
  await privateWrite(resolve(output, `${mode}.json`), proof);
  const saves = barkhamReportPath ? "eleven complete saves (six Epic and five Barkham)" : "six complete Epic saves";
  console.log(mode === "baseline"
    ? `Persistence baseline captured: ${saves}; ${baselinePath}`
    : `Restart persistence verified: same aggregate runtime and ${saves}; ${resolve(output, "verify.json")}`);
} catch (error) {
  // Do not serialize HTTP bodies, private seat records, or execFile stderr.
  proof.error = String(error.message || error);
  proof.finishedAt = new Date().toISOString();
  await privateWrite(resolve(output, `${mode}-failure-${Date.now()}.json`), proof);
  console.error(proof.error);
  process.exitCode = 1;
}
