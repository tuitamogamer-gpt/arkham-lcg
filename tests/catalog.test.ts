import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  catalog,
  loadCatalogCards,
  productForCard,
  productsForCard,
  starterDeckForInvestigator,
} from "../src/game/catalog";
import {
  card,
  cards as coreCards,
  PLAYABLE_INVESTIGATORS,
  STARTER_DECKS,
} from "../src/game/data";
import { canInspectCard, canReadReverse } from "../src/game/knowledge";
import { createGame } from "./helpers";

test("catalog loading retries an incomplete transaction and shares concurrent requests without expanding the scripted pool", async () => {
  const fetchBefore = globalThis.fetch;
  const coreBefore = JSON.stringify(coreCards);
  const calls: string[] = [];
  let corrupt = true;
  globalThis.fetch = (async (path: string | URL | Request) => {
    const file = String(path);
    calls.push(file);
    const contents = await readFile(`public${file}`, "utf8");
    return new Response(corrupt ? "[]" : contents, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await assert.rejects(loadCatalogCards(), /incomplete/);
    corrupt = false;
    const first = loadCatalogCards();
    const second = loadCatalogCards();
    assert.equal(first, second);
    const imported = await first;
    assert.equal(imported.length, catalog.counts.cardCount);
    assert.equal(calls.length, catalog.cardFiles.length * 2);
    assert.equal(await loadCatalogCards(), imported);
    assert.equal(JSON.stringify(coreCards), coreBefore);
    assert.equal(PLAYABLE_INVESTIGATORS.length, 5);
    assert.equal(Object.keys(STARTER_DECKS).length, 5);
    const starter = catalog.starterDecks[0];
    const investigator = card(starter.investigatorCode);
    assert.equal(investigator.type_code, "investigator");
    assert.equal(productForCard(investigator)?.kind, "starter-deck");
    assert.equal(starterDeckForInvestigator(investigator.code)?.id, starter.id);
    assert.ok(productsForCard(investigator).length);
    assert.ok(canInspectCard(null, investigator.code));
    assert.ok(canReadReverse(null, investigator.code));
    const story = imported.find(
      (c) => c.type_code === "act" && c.pack_code !== "core_2026",
    )!;
    assert.ok(story);
    assert.equal(canInspectCard(null, story.code), false);
    assert.equal(canReadReverse(null, story.code), false);
    const game = createGame("standard", 123, ["12004"]);
    assert.equal(game.player.code, "12004");
    assert.equal(canInspectCard(game, story.code), false);
    assert.equal(JSON.stringify(coreCards), coreBefore);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
