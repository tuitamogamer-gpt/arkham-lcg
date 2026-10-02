import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const catalog = JSON.parse(await readFile("public/data/catalog.json", "utf8"));
const importedCards = (
  await Promise.all(
    catalog.cardFiles.map((file) =>
      readFile(`public${file}`, "utf8").then(JSON.parse),
    ),
  )
).flat();
const visibleInvestigatorCount = importedCards.filter(
  (c) =>
    c.type_code === "investigator" &&
    !c.hidden &&
    !c.encounter_code &&
    c.faction_code !== "mythos",
).length;
const base = process.env.BASE_URL || "http://127.0.0.1:5187";
const out = process.env.QA_OUT || "output/catalog";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(base);
const nav = (name) =>
  page.getByRole("button", { name, exact: true }).first().click();
const shot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${out}/${name}.png`,
    fullPage: !/products-(390|320)$/.test(name),
  });
};
let failOnce = true;
await page.route(`**${catalog.cardFiles[0]}`, async (route) => {
  if (failOnce) {
    failOnce = false;
    await route.fulfill({ status: 503, body: "temporarily unavailable" });
  } else await route.continue();
});
await nav("Investigator files");
await page.getByRole("button", { name: "Retry catalog loading" }).waitFor();
await page.getByRole("button", { name: "Retry catalog loading" }).click();
await page
  .locator(".library-results")
  .filter({ hasText: `${visibleInvestigatorCount} investigator printings` })
  .waitFor();
for (const sealed of ["04244", "10661", "05046"]) {
  await page.getByLabel("Search investigators and sets").fill(sealed);
  assert.equal(await page.locator(".library-file").count(), 0);
}
await page.getByLabel("Search investigators and sets").fill("");
await page
  .getByLabel("Filter investigators by deck availability")
  .selectOption("starter");
assert.equal(await page.locator(".library-file").count(), 10);
await page.getByLabel("Search investigators and sets").fill("Nathaniel Cho");
await page
  .getByRole("button", { name: "View Nathaniel Cho deck and source" })
  .click();
const deck = page.getByLabel("Nathaniel Cho deck and source", { exact: true });
assert.match(await deck.innerText(), /sold separately/);
assert.match(await deck.innerText(), /33-card/);
await deck.locator(".library-deck-contents summary").click();
assert.ok((await deck.locator(".library-deck-card").count()) > 20);
await deck.locator(".library-upgrades summary").click();
await shot("01-separate-starter");
await deck.getByRole("button", { name: "Read investigator card" }).click();
await page.getByRole("dialog").waitFor();
assert.match(
  await page.locator(".collection-card-source").innerText(),
  /Nathaniel Cho/,
);
await page.getByRole("button", { name: "Close dialog" }).click();
await page.getByLabel("Search investigators and sets").fill("");
await page
  .getByLabel("Filter investigators by deck availability")
  .selectOption("all");
await page.getByLabel("Filter investigators by product").selectOption("dwlp");
assert.ok((await page.locator(".library-file").count()) >= 5);
await shot("02-expansion-investigators");
await nav("Card archive");
await page.getByLabel("Search cards").fill("Machete");
await page.getByLabel("Filter by product").selectOption("core");
assert.equal(await page.locator(".collection-card").count(), 1);
await page
  .getByRole("button", { name: "Inspect Machete", exact: true })
  .click();
assert.match(
  await page.locator(".collection-card-source").innerText(),
  /Core Set/,
);
await page.getByRole("button", { name: "Close dialog" }).click();
await page.getByLabel("Search cards").fill("");
await page.getByLabel("Filter by product").selectOption("all");
assert.equal(await page.locator(".collection-card").count(), 48);
const before = await page.locator(".collection-card").first().innerText();
await page.getByRole("button", { name: "Next", exact: true }).click();
assert.notEqual(
  await page.locator(".collection-card").first().innerText(),
  before,
);
await page.getByLabel("Search cards").fill("12129");
await page.getByLabel("Filter by product").selectOption("core_2026");
assert.equal(await page.locator(".collection-card").count(), 0);
await page.getByLabel("Show encounter and story cards").check();
assert.equal(await page.locator(".collection-card").count(), 1);
await page.getByRole("button", { name: "Inspect Fire!", exact: true }).click();
assert.match(await page.getByRole("dialog").innerText(), /Fire!/);
await page.getByRole("button", { name: "Close dialog" }).click();
await page
  .getByRole("button", { name: "Products & expansions", exact: true })
  .click();
await page.getByLabel("Search cards").fill("Dunwich");
assert.ok((await page.locator(".collection-products article").count()) >= 3);
await shot("03-product-browser");
await nav("Campaigns");
await page
  .getByRole("button", { name: "Begin your investigation", exact: true })
  .click();
await page
  .getByLabel("Filter investigators by deck availability")
  .selectOption("playable");
assert.equal(await page.locator(".investigator-choice").count(), 5);
await page
  .getByRole("button", { name: "Select Daniela Reyes", exact: true })
  .click();
await page
  .getByRole("button", { name: "Select Trish Scarborough", exact: true })
  .click();
assert.equal(
  await page.locator('.investigator-choice[aria-pressed="true"]').count(),
  3,
);
assert.ok(
  await page
    .getByRole("button", { name: "Select Dexter Drake", exact: true })
    .isDisabled(),
);
assert.match(
  await page.locator(".library-product-copy").innerText(),
  /Included in the 2026 core set/,
);
await shot("04-core-party-source");
await page.getByRole("button", { name: "Enter Miskatonic University" }).click();
let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.equal(state.party.length, 3);
const savedBefore = await page.evaluate(() =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) =>
        key.startsWith("arkham-chronicle:save:"),
      ),
    ),
  ),
);
await page.reload();
await page
  .getByRole("button", { name: "Continue investigation", exact: true })
  .click();
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.equal(state.party.length, 3);
assert.equal(state.collection.cards, catalog.counts.cardCount);
await shot("05-game-preserved");
await nav("Card archive");
await page.getByLabel("Search cards").fill("12129");
await page.getByLabel("Filter by product").selectOption("core_2026");
assert.equal(await page.locator(".collection-card").count(), 0);
assert.equal(
  await page.evaluate(() =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) =>
          key.startsWith("arkham-chronicle:save:"),
        ),
      ),
    ),
  ),
  savedBefore,
);
for (const width of [390, 320]) {
  await page.setViewportSize({ width, height: 900 });
  await page
    .getByRole("button", { name: "Products & expansions", exact: true })
    .click();
  await page.getByLabel("Search cards").fill("");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await shot(`06-products-${width}`);
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await page.getByLabel("Search cards").fill("Machete");
  await page.getByLabel("Filter by product").selectOption("all");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await shot(`07-cards-${width}`);
}
assert.deepEqual(errors, []);
await writeFile(
  `${out}/report.json`,
  JSON.stringify(
    {
      cards: catalog.counts.cardCount,
      products: catalog.counts.productCount,
      retry: true,
      separateDecks: 10,
      party: 3,
      savePreserved: true,
      spoilerBoundary: true,
      pageErrors: errors,
    },
    null,
    2,
  ),
);
await browser.close();
console.log("Catalog browser checks passed.");
