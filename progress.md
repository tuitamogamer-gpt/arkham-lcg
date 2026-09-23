Original prompt: I want to create fully playable and scripted Arkham Horror LCG. Check if there is API for cards and start building it. It need to be very beautiful designed and functional. Start with core set, revised edition from 2026.

## Direction

- Empty workspace. Target the new March 2026 Core Set (Chapter Two), not the 2021 Revised Core Set.
- ArkhamDB offers a public JSON card API. Verify the core_2026 data and retain source provenance.
- Build a cinematic, accessible React/TypeScript game table, local saves, card library, and independently tested scripted rules.
- First playable milestone: Spreading Flames from Brethren of Ash. Do not represent unimplemented campaign scenarios or card effects as complete.
- Skills read: develop-web-game and high-end-visual-design.

## First playable implementation — 23 September 2026

- React / TypeScript / Vite application, served at http://localhost:5187 (5173 was occupied by another process).
- 196 complete 2026 definitions normalized from ArkhamDB's maintained repository, revision 7ae21d7563ce9f68396c0d5e3a36f40f90fe1156. Direct public API timed out; provenance and repeatable API-first/repository-fallback sync included.
- Original Miskatonic illustration generated and saved inside public/art; four official preview card images cached with source URLs.
- Campaign dashboard, all five investigator dossiers, complete searchable card archive, field guide, responsive game table, dark green / brass / paper visual direction.
- Pure serializable solo Spreading Flames engine with Joe Diamond's exact 33-card starter, mulligan, skill commitment, four chaos bags, all four acts and three agendas, encounter processing, fire, hunters, enemy attacks, simultaneous damage application, starter cards, reactions, XP and trauma outcomes.
- Local autosave, validated save import/export, pending test/decision restoration, optional ambience and fullscreen shortcut.
- Verified: 31 automated rule/save tests pass; production build passes with separate application/data/vendor chunks.
- Browser checks passed new game, difficulty, mulligan, tests/commitments, pending-test reload, complete round, card search/filter/inspection, save export, later chapter disclosure, and mobile overflow; screenshots visually reviewed. No console/page errors in the first completed browser run.
- Visual review found mobile scenario title clipping; fixed. Focus restoration now prevents scroll jumps, and responsive map coordinates stay synchronized with connection lines.

## Remaining scope — do not claim complete core-set support

- Other four investigators and exact starter decks, Smoke and Mirrors/codex branches, Queen of Ash, deckbuilding/upgrades and multiplayer.
- General fast-action timing windows and player ordering of simultaneous forced triggers. Current fixed solo engine uses explicit reaction windows and deterministic trigger ordering.
- Location illustrations currently reuse original campus art rather than official scans. Four official preview card images available; other cards use legible custom frames with sourced text.
- Whole scenario chain tested with controlled fixtures; this does not establish balance or exhaustive rules fidelity.

## Final data reconciliation and artwork

- Verified documented live `.json` API endpoint successfully: 195 API records. Its Machete reprint text is stale relative to the source repository, and the hidden Elokoss face (12179b) is omitted.
- Sync now always reconciles source-repository definitions and hidden faces against API metadata. Verified fresh sync restores all 196 definitions and preserves current Machete behavior.
- Cached an initial set of original ArkhamDB card scans; later image requests timed out, so caching stops after repeated failures and the UI retains source-text card frames for unavailable images. Publisher preview assets and the generated campus art remain local.
- Final browser rerun: all interaction checks passed again, zero page/console errors. Mobile clipped titles and focus scroll jump corrected and screenshots reviewed.

## Arkham redesign and one-controller party play — 23 September 2026

