# Native scenario corrections

This opt-in extension repairs documented printed-rule gaps in the pinned
native engine. It is applied after Barkham, Epic Labyrinth and Epic Machinations
with `--with-epic-machinations --with-scenario-fixes`.

- **The Drowned City, Expedition to R'lyeh:** the western branch removes one
  Tablet and adds one Cultist for the rest of the campaign. The eastern branch
  preserves the bag. Source: the official campaign guide, page 11.
- **Loathsome Parasites:** every revealed non-enemy is shuffled back on top,
  including when the current deck contains no enemy. Merely revealing cards
  does not remove them from the deck, and an enemy in the discard pile is not
  pulled into this ability by a mid-effect reset. Removing the final physical
  card defers the native reset until the spawn resolves.
- **Polar Mirage:** Frenzied Explorer emits its clue-control window before it
  leaves play, allowing the attached Mirage to resolve. Lost Researcher's
  existing window remains unchanged.
- **Smoke and Mirrors, French Hill:** discarding a hand card is part of the
  action's cost. An investigator who cannot pay cannot gain a charge or secret;
  the chosen card is discarded before the ability resolves.
- **Queen of Ash setup:** when the investigators stirred up trouble, only the
  selected one Cultist per investigator is removed from the gathered encounter
  cards. The other physical Cultist cards remain in the encounter deck.
- **Queen of Ash, A Gathering:** advancing spawns a set-aside Servant of Flame
  at Underground Cistern. A Servant already in play keeps its current location;
  an absent Servant is not recreated.
- **St. Elmo's Fire:** the nearest location must have no copy of the Fire when
  it is first revealed. At round end it may move to any adjacent location,
  including one with another copy, prioritizing investigators as printed.
- **Blasphemous Invocation:** a failed test searches for a Cultist if no doom
  was actually placed, including when Brethren of Ash replaces every attempted
  placement with direct damage.
- **Infected! and Eye of the Deep:** investigators at the host's location may
  use the printed removal actions. Ownership still determines the treachery's
  other effects; a remote investigator cannot use these actions.

- **Apiary Tender:** positive doom placed on treachery and event cards at its
  location can trigger its ready/lose-aloof/attack sequence, alongside the
  previously handled card types. The existing after-placement timing remains;
  inconsistent native before-placement windows are a separate engine issue.
- **Encounter searches without a match:** acknowledging a completed full-deck
  find-and-draw search shuffles the searched encounter deck, including a keyed
  deck, without merging its discard or changing another deck. Successful keyed
  searches have a separate source-zone handling defect outside this correction.

`native-seams.json` contains bounded patches against upstream revision
`03a7f1e74925744f021f6e8fe0e39945d2c3a833`; it is not a vendored upstream engine.
Original native regression tests live under `tests/`. The dedicated
`rules/tests/ChronicleFullScenarioFixesSpec.hs` driver runs them alongside the
existing complete extension suite. Source hashes bind this profile separately
from the legacy aggregate. Reusing a corrected source checkout for a legacy
profile is rejected to prevent mismatched runtime claims.

These corrections do not change upstream experimental labels or establish
whole-scenario victory coverage. Vercel serves the Chronicle client; native
rules require a separately built and connected companion runtime.

Rules references:

- [The Drowned City campaign guide, p. 11](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/ahc84_campaign_guide-web_1.pdf).
- [Loathsome Parasites, 11555](https://arkhamdb.com/card/11555).
- [Arkham Grimoire v1.1, p. 10: Effects and Encounter Deck](https://images-cdn.fantasyflightgames.com/filer_public/b6/ac/b6ac3b87-f5af-4d4c-b036-f7c51ced063d/arkham_grimoire_v11_web_1.pdf).
- [Brethren of Ash campaign guide, p. 12: Queen of Ash setup](https://images-cdn.fantasyflightgames.com/filer_public/f0/22/f022ac7c-9c30-4521-ac16-1f74f00e1d31/ahc100_campaign_guide-web.pdf).
- [French Hill, 12154](https://arkhamdb.com/card/12154).
- [A Gathering, 12169](https://arkhamdb.com/card/12169).
- [Apiary Tender, 11575](https://arkhamdb.com/card/11575).
- [Arkham Grimoire v1.1, p. 21: Search](https://images-cdn.fantasyflightgames.com/filer_public/b6/ac/b6ac3b87-f5af-4d4c-b036-f7c51ced063d/arkham_grimoire_v11_web_1.pdf).
- [St. Elmo's Fire, 11665](https://arkhamdb.com/card/11665).
- [Blasphemous Invocation, 12190](https://arkhamdb.com/card/12190), and
  [Brethren of Ash, 12171](https://arkhamdb.com/card/12171).
- [Infected!, 11722](https://arkhamdb.com/card/11722), and
  [Eye of the Deep, 11729](https://arkhamdb.com/card/11729).

The upstream Loathsome Parasites TODO suggested refilling during the reveal.
The printed timing rule does not support that continuation, so this extension
deliberately removes it rather than implementing it.
