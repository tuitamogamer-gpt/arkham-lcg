import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:5187";
const output = "output/browser-first";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const checks = [],
  errors = [],
  localRequests = [];
try {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.origin !== new URL(base).origin
    )
      localRequests.push(request.url());
  });
  await page.goto(base);
  await page
    .locator(".night-dossier")
    .filter({ hasText: "Isabelle Barnes" })
    .click();
  const selected = page.locator(
    ".setup-modal .investigator-choice[aria-pressed='true']",
  );
  assert.equal(await selected.count(), 1);
  assert.match(await selected.innerText(), /Isabelle Barnes/);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  checks.push(
    "Home investigator dossier selects that investigator for a new party",
  );

  await page
    .getByRole("button", { name: "Expansions & campaigns", exact: true })
    .click();
  const library = page.getByRole("region", {
    name: "Campaign and expansion library",
  });
  await library.waitFor();
  assert.equal(await page.locator(".rules-connect-panel").count(), 0);
  await page
    .getByRole("searchbox", { name: "Search products" })
    .fill("zealot return");
  assert.ok(
    (await library.locator(".collection-products article").count()) > 0,
  );
  await page
    .getByRole("combobox", { name: "Product category", exact: true })
    .selectOption("starter-deck");
  await page
    .getByRole("heading", { name: "No products found.", exact: true })
    .waitFor();
  await library
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search products" })
    .fill("dunwich legacy");
  const browse = library.locator(".collection-products article").first();
  const productName = await browse.locator("h2").innerText();
  await browse.getByRole("button", { name: /^Browse cards:/ }).click();
  await page.locator(".collection-product-context").waitFor();
  assert.match(
    await page.locator(".collection-product-context").innerText(),
    new RegExp(productName),
  );
  assert.equal(
    await page
      .getByRole("checkbox", { name: /Show encounter and story cards/ })
      .isChecked(),
    false,
  );
  checks.push(
    "Product search, categories, reset and scoped archive navigation preserve sealed spoilers",
  );

  await page
    .getByRole("button", { name: "Investigator files", exact: true })
    .click();
  await page
    .getByPlaceholder("Investigator, set, or card number…")
    .fill("patel andre");
  await page
    .getByRole("button", {
      name: "View André Patel deck and source",
      exact: true,
    })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Play with expansions", exact: true })
      .count(),
    0,
  );
  checks.push(
    "Investigator search accepts reversed words and accents without unavailable play links",
  );

  await page
    .getByRole("button", { name: "Expansions & campaigns", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search products" })
    .fill("dunwich legacy");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}`,
    );
    await page.screenshot({
      path: `${output}/library-${width}.png`,
      fullPage: true,
    });
  }
  checks.push("Campaign library fits desktop and 390px/320px mobile screens");
  await page
    .getByRole("button", { name: "Choose party & play", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  checks.push(
    "Browser game setup is directly accessible from the expansion library",
  );
  await page.goto(
    `${base}/#investigation=00000000-0000-4000-8000-000000000031`,
  );
  await page.reload();
  await page
    .getByText(/This link belongs to a separate rules-engine investigation/)
    .waitFor();
  assert.deepEqual(localRequests, []);
  assert.deepEqual(errors, []);
  checks.push(
    "Legacy investigation links remain intact and never contact localhost",
  );
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ passed: true, checks, errors, localRequests }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  await browser.close();
}