- User requested a substantially more Arkham-inspired design and hot-seat control of 1–3 investigators.
- Rebuilt home around Miskatonic at night, a physical campaign dossier, illustrated chapters, investigator files, parchment and brass. Reworked game table, dialogs, archive, onboarding and mobile layouts. Added Cinzel typography and cached 36 original card scans, including all first-scenario locations.
- State version 2 models three independent seats, using Joe, Daniela and Trish’s exact 33-card official starter lists. The active seat and companions never duplicate authoritative state. Effect queues carry actor ownership. Shared rounds wait for every investigator; enemy/upkeep/mythos processing targets each correct owner.
- Added party-scaled clues, boss health and act costs; controlled group contributions; nearby skill assistance; per-seat reactions/weaknesses; elimination while the party continues; each investigator’s XP and trauma.
- Added scripts for the two new investigators and their starter pools, including Wrench, In Harm’s Way, Trish’s extra evade, Operative, Covert Ops, Hammerless, Thieves’ Kit, Bandages, Meat Cleaver, Prestidigitation, and late Timely Intervention.
- Old solo saves migrate without changing the local-storage key. Pending party choices, tests, commitments and actor queues remain portable through save export/import.
- Browser exercised all three hands, selection and locking of turns, shared round, assisted test and reload, export, and expanded map. Visual inspection found mobile title collisions and location overlap; corrected both, and added map geometry assertions at 390px and 320px.
- Added targeted rules/save regressions. Final verification and release results will be appended below.
- Remaining scope supersedes earlier notes: Dexter and Isabelle, later two scenarios, general fast-card windows and forced-trigger ordering, replacement-lead choice, deckbuilding/upgrades and network multiplayer. No claim of exhaustive card-interaction coverage or a complete core set.
- User clarified desktop optimization is the priority; further mobile refinement is deferred. Tightened desktop headers, seats, story cards and first-act map; added sticky actions/investigator status and keyboard 1–3 seat selection. Expanded desktop map has space between its location cards.
- Final validation: 64 rules/save tests pass; TypeScript and production build pass. Existing solo browser checks and the new three-seat desktop flow pass without browser errors. Desktop geometry verified at 1280×800, 1440×1000 and 1920×1080, including visible action controls and non-overlapping location cards. Skill Playwright client also ran and its setup capture was visually reviewed.
- Original-card cache now contains 52 scans plus existing publisher previews. Failed downloads retain readable card frames and sourced text. No ongoing external API dependency is required to play.
- Release target: existing private GitHub main branch and its connected Vercel production project. Deployment evidence is recorded in ignored output files to avoid a post-release documentation-only deployment.

## Visible events and player-controlled pacing — 23 September 2026

- User emphasized that every event must be visible and that the player must control when the game continues. Desktop remains the priority.
- The engine now pauses after each visible scripted effect, including phase changes, cards drawn, resources, movement, injury and scenario progression. Encounter cards are revealed before their revelation effects; enemy attacks are announced before damage. Bookkeeping that does not change visible state adds no extra confirmation.
- Added an Arkham-styled event window with the source card, affected investigator, explanation and before/after changes. A visible confirmation button advances one checkpoint; there is no autoplay or timed progression. Skill tests and actual choices retain their existing explicit controls.
- View table minimizes the event while keeping actions and seat changes locked. Source-card inspection, read-only event history and settings do not advance the game. Escape/close only minimizes the checkpoint. Event IDs reject stale confirmations; browser verification also checks double clicks.
- Saves are version 3 and preserve the exact pending event, queue, test or choice. Version 1 and 2 saves migrate automatically without changing the storage key. The most recent 500 public events are retained; future card draws are excluded from presentation snapshots.
- Kept presentation independent from game rules in `src/game/presentation.ts`. Preserved source-card attribution through recursive damage assignment and added explicit fire/reshuffle explanations. Corrected the damage-assignment investigator label and party-scaled Act 2 guidance.
- Added 13 pacing regressions, bringing the suite to 77 tests. Existing rule tests explicitly acknowledge presentation checkpoints using a test helper; the new pacing tests use the raw reducer to verify that nothing proceeds without confirmation.
- Chromium checks passed attack/damage ordering, no timer progression, locked controls, paused table and card inspection, event history, phase checkpoints, encounter reveal before effects, reload, export/import, and independent party encounters. Continue remains visible at 1280×800 and 1440×1000; screenshots were visually reviewed. Existing solo and three-investigator desktop browser flows also passed after adapting their explicit confirmations.
- The develop-web-game Playwright client ran and its capture was reviewed. TypeScript and production build pass. Further verification and deployment evidence are kept under ignored `output/` files.
- Scope remains the scripted first scenario with Joe, Daniela and Trish. Presentation checkpoints do not add arbitrary fast-action timing windows, simultaneous-trigger ordering, later scenarios, or network play.
