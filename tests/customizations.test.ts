import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CUSTOMIZABLE_CARD_CODES,
  parseCustomizationSheet,
  type CustomizableCard,
} from "../src/game/customizations";
import { validateDeck } from "../src/game/decks";
import type { Card } from "../src/game/types";

const manifest = JSON.parse(
  readFileSync(new URL("../public/data/catalog.json", import.meta.url), "utf8"),
);
const cards: Card[] = manifest.cardFiles.flatMap((path: string) =>
  JSON.parse(
    readFileSync(new URL(`../public${path}`, import.meta.url), "utf8"),
  ),
);
const byCode = new Map(cards.map((card) => [card.code, card]));
const card = (code: string): CustomizableCard => {
  const found = byCode.get(code);
  assert.ok(found, `catalogue card ${code} exists`);
  return found as CustomizableCard;
};
const parse = (code: string, sheet?: string) =>
  parseCustomizationSheet(card(code), sheet, byCode);
const startingChoices: Record<string, string> = {
  "09042": "0|0|01031", // Old Book of Lore, a Tome asset.
  "09060": "0|0|Item",
  "09079": "0|0|willpower",
  "09101": "0|0|Humanoid^Monster",
};
const hasIssue = (code: string, sheet: string | undefined, expected: string) =>
  assert.ok(
    parse(code, sheet).issues.some((issue) => issue.code === expected),
    `${code} ${sheet} rejects ${expected}`,
  );

test("all sixteen published customizable cards accept their complete level-0 sheet", () => {
  const published = cards.filter(
    (candidate) => (candidate as CustomizableCard).customization_options,
  );
  assert.deepEqual(
    published.map((candidate) => candidate.code).sort(),
    [...CUSTOMIZABLE_CARD_CODES].sort(),
  );
  for (const candidate of published) {
    const result = parse(candidate.code, startingChoices[candidate.code]);
    assert.deepEqual(result.issues, [], candidate.name);
    assert.equal(result.totalXp, 0);
    assert.equal(result.level, 0);
    assert.equal(result.effectiveCard.deck_limit, candidate.deck_limit);
  }
});

test("every printed upgrade has a supported complete encoding", () => {
  for (const code of CUSTOMIZABLE_CARD_CODES) {
    const original = card(code);
    for (const [index, option] of original.customization_options!.entries()) {
      if (option.xp === 0) continue;
      let choices = "";
      if (option.choice === "choose_card") choices = "|01060^01061"; // Two different Spell assets.
      if (option.choice === "choose_trait") choices = "|Cultist";
      if (option.choice === "choose_skill") choices = "|combat";
      if (option.choice === "remove_slot") choices = "|0";
      const sheet = [startingChoices[code], `${index}|${option.xp}${choices}`]
        .filter(Boolean)
        .join(",");
      const result = parse(code, sheet);
      assert.deepEqual(result.issues, [], `${original.name}, option ${index}`);
      assert.equal(result.totalXp, option.xp);
      assert.equal(result.level, Math.ceil(option.xp / 2));
      assert.equal(
        result.entries.find((entry) => entry.index === index)?.active,
        true,
      );
    }
  }
});

test("the four cards with a purchase-time choice require it even without XP", () => {
  for (const code of Object.keys(startingChoices))
    hasIssue(code, undefined, "customization-required-choice");
  hasIssue("09101", "0|0|Monster", "customization-choice-count");
  hasIssue("09079", "0|0|willpower^combat", "customization-choice-count");
});

test("partial checkboxes affect level and XP but do not activate upgrade properties", () => {
  const incomplete = parse("09021", "2|1");
  assert.deepEqual(incomplete.issues, []);
  assert.equal(incomplete.level, 1);
  assert.equal(incomplete.totalXp, 1);
  assert.equal(incomplete.entries[0].active, false);
  assert.equal(incomplete.effectiveCard.health, card("09021").health);
  const complete = parse("09021", "2|2");
  assert.equal(complete.effectiveCard.health, card("09021").health! + 2);
  assert.equal(complete.level, 1);
  assert.equal(parse("09021", "2|2,3|1").level, 2);
});

test("the 10-checkbox limit uses incomplete upgrades too", () => {
  const valid = parse("09021", "0|1,1|2,2|2,3|2,5|3");
  assert.deepEqual(valid.issues, []);
  assert.equal(valid.totalXp, 10);
  assert.equal(valid.level, 5);
  const invalid = parse("09021", "0|1,1|2,2|2,3|2,5|3,6|1");
  assert.ok(invalid.issues.some((issue) => issue.code === "customization-xp"));
  assert.equal(invalid.effectiveCard.traits, card("09021").traits);
  assert.equal(invalid.effectiveCard.slot, "Body");
});

