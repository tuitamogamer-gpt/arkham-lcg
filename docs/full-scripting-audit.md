# Full scripting audit

Audited against the local catalog on 2026-09-30, upstream revision
`7ae21d7563ce9f68396c0d5e3a36f40f90fe1156`. This document records the starting
engine, before the full-content implementation work. Counts are computed from
`public/data/catalog.json` and its three card shards. Import completeness and
mechanical support are separate properties.

## Validated catalog size

| Definition type | Definitions |
| --- | ---: |
| Location | 1,309 |
| Asset | 1,271 |
| Treachery | 786 |
| Enemy | 725 |
| Event | 573 |
| Act | 384 |
| Agenda | 338 |
| Story | 227 |
| Skill | 187 |
| Scenario reference | 153 |
| Investigator | 121 |
| Key | 22 |
| Enemy-location | 13 |
| **Total** | **6,109** |

The manifest contains 103 distinct source packs, 116 products, 388 encounter
sets, 15 starter lists, and 341 hidden faces. Products include ten separately
sold investigator decks, ten investigator expansion boxes, ten campaign
expansion boxes, six legacy deluxe boxes, 36 mythos packs, 13 standalones, 13
parallel products, five Return To boxes, seven novellas, three Core editions,
two promo products, and one small campaign.

There are 153 scenario-reference definitions but 152 distinct scenario names
and encounter codes. Written in Rock has two reference definitions. Neither
figure is a certified count of playable scenarios: some references represent
different parts, campaign variants, or Return To overlays.

## Reuse counts and their limits

- 192 definitions declare `duplicate_of`; all referenced parents are present.
  Following those chains leaves **5,917 distinct roots**.
- Comparing normalized `type_code`, front rules, and back rules yields **5,751
  distinct text groups**. This ignores numeric fields and therefore cannot be
  used to assign support.
- Comparing the mechanical signature below yields **5,866 groups**. This is a
  candidate-reuse estimate, not a complete semantic equivalence calculation.
  It excludes some mechanics, card identity references, scenario guide rules,
  and relationships between hidden faces.
- **20 declared duplicates have different mechanical signatures from their
  immediate parent.** A print relationship is not a promise of equal rules.

The signature calculation includes type, subtype, factions, cost, XP, slot,
health, sanity, per-investigator health/clues, skill icons, enemy damage/horror/
fight/evade, shroud, clues, doom, stage, victory, vengeance, uniqueness,
deck limit, permanence, double-sided status, exceptional, exile, myriad,
encounter code, deck requirements/options, customization options, normalized
traits, and both rules texts. Missing and explicit fields remain different.
Normalization removes HTML tags and trait markup, collapses whitespace, and
normalizes quotation marks; it preserves rules vocabulary and numbers.

There is no defensible exact count of unique mechanics obtainable merely by
counting JSON cards. Names, numeric values, action costs, targets, timing,
campaign prerequisites, and upgrades all affect behavior. This audit provides
exact print/root/text/signature counts under stated algorithms rather than
calling those algorithms full rule equivalence.

### Reprint warning examples

`01020` Machete automatically adds damage when the attacked enemy is the only
engaged enemy. `12020` Machete instead offers an exhaust payment after a
successful attack. The latter is marked as a duplicate of the former.

Other differences occur for Core 2026 Fingerprint Kit, Laboratory Assistant,
Thieves' Kit, Breaking and Entering, Premonition, Ward of Protection, Bandages,
Meat Cleaver, and Look What I Found. Consequently aliases need a verified
behavior signature and explicit exceptions. The original and 2026 versions of
investigators also need independent implementation review.

Product `reprintOf` means that a box repackages older content. Those boxes share
the older card codes already, so the product count does not require duplicating
scenario scripts.

## Actual engine at the audit boundary

`src/game/data.ts` statically loads 196 Core 2026 definitions. Catalog loading
registers additional definitions into `cardMap` for inspection, but deliberately
does not expand the fixed setup pool.

`createGame` in `src/game/engine.ts` accepts one to three different
investigators from five fixed starter lists. The starter lists contain 74
distinct definitions. Together with the five investigator definitions and 28
Spreading Flames definitions, the currently reachable setup comprises **107
distinct codes**. This count describes the setup footprint, not certification
of every possible interaction. The 196-card Core JSON also includes Smoke and
Mirrors, Queen of Ash, upgrade cards, and other material not enabled by setup.

