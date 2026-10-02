import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const repository = "https://github.com/zzorba/arkhamdb-json-data";
const api = "https://arkhamdb.com/api/public/cards?encounter=1";
const rulebook =
  "https://images-cdn.fantasyflightgames.com/filer_public/0e/d0/0ed09507-1705-47ed-a630-cd15885cabb0/ahc100_rulebook-web.pdf";
const SHARD_BYTES = 1_800_000;
const CONVENTION_PROMOS = [
  {
    code: "convention_2025",
    name: "2025 Convention Promo Cards",
    cycle_code: "promotional",
    position: 31,
    date_release: "2025",
    releaseDateBasis: "official-year",
    releaseDatePrecision: "year",
    cardCodes: ["72044", "72032", "72055"],
    artworkVariant: true,
    description:
      "Official convention alternate-art faces for Allosaurus, Saturnite Monarch and The Contessa. Printed rules are shared with Film Fatale.",
    sourceUrl:
      "https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/gcop2501_arkham_lcg_convention_promo_cards.pdf",
  },
];
const CORE_STARTERS = {
  12004: [
    30, 31, 32, 33, 34, 35, 16, 17, 18, 19, 20, 21, 87, 87, 88, 88, 5, 36, 37,
    38, 22, 23, 24, 89, 89, 39, 25, 93, 93, 92, 92, 6, 100,
  ],
  12001: [
    2, 16, 17, 18, 19, 20, 21, 72, 73, 74, 75, 76, 77, 86, 86, 88, 88, 22, 23,
    24, 78, 79, 89, 89, 25, 80, 81, 92, 92, 94, 94, 3, 104,
  ],
  12007: [
    8, 44, 45, 46, 47, 48, 49, 30, 31, 32, 33, 34, 35, 86, 86, 88, 88, 50, 51,
    52, 36, 37, 38, 89, 89, 53, 39, 91, 91, 93, 93, 9, 103,
  ],
  12010: [
    58, 59, 60, 61, 62, 63, 44, 45, 46, 47, 48, 49, 86, 86, 88, 88, 11, 64, 65,
    66, 50, 51, 52, 89, 89, 67, 53, 90, 90, 91, 91, 12, 101,
  ],
  12013: [
    14, 72, 73, 74, 75, 76, 77, 58, 59, 60, 61, 62, 63, 86, 86, 88, 88, 78, 79,
    64, 65, 66, 89, 89, 80, 81, 67, 94, 94, 90, 90, 15, 102,
  ],
};
// Upstream repackage dates are synthetic. Overrides cite publisher release
// news or Asmodee USA's primary product catalog.
const publisherCatalog = "https://www.asmodeena.com/AUSA-Active-06012026.pdf";
const newStarterRelease =
  "https://www.arkhamhorror.com/news/investigator-decks-for-arkham-horror-are-on-sale-now/";