test("upgrades adjust deck-relevant traits and slots without mutating the catalogue", () => {
  const original = structuredClone(card("09021"));
  const armor = parse("09021", "0|1");
  assert.deepEqual(armor.issues, []);
  assert.equal(armor.effectiveCard.traits, "Item. Armor. Relic.");
  assert.equal(armor.effectiveCard.slot, "Arcane");
  assert.deepEqual(card("09021"), original);
  assert.equal(
    parse("09022", "0|1").effectiveCard.traits,
    "Item. Weapon. Melee. Relic.",
  );
  assert.equal(
    parse("09079", "0|0|willpower,3|2").effectiveCard.slot,
    "Arcane",
  );
});

test("Honed Instinct and Power Word permit three copies only after their upgrade is complete", () => {
  for (const [code, index] of [
    ["09061", 6],
    ["09081", 7],
  ] as const) {
    assert.equal(parse(code, `${index}|2`).effectiveCard.deck_limit, 2);
    const complete = parse(code, `${index}|3`);
    assert.deepEqual(complete.issues, []);
    assert.equal(complete.effectiveCard.deck_limit, 3);
    assert.equal(complete.totalXp, 3); // One sheet's XP, even when all three copies are owned.
    assert.equal(complete.level, 2);
  }
  assert.equal(
    parse("09061", "6|3").effectiveCard.cost,
    card("09061").cost! - 1,
  );
});

test("cost, health, sanity and ability tags are granted by completed upgrades", () => {
  assert.equal(
    parse("09021", "3|2").effectiveCard.sanity,
    card("09021").sanity! + 2,
  );
  assert.equal(parse("09080", "0|1").effectiveCard.health, 3);
  assert.equal(
    parse("09023", "3|3").effectiveCard.cost,
    card("09023").cost! - 1,
  );
  assert.equal(parse("09022", "1|1").effectiveCard.tags, "hd.hh.");
  assert.equal(parse("09040", "0|1,1|1").effectiveCard.tags, "hd.hh.");
  assert.equal(parse("09081", "1|1").effectiveCard.tags, "pa.hd.hh.");
  assert.equal(parse("09040", "0|0").effectiveCard.tags, undefined);
});

test("Summoned Servitor Dominance requires a completed choice of exactly arcane or ally", () => {
  const arcane = parse("09080", "5|2|0");
  const ally = parse("09080", "5|2|1");
  assert.deepEqual(arcane.issues, []);
  assert.equal(arcane.effectiveCard.slot, "Ally");
  assert.equal(ally.effectiveCard.slot, "Arcane");
  hasIssue("09080", "5|2", "customization-choice-count");
  hasIssue("09080", "5|2|2", "customization-slot");
  hasIssue("09080", "5|2|arcane", "customization-slot");
  hasIssue("09080", "5|1|0", "customization-incomplete-choice");
});

test("Raven Quill names must be distinct Tome or Spell assets, including Endless Inkwell", () => {
  const valid = parse("09042", "0|0|01031,4|2|01060^01061,7|4");
  assert.deepEqual(valid.issues, []);
  assert.equal(valid.totalXp, 6);
  assert.equal(valid.level, 3);
  hasIssue("09042", "0|0|01030", "customization-card-choice"); // Magnifying Glass is a Tool.
  hasIssue("09042", "0|0|01066", "customization-card-choice"); // Ward of Protection is a Spell event.
  hasIssue("09042", "0|0|notARealCard", "customization-card-choice");
  hasIssue("09042", "0|0|01031,4|2|01060", "customization-choice-count");
  hasIssue(
    "09042",
    "0|0|01031,4|2|01031^01060",
    "customization-choice-duplicate",
  );
  const upgradedLore = cards.find(
    (candidate) => candidate.name === "Old Book of Lore" && candidate.xp! > 0,
  )!;
  assert.ok(upgradedLore);
  hasIssue(
    "09042",
    `0|0|01031,4|2|${upgradedLore.code}^01060`,
    "customization-choice-duplicate",
  );
  hasIssue(
    "09042",
    "0|0|01031,4|1|01060^01061",
    "customization-incomplete-choice",
  );
});

