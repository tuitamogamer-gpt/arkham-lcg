# Player reliability foundation — 13 October 2026

This first delivery addresses loss of progress and misleading continuation
states before expanding the audience or claiming a complete campaign.

## Keeping investigations safe

Each open Core investigation retains the exact stored version it loaded.
Mutations share a Web Lock across tabs because all slots share an index. A
stale save, deleted investigation or changed deletion target produces a
conflict instead of overwriting the other version. Browsers without Web Locks
still compare observed versions; that fallback is not a cross-tab transaction.

The conflict flow keeps the in-memory game available for export or a separate
save. Loading the stored version requires an explicit choice and checks that
it has not changed again during confirmation. Imported backups and new games
receive UUIDs independently of their random shuffle seed. Imports preserve
the original investigation.

Opening or starting another case waits for the current save to finish. Failed
saves keep the current case open. Save warnings remain until both the game
and its closed-case history have been written. History-only quota failures
retain the durable game and retry the missing history entry without duplicates.

Healthy but incomplete indexes now recover orphaned payloads. Legacy reads
do not write; migration checks both the observed source and destination.
Unreadable modern data cannot be silently replaced by an old legacy save.
Explicit deletion can remove unreadable slots and checks their raw revision.

PWA updates save again at the actual worker activation/reload boundary, so a
late worker cannot reload over actions made after the original update click.
Other tabs continue until their own player chooses to update.

## Companion and campaign continuity

Companion status distinguishes a confirmed table response from a pending or
unconfirmed action. A failed response blocks additional decisions and undo
until a complete read succeeds, including when the server revision is
unchanged. Recovery never automatically resubmits an action. A confirmed
response does not assert durable server persistence.

Entering deck upgrades preserves the complete native campaign continuation,
including the prohibition on side stories, chosen lead and nested scenario
options. The browser regression follows both investigators through upgrade,
reload and continuation. Setup and resolution explicitly describe the Core
browser campaign's current one-scenario boundary.

## Verification and next scope

The client/script suite passes 641 tests and the production build passes.
Browser checks cover real shared-storage tabs, separate-copy recovery,
deletion, imports, quota failures, the first-turn tutorial, campaign protocol
continuation, offline reload and service-worker updates. CI now includes the
save-conflict and campaign-continuation flows.

This does not add accounts, cloud saves, a hosted native rules service,
automatic historical snapshots or new playable Core chapters. Campaign UI
fixtures verify adapter behavior; they do not certify a full native campaign
playthrough. The next campaign milestone requires selecting one native
campaign and verifying its setup, every transition and resolution, upgrades,
and exact interrupted-session recovery against the actual runtime.
