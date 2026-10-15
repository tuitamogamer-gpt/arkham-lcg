# Native encounter continuation — 15 October 2026

This batch extends the existing `scenario-fixes` profile with four encounter
card corrections in The Drowned City and Queen of Ash. The pinned native
upstream remains `03a7f1e74925744f021f6e8fe0e39945d2c3a833`. It follows the
[Core scenario batch](import-scenario-core2026-2026-10-15.md), whose full Linux
aggregate passed 286 examples.

## Corrected behavior

**St. Elmo's Fire (11665):** revelation still attaches to the nearest location
without another copy. Round-end movement now allows any adjacent location,
including one with another Fire, and prefers locations with investigators.
The previous shared exclusion could force the Fire away from investigators
or prevent movement entirely. Native tests resolve the real round-end Forced
window, preserve physical treachery IDs, check the old-location damage before
movement, and restore a pending destination choice.

**Blasphemous Invocation (12190):** the fallback search depends on whether doom
was actually placed. Having an eligible Cultist is insufficient: the final
Brethren of Ash agenda (12171) can replace every placement with direct damage.
The correction tracks actual placement receipts through the revelation and
performs the fallback after its failed-test effects when none succeeded.
That state survives a saved Game and pending message queue.

**Infected! (11722) and Eye of the Deep (11729):** a colocated investigator can
take the printed removal action on a teammate's threat-area card. The former
owner-only restrictions prevented legal assistance. Remote investigators still
cannot activate these abilities. The acting investigator pays the action and
takes the willpower test; Infected's failure damages that investigator. The
treacheries' other effects continue to apply to their hosts.

## Scope and runtime

The dedicated full `ChronicleFullScenarioFixesSpec.hs` driver includes the
new regression suites alongside all existing extensions. Registration and
legacy-profile rejection cover all four modified native files. The Mac
workflow already selects `--with-epic-machinations --with-scenario-fixes` for
its build, test and archive export.

The [preceding Mac workflow](https://github.com/tuitamogamer-gpt/arkham-lcg/actions/runs/38743847710)
at `ba055780511bcc4187f2240a705593636387734d` completed successfully, including
native tests and package export. That artifact belongs to the preceding
source profile; this batch requires a newly built companion.

Vercel deploys the client. These corrections do not add independent TypeScript
scenarios, remove experimental labels, replace the historical registry/API
inventory, or establish installed-runtime and whole-scenario acceptance.

Two further source-audit findings remain outside this batch: Apiary Tender's
doom trigger omits treacheries at its location, and the generic native
find-and-draw encounter helper does not shuffle after a search with no matches.
The latter still applies to Blasphemous Invocation's inherited no-match path;
the new correction covers when its fallback must run, including replacement.

## Verification

The complete native library/API graph compiles with **8,308 objects**. The
unfiltered full driver passes **316 examples, zero failures**: the earlier
286 plus 30 new examples (eight Fire, nine Invocation and thirteen shared
threat-area cases). Verification completed at
`2026-10-15T18:16:19.582Z` on Linux x86_64 with GHC 9.14.1.
The client/script suite passes **641 tests**, and the production build passes.

The final tests draw physical encounter cards, resolve native Forced windows
and paid actions, and restore serialized Game/queue checkpoints. The Invocation
search counter observes the queued public search message, while assertions also
verify that the selected physical Cultist is drawn exactly once. Shared access
requires an actual common location; a host retains access to their own threat
area under Grimoire section 2.2.1 even when a helper cannot share that access.

The proof is retained at `output/rules-server/rules-native-check.json`, with
the final execution log at
`output/encounter-scenario-import/native-tests-3.log` and the full compiler log
at `output/encounter-scenario-import/native-build-3.log`.

| Identity | SHA-256 |
| --- | --- |
| Native engine | `4dae50ccae0eeb5c8ded5553c662f6e05301cfc165a884318f46bd7516600e2a` |
| Complete original extension sources | `f07a02410da4c379ed0e681156391fc94f05ed4a40f2eb34b71519e1328e1e96` |
| Scenario correction sources | `abc03da4c9a08f5052c350eb169c3524a05e649c4a0a57ac2ba956112207a1f7` |
| Dedicated full test driver | `0604e97a2ddcb83fc9efd4e0eb139dbc6e1b2099e27542fe48b6a7cff8c4c719` |
| Native test executable | `d49e0e34c492663328cd83d75e8f3ece8beb279e2b5a2f1b6e3871dde0481600` |

## Rules references

- [St. Elmo's Fire, 11665](https://arkhamdb.com/card/11665), imported text in
  `public/data/cards-002.json`.
- [Blasphemous Invocation, 12190](https://arkhamdb.com/card/12190), and
  [Brethren of Ash, 12171](https://arkhamdb.com/card/12171), imported text in
  `public/data/cards-001.json`.
- [Infected!, 11722](https://arkhamdb.com/card/11722), and
  [Eye of the Deep, 11729](https://arkhamdb.com/card/11729), imported text in
  `public/data/cards-003.json`.
- [Arkham Grimoire v1.1, pp. 4 and 28: Activate Action and timing 2.2.1](https://images-cdn.fantasyflightgames.com/filer_public/b6/ac/b6ac3b87-f5af-4d4c-b036-f7c51ced063d/arkham_grimoire_v11_web_1.pdf).
  The rule permits scenario-card actions on encounter cards in any
  investigator's threat area at the acting investigator's location. Examined
  PDF SHA-256:
  `a0ae9ebd0fc6f1455aedf95dacfd0f19a80ccb832c559e4aafbcfb437d0e9a44`.
