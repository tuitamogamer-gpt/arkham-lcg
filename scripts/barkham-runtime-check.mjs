import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.env.ARKHAM_RULES_URL || "http://127.0.0.1:5194";
const output = process.env.QA_OUT || "output/barkham-runtime";
await mkdir(output, { recursive: true });
const status = await (await fetch(`${base}/chronicle/status`)).json();
assert.match(status.version, /^Chronicle \+ Barkham/);
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
const proof = { version: status.version, binarySha256: status.binarySha256, extensionSourceSha256: status.extensionSourceSha256, savedGames: [], checks: [] };
// Existing integration games are read only. A runtime upgrade must retain them.
const previous = JSON.parse(await readFile("output/rules-server/integration-proof.json", "utf8"));
for (const check of previous.checks) {
  const snapshot = await getGame(check.gameId);
  const i = investigator(snapshot);
  assert.equal(i.remainingActions, check.resourceAction.actionsAfter);
  assert.equal(tokenCount(i, "Resource"), check.resourceAction.resourcesAfter);
  proof.savedGames.push({ gameId: check.gameId, loaded: true, remainingActions: i.remainingActions, resources: tokenCount(i, "Resource") });
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
  proof.checks.push(check);
  await writeFile(`${output}/report.json`, JSON.stringify(proof, null, 2));
  console.log(`${code}: setup, action and persisted state verified (${snapshot.game.id})`);
}
proof.passed = true;
await writeFile(`${output}/report.json`, JSON.stringify(proof, null, 2));
console.log("Barkham runtime integration passed.");
