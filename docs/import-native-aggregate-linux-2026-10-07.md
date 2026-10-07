# Full native aggregate continuation — 7 October 2026

The user authorized the next shared-runtime milestone with “Hajde” after the
previous client release. This continuation builds and exercises the original
Barkham, Epic Labyrinth and Epic Machinations extensions together against pinned
upstream `03a7f1e74925744f021f6e8fe0e39945d2c3a833`.

## Completed native build and behavior

The restored Linux x86_64 toolchain compiled the complete native engine and API:
8,356 GHC compilation units, including boot modules, produce the configured
8,307-object library graph. The actual API executable and complete Hspec
executable link directly against that graph. No engine or API substitutes are
used. Dependency restoration, source, compiler and direct-link checkpoints are
retained outside tracked source.

The sanitized `rules/tests/ChronicleFullSpec.hs` run passes **194 examples, zero
failures**:

| Actual native suites | Examples |
| --- | ---: |
| Barkham players and scenario | 42 |
| Labyrinth coordinator, cards, stories and transfers | 73 |
| Shared public current statistics | 4 |
| Machinations coordinator, scenario, entities, transport, transactions and Noble Legacy | 75 |

This includes physical Edwin redemption/removal and recursive attachment
transport, actual scenario setup in all three eras with each machination,
authoritative story completion, original owner returns, foreign undo boundaries,
native token changes, printed payments and game JSON roundtrips.

The build fixes a missing fresh executable-output directory before linking.
The first complete run also exposed three test fixtures using the ordinary
player/encounter registry to find investigator definitions. They now obtain the
actual investigator definition from its native `InvestigatorAttrs` instance.
Only those test modules needed recompilation; the complete engine graph was
retained.

## Edwin progress correction

The Machinations API now derives era progress from the actual locked native
games before evaluating action criteria and after physical changes. Fresh
setup and Edwin movement publish the correct destination immediately, without
requiring an unrelated clue transfer or explicit progress report.

Selected unfinished stories remain seeded until their authoritative local or
global completion. A completed story's actual face continues to count while
its removal waits behind an existing native decision. Three native regressions
exercise these boundaries in the complete suite.

## Actual API event identity and initialization

The first actual Labyrinth API `DeckAnswer` exposed an event identity mismatch.
The pinned native event creator stored `tshow scenarioId`, including the Text
Show instance's quotes, while both adapters compared the database value with
the raw code. They therefore skipped the locked coordinator pull entirely.
The real SQL value was `"70001"`, seven characters long.

New event creation now stores the raw scenario code. Both adapters accept the
canonical code and the exact former Show spelling using Text equality. Missing
IDs, unrelated scenarios, back-face aliases and malformed quoting remain
rejected. Three native identity regressions exercise both real ScenarioId
values and their actual Show serialization.

Both Epic server seams also synchronously seed the locked coordinator replicas
into `gameRef` before starting the native loop. The same messages remain queued
so native entities receive their broadcasts. Answer validation still precedes
this work, preserving the ordinary unhandled answer path.

Three additional native tests run the actual fresh `PreScenarioSetup` handler
for groups A, B and C on supported Standard difficulty without a prior replica.
They verify the authoritative group and retained Epic/outbox metadata. The
corrected complete **194/0** proof replaces the earlier **180/0**, **183/0**,
**186/0**, **187/0**, **188/0** and **190/0** proofs; the
first failed API report and its exact earlier binary/source identities remain
separately archived under ignored output.

The subsequent real three-group API run exposed a separate native dispatcher
gap. `Game.runMessages` computed the transformed Epic gate message, but its
default branch retained the outer original `msg`. It therefore executed an
ordinary `EndRoundWindow` instead of the coordinator arrival. Actual queue
traces and saved native metadata confirmed this: Epic mode remained enabled,
but no arrival was recorded. The native seam now binds the message supplied to
that branch so the transformed message reaches the original entity runners.
An actual native-loop regression covers this dispatch boundary.

