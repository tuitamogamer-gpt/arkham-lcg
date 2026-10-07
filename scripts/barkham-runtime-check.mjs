import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptanceManifest, nativeQaKind } from "./rules-qa-runtime-identity.mjs";

if (process.argv.includes("--help")) {
  console.log(`node scripts/barkham-runtime-check.mjs [--verify-existing]
Default mode retains historical integration-save checks and creates five Barkham games.
For fresh isolated Linux QA, set ARKHAM_RULES_QA_MANIFEST, ARKHAM_RULES_URL and explicit QA_OUT under this project's output directory. The actual aggregate proof and running binary/source identities are verified; no historical saves are claimed.
After a managed restart of the same private data directory, use --verify-existing with BARKHAM_REPORT=<passed fresh report> and a separate explicit QA_OUT. This mode sends only GET requests and verifies the five saved resource/action/sniff/treat states; it starts no services or games.`);
  process.exit(0);
}
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === "--verify-existing"), "Use only the optional --verify-existing mode.");
const verifyExisting = args[0] === "--verify-existing";
const qaManifestPath = process.env.ARKHAM_RULES_QA_MANIFEST;
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const base = process.env.ARKHAM_RULES_URL || "http://127.0.0.1:5194";
const output = process.env.QA_OUT || "output/barkham-runtime";
let candidate;
if (qaManifestPath) {
  assert.ok(process.env.QA_OUT, "Provide an explicit isolated QA_OUT for native QA.");
  assert.ok(process.env.ARKHAM_RULES_URL, "Provide the explicit isolated QA bridge URL.");
  const outputPath = resolve(output), outputRoot = resolve(project, "output");
  assert.ok(outputPath.startsWith(outputRoot + sep), "Native QA output must remain under this project's output directory.");
  for (const reserved of ["rules-server", "barkham-runtime"])
    assert.ok(outputPath !== resolve(outputRoot, reserved) && !outputPath.startsWith(resolve(outputRoot, reserved) + sep), "Use a separate isolated native QA output directory.");
  const service = new URL(base);
  assert.ok(["127.0.0.1", "localhost"].includes(service.hostname));
  assert.equal(service.protocol, "http:");
  assert.equal(service.username + service.password + service.search + service.hash, "");
  assert.equal(service.pathname, "/");
  assert.ok(service.port, "Use an explicit isolated bridge port.");
  candidate = await acceptanceManifest(resolve(qaManifestPath));
}
if (verifyExisting) {
  assert.ok(qaManifestPath, "Read-only native QA verification requires ARKHAM_RULES_QA_MANIFEST.");
  assert.ok(process.env.BARKHAM_REPORT, "Provide the passed fresh Barkham report in BARKHAM_REPORT.");
  assert.notEqual(resolve(output), dirname(resolve(process.env.BARKHAM_REPORT)), "Use a separate verification QA_OUT to preserve the original report.");
}
await mkdir(output, { recursive: true });
const statusResponse = await fetch(`${base}/chronicle/status`);
assert.ok(statusResponse.ok, "Runtime status must load.");
const status = await statusResponse.json();
assert.match(status.version, candidate?.kind === nativeQaKind
  ? /^Private Linux native acceptance/
  : /^Chronicle \+ Barkham/);
