import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const baseUrl = process.env.BASE_URL || "http://localhost:5187";
await mkdir("output/browser", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1040 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const state = async () =>
  JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const screenshot = async (name) =>
  page.screenshot({ path: `output/browser/${name}.png`, fullPage: true });
await page.goto(baseUrl);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await screenshot("01-campaign-desktop");
await page
  .getByRole("button", { name: "Begin your investigation", exact: true })
  .click();
await page.getByRole("button", { name: "easy", exact: true }).click();
await screenshot("02-setup");
await page.getByRole("button", { name: "Enter Miskatonic University" }).click();
await page.getByRole("dialog").locator(".card-face").first().click();
await page.getByRole("button", { name: "Replace 1 & begin" }).click();
assert.equal((await state()).status, "playing");
await screenshot("03-game-table");
await page.getByRole("button", { name: "Investigate", exact: true }).click();
const commits = page.locator(".commit-list>button");
if (await commits.count()) await commits.first().click();
await screenshot("04-skill-test");
const beforeReload = await state();
await page.reload();
await page
  .getByRole("button", { name: "Continue investigation", exact: true })
  .click();
assert.deepEqual(
  (await state()).test,
  beforeReload.test,
  "test resumes with committed cards intact",
);
await page.getByRole("button", { name: "Draw from the chaos bag" }).click();
assert.equal((await state()).test.stage, "revealed");
await screenshot("05-chaos-token");
await page.getByRole("button", { name: "Resolve the test" }).click();
for (let i = 0; i < 30; i++) {
  const s = await state();
  if (s.test) {
    await page
      .getByRole("button", {
        name:
          s.test.stage === "commit"
            ? "Draw from the chaos bag"
            : "Resolve the test",
      })
      .click();
  } else if (s.decision) {
    const choice =
      s.decision.choices.find((c) =>
        ["skip", "keep", "stay", "doom"].includes(c.id),
      ) || s.decision.choices[0];
    await page
      .locator(".decision-list>button")
      .filter({ hasText: choice.label })
      .click();
  } else break;
}
assert.equal((await state()).actions, 2);
await page.getByRole("button", { name: "Resource", exact: true }).click();
await page.getByRole("button", { name: "Draw card", exact: true }).click();
for (let i = 0; i < 30; i++) {
  const s = await state();
  if (s.test) {
    await page
      .getByRole("button", {
        name:
          s.test.stage === "commit"
            ? "Draw from the chaos bag"
            : "Resolve the test",
      })
      .click();
  } else if (s.decision) {
    await page.locator(".decision-list>button").first().click();
  } else break;
}
await page.getByRole("button", { name: "End turn", exact: true }).click();
for (let i = 0; i < 40; i++) {
  const s = await state();
  if (s.test) {
    await page
      .getByRole("button", {
        name:
          s.test.stage === "commit"
            ? "Draw from the chaos bag"
            : "Resolve the test",
      })
      .click();
  } else if (s.decision) {
    const choice =
      s.decision.choices.find((c) =>
        ["skip", "keep", "stay", "doom", "horror"].includes(c.id),
      ) || s.decision.choices[0];
    await page
      .locator(".decision-list>button")
      .filter({ hasText: choice.label })
      .click();
  } else break;
}
assert.equal((await state()).round, 2);
assert.equal((await state()).actions, 3);
await screenshot("06-second-round");
await page
  .getByRole("button", { name: "Card archive", exact: false })
  .first()
  .click();
await page.getByRole("textbox", { name: "Search cards" }).fill("Machete");
assert.equal(await page.locator(".archive-grid .card-face").count(), 1);
await page
  .getByRole("button", { name: "Inspect Machete", exact: true })
  .click();
assert.match(await page.getByRole("dialog").innerText(), /exhaust Machete/);
await page.getByRole("button", { name: "Close dialog" }).click();
await page.getByRole("textbox", { name: "Search cards" }).fill("");
await page
  .getByRole("combobox", { name: "Filter by class" })
  .selectOption("seeker");
assert.ok((await page.locator(".archive-grid .card-face").count()) > 5);
await screenshot("07-card-archive");
await page
  .getByRole("button", { name: "Settings & saves", exact: true })
  .click();
const downloadEvent = page.waitForEvent("download");
await page.getByRole("button", { name: "Export saved game" }).click();
const downloaded = await downloadEvent;
await downloaded.saveAs("output/browser/exported-save.json");
await page.getByRole("button", { name: "Close dialog" }).click();
await page.getByRole("button", { name: "Campaigns", exact: true }).click();
await page.getByRole("button", { name: /Smoke and Mirrors/ }).click();
assert.match(
  await page.getByRole("dialog").innerText(),
  /not|planned for a later build/,
);
await page.getByRole("button", { name: "Close dialog" }).click();
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
mobile.on("pageerror", (e) => errors.push(e.message));
await mobile.goto(baseUrl);
await mobile.evaluate(() => document.fonts.ready);
await mobile.waitForTimeout(500);
assert.ok(
  await mobile.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
  "no mobile horizontal overflow",
);
await mobile.screenshot({
  path: "output/browser/08-campaign-mobile.png",
  fullPage: true,
});
await mobile
  .getByRole("button", { name: "Begin your investigation", exact: true })
  .click();
await mobile
  .getByRole("button", { name: "Enter Miskatonic University" })
  .click();
await mobile.getByRole("button", { name: "Keep hand & begin" }).click();
assert.ok(
  await mobile.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
  "no game mobile horizontal overflow",
);
await mobile.screenshot({
  path: "output/browser/09-game-mobile.png",
  fullPage: true,
});
await writeFile(
  "output/browser/results.json",
  JSON.stringify(
    {
      errors,
      desktopState: await state(),
      checks: [
        "new game",
        "difficulty",
        "mulligan",
        "skill commit",
        "reload pending test",
        "chaos reveal",
        "resource",
        "draw",
        "round loop",
        "search",
        "card inspection",
        "filters",
        "save export",
        "future chapter disclosure",
        "mobile viewport",
      ],
    },
    null,
    2,
  ),
);
assert.deepEqual(errors, []);
console.log(
  "Browser checks passed. Desktop and mobile screenshots saved to output/browser.",
);
await browser.close();