const RELEASE_CORRECTIONS = {
  rcore: [
    "2021-10-01",
    "https://b2b-media-production-ana.s3.amazonaws.com/filer_public/af/c6/afc66484-6623-4090-b1e5-233cdcfd1a98/ausa-active-10012024.pdf",
  ],
  core_2026: ["2026-03-20", publisherCatalog],
  tom: ["2026-04-17", newStarterRelease],
  car: ["2026-04-17", newStarterRelease],
  and: ["2026-04-17", newStarterRelease],
  mar: ["2026-04-17", newStarterRelease],
  mig: ["2026-04-17", newStarterRelease],
  tcuc: ["2023-07-14", publisherCatalog],
  tdec: ["2024-06-28", publisherCatalog],
  ticp: ["2024-09-13", publisherCatalog],
  ticc: ["2024-10-18", publisherCatalog],
  tdcp: ["2025-03-07", publisherCatalog],
  dwlp: [
    "2022-02-25",
    "https://www.fantasyflightgames.com/en/news/2022/2/25/available-now-february-25/",
  ],
  dwlc: [
    "2022-03-18",
    "https://drafts.fantasyflightgames.com/en/news/2022/3/18/available-now-march-18/",
  ],
  tdcc: [
    "2025-04-04",
    "https://www.fantasyflightgames.com/en/news/2025/4/4/available-now-april-4-1/",
  ],
  ptcp: [
    "2022-05-27",
    "https://www.fantasyflightgames.com/en/news/2022/5/27/available-now-may-27/",
  ],
  ptcc: [
    "2022-07-01",
    "https://www.fantasyflightgames.com/en/news/2022/7/1/available-now-july-1/",
  ],
  tfap: [
    "2023-02-17",
    "https://www.fantasyflightgames.com/en/news/2023/2/17/available-now-february-17/",
  ],
  tfac: [
    "2023-03-17",
    "https://www.fantasyflightgames.com/en/news/2023/3/17/available-now-march-17/",
  ],
  tcup: [
    "2023-06-09",
    "https://www.fantasyflightgames.com/en/news/2023/6/9/available-now-june-9/",
  ],
  tdep: [
    "2024-05-10",
    "https://www.fantasyflightgames.com/en/news/2024/5/10/available-now-may-10/",
  ],
  cob: ["2026-08-14", "https://www.arkhamhorror.com/news/the-ravenous-undead/"],
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const releasedOn = (pack) =>
  RELEASE_CORRECTIONS[pack.code]?.[0] ?? pack.date_release;

/** Retain each printing's identity and overrides while expanding duplicate chains. */
export function expandDefinitions(definitions, requestedCodes) {
  const all = new Map(),
    expanded = new Map();
  for (const card of definitions) {
    if (!card?.code) throw new Error("Card definition is missing its code");
    if (
      all.has(card.code) &&
      JSON.stringify(all.get(card.code)) !== JSON.stringify(card)
    )
      throw new Error(`Conflicting duplicate card code ${card.code}`);
    all.set(card.code, card);
  }
  function expand(code, seen = new Set()) {
    if (seen.has(code)) throw new Error(`Circular duplicate chain at ${code}`);
    if (expanded.has(code)) return expanded.get(code);
    const card = all.get(code);
    if (!card) throw new Error(`Missing duplicate parent ${code}`);
    seen.add(code);
    const result = card.duplicate_of
      ? { ...expand(card.duplicate_of, seen), ...card }
      : { ...card };
    expanded.set(code, result);
    return result;
  }
  return (requestedCodes || [...all.keys()]).map((code) => expand(code));
}

export function productKind(pack) {
  if (["core", "core_ch2"].includes(pack.cycle_code)) return "core";
  if (["investigator", "investigator_decks_ch2"].includes(pack.cycle_code))
    return "starter-deck";
  if (pack.cycle_code === "return") return "return-to";
  if (pack.cycle_code === "parallel") return "parallel";
  if (pack.cycle_code === "side_stories") return "standalone";
  if (pack.cycle_code === "small_campaign_expansions") return "small-campaign";
  if (pack.cycle_code === "promotional")
    return pack.code === "promo" || pack.artworkVariant ? "promo" : "novella";
  if (
    pack.reprint_type === "player" ||
    /Investigator Expansion$/.test(pack.name)
  )
    return "investigator-expansion";
  if (pack.reprint_type === "campaign" || /Campaign Expansion$/.test(pack.name))
    return "campaign-expansion";
  return pack.position === 1 ? "deluxe" : "mythos";
}

export async function readRepository(sourceDir) {
  const [packs, cycles, encounters, factions, types, subtypes, taboos] =
    await Promise.all(
      [
        "packs",
        "cycles",
        "encounters",
        "factions",
        "types",
        "subtypes",
        "taboos",
      ].map((name) => json(join(sourceDir, `${name}.json`))),
    );
  const definitions = [],
    files = [],
    cardSources = new Map();
  async function visit(path) {
    const entries = (await readdir(path, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const filePath = join(path, entry.name);
      if (entry.isDirectory()) await visit(filePath);
      else if (entry.name.endsWith(".json")) {
        const body = await readFile(filePath, "utf8"),
          cards = JSON.parse(body);
        if (!Array.isArray(cards))
          throw new Error(`Invalid card file ${filePath}`);
        files.push({
          path: relative(sourceDir, filePath),
          count: cards.length,
          sha256: hash(body),
        });
        for (const card of cards) {
          definitions.push(card);
          cardSources.set(card.code, relative(sourceDir, filePath));
        }
      }
    }
  }
  await visit(join(sourceDir, "pack"));
  const supplements = [];
  for (const name of ["barkham"]) {
    const file = new URL(`./data/${name}.json`, import.meta.url);
    let body;
    try {
      body = await readFile(file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const cards = JSON.parse(body);
    const metadata = await json(
      new URL(`./data/${name}-source.json`, import.meta.url),
    );
    if (
      !Array.isArray(cards) ||
      !cards.length ||
      cards.some((card) => card.pack_code !== metadata.pack.code)
    )
      throw new Error(`Invalid ${name} supplement`);
    definitions.push(...cards);
    packs.push({
      ...metadata.pack,
      releaseDateBasis: "official-announcement",
      contentRestriction: "barkham_only",
      description:
        "Official canine investigators and standalone scenario. Barkham cards are restricted to the Barkham scenario.",
    });
    encounters.push(...metadata.encounterSets);
    for (const card of cards)
      cardSources.set(card.code, `scripts/data/${name}.json`);
    files.push({
      path: `scripts/data/${name}.json`,
      count: cards.length,
      sha256: hash(body),
    });
    supplements.push(metadata);
  }
  const revision = execFileSync("git", ["-C", sourceDir, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  packs.push(...CONVENTION_PROMOS);
  return {
    definitions,
    packs,
    cycles,
    encounters,
    factions,
    types,
    subtypes,
    taboos,
    files,
    cardSources,
    revision,
    supplements,
  };
}

export function buildCatalog(source, asOf, apiCards = [], previousCards = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf))
    throw new Error("--as-of must be YYYY-MM-DD");
  const packs = source.packs.filter(
    (pack) => releasedOn(pack) && releasedOn(pack) <= asOf,
  );
  const releasedPacks = new Set(packs.map((pack) => pack.code));
  const apiMap = new Map(apiCards.map((card) => [card.code, card])),
    oldMap = new Map(previousCards.map((card) => [card.code, card]));
  const knownPacks = new Set(source.packs.map((pack) => pack.code));
  for (const card of source.definitions)
    if (!knownPacks.has(card.pack_code))
      throw new Error(`Unknown product ${card.pack_code} for ${card.code}`);
  // Excluded preview cards may be incomplete. Resolve released printings and
  // their ancestors only, without requiring every future preview to validate.
  const requested = [
    ...new Set(
      source.definitions
        .filter((card) => releasedPacks.has(card.pack_code))
        .map((card) => card.code),
    ),
  ];
  const expanded = expandDefinitions(source.definitions, requested),
    definitionMap = new Map(expanded.map((card) => [card.code, card]));
  function imageMetadata(card) {
    const remote = apiMap.get(card.code),
      old = oldMap.get(card.code),
      result = {};
    for (const field of ["imagesrc", "backimagesrc"]) {
      // Missing scans remain missing: do not manufacture remote filenames.
      const value = remote?.[field] || old?.[field];
      if (value) result[field] = value;
    }
    if (!result.imagesrc && card.duplicate_of) {
      const parent = definitionMap.get(card.duplicate_of);
      if (
        parent &&
        parent.name === card.name &&
        parent.text === card.text &&
        parent.back_text === card.back_text
      )
        Object.assign(result, imageMetadata(parent));
    }
    return result;
  }
  const cards = expanded
    .filter((card) => releasedPacks.has(card.pack_code))
    .map((card) => ({
      ...card,
      ...imageMetadata(card),
      url: card.url || `https://arkhamdb.com/card/${card.code}`,
    }));
  cards.sort(
    (a, b) =>
      a.pack_code.localeCompare(b.pack_code) ||
      a.position - b.position ||
      a.code.localeCompare(b.code),
  );
  if (!cards.every((card) => card.name && card.type_code && card.pack_code))
    throw new Error("Incomplete normalized card definition");
  const cardMap = new Map(cards.map((card) => [card.code, card]));
  const cycles = source.cycles.filter((cycle) =>
      packs.some((pack) => pack.cycle_code === cycle.code),
    ),
    cycleMap = new Map(cycles.map((cycle) => [cycle.code, cycle]));
  const products = packs.map((pack) => {
    const reprintedPacks = new Set(pack.reprint_packs || []);
    const members = cards.filter((card) => {
      if (pack.cardCodes) return pack.cardCodes.includes(card.code);
      if (!pack.reprint_packs) return card.pack_code === pack.code;
      if (!reprintedPacks.has(card.pack_code)) return false;
      // Campaign rewards also belong to the original encounter source files.
      const campaign = /_encounter\.json$/.test(
        source.cardSources.get(card.code) || "",
      );
      return pack.reprint_type === "campaign" ? campaign : !campaign;
    });
    return {
      code: pack.code,
      name: pack.name,
      cycleCode: pack.cycle_code,
      cycleName: cycleMap.get(pack.cycle_code)?.name || pack.cycle_code,
      releaseDate: releasedOn(pack),
      releaseDateBasis:
        pack.releaseDateBasis ||
        (RELEASE_CORRECTIONS[pack.code]
          ? "official-announcement"
          : "repository"),
      ...(pack.releaseDatePrecision
        ? { releaseDatePrecision: pack.releaseDatePrecision }
        : {}),
      ...(pack.artworkVariant ? { artworkVariant: true } : {}),
      ...(pack.description ? { description: pack.description } : {}),
      ...(pack.contentRestriction
        ? { contentRestriction: pack.contentRestriction }
        : {}),
      kind: productKind(pack),
      chapter: pack.chapter ?? 1,
      legacy: Boolean(pack.replaced),
      cardCodes: members.map((card) => card.code),
      investigatorCodes: members
        .filter((card) => card.type_code === "investigator" && !card.hidden)
        .map((card) => card.code),
      ...(pack.reprint_packs ? { reprintOf: pack.reprint_packs } : {}),
      importStatus: "complete",
      sourceUrl:
        pack.sourceUrl ||
        RELEASE_CORRECTIONS[pack.code]?.[1] ||
        `https://arkhamdb.com/set/${pack.code}`,
    };
  });
  const starterDecks = [];
  for (const product of products.filter(
    (product) => product.kind === "starter-deck",
  )) {
    const members = product.cardCodes.map((code) => cardMap.get(code)),
      investigator = members.find((card) => card.type_code === "investigator");
    if (!investigator)
      throw new Error(`Starter ${product.code} has no investigator`);
    const standard = members.filter(
      (card) => card.xp === 0 && !card.subtype_code,
    );
    if (standard.reduce((count, card) => count + card.quantity, 0) !== 30)
      throw new Error(`Starter ${product.code} has an unverified level-0 list`);
    const signatures = [
      ...investigator.deck_requirements.matchAll(/card:([^\s,]+)/g),
    ].map((match) => match[1]);
    const required = members.filter(
      (card) =>
        signatures.includes(card.code) || card.subtype_code === "basicweakness",
    );
    if (
      required.filter((card) => card.subtype_code === "basicweakness")
        .length !== 1 ||
      signatures.some((code) => !cardMap.has(code))
    )
      throw new Error(`Incomplete starter requirements ${product.code}`);
    const slots = [...standard, ...required].map((card) => ({
        code: card.code,
        quantity: card.quantity,
      })),
      upgrades = members
        .filter((card) => card.xp > 0)
        .map((card) => ({ code: card.code, quantity: card.quantity }));
    starterDecks.push({
      id: `starter-${product.code}`,
      name: `${investigator.name} Starter Deck`,
      investigatorCode: investigator.code,
      productCode: product.code,
      kind: "preconstructed",
      slots,
      upgrades,
      deckSize: 30,
      totalCards: slots.reduce((count, slot) => count + slot.quantity, 0),
      sourceUrl:
        product.chapter === 2
          ? "https://www.fantasyflightgames.com/ever-investigating/"
          : "https://www.fantasyflightgames.com/en/news/2020/3/24/your-investigation-begins/",
      listBasis:
        "Released pack quantities: 30 level-0 cards plus signatures and the supplied basic weakness; upgrades are separate.",
    });
  }
  if (releasedPacks.has("core_2026"))
    for (const [investigatorCode, positions] of Object.entries(CORE_STARTERS)) {
      const counts = new Map();
      for (const position of positions) {
        const code = String(12000 + position);
        if (!cardMap.has(code))
          throw new Error(`Missing core starter card ${code}`);
        counts.set(code, (counts.get(code) || 0) + 1);
      }
      starterDecks.push({
        id: `core-${investigatorCode}`,
        name: `${cardMap.get(investigatorCode).name} Starter Deck`,
        investigatorCode,
        productCode: "core_2026",
        kind: "core-suggested",
        slots: [...counts].map(([code, quantity]) => ({ code, quantity })),
        upgrades: [],
        deckSize: 30,
        totalCards: positions.length,
        sourceUrl: rulebook,
        listBasis:
          "Official 2026 rulebook, pages 25–29. This suggested starter list uses cards included in the Core Set.",
      });
    }
  const encounterCodes = new Set(
      cards.map((card) => card.encounter_code).filter(Boolean),
    ),
    encounterSets = source.encounters.filter((encounter) =>
      encounterCodes.has(encounter.code),
    );
  const counts = {
    packCount: new Set(cards.map((card) => card.pack_code)).size,
    productCount: products.length,
    cardCount: cards.length,
    investigatorCount: cards.filter((card) => card.type_code === "investigator")
      .length,
    encounterSetCount: encounterSets.length,
    starterDeckCount: starterDecks.length,
    hiddenFaceCount: cards.filter((card) => card.hidden).length,
  };
  return {
    cards,
    manifest: {
      schemaVersion: 1,
      asOf,
      revision: source.revision,
      products,
      starterDecks,
      cycles,
      encounterSets,
      counts,
    },
    metadata: {
      factions: source.factions,
      types: source.types,
      subtypes: source.subtypes,
      taboos: source.taboos.filter((taboo) => taboo.date_start <= asOf),
    },
  };
}

async function existingCards(dest) {
  const cards = [];
  try {
    cards.push(...(await json(join(dest, "core-2026.json"))));
  } catch {
    /* first import */
  }
  try {
    const manifest = await json(join(dest, "catalog.json"));
    for (const file of manifest.cardFiles)
      cards.push(...(await json(join(dest, file.split("/").at(-1)))));
  } catch {
    /* first full import */
  }
  return cards;
}

export async function sync(options) {
  const asOf = options["as-of"] || new Date().toISOString().slice(0, 10),
    dest = resolve(options.dest || "public/data");
  let temp,
    sourceDir = options["source-dir"] && resolve(options["source-dir"]);
  try {
    if (!sourceDir) {
      temp = await mkdtemp(join(tmpdir(), "arkham-data-"));
      execFileSync(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--filter=blob:none",
          "--sparse",
          `${repository}.git`,
          temp,
        ],
        { stdio: "pipe" },
      );
      execFileSync("git", ["-C", temp, "sparse-checkout", "set", "pack"], {
        stdio: "pipe",
      });
      sourceDir = temp;
    }
    const source = await readRepository(sourceDir),
      previous = await existingCards(dest);
    let apiCards = [];
    try {
      if (options["api-file"])
        apiCards = await json(resolve(options["api-file"]));
      else if (!options.offline) {
        const response = await fetch(api, {
          signal: AbortSignal.timeout(25_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        apiCards = await response.json();
      }
      if (
        !Array.isArray(apiCards) ||
        (apiCards.length && !apiCards.every((card) => card.code && card.name))
      )
        throw new Error("Invalid API card metadata");
    } catch (error) {
      console.log(
        `Image API unavailable (${error.message}); preserving known scans.`,
      );
      apiCards = [];
    }
    const { cards, manifest, metadata } = buildCatalog(
        source,
        asOf,
        apiCards,
        previous,
      ),
      core = cards
        .filter((card) => card.pack_code === "core_2026")
        .sort(
          (a, b) => a.position - b.position || a.code.localeCompare(b.code),
        );
    if (core.length < 190)
      throw new Error("Incomplete 2026 core; previous snapshot unchanged");
    const files = [];
    let shard = [],
      bytes = 2;
    function finishShard() {
      if (!shard.length) return;
      const body = JSON.stringify(shard) + "\n",
        name = `cards-${String(files.length + 1).padStart(3, "0")}.json`;
      files.push({
        name,
        body,
        count: shard.length,
        bytes: Buffer.byteLength(body),
        sha256: hash(body),
      });
      shard = [];
      bytes = 2;
    }
    for (const card of cards) {
      const size = Buffer.byteLength(JSON.stringify(card)) + 1;
      if (bytes + size > SHARD_BYTES) finishShard();
      shard.push(card);
      bytes += size;
    }
    finishShard();
    manifest.cardFiles = files.map((file) => `/data/${file.name}`);
    manifest.metadataFile = "/data/catalog-metadata.json";
    manifest.sourceFile = "/data/catalog-source.json";
    const provenance = {
      source: repository,
      revision: source.revision,
      asOf,
      retrievedAt: new Date().toISOString(),
      counts: manifest.counts,
      api,
      apiCount: apiCards.length,
      sourceFiles: source.files,
      supplements: source.supplements,
      sourceDefinitionCount: source.definitions.length,
      collapsedDuplicateCodes: [
        ...new Set(
          source.definitions
            .filter(
              (card, index) =>
                source.definitions.findIndex(
                  (first) => first.code === card.code,
                ) < index,
            )
            .map((card) => card.code),
        ),
      ],
      additionalProducts: CONVENTION_PROMOS,
      cardFiles: files.map(({ body, ...file }) => file),
      excludedPacks: source.packs
        .filter((pack) => !releasedOn(pack) || releasedOn(pack) > asOf)
        .map((pack) => ({
          code: pack.code,
          name: pack.name,
          releaseDate: releasedOn(pack) || null,
        })),
      notes: [
        "Repository definitions take precedence over API rules text; only scan paths come from the API.",
        "Every printing and hidden face is retained; duplicate definitions are expanded recursively.",
        "Repackages share original card identifiers and are divided using the original player/encounter source files.",
        "Taboo lists are retained as optional metadata; they are not applied to printed card text.",
        "Source release dates are retained unless a publisher release announcement is cited in the product entry.",
        "Importing card definitions does not implement their scenario scripts or special card abilities.",
        "Content remains property of Fantasy Flight Games.",
      ],
    };
    await mkdir(dest, { recursive: true });
    // Validation and serialization complete before changing the saved snapshot.
    for (const file of files) await writeFile(join(dest, file.name), file.body);
    await writeFile(
      join(dest, "catalog-metadata.json"),
      JSON.stringify(metadata) + "\n",
    );
    await writeFile(
      join(dest, "catalog-source.json"),
      JSON.stringify(provenance, null, 2) + "\n",
    );
    await writeFile(
      join(dest, "catalog.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    await writeFile(
      join(dest, "core-2026.json"),
      JSON.stringify(core, null, 2) + "\n",
    );
    await writeFile(
      join(dest, "source.json"),
      JSON.stringify(
        {
          pack: "core_2026",
          edition: "Core Set (2026)",
          source: repository,
          revision: source.revision,
          retrievedAt: provenance.retrievedAt,
          count: core.length,
          api: "https://arkhamdb.com/api/public/cards/core_2026.json?encounter=1",
          apiCount: apiCards.filter((card) => card.pack_code === "core_2026")
            .length,
          notes:
            "Repository definitions take precedence over live API text. Duplicate definitions are expanded recursively; hidden faces are retained. API supplies image paths. Content remains property of Fantasy Flight Games.",
        },
        null,
        2,
      ) + "\n",
    );
    for (const file of await readdir(dest))
      if (
        /^cards-\d{3}\.json$/.test(file) &&
        !files.some((current) => current.name === file)
      )
        await rm(join(dest, file));
    console.log(
      `Saved ${cards.length} definitions, ${manifest.counts.investigatorCount} investigator printings, ${manifest.counts.productCount} products and ${manifest.counts.starterDeckCount} starter lists as of ${asOf}.`,
    );
    return manifest;
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      "source-dir": { type: "string" },
      "api-file": { type: "string" },
      "as-of": { type: "string" },
      dest: { type: "string" },
      offline: { type: "boolean" },
    },
  });
  await sync(values);
}