if (candidate) {
  assert.equal(status.ready, true);
  assert.equal(status.binarySha256, candidate.binarySha256, "Running native binary must match the verified QA aggregate.");
  assert.equal(status.extensionSourceSha256, candidate.extensionSourceSha256, "Running native source must match the verified QA aggregate.");
  assert.deepEqual([...status.extensions].sort(), [...candidate.extensions].sort());
  if (candidate.kind === nativeQaKind) {
    assert.equal(status.runtimeScope, "native-acceptance");
    assert.equal(status.platform, "linux");
  }
}
const expected = Array.from({ length: 57 }, (_, i) => `barkham-${String(i + 1).padStart(3, "0")}`);
assert.ok(expected.every(code => status.supportedCardCodes.includes(code)), "all 57 full cards registered");
const { token } = await (await fetch(`${base}/chronicle/session`)).json();
async function api(path, body, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(`${base}/api/v1/${path}`, {
    method,
    headers: { authorization: `Token ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 300); }
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}
const manifest = JSON.parse(await readFile("public/data/catalog.json", "utf8"));
const cards = (await Promise.all(manifest.cardFiles.map(async path => JSON.parse(await readFile(`public${path}`, "utf8"))))).flat();
function deckFixture(code, faction, signatures) {
  const names = new Set();
  const pool = cards.filter(card => card.pack_code === "core" && [faction, "neutral"].includes(card.faction_code)
    && ["asset", "event", "skill"].includes(card.type_code) && card.xp === 0
    && !card.subtype_code && !card.restrictions && !card.hidden && !card.permanent
    && (code !== "barkham-013" || !/cat|doyle|hope|augur|zeal/i.test(card.name))
    && !names.has(card.name) && names.add(card.name));
  assert.ok(pool.length >= 15, `${code} has enough distinct level-zero fixture cards`);
  const slots = Object.fromEntries(pool.slice(0, 15).map(card => [card.code, 2]));
  for (const signature of signatures) slots[signature] = 1;
  const weakness = cards.find(card => card.pack_code === "core" && card.name === "Amnesia");
  slots[weakness.code] = 1;
  return { name: `Chronicle Barkham QA ${code}`, investigator_code: code, slots,
    meta: { chronicle_barkham_judgments: JSON.stringify({ artworkReviewed: true, eligibleOffClassCards: [], catCards: [] }) } };
}
function question(snapshot) {
  let q = snapshot.game.question[snapshot.playerId];
  while (q?.tag === "QuestionLabel") q = q.question;
  return q;
}
function choices(q) {
  return q?.choices || q?.readChoices?.contents || [];
}
async function answer(snapshot, choice) {
  return api(`arkham/games/${snapshot.game.id}`, { tag: "Answer", contents: {
    choice, playerId: snapshot.playerId,
    ...(typeof snapshot.game.questionVersion === "number" ? { questionVersion: snapshot.game.questionVersion } : {}),
  } }, "PUT");
}
async function getGame(id) { return api(`arkham/games/${id}`); }
async function importDeck(deck) {
  const response = await fetch(`${base}/chronicle/decks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deckName: deck.name, deckList: deck }) });
  const data = await response.json();
  assert.ok(response.ok, `deck import: ${response.status} ${JSON.stringify(data)}`);
  return data.id;
}
async function setup(deck, deckId) {
  const created = await api("arkham/games", { deckIds: [deckId], playerCount: 1, campaignId: null, scenarioId: ":barkham:022", difficulty: "Standard", campaignName: deck.name, multiplayerVariant: "Solo", includeTarotReadings: false, options: [] });
  const id = created.id;
  assert.ok(id);
  const trace = [];
  for (let step = 0; step < 25; step++) {
    const snapshot = await getGame(id);
    const q = question(snapshot);
    if (snapshot.game.phase === "InvestigationPhase" && q?.tag === "PlayerWindowChooseOne") return { snapshot, trace };
    trace.push({ phase: snapshot.game.phase, tag: q?.tag, labels: choices(q).map(c => c.label || c.tag) });
    await writeFile(`${output}/setup-trace.json`, JSON.stringify({ gameId: id, trace }, null, 2));
    if (q?.tag === "ChooseDeck") {
      await api(`arkham/games/${id}`, { tag: "DeckAnswer", deckId, playerId: snapshot.playerId, overlay: null }, "PUT");
    } else {
      const options = choices(q);
      assert.ok(options.length, `unsupported setup question ${JSON.stringify(q).slice(0, 800)}`);
      const done = options.findIndex(c => /doneWithMulligan|continue|done|startGame/i.test(c.label || ""));
      await answer(snapshot, done < 0 ? 0 : done);
    }
  }
  throw new Error(`Setup did not reach investigation for ${id}.`);
}
function investigator(snapshot) { return Object.values(snapshot.game.investigators)[0]; }
function tokenCount(entity, name) {
  return Array.isArray(entity.tokens) ? entity.tokens.find(([key]) => key === name)?.[1] || 0 : entity.tokens?.[name] || 0;
}
function savedState(snapshot) {
  const actor = investigator(snapshot);
  const human = Object.values(snapshot.game.assets).find(asset => asset.cardCode === "c:barkham:014");
  return {
    resources: tokenCount(actor, "Resource"),
    remainingActions: actor.remainingActions,
    sniffedLocations: [...(actor.meta?.sniffedLocations || [])].sort(),
    friendlyHuman: human ? { id: human.id, cardId: human.cardId, treats: tokenCount(human, "Supply") } : null,
  };
}
const proof = { version: status.version, binarySha256: status.binarySha256, extensionSourceSha256: status.extensionSourceSha256, savedGames: [], checks: [],
  ...(candidate ? { schema: 1, mode: verifyExisting ? "verify-existing" : "fresh-isolated", scope: candidate.scope || "packaged-acceptance", candidate: { kind: candidate.kind, platform: candidate.platform, capabilityCertified: candidate.capabilityCertified === true },
    historicalSaveChecks: { performed: false, reason: "Fresh isolated native QA has no historical integration saves; the five newly created Barkham games are checked explicitly." } } : {}) };
