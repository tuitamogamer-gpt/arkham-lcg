#!/usr/bin/env node
// Original extension staging. The independent Vue source stays outside Git.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(
  process.env.ARKHAM_RULES_SOURCE || "/private/tmp/arkham-upstream-research",
);
const frontend = resolve(source, "frontend");
const extension = resolve(project, "rules/extensions/barkham/frontend");
const upstreamRevision = "03a7f1e74925744f021f6e8fe0e39945d2c3a833";
const patches = [
  [
    "src/arkham/components/Location.vue",
    "import { Game } from '@/arkham/types/Game'",
    "import { Game } from '@/arkham/types/Game'\nimport { chronicleSniffedLocation } from '@homebrew/barkham/chronicleBarkhamState'",
  ],
  [
    "src/arkham/components/Location.vue",
    "const id = computed(() => props.location.id)",
    "const id = computed(() => props.location.id)\nconst chronicleSniffed = computed(() => chronicleSniffedLocation(props.game.investigators, props.location.id))",
  ],
  [
    "src/arkham/components/Location.vue",
    '<Locus v-if="locus" class="locus" />',
    '<Locus v-if="locus" class="locus" />\n          <span v-if="chronicleSniffed" class="chronicle-sniffed-location" title="Kate Winthpup: tests at this location have −1 difficulty.">Sniffed</span>',
  ],
  [
    "src/arkham/components/Location.vue",
    "<style scoped>",
    "<style scoped>\n.chronicle-sniffed-location { position: absolute; top: 0.25rem; left: 0.25rem; z-index: var(--z-index-4); padding: 0.2rem 0.4rem; border: 1px solid #dbc594; border-radius: 0.2rem; background: #30271e; color: #fff1d2; font-size: 0.75rem; pointer-events: none; }",
  ],
  [
    "src/arkham/components/Asset.vue",
    ':tokens="assetTokens"',
    ":tokens=\"assetTokens\"\n            :overrides=\"cardCode === 'c:barkham:014' ? { Supply: { tooltip: 'Treats' } } : {}\"",
  ],
  [
    "src/arkham/components/Investigator.vue",
    "const showCardsUnderneath = (e: Event) => emit('showCards', e, cardsUnderneath, \"Cards Underneath\", false)",
    'const showCardsUnderneath = (e: Event) => {\n  if (props.investigator.cardCode === "c:barkham:010" && !isCurrentPlayersInvestigator.value) return\n  emit(\'showCards\', e, cardsUnderneath, "Cards Underneath", false)\n}',
  ],
  [
    "src/arkham/helpers.ts",
    "import { ref, type Ref } from 'vue';",
    "import { ref, type Ref } from 'vue';\nimport { chronicleBarkhamImage } from '@homebrew/barkham/chronicleBarkhamArt'",
  ],
  [
    "src/arkham/helpers.ts",
    "export function imgsrc(src: string, ignoreVariants = false): string {",
    "export function imgsrc(src: string, ignoreVariants = false): string {\n  const barkhamImage = chronicleBarkhamImage(src)\n  if (barkhamImage) return barkhamImage",
  ],
  [
    "src/arkham/deckRestrictions.ts",
    "  const isLastPlayer = options.isLastPlayer ?? true",
    `  // Chronicle: Barkham characters and cards belong exclusively to this standalone.
  const isBarkham = scenarioId?.replace(/^c/, '') === ':barkham:022'
  const barkhamInvestigator = /^:barkham:(001|004|007|010|013)$/.test(deckInvestigatorCode(deckList))
  if (isBarkham && !barkhamInvestigator) return 'This scenario requires a Barkham investigator.'
  if (!isBarkham && (barkhamInvestigator || Object.keys(deckList.slots).some((code) => /^c?:barkham:/.test(code)))) return 'Barkham characters and cards can only be used in The Meddling of Meowlathotep.'
  const isLastPlayer = options.isLastPlayer ?? true`,
  ],
];
function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: frontend,
      stdio: "inherit",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`${command} failed (${code}).`)),
    );
  });
}
const revision = await new Promise((resolvePromise, reject) => {
  const child = spawn("git", ["rev-parse", "HEAD"], { cwd: source });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0
      ? resolvePromise(output.trim())
      : reject(new Error("No pinned external source checkout.")),
  );
});
if (revision !== upstreamRevision)
  throw new Error(
    "External source revision differs from the reviewed frontend boundary.",
  );
await cp(extension, resolve(frontend, "homebrew/barkham"), { recursive: true });
for (const [path, anchor, replacement] of patches) {
  const file = resolve(frontend, path);
  const contents = await readFile(file, "utf8");
  if (contents.includes(replacement)) continue;
  if (contents.split(anchor).length !== 2)
    throw new Error(`Frontend patch anchor changed in ${path}.`);
  await writeFile(file, contents.replace(anchor, replacement));
}
const sideStoriesPath = resolve(frontend, "src/arkham/data/side-stories.json");
const sideStories = JSON.parse(await readFile(sideStoriesPath, "utf8"));
const scenarios = JSON.parse(
  await readFile(resolve(extension, "scenarios.json"), "utf8"),
);
for (const scenario of scenarios) {
  const { i18n, ...entry } = scenario;
  const index = sideStories.findIndex((s) => s.id === entry.id);
  if (index < 0) sideStories.push(entry);
  else sideStories[index] = entry;
}
await writeFile(sideStoriesPath, JSON.stringify(sideStories, null, 2) + "\n");
const digest = createHash("sha256")
  .update(upstreamRevision)
  .update(JSON.stringify(patches));
async function hashFolder(folder) {
  for (const entry of (await readdir(folder, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) await hashFolder(path);
    else
      digest.update(path.slice(extension.length)).update(await readFile(path));
  }
}
await hashFolder(extension);
const sourceHash = digest.digest("hex");
if (!process.argv.includes("--stage")) {
  await run("npm", ["ci", "--no-audit", "--no-fund"], {
    env: {
      ...process.env,
      npm_config_cache: resolve("/private/tmp/arkham-frontend-npm-cache"),
    },
  });
  await run("npm", ["run", "build"]);
  await writeFile(resolve(frontend, "dist/source_hash"), sourceHash + "\n");
  await mkdir(resolve(project, "output/rules-server"), { recursive: true });
  await writeFile(
    resolve(project, "output/rules-server/frontend-build.json"),
    JSON.stringify(
      {
        upstreamRevision,
        sourceHash,
        frontend: resolve(frontend),
        dist: resolve(frontend, "dist"),
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `Barkham frontend ${process.argv.includes("--stage") ? "staged" : "built"}; source ${sourceHash}.`,
);
