import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateDeck,
  prepareDeck,
  prepareStarterDeck,
  upgradeDeck,
  type DeckOptions,
} from "../src/game/decks";
import type { Card } from "../src/game/types";
import type { DeckSlot } from "../src/game/catalog";

const manifest = JSON.parse(
  readFileSync(new URL("../public/data/catalog.json", import.meta.url), "utf8"),
);
const catalogCards: Card[] = manifest.cardFiles.flatMap((path: string) =>
  JSON.parse(
    readFileSync(new URL(`../public${path}`, import.meta.url), "utf8"),
  ),
);
const catalogMap = new Map(catalogCards.map((c) => [c.code, c]));
const card = (
  code: string,
  overrides: Partial<Card> & Record<string, unknown> = {},
): Card => ({
  code,
  name: code,
  type_code: "asset",
  faction_code: "guardian",
  position: 1,
  quantity: 2,
  deck_limit: 2,
  xp: 0,
  ...overrides,
});
const investigator = (
  overrides: Partial<Card> & Record<string, unknown> = {},
) =>
  card("i", {
    name: "Test Investigator",
    type_code: "investigator",
    deck_limit: 1,
    xp: undefined,
    health: 8,
    sanity: 8,
    deck_requirements:
      "size:4, card:sig, card:weak, random:subtype:basicweakness",
    deck_options: [
      { faction: ["guardian", "neutral"], level: { min: 0, max: 5 } },
    ],
    ...overrides,
  });
const fixture = (
  investigatorOverrides: Partial<Card> & Record<string, unknown> = {},
  extras: Card[] = [],
) => [
  investigator(investigatorOverrides),
  card("a"),
  card("b"),
  card("sig", { xp: undefined, deck_limit: 1, restrictions: "investigator:i" }),
  card("weak", {
    xp: undefined,
    type_code: "treachery",
    faction_code: "neutral",
    deck_limit: 1,
    subtype_code: "weakness",
    restrictions: "investigator:i",
  }),
  card("basic", {
    xp: undefined,
    type_code: "treachery",
    faction_code: "neutral",
    deck_limit: 1,
    subtype_code: "basicweakness",
  }),
  ...extras,
];
const base: DeckSlot[] = [
  { code: "a", quantity: 2 },
  { code: "b", quantity: 2 },
  { code: "sig", quantity: 1 },
  { code: "weak", quantity: 1 },
  { code: "basic", quantity: 1 },
];

test("customization XP is paid once while effective levels and traits govern every copy", () => {
  const armor = catalogMap.get("09021")!;
  const source = fixture({}, [armor]);
  const slots = base.map(s => s.code === "a" ? { code: armor.code, quantity: s.quantity } : s);
  const options = { customizations: { "09021": "0|1,2|2" }, availableXp: 3 };
  const valid = validateDeck("i", slots, source, options);
  assert.equal(valid.valid, true, JSON.stringify(valid.issues));
  assert.equal(valid.xp, 3);
  assert.equal(armor.xp, 0, "printed catalogue values remain immutable");
  const lowLevel = fixture({ deck_options: [{ faction: ["guardian", "neutral"], level: { min: 0, max: 1 } }] }, [armor]);
  assert.ok(validateDeck("i", slots, lowLevel, options).issues.some(i => i.code === "illegal-card"));
  const relicOnly = fixture({ deck_options: [{ trait: ["relic"], level: { min: 0, max: 5 } }, { faction: ["neutral"], level: { min: 0, max: 5 } }] }, [armor]);
  const relicSlots = slots.map(s => s.code === "b" ? { ...s, code: "n" } : s);
  relicOnly.push(card("n", { faction_code: "neutral" }));
  assert.equal(validateDeck("i", relicSlots, relicOnly, { customizations: { "09021": "0|1" } }).valid, true);
  assert.ok(validateDeck("i", relicSlots, relicOnly).issues.some(i => i.code === "illegal-card"));
});

test("customization choices and a purchased third-copy allowance affect real deck validation", () => {
  const power = catalogMap.get("09081")!;
  const ink = catalogMap.get("09079")!;
  const source = fixture({ deck_options: [{ faction: ["guardian", "mystic", "neutral"], level: { min: 0, max: 5 } }] }, [power, ink]);
  const slots = [{ code: power.code, quantity: 3 }, { code: "b", quantity: 1 }, ...base.filter(s => !["a", "b"].includes(s.code))];
  const valid = validateDeck("i", slots, source, { customizations: { "09081": "7|3" } });
  assert.equal(valid.valid, true, JSON.stringify(valid.issues));
  assert.equal(valid.xp, 3);
  assert.ok(validateDeck("i", slots, source).issues.some(i => i.code === "copy-limit"));
  const inkSlots = base.map(s => s.code === "a" ? { code: ink.code, quantity: s.quantity } : s);
  assert.ok(validateDeck("i", inkSlots, source).issues.some(i => i.code === "customization-required-choice"));
  assert.equal(validateDeck("i", inkSlots, source, { customizations: { "09079": "0|0|willpower" } }).valid, true);
});