if (verifyExisting) {
  const reportPath = resolve(process.env.BARKHAM_REPORT);
  const previous = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(previous.passed, true, "Use a passed fresh Barkham report.");
  assert.equal(previous.mode, "fresh-isolated");
  assert.equal(previous.binarySha256, status.binarySha256);
  assert.equal(previous.extensionSourceSha256, status.extensionSourceSha256);
  assert.deepEqual(previous.candidate, proof.candidate);
  assert.equal(previous.checks.length, 5);
  assert.deepEqual(previous.checks.map(check => check.investigatorCode).sort(), ["barkham-001", "barkham-004", "barkham-007", "barkham-010", "barkham-013"]);
  assert.equal(new Set(previous.checks.map(check => check.gameId)).size, 5);
  proof.sourceReport = reportPath;
  proof.sourceReportSha256 = createHash("sha256").update(await readFile(reportPath)).digest("hex");
  proof.requests = "GET only; no answers, fixtures, deck imports, game creation or service control.";
  for (const check of previous.checks) {
    assert.match(check.gameId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    assert.ok(check.savedState, "The fresh report must record final native save state.");
    const snapshot = await getGame(check.gameId);
    assert.equal(snapshot.game.id, check.gameId);
    assert.equal(savedState(snapshot).resources, check.resourceAction.resourcesAfter);
    assert.equal(savedState(snapshot).remainingActions, check.resourceAction.actionsAfter);
    if (check.sniff) assert.ok(savedState(snapshot).sniffedLocations.includes(check.sniff.locationId));
    if (check.friendlyHumanStartsWithTreats !== undefined) assert.equal(savedState(snapshot).friendlyHuman?.treats, check.friendlyHumanStartsWithTreats);
    assert.deepEqual(savedState(snapshot), check.savedState, "Final native resource/action/sniff/treat states must survive the managed restart exactly.");
    proof.checks.push({ gameId: check.gameId, investigatorCode: check.investigatorCode, savedState: savedState(snapshot), loaded: true });
  }
  proof.passed = true;
  await writeFile(`${output}/verify-existing.json`, JSON.stringify(proof, null, 2));
  console.log("Five saved Barkham games verified using GET requests only.");
  process.exit(0);
}
// Existing integration games are read only. A runtime upgrade must retain them.
if (!candidate) {
const previous = JSON.parse(await readFile("output/rules-server/integration-proof.json", "utf8"));
for (const check of previous.checks) {
  const snapshot = await getGame(check.gameId);
  const i = investigator(snapshot);
  assert.equal(i.remainingActions, check.resourceAction.actionsAfter);
  assert.equal(tokenCount(i, "Resource"), check.resourceAction.resourcesAfter);
  proof.savedGames.push({ gameId: check.gameId, loaded: true, remainingActions: i.remainingActions, resources: tokenCount(i, "Resource") });
}
}
for (const [code, faction, signatures] of [
  ["barkham-004", "seeker", ["barkham-005", "barkham-006"]],
  ["barkham-013", "survivor", ["barkham-014", "barkham-015"]],
  ["barkham-001", "guardian", ["barkham-002", "barkham-003"]],
  ["barkham-007", "rogue", ["barkham-008", "barkham-009"]],
  ["barkham-010", "mystic", ["barkham-011", "barkham-012"]],
]) {
  const deck = deckFixture(code, faction, signatures);
  const deckId = await importDeck(deck);
  let { snapshot, trace } = await setup(deck, deckId);
  const i = investigator(snapshot);
  assert.equal(Object.keys(snapshot.game.locations).length, 10);
  const hidden = Object.values(snapshot.game.locations).flatMap(l => l.cardsUnderneath || []);
  assert.equal(hidden.length, 6, "six peripheral cats remain hidden");
  assert.ok(hidden.every(card => card.contents?.facedown === true), "Meowsks are facedown");
  assert.equal(snapshot.game.encounterDeckSize, 28);
  const check = { gameId: snapshot.game.id, deckId, investigatorCode: code, setup: { locations: 10, hiddenCats: 6, encounterDeckSize: 28 }, setupChoices: trace };
  if (code === "barkham-004") {
    const sniff = choices(question(snapshot)).findIndex(c => c.tag === "AbilityLabel" && c.ability?.index === 1 && c.ability?.cardCode === "c:barkham:004");
    assert.ok(sniff >= 0, "Kate sniff action is available");
    await answer(snapshot, sniff);
    snapshot = await getGame(snapshot.game.id);
    const targets = choices(question(snapshot));
    const currentLocation = investigator(snapshot).placement.contents;
    const target = targets.findIndex(c => c.target?.tag === "LocationTarget" && c.target.contents === currentLocation);
    assert.ok(target >= 0, "Kate can sniff her own location");
    await answer(snapshot, target);
    snapshot = await getGame(snapshot.game.id);
    assert.ok(investigator(snapshot).meta.sniffedLocations.includes(currentLocation));
    assert.equal(investigator(snapshot).remainingActions, i.remainingActions - 1);
    check.sniff = { locationId: currentLocation, persists: true, actionsSpent: 1 };
  }
  if (code === "barkham-013") {
    const friendly = Object.values(snapshot.game.assets).find(a => a.cardCode === "c:barkham:014");
    assert.ok(friendly, "Friendly Human begins in play");
    assert.equal(tokenCount(friendly, "Supply"), 5);
    check.friendlyHumanStartsWithTreats = 5;
  }
  const before = investigator(snapshot);
  const resource = choices(question(snapshot)).findIndex(c => c.component?.tokenType === "ResourceToken");
  assert.ok(resource >= 0, "resource action is available");
  await answer(snapshot, resource);
  snapshot = await getGame(snapshot.game.id);
  const after = investigator(snapshot);
  assert.equal(tokenCount(after, "Resource"), tokenCount(before, "Resource") + 1);
  assert.equal(after.remainingActions, before.remainingActions - 1);
  check.resourceAction = { resourcesBefore: tokenCount(before, "Resource"), resourcesAfter: tokenCount(after, "Resource"), actionsBefore: before.remainingActions, actionsAfter: after.remainingActions };
  check.savedRefetch = true;
  check.savedState = savedState(snapshot);
  proof.checks.push(check);
  await writeFile(`${output}/report.json`, JSON.stringify(proof, null, 2));
  console.log(`${code}: setup, action and persisted state verified (${snapshot.game.id})`);
}
proof.passed = true;
await writeFile(`${output}/report.json`, JSON.stringify(proof, null, 2));
console.log("Barkham runtime integration passed.");
