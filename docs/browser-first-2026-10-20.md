# Browser-first release — 20 October 2026

The production expansion entry previously tried to connect to a local Apple Silicon companion and asked players to run a terminal command. The default build now opens a campaign and product library without loading the native UI or contacting loopback. Spreading Flames remains the playable browser scenario. Other imported scenarios are clearly marked as browseable content, not browser gameplay.

## Changes

- Search all 116 imported products, filter categories, clear empty results, and open the selected product in the card archive. Story spoilers remain sealed by default.
- Search cards, products and investigators by multiple words in any order, ignoring punctuation and accents. Card searches include every product containing a printing, including repackaged expansions.
- Selecting a named investigator dossier on the home page now selects that investigator in party setup instead of reopening the previous default party.
- Remove unavailable expansion-play actions and Mac installation instructions from the default player journey. Old native investigation links explain their scope without connecting, converting or deleting their saves.
- Retain native imports and developer tools behind the explicit build-time flag `VITE_ENABLE_LOCAL_RULES=true`. The default production bundle excludes the native UI. Build optional native browser fixtures separately in CI so they remain tested without enabling them for players.
- Make macOS native packaging manual-only; routine pushes and production releases no longer trigger it.

## Validation

`npm run check`: 642 tests pass, TypeScript and production build pass. The production asset scan contains neither the companion connection screen nor its loopback endpoint. The new `scripts/browser-first-check.mjs` exercises the actual production build, including 1440px, 390px and 320px layouts, product navigation, sealed spoilers, accent-insensitive investigator search, selected party member, legacy links and zero loopback requests.

Existing smoke, review, milestone, save-recovery, save-conflict and offline browser suites cover the browser engine. The continuation suite and native portion of the milestone suite target a separate opt-in build (`NATIVE_BASE_URL` for the latter). Source changes do not touch the native engine or existing save formats.

## Scope

No hosted native rules service is provisioned by this release. Local native saves stay in their original database. Removing the Mac requirement from the published player journey does not port expanded native scenarios to the browser or turn local saves into cloud accounts. The existing local-first browser game and its backup/export flow remain authoritative.
