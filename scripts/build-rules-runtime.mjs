#!/usr/bin/env node
// Original build orchestration. Upstream sources and build caches stay outside Git.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { verifyDerivedRuntime } from "./rules-runtime-manifest.mjs";
import { createBuildSpaceGuard, runWithBuildSpace } from "./rules-build-space.mjs";
import { nativeTestEnvironment } from "./rules-native-test-environment.mjs";
import { postgresConfigureEnvironment, postgresSnprintfSource } from "./rules-native-postgres.mjs";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const upstreamRevision = "03a7f1e74925744f021f6e8fe0e39945d2c3a833";
const linuxNative = process.platform === "linux" && process.arch === "x64";
const supportedNativePlatform = linuxNative || (process.platform === "darwin" && process.arch === "arm64");
const buildPlatform = linuxNative ? "x86_64-linux" : "aarch64-osx";
const temporaryRoot = linuxNative ? "/tmp" : "/private/tmp";
const source = resolve(
  process.env.ARKHAM_RULES_SOURCE || `${temporaryRoot}/arkham-upstream-research`,
);
const toolchain = resolve(
  process.env.ARKHAM_RULES_TOOLCHAIN || `${temporaryRoot}/arkham-build-toolchain`,
);
const extension = resolve(project, "rules/extensions/barkham");
const withEpicMachinations = process.argv.includes("--with-epic-machinations");
const withEpicLabyrinth = process.argv.includes("--with-epic-labyrinth") || withEpicMachinations;
const selectedExtensions = [
  "barkham",
  ...(withEpicLabyrinth ? ["epic-labyrinth"] : []),
  ...(withEpicMachinations ? ["epic-machinations"] : []),
];
const testDriver = resolve(
  project,
  withEpicMachinations
    ? "rules/tests/ChronicleFullSpec.hs"
    : withEpicLabyrinth
    ? "rules/tests/ChronicleSpec.hs"
    : "rules/tests/BarkhamSpec.hs",
);
const behaviorProofPath = resolve(
  project,
  "output/rules-server",
  withEpicLabyrinth
    ? "rules-behavior-tests.json"
    : "barkham-behavior-tests.json",
);
const baseRuntime = resolve(
  process.env.ARKHAM_RULES_BASE_RUNTIME ||
    resolve(project, "output/rules-server/runtime/game"),
);
const buildFrontend = resolve(
  process.env.ARKHAM_RULES_BUILD_FRONTEND_DIR || resolve(source, "frontend"),
);
const installedRuntime = resolve(
  project,
  "output/rules-server/derived-runtime/game",
);
const runtimeCandidate = resolve(
  dirname(installedRuntime),
  `.candidate-${process.pid}`,
);
const bootstrapOnly = process.argv.includes("--bootstrap-only");
const mode = bootstrapOnly
  ? "bootstrap"
  : process.argv.includes("--stage")
  ? "stage"
  : process.argv.includes("--dependencies")
    ? "dependencies"
    : process.argv.includes("--test-dependencies")
      ? "test-dependencies"
      : "build";
const dependencyOnly = mode === "dependencies" || mode === "test-dependencies";
const coordinatorTests = process.argv.includes("--coordinator-tests");
const compileOnly = process.argv.includes("--compile-only") || coordinatorTests;
const coordinatorProofPath = resolve(project, "output/rules-server/rules-coordinator-tests.json");
const testBuilt = process.argv.includes("--test-built");
const incrementalNative = process.argv.includes("--incremental-native");
const configureOnly = process.argv.includes("--configure-only");
const directObjects = process.argv.includes("--direct-objects");
const nativeObjectsOnly = process.argv.includes("--native-objects-only");
const linkObjects = process.argv.includes("--link-objects");
const compactBuild = process.argv.includes("--compact-build");
const prepareOnly = process.argv.includes("--prepare-only");
const publishCandidateIndex = process.argv.indexOf("--publish-candidate");
const verifyBarkham = process.argv.includes("--test") || testBuilt;
const packageBuilt = process.argv.includes("--package-built");
const buildInputPath = resolve(
  project,
  "output/rules-server/rules-build-input.json",
);
const buildOutput = resolve(
  source,
  `backend/arkham-api/.chronicle-stack-work/dist/${buildPlatform}/ghc-9.14.1/build`,
);
const compilerHeap = process.env.ARKHAM_RULES_GHC_HEAP || "4G";
if (!/^[1-8]G$/.test(compilerHeap))
  throw new Error("ARKHAM_RULES_GHC_HEAP must be a bounded heap from 1G through 8G.");
const diskReserveGiB = Number(process.env.ARKHAM_RULES_DISK_RESERVE_GIB || "1");
const requireBuildSpace = createBuildSpaceGuard([project, source, toolchain], diskReserveGiB);
const mainGhcOptions = `-Wno-missing-home-modules -j2 +RTS -M${compilerHeap} -N1 -A16m -n2m -c -RTS`;
const downloads = resolve(toolchain, "downloads");
const ghcDir = resolve(toolchain, "ghc");
const stack = resolve(toolchain, `stack-bin/stack-3.11.1-${linuxNative ? "linux-x86_64" : "osx-aarch64"}/stack`);
const backend = resolve(source, "backend");
const env = {
  ...process.env,
  STACK_ROOT: resolve(toolchain, "stack-root"),
  STACK_WORK: ".chronicle-stack-work",
  XDG_CACHE_HOME: resolve(toolchain, "cache"),
  XDG_CONFIG_HOME: resolve(toolchain, "config"),
  ARKHAM_RULES_SOURCE: source,
  ...(linuxNative ? {
    TMPDIR: resolve(toolchain, "tmp"),
    LD_LIBRARY_PATH: [resolve(toolchain, "postgres/lib"), process.env.LD_LIBRARY_PATH]
      .filter(Boolean).join(":"),
  } : {}),
  PATH: [
    resolve(ghcDir, "bin"),
    dirname(stack),
    resolve(toolchain, "postgres/bin"),
    resolve(toolchain, "pcre/bin"),
    process.env.PATH,
  ]
    .filter(Boolean)
    .join(":"),
  C_INCLUDE_PATH: [
    resolve(toolchain, "postgres/include"),
    resolve(toolchain, "pcre/include"),
    process.env.C_INCLUDE_PATH,
  ]
    .filter(Boolean)
    .join(":"),
  LIBRARY_PATH: [
    resolve(toolchain, "postgres/lib"),
    resolve(toolchain, "pcre/lib"),
    resolve(baseRuntime, "lib"),
    process.env.LIBRARY_PATH,
  ]
    .filter(Boolean)
    .join(":"),
  PKG_CONFIG_PATH: [
    resolve(toolchain, "postgres/lib/pkgconfig"),
    resolve(toolchain, "pcre/lib/pkgconfig"),
    process.env.PKG_CONFIG_PATH,
  ]
    .filter(Boolean)
    .join(":"),
};
const sources = {
  ghc: {
    url: `https://downloads.haskell.org/~ghc/9.14.1/ghc-9.14.1-${linuxNative ? "x86_64-deb12-linux" : "aarch64-apple-darwin"}.tar.xz`,
    sha256: linuxNative
      ? "60f7ab75f28df892729fbaff3a54f58ee3ad7e731929f1b2f3eb0208f73de841"
      : "841591f152085be605616682779341847d24fd56bd6d22ca61bb37ee32b50681",
    path: resolve(downloads, "ghc.tar.xz"),
  },
  stack: {
    url: `https://github.com/commercialhaskell/stack/releases/download/v3.11.1/stack-3.11.1-${linuxNative ? "linux-x86_64" : "osx-aarch64"}.tar.gz`,
    sha256: linuxNative
      ? "1fda71e657cd8d355625cc66b61b352699279dfee2664c014a392163bd19a952"
      : "652572ddf74616a7975892de9c61a9e5e6b5979db4f9b00fcd659ac6a15d7330",
    path: resolve(downloads, "stack.tar.gz"),
  },
  postgres: {
    url: "https://ftp.postgresql.org/pub/source/v14.15/postgresql-14.15.tar.bz2",
    sha256: "02e891e314b4e9ee24cbd78028dab7c73f9c1ba3e30835bcbef71fe220401fc5",
    path: resolve(downloads, "postgres.tar.bz2"),
  },
  pcre: {
    url: "https://downloads.sourceforge.net/project/pcre/pcre/8.45/pcre-8.45.tar.bz2",
    sha256: "4dae6fdcd2bb0bb6c37b5f97c33c2be954da743985369cddac3546e3218bffb8",
    path: resolve(downloads, "pcre.tar.bz2"),
  },
};

