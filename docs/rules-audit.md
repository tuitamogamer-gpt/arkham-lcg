# Rules audit — 23 September 2026

Scope: **Spreading Flames, 1–3 investigators, and the exact 2026 starter decks for Joe Diamond, Daniela Reyes and Trish Scarborough**. This is a targeted audit with reproduced defects and regression coverage, not certification of every interaction or of the entire core set.

## Authoritative baseline

- [Arkham Grimoire v1.1](https://images-cdn.fantasyflightgames.com/filer_public/b6/ac/b6ac3b87-f5af-4d4c-b036-f7c51ced063d/arkham_grimoire_v11_web_1.pdf), the current download on the [publisher's product/support page](https://www.fantasyflightgames.com/en/products/arkham-horror-the-card-game/) when checked. Relevant sections: damage (p. 8), drawing/decks (p. 10), investigate/hunter (p. 14), keywords/limbo (p. 15), peril (p. 18), prey and simultaneous resolution (p. 19), retaliate (p. 20), queued tests (p. 21), enemy/upkeep phases (p. 29), skill-test timing (p. 30), trauma (p. 37), and errata/FAQ (p. 41).
- [Publisher's July update explanation](https://www.fantasyflightgames.com/en/news/2026/7/14/the-book-that-writes-itself/), especially queued tests, choice eligibility, and Daniela's FAQ.
- [2026 rulebook](https://images-cdn.fantasyflightgames.com/filer_public/0e/d0/0ed09507-1705-47ed-a630-cd15885cabb0/ahc100_rulebook-web.pdf), including the printed starter lists.
- [Brethren of Ash campaign guide](https://images-cdn.fantasyflightgames.com/filer_public/f0/22/f022ac7c-9c30-4521-ac16-1f74f00e1d31/ahc100_campaign_guide-web.pdf), first-scenario setup, keywords and resolutions (pp. 2–4).
- Individual 2026 card text in the normalized snapshot, with provenance in `public/data/source.json`. Card identifiers are significant: an erratum for another printing or expansion is not automatically applied to a similarly named core-set card.

## Errata reconciliation

The local **12020 Machete** already contains the July correction: the attacked enemy must be the only enemy engaged with the investigator. The implementation incorrectly excluded exhausted engaged enemies from this count; that is corrected and tested. Exhausting Machete is optional after success, not a requirement for initiating the attack.

**12082 Scrape By** already says to succeed by 0. It is a level-1 card outside the three fixed starter decks, so a correct archive definition does not imply a playable upgrade script. The level-0 **12074 Hunter's Instinct** definition and script already discard the asset when its supplies run out. The separate Endurance, Glassing and Lie in Wait entries in Grimoire v1.1 must not be confused with card positions in this core set. No blanket name-based errata patch was applied.

## Corrected and regression-tested behavior

| Area | Result |
| --- | --- |
| Peril | Other investigators cannot use their scripted reactions during the resolving encounter, or assist the affected investigator's tests. The restriction survives saves and ends before the surged encounter. Constant Bodyguard allocation permission is distinct from its reaction. |
| Surge / duplicate keywords | Overzealous gives its drawn encounter Surge. If Cosmic Evils also gains Surge, it still draws only one extra encounter. Subsequent encounters can independently surge. |
| Hunter / Prey | Prey uses current agility, including asset bonuses. Existing nearest-route, tie-choice and Trish-only prey behavior remains covered by the party suite. |
| Retaliate | Its attack follows all failed-test results, including tablet damage. It does not exhaust the enemy. Exhausted enemies do not retaliate. |
| Enemy attacks | The player chooses the order of multiple attacks. Enemy-phase attacks exhaust the attacker after its attack and reactions finish. Opportunity attacks do not exhaust. Pending attacks recheck engagement/readiness. Wrench can provoke an explicit attack from an exhausted enemy without readying it. |
| Engagement / evade / Machete | Exhausted engaged enemies remain engaged, can be evaded, and count against Machete's bonus. They do not make opportunity attacks. |
| Doomed | Defeating a Bystander places doom; discarding it through parley does not. Doom can advance the agenda. |
| Bodyguard | Can absorb damage to a teammate at the same location. Cannot absorb that teammate's horror, direct damage, or damage from another location. The defeated Bodyguard's owner controls its reaction and receives its discard. |
| Simultaneous damage | Mutated!'s horror choice affects the entire group at that location. All affected investigators assign before damage/horror is applied. Fire damages all eligible investigators, assets and enemies at its location together, before Bandages and other reactions; Elite enemies are excluded. |
| Limbo / ST.8 | Committed cards leave their owners' hands, remain visible in the commitment UI, and enter the appropriate discard piles only when the test ends. They cannot be redrawn by their own success effect. Resolving events and treacheries are also withheld from discard until their scripted effects finish. |
| Skill values | Current asset modifiers are recalculated, including an ally defeated while paying for a boost. Breaking and Entering reads the current added agility. |
| Chaos timing / queued tests | Daniela's elder-sign damage happens before test results. New tests requested while a test is resolving wait in FIFO order. Covered combinations include an elder-sign Bystander defeat advancing the agenda and a Retaliate attack triggering Daniela's counterattack. Trish's elder-sign movement occurs after test cleanup. |
| Drawing | Multi-card draws add all cards before resolving their revelation effects. A replacement draw and reshuffle horror apply together. Drawing with both deck and discard empty defeats the investigator with mental trauma. |
| Actions / costs | Trish's extra evade counts as an action for first-action restrictions. Fast play does not. Wounded resets each investigator turn. Prestidigitation resolves damage from Syndicate Obligations before the Item enters play. |
| Legal choices | Empty locations can be investigated, including for Joe's reaction. A teammate can spend actions on a removable threat in another investigator's threat area at the same location. Rest and healing choices require something to heal. |
| Elimination / campaign | Simultaneous health and sanity defeat offers a choice of one trauma. The group chooses a replacement lead. The Armitage campaign bearer is chosen independently of his scenario controller. Defeat during a suspended test cleans up its commitments and allows the remaining investigators to continue. |

The original 77 regressions remain in the suite. This audit adds **38**, for **115 passing automated tests**. Fixtures include negative eligibility checks, owner-specific state, saved intermediate choices, and combinations of multiple rules rather than only single-card happy paths.

## Verification and saves

`npm test` and `npm run build` pass. `scripts/rules-browser-check.mjs` exercises Bodyguard allocation/ownership, Peril, committed-card reload, attack order, Daniela's elder sign, and saved queued tests in Chromium at 1280×800. The existing party desktop and manual-pacing browser checks also pass. The new dialogs and selected commitments were visually inspected; browser checks reported no errors.

Limbo ownership, Peril and queued tests are serializable. Older pending-test saves normalize their committed cards from hand to limbo on import. The save version remains 3 because the new fields are optional for compatibility. Export/import does not acknowledge a pending event or choose an outcome.

## Remaining rules work

1. **General player windows:** the engine offers scripted reactions and boosts, not arbitrary Fast card/ability use at every legal timing window. A Continue checkpoint is a presentation control, not a rules window.
2. **Ordering simultaneous triggers and results:** the player can now order enemy attacks, but simultaneous Forced abilities, multiple Fire locations, optional reactions and multiple ST.7 results still have a deterministic order. The lead/performing investigator must eventually be able to choose the applicable order.
3. **Encounter-deck reset boundaries:** drawing an encounter resets an empty deck, but immediate resets when the last encounter leaves the deck during a compound effect still need a dedicated timing pass. In particular, a subsequent encounter-deck search or an effect targeting the encounter discard can distinguish these states.
4. **General effect coverage:** the tests establish the listed combinations for the supported scenario and starter pools. They do not certify arbitrary custom decks, all possible nested sequences, all token combinations, or every keyword in the 196-card archive. Dexter, Isabelle, upgrades, later scenarios and the full campaign remain outside playable scope.

These are actual implementation boundaries, not optional house rules. The application should not be described as fully rules-complete until they are addressed.