The engine already has valuable reusable infrastructure:

- Seeded deterministic shuffle, instance IDs, immutable reducer transitions,
  explicit actions, and serializable effect queues.
- Investigator turns, local multiplayer focus, defeat/resign handling, and
  group clue payment.
- Skill tests, committed-card limbo, chaos reveal/resolve, card draws, test
  scope, Fast windows, forced/reaction ordering, and effect resolution scope.
- Asset slots and equipment, exhaust/use/resource payments, damage/horror
  allocation, enemies, attacks of opportunity, enemy movement, and upkeep.
- Explicit story decisions, presentation checkpoints, discoveries,
  save/migration validation, bounded public event history, and undo.

`src/game/cards.ts` provides eight weapon entries, five investigation tools,
five boost assets, and six constant skill bonus entries. These are useful
archetypes, but the entries all use fixed Core 2026 codes. Unique event,
treachery, investigator, and scenario effects remain hardcoded in the reducer.

### Executed behavior probe

A transient Node process registered all catalog definitions, created a Core
game, finished introduction/mulligan, and placed Emergency Cache into the hand.
No project state or save was written.

| Code | `canPlay` result | Resources before/after | Discarded | Error |
| --- | --- | --- | --- | --- |
| `12089` Core 2026 | allowed | 5 → 8 | yes | none |
| `01088` original Core | allowed | 5 → 5 | yes | none |

Both cards have identical printed rules, but only `12089` reaches the event
switch. Simply widening deck or investigator selection therefore creates
silent incorrect resolutions. `encounter()` has the same risk for unregistered
treacheries: its fixed-code switch has no unsupported-card rejection.

## Integration and persistence blockers

1. **Setup and scenario dispatch:** The engine imports Spreading Flames as one
   global `SCENARIO`; setup, connections, agenda limits, act progression, token
   effects, fire, boss effects, location abilities, and resolutions assume that
   scenario. Merely supplying new card lists cannot supply a scenario guide.
2. **Card dispatch:** `perform(play)`, `encounter`, test resolution, draw
   weaknesses, reactions, and fast/action validation use fixed codes. Script
   lookup must work at every hook, not only when a card is played.
3. **State model:** Threats use codes instead of physical instances. Locations
   use code identity. Assets lack attachment relationships and card-specific
   counters. The model has no complete representation of swarm stacks,
   concealed cards, keys held by enemies/players, vehicle movement,
   enemy-locations, campaign routes, customization selections, bonded pools,
   removed cards, side decks, or scenario-specific zones.
4. **Save validator:** `validSave` requires fixed starter membership, at most
   three players, exactly six locations, Spreading Flames location membership,
   act/agenda numbers no greater than four, and discovery lists no larger than
   the 196-card Core dataset. Summary/result validation also requires the fixed
   starter membership.
5. **Chaos bag:** The save token regex accepts only single-digit numeric
   modifiers, skull, tablet, elder thing, auto fail, and elder sign. It rejects
   cultist, bless, curse, and frost. A generalized bag also needs resolve-another-
   token/removal/sealing semantics and scenario-specific symbol dispatch.
6. **Typed definitions:** Imported JSON preserves more than the `Card`
   interface describes: restrictions, fixed clues, back-face traits/links,
   bonded pairs/counts, exceptional, myriad, vengeance, exile, alternate
   investigators, customization, and side-deck requirements are examples.
7. **Table/client:** `Game.tsx`, `Tabletop.tsx`, `ChaosBagPreview.tsx`,
   `ChaosDraw.tsx`, and `knowledge.ts` contain fixed Core codes and/or arithmetic
   for act/agenda cards. The map uses two fixed layouts. New action hooks need
   generic contextual controls and target selection.
8. **Spoilers:** `campaignKnowledge` currently grants specific SF references,
   acts/agendas, and fire visibility. New encounter sets need discoveries by
   current scenario and physical reveal state; catalog availability alone must
   not expose unrevealed backs.

Keyword frequency also illustrates the required breadth. The imported text
contains Forced rules on 1,717 definitions, action icons on 1,494, Revelation
on 950, reaction icons on 701, Fast icons on 622, and Objective on 406. Text
contains Concealed on 90, Patrol on 74, Swarming on 22, Bonded on 62,
Researched on 32, Dilemma on eight, and Customizable on 17 definitions. These
are text occurrences per definition, including printings and incidental
mentions; they are not implemented-keyword counts.

