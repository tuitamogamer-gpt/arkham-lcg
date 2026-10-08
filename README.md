# Arkham Chronicle

A cinematic, local-first Arkham Horror: The Card Game prototype, built with React, TypeScript and Vite. The collection imports published Arkham content through **30 September 2026**, including the original, revised and 2026 cores, expansion cycles, investigator decks, standalone and parallel scenarios, Return To, novella and promo content, and Barkham. Expanded campaigns use a separately installed rules engine through Chronicle's physical table. The original Core game follows **Spreading Flames** from the **March 2026 Core Set / Chapter Two** campaign **Brethren of Ash**.

## Run

Play the deployed build at **https://arkham-lcg.vercel.app**.

```sh
npm install
npm run dev
```

Open http://localhost:5187. For a production build, run `npm run build`; serve the output with `npm run preview`.

For expanded play on macOS with Apple silicon, keep a second terminal running:

```sh
npm run rules:server
```

Open **Expansions & campaigns** in Chronicle. The first start downloads a pinned
companion engine and creates its local database under ignored
`output/rules-server/`. Chronicle presents the companion's card/scenario
decisions, campaign records and upgrades on its existing green physical table.
Expanded games open directly in the client and can be resumed from their saved
investigation links. The Spreading Flames table and its existing saves remain
independent. See
[installation, provenance and limitations](docs/rules-server.md).

## Playable now

- **Spreading Flames** with **1–3 investigators controlled by one person**: Joe Diamond (12004), Daniela Reyes (12001), Trish Scarborough (12007), Dexter Drake (12010) and Isabelle Barnes (12013), each using their exact official **33-card starter deck**.
- Choose the party and lead investigator, mulligan each hand, then select a ready investigator to take a complete turn. Each seat keeps its own actions, hand, resources, assets, clues, injuries, weaknesses and once-per-round abilities.
- Shared rounds, one encounter per investigator, party-scaled clues and boss health, group clue contributions, nearby skill assistance, owned enemy engagements and friendly fire. Defeated or resigned investigators leave while the others continue.
- One-time opening mulligan; three-action turns; resources, draw, movement, investigation, combat, evasion and parley.
- Skill-card commitment; optional resource boosts; seeded chaos bag draws without replacement within a test; skull, tablet, elder thing, elder sign and auto-fail effects; all four difficulties.
- Explicit Fast windows before/after commitment, after mythos encounters, between investigators' enemy attacks and before upkeep readying. Use **Fast abilities · all investigators** between actions. Legal options respect ownership, own-turn restrictions and Peril; passing continues the interrupted sequence.
- Choose the order of simultaneous scripted Forced effects, Fire locations, Hunter movement, optional reactions and skill-test results. Scenario Forced effects retain priority over player Forced effects. Encounter-deck resets wait for the enclosing effect to finish.
- Starter asset/event/skill effects, weapon ammo, exhausted assets, slots, discard/search, signature weakness, basic weakness and optional reactions.
- All first-scenario encounters, fire, hunters, attacks of opportunity, retaliate, doomed, enemy/upkeep/mythos phases, hand limits, damage/horror assignment.
- Four acts, three agendas, campus reveal progression, Servant of Flame, Dr. Armitage, victory/defeat/resignation, XP, trauma and campaign records.
- **Player-controlled event progression**: every visible scripted step pauses with its source card, affected investigator, and before/after changes. Attacks and encounter revelations wait for confirmation before their effects resolve. Phase transitions, draws, injuries, and reactions unfold step by step, with no timers or autoplay.
- Inspect the table or cards while paused; review the most recent 500 events in the read-only event history. Closing a checkpoint only minimizes it. Unrelated actions and stale confirmations cannot skip it.
- **Game tempo**: Detailed pauses on every recorded event, Smart pauses only on attacks, encounters, injuries, fire, hunters, new rounds and story, Fast pauses on story, attacks, encounter reveals and defeat. Every event is still written to the history. Enter continues an event; the tempo can be changed from the event window, the setup screen or Settings.
- **Undo** of the last public action within the current investigator turn (button, Ctrl+Z or ⌘Z). Card draws, hidden-deck searches/shuffles, newly explored locations, chaos-token reveals, story transitions, seat changes and phase changes clear earlier undo snapshots, so undo cannot look ahead.
- **Chance of success** shown before drawing, computed from the public chaos bag and the scenario's token rules, including tablet redraws and each investigator's elder sign.
- **Saved investigations**: every game keeps its own slot (up to 12) with open, export and delete controls in Settings & saves; starting a new case no longer replaces the previous one. Older single-slot saves migrate automatically. Closed cases are recorded on the home page.
- **Interactive tutorial** through the first turn, shown once and available again from Settings. **Procedural sound**: synthesized ambience and effects for cards, tokens, attacks, injuries, fire, healing and story, off by default. **Installable and offline**: an app manifest and service worker keep the app shell available without a network; card art is cached as it is seen. Phones get a bottom navigation bar.
- Local autosave, save export/import, preservation of pending events, tests and choices, automatic migration of older solo and party saves, keyboard-accessible dialogs, fullscreen (F).
- Save-slot metadata recovers from its payload when damaged. Failed imports preserve the open case; quota failures retain the previous saved copy. PWA updates wait for **Save & update** in Settings and do not interrupt another open game tab. Visited artwork remains available offline and revalidates online.
- Physical tabletop based on the 2026 rulebook and real session photography: landscape act/agenda stacks, full location faces, miniature investigator markers, tactile counters, sideways exhausted assets, player/encounter piles and a public chaos-bag/victory viewer. See [design research and sources](docs/tabletop-design-research.md).
- Dark Miskatonic setting, aged campaign files, investigator seats, brass typography, original card scans and a physical card table optimized for desktop. Sticky controls and status, compact headers, and keyboard **1–3** selection keep the party manageable.
- Collection of **6,109 normalized card definitions across 116 products**, with original printings, reprints, variants and hidden faces retained. Search by card, trait, text, class, type or product; browse product categories and repackaged expansion membership. Story cards stay sealed by default; an explicit collection spoiler switch opens them for reference without unlocking your saved investigation.
- Investigator and deck selection identifies the source product, distinguishes **10 separately sold ready-to-play Investigator Decks** from the **five suggested 2026 Core starter lists**, and shows every supplied card and upgrade. Investigators from expansion boxes show their printed deckbuilding requirements; no deck recipes are invented.

