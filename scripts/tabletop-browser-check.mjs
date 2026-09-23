import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createGame, party } from "../src/game/engine.ts";
import { BAGS } from "../src/game/data.ts";
import { reduceGame } from "../tests/helpers.ts";
import { acknowledgeEvents } from "./browser-pacing.mjs";

const base = process.env.BASE_URL || "http://localhost:5187";
const out = "output/tabletop-research/verified";
const key = "arkham-chronicle:spreading-flames:v1";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const saved = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
const summary = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function load(s) {
  await page.goto(base);
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key, s },
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  await page.evaluate(() => document.fonts.ready);
}
async function shot(name, fullPage = false) {
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
  });
  // Let the existing dialog entrance transition finish before visual review.
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
}
let fixture = createGame("easy", 7331, ["12004", "12001", "12007"]);
while (fixture.status === "mulligan")
  fixture = reduceGame(fixture, { type: "mulligan", ids: [] });
fixture.act = 3;
fixture.doom = 1;
fixture.locations.forEach((l) => {
  l.active = l.code !== "12113";
  l.revealed = l.active && l.code !== "12118";
  l.clues = l.revealed && l.code !== "12116" ? 3 : 0;
  l.fire = l.code === "12119";
});
party(fixture).forEach((p, i) => (p.location = ["12116", "12117", "12120"][i]));
fixture.player.assets = [
  {
    id: "fingerprints",
    code: "12031",
    exhausted: true,
    uses: 2,
    damage: 0,
    horror: 0,
  },
  {
    id: "machete",
    code: "12020",
    exhausted: false,
    uses: 0,
    damage: 0,
    horror: 0,
  },
  {
    id: "laboratory-assistant",
    code: "12032",
    exhausted: false,
    uses: 0,
    damage: 1,
    horror: 0,
  },
];
fixture.player.damage = 2;
fixture.player.horror = 1;
fixture.player.clues = 3;
fixture.player.resources = 6;
fixture.player.hand = [
  "12034",
  "12088",
  "12093",
  "12089",
  "12019",
  "12038",
  "12092",
].map((code, i) => ({ id: `visible-hand-${i}`, code }));
fixture.player.discard = [{ id: "discard-display", code: "12093" }];
fixture.encounterDiscard = ["12125", "12121"];
fixture.victory = ["12114"];
fixture.enemies = [
  {
    id: "distant",
    code: "12121",
    location: "12117",
    damage: 1,
    exhausted: false,
    engaged: true,
    engagedWith: "12001",
  },
];
await load(fixture);
const original = await saved();

// Public inspection must not advance the turn, change the bag or expose deck order.
await page
  .getByRole("button", { name: "Inspect chaos bag", exact: true })
  .click();
assert.equal(
  await page.locator(".bag-token-list .chaos-token").count(),
  fixture.bag.length,
);
await shot("chaos-bag");
await page.getByRole("button", { name: "Close dialog", exact: true }).click();
assert.deepEqual(await saved(), original);
await page
  .getByRole("button", { name: "Encounter deck and discard", exact: true })
  .click();
assert.equal(await page.locator(".public-pile-list .card-face").count(), 2);
await page.locator(".public-pile-list .card-face").first().click();
await page
  .getByRole("dialog")
  .last()
  .getByRole("button", { name: "Close dialog", exact: true })
  .click();
await page.getByRole("button", { name: "Close dialog", exact: true }).click();
assert.deepEqual(await saved(), original);
await page
  .getByRole("button", { name: "Victory display 1", exact: true })
  .click();
assert.equal(await page.locator(".public-pile-list .card-face").count(), 1);
await page.keyboard.press("Escape");
assert.deepEqual(await saved(), original);
await page
  .getByRole("button", { name: "Inspect your deck and discard", exact: true })
  .click();
assert.ok(
  await page
    .getByRole("dialog")
    .getByText("The draw order is hidden.", { exact: false })
    .isVisible(),
);
await page.keyboard.press("Escape");
assert.deepEqual(await saved(), original);
await page
  .getByRole("button", { name: "Read Dormitories", exact: true })
  .click();
