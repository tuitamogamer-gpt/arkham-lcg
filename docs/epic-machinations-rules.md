# Epic Machinations implementation

The implementation lives in `rules/extensions/epic-machinations`. It extends the
existing Machinations scenario while delegating ordinary Single Group play to
the native scenario and native card runners.

The rules source is the publisher's [Machinations Through Time booklet](https://images-cdn.fantasyflightgames.com/filer_public/f1/f4/f1f4dfa2-5f23-44e3-90fa-7539fbbf4de1/ahc62_rulebook.pdf).
It specifies three groups of one to four investigators, independent rounds and
agendas, different group difficulties, public historical announcements and a
shared Tyr'thrha health pool based on the initial total player count. The optional
event timer defaults to 180 minutes and expiry advances remaining groups directly
to agenda 2b. Effects affect another group's play area only when printed text
explicitly permits it.

## Authoritative event state

`Types.hs` and `Coordinator.hs` define an original pure protocol. An operation has
a UUID, an originating era and a typed operation body. Repeating the same UUID
returns the existing state. Delivery IDs combine that operation UUID with a
deterministic index. Unacknowledged envelopes remain in event state across save
and reload. Investigator IDs are scoped to their era; different groups may use
the same investigator card.

The coordinator selects the shared machination and plot once, validates the era
owning each announcement, maintains the Tindalos clue pools, mirrors shared boss
health, distinguishes global machination completion from local Mob/Anomalies
completion and chooses one global ending. Its replicas contain public progress
and no investigator hands or decks.

Native scenario metadata contains `epicMachinationsReplica`,
`epicMachinationsOutbox`, installed story codes, delivery receipts and an explicit
list of abducted card IDs. The latter prevents a scientist merely set aside for
future setup from being offered as an abducted rescue target. Tesla's existing
metadata updates merge with these fields instead of replacing them.

## Native controls and atomic effects

Five location wrappers preserve native printed costs and limits while routing
shipments, time tokens, time capsules and newspapers to the specified era. The
Epic Tindalos face is registered at exact code `87005b`, with its own clue-pool
and rescue abilities. Its matcher identity includes Tindalos so common encounter
cards still find the correct location. Each group receives a compact local map.

The event adapter must hold all three game rows in deterministic order. Paired
clue transfers debit the native investigator or location and credit their target
in one transaction. Edwin's explicit cross-era movement transports the actual
native entity and attachment graph, preserving IDs and attributes. A normal
receiver choice remains open; non-atomic printed effects wait in its durable
native queue. Bookkeeping alone may update replicas and receipts immediately.

Uneasy Alliance's round-end clue removal remains local. Its movement action
explicitly permits another era; its upkeep does not. An era without the actual
Edwin therefore receives its printed local doom penalty.

`native-seams.json` composes the Machinations gate after the Labyrinth gate. The
Machinations gate routes announcements and waits for common setup; it introduces
no round barrier. Server expiry must dispatch `epicMachinations.timeExpired`,
rather than the unrelated Blob event timeout operation. Owner returns use the
shared original-owner bridge and preserve the owning group as well as the
investigator code.

## Verification status

Twenty original coordinator Hspec cases cover group sizing, repeated
investigator codes, shared setup, announcement ownership, independent progress,
paired clue effects, shared health, legal location targets, local/global story
completion, resolution branches and persisted receipts. The Epic native source,
server adapter and tests still require the deliberate aggregate Haskell build
and live three-group validation. Source registration alone is not a successful
mechanics or runtime test.
