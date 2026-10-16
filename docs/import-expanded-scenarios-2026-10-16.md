# Expanded native scenario continuation — 16 October 2026

This batch extends `scenario-fixes` with eleven correction areas against pinned
upstream `03a7f1e74925744f021f6e8fe0e39945d2c3a833`. It follows the
[339-example Apiary and search batch](import-apiary-search-2026-10-16.md).
The regression suites add **137 passing native examples**, for a full aggregate
of **476 examples, zero failures**. The preceding batch covered two correction
areas and added 23 tests; this batch covers eleven areas and adds 137, exceeding
the requested fourfold increase without counting individual runner edits as
separate imports.

## Corrected behavior

| Area | Previous behavior | Implemented correction |
| --- | --- | --- |
| Successful keyed encounter searches | A selected spectral card could remain in its original pile; discard choices lost their encounter-deck key, and completion shuffled the regular deck. | Preserve both the original deck key and source zone in the saved choice, remove the exact physical card from that zone, and shuffle the searched deck. Moving the investigator after the choice appears does not retarget the search. |
| Doom timing and Apiary Tender (11575) | Several entity runners opened doom windows after changing tokens, or omitted a usable before-placement window. Tender consequently used after-placement timing. | Resolve the placement's When window before mutation and After receipts afterward. Tender now uses its printed When timing; its attack finishes before the pending doom is placed. Replacement remains before placement, and Act/Agenda first-doom receipts require an actual positive mutation. |
| Slitherer in Darkness (11605) | A tie for lowest combat caused an attack against every tied investigator. | The lead investigator selects one tied investigator for one attack, as required by the singular printed target. |
| Colossal Tyrant (11635) | A connected-location eligibility check could suppress its Forced ability even with sanity-bearing cards at grid-adjacent locations. | Allow the printed empty-location condition to open the ability, then resolve its existing adjacent-location horror effect. Adjacent locations need not be connected. |
| Voltaic Eel (11733) | Its fully flooded movement shortcut also applied outside the enemy phase. | Supply that connection modifier only while the Eel is moving during the enemy phase. |
| Dark Magician (12189) | The nearest doom-free enemy search explicitly excluded the Magician itself. | Include the Magician when eligible, preserving distance, doom and placement restrictions. |
| Your Friend's Room (12113) | Its action excluded enemies engaged with another investigator and did not carry the printed Engage action type. | Offer the paid Engage action for an enemy at a connecting location, including an engaged enemy. Destination eligibility uses the same movement restrictions as the actual move resolver, excluding blocked entries. Resolve movement before checking the subsequent engagement, so prohibited engagement does not undo movement and failed movement does not drag the enemy into the room. |
| Raising Suspicions (12160) | Surge depended on the absence of an eligible target, rather than whether its effect actually placed doom. | Track that revelation's actual positive placement receipt. If placement is replaced or canceled, gain surge after resolving the effect. |
| Calcification (10723) | Its first-move trigger counted move actions, missing fast and forced movement. | Use the real movement window and round movement history, including completed moves before the treachery entered play. The removal action remains independent of this restriction. |
| Writhing Appendage (82030) | Its defeat damage attributed the damage source to the investigator resolving the Forced ability. | Attribute the one damage to the Appendage's encounter ability, preserving Cnidathqua's physical identity and excluding investigator damage benefits. |
| Fortune or Fate (05237) | Its doom cancellation path did not safely reduce the pending placement under the corrected before-placement timing. | Prevent exactly one impending doom, preserve existing doom and later queued placements, update any prebuilt After receipt to the actual remaining amount, and complete the event's normal cost, limit and exile processing. |

## Regression coverage

| Suite group | Added examples | Main checks |
| --- | ---: | --- |
| Keyed encounter searches | 18 | Regular and keyed deck/discard success, source-zone exclusion, exact physical-card removal, unrelated deck order, empty remainders, repeated-search duplication prevention, legacy/new serialization and real Spectral Wraith draw/discard routing. |
| Doom timing | 27 | Six located card types, actual Tender attacks before mutation, positive/zero placement, other tokens, prohibited placement, Brethren of Ash replacement, Act/Agenda first-doom receipts and two separate Tenders. |
| Drowned City enemy timing | 21 | Tied target selection, adjacency versus connection, sanity-bearing cards and phase-scoped flooded movement. |
| Core 2026 encounter actions | 28 | Dark Magician eligibility and nearest targets; Your Friend's Room action cost, action type, movement and engagement restrictions; Raising Suspicions actual placement versus surge. |
| Hemlock Vale and Carnevale | 20 | Calcification paid, fast, forced, canceled and repeated movement, history and round reset; Writhing Appendage actual defeat, source attribution, nonlethal/discard negatives and separate physical copies. |
| Fortune or Fate | 23 | Single and multiple impending doom, existing doom preservation, exact receipts, eligible scenario cards, excluded player cards and costs, resources, max once per game, later queued placements and physical exile. |
| **Total** | **137** | **Passing full aggregate: 339 + 137 = 476.** |