That corrected API then recorded all three arrivals but left every group at
its temporary waiting question. The delivery adapter restored that stale ask
before the saved native `EndRound`, preventing any finish operation. A decoded
OpenBarrier/ReleaseBarrier receipt now resumes the original native queue only
when every pending question is the exact typed Labyrinth wait checkpoint.
Ordinary player, payment, test and exchange decisions keep their previous queue
policy. The expanded native-loop regression installs a physical Vent, declines
its real round-end trigger and verifies the saved finish and continuation;
negative cases preserve unrelated decisions and work.

The real all-three stage diagnostic exposed a further distinction: stage
opening emits `FinishWindow` without opening round-end abilities. Resuming its
saved Mythos tail at that point created ordinary choices before the final
release, leaving all three physical agendas on side A despite a released
coordinator barrier. Only round opening now resumes the tail; stage opening
retains its temporary checkpoint, and release resumes the blocked advancement.
An additional native regression verifies the physical agenda flips to B and
its advancement confirmation precedes the saved Mythos continuation.

The real Machinations setup then exposed a deferred-delivery boundary. Present
and Future already held both selected shared-story installation receipts in
their saved native queues, but a restored setup wait remained ahead of those
receipts. Deduplication correctly avoided delivering them again, leaving setup
unable to finish. At the exact typed Machinations setup wait, the adapter now
resumes those existing installation receipts before the saved setup tail.
Two actual native setup regressions install both physical stories, reach the
real end of setup, preserve ordinary player questions and reject duplicate
physical installation on replay.

## Native global ending after expiry

Actual authenticated API expiry reached the shared failure result, then failed
with `no investigators`. The native trace showed the last local investigator's
defeat clearing its queued resolution. `NoResolution` consequently requested
another shared failure and allowed the empty local game to continue phases.
It now restores the exact already selected authoritative global result. When
no global result exists, the original shared failure request remains intact.

Four new native regressions cover that unresolved boundary and resolutions
2, 3 and 4 through actual expiry, last-investigator defeat, printed resolution
and the saved ending continuation. Trauma applies once on delivery replay.
For resolutions 2 and 4 the tests also assert and answer the genuine optional
Ezra Graves campaign-reward question before reaching `IsOver`; resolution 3
reaches its original ending directly. The first failed compiler/run reports
remain separate from the complete passing 194-example proof.

## Actual shared native API

The final same-identity API run passes **31 check groups across two fresh Epic
events and six native games**. Both database event IDs use their canonical raw
codes. Labyrinth exercises real three-group setup, printed Standard bags,
cross-group transfer and coupled/foreign undo boundaries, round arrivals,
waiting questions and release, and the physical timer-stage agenda flips.
Machinations exercises real three-era setup, immediate Edwin progress and
printed transport with two recursive attachments and its action payment,
native clue transfers, shared boss damage, and immediate expiry through printed
resolution 3 and legitimate continuation to all three games' `IsOver` state.
Repeated expiry preserves complete database and public-state fingerprints.
Unrelated saved games retain their pre-run fingerprints.

Evidence: `output/native-api-acceptance/run-4/epic-runtime-final-194/report.json`.
The separately passing 22-check Machinations diagnostic remains a scoped report,
not a replacement for this two-event result. Controlled native QA fixtures and
their bypassed prerequisites are recorded in each report. In particular,
Labyrinth's stage test proves actual agenda advancement and release without
claiming its unplayed Act 2 clue/key prerequisites or a whole scenario
playthrough. The Hard setup report separately verifies all three actual roles
and their exact printed 18-token bags; it is setup evidence.

## Actual client setup and Ready

The final fresh Chromium setup proof passes all **six seats** on the current
410-test client and native 194-example engine. Both events begin with untouched
native `ChooseDeck` questions, zero ready masks and unstarted timers. The built
client performs 26 genuine deck/setup and initial-window answers, six seat-bound automatic Ready posts
and six resource actions. Both events reach ready mask 7 with one shared timer;
each action adds one resource, spends one action, preserves the other five games
and survives reload. There are no direct native writes or response mocks.

