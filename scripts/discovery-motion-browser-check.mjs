import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createGame, reduceGame as step } from "../tests/helpers.ts";
import { reduceGame as raw } from "../src/game/engine.ts";

import { acknowledgeEvents } from "./browser-pacing.mjs";

const base = process.env.BASE_URL || "http://localhost:5187";
const out = process.env.QA_OUT || "output/story-motion/browser";
const key = "arkham-chronicle:spreading-flames:v1";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (e.type() === "error") errors.push(e.text());
});
await page.addInitScript(() => {
  window.motionCalls = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    window.motionCalls.push({
      target: this.getAttribute("data-motion-target"),
      className: this.className,
      frames,
      options,
    });
    return animate.call(this, frames, options);
  };
});
const save = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
async function shot(name, wait = 850, fullPage = false) {
  await page.evaluate(() =>
    Promise.all([...document.images].map((i) => i.decode().catch(() => {}))),
  );
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
}
function ready() {
  const s = step(createGame("easy", 712), { type: "mulligan", ids: [] });
  s.player.hand = [{ id: "glass", code: "12034" }];
  s.player.deck = [
    { id: "drawn", code: "12089" },
    { id: "spare", code: "12091" },
  ];
  s.player.assets = [
    {
      id: "pistol",
      code: "12019",
      uses: 4,
      exhausted: false,
      damage: 0,
      horror: 0,
    },
  ];
  s.bag = ["0"];
  return s;
}
function trigger(s, effects) {
  s.decision = {
    title: "Fixture",
    description: "",
    choices: [{ id: "go", label: "Go", effects }],
  };
  return raw(s, { type: "choose", id: "go" });
}
async function load(s) {
  await page.goto(base);
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key, s },
  );
  await page.reload();
  await page
    .getByRole("button", {
      name:
        s.status === "resolution"
          ? "Open campaign record"
          : "Continue investigation",
      exact: true,
    })
    .click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}
const forbidden =
  /Smoke and Mirrors|Queen of Ash|Elokoss|Beneath the city|dangerous cult/;
await page.goto(base);
await shot("01-campaign", 1500, true);
assert.doesNotMatch(await page.locator("body").innerText(), forbidden);
await page.getByRole("button", { name: /Sealed chapter II\b/ }).click();
assert.doesNotMatch(await page.getByRole("dialog").innerText(), forbidden);
await shot("02-sealed-chapter");
await page.getByRole("button", { name: "Close dialog" }).click();
await page.getByRole("button", { name: /^Card archive/ }).click();
assert.doesNotMatch(
  await page.locator(".archive-grid").innerText(),
  /Servant of Flame|Dr. Henry Armitage|Elokoss|Past Curfew/,
);
// Player spells may mention a name; the hidden encounter identity itself is sealed.
await page.getByRole("textbox", { name: "Search cards" }).fill("12179");
assert.equal(await page.locator(".archive-grid .card-face").count(), 0);
await shot("03-sealed-search");

await load(ready());
await page.getByRole("button", { name: /^Inspect agenda:/ }).click();
assert.equal(await page.getByText("Reverse side", { exact: true }).count(), 0);
assert.ok(
  !(await page.getByRole("dialog").innerText()).includes("Smoke on the Wind"),
);
await shot("04-current-front");
await page.getByRole("button", { name: "Close dialog" }).click();
await page.getByRole("button", { name: "Resource", exact: true }).click();
const paused = await save();
assert.ok(paused.event);
await shot("05-resource-event");
await page.waitForTimeout(1000);
assert.deepEqual(
  await save(),
  paused,
  "animation completion never advances a checkpoint",
);
assert.ok(
  await page.evaluate(() =>
    window.motionCalls.some((c) => c.target === "resource-12004"),
  ),
);
await acknowledgeEvents(page);
await page
  .locator(".hand-card-wrap")
  .filter({
    has: page.getByRole("button", {
      name: "Inspect Magnifying Glass",
      exact: true,
    }),
  })
  .getByRole("button", { name: /Play ·/ })
  .click();
await acknowledgeEvents(page);
assert.ok((await save()).player.assets.some((c) => c.id === "glass"));
assert.ok(
  await page.evaluate(() =>
    window.motionCalls.some((c) => c.target === "card-glass"),
  ),
);
await page.getByRole("button", { name: "Draw card", exact: true }).click();
await shot("06-card-drawn");
await acknowledgeEvents(page);
assert.ok((await save()).player.hand.some((c) => c.id === "drawn"));
await shot("07-play-area", 850, true);

const enemy = ready();
enemy.enemies = [
  {
    id: "hound",
    code: "12122",
    location: enemy.player.location,
    engaged: true,
    engagedWith: "12004",
    exhausted: false,
    damage: 0,
  },
];
await load(enemy);
await page
  .getByRole("button", { name: "Fight Hellhound with M1911", exact: true })
  .click();
await acknowledgeEvents(page);
await page.getByRole("button", { name: "Draw from the chaos bag" }).click();
await acknowledgeEvents(page);
await shot("08-chaos-result");
assert.equal((await save()).test.stage, "revealed");
assert.equal(await page.locator(".revealed-token").count(), 1);
await page.getByRole("button", { name: "Resolve the test" }).click();
await acknowledgeEvents(page);
assert.equal((await save()).enemies[0].damage, 2);
assert.ok(
  await page.evaluate(() =>
    window.motionCalls.some((c) => c.target === "enemy-hound"),
  ),
);