The suites drive native revelation, Forced windows, paid actions, movement,
attacks and damage assignment. Saved checkpoints serialize both the Game and
pending message queue: search choices retain their original deck/zone; doom
interrupts retain their source and amount; movement and enemy defeat choices
retain the selected physical entities. Assertions distinguish individual card
IDs across decks, discard piles, play and exile, and check that restoring a
choice does not duplicate its card or repeat its effect.

These are bounded behavior tests. They do not establish complete scenario
victories, campaign completion or installed companion acceptance.

## Rules and source references

The imported printed-card catalog is the immediate wording reference. The
corresponding card entries are:

- [Apiary Tender, 11575](https://arkhamdb.com/card/11575).
- [Slitherer in Darkness, 11605](https://arkhamdb.com/card/11605),
  [Colossal Tyrant, 11635](https://arkhamdb.com/card/11635), and
  [Voltaic Eel, 11733](https://arkhamdb.com/card/11733).
- [Your Friend's Room, 12113](https://arkhamdb.com/card/12113),
  [Raising Suspicions, 12160](https://arkhamdb.com/card/12160), and
  [Dark Magician, 12189](https://arkhamdb.com/card/12189).
- [Calcification, 10723](https://arkhamdb.com/card/10723),
  [Writhing Appendage, 82030](https://arkhamdb.com/card/82030), and
  [Fortune or Fate, 05237](https://arkhamdb.com/card/05237).

[Arkham Grimoire v1.1](https://images-cdn.fantasyflightgames.com/filer_public/b6/ac/b6ac3b87-f5af-4d4c-b036-f7c51ced063d/arkham_grimoire_v11_web_1.pdf)
provides the shared timing, movement, action and search rules; page 21 requires
a fully searched deck to be shuffled when the search completes. The PDF's
recorded SHA-256 is
`a0ae9ebd0fc6f1455aedf95dacfd0f19a80ccb832c559e4aafbcfb437d0e9a44`.
The native keyed-deck fixtures use The Wages of Sin's regular/spectral routing
and real Spectral Wraith resolution. The pinned source audit also covers Laid
to Rest's keyed-deck selection; the test count does not imply a full playthrough
of either scenario.

## Scope and remaining work

Slitherer in Darkness still has a separate known limitation: its existing
no-attack fallback checks whether a target was available, rather than whether
an attack actually completed. A prevented or canceled attack may therefore
fail to produce its printed fallback movement. The tied-target correction in
this batch does not resolve that interaction.

The same source audit identified later work on Eroded Frieze's leave-play
replacement and the printed costs on Ancient Vault O/N. Those corrections are
outside this batch.

Vercel publishes the web client. Applying the native changes requires a newly
built companion containing this source profile. A successful Mac workflow or
export establishes that package's build result; installation and live native
scenario acceptance require separate evidence.

## Verification

The complete engine/API graph compiled with **8,308 native objects** on Linux
x86_64 using GHC 9.14.1 and Stack 3.11.1. The unfiltered full driver passed
**476 examples, zero failures**, including all 137 new cases, at
`2026-10-16T14:58:13.247Z`. Hspec configuration and the test environment were
sanitized. The client/script suite passed **641 tests**, and the production
web build passed.

The proof is retained at `output/rules-server/rules-native-check.json`.
Full compilation is recorded in `output/large-import/native-build-2.log`;
the final complete test run is `output/large-import/native-tests-2.log`.
The actual API binary, test executable, driver and all four extension source
hashes were independently checked against the passing proof before commit.

| Identity | SHA-256 |
| --- | --- |
| Native engine | `df114dbfd0df6620a1da271303d247925e73643d7903f67bf84246d2874f135f` |
| Complete original extension sources | `f8825ff34e08f2db5d4f25da5178a9a5c427cbf1705484a41794cad5ae27509f` |
| Scenario correction sources | `7f14b829d4dd6309d440205911993bd3de6707408c7e61ea2d70b493652fbd04` |
| Dedicated full test driver | `e9647d4818989b186ac195bda6cd59ec15f3da14d042342c1bff7c5ed8278679` |
| Native test executable | `79b28db38a2091ee14512639e329fa252cb39c20ae3509b02452757c5be557d4` |

The preceding [339-example ARM64 workflow](https://github.com/tuitamogamer-gpt/arkham-lcg/actions/runs/38899600323)
completed native tests and export. Independent inspection verified every one
of its 1,387 inventory files and its exact API/manifest/behavior-proof binding;
identities are recorded in the [Mac release history](macos-runtime-release.md).
That archive belongs to the preceding profile. The expanded profile is selected
by the Mac workflow on its subsequent main-branch build; this Linux result does
not establish that future Mac export or a local installation.
