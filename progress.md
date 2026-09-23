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
