import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.BASE_URL || "http://localhost:5187";
const browser = await chromium.launch({ headless: true });
const errors = [];
const shot = async (page, name) => page.screenshot({ path: `output/improvements/${name}.png`, fullPage: false });
const state = async (page) => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const broken = async (page) => page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src));
const continueAll = async (page, max = 40) => {
  for (let i = 0; i < max; i++) {
    const s = await state(page);
    if (s.event) { await page.getByRole("button", { name: "Continue game" }).click(); await page.waitForTimeout(80); continue; }
    if (s.window) { await page.getByRole("button", { name: "Pass Fast window" }).click(); await page.waitForTimeout(80); continue; }
    if (s.decision) {
      const choice = s.decision.choices.find((c) => ["skip", "keep", "stay", "wait", "doom"].includes(c.id)) || s.decision.choices[0];
      await page.locator(".decision-list>button").filter({ hasText: choice.label }).first().click();
      await page.waitForTimeout(80);
      continue;
    }
    return s;
  }
  return state(page);
};
// Desktop
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
// The tutorial hides itself from automated browsers; this check wants to see it.
await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
await page.goto(base);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
await shot(page, "01-home");
await page.getByRole("button", { name: "Settings & saves" }).click();
await page.waitForTimeout(300);
await shot(page, "02-settings-empty");
await page.getByRole("button", { name: "Close dialog" }).click();
await page.getByRole("button", { name: "Begin your investigation", exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "easy", exact: true }).click();
assert.equal((await page.locator(".tempo-options button.selected").innerText()).toLowerCase(), "detailed");
await shot(page, "03-setup-tempo");
await page.getByRole("button", { name: "Enter Miskatonic University" }).click();
await page.getByRole("button", { name: "Continue to scenario intro" }).click();
await page.getByRole("button", { name: "Prepare opening hands" }).click();
await page.getByRole("button", { name: "Keep hand & begin" }).click();
await continueAll(page);
await page.waitForTimeout(800);
assert.ok(await page.locator(".tutorial-card").isVisible(), "tutorial shows on the first game");
await shot(page, "04-table-tutorial");
assert.deepEqual(await broken(page), [], "no broken images on the table");
// Undo: resource action pauses, then undo from the event footer.
await page.getByRole("button", { name: "Resource", exact: true }).click();
await page.waitForTimeout(300);
let s = await state(page);
assert.equal(s.event?.title, "Resource gained");
await shot(page, "05-event-footer-tempo-undo");
await page.locator(".event-footer").getByRole("button", { name: "Undo last action" }).click();
await page.waitForTimeout(200);
s = await state(page);
assert.equal(s.player.resources, 5, "undo restored the resources");
assert.equal(s.actions, 3, "undo restored the action");
assert.equal(s.event, null);
// Undo button in the action bar after an action.
await page.getByRole("button", { name: "Resource", exact: true }).click();
await continueAll(page);
await page.waitForTimeout(200);
await page.locator(".undo-button").click();
await page.waitForTimeout(200);
s = await state(page);
assert.equal(s.player.resources, 5);
// Chance of success in the test dialog.
await page.getByRole("button", { name: "Investigate", exact: true }).click();
await page.waitForTimeout(300);
await continueAll(page);
await page.waitForTimeout(200);
const chance = await page.locator(".test-chance strong").innerText();
assert.match(chance, /^\d+%$/);
await shot(page, "06-test-chance");
await page.getByRole("button", { name: "Draw from the chaos bag" }).click();
await page.waitForTimeout(3800);
await page.getByRole("button", { name: "Resolve the test" }).click();
await page.waitForTimeout(200);
await continueAll(page);
// Smart tempo through settings: a resource action no longer pauses.
await page.getByRole("button", { name: "Settings & saves" }).click();
await page.getByLabel("Game tempo").selectOption("smart");
await page.waitForTimeout(200);
assert.equal((await page.locator(".save-slots li").count()), 1, "one save slot listed");
await shot(page, "07-settings-slots");
await page.getByRole("button", { name: "Close dialog" }).click();
s = await state(page);
if (s.actions > 0 && !s.test && !s.decision) {
  const before = s.player.resources;
  await page.getByRole("button", { name: "Resource", exact: true }).click();
  await page.waitForTimeout(300);
  s = await state(page);
  assert.equal(s.event, null, "smart tempo does not pause on a resource action");
  assert.equal(s.player.resources, before + 1);
}
// A second investigation gets its own slot; the first stays.
await page.getByRole("button", { name: "Campaigns" }).click();
await page.getByRole("button", { name: "Start a new investigation" }).click();
await page.getByRole("button", { name: "Select Daniela Reyes" }).click();
await page.getByRole("button", { name: "Enter Miskatonic University" }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Settings & saves" }).click();
await page.waitForTimeout(200);
assert.equal(await page.locator(".save-slots li").count(), 2, "two save slots after a new game");
await page.locator(".save-slots li").nth(1).getByRole("button", { name: "Open" }).click();
await page.waitForTimeout(400);
s = await state(page);
assert.equal(s.party.length, 1, "the earlier solo investigation reopened");
await shot(page, "08-reopened-first-slot");
// Mobile
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
mobile.on("pageerror", (e) => errors.push("mobile pageerror: " + e.message));
mobile.on("console", (m) => { if (m.type() === "error") errors.push("mobile console: " + m.text()); });
await mobile.goto(base);
await mobile.waitForTimeout(600);
await shot(mobile, "09-mobile-home");
const nav = await mobile.locator(".sidebar").boundingBox();
assert.ok(nav && nav.y > 700 && nav.width > 380, `bottom navigation bar (${JSON.stringify(nav)})`);
await mobile.getByRole("button", { name: "Begin your investigation", exact: true }).click();
await mobile.getByRole("button", { name: "Enter Miskatonic University" }).click();
await mobile.getByRole("button", { name: "Continue to scenario intro" }).click();
await mobile.getByRole("button", { name: "Prepare opening hands" }).click();
await mobile.getByRole("button", { name: "Keep hand & begin" }).click();
await continueAll(mobile);
await mobile.waitForTimeout(600);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
assert.equal(overflow, false, "no horizontal overflow on mobile");
await shot(mobile, "10-mobile-table");
await mobile.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await mobile.waitForTimeout(300);
await shot(mobile, "11-mobile-table-bottom");
await browser.close();
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "visual checks passed with no browser errors");
process.exit(errors.length ? 1 : 0);
