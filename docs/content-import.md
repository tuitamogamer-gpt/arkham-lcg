# Released Arkham content catalog

The import is a dated catalog of official published content through **30 September 2026**. The existing 196-definition 2026 Core Set snapshot remains the engine's starting dataset. The larger catalog loads separately when the investigator library or card archive is opened.

The saved snapshot contains **6,109 card definitions**, **116 product entries**, **103 original card packs**, **388 encounter sets** and **15 starter lists**. The 121 investigator definitions include edition variants, hidden faces and miniature cards. There are 107 non-hidden investigator records, including six scenario-specific identities; the public investigator roster excludes those story identities. These record counts do not represent distinct characters.

Card import and playable rules support have different scopes. Imported investigators, cards and encounter definitions can be inspected. The five 2026 Core investigators and the scenario scripts already implemented in the app remain the supported game choices. Reading an expansion's printed rules does not implement its campaign branching, timing windows or special abilities.

## Sources and coverage

The main source is the maintained [ArkhamDB JSON repository](https://github.com/zzorba/arkhamdb-json-data). The snapshot records its full Git revision, the SHA-256 and row count of every imported card file, output shard checksums, release cutoff and API response count in `public/data/catalog-source.json`. The [ArkhamDB public API](https://arkhamdb.com/api/public/cards?encounter=1) supplies scan paths. Repository rules and errata take precedence over live API text.

The source includes original, revised and 2026 cores; all expansion cycles; legacy deluxe and Mythos packs; repackaged investigator and campaign boxes; the two generations of separately sold investigator starter decks; standalone scenarios; Return To boxes; novella investigators; promotional cards; parallel investigators and their challenge cards. [Children of Blood](https://www.arkhamhorror.com/news/the-ravenous-undead/) is included following its 14 August 2026 release. [Traces to Nowhere](https://www.fantasyflightgames.com/gone-without-a-trace/) is excluded because its October release is after this snapshot's cutoff.

[Barkham Horror: The Meddling of Meowlathotep](https://www.fantasyflightgames.com/en/news/2020/9/18/available-now-september-18/) is official content omitted from ArkhamDB. A checked-in supplement preserves all 57 full-size definitions representing the advertised 78 cards, plus five hidden miniature investigator definitions. The supplement comes from a [pinned OCTGN set definition](https://raw.githubusercontent.com/GeckoTH/arkham-horror/977173cea94dd6a736cb4eeafde2b1cc701faee5/o8g/Sets/The%20Meddling%20of%20Meowlathotep/set.xml), with transcription corrections verified against published scans. `scripts/data/barkham-source.json` records the immutable source revision, XML hash, printed-card verification, restrictions and normalization decisions. Barkham's investigators and cards are restricted to its own scenario; no preconstructed deck is invented for them.

The [official 2025 convention promo PDF](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/gcop2501_arkham_lcg_convention_promo_cards.pdf) supplies alternate-art front/back faces for Allosaurus, Saturnite Monarch and The Contessa. Its product record points to the three existing Film Fatale definitions instead of creating duplicate mechanical cards. `artworkVariant` and the product description distinguish this artwork supplement; its date has year precision because the PDF identifies the year rather than an exact release day.

Every source printing keeps its own card identifier, original pack, quantity and overrides. Duplicate definitions expand recursively, while `duplicate_of`, `reprint_of`, `alternate_of`, hidden sides, linked faces, customization and deckbuilding metadata remain available. Identical repeated source rows collapse to one card; a conflicting same-code row aborts the import. The upstream snapshot contains two identical repeated rows, `11536` and `11552`.

Repackaged boxes reuse the original card identifiers. Their product entries map the entire set of original pack contents into the investigator or campaign box. The original `_encounter.json` files determine campaign membership, preserving story rewards such as Dr. Francis Morgan in the campaign box. Filtering by faction or deck limits would incorrectly move those cards into the investigator box.

ArkhamDB contains some synthetic repackage dates. Product entries expose `releaseDateBasis`; verified publisher release announcements override those dates and are linked in `sourceUrl`. Other dates remain explicitly repository catalog dates.

## Investigator and deck information

The catalog provides each investigator's source product and the additional boxes containing that printing. It distinguishes an investigator included in an expansion from a **separately sold, preconstructed investigator deck**. Older variants and revised 2026 versions remain separate: for example, the 2026 Seeker Carolyn Fern differs mechanically from her previous Guardian versions.

Ten separate starter products supply a verifiable printed deck: five released in 2020 and five released in 2026. For each product, expanded card quantities identify exactly 30 level-0 player cards, followed by the investigator's signatures, personal weakness and the supplied basic weakness. The investigator card itself and the upgrade supply are excluded from the draw deck. Stella Clark and André Patel have 35 cards after their multiple signature cards and weaknesses; the other eight lists have 33. Upgrade cards are recorded separately. The publisher confirms the [2020](https://www.fantasyflightgames.com/en/news/2020/3/24/your-investigation-begins/) and [2026](https://www.fantasyflightgames.com/ever-investigating/) products are ready-to-play decks with upgrades.

Five additional lists are the suggested starters from the [2026 Core rulebook, pages 25–29](https://images-cdn.fantasyflightgames.com/filer_public/0e/d0/0ed09507-1705-47ed-a630-cd15885cabb0/ahc100_rulebook-web.pdf). Their `kind` is `core-suggested`, while a sold starter's `kind` is `preconstructed`. Expansion investigators without an official preconstructed list do not receive an invented deck recipe.

## Files and synchronization

- `public/data/catalog.json`: product membership, investigator codes, deck recipes, cycles, encounter-set names, counts and paths to lazy card shards.
- `public/data/cards-001.json`, etc.: expanded card definitions, each below 1.8 MB for the existing service-worker cache limit.
- `public/data/catalog-metadata.json`: factions, card types, subtypes and all published taboo lists. Taboo changes remain optional metadata and are not applied to printed card rules.
- `public/data/catalog-source.json`: source revision, input/output checksums and import policy.
- `public/data/core-2026.json` and `source.json`: preserved core compatibility files.
- `scripts/data/barkham.json` and `barkham-source.json`: the supplemental normalized Barkham definitions and their independent provenance.

Run a fresh synchronization with a deliberate release date:

```sh
npm run sync:cards -- --as-of 2026-09-30
```

For a pinned source checkout and a saved API response, reproduction does not need a network fetch:

```sh
node scripts/sync-cards.mjs \
  --source-dir /path/to/arkhamdb-json-data \
  --api-file /path/to/arkham-api-cards.json \
  --as-of 2026-09-30
```

Use `--offline` with a local source checkout to reuse known scan metadata. Missing remote scans remain text cards in the UI; the importer does not guess filenames or download thousands of card images. Cards whose printing has identical inherited rules can reuse the ancestor's known scan.

The importer validates chains, definitions and starter recipes before writing. The catalog tests additionally check every product reference, release cutoff, old and new printings, the six split-box partitions, deck quantities, cache-size limits, recorded SHA-256 hashes and unchanged 196-card core scope:

```sh
node --import tsx --test tests/catalog-import.test.ts
```

Printed card text and art remain the property of Fantasy Flight Games.
