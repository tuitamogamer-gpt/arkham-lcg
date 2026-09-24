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
- Added 27 regressions: 142 tests pass. Existing baseline fixtures now explicitly pass unused Fast windows and select newly offered result orders where appropriate; timing/pacing tests exercise the raw reducer. Save validation checks current windows and balanced resolution scopes. Older v3 saves migrate the boundary of a pending encounter or event; both pre-revelation and mid-test saves are regression-covered.
- New browser script exercises actual Fast choices, teammate interruption and test restoration, reload, manual pacing, Forced/ST.7/Fire ordering and encounter resets. New dialogs were visually inspected at 1280×800; controls also checked at 1440×900 and 1920×1080. Party, pacing and prior rules browser checks pass without errors. The develop-web-game client also ran and its screenshot was inspected.
- Scope remains Spreading Flames with Joe, Daniela and Trish. Next content work is Dexter/Isabelle and their starter decks, then the remaining scenarios and campaign upgrades; arbitrary custom-card combinations are not certified. Release proof is written to ignored `output/timing-windows/`.

## Physical tabletop research and frontend — 24 September 2026

- User requested research into the live tabletop experience and implementation of that appearance. Examined 2026 rulebook pages 8–10, the current campaign setup and real session photography. Findings and source links: `docs/tabletop-design-research.md`.
- Added full landscape agenda/act stacks, native investigator cards, portrait locations with real unrevealed faces, miniature investigator markers, clue/fire/injury/resource counters, public encounter/discard/bag/victory viewers and card-based assets with exhaustion orientation.
- Reorganized gameplay around a continuous playmat with shared scenario area and personal play area. Kept existing engine dispatch, explicit event confirmations, Fast windows, saved state and compact dialogs.
- Added a dedicated tabletop browser check. First visual pass caught excess vertical spacing and an expanded-map overlap; refinement and browser verification are in progress. Existing 142 rules/save tests pass, and the initial TypeScript/production build passes.
- Cached nine additional original front scans and seven alternate faces; provenance is recorded. Local reference images and QA screenshots live under ignored `output/tabletop-research/`.
- Final visual verification caught inconsistent ArkhamDB side naming: all five campus locations use the `b` file for the revealed face, while Your Friend’s Room uses the inverse. Visually checked all twelve location images, added explicit `LOCATION_ART`, and corrected default card inspection to show the revealed rules face. Unexplored cards now show the keyhole face and no live clue value.
- Final validation: TypeScript/production build passes; existing 142 rules/save tests passed. Three-investigator desktop browser flow and player-controlled pacing flow pass. Dedicated tabletop checks pass at 1280×800, 1440×1000, 1920×1080, 1024×900, 390×844 and 320×740, with no page overflow, no location-card overlaps and no browser errors. Main actions are visible without scrolling on the three target desktop sizes.
- Browser verified public pile/bag/victory inspection without state mutation, connected-location read versus move, an actual hand-to-mat card play, a nearby enemy fight and the correct Hard/Expert reference. Gameplay and dialog screenshots were visually reviewed. The required develop-web-game client ran again and its capture was inspected.
- Local dev preview is running at http://localhost:5187. No commit, push or production deployment was performed for this request. Captures and machine-readable verification: `output/tabletop-research/verified/`. Research and implementation are complete; earlier content milestones remain unchanged.
- User subsequently authorized commit, push and deployment. Release verification for the published commit is recorded separately under ignored `output/tabletop-release/`.

## Card artwork, combat clarity, hover previews and story presentation — 24 September 2026

- Current request: complete missing encounter/enemy/ability scans, authentic skill icons, fix overlapping fallback text, make weapon attacks discoverable and distinguish Daniela's reaction, simplify dialogs, explain encounter destinations, hover access to scenario/campaign information, and story popups on act/agenda transitions.
- Initial findings: 135 of 196 card definitions lacked cached art; the old fetch script stopped after six failures. Weapon Fight already exists but defaults to bare hands in a small selector; Daniela correctly offers a separate fight after an attack.
- Completed artwork recovery using the working `assets.arkham.build/optimized/{code}.jpg` mirror, with ArkhamDB fallback, per-file retries, content-type/size checks, and source attribution. Final catalog cross-check caught the hidden Elokoss face without API image metadata; the cache now derives that URL too. Final coverage: **196/196 definitions, 233 faces**, zero unavailable.
- Added the locally served ArkhamCards game-symbol font, explicit weapon attack buttons and ammo counters, selected-weapon test explanation, and Daniela’s attributed counterattack dialog. Corrected the empty-ammo message for M1903 and its inclusion in a legal Daniela reaction.
- Added read-only pointer/keyboard previews for story, investigator, assets, enemies and campaign. Preserved future-story secrecy on hover. Act/agenda events retain previous/current face metadata and show reverse-side narrative plus the new objective, including reload persistence.
- Encounter events show reveal/resolution/destination, with exact discard/threat/Fire handling (including duplicate threats and no eligible Fire location). Dialogs are portaled outside the transformed game surface, keep one accessible focus owner and maintain body scroll lock across nested inspection.
- Fixed original scan aspect-ratio overrides and bounded text fallbacks. Screenshots were visually reviewed for hover, story, encounter, pistol test, counterattack, mobile and intentionally corrupt images.
- Validation: **150/150 engine/save/presentation tests**, production build, tabletop browser checks across 320–1920px, player-controlled pacing/save export/import checks, and dedicated refinement browser checks. All local card faces are decoded in Chromium, including hidden catalog cards. Artifacts: `output/refinements/`, `output/tabletop-research/verified/`, `output/pacing-browser/`. Required develop-web-game client ran and captures were inspected.
- Delivery is local at http://localhost:5187. No commit, push, or production deployment for this request. Existing unimplemented investigators/scenarios/campaign upgrades remain the documented content scope; there are no outstanding fixes from this request.
- User subsequently authorized commit, push, and production deployment. Release evidence for this publication is recorded in ignored `output/refinement-release/`; the 150 tests and local browser/build checks above were completed before publication.

