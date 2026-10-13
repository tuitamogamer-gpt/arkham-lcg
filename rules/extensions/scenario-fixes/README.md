# Native scenario corrections

This opt-in extension repairs three documented printed-rule gaps in the pinned
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

The upstream Loathsome Parasites TODO suggested refilling during the reveal.
The printed timing rule does not support that continuation, so this extension
deliberately removes it rather than implementing it.
