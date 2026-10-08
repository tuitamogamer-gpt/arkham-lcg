/** Legal XP0 decks for ordinary native scenario play. Run with --import tsx.
 * This module never starts a game, changes native RNG, or retries a weakness
 * draw. Its declared weakness collection is Core Set, even though player cards
 * also come from the additional packs recorded in weaknessDraw.playerCardPacks.
 */
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { validateDeck } from "../src/game/decks.ts";

const definitions = Object.freeze({
  roland: Object.freeze({
    investigator: "01001",
    name: "Native XP0 Roland Banks",
    pairs: Object.freeze([
      "01020", "01016", "01030", "01033", "01087", "01037", "01039",
      "01088", "01089", "01090", "01091", "01093", "02022", "03191", "05109",
    ]),
    signatures: Object.freeze(["01006", "01007"]),
  }),
  kate: Object.freeze({
    investigator: "barkham-004",
    name: "Native XP0 Kate Winthpup",
    pairs: Object.freeze([
      "01030", "01033", "01087", "01037", "01039", "01088", "01089",
      "01090", "01092", "01093", "02022", "02107", "01036", "04203", "02020",
    ]),
    signatures: Object.freeze(["barkham-005", "barkham-006"]),
  }),
});

const coreWeaknessCodes = Object.freeze([
  "01096", "01097", "01098", "01099", "01100", "01101", "01102", "01103",
]);

function definition(kind) {
  assert.ok(Object.hasOwn(definitions, kind), "Choose the roland or kate native deck.");
  return definitions[kind];
}

function cardMap(cards) {
  return Array.isArray(cards)
    ? new Map(cards.map((card) => [card.code, card]))
    : new Map(cards);
}

/** Pure construction for deterministic legality checks. Production callers use
 * createNativeScenarioDeck instead of selecting their preferred weakness.
 */
export function buildSlots(kind, weaknessCode) {
  const selected = definition(kind);
  assert.ok(coreWeaknessCodes.includes(weaknessCode), "Use a genuine Core Set basic weakness, never the hidden 01000 placeholder.");
  return {
    ...Object.fromEntries(selected.pairs.map((code) => [code, 2])),
    ...Object.fromEntries(selected.signatures.map((code) => [code, 1])),
    [weaknessCode]: 1,
  };
}

export function nativeScenarioDeckOptions(kind) {
  definition(kind);
  return {
    standalone: true,
    playerCount: 1,
    availableXp: 0,
    ...(kind === "kate" ? {
      barkham: true,
      // No artwork-dependent off-class exception is used by this deck.
      barkhamJudgments: {
        artworkReviewed: false,
        eligibleOffClassCards: [],
        catCards: [],
      },
    } : {}),
  };
}

export function coreBasicWeaknessPool(cards) {
  const catalog = cardMap(cards);
  const actual = [...catalog.values()].filter((card) =>
    card.pack_code === "core" && card.subtype_code === "basicweakness"
    && !card.hidden && !card.duplicate_of,
  ).map((card) => card.code).sort();
  assert.deepEqual(actual, [...coreWeaknessCodes], "The declared Core Set basic weakness collection must be complete and unchanged.");
  return coreWeaknessCodes.map((code) => {
    const card = catalog.get(code);
    assert.ok(["treachery", "enemy"].includes(card.type_code) && !card.restrictions,
      `${code} must be an unrestricted printed basic weakness.`);
    return { code, name: card.name, type: card.type_code };
  });
}

export function createNativeScenarioDeck(kind, cards, name) {
  const selected = definition(kind);
  const deckName = name ?? selected.name;
  assert.ok(typeof deckName === "string" && deckName.trim(), "Provide a nonempty deck name.");
  const catalog = cardMap(cards);
  const pool = coreBasicWeaknessPool(catalog);
  const options = nativeScenarioDeckOptions(kind);
  // Validate every possible draw before sampling. A malformed catalogue cannot
  // turn an invalid result into an excuse to draw a different weakness.
  const validations = pool.map(({ code }) => {
    const slots = buildSlots(kind, code);
    const validation = validateDeck(selected.investigator,
      Object.entries(slots).map(([code, quantity]) => ({ code, quantity })),
      catalog, options);
    assert.equal(validation.valid, true, `${kind} deck is illegal with ${code}: ${JSON.stringify(validation.issues)}`);
    assert.equal(validation.countedSize, 30);
    assert.equal(validation.totalCards, 33);
    assert.equal(validation.xp, 0);
    return validation;
  });
  const index = randomInt(pool.length);
  const weakness = pool[index];
  const deck = {
    name: deckName,
    investigator_code: selected.investigator,
    slots: buildSlots(kind, weakness.code),
    ...(kind === "kate" ? { meta: {
      chronicle_barkham_judgments: JSON.stringify(options.barkhamJudgments),
    } } : {}),
  };
  return {
    deck,
    validation: validations[index],
    weaknessDraw: {
      schema: 1,
      method: "node:crypto.randomInt",
      collection: "Core Set printed basic weaknesses only",
      playerCardPacks: [...new Set(Object.keys(deck.slots).map((code) => catalog.get(code).pack_code))].sort(),
      pool,
      poolSize: pool.length,
      index,
      code: weakness.code,
      name: weakness.name,
      probability: 1 / pool.length,
      draws: 1,
      drawnAt: new Date().toISOString(),
      nativeRngChanged: false,
    },
  };
}