test("customization campaign upgrades charge shared boxes and keep purchases permanent", () => {
  const honed = catalogMap.get("09061")!;
  const source = fixture({ deck_options: [{ faction: ["guardian", "rogue", "neutral"], level: { min: 0, max: 5 } }] }, [honed]);
  const purchase = upgradeDeck("i", base, {
    remove: [{ code: "a", quantity: 2 }], add: [{ code: honed.code, quantity: 2 }],
    customizations: { "09061": "6|3" },
  }, source, 3);
  assert.equal(purchase.valid, true, JSON.stringify(purchase.validation.issues));
  assert.equal(purchase.cost, 3);
  const third = upgradeDeck("i", purchase.slots, {
    remove: [{ code: "b", quantity: 1 }], add: [{ code: honed.code, quantity: 1 }],
    customizations: { "09061": "0|1,6|3" },
  }, source, 1, { customizations: { "09061": "6|3" } });
  assert.equal(third.valid, true, JSON.stringify(third.validation.issues));
  assert.equal(third.cost, 1);
  const refunded = upgradeDeck("i", purchase.slots, {
    remove: [], add: [], customizations: { "09061": "6|2" },
  }, source, 0, { customizations: { "09061": "6|3" } });
  assert.equal(refunded.valid, false);
  assert.ok(refunded.validation.issues.some(i => i.code === "customization-permanent"));
});
const replace = (
  slots: DeckSlot[],
  from: string,
  to: string,
  quantity: number,
) => [
  ...slots
    .map((s) =>
      s.code === from ? { ...s, quantity: s.quantity - quantity } : { ...s },
    )
    .filter((s) => s.quantity > 0),
  { code: to, quantity },
];
const issue = (result: ReturnType<typeof validateDeck>, code: string) =>
  result.issues.some((i) => i.code === code);

test("all 15 published starter lists certify their exact physical cards and exclude upgrade supply", () => {
  assert.equal(manifest.starterDecks.length, 15);
  for (const starter of manifest.starterDecks) {
    const original = JSON.stringify(starter.slots);
    const prepared = prepareStarterDeck(starter, catalogMap);
    assert.equal(
      prepared.validation.valid,
      true,
      `${starter.name}: ${JSON.stringify(prepared.validation.issues)}`,
    );
    assert.equal(prepared.validation.countedSize, 30);
    assert.equal(prepared.deck.length, starter.totalCards);
    assert.equal(prepared.validation.basicWeaknessCount, 1);
    assert.ok(
      prepared.deck.every(
        (code) => !starter.upgrades.some((s: DeckSlot) => s.code === code),
      ),
    );
    assert.equal(JSON.stringify(starter.slots), original);
  }
});

test("quantity validation rejects fractions, negative values, unknown cards, and combines duplicate slots", () => {
  const cards = fixture();
  assert.equal(
    validateDeck("i", [...base, { code: "a", quantity: -1 }], cards).valid,
    false,
  );
  assert.ok(
    issue(
      validateDeck("i", [...base, { code: "a", quantity: 1.5 }], cards),
      "quantity",
    ),
  );
  assert.ok(
    issue(
      validateDeck("i", replace(base, "a", "missing", 1), cards),
      "unknown-card",
    ),
  );
  const split = base.flatMap((s) =>
    s.quantity === 2
      ? [
          { ...s, quantity: 1 },
          { ...s, quantity: 1 },
        ]
      : [s],
  );
  assert.equal(validateDeck("i", split, cards).valid, true);
  assert.equal(validateDeck("i", split, cards).slots.length, 5);
});

test("deck size, required signatures and exact weakness count are enforced separately", () => {
  const cards = fixture();
  assert.ok(
    issue(
      validateDeck(
        "i",
        base.filter((s) => s.code !== "sig"),
        cards,
      ),
      "required-card",
    ),
  );
  assert.ok(
    issue(
      validateDeck(
        "i",
        base.filter((s) => s.code !== "basic"),
        cards,
      ),
      "basic-weakness",
    ),
  );
  assert.ok(
    issue(validateDeck("i", replace(base, "a", "b", 1), cards), "copy-limit"),
  );
  assert.ok(
    issue(
      validateDeck("i", [...base, { code: "a", quantity: 1 }], cards),
      "deck-size",
    ),
  );
  const campaignWeakness = card("extra", {
    xp: undefined,
    type_code: "treachery",
    subtype_code: "basicweakness",
    deck_limit: 1,
  });
  assert.equal(
    validateDeck(
      "i",
      [...base, { code: "extra", quantity: 1 }],
      [...cards, campaignWeakness],
      { extraBasicWeaknesses: 1 },
    ).valid,
    true,
  );
  const stella = manifest.starterDecks.find(
    (d: any) => d.investigatorCode === "60501",
  );
  assert.ok(
    issue(
      validateDeck(
        "60501",
        stella.slots.map((s: DeckSlot) =>
          s.code === "60502" ? { ...s, quantity: 2 } : s,
        ),
        catalogMap,
      ),
      "required-card",
    ),
  );
});

