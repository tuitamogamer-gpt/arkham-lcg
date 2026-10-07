# Scripted import continuation — 7 October 2026

Authorization: “hajde dalje import”. Starting checkout: clean `main` at
`13e2d48`. This continuation adds reachable campaign support and restores the
blocked native build. Catalog registration does not establish scripted support.

## Scarlet Keys travel

The native Scarlet Keys campaign forces its final embark prompt to
`current: Tunguska`, `available: [Tunguska]`. It does not supply an `isFinale`
field. Chronicle previously hid the current location's action and rejected its
answer, leaving this checkpoint impossible to complete in the Chronicle table.

The table and answer builder now share one route projection. It exposes the
explicit Tunguska confirmation, preserves native travel operations, keeps
disconnected (`null`) distances unavailable, applies the extra day for green
destinations, checks ticket eligibility, and keeps Bermuda Triangle hidden until
the native prompt unlocks it. Other native finale detours are preserved.

Source evidence comes from pinned engine revision
`03a7f1e74925744f021f6e8fe0e39945d2c3a833`:

- `backend/arkham-api/library/Arkham/Campaign/Campaigns/TheScarletKeys.hs`, embark branch:
  forced final location, tuple map payload, and the three travel operation keys.
- `backend/arkham-api/library/Arkham/Campaigns/TheScarletKeys/Meta.hs`:
  current-location and disconnected-path distances.
- `frontend/src/arkham/components/TheScarletKeys/WorldMap.vue`: green entry cost, ticket
  eligibility, final stop and hidden Bermuda Triangle.

Executed verification:

- Focused protocol/SSR coverage includes final travel and conditional setup.
- Chromium and WebKit fixture integration: explicit keyboard finale answer,
  pending/answered reload, green travel time, locked transit, disconnected route,
  hidden Bermuda Triangle, ticket retry after rejection, duplicate-click guard,
  and 320px layout. No page or console errors.
- The `develop-web-game` skill client completed the explicit finale action;
  its text state and desktop/mobile screenshots were inspected.
- TypeScript and production/PWA build passed.
- Final full Chronicle suite: 371 tests passed, zero failures, with
  `--test-concurrency=2` to bound worker memory during native restoration.

Browser evidence is under `output/imported-decisions/`; unit/build logs are
under `output/import-session-2026-10-07/`. Browser checks use isolated
native-shaped protocol fixtures through the real Chronicle UI. They do not
modify real saves or certify a whole native campaign playthrough.

To reproduce the browser checks, start the development server with the isolated
fixture bridge address, then run the check in another terminal:

```sh
VITE_ARKHAM_RULES_URL=http://127.0.0.1:5197 npm run dev -- --host 127.0.0.1 --port 5198 --strictPort
node scripts/imported-decisions-browser-check.mjs
```

## Fatal Mirage conditional setup

The standalone introduction can be turned off after choosing a partner killed
in the plane crash. The hidden crash selection previously still suppressed that
partner's independent status fields, so the resulting native answer omitted
valid partner details. Conditional state now excludes inactive groups and their
descendants, and crash-survival conditions consult only an active crash choice.
The player's original form choices remain available if the branch is restored.

An active crash choice also requires one of the nine printed partner codes;
the native parser accepts a card code, while the previous form could send null.
Inactive crash groups are omitted and require no selection. Source evidence:
`frontend/src/arkham/data/edgeOfTheEarth.json` (Fatal Mirage, `08549`) and
`backend/arkham-api/library/Entity/Answer.hs` (`SetPartnerKilled`). Semantic
tests cover the full nine-partner schema, hidden nested records and restored
branches. Browser fixtures exercise preserving a partner's damage choice,
turning introduction on/off, omitting hidden crash records, local required-choice
validation and retaining the surviving partner.

## Epic participant undo boundaries

Both original Epic adapters persist shared physical changes as an originating
step plus synthetic, empty-inverse steps in the other groups. Undo previously
looked up only an originating journal. A receiving group could therefore remove
its synthetic cursor and then rewind older local steps across a coupled change
without the coordinator's revision and sibling checks.

Both adapters now check same-event foreign journals for the exact participant
game/cursor before allowing undo. A foreign synthetic boundary must be undone
from the initiating group; multi-step undo rejects any selected range crossing
it. Originating undo retains its revision and sibling-cursor checks. A shared
pure validator and nine focused Hspec cases cover these invariants. Their
execution and SQL transaction/no-mutation proof are pending the aggregate build.

