import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createGame, reduceGame, party } from "../src/game/engine.ts";
const baseUrl = process.env.BASE_URL || "http://localhost:5187";
const out = "output/pacing-browser";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const state = async () =>
  JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const saved = async () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("arkham-chronicle:spreading-flames:v1")),
  );
const shot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const next = () =>
  page.getByRole("button", { name: "Continue game", exact: true }).click();
let fixture = createGame("easy", 772, ["12004", "12007"]);
while (fixture.status === "mulligan")
  fixture = reduceGame(fixture, { type: "mulligan", ids: [] });
party(fixture).forEach((p) => {
  p.hand = [];
  p.deck = [{ id: `safe-${p.code}`, code: "12089" }];
});
fixture.companions[0].turnEnded = true;
fixture.companions[0].actions = 0;
fixture.encounterDeck = ["12125", "12125"];
fixture.bag = ["0"];
fixture.enemies = [
  {
    id: "attacker",
    code: "12123",
    location: "12113",
    damage: 0,
    exhausted: false,
    engaged: true,
    engagedWith: "12004",
  },
];
await page.goto(baseUrl);
await page.evaluate(
  (s) =>
    localStorage.setItem(
      "arkham-chronicle:spreading-flames:v1",
      JSON.stringify(s),
    ),
  fixture,
);
await page.reload();
await page
  .getByRole("button", { name: "Continue investigation", exact: true })
  .click();
await page.getByRole("button", { name: "Resource", exact: true }).click();
assert.equal((await state()).event.title, "Attack of opportunity");
assert.equal((await saved()).player.damage, 0);
const held = await state();
await page.waitForTimeout(1200);
assert.deepEqual(await state(), held, "no time-based advancement");
await shot("01-attack-announced");
await page.getByRole("button", { name: "View table · keep paused" }).click();
assert.ok(
  await page
    .getByRole("button", { name: "Resource", exact: true })
    .isDisabled(),
);
await page.keyboard.press("2");
assert.equal((await state()).activeInvestigator, "12004");
await shot("02-paused-table");
await page.getByRole("button", { name: "Event history", exact: true }).click();
assert.ok(
  await page.getByRole("dialog", { name: "Event history" }).isVisible(),
);
await shot("03-event-history");
await page.getByRole("button", { name: "Close dialog", exact: true }).click();
assert.deepEqual(await state(), held);
await page.getByRole("button", { name: "Read event", exact: true }).click();
await page.locator(".event-source >button").last().click();
assert.equal(await page.getByRole("dialog").count(), 1);
await page.getByRole("button", { name: "Close dialog", exact: true }).click();
assert.deepEqual(await state(), held, "inspection must not advance");
await page
  .getByRole("button", { name: "Continue game", exact: true })
  .dblclick({ delay: 60 });
assert.equal((await state()).event.title, "Damage and horror resolved");
assert.equal((await saved()).player.damage, 1);
assert.equal(
  (await saved()).player.resources,
  5,
  "double click must not skip the damage result",
);
await shot("04-damage-result");
await next();
assert.equal((await state()).event.title, "Resource gained");
assert.equal((await state()).player.resources, 6);
await next();
assert.equal((await state()).event, null);
await page.getByRole("button", { name: "End turn", exact: true }).click();
await page
  .getByRole("dialog")
  .getByRole("button", { name: "End turn", exact: true })
  .click();
assert.equal((await state()).event.title, "Investigation phase complete");
assert.equal((await state()).round, 1);
await shot("05-phase-checkpoint");
const events = [];
for (let n = 0; n < 60; n++) {
  const s = await state();
  assert.ok(s.event, "every automatic progression must stop for confirmation");
  events.push(s.event.title);
  if (s.event.title === "Encounter revealed") break;
  await next();
}
let s = await state();
assert.equal(s.event.title, "Encounter revealed");
assert.equal(s.event.actor, "12004");
assert.equal((await saved()).player.threats.length, 0);
assert.ok(
  events.includes("Enemy phase") &&
    events.includes("Upkeep phase") &&
    events.includes("Doom placed"),
);
await shot("06-encounter-reveal");
const beforeReload = await state();
await page.reload();
await page
  .getByRole("button", { name: "Continue investigation", exact: true })
  .click();
assert.deepEqual(
  await state(),
  beforeReload,
  "reload preserves exact pending reveal",
);
await page.getByRole("button", { name: "View table · keep paused" }).click();
await page
  .getByRole("button", { name: "Settings & saves", exact: true })
  .click();
const download = page.waitForEvent("download");
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Export saved game", exact: true })
  .click();
await (await download).saveAs(`${out}/pending-encounter.json`);
await page.getByRole("button", { name: "Close dialog", exact: true }).click();
await page.getByRole("button", { name: "Read event", exact: true }).click();
await next();
assert.equal((await saved()).player.threats.length, 1);
// Import the earlier paused reveal; it must still be unresolved, not applied twice.
await page.getByRole("button", { name: "View table · keep paused" }).click();
await page
  .getByRole("button", { name: "Settings & saves", exact: true })
  .click();
await page
  .locator("input[type=file]")
  .setInputFiles(`${out}/pending-encounter.json`);
await page.waitForFunction(
  (id) => JSON.parse(window.render_game_to_text()).event?.id === id,
  beforeReload.event.id,
);
assert.equal((await saved()).player.threats.length, 0);
assert.equal((await state()).event.id, beforeReload.event.id);
if (await page.getByRole("button", { name: "Read event", exact: true }).count())
  await page.getByRole("button", { name: "Read event", exact: true }).click();
await page.setViewportSize({ width: 1280, height: 800 });
await shot("07-laptop-reveal");
const footer = await page.locator(".event-footer").boundingBox();
assert.ok(
  footer.y + footer.height <= 800 && footer.y >= 0,
  "continue footer remains visible on laptop",
);
await next();
assert.equal((await saved()).player.threats.length, 1);
await next();
assert.equal((await state()).event.title, "Encounter complete");
assert.match(await page.locator(".encounter-route").innerText(), /threat area/);
await next();
assert.equal((await state()).event.title, "Encounter revealed");
assert.equal((await state()).event.actor, "12007");
assert.equal((await saved()).player.threats.length, 0);
for (let n = 0; n < 20 && (await state()).event; n++) await next();
s = await state();
assert.equal(s.phase, "investigation");
assert.equal(s.round, 2);
assert.equal(s.event, null);
const final = await saved();
assert.ok(party(final).every((p) => p.threats.length === 1));
assert.deepEqual(errors, []);
await writeFile(
  `${out}/results.json`,
  JSON.stringify(
    {
      baseUrl,
      errors,
      checks: [
        "attack announced before damage",
        "no timer progression",
        "double click cannot skip a checkpoint",
        "locked actions and keyboard while paused",
        "table view stays paused",
        "history is read only",
        "source card inspection",
        "before and after changes",
        "phase checkpoints",
        "encounter revealed before effects",
        "pending reveal reload",
        "export/import pending event",
        "laptop confirmation visibility",
        "separate investigator encounters",
        "manual return to investigation",
      ],
      events,
    },
    null,
    2,
  ),
);
await browser.close();
console.log("Player-controlled pacing browser checks passed.");