test("reprints and upgraded cards share a title copy limit", () => {
  const cards = fixture({}, [
    card("a-reprint", { name: "a", duplicate_of: "a" }),
    card("a-upgrade", { name: "a", xp: 2 }),
  ]);
  assert.equal(
    validateDeck("i", replace(base, "a", "a-reprint", 1), cards).valid,
    true,
  );
  assert.ok(
    issue(
      validateDeck("i", replace(base, "b", "a-upgrade", 1), cards),
      "copy-limit",
    ),
  );
});

test("class, trait, level, type, slots and uses filters respect AND/OR and dual-class cards", () => {
  const inv = {
    deck_options: [
      { faction: ["guardian", "neutral"], level: { min: 0, max: 5 } },
      {
        trait: ["spell", "occult"],
        type: ["event"],
        level: { min: 0, max: 2 },
      },
      {
        uses: ["charges", "charge"],
        slot: ["arcane"],
        level: { min: 0, max: 4 },
      },
    ],
  };
  const cards = fixture(inv, [
    card("spell-event", {
      faction_code: "mystic",
      traits: "Spell.",
      type_code: "event",
      xp: 2,
    }),
    card("spell-asset", { faction_code: "mystic", traits: "Spell.", xp: 2 }),
    card("charge", {
      faction_code: "seeker",
      slot: "Arcane",
      text: "Uses (3 charges).",
      xp: 4,
    }),
    card("dual", { faction_code: "mystic", faction2_code: "guardian", xp: 3 }),
  ]);
  for (const code of ["spell-event", "charge", "dual"])
    assert.equal(
      validateDeck("i", replace(base, "a", code, 1), cards).valid,
      true,
      code,
    );
  assert.ok(
    issue(
      validateDeck("i", replace(base, "a", "spell-asset", 1), cards),
      "illegal-card",
    ),
  );
});

test("text and tag ability filters are equivalent and not-rules forbid otherwise legal cards", () => {
  const cards = fixture(
    {
      deck_options: [
        { faction: ["guardian", "neutral"], level: { min: 0, max: 5 } },
        {
          text: ["<b>Parley\\.<\\/b>"],
          tag: ["pa"],
          level: { min: 0, max: 5 },
        },
        { not: true, trait: ["fortune"] },
      ],
    },
    [
      card("tag", { faction_code: "rogue", tags: "pa." }),
      card("text", { faction_code: "rogue", text: "[action]: <b>Parley.</b>" }),
      card("fortune", { traits: "Fortune." }),
    ],
  );
  assert.equal(
    validateDeck("i", replace(base, "a", "tag", 1), cards).valid,
    true,
  );
  assert.equal(
    validateDeck("i", replace(base, "a", "text", 1), cards).valid,
    true,
  );
  assert.ok(
    issue(
      validateDeck("i", replace(base, "a", "fortune", 1), cards),
      "forbidden-card",
    ),
  );
});

test("limited categories count multi-class access unless the printed category says other", () => {
  const rule = { faction: ["mystic"], level: { min: 0, max: 2 }, limit: 1 };
  const dual = card("dual", {
    faction_code: "guardian",
    faction2_code: "mystic",
  });
  const slots = replace(base, "a", "dual", 2);
  const options = [
    { faction: ["guardian", "neutral"], level: { min: 0, max: 5 } },
    rule,
  ];
  assert.ok(
    issue(
      validateDeck("i", slots, fixture({ deck_options: options }, [dual])),
      "option-limit",
    ),
  );
  assert.equal(
    validateDeck(
      "i",
      slots,
      fixture(
        {
          deck_options: options,
          back_text:
            "Guardian cards level 0–5, up to 1 other Mystic card level 0–2.",
        },
        [dual],
      ),
    ).valid,
    true,
  );
});