- Direct **Fight with weapon** buttons show the action/ammo cost beside each enemy; skill tests identify the selected weapon. Daniela’s optional counterattack is explicitly explained and attributed to her investigator card.
- Pointer and keyboard previews for agenda, act, investigator, assets, enemies and campaign information. Act/agenda transitions show the completed card’s reverse-side story and the new objective; previews do not reveal future story faces.
- Encounter checkpoints show reveal, resolution and destination, including attached threats, Fire!, spawned enemies and the discard pile. Dialogs keep one accessible focus owner while inspecting cards.
- Card dealing/playing, investigator movement, token changes, attacks, injuries, chaos-token draws, phases and story turns have contextual animations. Settings offer **Cinematic**, **Subtle**, and **Off**, and honor the device's reduced-motion preference. Animations never advance a checkpoint or spend an action.
- Campaign discoveries survive save export/import, reload and event-history rollover; older saves recover what is already public. Starting a new investigation starts a fresh discovery record.

## Scope and next milestones

The full collection is imported for browsing and deck reference. The native
TypeScript table remains a **playable Spreading Flames implementation** with
five fixed starters and one-to-three investigator control. The new companion
mode enables broader scripted play using the separately installed
[Arkham Horror engine](https://github.com/halogenandtoast/ArkhamHorror/releases/tag/v20260904.1)
through Chronicle's original physical table and explicit decision controls.
Official starter imports, campaign and standalone selection, deck
building/upgrades and server saves are integrated. Live checks started
Night of the Zealot, Brethren of Ash, The Dunwich Legacy and Children of Blood,
reached their first investigation phase, executed a resource action and
reloaded the persisted result.

**Full-catalog scripting is not complete.** The original Barkham extension now
implements its 57 full cards and five investigators in a verified native build.
Its 42 focused Haskell examples and all five fresh real saved-game setup/action
checks pass. The shared Barkham, Epic Labyrinth and Machinations native engine/API
now passes **232 Haskell examples** and **52 recorded actual API checks across
six main Epic games**, including physical transfers, undo boundaries, timers
and endings. All nine cross-era location wrappers are now actually registered;
Labyrinth's physical diagrams, Glyph rewards and printed endings are repaired.
[Current evidence and exact scope](docs/import-scenario-continuation-2026-10-08.md)
records the controlled prerequisites and separate legal-playthrough results.
The [previous 194-example release](docs/import-native-aggregate-linux-2026-10-07.md)
also verified client setup/Ready, twelve real Chromium/WebKit actions and
eleven-save persistence through a managed database restart under that identity.
Several upstream campaigns/standalones retain beta content. A declared card
definition is not a certification of all its interactions. Product availability
reports registration separately from implementation claims. The companion
distribution runs locally on Apple silicon. The separate private Linux acceptance
route uses the actual compiled aggregate without claiming a signed installation;
the static production deployment does not include its Haskell/PostgreSQL server.
The [ARM64 Mac build/export pipeline](docs/macos-runtime-release.md) verifies
the actual candidate and produces an archive with ad-hoc installation signatures;
Developer ID signing, notarization and Mac gameplay acceptance remain separate.
The native game remains usable
without the companion.

The engine scripts these five fixed starter decks. Fast windows offer legal abilities from that pool, including another investigator's Wrench during a test. Windows with no available abilities need no additional pass. Event checkpoints control presentation and do not introduce extra rules windows or undo effects. Intermediate windows, ordered effects, commitments and nested resolution boundaries survive saves. All 196 card definitions have local original artwork (233 faces including reverses and the hidden Elokoss face). Downloads use the arkham.build image mirror with ArkhamDB fallback. Broken images recover to a bounded text frame. Game attributes and rules text use the original Arkham symbol font.

The [September rules audit](docs/rules-audit.md) records the Grimoire v1.1 baseline and errata reconciliation. The [30 September follow-up](docs/review-2026-09-30.md) documents corrections to multiplayer skill rewards, slots, spell timing, starter-card costs, player-card doom, undo and saves. The TypeScript suite now has **481 passing tests**, including random legal play across all five Core investigators, catalog/deck validation and companion protocol regressions. Later Core scenarios and campaign upgrades use the companion; the independent TypeScript engine still covers Spreading Flames. Tests cover specified interactions; they do not certify every possible combination of cards or custom decks.

## Data sources

The full importer and its coverage, release cutoff, supplemental Barkham data, product mappings and repeatable checks are documented in [content import](docs/content-import.md). Run `npm run sync:cards -- --as-of 2026-09-30` to regenerate the snapshot. Three small card shards load when the collection is first opened; the installed app precaches the card data for offline browsing. The scripted 196-card Core snapshot is preserved independently of the larger reference catalog.

ArkhamDB provides a public JSON API with no credential needed for public card endpoints:

- Documentation: https://arkhamdb.com/api/doc
- Core set: `GET https://arkhamdb.com/api/public/cards/core_2026.json?encounter=1`
- Individual card: `GET https://arkhamdb.com/api/public/card/12004.json`
- All cards including encounters: `GET https://arkhamdb.com/api/public/cards/?encounter=1`

The documented `.json` API endpoint was verified live and returned 195 cards. It omits the hidden Elokoss face and inherited older Machete text. The sync therefore reconciles every API response with the maintained [ArkhamDB data repository](https://github.com/zzorba/arkhamdb-json-data), revision `7ae21d7563ce9f68396c0d5e3a36f40f90fe1156`, retrieved 23 September 2026. `duplicate_of` records are expanded recursively, then overlaid with the 2026 printing, preserving errata such as the July 2026 Machete update. Provenance is recorded in `public/data/source.json`.

```sh
npm run sync:cards
```

The sync script requests API metadata and always reconciles it with current repository definitions, expanding reprints and retaining hidden faces, before validating and replacing the snapshot. If the repository cannot be verified, the previous snapshot is preserved. Updating data does **not** automatically implement new rules or card scripts. Review snapshot changes before release.

Official references:

- [2026 release announcement](https://www.arkhamhorror.com/news/ah-tcg-new-core-set-now-available/)
- [2026 rulebook](https://images-cdn.fantasyflightgames.com/filer_public/0e/d0/0ed09507-1705-47ed-a630-cd15885cabb0/ahc100_rulebook-web.pdf), including Daniela, Joe, and Trish’s starter lists (pp. 25–27).
- [Brethren of Ash campaign guide](https://images-cdn.fantasyflightgames.com/filer_public/f0/22/f022ac7c-9c30-4521-ac16-1f74f00e1d31/ahc100_campaign_guide-web.pdf), setup and resolutions (pp. 2–4).
- [Arkham Grimoire v1.1](https://images-cdn.fantasyflightgames.com/filer_public/b6/ac/b6ac3b87-f5af-4d4c-b036-f7c51ced063d/arkham_grimoire_v11_web_1.pdf), including July 2026 errata and FAQ.

## Architecture and verification

- `src/game/engine.ts`: pure serializable state transitions, pending decisions, and effect queue. No React dependency; deterministic random seed is part of a save.
- `src/game/presentation.ts`: public-state changes, source-card attribution, event history and confirmation checkpoints. Hidden future draws are excluded from presentation snapshots.
- `src/game/knowledge.ts`: shared discovery policy for the archive, card inspection and story reverses; persisted independently of the bounded journal.
- `src/game/motion.ts` and `src/components/Motion.tsx`: presentation cues from resolved public state and cancellable table animations, independent of the rules queue.
- `src/game/data.ts`: normalized catalog, five exact starter lists, chaos bags and map connections.
- `src/game/storage.ts`: guarded local storage, portable version 3 saves, migration of version 1 and 2 saves, per-investigation save slots with an index, and the record of closed cases.
- `src/game/decks.ts`: printed deckbuilding filters, explicit choices, signatures, weaknesses, copy/XP restrictions, physical setup lists and ordinary upgrades. Unknown rules block validation.
- `src/game/scriptSupport.ts`: conservative native behavior fingerprints; equivalent printings retain their source identity. Alias dispatch is not yet enabled at the native table.
- `src/game/rulesServer.ts`, `src/components/ExpandedPlay.tsx`, `src/components/CompanionTable.tsx`: original companion adapter, exact starter/JSON imports, live availability, physical game table and typed player decisions.
- `scripts/rules-server.mjs`: loopback launcher/proxy for a pinned, independently downloaded engine, private local guest and persistent database. No engine binaries or upstream engine source are committed.
- `src/audio.ts`: procedural ambience and sound effects driven by the same public motion cues as the animations; never gates a rules action.
- `src/components/Tutorial.tsx`: the first-turn tutorial, anchored to table elements and advanced by the player's own actions.
- `scripts/optimize-art.mjs`: generates the served WebP faces (full size and thumbnails) from the originals kept in `art-source/`; run `npm run art` after caching new scans.
- `.github/workflows/ci.yml`: TypeScript, the test suite, the production build and a real Chromium smoke test on every push and pull request.
- `src/components/`: game table, campaign home, archive, investigator files and shared dialogs.
- `tests/`: rules regressions, save validation and explicit checkpoint tests. Legacy rules fixtures acknowledge checkpoints and pass Fast opportunities through `tests/helpers.ts`; timing and pacing tests exercise the reducer directly.
- `scripts/browser-check.mjs` and `scripts/party-browser-check.mjs`: real Chromium interaction checks and desktop/mobile captures.
- `scripts/pacing-browser-check.mjs`: explicit confirmation, table/card/history inspection, phase progression, saved pauses and desktop layout checks. Older broad browser flows explicitly acknowledge checkpoints with `scripts/browser-pacing.mjs`.
- `scripts/rules-browser-check.mjs`: multiplayer damage allocation, Peril, limbo/reload, attack ordering, elder-sign timing and queued-test checks.
- `scripts/timing-browser-check.mjs`: actual Fast choices, cross-investigator interruptions, ordered results/Forced effects/Fire, saved windows, encounter-reset boundaries, and compact desktop dialogs.
- `window.render_game_to_text()`: concise observable game state for automation.
- `window.advanceTime(ms)`: deterministic compatibility hook; game state changes only on user actions.

```sh
npm test
npm run build
npm run check   # types, tests and build in one step
# With the dev server running:
node scripts/browser-check.mjs
DESKTOP_ONLY=1 node --import tsx scripts/party-browser-check.mjs
node --import tsx scripts/pacing-browser-check.mjs
node --import tsx scripts/rules-browser-check.mjs
node --import tsx scripts/timing-browser-check.mjs
node --import tsx scripts/tabletop-browser-check.mjs
node --import tsx scripts/refinements-browser-check.mjs
node --import tsx scripts/discovery-motion-browser-check.mjs
node --import tsx scripts/review-browser-check.mjs
# Build and serve the production output first; set BASE_URL to its port
node --import tsx scripts/pwa-browser-check.mjs
# Verify the production game:
BASE_URL=https://arkham-lcg.vercel.app node scripts/browser-check.mjs
BASE_URL=https://arkham-lcg.vercel.app DESKTOP_ONLY=1 node --import tsx scripts/party-browser-check.mjs
BASE_URL=https://arkham-lcg.vercel.app node --import tsx scripts/pacing-browser-check.mjs
```

Browser artifacts are written under ignored `output/browser/`, `output/party-browser/` and `output/pacing-browser/`. They include all three seats through a complete round, assisted-test reload, archive filters, save export, keyboard seats, and desktop map/controls checks at 1280, 1440 and 1920 pixels. Pacing checks also cover attacks announced before injuries, encounters revealed before their effects, independently resolved party encounters, and restored pending events after reload and import. Desktop is the current design priority; omit `DESKTOP_ONLY` to also run the earlier mobile coverage. Scenario-chain tests use controlled fixtures and do not claim to establish full-game balance or exhaust every possible card interaction.

## Deployment

The private GitHub repository is [tuitamogamer-gpt/arkham-lcg](https://github.com/tuitamogamer-gpt/arkham-lcg). Vercel is connected to this repository; pushes to `main` deploy to production. `vercel.json` uses `npm ci`, `npm run build`, the `dist` output directory, and immutable cache headers for `/fonts` and hashed `/assets`. Stable artwork paths revalidate online, while the service worker serves cached artwork immediately and keeps visited images available offline. GitHub Actions runs the CI workflow on every push; to make a green check a condition for deployment, require the `verify` job in the repository's branch protection for `main` and merge through pull requests. Local Vercel configuration and environment files are ignored by Git and excluded from uploads. The page carries a `noindex` robots tag so the fan build stays out of search results.

## Art and attribution

This is an independent fan project, not an official Fantasy Flight Games product. Arkham Horror, its cards, text and the official card images remain the property of their respective owners. Preview image source URLs are in `docs/art-sources.json`; downloaded original scans, exact source URLs, and unavailable images are recorded in `docs/card-image-sources.json`. Originals live in `art-source/` and are not served; `npm run art` converts them into the WebP faces under `public/art/` (233 full faces of about 70–160 KB plus 360-pixel thumbnails of about 25–40 KB, instead of the former 250–350 KB JPEG scans). Refresh scans with `node scripts/cache-card-art.mjs` after a card sync, optionally selecting a comma-separated `CARD_CODES` list, then run `npm run art`. The campus illustration was created with the built-in image generation tool; its prompt and saved location are in `docs/art-direction.md`. Typography: Cinzel, Cormorant Garamond and DM Sans. Interface icons: Phosphor. Game symbols: ArkhamCards’ Arkham icon font (provenance in `docs/icon-sources.json`).
