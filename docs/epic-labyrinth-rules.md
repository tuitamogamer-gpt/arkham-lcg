# Epic Labyrinth rules extension

The separate `rules/extensions/epic-labyrinth` tree is staged and compiled in the shared Barkham/Labyrinth/Machinations native aggregate. Its exercised mechanics are recorded below; a printed definition or front/back alias alone does not establish gameplay support.

## Verified scope

The publisher-authored [Labyrinths booklet](https://hallofarkham.com/wp-content/uploads/2021/01/the_labyrinths_of_lunacy_rules.pdf) specifies exactly three simultaneous groups, each with one to four investigators. Groups pause at every round end and complete end-of-round abilities before the next round; act/agenda advancement also waits for all groups. Groups ordinarily cannot communicate or inspect one another's play areas. The default optional time limit is 60 minutes for each act/agenda, followed by advancement at the next mythos phase. The Epic encounter set replaces the Single Group set. These requirements were checked on booklet pages 3–4, 6 and 10. The supplied native `70001` implementation currently selects one group or runs a sequential mini-campaign.

The imported printed cards and the native constructors have distinct identities:

| Codes | Required behavior |
| --- | --- |
| 70002, 70004 | Draw the same randomly selected stage-appropriate story in all three groups once. |
| 70009 | Resolve Group C's lever against Group A's actual Chamber of Secrets. |
| 70014 | Transfer optional excess boss damage; wait for every surviving group's boss defeat; choose R2/R3/R4 by surviving groups. |
| 70020, 70022 | Retain the Epic chamber actions. |
| 70033 | Decode runes locally, unlock the restricted remote action, and resolve the correct group-specific reward. |
| 70034 | Check all three agendas' doom, choose rift participants, and permit their private exchanges. |
| 70035 | Deposit/retrieve tokens and Item cards, carry notes, and transfer the real payload to another group's Vent. |
| 70036 | Apply the selected investigator's hand/resource penalty, distribute the three diagrams, and remove all copies. |
| 70037 | Pay a clue, disengage, enter the group-specific chamber, and isolate it until five agenda doom. |
| 70038 | Track local damage and shared horror, then grant the group-specific diagram. |
| 70042, 70044, 70046 | Preserve the distinct Epic diagram controls and defeat transfer. |
| 70049, 70051, 70059 | Transfer the Pet/Jailor with required state, and permit only the private exchange authorized by Paradox Effect. |

## Integration contract

The implementation uses original native scenario/card handlers and a typed event coordinator. The ordinary single-group and mini-campaign routes remain available. The coordinator validates exactly A/B/C, deduplicates operation IDs, records stable generations for round/stage barriers, and retains explicit choices for destinations, participants, payments and damage transfers.

The existing Epic framework persists invertible integer deltas. Cards and entities require a separate typed parcel ledger containing stable identity, printed code, original owner, current controller, tokens, attachments and opaque native metadata. Server integration must validate and decode those snapshots, apply sender and receiver changes atomically, and retain enough information for correct undo. A transfer must never be reported as complete merely because a local card was removed.

Round and stage barriers have two phases: all live groups arrive, then all finish their permitted windows. The coordinator releases a generation once. Retries, reconnects and saved games consume the same generation without replaying rewards or transfers. Private exchanges are scoped to the investigators authorized by the relevant card; other groups receive only public progress.

Entire-playthrough completion requires all three setup roles, both chaos bags, synchronized story draws, round/stage barriers, every story branch, card/token/entity identity preservation through transfers, rejected duplicate operations, undo, and save/reload while waiting or exchanging.

## Verification status

On 7 October 2026 the complete Linux native engine/API graph compiled and linked with all 8,307 library objects. The full sanitized suite passes **194 examples, zero failures**, including **73 Labyrinth cases**. These exercise the coordinator, original cards/stories/transfers and actual native-loop round arrival. Fresh group A/B/C setup receives its locked replica before the native loop; exact canonical and legacy quoted event IDs reach the same adapter.

The shared dispatcher now executes the transformed gate message instead of the outer original message. Actual API, managed-restart and browser results are recorded separately in [aggregate evidence and exact scope](import-native-aggregate-linux-2026-10-07.md). The private Linux build does not create a signed macOS distribution or unlock the normal installation gate.