test("secondary class, option groups, distinct class choices and deck sizes require explicit choices", () => {
  const cards = fixture(
    {
      deck_options: [
        { faction: ["guardian", "neutral"], level: { min: 0, max: 5 } },
        {
          name: "Secondary Class",
          faction_select: ["rogue", "mystic"],
          level: { min: 0, max: 1 },
          type: ["event", "skill"],
          limit: 1,
        },
      ],
    },
    [card("rogue-event", { faction_code: "rogue", type_code: "event" })],
  );
  assert.ok(issue(validateDeck("i", base, cards), "choice-required"));
  assert.equal(
    validateDeck("i", replace(base, "a", "rogue-event", 1), cards, {
      selections: { "Secondary Class": "rogue" },
    }).valid,
    true,
  );
  assert.ok(
    issue(
      validateDeck("i", replace(base, "a", "rogue-event", 1), cards, {
        selections: { "Secondary Class": "mystic" },
      }),
      "illegal-card",
    ),
  );
  const twoClasses = fixture({
    deck_options: [
      { id: "faction_1", faction_select: ["guardian", "rogue"] },
      { id: "faction_2", faction_select: ["guardian", "rogue"] },
    ],
  });
  assert.ok(
    issue(
      validateDeck("i", base, twoClasses, {
        selections: { faction_1: "guardian", faction_2: "guardian" },
      }),
      "duplicate-choice",
    ),
  );
  const groups = fixture(
    {
      deck_options: [
        { faction: ["guardian", "neutral"] },
        {
          name: "Trait Choice",
          option_select: [
            { id: "spell", trait: ["spell"], size: 1 },
            { id: "occult", trait: ["occult"] },
          ],
        },
      ],
    },
    [card("spell", { faction_code: "mystic", traits: "Spell." })],
  );
  assert.equal(
    validateDeck("i", [...base, { code: "spell", quantity: 1 }], groups, {
      selections: { "Trait Choice": "spell" },
    }).valid,
    true,
  );
  const size = fixture({
    deck_options: [
      { faction: ["guardian", "neutral"] },
      { name: "Deck Size", deck_size_select: ["4", "6"], faction: [] },
    ],
  });
  assert.equal(
    validateDeck("i", base, size, { selections: { "Deck Size": "4" } }).valid,
    true,
  );
});

test("minimum class requirements count a multi-class card toward each class", () => {
  const options = [
    {
      faction: ["guardian", "mystic", "neutral"],
      atleast: { factions: 2, min: 2 },
    },
  ];
  const cards = fixture({ deck_options: options }, [
    card("dual", { faction2_code: "mystic" }),
  ]);
  assert.ok(issue(validateDeck("i", base, cards), "faction-minimum"));
  assert.equal(
    validateDeck("i", replace(base, "a", "dual", 2), cards).valid,
    true,
  );
});

test("permanents do not count toward deck size, retain legality and are separated during setup", () => {
  const permanent = card("perma", { permanent: true, deck_limit: 1, xp: 2 });
  const cards = fixture({}, [permanent]);
  const prepared = prepareDeck(
    "i",
    [...base, { code: "perma", quantity: 1 }],
    cards,
  );
  assert.equal(prepared.validation.valid, true);
  assert.deepEqual(prepared.permanents, ["perma"]);
  assert.equal(prepared.deck.length, 7);
  assert.equal(prepared.validation.xp, 2);
  assert.ok(
    issue(
      validateDeck(
        "i",
        [...base, { code: "perma", quantity: 1 }],
        fixture(
          {
            deck_options: [
              { faction: ["guardian", "neutral"] },
              { not: true, permanent: true },
            ],
          },
          [permanent],
        ),
      ),
      "forbidden-card",
    ),
  );
});

test("Myriad counts every physical card but costs XP once; exceptional doubles cost and limits one", () => {
  const myriad = card("ace", { myriad: true, deck_limit: 3, xp: 2 });
  const exceptional = card("exceptional", { exceptional: true, xp: 3 });
  const cards = fixture({}, [myriad, exceptional]);
  const slots = [
    { code: "ace", quantity: 3 },
    { code: "b", quantity: 1 },
    ...base.filter((s) => ["sig", "weak", "basic"].includes(s.code)),
  ];
  const result = validateDeck("i", slots, cards);
  assert.equal(result.valid, true);
  assert.equal(result.countedSize, 4);
  assert.equal(result.xp, 2);
  assert.equal(
    validateDeck("i", replace(base, "a", "exceptional", 1), cards).xp,
    6,
  );
  assert.ok(
    issue(
      validateDeck("i", replace(base, "a", "exceptional", 2), cards),
      "copy-limit",
    ),
  );
});

