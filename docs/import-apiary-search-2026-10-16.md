# Apiary and encounter search continuation — 16 October 2026

The later [expanded continuation](import-expanded-scenarios-2026-10-16.md)
resolves this batch's deferred before-doom timing and successful keyed-search
gaps. The 339-example result below remains the historical proof for this batch.

This batch extends `scenario-fixes` against pinned upstream
`03a7f1e74925744f021f6e8fe0e39945d2c3a833`. It follows the
[316-example encounter batch](import-scenario-encounters-2026-10-15.md).

## Corrected behavior

**Apiary Tender (11575):** its printed condition refers to doom placed on any
card at its location. The previous four-type matcher omitted treacheries and
events. A target-at-location doom matcher includes those card types and resolves
threat-area locations through the host. Positive placement is required; a
zero-counter message does not represent doom being placed.

**Encounter search completion:** the native find-and-draw helper previously
acknowledged a search with no matches without shuffling its searched deck.
Grimoire v1.1, p. 21 requires a full deck to be shuffled after searching it.
The no-match choice now queues the shuffle for the original encounter deck
key, preserving that choice through Game/queue serialization. It does not
merge the discard or shuffle another deck.

## Regression coverage

The new suites contain 23 examples. Fifteen Apiary cases exercise positive doom
on all six native card types, remote and missing locations, zero doom and other
tokens, readiness without an investigator to attack, and a real Parasitic
Transformation trigger. That interaction is saved and restored both before
the Forced ability and during the attack's damage assignment.

Eight encounter-search cases check physical-card conservation, an actual
shuffle and exactly one queued shuffle message, saved acknowledgement,
regular and explicit spectral deck isolation, excluded discard, empty/singleton
decks, unchanged regular successful draws, and Blasphemous Invocation's real
failed test followed by a search with no matching Cultist.

## Scope and remaining engine work

Apiary Tender retains the upstream after-placement trigger timing. The printed
card says “When”; several native target runners do not emit a usable
before-placement window, and the enemy runner emits its window after mutation.
Changing only this card to a before-placement trigger would lose existing
location and investigator behavior. A shared timing correction needs runner,
cancellation and replacement tests and is not established by this batch.

Successful keyed encounter searches also need a separate correction: the
current selected-card callback does not preserve the original keyed discard
zone and manipulates the regular encounter piles. A complete fix must capture
the original deck key and source zone in the saved choice, remove the exact
selected card, and shuffle only the searched deck. The no-match change does
not certify these successful keyed paths.

The full native driver and profile downgrade guard include these corrections.
Vercel serves the client; applying native changes requires a newly built and
connected companion. These focused regressions do not establish installation
or whole-scenario victory acceptance, add independent TypeScript scenarios,
or change upstream experimental labels.

## Verification

The complete native engine/API graph compiles with **8,308 objects**. The
unfiltered full driver passes **339 examples, zero failures**, including the
23 new regressions. Verification completed at
`2026-10-16T12:13:31.681Z` on Linux x86_64 with GHC 9.14.1.
The client/script suite passes **641 tests**, and the production build passes.

The proof is retained at `output/rules-server/rules-native-check.json`, with
the compiler and execution log at `output/apiary-search-import/native-build.log`.
The actual engine, test executable and driver hashes were checked against that
passing proof before commit.

| Identity | SHA-256 |
| --- | --- |
| Native engine | `0a3076d54a14f6dc85a41ef103e269057c5396f7141c9231e46134591a870af8` |
| Complete original extension sources | `61a625cbf99ddcd9ceccc6a2c51fb06793dfb2cfc090c402a44942c711aba0d3` |
| Scenario correction sources | `75b58916dc773c7e937c70db672158be5d1b0e195f8816cbb96762b2b6b12cde` |
| Dedicated full test driver | `69969920cff4c9bde26c3cf48f795e94f34c712bd1fd382aabb8c214bd93066d` |
| Native test executable | `eb41ffc59bd71d3dde055ce9cc54a3866e6704dc6b3841d9e31aeb777199484b` |

## Prior Mac release

The preceding [Mac workflow](https://github.com/tuitamogamer-gpt/arkham-lcg/actions/runs/38784851486)
at `ae37ee6` completed with 316 passing native examples and exported its archive.
Independent inspection verified all 1,387 inventory files and the actual
ARM64 API/manifest/behavior-proof binding; identities are recorded in the
[Mac release history](macos-runtime-release.md). Those artifacts cover the
preceding profile. This batch requires a new companion build.

## Rules references

- [Apiary Tender, 11575](https://arkhamdb.com/card/11575), imported printed text
  in the reference catalog. The [printed face](https://arkhamdb.com/bundles/cards/11575.jpg)
  was visually checked; downloaded JPEG SHA-256:
  `c423dda0ca14fc7490b4f011a52a32fd8de9a956d03ef9f97766b328d5b2fec9`.
- [Arkham Grimoire v1.1, p. 21: Search](https://images-cdn.fantasyflightgames.com/filer_public/b6/ac/b6ac3b87-f5af-4d4c-b036-f7c51ced063d/arkham_grimoire_v11_web_1.pdf).
  Examined PDF SHA-256:
  `a0ae9ebd0fc6f1455aedf95dacfd0f19a80ccb832c559e4aafbcfb437d0e9a44`.