## Safe implementation boundaries

1. **Pin a support manifest first.** Each card/variant and scenario needs an
   explicit implementation status, authored script identity, guide source,
   integration state, and behavioral evidence. Unknown cards must fail before
   setup/play/draw rather than silently pass a switch. Product badges derive
   from supported cards plus supported scenarios; an imported product is not a
   completed product.
2. **Introduce scenario identity without changing legacy behavior.** Add
   `scenarioId` and script revision to saves, migrate older states to Spreading
   Flames, and provide registry accessors for setup, maps, act/agenda lists,
   chaos tokens, encounters, objectives, and resolutions. Preserve the current
   SF adapter as the first implementation.
3. **Replace code identity in dispatch.** Preserve printing codes/art in state
   and use a separately validated script key for behavior. Reprint reuse must
   pass rule equivalence checks; exception implementations handle amended
   text. Do not rewrite card codes globally because signatures, deck
   requirements, story rewards, and event ownership depend on them.
4. **Use typed serializable effect commands and hooks.** Define card hooks for
   eligibility/costs, action/fast options, constants, revelation, forced and
   reaction windows, token effects, test result, entering/leaving play,
   turn/phase boundaries, and campaign effects. Store IDs plus data in pending
   effects; never save executable functions.
5. **Generalize board/card zones with versioned migrations.** Add location
   instances, threat instances, attachment ownership, typed counters, sealed
   tokens, set-aside/removed areas, campaign state and scenario state. Validate
   shape and registry membership instead of fixed sizes or SF code lists.
6. **Port and verify complete content slices.** A slice includes the exact
   investigator/deck/card variants, encounter sets, guide setup, token rules,
   act/agenda transitions, resolutions and client controls. Unlock it only when
   its referenced mechanical dependencies are implemented and tested. Return
   To overlays should amend the base scenario instead of blindly cloning it.

Importing an existing engine may reduce authoring work, but source lookup,
license compatibility, runtime architecture, save/API integration and behavior
verification still matter. A catalog or source-code archive alone is not an
integrated full-content game.

## Tests needed at migration and unlock boundaries

- Existing SF reducer/timing/save tests must pass against the legacy adapter.
  Preserve pending windows, committed limbo, queued tests and resolution scopes
  across old-save migration and new-save reload.
- Unknown playable events, skills, investigator hooks, encounter revelations,
  location abilities and objectives must be rejected with no card, action,
  resource, bag, or queue mutation.
- Equivalent reprints must produce the same mechanical result while preserving
  their original printing/art identity. Non-equivalent reprints (Machete is a
  concrete example) must produce their own documented behavior.
- Deck validation needs requirements, duplicate/unique/XP limits,
  faction/trait exclusions, alternate signatures, side decks, mandatory
  weaknesses, bonded cards and customization checks before dealing.
- Scenario fixtures need setup, map links/reveal, encounter composition,
  symbol-token semantics at every difficulty, objective payment, forced order,
  agenda/act branches, defeat/resign, XP/rewards, campaign notes and next route.
- Each enabled special mechanic needs its real timing/cost/target regression:
  attachment leave-play, bless/curse/frost, swarm host/stack, concealed targets,
  keys, vengeance, patrol/vehicle movement, researched and customizable cards.
- Browser proof needs setup selection, generic ability targeting, a real test,
  an encounter, a branch/resolution, save/reload, keyboard/mobile layouts,
  spoiler boundaries and console errors for the newly enabled slice.

The repository currently declares 238 individual `test(...)` calls across its
test files. This audit did not rerun the full suite and does not treat that
declaration count as a passing run or full-catalog coverage.

## First integration guard added after the audit

`src/game/scriptSupport.ts` now registers the 107 native setup definitions and
resolves aliases only when every non-printing field matches the native
definition. Rules/traits permit whitespace changes; unknown new definition
fields remain significant. Known native codes with changed definitions are
rejected even if they resemble another supported card. `duplicate_of` and
product repackage relationships never grant support on their own.

The initial catalog matches 130 definitions: the 107 native codes and 23
additional equivalent printings. This only registers matching behavior
identities; all engine hooks and the client still need to honor them before an
alias is playable. The five focused tests in `tests/script-support.test.ts`
pass, covering the pool boundary, imported/native snapshot parity, preserved
printing identity, identical Emergency Cache aliases, changed Machete rejection,
unknown mechanics, and amended known definitions.