test("printed per-deck limits include Myriad subtitle limits and Sled Dog's four-copy exception", () => {
  const empower = [
    card("stamina", {
      name: "Empower Self",
      subname: "Stamina",
      myriad: true,
      deck_limit: 1,
      text: "Myriad. Limit 1 Empower Self (Stamina) per deck.",
      xp: 2,
    }),
    card("alacrity", {
      name: "Empower Self",
      subname: "Alacrity",
      myriad: true,
      deck_limit: 1,
      text: "Myriad. Limit 1 Empower Self (Alacrity) per deck.",
      xp: 2,
    }),
  ];
  assert.equal(
    validateDeck(
      "i",
      [
        { code: "stamina", quantity: 1 },
        { code: "alacrity", quantity: 1 },
        ...base.filter((s) => s.code !== "a"),
      ],
      fixture({}, empower),
    ).valid,
    true,
  );
  assert.ok(
    issue(
      validateDeck("i", replace(base, "a", "stamina", 2), fixture({}, empower)),
      "copy-limit",
    ),
  );
  const dogs = [
    { code: "08127", quantity: 4 },
    ...base.filter((s) => ["sig", "weak", "basic"].includes(s.code)),
  ];
  assert.equal(
    validateDeck("i", dogs, [...fixture(), catalogMap.get("08127")!]).valid,
    true,
  );
});

test("unknown schema, malformed values, restrictions and customization block certification", () => {
  assert.ok(
    issue(
      validateDeck(
        "i",
        base,
        fixture({
          deck_options: [{ faction: ["guardian"], unimplemented_cost: 3 }],
        }),
      ),
      "unsupported-option",
    ),
  );
  assert.ok(
    issue(
      validateDeck(
        "i",
        base,
        fixture({ deck_options: [{ faction: "guardian" }] }),
      ),
      "unsupported-option",
    ),
  );
  assert.ok(
    issue(
      validateDeck(
        "i",
        base,
        fixture({
          deck_requirements:
            "size:4, card:sig, card:weak, random:subtype:basicweakness, choose:anything",
        }),
      ),
      "unsupported-requirement",
    ),
  );
  assert.ok(
    issue(
      validateDeck(
        "i",
        replace(base, "a", "unknown", 1),
        fixture({}, [card("unknown", { restrictions: "test:new" })]),
      ),
      "unsupported-restriction",
    ),
  );
  assert.ok(
    issue(
      validateDeck(
        "i",
        replace(base, "a", "custom", 1),
        fixture({}, [card("custom", { customization_options: [{ xp: 1 }] })]),
      ),
      "unsupported-customization",
    ),
  );
});

test("signature and trait restrictions, story awards, bonded cards, rewards and trauma are enforced", () => {
  const cards = fixture({}, [
    card("foreign", { restrictions: "investigator:other" }),
    card("trait", { restrictions: "trait:scholar" }),
    card("story", { xp: undefined }),
    card("bonded", { deck_limit: 0, bonded_to: "a", bonded_count: 3 }),
    card("reward", { text: "Reward." }),
  ]);
  assert.ok(
    issue(
      validateDeck("i", replace(base, "a", "foreign", 1), cards),
      "card-restriction",
    ),
  );
  assert.ok(
    issue(
      validateDeck("i", replace(base, "a", "trait", 1), cards),
      "card-restriction",
    ),
  );
  assert.equal(
    validateDeck("i", [...base, { code: "story", quantity: 1 }], cards, {
      storyCards: ["story"],
    }).valid,
    true,
  );
  assert.ok(
    issue(
      validateDeck("i", [...base, { code: "bonded", quantity: 1 }], cards),
      "bonded-card",
    ),
  );
  assert.ok(
    issue(validateDeck("i", replace(base, "a", "reward", 1), cards), "reward"),
  );
  assert.equal(
    validateDeck("i", replace(base, "a", "reward", 1), cards, {
      earnedRewards: ["reward"],
    }).valid,
    true,
  );
  assert.ok(
    issue(validateDeck("i", base, cards, { physicalTrauma: 8 }), "trauma"),
  );
  assert.deepEqual(prepareDeck("i", base, cards).setAside, [
    "bonded",
    "bonded",
    "bonded",
  ]);
});

test("Starting selection is explicit and moves only one physical copy to the opening hand", () => {
  const starting = card("start", {
    text: "Starting. You may begin with this card.",
  });
  const slots = replace(base, "a", "start", 2);
  const cards = fixture({}, [starting]);
  const unchosen = prepareDeck("i", slots, cards);
  assert.equal(unchosen.validation.valid, true);
  assert.deepEqual(unchosen.startingHand, []);
  assert.deepEqual(unchosen.startingChoices, ["start"]);
  const chosen = prepareDeck("i", slots, cards, { startingCard: "start" });
  assert.deepEqual(chosen.startingHand, ["start"]);
  assert.equal(chosen.deck.filter((code) => code === "start").length, 1);
  assert.equal(
    prepareDeck("i", slots, cards, { startingCard: "a" }).validation.valid,
    false,
  );
});

