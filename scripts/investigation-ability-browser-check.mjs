import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createGame, reduceGame } from "../tests/helpers.ts";
import { acknowledgeEvents } from "./browser-pacing.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:5187";
const out = process.env.QA_OUT || "output/investigation-ability";
const key = "arkham-chronicle:spreading-flames:v1";
await mkdir(out, { recursive: true });
const browser = await (
  process.env.BROWSER === "webkit" ? webkit : chromium
).launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (e.type() === "error") errors.push(e.text());
});
page.setDefaultTimeout(10000);
const save = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
const asset = (id = "kit", code = "12031") => ({
  id,
  code,
  uses: 3,
  exhausted: false,
  damage: 0,
  horror: 0,
});
function ready() {
  const s = reduceGame(createGame("standard", 713), {
    type: "mulligan",
    ids: [],
  });
  s.player.assets = [asset()];
  s.player.hand = [{ id: "spare-kit", code: "12031" }];
  s.player.actions = 3;
  s.player.resources = 1;
  s.locations[0].clues = 6;
  s.bag = ["0"];
  return s;
}
async function load(s) {
  // Seed from an inert same-origin document so the old game's autosave cannot
  // overwrite the next fixture while React is mounting or reloading.
  await page.goto(`${base}/sigil.svg`);
  await page.evaluate(
    ({ s, key }) => localStorage.setItem(key, JSON.stringify(s)),
    { s, key },
  );
  await page.goto(base);
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  await page.evaluate(() => document.fonts.ready);
}
async function shot(name) {
  await page.evaluate(() =>
    Promise.all([...document.images].map((i) => i.decode().catch(() => {}))),
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png` });
}
const panel = () => page.locator(".ability-preview");
const use = (root) =>
  root.getByRole("button", { name: "Use ability · Investigate", exact: true });
const card = (id = "kit") =>
  page.locator(`[data-preview-asset-id="${id}"] .card-face`);
async function hover(id = "kit") {
  await card(id).scrollIntoViewIfNeeded();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
  await card(id).hover();
  await panel().waitFor();
}
try {
  await load(ready());
  const before = await save();
  await hover();
  assert.match(
    await panel().innerText(),
    /1 action · 1 supply · exhaust this card/,
  );
  assert.match(await panel().innerText(), /3 supplies left/);
  await shot("01-ready-choice");
  // Crossing from the card into the floating controls must not dismiss them.
  await use(panel()).hover();
  await page.waitForTimeout(300);
  assert.deepEqual(await save(), before);
  await panel().getByRole("button", { name: "Don’t use now" }).click();
  await panel().waitFor({ state: "hidden" });
  assert.deepEqual(await save(), before);

  await page.getByRole("button", { name: "Investigate", exact: true }).click();
  await acknowledgeEvents(page);
  assert.match(
    await page.locator(".investigation-source-summary").innerText(),
    /Basic investigation/,
  );
  let s = await save();
  assert.equal(s.player.assets[0].uses, 3);
  assert.equal(s.player.assets[0].exhausted, false);
  assert.equal(s.player.actions, 2);

  await load(ready());
  await hover();
  await use(panel()).dblclick();
  await acknowledgeEvents(page);
  s = await save();
  assert.equal(s.test.source, "kit");
  assert.equal(s.test.bonus, 1);
  assert.equal(s.player.actions, 2);
  assert.equal(s.player.resources, 1);
  assert.equal(s.player.assets[0].uses, 2);
  assert.equal(s.player.assets[0].exhausted, true);
  assert.match(
    await page.locator(".investigation-source-summary").innerText(),
    /Using Fingerprint Kit/,
  );
  await shot("02-ability-in-use");
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  assert.equal((await save()).test.source, "kit");

  for (const [name, edit, reason] of [
    [
      "exhausted",
      (s) => {
        s.player.assets[0].exhausted = true;
      },
      /Fingerprint Kit is exhausted/,
    ],
    [
      "empty",
      (s) => {
        s.player.assets[0].uses = 0;
      },
      /no uses left/,
    ],
    [
      "no-actions",
      (s) => {
        s.player.actions = 0;
      },
      /need 1 action/,
    ],
    [
      "ended-turn",
      (s) => {
        s.player.turnEnded = true;
      },
      /Finish the current resolution/,
    ],
  ]) {
    const fixture = ready();
    edit(fixture);
    await load(fixture);
    await hover();
    assert.equal(await use(panel()).isDisabled(), true, name);
    assert.match(await panel().innerText(), reason);
    if (name === "exhausted") await shot("03-exhausted");
  }

  const duplicate = ready();
  duplicate.player.assets.push(asset("kit-2"));
  duplicate.player.assets[0].exhausted = true;
  await load(duplicate);
  await hover("kit-2");
  await use(panel()).click();
  await acknowledgeEvents(page);
  s = await save();
  assert.equal(s.test.source, "kit-2");
  assert.equal(s.player.assets[0].uses, 3);
  assert.equal(s.player.assets[1].uses, 2);

  // A card in hand remains a read-only preview, even if another copy is in play.
  await load(ready());
  await page.locator(".hand-section .card-face").scrollIntoViewIfNeeded();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
  await page.locator(".hand-section .card-face").hover();
  await page.getByRole("tooltip").waitFor();
  assert.equal(await panel().count(), 0);
  await page.keyboard.press("Escape");

  // Keyboard can reach the controls, and declining leaves state untouched.
  await card().focus();
  await panel().waitFor();
  await page.keyboard.press("Tab");
  assert.equal(
    await use(panel()).evaluate((el) => document.activeElement === el),
    true,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await panel()
      .getByRole("button", { name: "Don’t use now" })
      .evaluate((el) => document.activeElement === el),
    true,
  );
  await page.keyboard.press("Enter");
  await panel().waitFor({ state: "hidden" });
  assert.equal(
    await card().evaluate((el) => document.activeElement === el),
    true,
  );
  assert.equal((await save()).player.actions, 3);

  // The click/touch detail route exposes the same explicit choice at narrow widths.
  // Also cover the system reduced-motion preference on mobile.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await load(ready());
    await page
      .getByRole("button", {
        name: "Choose Fingerprint Kit ability",
        exact: true,
      })
      .click();
    const detail = page.locator('.modal[aria-label="Fingerprint Kit"]');
    await use(detail).scrollIntoViewIfNeeded();
    const box = await use(detail).boundingBox();
    assert.ok(
      box.x >= 0 && box.x + box.width <= width + 1,
      "choice fits mobile width",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await shot(`04-mobile-${width}`);
    await use(detail).click();
    await acknowledgeEvents(page);
    assert.equal((await save()).test.source, "kit");
  }

  // Other investigation tools expose their own costs and Local Map's target.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const code of ["12033", "12049", "12088"]) {
    const fixture = ready();
    fixture.player.assets = [asset("tool", code)];
    if (code === "12033") {
      fixture.player.location = "12116";
      for (const l of fixture.locations) {
        l.active = true;
        l.revealed = true;
      }
    }
    await load(fixture);
    await hover("tool");
    assert.equal(await use(panel()).isEnabled(), true, code);
    if (code === "12033")
      assert.ok((await panel().locator("select option").count()) > 0);
    await use(panel()).click();
    await acknowledgeEvents(page);
    s = await save();
    assert.equal(s.player.actions, 2);
    assert.equal(s.player.assets[0].uses, code === "12088" ? 3 : 2);
    assert.ok(s.test || s.decision);
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/result.json`,
    JSON.stringify(
      { ok: true, browser: process.env.BROWSER || "chromium", errors },
      null,
      2,
    ),
  );
  console.log(
    "Investigation ability choices passed: hover, decline, basic/use costs, duplicate instances, locks, keyboard, mobile, reload, and all investigation tools.",
  );
} finally {
  await browser.close();
}
