# Core 2026 native scenario continuation — 15 October 2026

This batch corrects three printed-rule gaps in the existing native Smoke and
Mirrors and Queen of Ash implementations. It extends the `scenario-fixes`
profile against pinned upstream revision
`03a7f1e74925744f021f6e8fe0e39945d2c3a833`. The independent TypeScript engine
continues to cover Spreading Flames; this batch does not add scenario builders
or change experimental labels.

## Printed behavior and regressions

**French Hill (12154):** the printed colon follows the instruction to choose
and discard a hand card. That discard is now a cost of the action, paid before
selecting the asset that receives a charge or secret. Previously it was an
effect, so an investigator unable to discard could still receive a token.
Eight native examples cover empty and weakness-only hands, ownership and
location restrictions, physical discard and action payment, charge/secret
selection, the per-investigator round limit, and restoring both the pending
payment and recipient choice from serialized Game/queue state.

**Queen of Ash setup:** with *the investigators stirred up trouble* recorded,
the engine previously removed all six eligible Cultist cards from the gathered
encounter cards and spawned only one per investigator. It now removes only
the selected physical cards, leaving the rest in the encounter deck. Nine
native examples exercise both campaign-record branches for one through four
investigators, compare all six physical card IDs across deck and play, require
different Sewer Tunnels, and restore a pending setup choice without losing or
duplicating cards.

**A Gathering (12169):** the agenda back only spawns the Servant of Flame if
it is set aside. The old code also moved an already-in-play Servant to
Underground Cistern. The correction leaves an existing enemy's location and
state intact and never recreates an absent Servant. Six native examples advance
the real agenda, test physical set-aside identity and removal, preserve an
existing enemy, resolve direct horror despite available asset soak, and finish
both investigators' willpower tests before the next agenda. The spawn/test
checkpoint also survives Game/queue serialization.

## Build profile and release scope

The full `ChronicleFullScenarioFixesSpec.hs` driver includes these 23 examples
alongside all previous suites. Build registration and the legacy-profile
rejection cover the new native files. The macOS ARM64 workflow now selects
`--with-epic-machinations --with-scenario-fixes` throughout its native build
pipeline; the existing export verifier binds the selected profile, driver,
sources and actual binaries to its proof. The earlier curl retry/checksum
download fix from PR #4 is preserved.

Vercel deploys the Chronicle client. Using these corrections requires a
companion built with the current profile; a web deploy does not install that
runtime. Native behavior tests and a generated Mac archive remain distinct
from installation and whole-scenario victory acceptance. The generated support
map retains its historical registry/API capture.

## Verification

The complete native library/API graph compiles with **8,308 objects**. The
unfiltered full driver passes **286 examples, zero failures**: the earlier
263 plus 23 new examples. Verification completed at
`2026-10-15T13:28:46.719Z` on Linux x86_64 with GHC 9.14.1. The client/script
suite passes **641 tests**, and the production build passes.
The nine Queen setup cases also pass five additional focused runs to check
that shuffled Cultist selections do not leave an unanswered setup prompt;
those repeat runs are not counted as additional aggregate examples.

Queen setup tests follow the actual setup text, starting-location selection,
Zealot Forced choices and `EndSetup` sequence. The horror cases resolve the
actual investigator-only assignment before checking damage and continuation.
No pending prompt is bypassed to produce the expected state.

The proof is retained at `output/rules-server/rules-native-check.json`, with
the final execution log at
`output/core2026-scenario-import/native-tests-4.log` and the full compiler log
at `output/core2026-scenario-import/native-build.log`.

| Identity | SHA-256 |
| --- | --- |
| Native engine | `c3e83f65600a6156aec1271b97334185ab86762c658b2ee4e5677c03bea52130` |
| Complete original extension sources | `d83e8c1e0be19fa8abe1d39090dfc60f21df8452e03e31dfdc461ca3ccc8770d` |
| Scenario correction sources | `6feddb795fd123e55bbe6ea36b9f46d85314b67d08e588a3a50957337a979ced` |
| Dedicated full test driver | `46eb21850acb340314fbe19008e3ec94f452d224ae1ce68e55ff58ac25b4c873` |
| Native test executable | `4a776c59f396be60b95e4f456f1d5f3001bbb4ac29face17f22a1f2076d75ce9` |

## Rules evidence

- [Brethren of Ash campaign guide, printed p. 12](https://images-cdn.fantasyflightgames.com/filer_public/f0/22/f022ac7c-9c30-4521-ac16-1f74f00e1d31/ahc100_campaign_guide-web.pdf),
  SHA-256 `d523777a189f3a276c2a745f5b51ac75942539df73bfe24bd33204e5a4e26f41`.
- [French Hill, 12154](https://arkhamdb.com/card/12154), checked against the
  cached printed face at `public/art/cards/12154.webp`.
- [A Gathering, 12169](https://arkhamdb.com/card/12169), checked against the
  imported back text in `public/data/cards-001.json`.
