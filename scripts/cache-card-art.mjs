import { readFile, writeFile, mkdir, access } from "node:fs/promises";
const cards = JSON.parse(await readFile("public/data/core-2026.json", "utf8"));
const manifest = {};
const failed = [];
let cursor = 0;
let failuresInARow = 0;
let stopped = false;
await mkdir("public/art/cards", { recursive: true });
async function worker() {
  while (cursor < cards.length && !stopped) {
    const c = cards[cursor++];
    if (!c.imagesrc) continue;
    const url = new URL(c.imagesrc, "https://arkhamdb.com").href;
    const ext = c.imagesrc.split(".").pop();
    const path = `public/art/cards/${c.code}.${ext}`;
    try {
      try {
        await access(path);
      } catch {
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!r.ok || !r.headers.get("content-type")?.startsWith("image/"))
          throw new Error(String(r.status));
        await writeFile(path, new Uint8Array(await r.arrayBuffer()));
      }
      failuresInARow = 0;
      manifest[c.code] = `/art/cards/${c.code}.${ext}`;
    } catch (e) {
      failed.push({ code: c.code, error: e.message });
      if (++failuresInARow >= 6) stopped = true;
    }
  }
}
await Promise.all(Array.from({ length: 2 }, worker));
await writeFile(
  "public/data/art-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  "docs/card-image-sources.json",
  JSON.stringify(
    {
      source: "https://arkhamdb.com",
      retrievedAt: new Date().toISOString(),
      images: cards
        .filter((c) => manifest[c.code])
        .map((c) => ({
          code: c.code,
          url: new URL(c.imagesrc, "https://arkhamdb.com").href,
        })),
      failed,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Cached ${Object.keys(manifest).length} original card scans; ${failed.length} unavailable.`,
);

// All file writes have completed; aborting fetches can leave idle sockets open.
process.exit(0);
