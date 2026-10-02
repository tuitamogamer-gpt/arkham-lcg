import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
// @ts-expect-error The import boundary is the plain-JavaScript CLI tested below.
import { expandDefinitions, buildCatalog } from "../scripts/sync-cards.mjs";

const read = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../public/data/${name}`, import.meta.url), "utf8"),
  );
const catalog = read("catalog.json");
const cards = catalog.cardFiles.flatMap((file: string) =>
  read(file.split("/").at(-1)!),
);
const byCode = new Map<string, any>(
  cards.map((card: any) => [card.code, card]),
);

test("duplicate chains keep edition overrides and hidden faces; malformed chains cannot replace snapshots", () => {
  const raw = [
    {
      code: "a",
      name: "Original",
      type_code: "asset",
      pack_code: "core",
      text: "Original text",
    },
    {
      code: "b",
      duplicate_of: "a",
      pack_code: "rcore",
      text: "Corrected text",
    },
    { code: "c", duplicate_of: "b", pack_code: "core_2026", hidden: true },
  ];
  const expanded = expandDefinitions(raw);
  assert.equal(expanded[2].code, "c");
  assert.equal(expanded[2].text, "Corrected text");
  assert.equal(expanded[2].name, "Original");
  assert.equal(expanded[2].hidden, true);
  assert.equal(expanded[2].pack_code, "core_2026");
  assert.deepEqual(raw[2], {
    code: "c",
    duplicate_of: "b",
    pack_code: "core_2026",
    hidden: true,
  });
  assert.equal(expandDefinitions([raw[0], raw[0]]).length, 1);
  assert.throws(
    () => expandDefinitions([raw[0], { ...raw[0], text: "Conflicting" }]),
    /Conflicting duplicate/,
  );
  assert.throws(
    () => expandDefinitions([{ code: "a", duplicate_of: "b" }]),
    /Missing duplicate parent/,
  );
  assert.throws(
    () =>
      expandDefinitions([
        { code: "a", duplicate_of: "b" },
        { code: "b", duplicate_of: "a" },
      ]),
    /Circular duplicate/,
  );
});

test("release cutoff excludes preview products while repository rules override API text", () => {
  const source = {
    definitions: [
      {
        code: "a",
        name: "Released",
        type_code: "asset",
        pack_code: "released",
        text: "Correct rules",
        position: 1,
      },
      {
        code: "b",
        duplicate_of: "unpublished-parent",
        pack_code: "future",
        position: 1,
      },
    ],
    packs: [
      {
        code: "released",
        name: "Released Pack",
        cycle_code: "side_stories",
        date_release: "2026-09-30",
        position: 1,
      },
      {
        code: "future",
        name: "Future Preview",
        cycle_code: "side_stories",
        date_release: "2026-10-01",
        position: 2,
      },
    ],
    cycles: [{ code: "side_stories", name: "Side Stories" }],
    encounters: [],
    factions: [],
    types: [],
    subtypes: [],
    taboos: [],
    revision: "test",
    cardSources: new Map(),
  };
  const built = buildCatalog(source, "2026-09-30", [
    {
      code: "a",
      name: "Incorrect API name",
      text: "Stale rules",
      imagesrc: "/bundles/cards/a.jpg",
    },
  ]);
  assert.deepEqual(
    built.cards.map((card: any) => card.code),
    ["a"],
  );
  assert.deepEqual(
    built.manifest.products.map((product: any) => product.code),
    ["released"],
  );
  assert.equal(built.cards[0].name, "Released");
  assert.equal(built.cards[0].text, "Correct rules");
  assert.equal(built.cards[0].imagesrc, "/bundles/cards/a.jpg");
});

test("every released definition and product reference is valid, with distinct printings preserved", () => {
  assert.equal(byCode.size, cards.length);
  assert.equal(catalog.counts.cardCount, cards.length);
  assert.equal(
    catalog.counts.packCount,
    new Set(cards.map((card: any) => card.pack_code)).size,
  );
  assert.equal(catalog.counts.productCount, catalog.products.length);
  assert.equal(
    catalog.counts.hiddenFaceCount,
    cards.filter((card: any) => card.hidden).length,
  );
  assert.equal(
    catalog.counts.investigatorCount,
    cards.filter((card: any) => card.type_code === "investigator").length,
  );
  assert.ok(cards.length > 6000);
  for (const card of cards)
    assert.ok(card.name && card.type_code && card.pack_code);
  for (const product of catalog.products) {
    assert.ok(product.releaseDate <= catalog.asOf, product.name);
    assert.ok(product.cardCodes.length > 0, product.name);
    assert.equal(new Set(product.cardCodes).size, product.cardCodes.length);
    for (const code of [...product.cardCodes, ...product.investigatorCodes])
      assert.ok(byCode.has(code), `${product.code}: ${code}`);
  }
  assert.ok(catalog.products.some((product: any) => product.code === "cob"));
  assert.ok(
    !catalog.products.some((product: any) =>
      /Traces to Nowhere/.test(product.name),
    ),
  );
  assert.equal(byCode.get("60251").faction_code, "seeker");
  assert.equal(byCode.get("05001").faction_code, "guardian");
  assert.ok(byCode.has("01001") && byCode.has("01501") && byCode.has("12001"));
});

test("split campaign and investigator boxes partition legacy content, retaining scenario rewards", () => {
  for (const cycle of ["dwl", "ptc", "tfa", "tcu", "tde", "tic"]) {
    const player = catalog.products.find(
      (product: any) => product.code === `${cycle}p`,
    );
    const campaign = catalog.products.find(
      (product: any) => product.code === `${cycle}c`,
    );
    const originals = new Set<string>(
      catalog.products
        .filter((product: any) => player.reprintOf.includes(product.code))
        .flatMap((product: any) => product.cardCodes),
    );
    assert.equal(player.kind, "investigator-expansion");
    assert.equal(campaign.kind, "campaign-expansion");
    assert.ok(player.investigatorCodes.length >= 5);
    const left = new Set(player.cardCodes);
    assert.ok(campaign.cardCodes.every((code: string) => !left.has(code)));
    assert.deepEqual(
      new Set([...player.cardCodes, ...campaign.cardCodes]),
      originals,
    );
  }
  const campaign = catalog.products.find(
    (product: any) => product.code === "dwlc",
  );
  assert.ok(
    campaign.cardCodes.some(
      (code: string) => byCode.get(code).name === "Dr. Francis Morgan",
    ),
  );
});

test("starter lists separate the sold level-zero deck, required cards and upgrade supply", () => {
  assert.equal(catalog.starterDecks.length, 15);
  const sold = catalog.starterDecks.filter(
    (deck: any) => deck.kind === "preconstructed",
  );
  assert.equal(sold.length, 10);
  for (const deck of catalog.starterDecks) {
    assert.equal(
      deck.totalCards,
      deck.slots.reduce((sum: number, slot: any) => sum + slot.quantity, 0),
    );
    assert.ok(
      deck.slots.every(
        (slot: any) =>
          byCode.has(slot.code) &&
          slot.code !== deck.investigatorCode &&
          !(byCode.get(slot.code).xp > 0),
      ),
    );
    assert.ok(
      deck.upgrades.every(
        (slot: any) => byCode.has(slot.code) && byCode.get(slot.code).xp > 0,
      ),
    );
  }
  for (const deck of sold) {
    assert.equal(
      deck.slots
        .filter((slot: any) => byCode.get(slot.code).xp === 0)
        .reduce((sum: number, slot: any) => sum + slot.quantity, 0),
      30,
    );
    assert.equal(
      deck.slots.filter(
        (slot: any) => byCode.get(slot.code).subtype_code === "basicweakness",
      ).length,
      1,
    );
    assert.ok(deck.upgrades.length > 0);
  }
  assert.equal(
    sold.find((deck: any) => deck.productCode === "ste").totalCards,
    35,
  );
  assert.equal(
    sold.find((deck: any) => deck.productCode === "and").totalCards,
    35,
  );
});

test("lazy shards stay below cache limits and match recorded integrity hashes; taboo remains optional", () => {
  const provenance = read("catalog-source.json");
  for (const file of provenance.cardFiles) {
    const body = readFileSync(
      new URL(`../public/data/${file.name}`, import.meta.url),
    );
    assert.ok(body.byteLength <= 1_800_000);
    assert.equal(body.byteLength, file.bytes);
    assert.equal(createHash("sha256").update(body).digest("hex"), file.sha256);
    assert.equal(JSON.parse(body.toString()).length, file.count);
  }
  const metadata = read("catalog-metadata.json");
  assert.ok(metadata.taboos.length >= 10);
  assert.ok(
    metadata.taboos.every((taboo: any) => taboo.date_start <= catalog.asOf),
  );
  assert.equal(byCode.get("01020").xp, 0);
  assert.equal(read("core-2026.json").length, 196);
});

test("official Barkham supplement retains its restricted box and minis; convention art reuses printed rules", () => {
  const barkham = cards.filter((card: any) => card.pack_code === "barkham");
  const fullSize = barkham.filter((card: any) => !card.miniature);
  const minis = barkham.filter((card: any) => card.miniature);
  assert.equal(barkham.length, 62);
  assert.equal(fullSize.length, 57);
  assert.equal(
    fullSize.reduce((sum: number, card: any) => sum + card.quantity, 0),
    78,
  );
  assert.equal(minis.length, 5);
  assert.ok(
    minis.every((card: any) => card.hidden && byCode.has(card.duplicate_of)),
  );
  assert.ok(
    barkham.every((card: any) => card.content_restriction === "barkham_only"),
  );
  const product = catalog.products.find(
    (product: any) => product.code === "barkham",
  );
  assert.equal(product.investigatorCodes.length, 5);
  assert.equal(product.contentRestriction, "barkham_only");
  assert.ok(
    !catalog.starterDecks.some((deck: any) => deck.productCode === "barkham"),
  );
  const promo = catalog.products.find(
    (product: any) => product.code === "convention_2025",
  );
  assert.equal(promo.artworkVariant, true);
  assert.equal(promo.releaseDate, "2025");
  assert.equal(promo.releaseDatePrecision, "year");
  assert.deepEqual(
    new Set(promo.cardCodes),
    new Set(["72044", "72032", "72055"]),
  );
  assert.ok(
    promo.cardCodes.every(
      (code: string) => byCode.get(code).pack_code === "film_fatale",
    ),
  );
});