test("trait and skill choices must be known and distinct across a sheet", () => {
  const traits = parse(
    "09101",
    "2|2|Cultist,0|0|humanoid.^Monster,1|1|Ancient One",
  );
  assert.deepEqual(traits.issues, []);
  assert.equal(
    traits.canonicalSheet,
    "0|0|Humanoid^Monster,1|1|Ancient One,2|2|Cultist",
  );
  hasIssue("09101", "0|0|Monster^monster.", "customization-choice-duplicate");
  hasIssue("09060", "0|0|Item,2|2|item.", "customization-choice-duplicate");
  hasIssue("09060", "0|0|Definitely A Made Up Trait", "customization-trait");
  hasIssue(
    "09079",
    "0|0|willpower,4|2|willpower",
    "customization-choice-duplicate",
  );
  hasIssue("09079", "0|0|Willpower", "customization-skill");
  hasIssue("09079", "0|0|fight", "customization-skill");
  assert.deepEqual(
    parse("09079", "0|0|willpower,4|2|combat,5|3|intellect").issues,
    [],
  );
});

test("incomplete choice upgrades cannot grant Living Ink a skill before paying all boxes", () => {
  const result = parse("09079", "0|0|willpower,4|1|combat");
  assert.ok(
    result.issues.some(
      (issue) => issue.code === "customization-incomplete-choice",
    ),
  );
  assert.equal(result.entries[1].active, false);
  assert.equal(result.totalXp, 1);
});

test("native metadata strings are consumed completely with strict indices and counts", () => {
  for (const raw of [
    "1|1trailing",
    "1|1,",
    "1|1junk|abc",
    "1|-1",
    "-1|1",
    "1|1|",
    "1.5|1",
    " 1|1",
    "1|1\n",
  ])
    hasIssue("09021", raw, "customization-format");
  hasIssue("09021", "7|1", "customization-option");
  hasIssue("09021", "9007199254740993|1", "customization-option");
  hasIssue("09021", "0|2", "customization-count");
  hasIssue("09021", "0|9007199254740993", "customization-count");
  hasIssue("09021", "0|1,0|1", "customization-duplicate");
  hasIssue("09021", "0|1,00|1", "customization-duplicate");
  hasIssue("09021", "0|1|combat", "customization-choice");
});

test("malformed metadata types and unknown customization schemas block certification", () => {
  const wrongType = parseCustomizationSheet(
    card("09021"),
    { "0": 1 } as unknown as string,
    cards,
  );
  assert.ok(
    wrongType.issues.some((issue) => issue.code === "customization-format"),
  );
  const unknown = parseCustomizationSheet(
    { ...card("09021"), code: "future-custom" },
    undefined,
    cards,
  );
  assert.ok(unknown.issues.some((issue) => issue.severity === "unsupported"));
  const altered = parseCustomizationSheet(
    {
      ...card("09021"),
      customization_options: [{ xp: 1 }],
    } as CustomizableCard,
    "0|1",
    cards,
  );
  assert.ok(altered.issues.some((issue) => issue.severity === "unsupported"));
  assert.equal(altered.effectiveCard.traits, card("09021").traits);
  assert.ok(
    parseCustomizationSheet(card("01031"), "0|1", cards).issues.some(
      (issue) => issue.code === "customization-card",
    ),
  );
});

test("canonical sheet sorting keeps native option IDs and purchase choices intact", () => {
  const result = parse("09079", "5|3|intellect,0|0|willpower,4|2|combat");
  assert.deepEqual(result.issues, []);
  assert.equal(result.canonicalSheet, "0|0|willpower,4|2|combat,5|3|intellect");
  const reparsed = parse("09079", result.canonicalSheet);
  assert.deepEqual(reparsed.entries, result.entries);
  assert.equal(reparsed.totalXp, result.totalXp);
});

test("the effective level feeds existing investigator class/level limits for partial upgrades", () => {
  const skids: Card = { ...card("01003"), deck_requirements: "size:1" };
  const validateEffective = (sheet: string) => {
    const effective = { ...parse("09021", sheet).effectiveCard };
    // Isolate the existing class/level predicate from raw-sheet integration.
    delete effective.customization_options;
    return validateDeck(
      skids.code,
      [{ code: "09021", quantity: 1 }],
      [skids, effective],
    );
  };
  assert.equal(parse("09021", "1|2,2|2").level, 2);
  assert.ok(
    !validateEffective("1|2,2|2").issues.some(
      (issue) => issue.code === "illegal-card",
    ),
  );
  assert.equal(parse("09021", "1|2,2|2,3|1").level, 3);
  assert.ok(
    validateEffective("1|2,2|2,3|1").issues.some(
      (issue) => issue.code === "illegal-card",
    ),
  );
});
