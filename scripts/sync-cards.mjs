import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const api = "https://arkhamdb.com/api/public/cards/core_2026.json?encounter=1";
const repository = "https://github.com/zzorba/arkhamdb-json-data";
let apiCards = [];
try {
  const response = await fetch(api, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (
    !Array.isArray(result) ||
    result.length < 190 ||
    !result.every((c) => c.name && c.code)
  )
    throw new Error("Incomplete response");
  apiCards = result;
  console.log(
    `API returned ${apiCards.length} cards. Reconciling repository errata and hidden faces.`,
  );
} catch {
  console.log(
    "Public API unavailable. Using the maintained card data repository.",
  );
}
// Always reconcile with the source: the live API can omit hidden faces and
// inherit old reprint text (observed for the 2026 Machete update).
const temp = await mkdtemp(join(tmpdir(), "arkham-data-"));
let cards, revision;
try {
  execFileSync(
    "git",
    [
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      repository + ".git",
      temp,
    ],
    { stdio: "pipe" },
  );
  execFileSync("git", ["-C", temp, "sparse-checkout", "set", "pack"], {
    stdio: "pipe",
  });
  revision = execFileSync("git", ["-C", temp, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const all = new Map();
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const p = join(path, entry.name);
      if (entry.isDirectory()) await visit(p);
      else if (p.endsWith(".json")) {
        for (const c of JSON.parse(await readFile(p, "utf8")))
          if (c?.code) all.set(c.code, c);
      }
    }
  }
  await visit(join(temp, "pack"));
  function expand(c, seen = new Set()) {
    if (seen.has(c.code)) throw new Error("Circular duplicate");
    seen.add(c.code);
    if (c.duplicate_of) {
      if (!all.has(c.duplicate_of))
        throw new Error(`Missing parent ${c.duplicate_of}`);
      return { ...expand(all.get(c.duplicate_of), seen), ...c };
    }
    return c;
  }
  const apiMap = new Map(apiCards.map((c) => [c.code, c]));
  cards = [...all.values()]
    .filter((c) => c.pack_code === "core_2026")
    .map((c) => {
      const normalized = expand(c),
        remote = apiMap.get(c.code);
      return {
        ...normalized,
        ...(remote?.imagesrc ? { imagesrc: remote.imagesrc } : {}),
        ...(remote?.backimagesrc ? { backimagesrc: remote.backimagesrc } : {}),
        url: `https://arkhamdb.com/card/${c.code}`,
      };
    });
} finally {
  await rm(temp, { recursive: true, force: true });
}
if (
  cards.length < 190 ||
  !cards.every((c) => c.name && c.type_code && c.pack_code === "core_2026") ||
  new Set(cards.map((c) => c.code)).size !== cards.length
)
  throw new Error("Invalid card dataset; previous snapshot unchanged.");
cards.sort((a, b) => a.position - b.position || a.code.localeCompare(b.code));
const dest = resolve("public/data");
await mkdir(dest, { recursive: true });
await writeFile(
  join(dest, "core-2026.json"),
  JSON.stringify(cards, null, 2) + "\n",
);
await writeFile(
  join(dest, "source.json"),
  JSON.stringify(
    {
      pack: "core_2026",
      edition: "Core Set (2026)",
      source: repository,
      revision,
      retrievedAt: new Date().toISOString(),
      count: cards.length,
      api,
      apiCount: apiCards.length,
      notes:
        "Repository definitions take precedence over live API text. Duplicate definitions are expanded recursively; hidden faces are retained. API supplies image paths. Content remains property of Fantasy Flight Games.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Saved ${cards.length} complete 2026 definitions, including hidden faces and source errata.`,
);
