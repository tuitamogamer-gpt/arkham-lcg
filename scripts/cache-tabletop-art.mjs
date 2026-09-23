import { readFile, writeFile, access } from "node:fs/promises";

// Cache both faces; backimagesrc does NOT consistently mean unrevealed.
// The visually verified orientation is recorded in LOCATION_ART in data.ts.
const cards = JSON.parse(await readFile("public/data/core-2026.json", "utf8"));
const manifest = JSON.parse(
  await readFile("public/data/art-manifest.json", "utf8"),
);
const sources = [];
for (const code of [
  "12105",
  "12113",
  "12116",
  "12117",
  "12118",
  "12119",
  "12120",
]) {
  const c = cards.find((c) => c.code === code);
  const url = new URL(c.backimagesrc, "https://arkhamdb.com").href;
  const path = `public/art/cards/${code}b.jpg`;
  try {
    try {
      await access(path);
    } catch {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("image/")
      )
        throw new Error(`Image unavailable (${response.status})`);
      await writeFile(path, new Uint8Array(await response.arrayBuffer()));
    }
    manifest[`${code}b`] = `/art/cards/${code}b.jpg`;
    sources.push({ code: `${code}b`, url, cached: true });
  } catch (error) {
    sources.push({
      code: `${code}b`,
      url,
      cached: false,
      reason: error.message,
    });
  }
}
await writeFile(
  "public/data/art-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  "docs/tabletop-art-sources.json",
  JSON.stringify({ retrievedAt: new Date().toISOString(), sources }, null, 2) +
    "\n",
);
console.log(
  `Cached ${sources.filter((s) => s.cached).length}/${sources.length} alternate card faces.`,
);
process.exit(0);
