# Arkham LCG: from the physical table to the screen

Research and implementation: 24 September 2026. Scope: the existing 2026 Core Set implementation of **Spreading Flames**, with one person controlling one to three investigators.

## References examined

1. **Fantasy Flight Games, 2026 rulebook, pages 8–10.** Downloaded and visually examined the setup illustrations and sample table on page 10. Agenda and act cards lie horizontally; the scenario reference and encounter piles occupy the shared area; portrait locations form the map. Each player has a landscape investigator, assets, draw pile, discard and threat area. Page 9 distinguishes revealed from unrevealed location faces. [Official PDF](https://images-cdn.fantasyflightgames.com/filer_public/0e/d0/0ed09507-1705-47ed-a630-cd15885cabb0/ahc100_rulebook-web.pdf).
2. **Fantasy Flight Games, Brethren of Ash campaign guide, pages 2–3.** Verified the campaign, difficulty-dependent chaos bag, initial location and set-aside components for Spreading Flames. Only locations actually in play should appear on the map. [Official PDF](https://images-cdn.fantasyflightgames.com/filer_public/f0/22/f022ac7c-9c30-4521-ac16-1f74f00e1d31/ahc100_campaign_guide-web.pdf).
3. **Quarter to Three, actual tabletop session photograph.** Visually examined location cards joined by connection markers, separate player mats, landscape investigators, upright assets and hands near the players. This is an earlier campaign, used as spatial reference rather than as the current scenario's rules or card list. [Discussion and photograph](https://forum.quartertothree.com/t/arkham-horror-living-card-game-the-qt3-slumber-party/157706?page=3).
4. **ArkhamDB scans of this project's 2026 printings.** Added the seven act/agenda fronts, scenario reference and alternate faces for the reference and all six locations. Source URLs are recorded in `card-image-sources.json` and `tabletop-art-sources.json`. [Past Curfew](https://arkhamdb.com/card/12106), [Your Friend's Room](https://arkhamdb.com/card/12113).

**Scan orientation was verified visually, not inferred from filenames.** The five campus locations use the `b` scan for their revealed rules face; Your Friend’s Room uses the opposite convention. `LOCATION_ART` records this mapping, and card inspection uses the revealed rules face.

Research images and rendered rulebook pages are retained locally under `output/tabletop-research/`; third-party photographs are not bundled into the application.

## Decisions implemented

| Physical component | Screen treatment |
| --- | --- |
| Shared scenario area | Landscape agenda and act stacks to the left, map in the centre, encounter piles and bag to the right. Groups the same components as the rulebook while fitting a wide screen. |
| Card surface | Continuous subdued green playmat, thin zone boundaries, paper edges and small shadows. The existing Miskatonic illustration is a restrained background. |
| Location map | Full portrait scans, connection lines, miniature investigator portraits, clue and fire markers. Unrevealed locations use their actual unrevealed face. |
| Reading versus moving | Clicking a connected location preserves movement. Its separate eye button reads a revealed location without spending an action. |
| Investigator | Native landscape card, live skills, damage/horror counters, resources and clues. Injury counters show damage/horror taken; accessible labels also state remaining capacity. |
| Assets | Card faces, supplies/injury counters, sideways orientation when exhausted and a separate personal threat list. |
| Hand | Original upright faces at the player's edge, full-card inspection and explicit Play controls. Large hands can scroll. |
| Decks and discard | Facedown stacks with live counts, top discarded card faceup and read-only pile inspection. Encounter deck identities/order remain hidden. |
| Chaos bag | Read-only token contents and the reference for the selected difficulty; Hard/Expert uses the reverse face. Opening the bag does not draw a token. |
| Victory display | Public, inspectable cards earned in this scenario. |
| Narrative and actions | Compact history drawer, persistent actions, original confirmations, Fast windows, choices and manual event pacing. |

Custom deck backs and interface tokens are CSS interpretations, not scans or claims of exact official reproduction. The play surface uses a top-down view so that perspective does not distort card text and hit targets. Movement and card play remain governed by the existing engine.

## Implementation and verification

- `src/components/Tabletop.tsx`: physical components and read-only public pile viewers.
- `src/components/Game.tsx`: table integration retaining action dispatch and test/choice dialogs.
- `src/tabletop.css`: scoped layout, desktop priority, narrow-screen reflow and reduced-motion support.
- `scripts/cache-tabletop-art.mjs`: reproducible alternate-face caching and provenance.
- `scripts/tabletop-browser-check.mjs`: live inspection, hidden-information boundaries, move/read distinction, asset play, combat, alternate difficulty face and viewport checks.

The engine, campaign scope and save schema are unchanged. This redesign does not add the remaining campaigns, custom decks or network multiplayer.

Validation completed: production build; 142 existing rules/save tests; three-investigator desktop flow; manual event-pacing flow; dedicated tabletop browser checks at 320, 390, 1024, 1280, 1440 and 1920 pixels. No browser errors, horizontal page overflow or location-card overlaps were observed in these checks. Main actions remained visible at all three target desktop sizes. Full gameplay captures, pile inspection and a combat test were reviewed visually. The larger table and long hands remain scrollable; this is not a claim that every component fits into every viewport simultaneously.

The linked Vercel project deploys `main` to https://arkham-lcg.vercel.app. Release verification is recorded separately under ignored `output/tabletop-release/`.