test("normal upgrades charge level difference per copy and reject missing cards or insufficient XP", () => {
  const upgrade = card("a2", { name: "a", xp: 2 });
  const cards = fixture({}, [upgrade]);
  const change = {
    remove: [{ code: "a", quantity: 1 }],
    add: [{ code: "a2", quantity: 1 }],
  };
  const result = upgradeDeck("i", base, change, cards, 3);
  assert.equal(result.valid, true, JSON.stringify(result.validation.issues));
  assert.equal(result.cost, 2);
  assert.equal(result.remainingXp, 1);
  assert.equal(upgradeDeck("i", base, change, cards, 1).valid, false);
  assert.equal(
    upgradeDeck(
      "i",
      base,
      { remove: [{ code: "missing", quantity: 1 }], add: [] },
      cards,
      3,
    ).valid,
    false,
  );
});

test("standalone XP adds basic weaknesses and an explicit budget blocks overspending", () => {
  const costly = card("costly", { xp: 5 });
  const extra = card("extra-basic", {
    xp: undefined,
    type_code: "treachery",
    subtype_code: "basicweakness",
    deck_limit: 1,
  });
  const cards = fixture({}, [costly, extra]);
  const slots = replace(base, "a", "costly", 2);
  assert.ok(
    issue(validateDeck("i", slots, cards, { availableXp: 9 }), "xp-budget"),
  );
  assert.ok(
    issue(
      validateDeck("i", slots, cards, { standalone: true }),
      "basic-weakness",
    ),
  );
  assert.equal(
    validateDeck("i", [...slots, { code: "extra-basic", quantity: 1 }], cards, {
      standalone: true,
    }).valid,
    true,
  );
});

test("signature alternatives require complete standard, replacement or advanced bundles", () => {
  const cards = fixture(
    {
      deck_requirements:
        "size:4, card:sig:sig-r:sig-a, card:weak:weak-r:weak-a, random:subtype:basicweakness",
    },
    [
      card("sig-r", {
        xp: undefined,
        deck_limit: 1,
        text: "Test Investigator deck only. Replacement.",
      }),
      card("weak-r", {
        xp: undefined,
        deck_limit: 1,
        subtype_code: "weakness",
        type_code: "treachery",
        text: "Test Investigator deck only. Replacement.",
      }),
      card("sig-a", {
        xp: undefined,
        deck_limit: 1,
        text: "Test Investigator deck only. Advanced.",
      }),
      card("weak-a", {
        xp: undefined,
        deck_limit: 1,
        subtype_code: "weakness",
        type_code: "treachery",
        text: "Test Investigator deck only. Advanced.",
      }),
    ],
  );
  assert.equal(
    validateDeck(
      "i",
      replace(replace(base, "sig", "sig-r", 1), "weak", "weak-r", 1),
      cards,
    ).valid,
    true,
  );
  assert.equal(
    validateDeck(
      "i",
      replace(replace(base, "sig", "sig-a", 1), "weak", "weak-a", 1),
      cards,
    ).valid,
    true,
  );
  assert.equal(
    validateDeck("i", replace(base, "sig", "sig-r", 1), cards).valid,
    false,
  );
  assert.ok(
    issue(
      validateDeck("i", replace(base, "sig", "sig-a", 1), cards),
      "signature-bundle",
    ),
  );
  assert.equal(
    validateDeck(
      "i",
      [
        ...base,
        { code: "sig-r", quantity: 1 },
        { code: "weak-r", quantity: 1 },
      ],
      cards,
    ).valid,
    true,
  );
});

test("one Silas replacement signature can replace both original required signature cards", () => {
  const cards = fixture(
    {
      deck_requirements:
        "size:4, card:sig:replacement, card:second:replacement, card:weak:weak-r, random:subtype:basicweakness",
    },
    [
      card("second", { xp: undefined, deck_limit: 1 }),
      card("replacement", {
        xp: undefined,
        deck_limit: 1,
        text: "Replacement.",
      }),
      card("weak-r", {
        xp: undefined,
        deck_limit: 1,
        subtype_code: "weakness",
        type_code: "treachery",
        text: "Replacement.",
      }),
    ],
  );
  assert.equal(
    validateDeck("i", [...base, { code: "second", quantity: 1 }], cards).valid,
    true,
  );
  assert.equal(
    validateDeck(
      "i",
      replace(replace(base, "sig", "replacement", 1), "weak", "weak-r", 1),
      cards,
    ).valid,
    true,
  );
});

test("real Mandy signatures scale with the selected 30/40/50 deck size", () => {
  const neutral = Array.from({ length: 25 }, (_, i) =>
    card(`neutral-${i}`, { faction_code: "neutral" }),
  );
  const cards = [
    ...catalogCards,
    ...neutral,
    fixture().find((c) => c.code === "basic")!,
  ];
  for (const size of [30, 40, 50]) {
    const options: DeckOptions = {
      selections: { "Deck Size": String(size), "Secondary Class": "mystic" },
    };
    const slots = [
      ...neutral.slice(0, size / 2).map((c) => ({ code: c.code, quantity: 2 })),
      { code: "06008", quantity: (size - 20) / 10 },
      { code: "06009", quantity: 1 },
      { code: "basic", quantity: 1 },
    ];
    const validation = validateDeck("06002", slots, cards, options);
    assert.equal(validation.valid, true, JSON.stringify(validation.issues));
    assert.equal(validation.deckSize, size);
    assert.ok(
      issue(
        validateDeck(
          "06002",
          slots.map((s) =>
            s.code === "06008" ? { ...s, quantity: s.quantity + 1 } : s,
          ),
          cards,
          options,
        ),
        "required-card",
      ),
    );
  }
});

