import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createGame, reduceGame } from "../tests/helpers.ts";

const base = process.env.BASE_URL || "http://localhost:5187";
const output = "output/quality-pass";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const checks = [];
const errors = [];
const fixture = reduceGame(createGame("easy", 91), {
  type: "mulligan",
  ids: [],
});
const slot = `arkham-chronicle:save:${fixture.id}`;
try {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ({ fixture, slot }) => {
      localStorage.setItem("arkham-chronicle:tutorial", "done");
      // An intact payload without an index must be discoverable from the home page.
      if (!localStorage.getItem("quality-initialized")) {
        localStorage.setItem(slot, JSON.stringify(fixture));
        localStorage.setItem("quality-initialized", "1");
      }
    },
    { fixture, slot },
  );
  await page.goto(base);
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Skip to content",
  );
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "main-content",
  );
  checks.push("Keyboard skip link reaches main content");

  await page
    .getByRole("button", { name: "Saved investigations (1)", exact: true })
    .click();
  await page
    .getByText("Recovered save · date unknown", { exact: false })
    .waitFor();
  await page
    .locator(".save-slot-actions")
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await page.getByRole("button", { name: "Resource", exact: true }).waitFor();
  checks.push("Recovered investigation is visible and opens from home");

  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  await page.locator(".home-session").waitFor();
  assert.match(await page.locator(".home-session").innerText(), /Joe Diamond/);
  await page
    .getByRole("button", { name: "Field guide", exact: true })
    .first()
    .click();
  assert.equal(
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Field guide", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  await page.waitForFunction(
    () => document.activeElement.id === "main-content",
  );
  assert.equal(await page.title(), "Field guide · Arkham Chronicle");
  checks.push("Navigation updates focus, current page and browser title");

  await page
    .getByRole("button", { name: "Settings & saves", exact: true })
    .click();
  const actions = page.locator(".save-slot-actions");
  await actions.getByRole("button", { name: "Delete", exact: true }).click();
  await actions.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(
    await actions
      .getByRole("button", { name: "Confirm delete", exact: true })
      .count(),
    0,
  );
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (window.qualityFailStorage && key.startsWith("arkham-chronicle:save"))
        throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, key, value);
    };
    window.qualityFailStorage = true;
  });
  const preserved = await page.evaluate(
    (slot) => localStorage.getItem(slot),
    slot,
  );
  await actions.getByRole("button", { name: "Delete", exact: true }).click();
  await actions
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "could not be deleted" })
    .waitFor();
  assert.equal(
    await page.evaluate((slot) => localStorage.getItem(slot), slot),
    preserved,
  );
  checks.push("Cancelled and failed deletion preserve the investigation");

  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Current investigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Resource", exact: true }).click();
  await page.getByRole("button", { name: /View table/ }).click();
  await page
    .getByRole("button", { name: "Settings & saves", exact: true })
    .click();
  await page.locator(".save-health").waitFor();
  assert.equal(
    await page.evaluate((slot) => localStorage.getItem(slot), slot),
    preserved,
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export current investigation", exact: true })
    .click();
  assert.match((await download).suggestedFilename(), /^arkham-.*\.json$/);
  await page.evaluate(() => {
    window.qualityFailStorage = false;
  });
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await page.locator(".save-health").waitFor({ state: "detached" });
  assert.notEqual(
    await page.evaluate((slot) => localStorage.getItem(slot), slot),
    preserved,
  );
  checks.push(
    "Failed autosave offers export and a working retry without losing the prior copy",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Home overflow at ${width}`,
    );
    await page.screenshot({
      path: `${output}/home-${width}.png`,
      fullPage: true,
    });
  }
  checks.push("Saved-session home fits 1440px, 390px and 320px viewports");
  assert.deepEqual(errors, []);
  await context.close();

  // A resolution can save its slot successfully while the separate case
  // history write fails. Retry must finish both writes before clearing the
  // warning, and the idempotent history entry must survive a reload once.
  const resolutionContext = await browser.newContext({
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const resolutionPage = await resolutionContext.newPage();
  resolutionPage.on("pageerror", (error) => errors.push(error.message));
  const resolutionFixture = structuredClone(fixture);
  resolutionFixture.status = "resolution";
  resolutionFixture.campaign.result = "saved";
  resolutionFixture.campaign.xp = 4;
  await resolutionPage.addInitScript((resolution) => {
    if (localStorage.getItem("quality-resolution-initialized")) return;
    localStorage.setItem("arkham-chronicle:tutorial", "done");
    localStorage.setItem(
      "arkham-chronicle:spreading-flames:v1",
      JSON.stringify(resolution),
    );
    localStorage.setItem("quality-resolution-initialized", "1");
    const original = Storage.prototype.setItem;
    window.qualityFailRecord = true;
    Storage.prototype.setItem = function (key, value) {
      if (window.qualityFailRecord && key === "arkham-chronicle:record")
        throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, resolutionFixture);
  await resolutionPage.goto(base);
  await resolutionPage
    .getByRole("button", { name: "Settings & saves", exact: true })
    .click();
  await resolutionPage.locator(".save-health").waitFor();
  assert.equal(
    await resolutionPage.evaluate(
      (slot) => JSON.parse(localStorage.getItem(slot)).status,
      slot,
    ),
    "resolution",
  );
  assert.equal(
    await resolutionPage.evaluate(() =>
      localStorage.getItem("arkham-chronicle:record"),
    ),
    null,
  );
  await resolutionPage
    .getByRole("button", { name: "Retry saving", exact: true })
    .click();
  await resolutionPage
    .getByRole("status")
    .filter({ hasText: "Your browser still could not save" })
    .waitFor();
  assert.equal(await resolutionPage.locator(".save-health").isVisible(), true);
  await resolutionPage.evaluate(() => {
    window.qualityFailRecord = false;
  });
  await resolutionPage
    .getByRole("button", { name: "Retry saving", exact: true })
    .click();
  await resolutionPage.locator(".save-health").waitFor({ state: "detached" });
  const expectedRecord = [{ id: fixture.id, result: "saved", xp: 4 }];
  const readResolutionRecord = () =>
    resolutionPage.evaluate(() =>
      JSON.parse(localStorage.getItem("arkham-chronicle:record")).map(
        ({ id, result, xp }) => ({ id, result, xp }),
      ),
    );
  assert.deepEqual(await readResolutionRecord(), expectedRecord);
  await resolutionPage
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  assert.match(
    await resolutionPage.locator(".night-record").innerText(),
    /1 CASE CLOSED/,
  );
  await resolutionPage.reload();
  await resolutionPage.locator(".night-record").waitFor();
  assert.deepEqual(await readResolutionRecord(), expectedRecord);
  checks.push(
    "Resolution history-only quota failure remains visible until retry restores the record exactly once",
  );
  assert.deepEqual(errors, []);
  await resolutionContext.close();

  // A missing lazy module must be contained by the page boundary. This is an
  // intentional network failure, separate from the zero-error normal flows.
  const failureContext = await browser.newContext({ serviceWorkers: "block" });
  const failurePage = await failureContext.newPage();
  await failurePage.route(
    /\/(?:assets\/Archive-[^/]+\.js|src\/components\/Archive\.tsx)(?:\?.*)?$/,
    (route) => route.abort(),
  );
  await failurePage.goto(base);
  await failurePage
    .getByRole("button", { name: "Card archive", exact: true })
    .click();
  await failurePage
    .getByRole("heading", {
      name: "The card archive could not open.",
      exact: true,
    })
    .waitFor();
  await failurePage
    .getByRole("button", { name: "Return to campaigns", exact: true })
    .click();
  await failurePage
    .getByRole("button", { name: "Begin your investigation", exact: true })
    .waitFor();
  checks.push(
    "Failed collection module keeps navigation and campaign home usable",
  );
  await failureContext.close();
  await writeFile(
    `${output}/browser-checks.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
} finally {
  await browser.close();
}
