# Arkham Chronicle

A cinematic, local-first Arkham Horror: The Card Game prototype, built with React, TypeScript and Vite. This project targets the **March 2026 Core Set / Chapter Two**, whose campaign is **Brethren of Ash**. It does not use the 2021 Revised Core Set or Night of the Zealot.

## Run

Play the deployed build at **https://arkham-lcg.vercel.app**.

```sh
npm install
npm run dev
```

Open http://localhost:5187. For a production build, run `npm run build`; serve the output with `npm run preview`.

## Playable now

- **Spreading Flames** with **1–3 investigators controlled by one person**: Joe Diamond (12004), Daniela Reyes (12001), and Trish Scarborough (12007), each using their exact official **33-card starter deck**.
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
- Local autosave, save export/import, preservation of pending events, tests and choices, automatic migration of older solo and party saves, keyboard-accessible dialogs, fullscreen (F), optional synthesized ambience.
- Physical tabletop based on the 2026 rulebook and real session photography: landscape act/agenda stacks, full location faces, miniature investigator markers, tactile counters, sideways exhausted assets, player/encounter piles and a public chaos-bag/victory viewer. See [design research and sources](docs/tabletop-design-research.md).
- Dark Miskatonic setting, aged campaign files, investigator seats, brass typography, original card scans and a physical card table optimized for desktop. Sticky controls and status, compact headers, and keyboard **1–3** selection keep the party manageable.
- Searchable archive of **196 normalized 2026 card definitions**; all five investigator dossiers.

- Direct **Fight with weapon** buttons show the action/ammo cost beside each enemy; skill tests identify the selected weapon. Daniela’s optional counterattack is explicitly explained and attributed to her investigator card.
- Pointer and keyboard previews for agenda, act, investigator, assets, enemies and campaign information. Act/agenda transitions show the completed card’s reverse-side story and the new objective; previews do not reveal future story faces.
- Encounter checkpoints show reveal, resolution and destination, including attached threats, Fire!, spawned enemies and the discard pile. Dialogs keep one accessible focus owner while inspecting cards.

## Scope and next milestones

This is a **playable first-scenario implementation**, not a completed implementation of the whole core set. Dexter Drake, Isabelle Barnes, Smoke and Mirrors, Queen of Ash, network multiplayer, custom deckbuilding and campaign upgrades are not playable. Local hot-seat control of one to three investigators is supported. The UI explicitly labels content coverage.

The engine scripts these three fixed starter decks. Fast windows offer legal abilities from that pool, including another investigator's Wrench during a test. Windows with no available abilities need no additional pass. Event checkpoints control presentation and do not introduce extra rules windows or undo effects. Intermediate windows, ordered effects, commitments and nested resolution boundaries survive saves. All 196 card definitions have local original artwork (233 faces including reverses and the hidden Elokoss face). Downloads use the arkham.build image mirror with ArkhamDB fallback. Broken images recover to a bounded text frame. Game attributes and rules text use the original Arkham symbol font.

The [September rules audit](docs/rules-audit.md) records the Grimoire v1.1 baseline, errata reconciliation, corrected interactions, **142 passing tests**, and the limits of that coverage. Next content milestones: the two remaining investigators and starter decks, Scenario II (including suspect codex branches), Scenario III, and the campaign upgrade screen. Tests cover specified interactions; they do not certify every possible combination of cards or custom decks.

## Data sources

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
- `src/game/data.ts`: normalized catalog, three exact starter lists, chaos bags and map connections.
- `src/game/storage.ts`: guarded local storage, portable version 3 saves, and migration of version 1 and 2 saves without changing the storage key.
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
# With the dev server running:
node scripts/browser-check.mjs
DESKTOP_ONLY=1 node --import tsx scripts/party-browser-check.mjs
node --import tsx scripts/pacing-browser-check.mjs
node --import tsx scripts/rules-browser-check.mjs
node --import tsx scripts/timing-browser-check.mjs
node --import tsx scripts/tabletop-browser-check.mjs
node --import tsx scripts/refinements-browser-check.mjs
# Verify the production game:
BASE_URL=https://arkham-lcg.vercel.app node scripts/browser-check.mjs
BASE_URL=https://arkham-lcg.vercel.app DESKTOP_ONLY=1 node --import tsx scripts/party-browser-check.mjs
BASE_URL=https://arkham-lcg.vercel.app node --import tsx scripts/pacing-browser-check.mjs
```

Browser artifacts are written under ignored `output/browser/`, `output/party-browser/` and `output/pacing-browser/`. They include all three seats through a complete round, assisted-test reload, archive filters, save export, keyboard seats, and desktop map/controls checks at 1280, 1440 and 1920 pixels. Pacing checks also cover attacks announced before injuries, encounters revealed before their effects, independently resolved party encounters, and restored pending events after reload and import. Desktop is the current design priority; omit `DESKTOP_ONLY` to also run the earlier mobile coverage. Scenario-chain tests use controlled fixtures and do not claim to establish full-game balance or exhaust every possible card interaction.

## Deployment

The private GitHub repository is [tuitamogamer-gpt/arkham-lcg](https://github.com/tuitamogamer-gpt/arkham-lcg). Vercel is connected to this repository; pushes to `main` deploy to production. `vercel.json` uses `npm ci`, `npm run build`, and the `dist` output directory. Local Vercel configuration and environment files are ignored by Git and excluded from uploads.

## Art and attribution

This is an independent fan project, not an official Fantasy Flight Games product. Arkham Horror, its cards, text and the official card images remain the property of their respective owners. Preview image source URLs are in `docs/art-sources.json`; downloaded original scans, exact source URLs, and unavailable images are recorded in `docs/card-image-sources.json`. Refresh them with `node scripts/cache-card-art.mjs` after a card sync, optionally selecting a comma-separated `CARD_CODES` list. The campus illustration was created with the built-in image generation tool; its prompt and saved location are in `docs/art-direction.md`. Typography: Cinzel, Cormorant Garamond and DM Sans. Interface icons: Phosphor. Game symbols: ArkhamCards’ Arkham icon font (provenance in `docs/icon-sources.json`).
