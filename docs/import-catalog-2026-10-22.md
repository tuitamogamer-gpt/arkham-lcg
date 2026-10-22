# Catalog reference refresh — 22 October 2026

The released-source catalog now uses ArkhamDB JSON revision
`5f633d3afaaa924d7ff4672ed0af43d50794420f` (19 October), with cutoff
`2026-10-22`. The previous snapshot used revision
`7ae21d7563ce9f68396c0d5e3a36f40f90fe1156` and cutoff `2026-09-30`.

The refresh retains **6,109 definitions / 116 products / 103 original packs /
388 encounter sets / 15 starter lists**. It adds and removes no card IDs.
**101 existing reference records** change: 27 front-text fields, 22 back-text
fields, five trait fields, 38 errata-date fields, and several names/flavor fields.
One record can change multiple fields. Many changes are punctuation or markup;
these counts are not new card scripts or 101 new behavioral corrections.

Examples include Samuel Blake's corrected Hidden keyword and errata date,
Capture the Conspirators' reverse name and stray bracket, and the printed codex
symbol on the two later-scenario Servant of Flame faces. Source file hashes,
normalized shard hashes and counts are recorded in
[`catalog-source.json`](../public/data/catalog-source.json). Existing scan
metadata is reused offline; new image paths are not guessed.

The official [Traces to Nowhere announcement](https://www.fantasyflightgames.com/gone-without-a-trace/)
gives an October window but no exact release day. This pinned source has no
complete product/definition set for it. It remains excluded; announcement
artwork and incomplete text are not imported as a complete playable scenario.

## Browser runtime boundary

Both existing runtime files remain byte-identical:

| File | SHA-256 |
| --- | --- |
| `core-2026.json` | `e0f985b5375ff5515eaa1ce6a683bb57fc47d4e8daad4eec687d85c03da049f7` |
| `source.json` | `2b7d9c88b154ff03ce2b308ffce587cda3404489c8328b71356b2ce2ed5fd82e` |

Their original revision, all 196 runtime definitions, five starter lists and
107 reachable scripts are preserved. Only reference codes `12138` and `12180`
differ from that Core snapshot; neither belongs to the reachable 107 scripts.
Explicit archive inspection reads the refreshed reference record, while game
lookups continue to use the fixed Core data. Spoiler permissions are unchanged.

The importer now preserves this Core/provenance pair by default and hash-binds
it in the new catalog provenance. Missing, corrupt or inconsistent pairs fail
before any catalog files are replaced. An empty destination initializes its
pair, and an explicit `--refresh-core` deliberately updates both together.

The earlier [support map](../public/data/support-coverage.json) retains its own
dated native/source/API evidence. It was not regenerated from missing native
artifacts and does not certify this reference refresh or a new native runtime.
No native extension, executable, installed runtime or saved investigation is
changed by this batch.

## Verification

The focused catalog/import/support-gate checks pass **18 tests**, including real
CLI synchronization into temporary source/destination fixtures: updated catalog
text with exact Core byte preservation, fail-closed handling before writes,
first import and explicit runtime refresh. Lazy loading still rejects incomplete
transactions, preserves game data and exposes corrected reference inspection
separately. Full application and browser checks are recorded with the release.

Reproduce the dated reference refresh with a checkout of the revision above:

```sh
node scripts/sync-cards.mjs --source-dir /path/to/arkhamdb-json-data \
  --as-of 2026-10-22 --offline
```
