# Scripted import continuation in the Linux workspace — 7 October 2026

Authorization: “Nastavi Import dalje”. Starting checkout: clean `main` at
`5cbec7a`. This is a fresh Linux x86_64 workspace, distinct from the earlier
macOS machine. It contains no previous native executable, private saved games
or compiled dependency cache. Historical macOS results do not certify this
checkout's changed extensions.

## Completed campaign continuation integration

The Chronicle table now distinguishes native scenario steps from interludes,
checkpoints and campaign-specific tuples. A Scarlet Keys `embark` continuation
and an interlude can proceed without choosing a scenario's lead investigator.
The answer preserves the native step and its tuple contents.

For The Forgotten Age's `04043` and `04054`, and Return variants `53016` and
`53017`, the recorded expedition leader is required unless the native scenario
options explicitly mark standalone play. The UI selects that investigator,
disables alternatives and preserves an unavailable-leader question without
sending an invalid answer. The answer builder validates supplied investigator
IDs against the living native campaign roster, including investigators owned
by other player seats.

Existing tarot/setup options and standalone return steps survive the answer.
Ordinary scenario starts retain explicit lead selection in the table; an
undefined lead in the protocol builder preserves the native step so the engine
can ask its own `ChooseLeadInvestigator` question.

Pinned source evidence at `03a7f1e74925744f021f6e8fe0e39945d2c3a833`:

- `frontend/src/arkham/components/ContinueCampaign.vue`: native scenario
  constructors and expedition leader restriction.
- `backend/arkham-api/library/Arkham/Scenario/Scenarios/TheForgottenAge/TheUntamedWilds.hs`
  and `TheDoomOfEztli.hs`: mandatory expedition leader outside standalone play.
- `backend/arkham-api/library/Arkham/Scenario/Runner.hs`: an explicit option
  bypasses the scenario's lead-choice handler.
- `Arkham/Campaign/Runner.hs` and `Entity/Answer.hs`: standalone resume steps and
  priority of a scenario's own continuation over the campaign return step.

Executed client verification:

- **383/383 TypeScript tests**, zero failures, including seven new semantic
  continuation tests, four compilation-profile boundary tests and a native
  test-environment regression.
- TypeScript and production/PWA build passed.
- **Ten Chromium/WebKit UI checks** passed with zero browser errors. They cover
  the forced expedition leader, preserved tarot options, explicit keyboard
  confirmation, pending and answered reload, ordinary lead selection, rejected
  answer retry, duplicate-click protection, Return variants and two
  non-scenario continuations at 320 px. Desktop/mobile captures were inspected.
- `git diff --check` passed.

Evidence is under ignored `output/import-continuation/` and
`output/campaign-continuation/report.json`. The browser bridge uses isolated
questions shaped like the pinned native protocol through the real Chronicle
UI. It does not execute a full native campaign or modify private saves.

To reproduce the UI checks, start these in separate terminals:

```sh
VITE_ARKHAM_RULES_URL=http://127.0.0.1:5197 npm run dev -- --host 127.0.0.1 --port 5198 --strictPort
node scripts/campaign-continuation-browser-check.mjs
```

## Authored Machinations mechanics corrections

Native removal and Edwin's flip retain historical entity records. Shared era
progress now checks physical placement, so the removed Rival or Colleague
cannot select a live-face failure resolution or remain available to remote
story actions. Regression scenarios exercise actual native removal, redeemed
faces and a serialized/reloaded game.

Selecting a shared machination or plot now records its unfinished story in all
three eras immediately. Uneasy Alliance requires authoritative completion of
the selected plot, and resolution one requires authoritative completion of
both selected stories. Empty or stale native progress cannot complete them.
Coordinator tests cover staged local completions and stale empty reports.

The actual coordinator suites compiled against the pinned native sources and
passed **51 Hspec examples / zero failures: 30 Labyrinth and 21 Machinations**.
This includes the shared setup/completion corrections and Labyrinth's nine
previously pending undo-boundary cases. The proof records the actual 17 compiled
local source/suite hashes and test binary/driver hashes, which were independently
rechecked after execution. These are the unchanged original suite modules, with
their real native dependencies and generated Cabal language settings.

