# Building the extended local rules runtime

`scripts/build-rules-runtime.mjs` is original orchestration for a private local build. It keeps the upstream source checkout, compiler, package downloads and build caches outside this repository. Only Chronicle's original extension modules and the small registration patch descriptions belong in Git.

The build uses upstream revision `03a7f1e74925744f021f6e8fe0e39945d2c3a833`, GHC 9.14.1, Stack 3.11.1, PostgreSQL 14.15 development files and PCRE 8.45. Compiler and build-tool archives are checked against SHA-256 checksums published by [GHC](https://downloads.haskell.org/~ghc/9.14.1/SHA256SUMS), [Stack's release](https://github.com/commercialhaskell/stack/releases/tag/v3.11.1) and [PostgreSQL](https://ftp.postgresql.org/pub/source/v14.15/postgresql-14.15.tar.bz2.sha256). The PCRE source checksum matches [Homebrew's package definition](https://github.com/Homebrew/homebrew-core/blob/master/Formula/p/pcre.rb); its download mirror is linked from [PCRE's site](https://www.pcre.org/).

The default source checkout is `/private/tmp/arkham-upstream-research`. If it is absent, the script fetches the exact pinned commit into a new external checkout. Set `ARKHAM_RULES_SOURCE` to use another checkout at that revision. An existing checkout with a different revision stops the build. The default toolchain and cache root is `/private/tmp/arkham-build-toolchain`, overridable through `ARKHAM_RULES_TOOLCHAIN`. The compiler is extracted in place, without profiling libraries or documentation. Only libpq, its headers and `pg_config` are compiled from PostgreSQL source; the existing isolated rules service keeps its own database runtime.

For macOS packaging, the base `v20260904.1` distribution must already be installed. On a fresh machine, start `npm run rules:server` once to install it, then run the build in another terminal. The build verifies that the base shared library, database executables, setup SQL and release frontend hash are present before compiling. The separate Linux compilation and private API routes below do not require that distribution.

```sh
node scripts/build-rules-runtime.mjs --dependencies
node scripts/build-rules-runtime.mjs --stage
node scripts/build-rules-runtime.mjs --test-dependencies
node scripts/build-rules-runtime.mjs --test
```

The dependency command can run while the extension is being authored. `--test-dependencies` stages the focused suite and installs its third-party dependencies without linking the engine. Staging copies the extension's `backend/Arkham/Homebrew/Barkham` directory and original Hspec tests into the external checkout and applies exact, repeatable source patches. Unchanged files retain their modification times so incremental builds reuse existing objects. The patches add open content registration for investigator and event behaviors and definitions, and player enemy weaknesses. They also keep encounter enemies separate from player weaknesses. The extension's `server-seams.json` adds the server guard that prevents Barkham content joining an ordinary scenario, or ordinary investigators joining Barkham. A source revision or registration anchor mismatch stops the build instead of guessing. Full builds stage the frontend and rebuild it when its extension hash differs from the existing `dist/source_hash`. The `--test` option compiles an original focused `barkham-spec` test component in the same Cabal configuration as the engine, then executes the linked native suite with `+RTS -N1 -A16m -RTS` before packaging. Its explicit module list contains only the two Barkham suites and four existing harness modules; it reuses the engine library and does not compile the other upstream test suites.

Once Stack has configured the engine and focused component, an incremental build can use the same private Cabal configuration directly:

```sh
node scripts/build-rules-runtime.mjs --incremental-native --test
```

The compiler defaults to a 4 GiB heap, one RTS capability and a 16 MiB nursery, which supports the complete native/API graph. `ARKHAM_RULES_GHC_HEAP` can adjust that bounded heap from `1G` through `8G`; a 2 GiB cap was insufficient for the full engine in this build.

This builds the engine and focused suite without copying or registering the large development library. If only test sources changed, `--test-built` reads the generated focused Cabal component's actual dependency, source-directory, language and compiler settings, then invokes the private GHC directly against the configured inplace engine. It requires the existing engine executable to be newer than all native engine inputs and avoids regenerating the unchanged library archive.

With an existing object cache and too little space for duplicated development libraries, append `--direct-objects` to `--incremental-native`. The script captures the configured Cabal library's actual GHC command before execution, restores the same explicit fast-build compiler options, and compiles the native objects without creating an archive or shared library. Cabal generates the exact current inplace registration description without installation; a private package registry exposes the resulting interfaces. The actual objects are passed directly to both executable links through GHC response files. The generated Cabal component supplies each entrypoint's dependencies, language settings and source paths. Runtime options remain real command arguments because GHC expands response files after RTS parsing. This route still compiles the full selected native/API component and executes the same focused tests before packaging. With `--compact-build`, Darwin executable links omit debug and local symbols directly with `-S -x`, avoiding a large intermediate; global symbols remain. The private main executable is then stripped before linking the tests; `rules-native-link.json` records both link and stripped hashes. The tests bind the resulting actual native engine hash. Once they pass, `rules-native-test-result.json` records the tested source, engine and test executable hashes before the regenerable test executable is removed for signing headroom. All native and test objects/interfaces remain available for relinking, and a signed runtime manifest is still written only after complete packaging.

`--configure-only --incremental-native --test` verifies the cached dependency plan and refreshes Hpack/Cabal module registration without starting the compiler or creating a runtime. It is useful before recovering build space and does not establish compiled support.

With `--direct-objects`, `--native-objects-only` stops after compiling and registering the complete native library/API component. Executable linking, tests and packaging remain pending. A later `--link-objects` run can continue from those real compiled objects only when the full staged native library hash and configured module list still match. If only focused tests changed and the private engine executable remains, `--test-built --direct-objects` reuses that same guarded object/interface registry for test linking.

With little free disk space, append `--compact-build` to a test build or packaging command. Only after the focused suite passes and both linked executables are confirmed to have no dependency on the generated Haskell library, this removes the project's regenerable static archive and shared build library. After preparing and hashing the stripped replacement, it also removes the superseded unstripped compiler executable to leave room for signing. Every object and interface file is retained, and `rules-prepared-input.json` records the native and prepared hashes. A later `--incremental-native --test` rebuild recreates those generated products from the objects; packaging recovery requires the compiler executable to still exist.

If compilation and linking succeeded but Stack's subsequent development-library installation exhausted disk space, the captured input record permits packaging the actual build-tree executables without repeating compilation:

```sh
node scripts/build-rules-runtime.mjs --package-built --test
```

This recovery command requires `output/rules-server/rules-build-input.json` to match the pinned revision and current extension hash. It rejects stale engine inputs or test sources, executes the focused native suite, and packages only a passing result. Keep the private source checkout, object files and linked executables until packaging completes.

Profiling and Haddock are disabled. Package builds and the main compiler use two parallel jobs; each compiler process has the configured bounded heap, one RTS capability and a 16 MiB nursery to control memory and swap pressure. The first build compiles several hundred dependency packages and thousands of engine modules, so it takes substantially longer than the Chronicle Vite build. Incremental builds reuse the isolated Stack cache.

Allow roughly 10 GiB of free space for a fresh build, including package indexes, compilation objects, libraries and test executables. Final linking temporarily holds another copy of the large engine archive. Stripping writes directly to the candidate executable; native macOS frontend copies request APFS cloning. Removing caches without preserving the compiled object files can cause the next build to repeat the engine compilation.

The build preserves a free-space reserve on the project, source and toolchain volumes. It checks before downloads and child commands, and every two seconds while a child command runs. If a volume drops below the reserve, the complete child process group receives `SIGTERM`, followed by `SIGKILL` after ten seconds if still running. The installed runtime, saved-game database and already compiled cache are retained. The default reserve is 1 GiB; set `ARKHAM_RULES_DISK_RESERVE_GIB` from 1 through 32 to leave more headroom. This is a stop guard, not a promise that a fresh build will fit. Restore dependencies separately before choosing the native build route when the previous temporary cache is absent:

```sh
ARKHAM_RULES_DISK_RESERVE_GIB=2 node scripts/build-rules-runtime.mjs --with-epic-machinations --test-dependencies
ARKHAM_RULES_DISK_RESERVE_GIB=2 node scripts/build-rules-runtime.mjs --with-epic-machinations --incremental-native --direct-objects --test --compact-build --prepare-only
```

Successful compilation creates `output/rules-server/derived-runtime/game/bin/arkham-api` and a `chronicle-runtime.json` manifest beside it. The manifest records the upstream revision, release archive checksum, frontend source hash, extension source hash, registration patch hash and compiled executable hash. It is written only after the executable exists and its installation signature is complete. Packaging stops if the original extension changed during compilation. The manifest lists expected card codes; the running API supplies the actual coverage list. It reports compilation; scenario and ability behavior still require separate playthrough verification.

A successful `--test` run additionally writes `output/rules-server/barkham-behavior-tests.json` with the actual Hspec example count, zero failures and the tested runtime, extension, native test executable and test-driver hashes. A new test build removes the previous proof first. These focused checks establish the exercised behaviors; they do not certify every possible playthrough or the separate Epic extension.

The derived runtime reuses the already installed distribution's PostgreSQL runtime, shared C libraries and setup data. It copies the built frontend into the project's ignored output directory and strips static executable symbols to reduce the installed size. A bounded Mach-O header edit replaces the temporary libpq path with `@loader_path/../lib/libpq.5.dylib` inside its existing string slot, preserving all command and segment offsets. Temporary unused search paths are rewritten similarly. Other temporary shared-library links stop packaging. The executable is then signed and verified with `codesign --verify --strict`. The unstripped compiler executable is retained unless compacting was requested. `ARKHAM_RULES_BUILD_FRONTEND_DIR` can select a different parent directory for the rebuilt `dist`; the default is the external source's frontend directory. The local service verifies the derived manifest before using the executable. On its first derived startup it backs up the private database and applies the eight checksum-verified migrations added since the base release. A static deployment does not itself host this Haskell/PostgreSQL service.

Packaging builds a fresh ignored `.candidate-<pid>` directory without changing the running runtime's executable or frontend. It privately preserves the existing session-key directory with permission 700. On macOS, `renameatx_np(RENAME_SWAP)` atomically exchanges the complete candidate and installed directories. Existing processes retain their old executable and working directory. The previous runtime remains at the candidate path until its daemon has been restarted; remove it only after checking that no process still uses it.

The separate Epic Labyrinth extension is an explicit build selection. After the native, API and transfer authors freeze the complete batch, add `--with-epic-labyrinth` to the build or stage command:

```sh
node scripts/build-rules-runtime.mjs --with-epic-labyrinth --stage
node scripts/build-rules-runtime.mjs --with-epic-labyrinth --incremental-native --direct-objects --test --compact-build
```

This stages its full original backend and test trees, including `NativeAssets.hs-boot`, applies its ordered native, server and public-view seam contracts, and adds the coordinator, cards, stories, transfer and public-statistics suites to the same focused component through `rules/tests/ChronicleSpec.hs`. A reused private checkout containing Epic cannot be built with a Barkham-only manifest. Core seam files are composed from the exact pinned Git originals; a private stage-state record distinguishes previous generated patches from unexpected manual edits. This makes overlapping seam patches repeatable while preserving modification times for unchanged files.

Aggregate manifests add `extensionSourceHashes`, keyed by extension ID. For one extension, `extensionSourceSha256` remains that directory's existing hash. For multiple extensions, it is SHA-256 of `JSON.stringify` applied to sorted `[extensionId, directoryHash]` pairs. Aggregate native behavior results are written to `rules-behavior-tests.json`; the earlier Barkham-only proof remains available. A declaration or staged source tree alone does not establish compiled Epic support.

The complete original aggregate also accepts `--with-epic-machinations`, which includes its Labyrinth transport dependency. It stages both Epic extensions in order and selects `rules/tests/ChronicleFullSpec.hs`, including all six Machinations coordinator, scenario, entity, transport, token-transaction and printed Noble Legacy suites:

```sh
ARKHAM_RULES_GHC_HEAP=4G node scripts/build-rules-runtime.mjs --with-epic-machinations --incremental-native --direct-objects --test --compact-build
```

## Private Linux compilation checks

Linux x86_64 workers can restore the pinned source and dependencies, then compile
and execute the same aggregate Haskell suite with `--compile-only`. This route
does not require the macOS base distribution or rebuild its release frontend.
It downloads checksum-pinned GHC 9.14.1 (Debian 12 bindist) and Stack 3.11.1,
and builds the same PostgreSQL and PCRE development files. It requires a glibc
Linux worker with `git`, `curl`, `tar`, `xz`, `make`, a C/C++ compiler, the GNU
gold linker (`ld.gold`, provided by `binutils-gold` on Debian), GMP and
the shared runtime libraries required by the GHC bindist. On Linux, the default
external directories are `/tmp/arkham-upstream-research` and
`/tmp/arkham-build-toolchain`; the existing environment overrides still apply.

Check the actual source/toolchain volumes before a cold build. A worker's `/tmp`
may have much less capacity than its workspace. Put the external checkout and
cache on the larger volume when necessary, still outside the repository:

```sh
export ARKHAM_RULES_SOURCE=/workspace/arkham-upstream-research
export ARKHAM_RULES_TOOLCHAIN=/workspace/arkham-native-toolchain
```

The 7 October Linux worker uses an extracted private Debian gold linker. Its
continuation commands also require this prefix in `PATH`:

```sh
export PATH=/workspace/arkham-native-toolchain/system/usr/bin:$PATH
```

```sh
ARKHAM_RULES_DISK_RESERVE_GIB=2 node scripts/build-rules-runtime.mjs --with-epic-machinations --dependencies
ARKHAM_RULES_DISK_RESERVE_GIB=2 node scripts/build-rules-runtime.mjs --with-epic-machinations --stage
ARKHAM_RULES_DISK_RESERVE_GIB=2 node scripts/build-rules-runtime.mjs --with-epic-machinations --test-dependencies
ARKHAM_RULES_DISK_RESERVE_GIB=2 node scripts/build-rules-runtime.mjs --with-epic-machinations --compile-only --incremental-native --direct-objects --test --compact-build
```

Freeze the original extension sources before staging/compiling. An ordinary
Linux build without `--compile-only` fails before toolchain restoration. A
successful full check writes the ignored `output/rules-server/rules-native-check.json`
with the actual platform, source, engine and test hashes and passing example
count. A completed Machinations aggregate also records `scope: native-aggregate`,
`fullAggregate`, `fullAggregateBehaviorTested`, the configured library/API module
count and, with direct objects, the SHA-256 of the verified complete object plan.
The behavior flag requires the real aggregate suite to pass. After a change to
test sources alone, `--compile-only --test-built --direct-objects` recompiles and
runs those tests against the retained verified engine objects.
Partial dependency restoration, staging, configuration or object
compilation creates no passing check record. Existing compiled objects and
package caches remain available after an interrupted build.

For a smaller native behavior check while the full engine graph is pending,
run the actual Labyrinth and Machinations coordinator Hspec suites:

```sh
ARKHAM_RULES_DISK_RESERVE_GIB=2 node scripts/build-rules-runtime.mjs --with-epic-machinations --coordinator-tests
```

This mode restores their external dependencies and compiles the original suites
and their real local source dependencies directly from the staged checkout.
It uses the pinned engine's generated Cabal language and extension settings,
without substitutes or stubs. Its separate `rules-coordinator-tests.json`
explicitly declares `scope: coordinator-only` and `fullAggregate: false`.
It preserves any aggregate native-check and runtime behavior records. The
coordinator suites exercise state, selected-story completion and participant
undo invariants; native entity handlers, API transactions, persistence and the
complete aggregate remain outside this check. A Labyrinth-only selection can
also run its coordinator suite using `--with-epic-labyrinth`.

Both native proof runners remove inherited `HSPEC_*` settings and ignore
`.hspec` configuration files, so dry-run, match, skip or other local options
cannot turn a partial/nonexecuting run into a passing behavior record.

The Linux check creates no runtime candidate, signature, installation or
capability manifest. It leaves existing native behavior/runtime records alone;
`--prepare-only`, `--package-built` and publishing are unavailable with
`--compile-only`. Runtime packaging, strict signing, atomic replacement and
the installed macOS gameplay/persistence checks remain separate requirements
before Epic can be enabled. A passing Linux Haskell check alone does not satisfy
those requirements.

### Real private Linux API acceptance

After the complete `--compile-only --with-epic-machinations --test` check passes,
`scripts/linux-native-acceptance.mjs` can launch that actual aggregate against
an isolated PostgreSQL database. This is a private Linux QA route with an
explicit `native-acceptance` identity. It does not create a normal distribution
manifest or satisfy the production installation gate.

Run it as a non-root user. Supply a full PostgreSQL **14.15** installation with
`postgres`, `initdb`, `pg_ctl`, `psql`, `pg_dump` and `uuid-ossp`; the compiler's
libpq-only development prefix is insufficient. Retain the complete engine
objects, source, full Hspec executable and native proof. Build Chronicle's
actual frontend with the explicit private bridge URL before preparing the
runtime. Match this URL to `ARKHAM_RULES_PORT` if overriding the default port.

```sh
export ARKHAM_RULES_QA_PG_PREFIX=/path/to/postgresql-14.15
VITE_ARKHAM_RULES_URL=http://127.0.0.1:5494 npm run build
node scripts/linux-native-acceptance.mjs --prepare
node scripts/linux-native-acceptance.mjs --start
```

The default private directory is `output/native-api-acceptance`, with bridge,
API and PostgreSQL ports **5494 / 5495 / 5496**. Use the environment overrides
shown by `--help` for another isolated directory or port set. The launcher
retains its database under `<QA_DIR>/data` and manages API/database shutdown.
Terminate this launcher, then run `--start` again against the same directory
for restart acceptance.

The private verifier requires the full aggregate proof, actual object-plan and
API/test executable hashes, complete passing Hspec driver, and current staged
and original extension source hashes. It also resolves and hashes the exact
`runtime/bin/arkham-api` executed by the launcher. A coordinator-only proof,
stale source, different executable or claimed package/install/certification
status is rejected. The ordinary production validator rejects the private
QA identity.

The bootstrap adapts only an ignored copy of the original bridge's verifier,
module paths and explicit QA status label. Its SQL/API/game routes remain real.
It copies Chronicle's built client and generates the pinned presentation data;
the adaptation record explicitly states `upstreamFrontendBuilt: false`.

Acceptance scripts use the explicit private manifest:

```sh
export ARKHAM_RULES_QA_MANIFEST="$PWD/output/native-api-acceptance/runtime/chronicle-native-qa.json"
export ARKHAM_RULES_URL=http://127.0.0.1:5494
export ARKHAM_RULES_DATA_DIR="$PWD/output/native-api-acceptance/data"
export ARKHAM_RULES_PG_PORT=5496
EPIC_QA_CONFIRMED=1 QA_OUT=output/native-api-acceptance/epic-runtime node --import tsx scripts/epic-runtime-check.mjs
QA_OUT=output/native-api-acceptance/barkham-runtime node scripts/barkham-runtime-check.mjs
```

Use `epic-persistence-check.mjs --help` to capture the passed Epic report before
the managed restart and verify its same six games afterward. Supply the same
optional `BARKHAM_REPORT` for both commands to include all five fresh Barkham
games in the complete SQL/public save comparison. Verification requires a new
PostgreSQL start time, identical runtime identity and the same source reports;
it preserves every stored timer field exactly. Close other QA clients before
capture and keep them closed until verification completes. Barkham's
`--verify-existing` mode separately checks those five games' resource/action,
sniff and treat state using GET requests. The Epic browser checker uses a fresh `--prepare-table` report and
checks actual native answers, reload and pending-decision continuity in Chromium
and WebKit; table seeding alone is not full mechanics acceptance. See each
script's `--help` for its required report paths and isolated output arguments.
For browser acceptance, serve that actual built client with
`npm run preview -- --host 127.0.0.1 --port 5498` and set
`BASE_URL=http://127.0.0.1:5498` and `RULES_URL=http://127.0.0.1:5494` for the
browser checker. The normal frontend's default companion URL remains 5194.

The table checker uses three separate actual WebKit processes per event.
Its default is headless. On Linux, `EPIC_WEBKIT_HEADLESS=0` selects Playwright's
genuine headed GTK implementation; supply a working local `DISPLAY`, such as
a private Xvfb screen. The verified private route uses `DISPLAY=:97`,
`GDK_BACKEND=x11` and `LIBGL_ALWAYS_SOFTWARE=1`. Reports disclose the launch
mode, implementation, environment and process topology. This choice preserves
every action, reload, asset and error assertion; a GET-only diagnostic still
cannot qualify as the twelve-action acceptance proof.

For setup and Ready acceptance, create a separate fresh seed with
`epic-runtime-check.mjs --prepare-client-setup`, then run
`epic-setup-browser-check.mjs` with `EPIC_SETUP_SEED` pointing to that report and
the same private manifest and browser URLs. These six seats begin at genuine
unanswered native `ChooseDeck` prompts. The checker drives the built client's
setup answers and automatic Ready requests, verifies both shared timers, then
checks actual resource actions and persisted reloads. Setup seeding is recorded
as preparation and does not itself qualify as acceptance.

The client binds Ready to the persisted seat's actual event, group and game.
It waits for the native setup-complete investigation checkpoint, preserves the
current native question, and holds answers and Undo until all three groups are
ready. Failed requests offer an explicit retry. Ordinary tables retain their
existing answer flow.

Browser checks retain raw console and network failures. An external ArkhamDB
image HTTP 503 is accepted only with same-document evidence for that exact
native card or investigator and its visible face: a verified alternate scan,
readable card text, or the accessible portrait name/initials fallback.
Unrevealed locations expose only their generic reverse label. Unknown errors,
native/local request failures and unmatched artwork remain failures; there are
no mocked responses. Loaded client assets are checked against the actual built
files rather than inferred from a manifest alone.

After private browser acceptance, stop its preview and rebuild without the
private URL before preparing a normal client release. The private runtime keeps
its own verified frontend copy; the public deployment must use its normal
companion configuration.

## macOS candidate installation

A checkout already containing Machinations rejects a build that omits that flag. Packaging generates the private data-only `chronicle-presentation.json` from the pinned text/settings resources and records its `presentationSha256` together with the native binary and frontend hashes.

For an installation handoff while an existing companion is active, add `--prepare-only`. The complete build, native tests and strict signing still run, but the installed directory is left in place. After stopping that companion, publish the printed candidate path with the same extension selection:

```sh
node scripts/build-rules-runtime.mjs --with-epic-machinations --publish-candidate /absolute/output/rules-server/derived-runtime/.candidate-12345
```

Publishing rechecks the actual original source, binary, frontend and presentation hashes, matching passing behavior proof and signature before the atomic directory exchange.

## Earlier macOS cache checkpoint — 7 October 2026

This records the earlier macOS workspace. The subsequent full Linux aggregate
and actual private API continuation are recorded separately in
[native aggregate evidence](import-native-aggregate-linux-2026-10-07.md).

The exact pinned source was restored at `/private/tmp/arkham-upstream-research`, and the aggregate Barkham + Labyrinth + Machinations stage completed. The private toolchain at `/private/tmp/arkham-build-toolchain` contains verified GHC 9.14.1, Stack 3.11.1, PostgreSQL 14.15 development files and PCRE 8.45. Hackage's signed index was validated and Pantry's package cache populated. Dependency restoration advanced the reusable cache but remains incomplete: the 2 GiB reserve stopped the first attempt with 1.98 GiB available and the resumed attempt with 1.67 GiB available. These were controlled stops before ENOSPC, not native compilation or behavior results.

The source and rebuilt cache were retained, with 84 dependency registrations at the controlled stop. Only checksum-verified redundant installation archives and extracted PostgreSQL/PCRE sources were removed, recovering 545,447,936 allocated bytes. That attempt's compiler process group exited completely. Evidence is in `output/rules-server/resume-dependencies-network-machinations-2026-10-07.log`, `output/rules-server/resume-restoration-input-cleanup-2026-10-07.json` and `output/rules-server/resume-checkpoint-2026-10-07.json`.

The Barkham executable verified at 12:30 with SHA-256 `b53bdf9edfcdf98ad2905e585702295c76cfd462ac6011bfdc44d37e84b82b5a` is now absent, as is the official base executable. Their bin directories changed at 12:38:46 and 12:38:51, before the resumed dependency build began at 12:47. The user confirmed both executables were deleted to free space. Dependency-only commands do not reach runtime packaging, and the disk guard never deletes files. Manifests, frontend assets and the private saved-game database remain present, but local native startup currently fails derived verification. No exact executable copy was found in task output or temporary build paths; Spotlight found no replacement, and Finder's Bin was empty. The official pinned archive can restore the base engine but cannot replace the custom Barkham executable. After free space recovered to about 13 GiB, guarded dependency restoration resumed; candidate packaging needs the retained base libraries/data/PostgreSQL tools and the new executable, not the deleted base executable.

At the user's request to stop further checks and commit/push/deploy, the recovered-space attempt stopped cleanly with 278 dependency registrations retained and 13.3 GiB available. No task compiler descendants remained. Source and cache are preserved; no aggregate native compilation, tests, candidate or installation began. Its log is `output/rules-server/resume-dependencies-recovered-machinations-2026-10-07.log`; the final checkpoint is `output/rules-server/resume-checkpoint-2026-10-07.json`.

Future native continuation first finishes the guarded dependency command, then uses the direct-object, compact, prepare-only aggregate build. It creates the replacement executable without restoring either deleted old executable first. Aggregate native tests, candidate signing and live API/browser certification remain pending. A static client deployment does not complete or unlock this native runtime.
