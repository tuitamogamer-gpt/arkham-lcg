# Native scenario continuation — 13 October 2026

This batch repairs existing native rules for The Drowned City and Edge of the
Earth. It does not add a second independent TypeScript implementation or change
the published experimental labels. The pinned source remains
`03a7f1e74925744f021f6e8fe0e39945d2c3a833`.

## Corrections

The Drowned City western expedition now removes one Tablet and adds one Cultist
after the story-ally choice. The eastern route leaves the chaos bag unchanged.
The official campaign guide, page 11, places the token change in the western
branch; the old eastern TODO was incorrect. Eleven native examples cover all
four difficulties, an additional Tablet, story-card ownership, campaign records,
the next scenario, and saving/resuming the unanswered ally choice.

Loathsome Parasites now shuffles every revealed non-enemy even when its current
encounter deck contains no enemy. The original no-enemy branch did nothing.
An empty starting deck is refilled before the reveal. Revealing cards does not
remove them from their area, so reaching the end of the current deck neither
pulls an enemy from the discard pile nor emits an artificial exhaustion event.
When spawning the sole card actually empties the deck, its native reset window
and reshuffle follow the spawn. Fourteen native examples check physical card
identity, the shuffled order, untouched discard/remainder, empty piles, Elite
restrictions, spawn choices and a saved native exhaustion window.

The original Loathsome TODO proposed refilling and continuing mid-effect.
Grimoire v1.1, page 10, requires a reset after the effect finishes; implementing
that TODO would have changed the printed behavior. The correction follows the
printed card and timing rule instead.

Frenzied Explorer now emits `TakeControlOfClues` after converting its doom into
a clue and before the enemy can leave play. Polar Mirage can therefore match
the enemy's location and discard the investigator's non-weakness hand cards.
Six native examples exercise paid evade/parley actions, the real reaction and
Forced choice, retained weakness, remaining doom, a remote Mirage, declining
the reaction, insufficient success and Lost Researcher's existing path.

## Runtime identity

The new `scenario-fixes` extension requires the complete existing aggregate:
`--with-epic-machinations --with-scenario-fixes`. The dedicated
`ChronicleFullScenarioFixesSpec.hs` driver includes all existing native suites
and the 31 new examples. Legacy source identities and their drivers remain
separate. Build, QA and Mac export validation require the exact selected
extension list and driver; coordinator-only evidence cannot certify fixes.

## Verification

The client/script suite passes **610 tests**, and the production build passes.
The complete native library/API graph compiled successfully: **8,308 objects**
(8,357 GHC compilation units including boot modules). The dedicated unfiltered
driver then passed **263 examples with zero failures**: the existing 232 plus
31 new examples. Verification completed at `2026-10-13T11:45:09.490Z`.

The actual proof is retained at
`output/rules-server/rules-native-check.json`; the passing execution log is
`output/scenario-import-2026-10-13/native-tests-retry-2.log`. The compiler and
earlier fixture-debug logs remain beside it. The test harness initially needed
explicit entity imports, the real localized branch label, completion of the
native discard-order choice, and queue/window assertions instead of its stale
consumed question. All final assertions ran against the complete native engine.

| Identity | SHA-256 |
| --- | --- |
| Native engine | `ac9a865a84673d95c61bb3f457a3b60542fc037ac022d4e118d4c3ce9f7e34fa` |
| Complete original extension sources | `596e7c0f6ba65e8903b2c9443e5327273d65dc71bfe46cf103061a6655118159` |
| Scenario correction sources | `daeeb29f02776886f5aaf83fb219b0ef1a16c4e90a8c2dc41db701def5f5a31c` |
| Dedicated full test driver | `a86fb4da7235be38f6336bc14de484ded07d6ded2539584cd2c8fe5aae2e17f5` |
| Native test executable | `fff79cd5636b2ebddeb5050e7895cd71c6b5d4d3814d30bd59ed307be94cc027` |

Earlier 232-example registry/API inventory remains historical evidence for its
own profile. This run does not create a new registry capture, private API
acceptance manifest, installed release or whole-scenario victory report.

The current worker is Linux x86_64. The external source and toolchain are under
`/workspace/arkham-upstream` and `/workspace/arkham-toolchain`. The pinned GHC
9.14.1 bindist requires GNU gold; this worker uses the extracted Debian package
`binutils-x86-64-linux-gnu_2.40-2_amd64.deb`, SHA-256
`2d7ea8a570d768224d7f2424abbe6f373d2154865a1fa7f56c80d43ecf492521`.
Its isolated `gold-bin` directory is prepended to `PATH` without replacing the
system linker. The configured disk reserve is 2 GiB.

After restoring and staging the pinned dependencies, the full Linux check is:

```sh
node scripts/build-rules-runtime.mjs --compile-only --incremental-native \
  --direct-objects --test --compact-build \
  --with-epic-machinations --with-scenario-fixes
```

Vercel hosts the Chronicle client. Native corrections require a companion
runtime built with the new profile; client deployment alone does not install
them. Linux compilation is separate from signed Mac distribution and whole
scenario victory acceptance.

Rules sources are linked in the [extension notes](../rules/extensions/scenario-fixes/README.md).
The examined Drowned City guide has SHA-256
`c27f933cc763c738384d328128dbb1509e7f2a091c37c18b853489ed17aab429`;
the examined Grimoire has SHA-256
`a0ae9ebd0fc6f1455aedf95dacfd0f19a80ccb832c559e4aafbcfb437d0e9a44`.