Evidence: `output/native-api-acceptance/run-4/epic-client-setup-browser-final-194-4/report.json`,
SHA-256 `5184d14bea3389b6101c58a3d28c559bf5861984d56dc83b2055585057f675aa`.
All five loaded JavaScript artifacts match the actual current build.
One real external `87039.jpg` HTTP 503 and its console error remain recorded,
with exact same-document artwork fallback evidence. There are no unclassified
errors, blocked requests, native/local failures or malformed `87005bb` requests.
The earlier incomplete setup attempts remain separately marked false.

An unexpected execution-environment restart stopped the API/bridge while
retaining the private database. After an identity-checked service restart,
18 GET-only requests rechecked all six complete saved games, questions, players,
cursors, resources/actions and both original Ready masks/timer identities.
All six match; no browser was launched and no games or native state were written.
Evidence: `output/native-api-acceptance/run-4/epic-client-setup-after-environment-194/report.json`.
This process-loss check is separate from controlled PostgreSQL restart proof.

## Complete save persistence

Controlled shutdown and restart of the managed API, bridge and PostgreSQL pass
for the original acceptance report's **six Epic games and five fresh Barkham
games**. The same isolated data directory is retained. PostgreSQL's actual
start time changes from `22:44:44.369666` to `23:03:20.115935` UTC; the engine,
extension source and private manifest identities remain identical.

All eleven complete SQL game/player records, step histories, logs and undo
floors match exactly. Both Epic coordinators, group records, journals and stored
timer fields also match, as do every public game, question, player and cursor.
The database fingerprint remains
`6e798aafe1a4c0bfc84a676389836a36e861d0cb0e19b4884e24c443faace8aa`.
The verifier does not advance or normalize timers. Its authenticated GETs may
warm QA user credentials; user records are outside the save comparison.

Evidence: `output/native-api-acceptance/run-4/epic-persistence-final-194/verify.json`,
SHA-256 `3507ebe7d6e1b491d3ad55b79dbcf0834c894c047b2db2c7b4db4dfbdc6d238a`.
The initial failed baseline remains false: its investigator ownership guard
incorrectly compared the raw SQL ID with its native wire spelling. The corrected
guard accepts only that exact encoding and preserves both IDs and the owning
player UUID in evidence. No game data was changed to satisfy it.

A separate GET-only Barkham replay verifies all five saved resource/action
states, Kate's sniffed location and Duke's friendly human/treats after restart:
`output/native-api-acceptance/run-4/barkham-persistence-final-194/verify-existing.json`.
These are newly created isolated saves; historical macOS saves are not claimed.

## Actual Chromium and WebKit table actions

The final fresh table proof passes **twelve actual UI resource actions** across
Chromium 153.0.8010.12 and WebKit 26.6, using exactly two events and six games.
Its seed completes legitimate native setup/Ready through the API and contains
no direct state fixtures. Each browser answers once per seat. Every answer adds
one resource, spends one action and preserves the other five complete game
fingerprints. Pending and answered native decisions both survive reload.
Desktop and 320px layouts pass; all 48 captures are retained and representative
WebKit mobile and Machinations desktop captures were visually reviewed.

Evidence: `output/native-api-acceptance/run-4/epic-tables-final-194-11/report.json`,
SHA-256 `98735a26e881879cb975ec1616df818c6286f4a6b1974ddca765adc46d6e8a30`.
All 180 original HTTP 200 script response bodies match the actual frozen
410-test client files. All twelve contexts are audited. Chromium uses one
browser with three isolated seat contexts per event; WebKit uses three genuine
separate processes per event, all closing cleanly. There are no response mocks,
extra/blocked writes, unclassified errors or native/local/cleanup failures.
Twelve raw ArkhamDB image HTTP 503 responses and their console errors remain
recorded, each with exact same-document typed artwork fallback evidence.

On this Linux environment the passing WebKit run uses the genuine headed GTK
implementation on private Xvfb `:97`, X11 and software Mesa. Earlier headless
WPE runs remain false. A separate GET-only WPE flow reproduced an unresponsive
page and failed process exit without changing any saved games; its onset cause
is unproven. The GTK diagnostic passes the exact original native predicates,
reloads and long-lived observations, with unchanged saves and clean closure,
but remains diagnostic-only. The final twelve-action result above is the
actual browser acceptance proof, distinct from that diagnostic, the six-seat
client setup proof and full API mechanics acceptance.