The separate proof is `output/rules-server/rules-coordinator-tests.json`, with
`scope: coordinator-only`, `fullAggregate: false`, and no installation. The
Edwin physical-entity regressions and Uneasy Alliance's entity-level test still
require the full native graph. Epic create controls remain gated by a verified
installed runtime. No completed Machinations playthrough is claimed.

## Native recovery and compilation boundary

The build now supports a private Linux x86_64 `--compile-only` path. It uses
checksum-pinned GHC 9.14.1 and Stack 3.11.1 with the pinned upstream source and
the original aggregate extensions. It skips macOS runtime packaging and has no
candidate, signing, installation or capability-manifest side effects. CLI
regressions verify that incompatible packaging flags and an ordinary Linux
runtime build fail before source/toolchain restoration.

The existing disk-guard regression now recognizes an exited Linux orphan
zombie as stopped. Container PID 1 may retain its PID after SIGKILL; the test
still rejects a running compiler descendant. The production guard is unchanged.

Native Hspec execution removes inherited `HSPEC_*` options and ignores Hspec
configuration files. A dry run or a user-specified filter cannot substitute
for the requested mechanical examples. Both full and coordinator-only runners
use the same test-environment preparation. An actual deliberately failing
Hspec probe executed and failed despite inherited dry-run/filter options and a
hostile `.hspec` file, confirming that this preparation does not silently skip
the test. Its **1 example / 1 expected failure** is recorded separately under
`output/import-continuation/hspec-negative-probe/` and is not mechanical proof.
The real coordinator suites then passed with hostile inherited options too.

The external source and toolchain were restored under
`/workspace/arkham-upstream-research` and
`/workspace/arkham-native-toolchain`. Compatibility symlinks at `/tmp` preserve
the initial paths. `/tmp` is a separate smaller volume, so the build uses the
workspace volume with a 2 GiB reserve. GHC and Stack run, PostgreSQL/PCRE
development files were built, the gold linker was restored in a private prefix,
and the final aggregate source stage succeeded. The first full dependency run
stopped cleanly with 89 registrations; the focused coordinator route reused
that cache and completed its actual dependency graph and Hspec execution.
Source, toolchain, dependencies and coordinator objects remain available.
The final exact command, hashes, package records and reserve are in ignored
`output/import-continuation/native-checkpoint-2026-10-07.json`.

To repeat the completed focused batch:

```sh
PATH=/workspace/arkham-native-toolchain/system/usr/bin:$PATH \
ARKHAM_RULES_SOURCE=/workspace/arkham-upstream-research \
ARKHAM_RULES_TOOLCHAIN=/workspace/arkham-native-toolchain \
ARKHAM_RULES_DISK_RESERVE_GIB=2 \
node scripts/build-rules-runtime.mjs --with-epic-machinations --coordinator-tests
```

Next native work is full dependency restoration with `--test-dependencies`,
followed by the Linux `--compile-only --incremental-native --direct-objects
--test --compact-build` aggregate. Full entity/API tests, aggregate linking,
macOS runtime packaging/signing and live three-group persistence/client
acceptance remain pending. A Linux coordinator result alone cannot enable Epic.

The implementation phase ended without a commit, push or deployment.

## Authorized web release

The user then requested “Push commit deploy”. Release review found no web
deployment blocker and confirmed the existing `main` → Vercel production
connection for `tuitamogamer-gpt/arkham-lcg`, project `arkham-lcg` in
`tuitamogamer-7851s-projects`. Source/cache and ignored local evidence remain
outside the commit. Epic runtime gates remain unchanged.

The Linux compiler-descendant assertion also accepts a `/proc` record that
disappears after the PID probe, because the process has then been reaped. Its
five focused regressions passed after this final test-only adjustment.