test("real Vincent puts one On the Mend per investigator aside and Lily records her chosen Discipline", () => {
  const neutral = Array.from({ length: 15 }, (_, i) =>
    card(`neutral-${i}`, { faction_code: "neutral" }),
  );
  const cards = [
    ...catalogCards,
    ...neutral,
    fixture().find((c) => c.code === "basic")!,
  ];
  const main = neutral.map((c) => ({ code: c.code, quantity: 2 }));
  const vincent = prepareDeck(
    "09004",
    [
      ...main,
      { code: "09005", quantity: 1 },
      { code: "09006", quantity: 3 },
      { code: "09007", quantity: 1 },
      { code: "basic", quantity: 1 },
    ],
    cards,
    { playerCount: 3 },
  );
  assert.equal(
    vincent.validation.valid,
    true,
    JSON.stringify(vincent.validation.issues),
  );
  assert.deepEqual(vincent.setAside, ["09006", "09006", "09006"]);
  assert.ok(!vincent.deck.includes("09006"));
  const lilySlots = [
    ...main,
    { code: "08011a", quantity: 1 },
    { code: "08015", quantity: 1 },
    { code: "basic", quantity: 1 },
  ];
  const lily = prepareDeck("08010", lilySlots, cards);
  assert.equal(
    lily.validation.valid,
    true,
    JSON.stringify(lily.validation.issues),
  );
  assert.deepEqual(lily.permanents, ["08011a"]);
  assert.ok(
    issue(
      validateDeck(
        "08010",
        lilySlots.filter((s) => s.code !== "08011a"),
        cards,
      ),
      "discipline",
    ),
  );
});

test("parallel Jim requires a separate spirit deck with nine different level 0–2 allies", () => {
  const neutral = Array.from({ length: 15 }, (_, i) =>
    card(`neutral-${i}`, { faction_code: "neutral" }),
  );
  const allies = Array.from({ length: 9 }, (_, i) =>
    card(`ally-${i}`, { faction_code: "neutral", traits: "Ally.", xp: 1 }),
  );
  const cards = [
    ...catalogCards,
    ...neutral,
    ...allies,
    fixture().find((c) => c.code === "basic")!,
  ];
  const slots = [
    ...neutral.map((c) => ({ code: c.code, quantity: 2 })),
    { code: "02012", quantity: 1 },
    { code: "02013", quantity: 1 },
    { code: "90052", quantity: 1 },
    { code: "basic", quantity: 1 },
  ];
  assert.ok(issue(validateDeck("90049", slots, cards), "side-deck"));
  const sideDeck = [
    ...allies.map((c) => ({ code: c.code, quantity: 1 })),
    { code: "90053", quantity: 1 },
  ];
  const prepared = prepareDeck("90049", slots, cards, { sideDeck });
  assert.equal(
    prepared.validation.valid,
    true,
    JSON.stringify(prepared.validation.issues),
  );
  assert.equal(prepared.sideDeck.length, 10);
  assert.equal(prepared.validation.xp, 9);
  assert.ok(!prepared.deck.includes("90053"));
  assert.ok(
    issue(
      validateDeck("90049", slots, cards, {
        sideDeck: replace(sideDeck, "ally-1", "ally-0", 1),
      }),
      "side-deck",
    ),
  );
});

test("exceptional upgrades subtract the effective old XP cost and permanents cannot be removed", () => {
  const cards = fixture(
    {
      deck_requirements:
        "size:3, card:sig, card:weak, random:subtype:basicweakness",
    },
    [
      card("a-old", { name: "a", xp: 1 }),
      card("a-exceptional", { name: "a", xp: 2, exceptional: true }),
      card("permanent", { permanent: true, deck_limit: 1 }),
    ],
  );
  const threeCardDeck = base.map((s) =>
    s.code === "a" ? { ...s, quantity: 1 } : s,
  );
  const current = replace(threeCardDeck, "a", "a-old", 1);
  const result = upgradeDeck(
    "i",
    current,
    {
      remove: [{ code: "a-old", quantity: 1 }],
      add: [{ code: "a-exceptional", quantity: 1 }],
    },
    cards,
    3,
  );
  assert.equal(result.valid, true, JSON.stringify(result.validation.issues));
  assert.equal(result.cost, 3);
  const removePermanent = upgradeDeck(
    "i",
    [...threeCardDeck, { code: "permanent", quantity: 1 }],
    { remove: [{ code: "permanent", quantity: 1 }], add: [] },
    cards,
    3,
  );
  assert.ok(issue(removePermanent.validation, "permanent-remove"));
});

