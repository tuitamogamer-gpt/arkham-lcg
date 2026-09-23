# Arkham Chronicle

A cinematic, local-first Arkham Horror: The Card Game prototype, built with React, TypeScript and Vite. This project targets the **March 2026 Core Set / Chapter Two**, whose campaign is **Brethren of Ash**. It does not use the 2021 Revised Core Set or Night of the Zealot.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5187. For a production build, run `npm run build`; serve the output with `npm run preview`.

## Playable now

- Solo **Spreading Flames**, using **Joe Diamond (12004)** and the official **33-card starter deck** from the 2026 rulebook.
- One-time opening mulligan; three-action turns; resources, draw, movement, investigation, combat, evasion and parley.
- Skill-card commitment; optional resource boosts; seeded chaos bag draws without replacement within a test; skull, tablet, elder thing, elder sign and auto-fail effects; all four difficulties.
- Starter asset/event/skill effects, weapon ammo, exhausted assets, slots, discard/search, signature weakness, basic weakness and optional reactions.
- All first-scenario encounters, fire, hunters, attacks of opportunity, retaliate, doomed, enemy/upkeep/mythos phases, hand limits, damage/horror assignment.
- Four acts, three agendas, campus reveal progression, Servant of Flame, Dr. Armitage, victory/defeat/resignation, XP, trauma and campaign records.
- Local autosave, save export/import, preservation of pending tests and choices, mobile layout, keyboard-accessible dialogs, fullscreen (F), optional synthesized ambience.
- Searchable archive of **196 normalized 2026 card definitions**; all five investigator dossiers.

## Scope and next milestones

This is a **first playable vertical slice**, not a completed implementation of the whole core set. The other four investigators, Smoke and Mirrors, Queen of Ash, multiplayer, custom deckbuilding and campaign upgrades are not playable. The UI explicitly labels that coverage. Completing the whole core set remains the project goal.

The engine implements this fixed solo card pool, rather than a general Arkham rules interpreter. Player windows are provided for scripted reactions and skill boosts; arbitrary fast-card play at every timing window is not yet implemented. Simultaneous forced triggers currently resolve in a deterministic order rather than letting the player reorder them. Cosmetic map-location art uses the original campus illustration; it is not a scan of the official location card. Card detail views use locally cached original scans where available, alongside the current source text.

The next rule-completeness pass should add general timing windows and ordering for simultaneous triggers before enabling additional decks or multiplayer. Next content milestones: remaining 2026 investigators with their exact starter decks, then Scenario II (including suspect codex branches) and Scenario III, then the campaign upgrade screen.

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
- [2026 rulebook](https://images-cdn.fantasyflightgames.com/filer_public/0e/d0/0ed09507-1705-47ed-a630-cd15885cabb0/ahc100_rulebook-web.pdf), including Joe’s starter list (p. 26).
- [Brethren of Ash campaign guide](https://images-cdn.fantasyflightgames.com/filer_public/f0/22/f022ac7c-9c30-4521-ac16-1f74f00e1d31/ahc100_campaign_guide-web.pdf), setup and resolutions (pp. 2–4).

## Architecture and verification

- `src/game/engine.ts`: pure serializable state transitions, pending decisions, and effect queue. No React dependency; deterministic random seed is part of a save.
- `src/game/data.ts`: normalized catalog, exact starter list, chaos bags and map connections.
- `src/game/storage.ts`: guarded local storage and portable JSON saves.
- `src/components/`: game table, campaign home, archive, investigator files and shared dialogs.
- `tests/`: rules regressions and save validation.
- `scripts/browser-check.mjs`: real Chromium interaction checks and desktop/mobile captures.
- `window.render_game_to_text()`: concise observable game state for automation.
- `window.advanceTime(ms)`: deterministic compatibility hook; game state changes only on user actions.

```sh
npm test
npm run build
# With the dev server running:
node scripts/browser-check.mjs
```

Browser artifacts are written under ignored `output/browser/`. They include a pending-test reload, turn progression, archive filters, save export, and mobile overflow checks. Scenario-chain tests use controlled fixtures and do not claim to establish full-game balance or exhaust every possible card interaction.

## Art and attribution

This is an independent fan project, not an official Fantasy Flight Games product. Arkham Horror, its cards, text and the official card images remain the property of their respective owners. Preview image source URLs are in `docs/art-sources.json`; downloaded ArkhamDB scans and unavailable images are recorded in `docs/card-image-sources.json`. Refresh them with `node scripts/cache-card-art.mjs` after a card sync. The campus illustration was created with the built-in image generation tool; its prompt and saved location are in `docs/art-direction.md`. Typography: Cormorant Garamond and DM Sans. Icons: Phosphor.
