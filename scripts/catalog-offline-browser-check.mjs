import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.BASE_URL || "http://127.0.0.1:5193";
const out = "output/catalog-offline";
const catalog = JSON.parse(await readFile("public/data/catalog.json", "utf8"));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(base);
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
});
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller);
await page.waitForFunction(async (files) => {
  const cached = await Promise.all(
    files.map((file) => caches.match(file, { ignoreSearch: true })),
  );
  return cached.every(Boolean);
}, catalog.cardFiles);
await context.setOffline(true);
await page.reload();
await page
  .getByRole("button", { name: "Investigator files", exact: true })
  .first()
  .click();
await page.getByLabel("Search investigators and sets").fill("Bark Harrigan");
await page
  .getByRole("button", { name: "View Bark Harrigan deck and source" })
  .waitFor();
await page
  .getByRole("button", { name: "View Bark Harrigan deck and source" })
  .click();
assert.match(
  await page.locator(".library-product-copy").innerText(),
  /Barkham/,
);
assert.match(
  await page.locator(".library-deckbuilding").innerText(),
  /Guardian/,
);
await page.screenshot({ path: `${out}/barkham-offline.png` });
await page
  .getByRole("button", { name: "Card archive", exact: true })
  .first()
  .click();
await page.getByLabel("Filter by product").selectOption("barkham");
await page.getByLabel("Show encounter and story cards").check();
assert.match(
  await page.locator(".archive-count").innerText(),
  /62 cards found/,
);
await page.getByRole("button", { name: "Next", exact: true }).click();
assert.equal(await page.locator(".collection-card").count(), 14);
await page
  .getByRole("button", { name: "Products & expansions", exact: true })
  .click();
await page.getByLabel("Search cards").fill("Children of Blood");
assert.equal(await page.locator(".collection-products article").count(), 1);
await page.screenshot({ path: `${out}/product-offline.png` });
assert.deepEqual(errors, []);
await writeFile(
  `${out}/report.json`,
  JSON.stringify(
    {
      offline: true,
      cardShardsCached: catalog.cardFiles.length,
      totalCards: catalog.counts.cardCount,
      barkhamCards: 62,
      productAvailable: "Children of Blood",
      pageErrors: errors,
    },
    null,
    2,
  ),
);
await browser.close();
console.log("Offline collection checks passed.");