const story = trigger(ready(), [{ kind: "advanceAct" }]);
await load(story);
assert.ok(await page.locator(".story-passage").isVisible());
assert.doesNotMatch(
  await page.getByRole("dialog").innerText(),
  /Searching for Dr. Armitage|Blaze of Glory/,
);
await shot("09-story-turn");
await page.getByRole("button", { name: "Inspect full card" }).click();
assert.equal(await page.getByText("Reverse side", { exact: true }).count(), 0);
await page.getByRole("button", { name: "Close dialog" }).click();
await acknowledgeEvents(page);
// The new map has unexplored locations: neither the archive nor summary exposes their face.
await page.getByRole("button", { name: /^Card archive/ }).click();
await page.getByRole("textbox", { name: "Search cards" }).fill("Dormitories");
assert.equal(await page.locator(".archive-grid .card-face").count(), 0);
await page
  .getByRole("textbox", { name: "Search cards" })
  .fill("Where There's Smoke");
await page.locator(".archive-grid .card-face").click();
await page.getByText("Reverse side", { exact: true }).click();
await shot("10-completed-reverse");
await page.getByRole("button", { name: "Close dialog" }).click();
await page.getByRole("button", { name: "Current investigation" }).click();
await page
  .getByRole("button", { name: "Move to Dormitories", exact: true })
  .click();
await acknowledgeEvents(page);
assert.equal((await save()).player.location, "12117");
assert.ok(
  await page.evaluate(() =>
    window.motionCalls.some((c) => c.target === "pawn-12004"),
  ),
);
await shot("11-explored-location", 850, true);
await page.getByRole("button", { name: /^Card archive/ }).click();
await page.getByRole("textbox", { name: "Search cards" }).fill("Dormitories");
assert.equal(await page.locator(".archive-grid .card-face").count(), 1);

const encounter = ready();
encounter.encounterDeck = ["12125"];
await load(trigger(encounter, [{ kind: "encounter" }]));
await shot("12-encounter-reveal");
assert.ok(await page.locator(".motion-encounter").isVisible());
const revealSave = await save();
await page.reload();
await page
  .getByRole("button", { name: "Continue investigation", exact: true })
  .click();
assert.deepEqual((await save()).event, revealSave.event);
assert.deepEqual((await save()).discoveries, revealSave.discoveries);
await page
  .getByRole("button", { name: "View table · keep paused", exact: true })
  .click();
await page.getByRole("button", { name: /^Card archive/ }).click();
await page
  .getByRole("textbox", { name: "Search cards" })
  .fill("Unspeakable Truths");
assert.equal(await page.locator(".archive-grid .card-face").count(), 1);
await page
  .getByRole("textbox", { name: "Search cards" })
  .fill("Forbidden Secrets");
assert.equal(await page.locator(".archive-grid .card-face").count(), 0);

// Both explicit settings and device preferences remove motion without changing pacing.
await load(ready());
await page.getByRole("button", { name: "Settings & saves" }).click();
await page
  .getByRole("combobox", { name: "Table animations" })
  .selectOption("off");
await shot("13-motion-settings");
await page.getByRole("button", { name: "Close dialog" }).click();
await page.evaluate(() => {
  window.motionCalls = [];
});
await page.getByRole("button", { name: "Resource", exact: true }).click();
assert.deepEqual(await page.evaluate(() => window.motionCalls), []);
assert.equal(
  await page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === "running").length,
  ),
  0,
);
await page.reload();
assert.equal(await page.locator("html").getAttribute("data-motion"), "off");
await page.getByRole("button", { name: "Settings & saves" }).click();
await page
  .getByRole("combobox", { name: "Table animations" })
  .selectOption("subtle");
await page.getByRole("button", { name: "Close dialog" }).click();
await load(ready());
await page.evaluate(() => {
  window.motionCalls = [];
});
await page.getByRole("button", { name: "Resource", exact: true }).click();
assert.deepEqual(await page.evaluate(() => window.motionCalls), []);
await acknowledgeEvents(page);
await page.getByRole("button", { name: "Settings & saves" }).click();
await page
  .getByRole("combobox", { name: "Table animations" })
  .selectOption("full");
await page.getByRole("button", { name: "Close dialog" }).click();
await page.emulateMedia({ reducedMotion: "reduce" });
await load(ready());
await page.evaluate(() => {
  window.motionCalls = [];
});
await page.getByRole("button", { name: "Resource", exact: true }).click();
assert.deepEqual(await page.evaluate(() => window.motionCalls), []);
assert.equal(
  await page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === "running").length,
  ),
  0,
);
const reducedSave = await save();
await page.waitForTimeout(900);
assert.deepEqual(await save(), reducedSave);
await page.emulateMedia({ reducedMotion: "no-preference" });

for (const width of [1280, 390, 320]) {
  await page.setViewportSize({ width, height: 850 });
  await load(story);
  const next = await page
    .getByRole("button", { name: "Continue game", exact: true })
    .boundingBox();
  assert.ok(
    next && next.y >= 0 && next.y + next.height <= 850,
    `continue visible at ${width}`,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await shot(`14-story-${width}`);
}
assert.deepEqual(errors, []);
await writeFile(
  `${out}/results.json`,
  JSON.stringify(
    {
      spoilers:
        "future chapters, identities, reverses and unexplored locations sealed; discoveries unlock through play and persist",
      motion:
        "resource, play, draw, token, combat, story, movement; no timer advancement",
      preferences: "full, subtle, off, persisted and device reduced motion",
      widths: [1440, 1280, 390, 320],
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
console.log("Discovery and motion browser checks passed.");
