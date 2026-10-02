# Full rules table

Chronicle connects to the separately installed [ArkhamHorror rules engine](https://github.com/halogenandtoast/ArkhamHorror) for its implemented campaigns, investigators, player cards, and decisions. Expanded games use Chronicle's green physical table, existing card faces, typography and token controls. The native engine remains authoritative for payments, choices, scenario layouts, deck upgrades, campaign logs, undo and saved games. The existing Chronicle Core game continues to use its own engine and design.

From this project, run:

```sh
npm run rules:server
```

Keep that terminal process running and choose **Expansions & campaigns** in Chronicle. The bridge defaults to `http://127.0.0.1:5194`. Ctrl+C stops the bridge, the API, and its PostgreSQL instance. Restarting the command reuses saved games.

On macOS Apple Silicon, the first run downloads the official 197 MB [v20260904.1 distribution](https://github.com/halogenandtoast/ArkhamHorror/releases/tag/v20260904.1), checks its SHA-256, and installs the signatures required by the supplied macOS binaries. It does not install Docker, GHC, Homebrew, or a system PostgreSQL service. It does not use the upstream launcher or write to `~/Library/Application Support/ArkhamHorror`.

All runtime files, saved games, private generated local-account credentials, and logs live in the ignored `output/rules-server/` directory. Keep that directory when moving or backing up the project. Credentials have private filesystem permissions, are never written into tracked source, and are not printed. The local account is generated automatically and has access to the engine's beta content.

The download is pinned to:

```text
Archive: ArkhamHorror-macos-arm64-v20260904.1.tar.gz
SHA-256: 29061cbdb683cc7b98f56fc45cb64fbc3762e5a21796406c429a936033bacf39
Bundled frontend source_hash:
dd6603268865bbb739fc6d2ef3114028c52bd528813b010d418b79e26c27ec45
```

The distribution's `setup.sql` omits three database migrations required by its executable. The Chronicle launcher downloads `arkham_epic`, `arkham_game_undo_floors`, and `arkham_achievements` from the same pinned release, verifies their individual hashes, and applies them idempotently to its own database. This fixes saved-game listing and enables campaign achievements. It does not alter existing databases or engine source.

The live registry in this release returns 6,263 card definitions, including Core 2026, the 2026 investigator decks, and Children of Blood. Chronicle uses live codes, art codes, and declared aliases when checking a preconstructed deck, then submits it to the engine's validation endpoint before import. This is broad rules support, not certification of every interaction. Card-browser registry counts cannot be equated with the 6,109 imported catalog records: reverse faces, story cards, mini cards, keys, and reprints are represented differently.

**Barkham Horror is absent from the base release.** The separately built original
Chronicle extension adds its 57 full cards and five investigators. The signed
derived executable returns 6,322 definitions; 42 focused Haskell examples and
five real setup/action/persistence checks pass. Kate's Sniffed marker and Duke's
five Treats are verified on the rendered saved table. Runtime manifests bind
the binary, original extension sources and companion frontend. Unsupported
deck imports still fail explicitly. The Drowned City and several standalone scenarios retain upstream beta status; Children of Blood retains alpha status. Those limitations are displayed when connecting. Registration is distinct from behavioral certification.

Live integration checks created, resumed, and took a legal resource action with Nathaniel Cho in The Gathering, Joe Diamond 2026 in Spreading Flames, André Patel in Extracurricular Activity, and Nathaniel Cho in River of Blood. Each gained one resource and spent one action; state survived refetch. `output/rules-server/integration-proof.json` records the local game IDs and before/after values without credentials.

River of Blood's 13 scenario-card image requests, including exact location backs, acts, and agendas, also decoded successfully from the upstream CDN. The visual proof is `output/expanded-play/02-real-saved-game-loaded.png`; `output/expanded-play/artwork-proof.json` records the exact URLs and decoded image sizes. Browser captures should wait for card images to finish loading and decoding because scenario art can arrive after the investigator portrait.

The bridge listens only on `127.0.0.1`. It validates the Host header and accepts cross-origin requests from HTTP loopback origins and the exact published origin `https://arkham-lcg.vercel.app`. Expanded gameplay uses its original `/chronicle/play` adapter; local account credentials stay at the bridge. Epic seats remain bound to one game. `/chronicle/open` is retained for the independently installed deck editor. All gameplay decisions and campaign setup use Chronicle's own client.

The published static Vercel client connects to this independently running local service. The browser may ask for local-network access. Start `npm run rules:server` on the same Mac before connecting; the deployment does not host PostgreSQL or the native executable. Card images that are not bundled use ArkhamDB or the exact published rules asset host and need internet access. Failed image requests retain readable card faces.

Ports and paths can be configured for local development:

```sh
ARKHAM_RULES_PORT=5294 ARKHAM_RULES_API_PORT=5295 ARKHAM_RULES_PG_PORT=5296 npm run rules:server
VITE_ARKHAM_RULES_URL=http://127.0.0.1:5294 npm run dev
```

Restart the Vite process after changing `VITE_ARKHAM_RULES_URL`. `ARKHAM_RULES_DATA_DIR` changes the local storage directory. `ARKHAM_RULES_RUNTIME` can point to a separately unpacked compatible distribution's `game` directory. An explicit runtime override or `ARKHAM_RULES_API_URL` for an existing loopback API is reported as an unverified custom release and does not claim the pinned archive's identity. Automatic installation currently supports macOS ARM64; other platforms need a compatible upstream distribution and their own verified runtime setup.

Chronicle's launcher and bridge are original code. The upstream executable, frontend, and required database migrations remain separately downloaded runtime files. No upstream engine source is copied into Chronicle's tracked application.

The three-group Epic lobby creates separate private local seats, preserving each
seat's hand and native decision checkpoints. Its create button only unlocks
when the installed executable manifest declares the matching extension. The
Labyrinth and Machinations require their compiled original extensions;
authored source alone does not unlock those modes. Build the complete aggregate
with `node scripts/build-rules-runtime.mjs --with-epic-machinations --test`.