// These small, original patches extend the upstream open content registration
// seam. Exact anchors intentionally fail if a future upstream revision differs.
const patches = [
  [
    "arkham-api/package.yaml",
    "tests:\n  spec:",
    `tests:
  barkham-spec:
    main: BarkhamSpec.hs
    source-dirs:
      - chronicle-tests
      - tests
    other-modules:
      - Arkham.Homebrew.Barkham.PlayersSpec
      - Arkham.Homebrew.Barkham.ScenarioSpec
      - Helpers.Message
      - TestImport
      - TestImport.Lifted
      - TestImport.New
    ghc-options: -threaded -rtsopts -O0 "-with-rtsopts=-N2"
    dependencies:
      - arkham-api
      - aeson
      - aeson-diff
      - exceptions
      - hspec
      - hspec-expectations-lifted
      - lens
      - uuid
      - mtl
      - random
      - containers
      - text
  spec:`,
  ],
  [
    "arkham-api/library/Arkham/Homebrew/Types.hs",
    "import Arkham.Enemy.Types (SomeEnemyCard)",
    "import Arkham.Enemy.Types (SomeEnemyCard)\nimport Arkham.Event.Types (SomeEventCard)\nimport Arkham.Investigator.Types (SomeInvestigatorCard)",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/Types.hs",
    "  { acts :: [SomeActCard]",
    "  { investigators :: [SomeInvestigatorCard]\n  , events :: [SomeEventCard]\n  , acts :: [SomeActCard]",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/Types.hs",
    "      { acts = a.acts <> b.acts",
    "      { investigators = a.investigators <> b.investigators\n      , events = a.events <> b.events\n      , acts = a.acts <> b.acts",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/Types.hs",
    "  mempty = HomebrewContent [] [] [] [] [] [] [] [] [] []",
    "  mempty = HomebrewContent [] [] [] [] [] [] [] [] [] [] [] []",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/Registry.hs",
    "import Arkham.Enemy.Types (SomeEnemyCard)",
    "import Arkham.Enemy.Types (SomeEnemyCard)\nimport Arkham.Event.Types (SomeEventCard)\nimport Arkham.Investigator.Types (SomeInvestigatorCard)",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/Registry.hs",
    "acts :: [SomeActCard]",
    "investigators :: [SomeInvestigatorCard]\ninvestigators = allHomebrewContent.investigators\n\nevents :: [SomeEventCard]\nevents = allHomebrewContent.events\n\nacts :: [SomeActCard]",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/CardRegistry.hs",
    "import Arkham.Enemy.Types (EnemyCard, IsEnemy, SomeEnemyCard (..))",
    "import Arkham.Enemy.Types (EnemyCard, IsEnemy, SomeEnemyCard (..))\nimport Arkham.Event.Types (EventCard, IsEvent, SomeEventCard (..))\nimport Arkham.Investigator.Types (InvestigatorCard, IsInvestigator, SomeInvestigatorCard (..))",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/CardRegistry.hs",
    "actContent :: IsAct a => ActCard a -> HomebrewContent",
    "investigatorContent :: IsInvestigator a => InvestigatorCard a -> HomebrewContent\ninvestigatorContent card = mempty {investigators = [SomeInvestigatorCard card]}\n\neventContent :: IsEvent a => EventCard a -> HomebrewContent\neventContent card = mempty {events = [SomeEventCard card]}\n\nactContent :: IsAct a => ActCard a -> HomebrewContent",
  ],
  [
    "cards-discover/library/Cards/Discover/Exe.hs",
    '            "ActCard" -> Just "actContent"',
    '            "InvestigatorCard" -> Just "investigatorContent"\n            "EventCard" -> Just "eventContent"\n            "ActCard" -> Just "actContent"',
  ],
  [
    "arkham-api/library/Arkham/Investigator.hs",
    "import Arkham.Id",
    "import Arkham.Homebrew.Registry qualified as Registry\nimport Arkham.Id",
  ],
  [
    "arkham-api/library/Arkham/Investigator.hs",
    "allInvestigators =\n  mapFromList",
    "allInvestigators =\n  (mapFromList (concatMap someInvestigatorCardCodes Registry.investigators) <>)\n    $ mapFromList",
  ],
  [
    "arkham-api/library/Arkham/Event.hs",
    "import Arkham.Event.Runner",
    "import Arkham.Event.Runner\nimport Arkham.Homebrew.Registry qualified as Registry",
  ],
  [
    "arkham-api/library/Arkham/Event.hs",
    "allEvents =\n  mapFromList",
    "allEvents =\n  (mapFromList (concatMap someEventCardCodes Registry.events) <>)\n    $ mapFromList",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/DefsBase.hs",
    "  { hdLocations :: [CardDef]",
    "  { hdInvestigators :: [CardDef]\n  , hdPlayerEvents :: [CardDef]\n  , hdPlayerEnemies :: [CardDef]\n  , hdLocations :: [CardDef]",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/DefsBase.hs",
    "      { hdLocations = hdLocations a <> hdLocations b",
    "      { hdInvestigators = hdInvestigators a <> hdInvestigators b\n      , hdPlayerEvents = hdPlayerEvents a <> hdPlayerEvents b\n      , hdPlayerEnemies = hdPlayerEnemies a <> hdPlayerEnemies b\n      , hdLocations = hdLocations a <> hdLocations b",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/DefsBase.hs",
    "  mempty = HomebrewDefs [] [] [] [] [] [] [] [] [] [] [] [] [] []",
    "  mempty = HomebrewDefs [] [] [] [] [] [] [] [] [] [] [] [] [] [] [] [] []",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/DefsBase.hs",
    "    LocationType -> mempty {hdLocations = [def]}",
    "    InvestigatorType -> mempty {hdInvestigators = [def]}\n    EventType -> mempty {hdPlayerEvents = [def]}\n    PlayerEnemyType -> mempty {hdPlayerEnemies = [def]}\n    LocationType -> mempty {hdLocations = [def]}",
  ],
  [
    "arkham-api/library/Arkham/Homebrew/Defs.hs",
    "locationsMap :: Map CardCode CardDef",
    "investigatorsMap :: Map CardCode CardDef\ninvestigatorsMap = defMap hdInvestigators\n\nplayerEventsMap :: Map CardCode CardDef\nplayerEventsMap = defMap hdPlayerEvents\n\nplayerEnemiesMap :: Map CardCode CardDef\nplayerEnemiesMap = defMap hdPlayerEnemies\n\nlocationsMap :: Map CardCode CardDef",
  ],
  [
    "arkham-api/library/Arkham/Investigator/Cards.hs",
    "import Arkham.EncounterSet",
    "import Arkham.EncounterSet\nimport Arkham.Homebrew.Defs qualified as Homebrew",
  ],
  [
    "arkham-api/library/Arkham/Investigator/Cards.hs",
    "allInvestigatorCards =\n  mapFromList",
    "allInvestigatorCards =\n  (Homebrew.investigatorsMap <>)\n    $ mapFromList",
  ],
  [
    "arkham-api/library/Arkham/Event/Cards.hs",
    "import Arkham.Card.CardDef",
    "import Arkham.Card.CardDef\nimport Arkham.Homebrew.Defs qualified as Homebrew",
  ],
  [
    "arkham-api/library/Arkham/Event/Cards.hs",
    "allPlayerEventCards =\n  mapFromList",
    "allPlayerEventCards =\n  (Homebrew.playerEventsMap <>)\n    $ mapFromList",
  ],
  [
    "arkham-api/library/Arkham/Enemy/Cards.hs",
    "import Arkham.Homebrew.Defs qualified as Homebrew",
    "import Arkham.Homebrew.Defs qualified as Homebrew\nimport Data.Map.Strict qualified as Map",
  ],
  [
    "arkham-api/library/Arkham/Enemy/Cards.hs",
    "allPlayerEnemyCards =\n  mapFromList",
    "allPlayerEnemyCards =\n  ((Homebrew.playerEnemiesMap <> Map.filter (isJust . cdCardSubType) Homebrew.enemiesMap) <>)\n    $ mapFromList",
    [
      "allPlayerEnemyCards =\n  (Homebrew.playerEnemiesMap <> filter (isJust . cdCardSubType) Homebrew.enemiesMap <>)\n    $ mapFromList",
      "allPlayerEnemyCards =\n  ((Homebrew.playerEnemiesMap <> filter (isJust . cdCardSubType) Homebrew.enemiesMap) <>)\n    $ mapFromList",
    ],
  ],
  [
    "arkham-api/library/Arkham/Enemy/Cards.hs",
    "  (Homebrew.enemiesMap <>)",
    "  (Map.filter (isNothing . cdCardSubType) Homebrew.enemiesMap <>)",
    "  (filter (isNothing . cdCardSubType) Homebrew.enemiesMap <>)",
  ],
];
const extensionPatchFile = resolve(extension, "server-seams.json");
if (await exists(extensionPatchFile)) {
  const extraPatches = JSON.parse(await readFile(extensionPatchFile, "utf8"));
  if (
    !Array.isArray(extraPatches) ||
    !extraPatches.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 3 &&
        entry.every((part) => typeof part === "string") &&
        entry[0] === "arkham-api/library/Entity/Answer.hs",
    )
  )
    throw new Error("Invalid original extension registration patches.");
  patches.push(...extraPatches);
}
const barkhamPatches = [...patches];
if (withEpicLabyrinth) {
  patches.push([
    "arkham-api/package.yaml",
    "      - Arkham.Homebrew.Barkham.ScenarioSpec\n      - Helpers.Message",
    "      - Arkham.Homebrew.Barkham.ScenarioSpec\n      - Arkham.Homebrew.EpicLabyrinth.CoordinatorSpec\n      - Arkham.Homebrew.EpicLabyrinth.StoriesSpec\n      - Arkham.Homebrew.EpicLabyrinth.CardsSpec\n      - Arkham.Homebrew.EpicLabyrinth.PublicViewSpec\n      - Arkham.Homebrew.EpicLabyrinth.TransferSpec\n      - Helpers.Message",
  ]);
}
if (withEpicMachinations) {
  // A newly discovered non-orphan instance behind DefsEntries does not change
  // that aggregator's exports. Make it a direct TH dependency so GHC cannot
  // reuse an earlier allHomebrewDefs splice that omitted this campaign.
  patches.push([
    "arkham-api/library/Arkham/Homebrew/Defs.hs",
    "import Arkham.Homebrew.DefsEntries ()",
    "import Arkham.Homebrew.DefsEntries ()\nimport Arkham.Homebrew.EpicMachinations.Defs ()",
  ]);
  patches.push([
    "arkham-api/package.yaml",
    "      - Arkham.Homebrew.EpicLabyrinth.TransferSpec\n      - Helpers.Message",
    "      - Arkham.Homebrew.EpicLabyrinth.TransferSpec\n      - Arkham.Homebrew.EpicMachinations.CoordinatorSpec\n      - Arkham.Homebrew.EpicMachinations.ScenarioSpec\n      - Arkham.Homebrew.EpicMachinations.EntitiesSpec\n      - Arkham.Homebrew.EpicMachinations.TransportSpec\n      - Arkham.Homebrew.EpicMachinations.TransactionsSpec\n      - Arkham.Homebrew.EpicMachinations.NobleLegacySpec\n      - Helpers.Message",
  ]);
}
for (const id of selectedExtensions.slice(1)) {
  for (const name of ["native-seams.json", "server-seams.json", "public-view-seams.json"]) {
    const patchPath = resolve(project, "rules/extensions", id, name);
    if (name === "public-view-seams.json" && !(await exists(patchPath))) continue;
    const extra = JSON.parse(
      await readFile(
        patchPath,
        "utf8",
      ),
    );
    if (
      !Array.isArray(extra) ||
      !extra.every(
        (entry) =>
          Array.isArray(entry) &&
          (entry.length === 3 ||
            (entry.length === 4 &&
              entry[3] &&
              typeof entry[3] === "object" &&
              !Array.isArray(entry[3]) &&
              Object.keys(entry[3]).length === 1 &&
              Number.isInteger(entry[3].occurrences) &&
              entry[3].occurrences >= 1 &&
              entry[3].occurrences <= 100)) &&
          entry.slice(0, 3).every((part) => typeof part === "string") &&
          /^arkham-api\/library\/[A-Za-z0-9/]+\.hs$/.test(entry[0]),
      )
    )
      throw new Error(`Invalid original Epic patch contract: ${name}.`);
    patches.push(...extra);
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function run(command, args, options = {}) {
  return runWithBuildSpace(command, args, {
    cwd: backend,
    env,
    stdio: "inherit",
    ...options,
  }, requireBuildSpace);
}
async function capture(command, args, cwd = backend, trim = true, childEnv = env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolvePromise(trim ? output.trim() : output)
        : reject(new Error(output || `${command} failed (${code}).`)),
    );
  });
}
async function download(item) {
  await requireBuildSpace();
  if ((await exists(item.path)) && (await sha256(item.path)) === item.sha256)
    return;
  console.log(`Downloading ${new URL(item.url).pathname.split("/").at(-1)}.`);
  if (linuxNative) {
    // curl honors the proxy configuration of isolated Linux build workers.
    // The build-space guard also monitors these comparatively large downloads.
    await run("curl", ["--fail", "--location", "--retry", "3", "--output", item.path, item.url], { cwd: downloads });
    await chmod(item.path, 0o600);
  } else {
    const response = await fetch(item.url);
    if (!response.ok || !response.body)
      throw new Error(`Download failed (${response.status}).`);
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(item.path, { mode: 0o600 }),
    );
  }
  if ((await sha256(item.path)) !== item.sha256)
    throw new Error("Official toolchain archive checksum mismatch.");
}
async function bootstrapSource() {
  if (!(await exists(resolve(source, ".git")))) {
    await mkdir(source, { recursive: true });
    if ((await readdir(source)).length)
      throw new Error(
        "The external source directory is not an empty directory or a Git checkout.",
      );
    await run("git", ["init"], { cwd: source });
    await run(
      "git",
      [
        "remote",
        "add",
        "origin",
        "https://github.com/halogenandtoast/ArkhamHorror.git",
      ],
      { cwd: source },
    );
    await run(
      "git",
      ["fetch", "--depth=1", "--filter=blob:none", "origin", upstreamRevision],
      { cwd: source },
    );
    await run("git", ["checkout", "--detach", "FETCH_HEAD"], { cwd: source });
  }
  const revision = await capture("git", ["rev-parse", "HEAD"], source);
  if (revision !== upstreamRevision)
    throw new Error(
      `Expected upstream source ${upstreamRevision}; got ${revision}.`,
    );
}
async function prepareFrontend() {
  const staging = await capture(process.execPath, [
    resolve(project, "scripts/build-rules-frontend.mjs"),
    "--stage",
  ]);
  const sourceHash = staging.match(/source ([a-f0-9]{64})\./)?.[1];
  if (!sourceHash)
    throw new Error(
      "The original frontend staging did not report its source hash.",
    );
  const builtHash = (
    await readFile(resolve(buildFrontend, "dist/source_hash"), "utf8").catch(
      () => "",
    )
  ).trim();
  if (builtHash !== sourceHash)
    await run(process.execPath, [
      resolve(project, "scripts/build-rules-frontend.mjs"),
    ]);
  if (
    (
      await readFile(resolve(buildFrontend, "dist/source_hash"), "utf8")
    ).trim() !== sourceHash
  )
    throw new Error(
      "The rebuilt frontend does not match the current original extension.",
    );
}
async function bootstrap() {
  if (!supportedNativePlatform)
    throw new Error(
      "Native compilation supports macOS Apple Silicon and Linux x86_64; runtime packaging requires macOS Apple Silicon.",
    );
  if (linuxNative && !bootstrapOnly && !dependencyOnly && !compileOnly)
    throw new Error("Linux native builds require --compile-only; signing, installation and capability manifests require macOS Apple Silicon.");
  if (linuxNative) await mkdir(env.TMPDIR, {recursive: true});
  await mkdir(downloads, { recursive: true });
  if (!(await exists(stack))) {
    await download(sources.stack);
    await mkdir(resolve(toolchain, "stack-bin"), { recursive: true });
    await run("tar", [
      "-xzf",
      sources.stack.path,
      "-C",
      resolve(toolchain, "stack-bin"),
    ], { cwd: toolchain });
  }
  if (!(await exists(resolve(ghcDir, "bin/ghc")))) {
    await download(sources.ghc);
    await mkdir(ghcDir, { recursive: true });
    await run("tar", [
      "-xJf",
      sources.ghc.path,
      "-C",
      ghcDir,
      "--strip-components=1",
      "--exclude=*.p_hi",
      "--exclude=*_p.a",
      "--exclude=*_p-ghc*.dylib",
      "--exclude=*/doc/*",
      "--exclude=*/share/doc/*",
    ], { cwd: toolchain });
  }
  console.log(await capture(resolve(ghcDir, "bin/ghc"), ["--version"], toolchain));
  console.log(await capture(stack, ["--version"], toolchain));
  await mkdir(env.STACK_ROOT, { recursive: true });
  await writeFile(
    resolve(env.STACK_ROOT, "config.yaml"),
    "system-ghc: true\ninstall-ghc: false\nrecommend-stack-upgrade: false\nlocal-bin-path: " +
      resolve(toolchain, "local-bin") +
      "\n",
  );
  if (!(await exists(resolve(toolchain, "postgres/include/libpq-fe.h")))) {
    await download(sources.postgres);
    const pgSource = resolve(toolchain, "postgres-source");
    await mkdir(pgSource, { recursive: true });
    await run("tar", [
      "-xjf",
      sources.postgres.path,
      "-C",
      pgSource,
      "--strip-components=1",
    ], { cwd: toolchain });
    if (process.platform === "darwin") {
      const snprintf = resolve(pgSource, "src/port/snprintf.c");
      await writeFile(snprintf, postgresSnprintfSource(await readFile(snprintf, "utf8")));
    }
    await run(
      "./configure",
      [
        `--prefix=${resolve(toolchain, "postgres")}`,
        "--without-readline",
        "--without-zlib",
      ],
      { cwd: pgSource, env: postgresConfigureEnvironment(env) },
    );
    for (const relative of ["src/interfaces/libpq", "src/bin/pg_config"]) {
      await run("make", ["-C", relative, "-j4"], { cwd: pgSource });
      await run("make", ["-C", relative, "install"], { cwd: pgSource });
    }
    await run("make", ["-C", "src/include", "install"], { cwd: pgSource });
  }
  if (!(await exists(resolve(toolchain, "pcre/include/pcre.h")))) {
    await download(sources.pcre);
    const pcreSource = resolve(toolchain, "pcre-source");
    await mkdir(pcreSource, { recursive: true });
    await run("tar", [
      "-xjf",
      sources.pcre.path,
      "-C",
      pcreSource,
      "--strip-components=1",
    ], { cwd: toolchain });
    await run(
      "./configure",
      [
        `--prefix=${resolve(toolchain, "pcre")}`,
        "--disable-shared",
        "--enable-static",
        "--enable-utf8",
        "--enable-unicode-properties",
      ],
      { cwd: pcreSource },
    );
    await run("make", ["-j4"], { cwd: pcreSource });
    await run("make", ["install"], { cwd: pcreSource });
  }
}
async function patchSource() {
  const revision = await capture("git", ["rev-parse", "HEAD"], source);
  if (revision !== upstreamRevision)
    throw new Error(
      `Expected upstream source ${upstreamRevision}; got ${revision}.`,
    );
  const statePath = resolve(source, ".chronicle-stage-state.json");
  const prior = JSON.parse(await readFile(statePath, "utf8").catch(() => "{}"));
  if (!withEpicMachinations &&
    (prior.extensions?.includes("epic-machinations") ||
      (await exists(resolve(backend, "arkham-api/library/Arkham/Homebrew/EpicMachinations/Content.hs")))))
    throw new Error("This private checkout contains Epic Machinations. Use --with-epic-machinations, or a fresh pinned checkout, so the manifest matches all compiled extensions.");
  if (
    !withEpicLabyrinth &&
    (prior.extensions?.includes("epic-labyrinth") ||
      (await exists(
        resolve(
          backend,
          "arkham-api/library/Arkham/Homebrew/EpicLabyrinth/Content.hs",
        ),
      )))
  )
    throw new Error(
      "This private checkout contains Epic Labyrinth. Use --with-epic-labyrinth, or a fresh pinned checkout, so the manifest matches all compiled extensions.",
    );
  const staged = {
    upstreamRevision,
    extensions: selectedExtensions,
    files: {},
  };
  const compose = (original, operations, relative) =>
    operations.reduce((contents, [, before, after, previous]) => {
      const bounded =
        previous && typeof previous === "object" && !Array.isArray(previous);
      const expected = bounded ? previous.occurrences : 1;
      const anchor = [
        before,
        ...(bounded ? [] : Array.isArray(previous) ? previous : [previous]),
      ].find(
        (candidate) =>
          typeof candidate === "string" &&
          candidate &&
          contents.includes(candidate),
      );
      const found = anchor ? contents.split(anchor).length - 1 : 0;
      if (!anchor || found !== expected)
        throw new Error(
          `Registration patch anchor differs: ${relative} (expected ${expected}, found ${found}).`,
        );
      return contents.split(anchor).join(after);
    }, original);
  for (const relative of [...new Set(patches.map(([path]) => path))]) {
    const path = resolve(backend, relative);
    const contents = await readFile(path, "utf8");
    const original = await capture(
      "git",
      ["show", `${upstreamRevision}:backend/${relative}`],
      source,
      false,
    );
    const desired = compose(
      original,
      patches.filter(([name]) => name === relative),
      relative,
    );
    const barkham = compose(
      original,
      barkhamPatches.filter(([name]) => name === relative),
      relative,
    );
    const currentSha = createHash("sha256").update(contents).digest("hex");
    if (
      contents !== original &&
      contents !== desired &&
      contents !== barkham &&
      (prior.upstreamRevision !== upstreamRevision ||
        prior.files?.[relative] !== currentSha)
    )
      throw new Error(
        `Private build source has unrecognized edits: ${relative}.`,
      );
    if (contents !== desired) await writeFile(path, desired);
    staged.files[relative] = createHash("sha256").update(desired).digest("hex");
  }
  await writeFile(statePath, JSON.stringify(staged, null, 2) + "\n", {
    mode: 0o600,
  });
}
async function directoryHash(extensionPath) {
  const entries = [];
  async function visit(directory, prefix = "") {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix + entry.name;
      if (entry.isDirectory())
        await visit(resolve(directory, entry.name), relative + "/");
      else if (entry.isFile())
        entries.push([relative, await sha256(resolve(directory, entry.name))]);
    }
  }
  await visit(extensionPath);
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}
async function extensionHashes() {
  return Object.fromEntries(
    await Promise.all(
      selectedExtensions.map(async (id) => [
        id,
        await directoryHash(resolve(project, "rules/extensions", id)),
      ]),
    ),
  );
}
async function extensionHash() {
  const hashes = await extensionHashes();
  return selectedExtensions.length === 1
    ? hashes.barkham
    : createHash("sha256")
        .update(
          JSON.stringify(selectedExtensions.map((id) => [id, hashes[id]])),
        )
        .digest("hex");
}
async function stage() {
  await patchSource();
  if (
    !(await exists(
      resolve(extension, "backend/Arkham/Homebrew/Barkham/Content.hs"),
    ))
  )
    throw new Error(
      "The original Barkham extension has not been authored yet.",
    );
  async function copyChangedTree(from, to) {
    await mkdir(to, { recursive: true });
    for (const entry of await readdir(from, { withFileTypes: true })) {
      const original = resolve(from, entry.name),
        target = resolve(to, entry.name);
      if (entry.isDirectory()) await copyChangedTree(original, target);
      else if (
        !(await exists(target)) ||
        (await sha256(original)) !== (await sha256(target))
      )
        await copyFile(original, target);
    }
  }
  await copyChangedTree(
    resolve(extension, "backend/Arkham/Homebrew/Barkham"),
    resolve(backend, "arkham-api/library/Arkham/Homebrew/Barkham"),
  );
  const extensionTests = resolve(extension, "tests/Arkham/Homebrew/Barkham");
  if (await exists(extensionTests))
    await copyChangedTree(
      extensionTests,
      resolve(backend, "arkham-api/tests/Arkham/Homebrew/Barkham"),
    );
  for (const id of selectedExtensions.slice(1)) {
    // Explicit opt-in is used only after the root freezes the API/transfer batch.
    // Copying the whole original backend subtree retains SOURCE .hs-boot files.
    const epic = resolve(project, "rules/extensions", id);
    await copyChangedTree(
      resolve(epic, "backend"),
      resolve(backend, "arkham-api/library"),
    );
    await copyChangedTree(
      resolve(epic, "tests"),
      resolve(backend, "arkham-api/tests"),
    );
  }
  await mkdir(resolve(backend, "arkham-api/chronicle-tests"), {
    recursive: true,
  });
  const testMain = testDriver;
  const stagedMain = resolve(
    backend,
    "arkham-api/chronicle-tests/BarkhamSpec.hs",
  );
  if (
    !(await exists(stagedMain)) ||
    (await sha256(testMain)) !== (await sha256(stagedMain))
  )
    await copyFile(testMain, stagedMain);
  console.log(
    `Staged original ${selectedExtensions.join(" + ")} modules and registration seams.`,
  );
}
async function build() {
  if (coordinatorTests)
    await rm(coordinatorProofPath, { force: true });
  else if (compileOnly && !dependencyOnly)
    await rm(resolve(project, "output/rules-server/rules-native-check.json"), { force: true });
  if (verifyBarkham && !dependencyOnly && !compileOnly)
    await rm(behaviorProofPath, {
      force: true,
    });
  if (!dependencyOnly && !compileOnly) {
    for (const relative of [
      "lib/libpq.5.dylib",
      "pgsql/bin/pg_ctl",
      "pgsql/bin/psql",
      "data/setup.sql",
      "frontend/dist/source_hash",
    ]) {
      if (!(await exists(resolve(baseRuntime, relative))))
        throw new Error(
          `The base rules distribution is missing ${relative}. Start npm run rules:server once to install it before building.`,
        );
    }
    if (
      (
        await readFile(
          resolve(baseRuntime, "frontend/dist/source_hash"),
          "utf8",
        )
      ).trim() !==
      "dd6603268865bbb739fc6d2ef3114028c52bd528813b010d418b79e26c27ec45"
    )
      throw new Error(
        "The base rules distribution does not match the pinned v20260904.1 release.",
      );
  }
  await bootstrap();
  if (coordinatorTests) {
    await stage();
    await runCoordinatorTests();
    return;
  }
  if (testBuilt || incrementalNative) {
    if (!compileOnly) await prepareFrontend();
    await stage();
    const buildSourceHash = await extensionHash();
    const binary = resolve(buildOutput, "arkham-api/arkham-api");
    if (testBuilt) await verifyLinkedInput(binary);
    await writeBuildInput(buildSourceHash);
    if (testBuilt && directObjects) {
      await loadNativeObjects();
      await compileNativeComponent("test-suite barkham-spec", "barkham-spec", "BarkhamSpec.hs");
    } else if (testBuilt) await compileFocusedTests();
    else {
      // Refresh Hpack's exposed modules and the existing Cabal configuration
      // without building/installing libraries. New SOURCE boot modules and API
      // adapters must be in the actual engine component and focused suite.
      await run(stack, [
        "build",
        "arkham-api:exe:arkham-api",
        ...(verifyBarkham
          ? ["arkham-api:test:barkham-spec", "--no-run-tests"]
          : []),
        "--only-configure",
        "--fast",
        "--no-haddock",
        "--no-library-profiling",
        "--no-executable-profiling",
        "--jobs=2",
        `--ghc-options=${mainGhcOptions}`,
        `--extra-include-dirs=${resolve(toolchain, "postgres/include")}`,
        `--extra-lib-dirs=${resolve(toolchain, "postgres/lib")}`,
        `--extra-include-dirs=${resolve(toolchain, "pcre/include")}`,
        `--extra-lib-dirs=${resolve(toolchain, "pcre/lib")}`,
      ]);
      if (configureOnly) {
        console.log("Configured the selected original native components; compiler and runtime packaging were not started.");
        return;
      }
      const helperDirectory = resolve(
        toolchain,
        `stack-root/setup-exe-cache/${buildPlatform}`,
      );
      const helpers = (await readdir(helperDirectory)).filter((name) =>
        /^Cabal-simple_.+_3\.16\.0\.0_ghc-9\.14\.1$/.test(name),
      );
      if (helpers.length !== 1)
        throw new Error("The configured private Cabal helper was not found.");
      if (directObjects) {
        if (linkObjects) await loadNativeObjects();
        else await compileNativeObjects(resolve(helperDirectory, helpers[0]));
        if (nativeObjectsOnly) {
          console.log("Compiled the complete selected native library/API component; executable linking, focused tests and runtime packaging remain pending.");
          return;
        }
        await compileNativeComponent("executable arkham-api", "arkham-api", "main.hs");
        if (compactBuild) await stripPrivateNativeEngine(binary, buildSourceHash);
        if (verifyBarkham)
          await compileNativeComponent("test-suite barkham-spec", "barkham-spec", "BarkhamSpec.hs");
      } else await run(
        resolve(helperDirectory, helpers[0]),
        [
          "--verbose=1",
          `--builddir=${dirname(buildOutput)}`,
          "build",
          "exe:arkham-api",
          ...(verifyBarkham ? ["test:barkham-spec"] : []),
        ],
        { cwd: resolve(backend, "arkham-api") },
      );
    }
    await verifyLinkedInput(binary);
    await packageRuntime(binary, buildSourceHash);
    return;
  }
  if (packageBuilt) {
    const input = JSON.parse(await readFile(buildInputPath, "utf8"));
    if (
      input.schema !== 1 ||
      input.upstreamRevision !== upstreamRevision ||
      input.extensionSourceSha256 !== (await extensionHash())
    )
      throw new Error(
        "The original source does not match the captured build input.",
      );
    await prepareFrontend();
    const binary = resolve(buildOutput, "arkham-api/arkham-api");
    await verifyLinkedInput(binary);
    await packageRuntime(binary, input.extensionSourceSha256);
    return;
  }
  let buildSourceHash;
  // Profiling and Haddock are deliberately disabled: this machine has a small
  // disk budget and the runtime needs neither. Stack owns all caches in /tmp.
  const args = [
    "build",
    mode === "test-dependencies"
      ? "arkham-api:test:barkham-spec"
      : "arkham-api:exe:arkham-api",
    "--fast",
    "--no-haddock",
    "--no-library-profiling",
    "--no-executable-profiling",
    "--jobs=2",
    `--ghc-options=${mainGhcOptions}`,
  ];
  // Compile the focused suite in the same Cabal configuration as the engine.
  // Enabling it only after packaging would link the large library a second time.
  if (verifyBarkham && !dependencyOnly)
    args.push("arkham-api:test:barkham-spec", "--no-run-tests");
  if (await exists(resolve(toolchain, "postgres/include/libpq-fe.h"))) {
    args.push(
      `--extra-include-dirs=${resolve(toolchain, "postgres/include")}`,
      `--extra-lib-dirs=${resolve(toolchain, "postgres/lib")}`,
    );
  }
  args.push(
    `--extra-include-dirs=${resolve(toolchain, "pcre/include")}`,
    `--extra-lib-dirs=${resolve(toolchain, "pcre/lib")}`,
  );
  if (dependencyOnly) {
    if (mode === "test-dependencies") await stage();
    args.push("--only-dependencies");
  } else {
    if (!compileOnly) await prepareFrontend();
    await stage();
    buildSourceHash = await extensionHash();
    await writeBuildInput(buildSourceHash);
  }
  await run(stack, args);
  if (dependencyOnly) return;
  if ((await extensionHash()) !== buildSourceHash)
    throw new Error(
      "The original extension changed during compilation. Rerun the incremental build to package matching source.",
    );
  const binary = resolve(buildOutput, "arkham-api/arkham-api");
  await verifyLinkedInput(binary);
  await packageRuntime(binary, buildSourceHash);
}
function cabalFields(cabal, heading) {
  const start = cabal.indexOf(`${heading}\n`);
  if (start < 0) throw new Error(`Missing configured Cabal component: ${heading}.`);
  const body = cabal.slice(start + heading.length + 1).split(/\n(?=\S)/, 1)[0];
  const fields = {};
  let key;
  for (const line of body.split("\n")) {
    if (/^  (if\b|else\b)/.test(line)) {
      key = undefined;
      continue;
    }
    const field = line.match(/^  ([\w-]+):\s*(.*)$/);
    if (field) {
      key = field[1];
      fields[key] = field[2];
    } else if (key && /^\s+\S/.test(line)) fields[key] += " " + line.trim();
  }
  return fields;
}
const nativePlanDirectory = resolve(dirname(buildOutput), "chronicle-native-plan");
const nativeOverlayDb = resolve(nativePlanDirectory, "package-db");
let nativeObjects;
let originalNativeLinkSha256;
async function stripPrivateNativeEngine(binary, buildSourceHash) {
  originalNativeLinkSha256 = await sha256(binary);
  const stripped = `${binary}.stripped-${process.pid}`;
  await run("strip", ["-o", stripped, binary]);
  await rename(stripped, binary);
  await writeFile(resolve(project, "output/rules-server/rules-native-link.json"), JSON.stringify({
    schema: 1,
    upstreamRevision,
    extensions: selectedExtensions,
    extensionSourceSha256: buildSourceHash,
    originalNativeLinkSha256,
    nativeEngineSha256: await sha256(binary),
    preparedAt: new Date().toISOString(),
  }, null, 2) + "\n", { mode: 0o600 });
  console.log("Recorded the native link hash and stripped only the private engine executable before test linking; all object/interface files remain.");
}
async function writeGhcResponse(path, args) {
  if (args.some((arg) => typeof arg !== "string" || /[\r\n\0]/.test(arg)))
    throw new Error("Invalid native compiler argument.");
  // GHC response files use quoted arguments. No shell evaluates this file.
  await writeFile(path, args.map((arg) => JSON.stringify(arg)).join("\n") + "\n", { mode: 0o600 });
}
async function runGhcResponse(path, args) {
  const compiler = [];
  const runtime = [];
  let inRuntime = false;
  for (const arg of args) {
    if (arg === "+RTS") inRuntime = true;
    else if (arg === "-RTS") inRuntime = false;
    else (inRuntime ? runtime : compiler).push(arg);
  }
  if (inRuntime) throw new Error("Unterminated compiler RTS options.");
  await writeGhcResponse(path, compiler);
  // The RTS parses its options before GHC expands @response files.
  const boundedRuntime = runtime.length ? runtime : [`-M${compilerHeap}`, "-N1", "-A16m", "-n2m", "-c"];
  await run(resolve(ghcDir, "bin/ghc"), [`@${path}`, "+RTS", ...boundedRuntime, "-RTS"], { cwd: resolve(backend, "arkham-api") });
}
async function compileNativeObjects(helper) {
  // Ask the actual configured Cabal component for its compiler command, stopping
  // before compilation/archiving. Then execute that exact no-link command. This
  // keeps every object/interface and avoids a second 925 MiB archive/dylib copy.
  await mkdir(nativePlanDirectory, { recursive: true, mode: 0o700 });
  const localInstall = await capture(stack, ["path", "--local-install-root"]);
  const discovery = resolve(localInstall, "bin/cards-discover");
  if (!(await exists(discovery))) throw new Error("The configured native discovery executable is missing.");
  env.PATH = `${dirname(discovery)}:${env.PATH}`;
  const commandPath = resolve(nativePlanDirectory, "library-command.json");
  const wrapper = resolve(nativePlanDirectory, "capture-ghc.py");
  await rm(commandPath, { force: true });
  await writeFile(wrapper, `#!/usr/bin/env python3\nimport json,os,shlex,sys\nfrom pathlib import Path\nargs=[]\nfor arg in sys.argv[1:]:\n if arg.startswith('@'):\n  args.extend(shlex.split(Path(arg[1:]).read_text()))\n else:\n  args.append(arg)\nif '-this-unit-id' in args and '-shared' not in args:\n Path(${JSON.stringify(commandPath)}).write_text(json.dumps(args))\n sys.exit(86)\nos.execv(${JSON.stringify(resolve(ghcDir, "bin/ghc"))},[${JSON.stringify(resolve(ghcDir, "bin/ghc"))}]+sys.argv[1:])\n`, { mode: 0o700 });
  try {
    await run(helper, ["--verbose=1", `--builddir=${dirname(buildOutput)}`, "build", "lib:arkham-api", `--with-ghc=${wrapper}`], { cwd: resolve(backend, "arkham-api") });
  } catch (error) {
    if (!(await exists(commandPath))) throw error;
  }
  const args = JSON.parse(await readFile(commandPath, "utf8"));
  if (!Array.isArray(args) || !args.includes("--make") || !args.includes("-static") || !args.includes("-dynamic-too") || args.includes("-shared") || args.includes("-o"))
    throw new Error("Cabal did not supply the native library's exact no-link compiler command.");
  // Cabal resets program options when the capture wrapper overrides ghc. Restore
  // the same explicit --fast/--ghc-options profile used by Stack configuration.
  args.push("-no-link", "-O0", ...mainGhcOptions.split(" "));
  const unitId = args[args.indexOf("-this-unit-id") + 1];
  if (!/^arkham-api-0\.0\.0-[a-zA-Z0-9]+$/.test(unitId || ""))
    throw new Error("Unexpected configured native engine unit.");
  const response = resolve(nativePlanDirectory, "library.rsp");
  console.log("Compiling the actual Cabal native library command without duplicate archives.");
  await runGhcResponse(response, args);
  const cabal = await readFile(resolve(backend, "arkham-api/arkham-api.cabal"), "utf8");
  const fields = cabalFields(cabal, "library");
  const modules = fields["exposed-modules"].split(/\s+/).filter(Boolean);
  const others = (fields["other-modules"] || "").split(/\s+/).filter(Boolean);
  if ([...modules, ...others].some((name) => !/^[A-Z][a-zA-Z0-9_.]+$/.test(name)))
    throw new Error("Invalid configured native module name.");
  nativeObjects = [...modules, ...others].map((name) => resolve(buildOutput, `${name.replaceAll(".", "/")}.o`));
  for (const object of nativeObjects)
    if (!(await exists(object))) throw new Error(`Missing native engine object: ${object}.`);
  // Configure-only resets Cabal's inplace package database. Generate its exact
  // registration description from the current configured component instead of
  // assuming an earlier archive/install step populated that database.
  const configPath = resolve(nativePlanDirectory, "native-inplace.conf");
  await run(helper, [
    `--builddir=${dirname(buildOutput)}`,
    "register",
    "--inplace",
    `--gen-pkg-config=${configPath}`,
  ], { cwd: resolve(backend, "arkham-api") });
  let config = await readFile(configPath, "utf8");
  if (!config.includes(`id:                   ${unitId}`))
    throw new Error("The native interface registry belongs to a different engine unit.");
  config = config.replace(/^exposed-modules:[\s\S]*?(?=^\S)/m, `exposed-modules:\n    ${modules.join("\n    ")}\n\n`).replace(/^hs-libraries:.*$/m, "hs-libraries:");
  const overlayConfig = resolve(nativePlanDirectory, `${unitId}.conf`);
  await writeFile(overlayConfig, config, { mode: 0o600 });
  const [snapshotDb, localDb] = await Promise.all([capture(stack, ["path", "--snapshot-pkg-db"]), capture(stack, ["path", "--local-pkg-db"])]);
  if (!(await exists(nativeOverlayDb))) await run(resolve(ghcDir, "bin/ghc-pkg"), ["init", nativeOverlayDb]);
  await run(resolve(ghcDir, "bin/ghc-pkg"), ["--package-db", snapshotDb, "--package-db", localDb, "--package-db", nativeOverlayDb, "update", overlayConfig, "--force"]);
  await writeFile(resolve(nativePlanDirectory, "native-objects.json"), JSON.stringify({ unitId, modules, others, nativeObjects, nativeLibrarySourceHash: await directoryHash(resolve(backend, "arkham-api/library")) }, null, 2) + "\n", { mode: 0o600 });
  console.log(`Registered ${nativeObjects.length} actual native objects in a private interface overlay for direct linking.`);
}
async function loadNativeObjects() {
  const saved = JSON.parse(await readFile(resolve(nativePlanDirectory, "native-objects.json"), "utf8"));
  if (!/^arkham-api-0\.0\.0-[a-zA-Z0-9]+$/.test(saved.unitId || ""))
    throw new Error("The saved native interface registry has an invalid engine unit.");
  const cabal = await readFile(resolve(backend, "arkham-api/arkham-api.cabal"), "utf8");
  const fields = cabalFields(cabal, "library");
  const modules = fields["exposed-modules"].split(/\s+/).filter(Boolean);
  const others = (fields["other-modules"] || "").split(/\s+/).filter(Boolean);
  const expected = [...modules, ...others].map((name) => resolve(buildOutput, `${name.replaceAll(".", "/")}.o`));
  if (JSON.stringify(expected) !== JSON.stringify(saved.nativeObjects) || saved.nativeLibrarySourceHash !== await directoryHash(resolve(backend, "arkham-api/library")) || !(await exists(resolve(nativeOverlayDb, `${saved.unitId}.conf`))))
    throw new Error("The configured native object/interface overlay changed; rebuild the engine.");
  for (const object of expected)
    if (!(await exists(object))) throw new Error(`Missing native engine object: ${object}.`);
  nativeObjects = expected;
}
async function compileNativeComponent(heading, componentName, mainFile) {
  if (!nativeObjects?.length) throw new Error("The native object compilation has not completed.");
  const cabal = await readFile(resolve(backend, "arkham-api/arkham-api.cabal"), "utf8");
  const fields = cabalFields(cabal, heading);
  if (fields["main-is"] !== mainFile || fields["default-language"] !== "GHC2021")
    throw new Error("The configured native component profile differs from the expected entrypoint.");
  const packages = fields["build-depends"].split(",").map((name) => name.trim());
  if (packages.some((name) => !/^[a-zA-Z0-9-]+$/.test(name)))
    throw new Error("Unsupported native component dependency syntax.");
  const [snapshotDb, localDb] = await Promise.all([capture(stack, ["path", "--snapshot-pkg-db"]), capture(stack, ["path", "--local-pkg-db"])]);
  const component = resolve(buildOutput, componentName);
  const objects = resolve(component, `${componentName}-tmp`);
  // A fresh compile-only build has configured only the library. GHC validates
  // the executable output directory before creating its -outputdir tree.
  await mkdir(objects, {recursive: true});
  const sourceDirs = fields["hs-source-dirs"].split(/\s+/).filter(Boolean);
  const options = [...fields["ghc-options"].matchAll(/"([^"\n]+)"|(\S+)/g)].map((match) => match[1] || match[2]);
  // Darwin's linker can omit debug/local symbols while producing the image,
  // avoiding the large unstripped intermediate on constrained disks. Global
  // symbols and the configured executable code remain available; native tests
  // still run against the resulting actual executable before packaging.
  if (compactBuild && process.platform === "darwin") options.push("-optl-Wl,-S,-x");
  const args = ["-package-env=-", "--make", ...options, "-hide-all-packages", "-no-user-package-db", "-fbuilding-cabal-package", "-Wno-missing-home-modules", "-XGHC2021", ...fields["default-extensions"].split(/\s+/).filter(Boolean).map((name) => `-X${name}`), "-i", ...sourceDirs.map((path) => `-i${path}`), `-i${objects}`, `-i${resolve(component, "autogen")}`, `-I${resolve(component, "autogen")}`, "-package-db", snapshotDb, "-package-db", localDb, "-package-db", nativeOverlayDb, ...packages.flatMap((name) => ["-package", name]), "-outputdir", objects, "-o", resolve(component, componentName), resolve(backend, "arkham-api", sourceDirs[0], mainFile), ...nativeObjects];
  const response = resolve(nativePlanDirectory, `${componentName}.rsp`);
  await runGhcResponse(response, args);
}
async function compileFocusedTests() {
  // Test-only recovery reads the generated component's real compiler settings.
  // It links against the configured inplace engine; it never recompiles or
  // rearchives that library. Engine freshness is checked before and after.
  const cabal = await readFile(
    resolve(backend, "arkham-api/arkham-api.cabal"),
    "utf8",
  );
  const component = cabal.match(
    /^test-suite barkham-spec\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m,
  )?.[1];
  if (!component)
    throw new Error("The focused native component is not configured.");
  const fields = {};
  let key;
  for (const line of component.split("\n")) {
    const field = line.match(/^  ([\w-]+):\s*(.*)$/);
    if (field) {
      key = field[1];
      fields[key] = field[2];
    } else if (key && /^\s+\S/.test(line)) fields[key] += " " + line.trim();
  }
  if (
    fields["main-is"] !== "BarkhamSpec.hs" ||
    fields["default-language"] !== "GHC2021"
  )
    throw new Error(
      "The focused compiler profile differs from the original driver.",
    );
  const packages = fields["build-depends"]
    .split(",")
    .map((name) => name.trim());
  if (packages.some((name) => !/^[a-zA-Z0-9-]+$/.test(name)))
    throw new Error("Unsupported focused dependency syntax.");
  const [snapshotDb, localDb] = await Promise.all([
    capture(stack, ["path", "--snapshot-pkg-db"]),
    capture(stack, ["path", "--local-pkg-db"]),
  ]);
  const nativeTest = resolve(buildOutput, "barkham-spec");
  const testObjects = resolve(nativeTest, "barkham-spec-tmp");
  const sourceDirs = fields["hs-source-dirs"].split(/\s+/).filter(Boolean);
  const options = [...fields["ghc-options"].matchAll(/"([^"\n]+)"|(\S+)/g)].map(
    (match) => match[1] || match[2],
  );
  const args = [
    "--make",
    ...options,
    "-hide-all-packages",
    "-fbuilding-cabal-package",
    "-Wno-missing-home-modules",
    "-XGHC2021",
    ...fields["default-extensions"]
      .split(/\s+/)
      .filter(Boolean)
      .map((name) => `-X${name}`),
    "-i",
    ...sourceDirs.map((path) => `-i${path}`),
    `-i${testObjects}`,
    `-i${resolve(nativeTest, "autogen")}`,
    `-I${resolve(nativeTest, "autogen")}`,
    "-package-db",
    snapshotDb,
    "-package-db",
    localDb,
    "-package-db",
    resolve(dirname(buildOutput), "package.conf.inplace"),
    ...packages.flatMap((name) => ["-package", name]),
    "-outputdir",
    testObjects,
    "-o",
    resolve(nativeTest, "barkham-spec"),
    resolve(backend, "arkham-api/chronicle-tests/BarkhamSpec.hs"),
  ];
  await run(resolve(ghcDir, "bin/ghc"), args, {
    cwd: resolve(backend, "arkham-api"),
  });
}
async function writeBuildInput(buildSourceHash) {
  await mkdir(dirname(buildInputPath), { recursive: true });
  await writeFile(
    buildInputPath,
    JSON.stringify(
      {
        schema: 1,
        upstreamRevision,
        extensionSourceSha256: buildSourceHash,
        extensionSourceHashes: await extensionHashes(),
        extensions: selectedExtensions,
        preparedAt: new Date().toISOString(),
        source,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
}
async function verifyLinkedInput(binary) {
  if (!(await exists(binary)))
    throw new Error("Compiled engine executable was not found.");
  const linkedAt = (await stat(binary)).mtimeMs;
  async function verifyFiles(directory, filter) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "barkham-spec" && entry.name !== "spec")
          await verifyFiles(path, filter);
      } else if (filter(entry.name) && (await stat(path)).mtimeMs > linkedAt)
        throw new Error(
          `Compiled engine is older than its native input: ${path}.`,
        );
    }
  }
  await verifyFiles(resolve(backend, "arkham-api/library"), (name) =>
    name.endsWith(".hs") || name.endsWith(".hs-boot"),
  );
  await verifyFiles(buildOutput, (name) => name.endsWith(".o"));
}
async function packageRuntime(binary, buildSourceHash) {
  const derivedRuntime = runtimeCandidate;
  if ((await extensionHash()) !== buildSourceHash)
    throw new Error("The original source changed before runtime packaging.");
  if (!(await exists(binary)))
    throw new Error("Compiled engine executable was not found.");
  const nativeEngineSha256 = await sha256(binary);
  const behavior = verifyBarkham ? await runFocusedTests() : undefined;
  if (compileOnly) {
    if ((await extensionHash()) !== buildSourceHash)
      throw new Error("The original extension changed during the native check; rerun with frozen sources.");
    await verifyLinkedInput(binary);
    const nativeObjectProof = resolve(nativePlanDirectory, "native-objects.json");
    const configuredLibrary = cabalFields(await readFile(resolve(backend, "arkham-api/arkham-api.cabal"), "utf8"), "library");
    const configuredModules = [configuredLibrary["exposed-modules"], configuredLibrary["other-modules"]]
      .filter(Boolean).join(" ").split(/\s+/).filter(Boolean);
    if (directObjects && nativeObjects?.length !== configuredModules.length)
      throw new Error("The native object proof does not cover the complete configured library/API module graph.");
    await writeFile(resolve(project, "output/rules-server/rules-native-check.json"), JSON.stringify({
      schema: 1,
      scope: withEpicMachinations ? "native-aggregate" : "native-component",
      fullAggregate: withEpicMachinations,
      fullAggregateBehaviorTested: withEpicMachinations && Boolean(behavior),
      nativeModuleCount: configuredModules.length,
      nativeObjectsProofSha256: directObjects ? await sha256(nativeObjectProof) : undefined,
      upstreamRevision,
      platform: process.platform,
      architecture: process.arch,
      extensions: selectedExtensions,
      extensionSourceSha256: buildSourceHash,
      extensionSourceHashes: await extensionHashes(),
      nativeEngineSha256,
      behavior,
      binary,
      verifiedAt: new Date().toISOString(),
      packaged: false,
      installed: false,
    }, null, 2) + "\n", { mode: 0o600 });
    console.log("Completed the private native compilation check; no runtime package, signature, installation or capability manifest was created.");
    return;
  }
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("Runtime packaging requires macOS Apple Silicon.");
  if (compactBuild) {
    if (!behavior)
      throw new Error(
        "Compacting native build libraries requires passing focused tests.",
      );
    const generated = (await readdir(buildOutput)).filter((name) =>
      /^libHSarkham-api-0\.0\.0-[a-zA-Z0-9]+(?:\.a|-ghc9\.14\.1\.dylib)$/.test(
        name,
      ),
    );
    for (const executable of [
      binary,
      resolve(buildOutput, "barkham-spec/barkham-spec"),
    ]) {
      const dependencies = await capture("otool", ["-L", executable]);
      if (generated.some((name) => dependencies.includes(name)))
        throw new Error(
          "A linked executable still needs its generated build library.",
        );
    }
    for (const name of generated) await rm(resolve(buildOutput, name));
    console.log(
      `Removed ${generated.length} regenerable project build libraries after passing native tests; every object/interface is retained.`,
    );
    if (directObjects) {
      await writeFile(resolve(project, "output/rules-server/rules-native-test-result.json"), JSON.stringify({
        schema: 1,
        status: "native tests passed; runtime packaging pending",
        extensions: selectedExtensions,
        upstreamRevision,
        extensionSourceSha256: buildSourceHash,
        nativeEngineSha256,
        originalNativeLinkSha256,
        ...behavior,
      }, null, 2) + "\n", { mode: 0o600 });
      await rm(resolve(buildOutput, "barkham-spec/barkham-spec"));
      console.log("Recorded the passing native test executable hash and removed only its regenerable executable for signing headroom; all test objects/interfaces remain.");
    }
  }
  await mkdir(dirname(derivedRuntime), { recursive: true });
  await mkdir(derivedRuntime, { mode: 0o700 });
  await mkdir(resolve(derivedRuntime, "bin"), { recursive: true });
  const presentationAdapterSha256 = await sha256(resolve(project, "scripts/build-companion-presentation.mjs"));
  const { buildCompanionPresentation, presentationRevision } = await import(`./build-companion-presentation.mjs?build=${presentationAdapterSha256}`);
  if (presentationRevision !== upstreamRevision)
    throw new Error("The companion presentation adapter targets a different upstream revision.");
  await buildCompanionPresentation(source, resolve(derivedRuntime, "chronicle-presentation.json"));
  if (await exists(resolve(installedRuntime, "config")))
    await run("cp", [
      "-cR",
      resolve(installedRuntime, "config"),
      derivedRuntime,
    ]);
  else await mkdir(resolve(derivedRuntime, "config"), { mode: 0o700 });
  await chmod(resolve(derivedRuntime, "config"), 0o700);
  // Release packaging keeps dynamic imports, but removes the large static symbol
  // table. Writing straight to the destination avoids an extra full-size copy
  // before stripping on filesystems where Node's cloning flag falls back to copy.
  // The compiler's unstripped executable remains in its private cache.
  await run("strip", ["-o", resolve(derivedRuntime, "bin/arkham-api"), binary]);
  await chmod(resolve(derivedRuntime, "bin/arkham-api"), 0o700);
  for (const name of ["lib", "pgsql", "data"]) {
    if (!(await exists(resolve(derivedRuntime, name))))
      await symlink(
        resolve(baseRuntime, name),
        resolve(derivedRuntime, name),
        "dir",
      );
  }
  const linked = await capture("otool", [
    "-L",
    resolve(derivedRuntime, "bin/arkham-api"),
  ]);
  for (const line of linked.split("\n").slice(1)) {
    const dependency = line.trim().split(" (")[0];
    if (
      (dependency.startsWith(toolchain) ||
        dependency === "@rpath/libpq.5.dylib") &&
      dependency.endsWith("/libpq.5.dylib")
    ) {
      // Rewritten below inside its existing string slot, then re-signed.
    } else if (
      dependency.startsWith("/private/tmp/") ||
      dependency.startsWith("/tmp/")
    ) {
      throw new Error(
        `Compiled runtime still links a temporary dependency: ${dependency}.`,
      );
    }
  }
  const loadCommands = await capture("otool", [
    "-l",
    resolve(derivedRuntime, "bin/arkham-api"),
  ]);
  const temporaryRpaths = [
    ...loadCommands.matchAll(
      /cmd LC_RPATH[\s\S]*?\n\s*path ([^\n]+?) \(offset \d+\)/g,
    ),
  ]
    .map((match) => match[1])
    .filter(
      (path) =>
        path.startsWith(toolchain) ||
        path.startsWith("/private/tmp/") ||
        path.startsWith("/tmp/"),
    );
  const relativeDependencies = linked
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" (")[0])
    .filter(
      (dependency) =>
        dependency.startsWith("@rpath/") &&
        dependency !== "@rpath/libpq.5.dylib",
    );
  for (const path of temporaryRpaths) {
    for (const dependency of relativeDependencies) {
      if (await exists(resolve(path, dependency.slice("@rpath/".length))))
        throw new Error(
          `Compiled runtime resolves ${dependency} through a temporary library path: ${path}.`,
        );
    }
  }
  await rewriteRuntimeLoadPaths(resolve(derivedRuntime, "bin/arkham-api"));
  const verifiedLoads = await capture("otool", [
    "-L",
    resolve(derivedRuntime, "bin/arkham-api"),
  ]);
  if (
    !verifiedLoads.includes("@loader_path/../lib/libpq.5.dylib") ||
    verifiedLoads.includes("/private/tmp/") ||
    verifiedLoads.includes("/tmp/")
  )
    throw new Error(
      "The packaged runtime still has a temporary dynamic import.",
    );
  if (compactBuild) {
    await writeFile(
      resolve(project, "output/rules-server/rules-prepared-input.json"),
      JSON.stringify(
        {
          schema: 1,
          upstreamRevision,
          extensionSourceSha256: buildSourceHash,
          nativeEngineSha256,
          preparedBinarySha256: await sha256(
            resolve(derivedRuntime, "bin/arkham-api"),
          ),
          behavior,
          preparedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    await rm(binary);
    console.log(
      "Removed the superseded unstripped compiler executable after preparing its verified persistent replacement; every object/interface is retained.",
    );
  }
  await run("codesign", [
    "--force",
    "--sign",
    "-",
    resolve(derivedRuntime, "bin/arkham-api"),
  ]);
  await run("codesign", [
    "--verify",
    "--strict",
    resolve(derivedRuntime, "bin/arkham-api"),
  ]);
  await mkdir(resolve(derivedRuntime, "frontend"), { recursive: true });
  // macOS cp requests real APFS clones; Node's cloning flag falls back to a
  // full copy here. The copied frontend remains inside persistent output.
  await run("cp", [
    "-cR",
    resolve(buildFrontend, "dist"),
    resolve(derivedRuntime, "frontend"),
  ]);
  const manifest = {
    schema: 1,
    kind: "chronicle-derived",
    upstreamRevision,
    baseReleaseVersion: "v20260904.1",
    baseReleaseSha256:
      "29061cbdb683cc7b98f56fc45cb64fbc3762e5a21796406c429a936033bacf39",
    frontendSourceHash: (
      await readFile(
        resolve(derivedRuntime, "frontend/dist/source_hash"),
        "utf8",
      )
    ).trim(),
    extensionSourceSha256: buildSourceHash,
    extensionSourceHashes: await extensionHashes(),
    nativeEngineSha256,
    ...(originalNativeLinkSha256 ? { originalNativeLinkSha256 } : {}),
    seamPatchSha256: createHash("sha256")
      .update(JSON.stringify(patches))
      .digest("hex"),
    binarySha256: await sha256(resolve(derivedRuntime, "bin/arkham-api")),
    presentationSha256: await sha256(resolve(derivedRuntime, "chronicle-presentation.json")),
    presentationAdapterSha256,
    builtAt: new Date().toISOString(),
    extensions: selectedExtensions,
    expectedCardCodes: [
      ...Array.from(
        { length: 57 },
        (_, index) => `:barkham:${String(index + 1).padStart(3, "0")}`,
      ),
      ...(withEpicLabyrinth
        ? [
            "70001",
            "70002",
            "70004",
            "70006",
            "70009",
            "70013",
            "70014",
            "70020",
            "70022",
            "70033",
            "70034",
            "70035",
            "70036",
            "70037",
            "70038",
            "70042",
            "70044",
            "70046",
            "70049",
            "70051",
            "70059",
          ]
        : []),
      ...(withEpicMachinations ? [
        "87001", "87003", "87004", "87005b", "87008", "87009", "87011",
        "87015", "87018", "87024", "87025", "87033", "87034", "87035", "87037", "87037b",
        "87038", "87039", "87042", "87043",
      ] : []),
    ],
    certification: "compiled; behavioral verification is recorded separately",
  };
  if ((await extensionHash()) !== buildSourceHash)
    throw new Error(
      "The original source changed while the runtime was packaged.",
    );
  await writeFile(
    resolve(derivedRuntime, "chronicle-runtime.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600 },
  );
  if (behavior) {
    await writeFile(
      behaviorProofPath,
      JSON.stringify(
        {
          schema: 1,
          status: "passed",
          suite: "arkham-api:test:barkham-spec",
          extensions: selectedExtensions,
          ...behavior,
          upstreamRevision,
          extensionSourceSha256: buildSourceHash,
          binarySha256: manifest.binarySha256,
          frontendSourceHash: manifest.frontendSourceHash,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  }
  if (prepareOnly) {
    console.log(`Verified candidate prepared without replacing the installed runtime: ${derivedRuntime}`);
    return;
  }
  await publishRuntime(derivedRuntime, installedRuntime);
  console.log(`Derived runtime ready: ${installedRuntime}`);
}

async function publishRuntime(candidate, installed) {
  if (!(await exists(installed))) {
    await rename(candidate, installed);
    return;
  }
  // Darwin renameatx_np(RENAME_SWAP) exchanges both directories atomically.
  // Running processes keep their old executable/cwd; the old directory stays
  // at candidate until the operator restarts them and removes it deliberately.
  await run("python3", [
    "-c",
    `import ctypes, os, sys
lib = ctypes.CDLL(None, use_errno=True)
swap = lib.renameatx_np
swap.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
swap.restype = ctypes.c_int
if swap(-2, os.fsencode(sys.argv[1]), -2, os.fsencode(sys.argv[2]), 2) != 0:
    code = ctypes.get_errno()
    raise OSError(code, os.strerror(code))
`,
    candidate,
    installed,
  ]);
  console.log(
    `Previous runtime retained at ${candidate}; restart its daemon before removing that directory.`,
  );
}

async function publishPreparedCandidate(path) {
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("Publishing a signed runtime requires macOS Apple Silicon.");
  const candidate = resolve(path || "");
  if (dirname(candidate) !== dirname(installedRuntime) ||
    !/^\.candidate-[0-9]+$/.test(candidate.slice(candidate.lastIndexOf("/") + 1)))
    throw new Error("Only a completed private runtime candidate can be published.");
  const manifest = await verifyDerivedRuntime(candidate, extension);
  if (!manifest || JSON.stringify(manifest.extensions) !== JSON.stringify(selectedExtensions))
    throw new Error("The candidate does not match the explicitly selected original extensions.");
  const proof = JSON.parse(await readFile(behaviorProofPath, "utf8"));
  if (proof.status !== "passed" || proof.failures !== 0 || proof.examples < 1 ||
    proof.binarySha256 !== manifest.binarySha256 ||
    proof.extensionSourceSha256 !== manifest.extensionSourceSha256 ||
    proof.testDriverSha256 !== await sha256(testDriver))
    throw new Error("The candidate has no matching passing native behavior proof.");
  await run("codesign", ["--verify", "--strict", resolve(candidate, "bin/arkham-api")]);
  await publishRuntime(candidate, installedRuntime);
  console.log(`Verified runtime installed: ${installedRuntime}`);
}

async function rewriteRuntimeLoadPaths(path) {
  // Apple's SDK mach-o/loader.h defines this 32-byte little-endian header and
  // string offsets for LC_LOAD_DYLIB/LC_RPATH. Shorter replacements fit existing
  // slots: no command/segment offsets move and no whole-file temporary copy is
  // needed. codesign below regenerates the signature after these header edits.
  const handle = await open(path, "r+");
  try {
    const header = Buffer.alloc(32);
    if (
      (await handle.read(header, 0, 32, 0)).bytesRead !== 32 ||
      header.readUInt32LE(0) !== 0xfeedfacf ||
      header.readUInt32LE(4) !== 0x0100000c
    )
      throw new Error("Expected a little-endian arm64 Mach-O executable.");
    const count = header.readUInt32LE(16);
    const bytes = header.readUInt32LE(20);
    if (count < 1 || count > 4096 || bytes < 8 || bytes > 1024 * 1024)
      throw new Error("Invalid Mach-O load command bounds.");
    const commands = Buffer.alloc(bytes);
    if ((await handle.read(commands, 0, bytes, 32)).bytesRead !== bytes)
      throw new Error("Truncated Mach-O load commands.");
    let offset = 0;
    let pq = 0;
    const edits = [];
    for (let index = 0; index < count; index++) {
      if (offset + 8 > bytes) throw new Error("Truncated Mach-O command.");
      const kind = commands.readUInt32LE(offset);
      const size = commands.readUInt32LE(offset + 4);
      if (size < 8 || size % 8 !== 0 || offset + size > bytes)
        throw new Error("Invalid Mach-O command size.");
      if (kind === 0xc || kind === 0x8000001c) {
        if (size < 16) throw new Error("Invalid Mach-O path command.");
        const relative = commands.readUInt32LE(offset + 8);
        const start = offset + relative;
        const end = offset + size;
        if (relative < 12 || start >= end)
          throw new Error("Invalid Mach-O path offset.");
        const zero = commands.indexOf(0, start);
        if (zero < start || zero >= end)
          throw new Error("Unterminated Mach-O path.");
        const original = commands.toString("utf8", start, zero);
        const temporary =
          original.startsWith("/private/tmp/") || original.startsWith("/tmp/");
        let replacement;
        if (
          kind === 0xc &&
          (temporary || original.startsWith("@rpath/")) &&
          original.endsWith("/libpq.5.dylib")
        ) {
          replacement = "@loader_path/../lib/libpq.5.dylib";
          pq++;
        } else if (kind === 0x8000001c && temporary)
          replacement = "@loader_path/../lib";
        if (replacement) {
          if (Buffer.byteLength(replacement) + 1 > end - start)
            throw new Error(
              "A persistent Mach-O path does not fit its original slot.",
            );
          commands.fill(0, start, end);
          commands.write(replacement, start, "utf8");
          edits.push([start, end - start]);
        }
      }
      offset += size;
    }
    if (offset !== bytes || pq !== 1)
      throw new Error("Unexpected Mach-O libpq registration.");
    for (const [start, length] of edits)
      if (
        (await handle.write(commands, start, length, 32 + start))
          .bytesWritten !== length
      )
        throw new Error("Incomplete Mach-O path write.");
    await handle.sync();
    console.log(
      `Rewrote ${edits.length} fixed-size Mach-O path slots to persistent runtime libraries.`,
    );
  } finally {
    await handle.close();
  }
}

async function runFocusedTests() {
  const testBinary = resolve(buildOutput, "barkham-spec/barkham-spec");
  const testLinkedAt = (await stat(testBinary)).mtimeMs;
  async function checkTree(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await checkTree(path);
      else if (entry.isFile() && (await stat(path)).mtimeMs > testLinkedAt)
        throw new Error(
          "The focused native test executable is older than its source.",
        );
    }
  }
  for (const id of selectedExtensions)
    await checkTree(resolve(project, "rules/extensions", id, "tests"));
  if ((await stat(testDriver)).mtimeMs > testLinkedAt)
    throw new Error(
      "The focused native test executable is older than its driver.",
    );
  const testRuntimeOptions = ["+RTS", "-N1", "-A16m", "-RTS"];
  const behaviorOutput = await capture(
    testBinary,
    ["--ignore-dot-hspec", ...testRuntimeOptions],
    resolve(backend, "arkham-api"),
    true,
    nativeTestEnvironment(env),
  );
  console.log(behaviorOutput);
  const result = behaviorOutput.match(/(\d+) examples?, (\d+) failures?/);
  if (!result || Number(result[1]) < 1 || Number(result[2]) !== 0)
    throw new Error(
      "The focused native suite did not report passing examples.",
    );
  return {
    examples: Number(result[1]),
    failures: Number(result[2]),
    runtimeOptions: testRuntimeOptions,
    hspecOptions: ["--ignore-dot-hspec"],
    environmentSanitized: true,
    verifiedAt: new Date().toISOString(),
    testDriverSha256: await sha256(testDriver),
    testBinarySha256: await sha256(testBinary),
  };
}

async function runCoordinatorTests() {
  const buildSourceHash = await extensionHash();
  const suites = ["Arkham.Homebrew.EpicLabyrinth.CoordinatorSpec",
    ...(withEpicMachinations ? ["Arkham.Homebrew.EpicMachinations.CoordinatorSpec"] : [])];
  // These are the real suites' transitive external imports. Their small local
  // graph compiles directly from the staged upstream/extension source, with no
  // substitute Prelude, engine, entity, API or test-harness modules.
  await run(stack, ["build", "classy-prelude", "lens", "extra", "MonadRandom",
    "aeson", "aeson-casing", "semialign", "these", "uuid", "safe", "random-shuffle", "hspec",
    "--fast", "--no-haddock", "--no-library-profiling", "--no-executable-profiling",
    "--jobs=2", `--ghc-options=${mainGhcOptions}`]);
  const cabal = await readFile(resolve(backend, "arkham-api/arkham-api.cabal"), "utf8");
  const fields = cabalFields(cabal, "library");
  if (fields["default-language"] !== "GHC2021")
    throw new Error("The configured coordinator source language differs from the pinned engine.");
  const directory = resolve(toolchain, "coordinator-tests");
  await mkdir(directory, { recursive: true });
  const driver = resolve(directory, "CoordinatorSpec.hs");
  await writeFile(driver, "module Main where\nimport Prelude (IO)\nimport Test.Hspec qualified as H\n" +
    suites.map((name, index) => `import ${name} qualified as Suite${index}\n`).join("") +
    "main :: IO ()\nmain = H.hspec do\n" + suites.map((_, index) => `  Suite${index}.spec\n`).join(""));
  const binary = resolve(directory, "coordinator-spec");
  const packageDb = await capture(stack, ["path", "--snapshot-pkg-db"]);
  await runGhcResponse(resolve(directory, "coordinator.rsp"), ["--make", "-O0", "-threaded", "-rtsopts",
    "-no-user-package-db", "-package-db", packageDb, "-XGHC2021",
    ...fields["default-extensions"].split(/\s+/).filter(Boolean).map((name) => `-X${name}`),
    "-ilibrary", "-itests", "-outputdir", resolve(directory, "objects"), "-o", binary, driver]);
  const runtimeOptions = ["+RTS", "-N1", "-A16m", "-RTS"];
  const output = await capture(binary, ["--ignore-dot-hspec", ...runtimeOptions], resolve(backend, "arkham-api"), true, nativeTestEnvironment(env));
  console.log(output);
  const result = output.match(/(\d+) examples?, (\d+) failures?/);
  if (!result || Number(result[1]) < 1 || Number(result[2]) !== 0)
    throw new Error("The actual native coordinator suites did not report passing examples.");
  if ((await extensionHash()) !== buildSourceHash)
    throw new Error("The original extension changed during coordinator compilation/testing.");
  const compiledSourceHashes = {};
  for (const relative of await readdir(resolve(directory, "objects"), {recursive: true})) {
    if (!relative.endsWith(".hi") || relative === "Main.hi") continue;
    const modulePath = relative.slice(0, -3) + ".hs";
    for (const sourceDirectory of ["library", "tests"]) {
      const path = resolve(backend, "arkham-api", sourceDirectory, modulePath);
      if (await exists(path)) {
        compiledSourceHashes[`${sourceDirectory}/${modulePath}`] = await sha256(path);
        break;
      }
    }
  }
  await mkdir(dirname(coordinatorProofPath), { recursive: true });
  await writeFile(coordinatorProofPath, JSON.stringify({schema: 1, scope: "coordinator-only", upstreamRevision,
    platform: process.platform, architecture: process.arch, suites, extensions: selectedExtensions,
    extensionSourceSha256: buildSourceHash, extensionSourceHashes: await extensionHashes(),
    examples: Number(result[1]), failures: Number(result[2]), runtimeOptions,
    hspecOptions: ["--ignore-dot-hspec"], environmentSanitized: true,
    testBinarySha256: await sha256(binary), testDriverSha256: await sha256(driver), compiledSourceHashes,
    verifiedAt: new Date().toISOString(), fullAggregate: false, packaged: false, installed: false}, null, 2) + "\n",
    {mode: 0o600});
  console.log("Recorded actual coordinator-only Haskell behavior; full native entities/API, aggregate linking and runtime acceptance remain pending.");
}

try {
  // Reject packaging modes before fetching source or touching native records.
  if (bootstrapOnly && process.argv.some((arg) => ["--stage", "--dependencies", "--test-dependencies", "--compile-only", "--test", "--test-built", "--coordinator-tests", "--incremental-native", "--configure-only", "--direct-objects", "--native-objects-only", "--link-objects", "--compact-build", "--prepare-only", "--package-built", "--publish-candidate"].includes(arg)))
    throw new Error("--bootstrap-only cannot combine with source staging, dependencies, compilation, tests or runtime packaging.");
  if (mode !== "stage" && !supportedNativePlatform && publishCandidateIndex < 0)
    throw new Error("Native compilation supports macOS Apple Silicon and Linux x86_64; runtime packaging requires macOS Apple Silicon.");
  if (compileOnly && (packageBuilt || prepareOnly || publishCandidateIndex >= 0))
    throw new Error("--compile-only cannot prepare, recover or publish a runtime package.");
  if (coordinatorTests && (!withEpicLabyrinth || mode !== "build" || incrementalNative || testBuilt || directObjects || configureOnly || linkObjects || nativeObjectsOnly))
    throw new Error("--coordinator-tests requires an Epic extension selection and cannot combine with another native build mode.");
  if (linuxNative && !bootstrapOnly && mode !== "stage" && !dependencyOnly && !compileOnly && publishCandidateIndex < 0)
    throw new Error("Linux native builds require --compile-only; signing, installation and capability manifests require macOS Apple Silicon.");
  if (publishCandidateIndex >= 0) {
    const path = process.argv[publishCandidateIndex + 1];
    if (!path || path.startsWith("--")) throw new Error("--publish-candidate requires its completed candidate path.");
    await publishPreparedCandidate(path);
  } else {
    await requireBuildSpace();
    if (bootstrapOnly) {
      await bootstrap();
      console.log("Private compiler, PostgreSQL development files and PCRE are ready; source staging, Haskell dependencies, native compilation and runtime packaging were not started.");
    } else {
      await bootstrapSource();
      if (mode === "stage") await stage();
      else await build();
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