Live candidate checks will use an offline APFS clone of the cleanly stopped
PostgreSQL 14 database, private local credentials and verified migration files
under `output/rules-server-aggregate-qa-2026-10-07/`, with distinct service/API/PG
ports. The clone has independent inodes; all 1,370 original database files were
hashed before copying. This permits read-only legacy-save verification and new
QA games without starting or changing the original database. Clone evidence:
`output/rules-server/aggregate-qa-clone-2026-10-07.json`.

The extended live API harness requires the exact foreign synthetic cursor and a
valid native undo range before probing single-step and whole-scenario undo. A
rejection must identify the foreign boundary, preserve all three public game
views, and preserve hashes of database game, step, log, player, event,
coordinator and journal rows. Wrong-seat read/undo probes require HTTP 403 and
the same no-mutation proof. These checks have not yet run against the candidate.

`scripts/epic-runtime-check.mjs --prepare-table` prepares separate fresh native
events at unspent player windows for browser checks. Its report declares only
`prepared`, never full acceptance. Browser checks consume the recorded seat
hashes and baseline snapshots. `BARKHAM_RUNTIME_REPORT` lets the existing
read-only Barkham table check consume the new aggregate report without replacing
the older proof.

## Native aggregate recovery

The installed executable verified at 12:30 declared only `barkham`. Previous
Labyrinth behavior proof (102 examples / zero failures) does not certify a new
aggregate or Machinations. The former source/compiler/object cache was absent.

Restored the exact pinned source outside Git at
`/private/tmp/arkham-upstream-research` and successfully staged Barkham,
Labyrinth and Machinations. Restored checksum-pinned GHC 9.14.1, Stack 3.11.1,
PostgreSQL 14.15 development files and PCRE 8.45 under
`/private/tmp/arkham-build-toolchain`. Focused test dependency restoration
advanced the reusable cache but stopped at the 2 GiB reserve when available
space fell to 1.67 GiB. It retained 84 dependency registrations, up from 11.
It did not reach native engine compilation or testing. No task compiler
processes remained after the controlled stop.
Evidence: `output/rules-server/resume-dependencies-network-machinations-2026-10-07.log`
and `output/rules-server/resume-checkpoint-2026-10-07.json`.

Removed only checksum-verified redundant toolchain archives and extracted
PostgreSQL/PCRE installation sources after validating the installed tools and
headers. This recovered 545,447,936 allocated bytes; Hackage, Pantry, compiled
dependencies and the pinned engine source were retained. Exact cleanup proof:
`output/rules-server/resume-restoration-input-cleanup-2026-10-07.json`.

Added a build-space guard that checks every relevant filesystem before
commands/downloads and during child commands. It terminates the entire compiler
process group on reserve exhaustion and forwards interruption signals. The
installed runtime, database and reusable build cache are retained. Focused
tests cover preflight refusal, invalid reserves, uncooperative child/descendant
termination and interruption cleanup. See `docs/rules-runtime-build.md` for
recovery commands.

Closure verification found both installed `bin/arkham-api` executables absent:
the base runtime directory changed at 12:38:46, and the derived runtime
directory at 12:38:51, before the resumed dependency command began at 12:47.
The manifest still records the previously verified Barkham hash
`b53bdf9edfcdf98ad2905e585702295c76cfd462ac6011bfdc44d37e84b82b5a`,
but its executable is unavailable and current signature verification fails.
The user confirmed these executables were deleted to free space. Dependency-only
orchestration returns before packaging, and the disk guard never deletes files.
No replacement was found
in task output, temporary build paths, Spotlight or Finder's empty Bin.
The private saved-game database and its backup remain present. Local native
play currently requires executable recovery; the official base release cannot
reproduce the custom Barkham binary. After free space recovered to about 13 GiB,
guarded dependency restoration resumed. Candidate packaging uses the retained
base libraries/data/PostgreSQL tools and the newly compiled executable; it does
not need the deleted base executable. The user then requested “dosta provjera,
ajmo push commit deploy”. The managed dependency build stopped cleanly at 278
retained registrations, with 13.3 GiB available and no task compiler descendants.
The pinned source and reusable cache remain. No aggregate restage, native
compilation, behavior tests, candidate preparation or installation began.

Remaining native acceptance: finish dependency restoration, compile/link the full
aggregate, execute its Haskell behavior suite, prepare/sign a candidate, then
verify native three-group gameplay/persistence and client decisions before
installing the replacement and unlocking Epic. The requested release publishes
the verified Chronicle client changes and authored recovery/QA/native sources;
Epic remains gated. No further local test suites were run after that request.