await page.keyboard.press("Escape");
assert.deepEqual(
  await saved(),
  original,
  "reading a connected location costs no action",
);
const hidden = page.locator(".map-location.unrevealed .location-card img");
assert.ok((await hidden.getAttribute("src")).endsWith("12118.jpg"));
assert.equal(
  await page.locator(".map-location.unrevealed .token-clue").count(),
  0,
);
assert.equal(await page.locator(".table-asset.exhausted").count(), 1);

const geometry = [];
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(150);
  await shot(`table-${viewport.width}`, true);
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return r.right > innerWidth + 1 && !n.closest(".hand-row");
      })
      .slice(0, 25)
      .map((n) => ({
        cls: n.className,
        right: n.getBoundingClientRect().right,
        width: n.getBoundingClientRect().width,
      })),
  }));
  assert.ok(
    overflow.width <= viewport.width,
    `${viewport.width}px page overflow ${JSON.stringify(overflow)}`,
  );
  const boxes = await page.locator(".map-location").evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return {
        name: n.getAttribute("aria-label"),
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
      };
    }),
  );
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      assert.ok(
        a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y,
        `${viewport.width}px overlap: ${JSON.stringify(a)}, ${JSON.stringify(b)}`,
      );
    }
  const action = await page.locator(".action-bar").boundingBox();
  if (viewport.width >= 1280)
    assert.ok(
      action.y + action.height <= viewport.height,
      `${viewport.width}px controls need scrolling`,
    );
  geometry.push({ viewport, action, boxes });
}
await page.setViewportSize({ width: 1440, height: 1000 });
await page.evaluate(() => scrollTo(0, 0));
await page
  .getByRole("button", { name: "Move to Dormitories", exact: true })
  .click();
assert.ok((await summary()).event, "moving still pauses for the player");
await acknowledgeEvents(page);
assert.equal((await saved()).player.location, "12117");
assert.equal((await saved()).player.actions, original.player.actions - 1);

// Playing a card transfers its visible face from the hand onto the personal mat.
const playFixture = structuredClone(fixture);
playFixture.player.assets = [];
await load(playFixture);
const play = page
  .locator(".hand-card-wrap")
  .filter({
    has: page.getByRole("button", {
      name: "Inspect Magnifying Glass",
      exact: true,
    }),
  })
  .getByRole("button", { name: "Play · 1 resources", exact: true });
await play.click();
await acknowledgeEvents(page);
assert.ok((await saved()).player.assets.some((a) => a.code === "12034"));
assert.equal(await page.locator(".table-asset").count(), 1);
await shot("played-asset", true);

// A late threat has a real card face and retains its original fight/evade controls.
const threat = structuredClone(fixture);
threat.enemies = [
  {
    id: "nearby",
    code: "12121",
    location: "12116",
    damage: 1,
    exhausted: false,
    engaged: true,
    engagedWith: "12004",
  },
];
await load(threat);
assert.equal(await page.locator(".enemy-card-preview img").count(), 1);
await shot("threat-area", true);
await page.getByRole("button", { name: /^Fight / }).click();
await acknowledgeEvents(page);
assert.ok((await summary()).test, "fight still starts a skill test");
await shot("fight-test");

const hard = structuredClone(fixture);
hard.difficulty = "hard";
hard.bag = [...BAGS.hard];
await load(hard);
await page
  .getByRole("button", { name: "Inspect chaos bag", exact: true })
  .click();
assert.ok(
  (await page.locator(".bag-reference img").getAttribute("src")).endsWith(
    "12105b.jpg",
  ),
);
assert.ok(
  await page
    .locator(".bag-reference")
    .getByText("Hard / Expert", { exact: false })
    .isVisible(),
);
assert.deepEqual(errors, []);
await writeFile(
  `${out}/result.json`,
  JSON.stringify(
    {
      passed: true,
      errors,
      geometry,
      checks: [
        "public inspection does not mutate play",
        "unrevealed faces keep clues hidden",
        "desktop and mobile geometry",
        "connected location read versus move",
        "card play appears on mat",
        "enemy fight remains functional",
        "hard chaos reference uses reverse face",
      ],
    },
    null,
    2,
  ),
);
await browser.close();
console.log("Tabletop browser checks passed. No browser errors.");