## Proof and reproducibility

The current ignored `output/rules-server/rules-native-check.json` declares
`scope: native-aggregate`, `fullAggregate: true`,
`fullAggregateBehaviorTested: true`, and `nativeModuleCount: 8307`. It records
the real object-plan, current original extension, API executable, full test
executable and driver hashes. Hspec filters and dry-run environment settings
are removed, and `.hspec` is ignored.

- Native engine SHA-256: `d902155823c137d6dad0656be690c03201d36375ade7537fb3307ff7e2217c49`.
- Aggregate extension SHA-256: `334c3dfdd0772183893d3b3357a32c7e34a74d7ffd25846ae5c367c82be040d6`.
- Exact commands, exit statuses and log hashes:
  `output/native-runtime-continuation/native-checkpoint-2026-10-07.json`.
- Native compile, first link and initial passing fixture retry logs:
  `output/native-runtime-continuation/{full-aggregate,full-aggregate-link,full-aggregate-fixture-retry}.log`.
- Initial setup-seed correction and complete passing 183-example retry:
  `output/native-runtime-continuation/{full-aggregate-live-setup-retry,full-aggregate-live-setup-standard-retry}.log`.
- Corrected event identity and complete passing 186-example run:
  `output/native-runtime-continuation/full-aggregate-event-identity-retry.log`.
- Corrected native dispatcher and complete passing 187-example run:
  `output/native-runtime-continuation/full-aggregate-gated-dispatch-retry.log`.
- Barrier-resume correction and expanded complete passing 187-example run:
  `output/native-runtime-continuation/full-aggregate-barrier-resume-retry.log`.
- Stage-opening policy and complete passing 188-example run:
  `output/native-runtime-continuation/full-aggregate-stage-open-policy-retry.log`.
- Deferred shared-story setup and complete passing 190-example run:
  `output/native-runtime-continuation/full-aggregate-machinations-setup-wait-qualified-retry.log`.
- Authoritative ending correction and complete passing 194-example run:
  `output/native-runtime-continuation/full-aggregate-machinations-ending-native-reward-retry.log`.
- Final complete Chronicle unit suite: **410/410 passing**, including thirteen
  material artwork-evidence boundary cases, stale-attestation regression and
  three printed artwork-source cases,
  recorded in
  `output/native-runtime-continuation/final-client-face-fix-tests.log`.
  The earlier 406/400-case artwork, 394-case Ready integration and 386-case runs
  remain separately retained.
- Actual final private client production/PWA build:
  `output/native-runtime-continuation/private-client-face-fix-build.log`.
  The earlier Ready-only and initial artwork-recovery builds remain separately retained.

Fresh browser setup exposed an incorrect Tindalos reverse image URL:
`87005bb.avif` returned HTTP 404 XML and Chromium blocked it as a non-image.
The Epic location's actual `87005b` printing now selects its verified `87005`
counterpart. Both real AVIF faces return HTTP 200. This narrow rule preserves
distinct act printings such as `03276b` / `03276bb`; native custom backs retain
their original filenames under the pinned `backs/` directory. Client sources
and reverse-face evidence use the same selector. Hidden labels and the strict
failure policy remain intact; the earlier failed setup report is not relabeled.

[Build and private API instructions](rules-runtime-build.md) describe the
retained-object retry and Linux acceptance bootstrap. The private QA identity
verifier binds the actual executable used by the launcher to this full passing
proof and current staged/original sources.

## Distribution boundary

This is a Linux native acceptance build. Its private identity explicitly records
`packaged: false`, `installed: false`, and `capabilityCertified: false`.
It creates no signed macOS distribution or ordinary production capability
manifest. The production runtime validator continues to reject this QA identity.
Vercel hosts the Chronicle client; it does not host this PostgreSQL/native API.
Full native tests establish their exercised mechanics, rather than every branch
of an entire campaign playthrough. The private runtime uses Chronicle's actual
built client assets and generated presentation data; it does not claim an
upstream release-frontend rebuild.
