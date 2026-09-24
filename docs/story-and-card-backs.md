# Story and card backs

Story branching was checked against the [official Brethren of Ash campaign guide](https://images-cdn.fantasyflightgames.com/filer_public/f0/22/f022ac7c-9c30-4521-ac16-1f74f00e1d31/ahc100_campaign_guide-web.pdf), pages 2–4, on 24 September 2026. The app uses concise narrative adaptations, not a transcription. The source is deliberately not linked from in-game story screens, to avoid exposing later chapters.

The initial two pages are mandatory for newly created games. `introduction` is optional in version-3 saves, so existing games resume without being reset. `continueIntroduction` includes the expected page to reject stale acknowledgements. Opening hands and their order do not change while reading. Existing games have a read-only replay button.

`scenarioResolution` selects only the reached first-scenario branch. Resolution 1's narrative appears alongside the final victory choice; the finished game displays its own outcome, cause, personal XP, trauma and campaign notes. The existing rules engine remains authoritative for rewards and penalties. No subsequent scenario is added by this change.

## Artwork provenance

Both card backs are cached locally from the public [ArkhamCards repository](https://github.com/zzorba/ArkhamCards). Fantasy Flight Games retains rights to the game artwork.

| Cached file                      | Source                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `public/art/backs/player.png`    | https://raw.githubusercontent.com/zzorba/ArkhamCards/master/assets/player-back.png    |
| `public/art/backs/encounter.png` | https://raw.githubusercontent.com/zzorba/ArkhamCards/master/assets/encounter-back.png |

The two assets were downloaded and visually inspected. Existing two-sided card scans retain the provenance in `card-image-sources.json` and `tabletop-art-sources.json`. Card inspection permits flipping only public reverse faces. Hovering an unexplored location enlarges its unrevealed face, with no front-side rules or statistics.

## Presentation contracts

- A single pointer/focus listener set serves table cards, initial hands, archive cards, piles, commitment and deck lists, and cards inside dialogs. Hovering never dispatches an action or mutates a save.
- Animations use already public state and current resolved-event metadata. Enemy instance IDs distinguish otherwise identical enemies; miniatures use the actual map location. No queue/deck peeking or rules callback occurs during an animation.
- Departing public cards use temporary, inert visual clones. Preference changes, reduced motion, unmount and state changes cancel animations and remove those clones.
- The saved Full/Subtle/Off preference and system reduced motion also govern card flips and action motifs.

Regression entry points: `tests/story-complete.test.ts` and `scripts/story-complete-browser-check.mjs`, plus the existing pacing, discovery/motion, party, refinement and tabletop checks.