## Progressive campaign discovery and table animation — 24 September 2026

- User requested campaign information only as needed, no spoilers, more animation, then commit/push/deploy.
- Replaced later chapter names, settings and teasers with sealed case files. Removed the full campaign-guide shortcut from the in-game field guide. Failed/retreated outcomes no longer introduce a character the player may not have met.
- Centralized public discovery policy across archive/search/filter/counts and card details. Player cards remain public; encounter identities, campaign rewards, unseen location rules and future act/agenda backs stay sealed. Completed story reverses become readable when their transition occurs. Public automation summaries omit unrevealed location counters.
- Discoveries persist in optional validated save metadata, survive the 500-event journal limit, and migrate conservatively from older public state. New games reset discoveries. The encounter deck, queued future effects and set-aside cards never populate this record.
- Added public-state motion cues for resources, clues, injuries/healing, draw/play, marker movement, location reveals, attack/exhaustion/readiness, doom, phases and story cards. Added chaos-token turns, event motifs, step transitions, button feedback and ambient embers. Animation completion has no engine callbacks; all checkpoints still require explicit continuation.
- Cinematic/Subtle/Off preferences persist separately from saves; system reduced motion is honored. Effects clean up on state changes/unmount and when switched off. Browser inspection caught a motif/close-button overlap and cramped mobile story columns; both were corrected. Current-investigation navigation now retains an accessible name in the compact sidebar.
- Verification: 158/158 rule/save/discovery/motion tests; production build; broad desktop/mobile game flow, three-investigator desktop play, pacing/save checks, tabletop layout checks and refinement checks. Dedicated discovery/motion browser checks cover sealed search, current versus completed story faces, reveal/move unlocks, draw/play/combat, saved checkpoints, all motion preferences and 320/390/1280/1440 widths, with zero browser errors. Screenshots are visually reviewed under `output/story-motion/`; the required develop-web-game client captures are also inspected.
- Release to the connected GitHub main/Vercel production is authorized. Exact SHA, deployment and production-browser evidence will be kept in ignored `output/story-motion/release/`. Existing unimplemented content milestones remain unchanged; no new scenario scripting is claimed.

## Original-game visual identity — 24 September 2026

- User clarified that the entire design, including typography, must follow the original Arkham Horror LCG's identity. Revisited the original 2026 rulebook's printed layout and existing original card scans.
- Added locally served SIL OFL Teutonic display lettering and variable Crimson Pro regular/italic reading faces, retaining license files and documenting source/role distinctions in `docs/visual-identity.md`. Crimson Pro is an open reading substitute, not a claim of exact official body typography. Removed the external Google Fonts stylesheet and centralized every previous Cinzel/Cormorant/DM Sans usage into font-role variables.
- Applied display lettering to campaign, investigator, location, asset and dialog titles; adjusted control and small-label sizes; used cream paper with dark green ink for event text; added rulebook-inspired asymmetric printed frames and subdued paper/brass colors.
- Production build and `git diff --check` pass. Existing campaign/game browser checks, tabletop checks (320, 390, 1024, 1280, 1440 and 1920 widths), pacing/save checks, and discovery/motion checks pass without browser errors. Repeated the tabletop checks after the final label refinement. Required develop-web-game client ran after both visual passes and its final capture was inspected.
- Visually reviewed the finished home, setup, game table, skill test, encounter event and long story dialog including the 320px layout. Verified display, regular and italic fonts actually load with all external requests blocked; no external requests or console/page errors. Evidence: `output/visual-identity/`, `output/tabletop-research/verified/`, `output/pacing-browser/`, `output/story-motion/browser/`.
- Local preview: http://127.0.0.1:5187. No commit, push or deployment performed for this request. No engine/save/content changes or new content claims; existing content milestones remain unchanged.
- User subsequently authorized commit, push and production deployment. Release confirmation for this visual-identity change is recorded under ignored `output/visual-identity/release/`.
