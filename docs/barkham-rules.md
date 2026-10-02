# Barkham native rules extension

This extension implements the standalone **The Meddling of Meowlathotep** in the independent Arkham rules runtime. The original implementation lives in `rules/extensions/barkham/backend/Arkham/Homebrew/Barkham`; the client translates catalog codes `barkham-NNN` to runtime codes `:barkham:NNN` using the checked-in `card-codes.json`. Miniature investigator records remain display aliases and are not additional game entities.

The expansion has 57 full-size definitions, 78 printed full-size cards and five miniature cards. Positions 001–021 are player content (27 printed copies), and positions 022–057 are scenario content (51 printed copies). The scenario reference is derived from the runtime scenario registry; it must not be inserted into an unsupported generic card-definition slot.

## Primary rules and provenance

The official [FFG scenario booklet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/pahc01_rules.pdf), linked from the [FFG Arkham product support page](https://www.fantasyflightgames.com/product/arkham-horror-the-card-game/), governs setup, the four chaos bags, Barkham-only investigators and cards, locations that are “lousy with cats,” sniffing, and the two standalone resolutions. The booklet was retrieved on 2026-09-30. Printed location symbols and connections were checked visually against page 9, rather than inferred from the diagram positions.

Card names, printed statistics and effects come from the previously imported `scripts/data/barkham.json`, with its detailed verification trail in `scripts/data/barkham-source.json`. Native Haskell behaviors are newly authored against the engine's constructors, message queue, costs, choice windows, skill tests, modifiers and serialization APIs. Gameplay support is established by execution checks, not by the existence of a card definition or registration entry.

## Scenario behavior

- The introductory decisions remain two explicit choices leading to four starting locations: Slobbertown, Snoutside, Beasttown, or Tailside. The outcome persists in scenario metadata.
- Setup places all ten locations. It shuffles the seven distinct Meowsks, removes one unseen, and puts one of the remaining six facedown under each peripheral location. The boss is set aside. The initial encounter deck contains 28 cards.
- A hidden cat is represented by a real card under its location, not a spawned enemy. It cannot engage, hunt or contribute doom until exposed. Paying clues through agenda 1 puts that card into victory; the action exposes it exhausted.
- Agenda 1 has a four-doom threshold. Its back offers the lead investigator an explicit choice when several hidden-cat locations are tied for greatest distance. It exposes the chosen cat and restores agenda 1a while retaining agenda 2 beneath it. When no locations remain lousy with cats, it advances to agenda 2.
- Act 1 checks its objective at the start of the investigation phase. The lead investigator chooses a Central location for Meowlathotep; live Meowsk cards move facedown under it and their in-play enemy entities are removed. Act 2 and agenda 2 then enter play through ordinary engine advancement, including doom cleanup.
- The boss's attached Meowsks increase health by one per investigator each, increase fight and evade by one per pair, and grant retaliate and alert at three or more. Act 2 offers distinct clue attacks: two damage with the normal attack-of-opportunity window, or one damage without that window.
- All ten location abilities, six remembered parley facts, seven individual Meowsk behaviors, four ordinary encounter enemies and nine encounter treacheries have native handlers. Rodent-Killer's prey also considers Meowlathotep once it is lousy with attached cats. Servant of Dog-Sothoth counts hidden cats under locations and attached to the boss when choosing the busiest location.
- Skull counts Meowsks in play, victory and attached to the boss once each. Easy/Standard rounds half that total upward; Hard/Expert uses the full total. Cultist/tablet effects use their printed reveal-versus-failure timing. Each difficulty has its exact standalone bag.
- Boss defeat leads to resolution 1. Agenda 2 or a game with no surviving/resigned resolution leads to resolution 2. The booklet awards no campaign XP, trauma, or continuation. Resolution prose remains an explicit checkpoint.

## Player content and deck restrictions

The separate player modules provide all five investigators, their signatures and weaknesses, and the six general player cards. Their implementation and tests are included in the same derived build. The server rejects Barkham investigators or cards in other scenarios before loading a deck. The scenario setup also rejects ordinary Arkham investigators. Ordinary Arkham player cards are legal in a Barkham deck when they satisfy that Barkham investigator's printed deckbuilding options.

Some printed off-class deckbuilding options intentionally depend on artwork or subjective descriptions (unusual smells, cats in the illustration, and allies willing to pet Duke). These need explicit player-confirmed eligibility metadata; a class/trait parser cannot infer those judgments reliably. Acknowledging such eligibility does not bypass deck size, card level, signature, weakness, duplicate, or scenario restrictions.

## Verification status

The extension includes 20 execution tests in `rules/extensions/barkham/tests/Arkham/Homebrew/Barkham/ScenarioSpec.hs`: all four intro outcomes, all four bags, hidden identities and encounter counts, exhausted spawning without engagement, agenda loops and ties, act transition and boss stats, both paid clue-attack modes, skull scaling, JSON save/reload, and all resolution entry paths. Player behavior tests are authored separately.

The derived native runtime compiled and its focused Hspec suite executed on 2026-09-30: **42 examples, 0 failures** (20 scenario cases and 22 player cases). The boss scaling assertions retain the expected effective 6 health, 4 fight and 4 evade for two attached cats and one investigator. The direct scenario test helper explicitly exits setup before preloading modifiers, matching the native campaign's normal setup completion.

The portable runtime was linked, packaged and signed; live client validation is tracked separately by the runtime owner. The source and compiled artifact hashes must match; an unmodified upstream runtime cannot execute these modules.
