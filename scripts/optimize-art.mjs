// Generates the WebP images served by the app from the original scans kept in
// art-source/. Full-size faces are used for inspection and magnification;
// thumbnails are used on the table, in hands and in the archive.
import { readdir, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import sharp from "sharp";

const FULL = { quality: 72, effort: 6 };
const THUMB = { quality: 66, effort: 6 };
const THUMB_WIDTH = 360; // portrait cards; landscape cards use 480
const LANDSCAPE_WIDTH = 480;
let before = 0,
  after = 0;
async function size(path) {
  return (await stat(path).catch(() => ({ size: 0 }))).size;
}
async function convert(input, output, options, resize) {
  let image = sharp(input);
  if (resize) image = image.resize(resize);
  await mkdir(output.slice(0, output.lastIndexOf("/")), { recursive: true });
  await writeFile(output, await image.webp(options).toBuffer());
  before += await size(input);
  after += await size(output);
}
const name = (file) => file.replace(/\.(jpg|jpeg|png)$/i, "");
const cards = (await readdir("art-source/cards")).filter((f) =>
  /\.(jpg|jpeg|png)$/i.test(f),
);
let done = 0;
async function worker() {
  while (done < cards.length) {
    const file = cards[done++];
    const meta = await sharp(`art-source/cards/${file}`).metadata();
    const landscape = (meta.width || 0) > (meta.height || 0);
    await convert(
      `art-source/cards/${file}`,
      `public/art/cards/${name(file)}.webp`,
      FULL,
    );
    await convert(
      `art-source/cards/${file}`,
      `public/art/cards/thumb/${name(file)}.webp`,
      THUMB,
      { width: landscape ? LANDSCAPE_WIDTH : THUMB_WIDTH },
    );
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
for (const back of ["player", "encounter"])
  await convert(
    `art-source/backs/${back}.png`,
    `public/art/backs/${back}.webp`,
    FULL,
    { width: 708 },
  );
for (const [file, width, quality] of [
  ["miskatonic.png", 1672, 76],
  ["chaos-bag.jpg", 900, 80],
  ["joe-card.png", undefined, 80],
  ["intuition.png", undefined, 80],
  ["fingerprint.png", undefined, 80],
  ["magnifying.png", undefined, 80],
  ["12020.jpg", undefined, 80],
])
  await convert(
    `art-source/${file}`,
    `public/art/${name(file)}.webp`,
    { quality, effort: 5 },
    width ? { width } : undefined,
  );
// The manifest keeps pointing at the served (WebP) faces.
const manifest = JSON.parse(
  await readFile("public/data/art-manifest.json", "utf8"),
);
for (const code of Object.keys(manifest))
  manifest[code] = `/art/cards/${code}.webp`;
await writeFile(
  "public/data/art-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Converted ${cards.length} card faces and ${9} other images: ${(before / 1048576).toFixed(1)} MB of originals → ${(after / 1048576).toFixed(1)} MB of WebP.`,
);
