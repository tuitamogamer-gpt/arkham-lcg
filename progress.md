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

## Compact desktop action dialogs — 23 September 2026

- User found too much empty space in action popups. Reduced event windows from 920px to 760px wide, with 640px windows for events without a source card. Tightened header/body/footer spacing and reduced the card preview to 140×200px with full-card inspection available.
- Removed the duplicate name below card previews and added a compact variant for skill tests, decisions and end-turn confirmations. Text and controls remain grouped, with content-driven heights.
- Visual comparison: the damage result window is 452px tall instead of 646px (30% shorter). Resource results are 343px, choice windows 248px, and end-turn confirmation 229px. Encounter text and Continue fit at 1280×800 and 1440×1000.
- Verified actual gameplay captures, card-text expansion, skill commitment/result, reactions and confirmations with no browser errors. Existing pacing browser checks and the develop-web-game client pass; TypeScript and production build pass. Release evidence is recorded under ignored `output/popup-layout/`.
- Continue with the previously documented scenario/content milestones; desktop remains the current design priority.

## Rules, keywords and errata audit — 23 September 2026

- Interpreted the user's dictated request as checking the engine/rules, especially keywords, errata, edge cases and interactions. Used official Arkham Grimoire v1.1, the July publisher update, 2026 rulebook and Brethren of Ash campaign guide. Kept the audit scoped to Spreading Flames and the three fixed supported starter decks.
- Reproduced defects before implementing the main corrections. Fixed Peril and Surge keyword handling (including non-stacking Overzealous/Cosmic Evils), teammate Bodyguard allocation and ownership, Mutated! group horror, simultaneous Fire damage, attack ordering/exhaustion, Retaliate timing, exhausted engagements, Machete eligibility and current Prey skill values.
- Added serializable limbo for commitments/events, ST.8 cleanup, current skill modifiers, simultaneous multi-card draws/reshuffle horror, and empty-deck defeat. Added FIFO queued tests and ST.4 Daniela elder-sign resolution, including save/reload and defeat while a test is suspended.
- Corrected extra-evade action counting, Wounded's per-turn reset, legal empty-location investigations, removable teammate threats, no-effect healing choices and Prestidigitation payment order. Added choice of simultaneous-defeat trauma, replacement lead and Armitage campaign bearer.
- Added 38 rule regressions: 115 tests pass. TypeScript/production build passes. New rules browser script passes at 1280×800 with zero errors, alongside existing party desktop and pacing checks. Visually inspected compact damage, Peril, commitment, attack-order, elder-sign and queued-test windows. The develop-web-game client ran and its screenshot was inspected.
- `docs/rules-audit.md` contains sources, reconciliation, coverage and remaining rules limits. General player windows, simultaneous trigger/result ordering, and exact encounter-deck reset boundaries still need further work. Do not claim complete core-set or exhaustive rules support.
- Release remains authorized for GitHub main and connected Vercel production. Exact commit/deployment evidence is kept under ignored `output/rules-audit/`.

## Fast windows, timing order and encounter boundaries — 23 September 2026

- Continued the three remaining rules items from the audit. Consulted Grimoire v1.1's actual timing-chart layout: upkeep's window precedes readying, and skill tests have separate windows before and after commitment.
- Added serializable player windows with legal options for every active investigator. Own-turn Fast cards, Wrench, location/act abilities, boosts and Peril restrictions use current state. The compact window shows the tested investigator, live skill/difficulty and commitment count. Passing and ability resolution preserve the original test/turn owner; no timer or Escape key advances it.
- Added ordered timing groups for scripted simultaneous Forced effects, optional reactions, Fire locations, Hunters and ST.7 consequences. Groups preserve compound card instructions and scenario/player Forced priority. Reaction eligibility is checked again after each resolution, including a Bandages supply being used up. Gather Intel is offered to all eligible investigators at an enemy arrival.
- Added serializable resolution scopes and encounter resets at completed effect boundaries. The final treachery stays outside discard until it resolves. Paint the Town Red and Fire discard targeting are regression-covered on both sides of the reset boundary.
- Added 26 regressions: 141 tests pass. Existing baseline fixtures now explicitly pass unused Fast windows and select newly offered result orders where appropriate; timing/pacing tests exercise the raw reducer. Save validation checks current windows and balanced resolution scopes.
- New browser script exercises actual Fast choices, teammate interruption and test restoration, reload, manual pacing, Forced/ST.7/Fire ordering and encounter resets. New dialogs were visually inspected at 1280×800; controls also checked at 1440×900 and 1920×1080. Party, pacing and prior rules browser checks pass without errors. The develop-web-game client also ran and its screenshot was inspected.
- Scope remains Spreading Flames with Joe, Daniela and Trish. Next content work is Dexter/Isabelle and their starter decks, then the remaining scenarios and campaign upgrades; arbitrary custom-card combinations are not certified. Release proof is written to ignored `output/timing-windows/`.
