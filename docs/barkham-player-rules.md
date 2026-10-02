# Barkham player extension

The original extension sources live in
`rules/extensions/barkham/backend/Arkham/Homebrew/Barkham/Player/`. They implement
the five printed investigators and cards 001–021 through the rules engine's
typed message queue. They are not aliases for the human investigators or Core
cards.

| Investigator | Implemented rules |
| --- | --- |
| Bark Harrigan | Printed 3/2/5/2 skills and 9/5 health/sanity; two weapon-only hand slots; +2 Elder Sign and a discount on the next weapon this round. Catling Gun spends two actions and 1–3 of its twelve ammo for the matching combat and additional damage. More Bark Than Bite applies −3 combat until an enemy is defeated. |
| Kate Winthpup | Persistent, saved sniffed-location identities; sniff at the current or a connecting location without provoking attacks; −1 difficulty on every test performed at a sniffed location; Elder Sign sniff. Feline Discombobulator automatically evades the spawning cats at the correct spawn window. Foul Odor assigns horror after tests at sniffed locations and its action clears the bearer's sniffed locations, including when another investigator helps discard it. |
| “Skids” O'Drool | A once-per-round move action costing one resource, with zero to three sequential movements and engagement skipped on entry; Elder Sign damage on the next entry to an enemy's location this round. Take the Wheel deals three damage at every entry for the remainder of the turn. Dogcatchers hunts its bearer and prevents further movement after either enters the other's location. |
| Jacqueline Canine | Once-per-round burial from hand with a replacement draw; an action to recover one or two chosen cards; Elder Sign recovery. Chew Toy allows buried cards to be committed through the engine's existing commit permission. No Sense of Space or Time presents a separate keep-with-horror or discard choice for each buried card. |
| Duke | Friendly Human starts in play, with five treats; begging spends two actions and adds three treats. Elder Sign adds a treat and readies Friendly Human after the test. Friendly Human's success reaction spends a treat and offers legal healing, drawing or resources. Out of Doggie Treats removes the treats while retaining the ally. |

The six ordinary player cards implement their printed rules: Spiked Collar's
damage reaction, Dog Monocle's investigation and parley modifiers, Hired Dogs'
fast test and subsequent pay-or-discard choice, Howl of Clyhf'ford's global
highest-evade target (including Elite enemies) and automatic evasion of every
other non-Elite enemy after success, Old Shoe's damage cost and
horror healing, and Hair of the Dog's next-test penalty expiring at round end.

Treats use the engine's `Supply` use token only on Friendly Human; the integrated
frontend labels that token “Treats” for this card. This preserves the existing
engine's use-cost, save and resource-transfer behavior without changing the
meaning of supplies on other cards.

Deck legality is checked by the client validator. A server-side guard separately
prevents using Barkham investigators or player cards outside this standalone
scenario before a chosen deck is loaded. The native server's deck validation
checks implementation availability; it does not judge artwork eligibility or
reject the manually reviewed off-class cards. Artwork-dependent eligibility requires
the player's explicit review of the printed rule. In particular, the extension
does not infer “looks like it would smell weird” or “humans who want to pet you”
from a card's title.

All 21 native player behavior modules and their generated registration compiled
in the private derived engine build on 30 September 2026. All 22 focused native
behavior cases in
`rules/extensions/barkham/tests/Arkham/Homebrew/Barkham/PlayersSpec.hs` passed in
the linked Hspec executable. Actual scenario play in the integrated client
remains necessary to verify the complete user flow; source compilation and
focused tests do not substitute for that check.

Rules and printed stats were checked against the imported Barkham definitions
and the published card scans retained in the source manifest. Product and rules
provenance remain in `scripts/data/barkham-source.json`.
