import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateDeck } from "../src/game/decks";
import type { Card } from "../src/game/types";
import {
  buildSlots,
  coreBasicWeaknessPool,
  createNativeScenarioDeck,
  nativeScenarioDeckOptions,
} from "../scripts/native-scenario-decks.mjs";

const manifest = JSON.parse(readFileSync(new URL("../public/data/catalog.json", import.meta.url), "utf8"));
const cards: Card[] = manifest.cardFiles.flatMap((path: string) =>
  JSON.parse(readFileSync(new URL(`../public${path}`, import.meta.url), "utf8")),
);
const catalog = new Map(cards.map((card) => [card.code, card]));
const coreCodes = ["01096", "01097", "01098", "01099", "01100", "01101", "01102", "01103"];

// Deterministic enumeration proves printed deck legality for every possible
// basic weakness. It is unit evidence, not a native game or winning-play proof.
for (const [kind, investigator, signatures] of [
  ["roland", "01001", ["01006", "01007"]],
  ["kate", "barkham-004", ["barkham-005", "barkham-006"]],
] as const) {
  test(`${kind} XP0 solo deck is legal with every actual Core Set basic weakness`, () => {
    assert.deepEqual(coreBasicWeaknessPool(cards).map((card) => card.code), coreCodes);
    for (const weaknessCode of coreCodes) {
      const slots = buildSlots(kind, weaknessCode);
      const validation = validateDeck(investigator,
        Object.entries(slots).map(([code, quantity]) => ({ code, quantity })),
        catalog, nativeScenarioDeckOptions(kind));
      assert.equal(validation.valid, true, `${weaknessCode}: ${JSON.stringify(validation.issues)}`);
      assert.deepEqual(validation.issues, []);
      assert.equal(validation.deckSize, 30);
      assert.equal(validation.countedSize, 30);
      assert.equal(validation.totalCards, 33);
      assert.equal(validation.basicWeaknessCount, 1);
      assert.equal(validation.requiredBasicWeaknesses, 1);
      assert.equal(validation.xp, 0);
      for (const signature of signatures) assert.equal(slots[signature], 1);
      assert.equal(slots[weaknessCode], 1);
      assert.equal(slots["01000"], undefined);
      const counted = Object.entries(slots).filter(([code]) =>
        !(signatures as readonly string[]).includes(code) && code !== weaknessCode);
      assert.equal(counted.length, 15);
      assert.ok(counted.every(([code, quantity]) => quantity === 2 && catalog.get(code)!.xp === 0));
      if (kind === "kate") {
        assert.ok(counted.every(([code]) => ["seeker", "neutral"].includes(catalog.get(code)!.faction_code!)));
        assert.equal(slots["04203"], 2);
        assert.equal(slots["barkham-017"], undefined);
        assert.equal(catalog.get("04203")!.slot, "Body");
        assert.equal(catalog.get("04203")!.health, 2);
      }
    }
  });
}

test("production factories record one genuine random draw and the full declared collection", () => {
  for (const kind of ["roland", "kate"] as const) {
    const result = createNativeScenarioDeck(kind, catalog, `Legal ${kind} QA`);
    const { deck, weaknessDraw, validation } = result;
    assert.equal(deck.name, `Legal ${kind} QA`);
    assert.equal(validation.valid, true);
    assert.equal(weaknessDraw.method, "node:crypto.randomInt");
    assert.equal(weaknessDraw.collection, "Core Set printed basic weaknesses only");
    assert.deepEqual(weaknessDraw.pool.map((card) => card.code), coreCodes);
    assert.equal(weaknessDraw.poolSize, 8);
    assert.equal(weaknessDraw.draws, 1);
    assert.equal(weaknessDraw.probability, 1 / 8);
    assert.equal(weaknessDraw.nativeRngChanged, false);
    assert.deepEqual(weaknessDraw.pool[weaknessDraw.index], {
      code: weaknessDraw.code,
      name: weaknessDraw.name,
      type: catalog.get(weaknessDraw.code)!.type_code,
    });
    assert.equal(deck.slots[weaknessDraw.code], 1);
    assert.equal(new Date(weaknessDraw.drawnAt).toISOString(), weaknessDraw.drawnAt);
    assert.ok(weaknessDraw.playerCardPacks.includes("core"));
    assert.ok(weaknessDraw.playerCardPacks.length > 1, "The narrower weakness collection must not conceal the additional player-card packs.");
    if (kind === "kate") {
      assert.ok(weaknessDraw.playerCardPacks.includes("hote"));
      assert.deepEqual(JSON.parse(deck.meta!.chronicle_barkham_judgments), {
        artworkReviewed: false, eligibleOffClassCards: [], catCards: [],
      });
    }
  }
});

test("incomplete collections and placeholder or signature weakness substitutions are rejected", () => {
  assert.throws(() => coreBasicWeaknessPool(cards.filter((card) => card.code !== "01096")), /complete and unchanged/);
  assert.throws(() => buildSlots("roland", "01000"), /genuine Core Set basic weakness/);
  assert.throws(() => buildSlots("kate", "barkham-006"), /genuine Core Set basic weakness/);
  assert.throws(() => createNativeScenarioDeck("kate", cards.filter((card) => card.code !== "01030")), /deck is illegal/);
});
