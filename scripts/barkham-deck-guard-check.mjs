#!/usr/bin/env node
// Live rejection proof. Only investigations created by this invocation can be
// answered; the nine original QA saves and all imported decks remain read only.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

if (process.argv.includes("--help")) {
  console.log("After root confirms the final native service: BARKHAM_DECK_GUARD_QA_CONFIRMED=1 node scripts/barkham-deck-guard-check.mjs\nOptional: ARKHAM_RULES_URL, QA_OUT. Creates two new named QA investigations; existing games and decks are read only.");
  process.exit(0);
}
assert.equal(process.env.BARKHAM_DECK_GUARD_QA_CONFIRMED, "1", "Wait for root to confirm the installed full candidate before running.");
const base = process.env.ARKHAM_RULES_URL || "http://127.0.0.1:5194";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "QA runs against the local service only.");
const output = resolve(process.env.QA_OUT || "output/barkham-deck-guards");
await mkdir(output, { recursive: true });
const ownedGames = new Set();
const proof = { startedAt: new Date().toISOString(), passed: false, checks: [], preservedGames: [], preservedDecks: [] };
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const checkpoint = () => writeFile(resolve(output, "report.json"), JSON.stringify(proof, null, 2));
async function http(path, body) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = raw; }
  return { status: response.status, ok: response.ok, data };
}
async function request(path, body) {
  const result = await http(path, body);
  assert.ok(result.ok, `${path}: HTTP ${result.status} ${JSON.stringify(result.data).slice(0, 300)}`);
  return result.data;
}
const getGame = (id) => request(`/chronicle/play/games/${id}`);
const getStep = (id) => request(`/chronicle/play/games/${id}/step`);
function question(snapshot) {
  let result = snapshot.game.question[snapshot.playerId];
  while (["QuestionLabel", "QuestionWithSource", "PayCostQuestion"].includes(result?.tag)) result = result.question;
  return result;
}
const deckCode = (deck) => String((deck.playList ?? deck.list)?.investigator_code || "").replace(/^c(?=:|\d)/, "");
const barkhamCodes = new Set(["barkham-001", "barkham-004", "barkham-007", "barkham-010", "barkham-013", ":barkham:001", ":barkham:004", ":barkham:007", ":barkham:010", ":barkham:013"]);
try {
  const status = await request("/chronicle/status");
  for (const name of ["barkham", "epic-labyrinth", "epic-machinations"]) assert.ok(status.extensions?.includes(name), `Full installed candidate must include ${name}.`);
  proof.binarySha256 = status.binarySha256;
  proof.extensionSourceSha256 = status.extensionSourceSha256;
  proof.extensions = status.extensions;
  const previous = await Promise.all(["output/rules-server/integration-proof.json", "output/barkham-runtime/report.json"].map(async (path) => JSON.parse(await readFile(path, "utf8"))));
  const protectedIds = [...new Set(previous.flatMap((report) => report.checks.map((check) => check.gameId)))];
  assert.equal(protectedIds.length, 9, "Protect all nine existing integration saves.");
  const protectedGames = new Map();
  for (const id of protectedIds) protectedGames.set(id, digest((await getGame(id)).game));
  const decks = await request("/chronicle/play/decks");
  assert.ok(Array.isArray(decks));
  const human = decks.find((deck) => deckCode(deck) === "60101");
  const dog = decks.find((deck) => barkhamCodes.has(deckCode(deck)));
  assert.ok(human, "An already imported Nathaniel Cho deck is required.");
  assert.ok(dog, "An already imported Barkham deck is required.");
  const originalDecks = new Map([human, dog].map((deck) => [deck.id, digest(deck)]));
  for (const [scenarioId, deck, description] of [[":barkham:022", human, "Human deck rejected by Barkham"], ["01104", dog, "Barkham deck rejected by The Gathering"]]) {
    const name = `Chronicle deck guard QA ${description} ${randomUUID().slice(0, 8)}`;
    const created = await request("/chronicle/play/games", { name, scenarioId, difficulty: "Standard", playerCount: 1 });
    assert.ok(created.id);
    ownedGames.add(created.id);
    proof.checks.push({ gameId: created.id, name, scenarioId, deckId: deck.id, investigatorCode: deckCode(deck), description });
    const check = proof.checks.at(-1);
    await checkpoint();
    const before = await getGame(created.id), stepBefore = await getStep(created.id);
    assert.equal(question(before)?.tag, "ChooseDeck", "Stop at the real deck selection checkpoint.");
    assert.equal(Object.keys(before.game.investigators).length, 0, "No investigator has been loaded before the invalid answer.");
    assert.ok(ownedGames.has(created.id), "Only newly created QA investigations may be answered.");
    const reply = await http(`/chronicle/play/games/${created.id}/answer`, { tag: "DeckAnswer", deckId: deck.id, playerId: before.playerId, overlay: null });
    assert.equal(reply.status, 400, "The original bridge returns an explicit rejection before forwarding DeckAnswer.");
    assert.match(reply.data?.error ?? "", scenarioId === ":barkham:022" ? /requires a Barkham investigator/ : /only be used in The Meddling of Meowlathotep/, "Explain the printed scenario restriction.");
    const after = await getGame(created.id), stepAfter = await getStep(created.id);
    await writeFile(resolve(output, `${created.id}.json`), JSON.stringify({ before, reply, after, stepBefore, stepAfter }, null, 2));
    assert.equal(digest(after.game), digest(before.game), "Rejected DeckAnswer must leave the entire native game unchanged.");
    assert.deepEqual(stepAfter, stepBefore, "Rejected DeckAnswer must not advance the saved native step.");
    assert.equal(question(after)?.tag, "ChooseDeck", "The original deck selection question remains answerable.");
    assert.equal(Object.keys(after.game.investigators).length, 0, "Rejected investigator is never loaded.");
    Object.assign(check, { httpStatus: reply.status, error: typeof reply.data === "object" && reply.data ? reply.data.error ?? reply.data.message ?? null : typeof reply.data === "string" ? reply.data : null, nativeGameUnchanged: true, nativeStepUnchanged: true, questionPreserved: true, investigatorNotLoaded: true, beforeSha256: digest(before.game), afterSha256: digest(after.game) });
    await checkpoint();
  }
  const finalDecks = await request("/chronicle/play/decks");
  for (const [id, hash] of originalDecks) {
    assert.equal(digest(finalDecks.find((deck) => deck.id === id)), hash, "Rejected selection must not alter the saved deck or its usage record.");
    proof.preservedDecks.push({ deckId: id, unchanged: true });
  }
  for (const [id, hash] of protectedGames) {
    assert.equal(digest((await getGame(id)).game), hash, `Existing QA investigation ${id} remains unchanged.`);
    proof.preservedGames.push({ gameId: id, unchanged: true });
  }
  proof.passed = true;
  proof.completedAt = new Date().toISOString();
  await checkpoint();
  console.log(JSON.stringify({ passed: true, binarySha256: proof.binarySha256, checks: proof.checks.map(({ description, httpStatus, error, nativeGameUnchanged }) => ({ description, httpStatus, error, nativeGameUnchanged })), preservedGames: proof.preservedGames.length, preservedDecks: proof.preservedDecks.length }, null, 2));
} catch (error) {
  proof.error = error instanceof Error ? error.message : String(error);
  await checkpoint();
  throw error;
}
