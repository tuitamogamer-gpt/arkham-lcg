import { readFile, writeFile, mkdir, stat } from "node:fs/promises";

const cards = JSON.parse(await readFile("public/data/core-2026.json", "utf8"));
const manifest = JSON.parse(
  await readFile("public/data/art-manifest.json", "utf8").catch(() => "{}"),
);
const selected = process.env.CARD_CODES?.split(",");
const targets = [
  ...new Map(
    cards
      .filter((c) => !selected || selected.includes(c.code))
      .flatMap((c) => [
        {
          code: c.code,
          // Hidden linked faces can be absent from the API's image metadata.
          url: new URL(
            c.imagesrc || `/bundles/cards/${c.code}.jpg`,
            "https://arkhamdb.com",
          ).href,
        },
        ...(c.backimagesrc
          ? [
              {
                code: `${c.code}b`,
                url: new URL(c.backimagesrc, "https://arkhamdb.com").href,
              },
            ]
          : []),
      ])
      .map((c) => [c.code, c]),
  ).values(),
];
const previous = JSON.parse(
  await readFile("docs/card-image-sources.json", "utf8").catch(() => "{}"),
);
const sources = new Map((previous.images || []).map((c) => [c.code, c]));
const failed = [];
let cursor = 0;
// Originals stay in art-source/; the served WebP faces come from
// scripts/optimize-art.mjs, which must run after this script.
await mkdir("art-source/cards", { recursive: true });
async function worker() {
  while (cursor < targets.length) {
    const c = targets[cursor++];
    const ext = new URL(c.url).pathname.split(".").pop();
    let path = `art-source/cards/${c.code}.${ext}`;
    let downloadedFrom;
    let error;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const existing = await stat(path).catch(() => null);
        if (!existing || existing.size < 1000) {
          const url =
            attempt < 2
              ? `https://assets.arkham.build/optimized/${c.code}.jpg`
              : c.url;
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!r.ok || !r.headers.get("content-type")?.startsWith("image/"))
            throw new Error(`HTTP ${r.status}`);
          const bytes = new Uint8Array(await r.arrayBuffer());
          if (bytes.length < 1000) throw new Error("Incomplete image");
          path = `art-source/cards/${c.code}.${r.headers.get("content-type").includes("png") ? "png" : "jpg"}`;
          await writeFile(path, bytes);
          downloadedFrom = url;
        }
        manifest[c.code] = `/art/cards/${c.code}.webp`;
        if (downloadedFrom || !sources.has(c.code))
          sources.set(c.code, { ...c, url: downloadedFrom || c.url });
        error = undefined;
        break;
      } catch (e) {
        error = e.message;
      }
    }
    if (error) failed.push({ ...c, error });
    if (cursor % 25 === 0)
      console.log(`Checked ${cursor}/${targets.length} card faces`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await writeFile(
  "public/data/art-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  "docs/card-image-sources.json",
  JSON.stringify(
    {
      source: "ArkhamDB original scans and assets.arkham.build mirror",
      retrievedAt: new Date().toISOString(),
      images: [...sources.values()].sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
      failed,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Cached ${Object.keys(manifest).length} original card faces; ${failed.length} unavailable.`,
);
if (failed.length) console.log(JSON.stringify(failed));
process.exit(failed.length ? 1 : 0);
