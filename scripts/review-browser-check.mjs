import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createGame, reduceGame } from "../tests/helpers.ts";
const base = process.env.BASE_URL || "http://localhost:5187";
await mkdir("output/review", { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const state = async () =>
  JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const advance = async () => {
  for (let guard = 0; guard < 80; guard++) {
    const s = await state();
    if (s.event)
      await page.getByRole("button", { name: "Continue game" }).click();
    else if (s.window)
      await page.getByRole("button", { name: "Pass Fast window" }).click();
    else if (s.decision?.choices.some((c) => c.id === "skip"))
      await page
        .locator(".decision-list>button")
        .filter({
          hasText: s.decision.choices.find((c) => c.id === "skip").label,
        })
        .click();
    else return s;
  }
  throw new Error("Checkpoint loop");
};
let fixture = createGame("easy", 42);
fixture = reduceGame(fixture, { type: "mulligan", ids: [] });
fixture.player.deck = [
  { id: "hidden-draw", code: "12089" },
  ...fixture.player.deck,
];
fixture.bag = ["0"];
await page.addInitScript((game) => {
  Object.defineProperty(navigator, "webdriver", { get: () => false });
  if (!localStorage.getItem("review-initialized")) {
    localStorage.setItem(
      "arkham-chronicle:spreading-flames:v1",
      JSON.stringify(game),
    );
    localStorage.setItem("review-initialized", "1");
  }
}, fixture);
await page.goto(base);
await page.getByRole("button", { name: "Current investigation" }).click();
await page.locator(".tutorial-next").click();
await page.locator(".tutorial-next").click();
await page.locator(".tutorial-next").click();
assert.match(
  await page.locator(".tutorial-card h3").innerText(),
  /Take an action/,
);
await page.getByRole("button", { name: "Investigate", exact: true }).click();
await advance();
await page.getByRole("button", { name: "Draw from the chaos bag" }).click();
await page.getByRole("button", { name: "Resolve the test" }).click();
await advance();
await page.waitForTimeout(150);
assert.match(
  await page.locator(".tutorial-card h3").innerText(),
  /How skill tests work/,
  "tutorial continues beyond the test without resetting",
);
await page.locator(".tutorial-next").click();
assert.match(await page.locator(".tutorial-card h3").innerText(), /Your hand/);
await page.screenshot({ path: "output/review/tutorial-after-test.png" });
await page.getByRole("button", { name: "Close tutorial" }).click();
await page.getByRole("button", { name: "Resource", exact: true }).click();
await advance();
assert.ok(await page.locator(".undo-button").isEnabled());
await page.getByRole("button", { name: "Draw card", exact: true }).click();
await advance();
assert.ok(
  await page.locator(".undo-button").isDisabled(),
  "draw discards earlier undo snapshots",
);
const drawn = await state();
await page.keyboard.press("Meta+z");
assert.equal(
  (await state()).actions,
  drawn.actions,
  "keyboard cannot undo a hidden draw",
);
await page.getByRole("button", { name: "Campaigns" }).click();
await page.getByRole("button", { name: "Start a new investigation" }).click();
await page.getByRole("button", { name: "Select Dexter Drake" }).click();
await page.getByRole("button", { name: "Select Isabelle Barnes" }).click();
assert.ok(
  await page.getByRole("button", { name: "Select Daniela Reyes" }).isDisabled(),
);
assert.ok(
  await page
    .getByRole("button", { name: "Select Trish Scarborough" })
    .isDisabled(),
);
await page.screenshot({ path: "output/review/five-investigator-setup.png" });
await page.getByRole("button", { name: "Enter Miskatonic University" }).click();
await page.getByRole("button", { name: "Continue to scenario intro" }).click();
await page.getByRole("button", { name: "Prepare opening hands" }).click();
for (let i = 0; i < 3; i++)
  await page.getByRole("button", { name: /Keep hand/ }).click();
await advance();
assert.equal((await state()).party.length, 3);
await page.screenshot({ path: "output/review/new-investigator-party.png" });
await page.getByRole("button", { name: "Settings & saves" }).click();
// Fill the slots with valid independent investigations, then attempt import.
const slots = Array.from({ length: 12 }, (_, i) => ({
  ...fixture,
  id: `review-slot-${i}`,
}));
await page.evaluate((games) => {
  for (const game of games)
    localStorage.setItem(
      `arkham-chronicle:save:${game.id}`,
      JSON.stringify(game),
    );
  localStorage.setItem(
    "arkham-chronicle:saves",
    JSON.stringify({
      active: games[0].id,
      slots: games.map((g) => ({
        id: g.id,
        updatedAt: new Date().toISOString(),
        party: g.partyOrder,
        round: g.round,
        act: g.act,
        difficulty: g.difficulty,
        status: g.status,
        result: null,
      })),
    }),
  );
}, slots);
const beforeImport = await state();
await page.locator('input[type="file"]').setInputFiles({
  name: "new-case.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({ ...fixture, id: "review-import-case" })),
});
await page
  .getByRole("status")
  .filter({ hasText: "save slots are full" })
  .waitFor();
assert.equal(
  (await state()).party.length,
  beforeImport.party.length,
  "failed import preserves the party",
);
await page.screenshot({ path: "output/review/full-slots-import.png" });
const doomPage = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
});
doomPage.on("pageerror", (e) => errors.push(e.message));
const doomCase = structuredClone(fixture);
doomCase.player.doom = 2;
doomCase.doom = 1;
doomCase.player.assets.push({
  id: "doom-tool",
  code: "12017",
  exhausted: false,
  uses: 0,
  damage: 0,
  horror: 0,
  doom: 1,
});
await doomPage.addInitScript((game) => {
  localStorage.setItem(
    "arkham-chronicle:spreading-flames:v1",
    JSON.stringify(game),
  );
  localStorage.setItem("arkham-chronicle:tutorial", "done");
}, doomCase);
await doomPage.goto(base);
await doomPage.getByRole("button", { name: "Current investigation" }).click();
await doomPage.getByText("1 on agenda · 3 on player cards").waitFor();
assert.ok(await doomPage.getByLabel("2 doom on Joe Diamond").isVisible());
await doomPage.locator(".investigator-mat").scrollIntoViewIfNeeded();
await doomPage.screenshot({ path: "output/review/doom-diagnostic.png" });
assert.ok(await doomPage.getByLabel("1 doom on Endurance").isVisible());
await doomPage.screenshot({
  path: "output/review/player-card-doom.png",
  fullPage: true,
});
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "Review browser regressions passed: tutorial, hidden draws, party limit, new seats, full-slot import.",
);