test("every imported investigator deck schema is recognized, while artwork-dependent Barkham rules stay blocked", () => {
  for (const investigator of catalogCards.filter(
    (c) =>
      c.type_code === "investigator" &&
      c.deck_requirements &&
      !c.miniature &&
      !c.hidden,
  )) {
    const validation = validateDeck(investigator.code, [], catalogMap, {
      barkham: investigator.code.startsWith("barkham"),
    });
    const unsupported = validation.issues.filter(
      (i) => i.severity === "unsupported" || i.code === "missing-definition",
    );
    if (
      ["barkham-004", "barkham-007", "barkham-010", "barkham-013"].includes(
        investigator.code,
      )
    )
      assert.ok(unsupported.length > 0);
    else
      assert.deepEqual(
        unsupported,
        [],
        `${investigator.name} ${investigator.code}`,
      );
  }
});

test("Barkham's deliberate player judgments preserve class limits, levels and Duke's cat prohibition", () => {
  const barkhamDeck = (code: string, size: number, extras: Card[]) => {
    const original = catalogMap.get(code)!;
    const edited = {
      ...original,
      deck_requirements: original.deck_requirements!.replace(
        "size:30",
        `size:${size}`,
      ),
    };
    const definitions = new Map(catalogMap);
    definitions.set(code, edited);
    for (const extra of [
      ...extras,
      card("basic", {
        type_code: "treachery",
        subtype_code: "basicweakness",
        xp: undefined,
      }),
    ])
      definitions.set(extra.code, extra);
    const required = [
      ...edited.deck_requirements!.matchAll(/card:([^,]+)/g),
    ].map((m) => ({ code: m[1], quantity: 1 }));
    return {
      definitions,
      required: [...required, { code: "basic", quantity: 1 }],
    };
  };
  const judgments = {
    eligibleOffClassCards: ["off", "off2", "off3"],
    catCards: [],
    artworkReviewed: true,
  };
  const options = { barkham: true, barkhamJudgments: judgments };
  const kate = barkhamDeck("barkham-004", 4, [card("off"), card("off2")]);
  const slots = [
    { code: "off", quantity: 2 },
    { code: "off2", quantity: 2 },
    ...kate.required,
  ];
  assert.equal(
    validateDeck("barkham-004", slots, kate.definitions, options).valid,
    true,
  );
  assert.ok(
    issue(
      validateDeck("barkham-004", slots, kate.definitions, { barkham: true }),
      "unsupported-rule",
    ),
  );
  kate.definitions.set("off", card("off", { xp: 1 }));
  assert.ok(
    issue(
      validateDeck("barkham-004", slots, kate.definitions, options),
      "illegal-card",
    ),
  );
  const overLimit = barkhamDeck("barkham-004", 6, [
    card("off"),
    card("off2"),
    card("off3"),
  ]);
  assert.ok(
    issue(
      validateDeck(
        "barkham-004",
        [
          ...["off", "off2", "off3"].map((code) => ({ code, quantity: 2 })),
          ...overLimit.required,
        ],
        overLimit.definitions,
        options,
      ),
      "barkham-option-limit",
    ),
  );
  const duke = barkhamDeck("barkham-013", 4, [
    card("off", { slot: "Ally" }),
    card("survivor", { faction_code: "survivor" }),
  ]);
  const dukeSlots = [
    { code: "off", quantity: 2 },
    { code: "survivor", quantity: 2 },
    ...duke.required,
  ];
  assert.equal(
    validateDeck("barkham-013", dukeSlots, duke.definitions, options).valid,
    true,
  );
  assert.ok(
    issue(
      validateDeck("barkham-013", dukeSlots, duke.definitions, {
        ...options,
        barkhamJudgments: { ...judgments, artworkReviewed: false },
      }),
      "barkham-artwork",
    ),
  );
  assert.ok(
    issue(
      validateDeck("barkham-013", dukeSlots, duke.definitions, {
        ...options,
        barkhamJudgments: { ...judgments, catCards: ["survivor"] },
      }),
      "barkham-cat",
    ),
  );
  duke.definitions.set(
    "survivor",
    card("survivor", { faction_code: "survivor", traits: "Creature. Cat." }),
  );
  assert.ok(
    issue(
      validateDeck("barkham-013", dukeSlots, duke.definitions, options),
      "barkham-cat",
    ),
  );
  duke.definitions.set("off", card("off"));
  assert.ok(
    issue(
      validateDeck("barkham-013", dukeSlots, duke.definitions, options),
      "illegal-card",
    ),
  );
});
