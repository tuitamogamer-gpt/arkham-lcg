import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  createGame as prepared,
  reduceGame as step,
} from "../tests/helpers.ts";
import { reduceGame as raw } from "../src/game/engine.ts";
import { acknowledgeEvents } from "./browser-pacing.mjs";
const out = process.env.QA_OUT || "output/story-complete/browser";
const base = process.env.BASE_URL || "http://127.0.0.1:5187";
const key = "arkham-chronicle:spreading-flames:v1";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (e.type() === "error") errors.push(e.text());
});
await page.addInitScript(() => {
  window.motionCalls = [];
  const original = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    window.motionCalls.push({
      target: this.dataset.motionTarget,
      className: this.className,
      frames,
    });
    return original.call(this, frames, options);
  };
});
const save = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
const summary = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const shot = async (name) => {
  await page.evaluate(() =>
    Promise.all([...document.images].map((i) => i.decode().catch(() => {}))),
  );
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
};
async function load(s) {
  await page.goto(base);
  await page.evaluate(
    ({ s, key }) => localStorage.setItem(key, JSON.stringify(s)),
    { s, key },
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
}
function ready() {
  const s = step(prepared("easy", 712), { type: "mulligan", ids: [] });
  s.player.hand = [
    { id: "glass", code: "12034" },
    { id: "vicious", code: "12025" },
  ];
  s.player.deck = [
    { id: "draw", code: "12089" },
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
  s.player.discard = [{ id: "discard", code: "12088" }];
  s.encounterDiscard = ["12130"];
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
async function hover(locator, expected, name) {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
  const before = await save();
  await locator.hover();
  const tooltip = page.getByRole("tooltip");
  await tooltip.waitFor();
  assert.match(await tooltip.innerText(), expected);
  assert.equal(await tooltip.count(), 1);
  const box = await tooltip.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(
    box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= viewport.width + 1 &&
      box.y + box.height <= viewport.height + 1,
    "preview remains in viewport",
  );
  assert.deepEqual(await save(), before, "preview never changes game state");
  if (name) await shot(name);
  await page.keyboard.press("Escape");
  await tooltip.waitFor({ state: "hidden" });
}
try {
  await page.goto(base);
  await page
    .getByRole("button", { name: "Begin your investigation", exact: true })
    .click();
  await hover(
    page.getByRole("button", { name: "Select Joe Diamond" }),
    /Joe Diamond/,
    "01-setup-hover",
  );
  await page
    .getByRole("button", { name: "Enter Miskatonic University" })
    .click();
  assert.equal((await save()).introduction, "campaign");
  assert.equal(await page.locator(".mulligan-hand").count(), 0);
  await shot("02-campaign-prologue");
  await page
    .getByRole("button", { name: "Continue to scenario intro" })
    .dblclick();
  assert.equal(
    (await save()).introduction,
    "scenario",
    "double click cannot skip a story page",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  assert.match(
    await page.locator(".campaign-story").innerText(),
    /Your friend is missing/,
  );
  const paused = await save();
  await page.waitForTimeout(900);
  assert.deepEqual(await save(), paused);
  await shot("03-scenario-intro");
  await page.getByRole("button", { name: "Prepare opening hands" }).click();
  await hover(
    page.locator(".mulligan-hand .card-face").first(),
    /asset|event|skill/i,
    "04-mulligan-hover",
  );
  await page.getByRole("button", { name: "Keep hand & begin" }).click();
  await acknowledgeEvents(page);
  const started = await save();
  await page
    .getByRole("button", { name: "Read introduction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to scenario intro" })
    .click();
  await page
    .getByRole("button", { name: "Return to investigation", exact: true })
    .click();
  assert.deepEqual(await save(), started);

  await load(ready());
  for (const [locator, pattern, name] of [
    [
      page.locator(".hand-row .card-face").first(),
      /Magnifying Glass/,
      "05-hand-hover",
    ],
    [
      page.locator(".table-asset .card-face").first(),
      /M1911/,
      "06-asset-hover",
    ],
    [
      page.getByRole("button", { name: /^Inspect agenda:/ }),
      /Past Curfew/,
      "07-agenda-hover",
    ],
    [page.locator(".location-card").first(), /Friend/, "08-location-hover"],
    [
      page.locator(".player-piles .deck-pile"),
      /Investigator deck/,
      "09-player-back",
    ],
    [
      page.locator(".encounter-piles .deck-pile"),
      /Encounter deck/,
      "10-encounter-back",
    ],
    [page.locator(".player-piles .discard-pile"), /Flashlight/, null],
    [page.locator(".encounter-piles .discard-pile"), /Noxious Smoke/, null],
  ])
    await hover(locator, pattern, name);
  await page.locator(".hand-row .card-face").first().focus();
  await page.getByRole("tooltip").waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".hand-row .card-face").first().click();
  await hover(
    page.locator(".detail-art .card-face"),
    /Magnifying Glass/,
    "11-dialog-hover",
  );
  await page.getByRole("button", { name: "Turn card over" }).click();
  assert.match(
    await page.locator(".detail-card-back").getAttribute("src"),
    /backs\/player/,
  );
  await shot("11b-card-turned-over");
  await page.getByRole("button", { name: "Show card front" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator(".player-piles .deck-pile").click();
  await hover(
    page.locator(".deck-list button").first(),
    /event|skill/i,
    "12-deck-list-hover",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();

  let s = ready();
  s.act = 3;
  s.locations.forEach((l) => {
    l.active = l.code !== "12113";
    l.revealed = l.active && l.code !== "12118";
  });
  s.player.location = "12116";
  s.enemies = [
    {
      id: "near",
      code: "12122",
      location: "12116",
      damage: 0,
      exhausted: false,
      engaged: true,
      engagedWith: "12004",
    },
    {
      id: "hunter",
      code: "12121",
      location: "12117",
      damage: 0,
      exhausted: false,
      engaged: false,
    },
  ];
  await load(s);
  await hover(
    page.locator('[data-motion-target="enemy-token-hunter"]'),
    /enemy/i,
    "13-distant-enemy-hover",
  );
  await hover(
    page.locator('[data-motion-target="location-12118"] .location-card'),
    /Unexplored location/i,
    "14-unexplored-face",
  );
  assert.equal(await page.locator(".enemy-miniature").count(), 2);
  await shot("15-enemies-on-map");
  await page
    .getByRole("button", { name: /Fight Hellhound/ })
    .filter({ hasText: "M1911" })
    .click();
  await acknowledgeEvents(page);
  assert.ok((await summary()).test);
  const calls = await page.evaluate(() => window.motionCalls);
  assert.ok(calls.some((c) => c.target === "test-scene"));
  await shot("16-fight-test");
  const commit = page.locator(".commit-list button").first();
  assert.ok(await commit.count());
  await hover(commit, /asset|event|skill/i, "17-commitment-hover");
  await commit.click();
  assert.ok((await summary()).test.committed.includes("vicious"));
  await page.getByRole("button", { name: "Draw from the chaos bag" }).click();
  await acknowledgeEvents(page);
  await page.getByRole("button", { name: "Resolve the test" }).click();
  await acknowledgeEvents(page);

  assert.equal(
    (await save()).enemies.some((e) => e.id === "near"),
    false,
  );
  assert.ok(
    await page.evaluate(() =>
      window.motionCalls.some((c) =>
        String(c.className).includes("motion-ghost"),
      ),
    ),
  );

  let revealed = ready();
  revealed.encounterDeck = ["12122", "12130"];
  revealed = trigger(revealed, [{ kind: "encounter" }]);
  await load(revealed);
  assert.equal(await page.locator(".encounter-flip-back").count(), 1);
  await shot("18-encounter-reveal");
  const before = await save();
  await page.waitForTimeout(1100);
  assert.deepEqual(
    await save(),
    before,
    "animation completion never advances revelation",
  );
  await shot("18b-encounter-front");
  await page.getByRole("button", { name: "Continue game" }).click();
  await acknowledgeEvents(page);
  assert.ok((await save()).enemies.length > 0);
  await shot("19-enemy-spawn");

  // Begin from a paused effect so the real map exists before Hunter movement.
  let hunter = ready();
  hunter.act = 3;
  hunter.locations.forEach((l) => {
    l.active = l.code !== "12113";
    l.revealed = l.active;
  });
  hunter.player.location = "12116";
  hunter.enemies = [
    {
      id: "hunter",
      code: "12122",
      location: "12117",
      damage: 0,
      engaged: false,
      exhausted: false,
    },
  ];
  hunter = trigger(hunter, [
    { kind: "gain", amount: 1 },
    { kind: "enemyMove", id: "hunter", target: "12116" },
  ]);
  await load(hunter);
  await page.evaluate(() => {
    window.motionCalls = [];
  });
  await page.getByRole("button", { name: "Continue game" }).click();
  assert.equal((await save()).enemies[0].location, "12116");
  assert.ok(
    await page.evaluate(() =>
      window.motionCalls.some(
        (c) =>
          c.target === "enemy-token-hunter" &&
          c.frames[0].translate &&
          c.frames[0].translate !== "0 0",
      ),
    ),
  );
  await shot("19b-hunter-movement");
  await page.getByRole("button", { name: "View table · keep paused" }).click();
  await shot("19c-hunter-map");
  const pausedHunter = await save();
  await page.waitForTimeout(850);
  assert.deepEqual(await save(), pausedHunter);
  await acknowledgeEvents(page);
  let attacking = await save();
  attacking = trigger(attacking, [
    { kind: "gain", amount: 1 },
    { kind: "attack", id: "hunter", source: "enemy" },
  ]);
  await load(attacking);
  await page.getByRole("button", { name: "Continue game" }).click();
  assert.equal(await page.locator(".vignette-attack").count(), 1);
  assert.ok(
    await page.evaluate(() =>
      window.motionCalls.some((c) => c.target === "enemy-token-hunter"),
    ),
  );
  await shot("19d-enemy-attack");

  for (const [effect, expected] of [
    [{ kind: "gain", amount: 1 }, "gain"],
    [{ kind: "heal", damage: 1 }, "heal"],
    [{ kind: "attachFire", target: "12113" }, "fire"],
  ]) {
    const fixture = ready();
    fixture.player.damage = 2;
    await load(trigger(fixture, [effect]));
    assert.equal(await page.locator(`.vignette-${expected}`).count(), 1);
    await shot(`20-action-${expected}`);
  }

  for (const id of ["save", "leave"]) {
    let fixture = ready();
    fixture = trigger(fixture, [{ kind: "victory" }]);
    await load(fixture);
    await acknowledgeEvents(page);
    assert.equal(
      await page.getByRole("region", { name: "Resolution 1" }).count(),
      1,
    );
    await shot(`21-resolution-choice-${id}`);
    await page
      .getByRole("button", {
        name: id === "save" ? /Stay and save/ : /Leave with Dr/,
      })
      .click();
    await acknowledgeEvents(page);
    assert.equal(
      (await save()).campaign.result,
      id === "save" ? "saved" : "pursuer",
    );
    assert.match(
      await page.locator(".resolution-passage").innerText(),
      id === "save" ? /Resolution 1 → 2/i : /Resolution 1 → 3/i,
    );
    await shot(`22-resolution-${id}`);
    await page.reload();
    await page.getByRole("button", { name: "Open campaign record" }).click();
    assert.equal(await page.locator(".resolution-page").count(), 1);
  }
  let failed = ready();
  failed.agenda = 3;
  failed.doom = 9;
  failed = trigger(failed, [{ kind: "doom", amount: 1 }]);
  await load(failed);
  await acknowledgeEvents(page);
  assert.match(
    await page.locator(".resolution-passage").innerText(),
    /No resolution reached/i,
  );
  assert.doesNotMatch(
    await page.locator(".resolution-passage").innerText(),
    /Resolution 1 →/i,
  );
  await shot("23-agenda-resolution");

  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: width > 600 ? 800 : 844 });
    await load(ready());
    await hover(
      page.locator(".hand-row .card-face").first(),
      /Magnifying Glass/,
      `24-preview-${width}`,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load(revealed);
  assert.equal(await page.locator(".encounter-flip-back").isVisible(), false);
  const animations = await page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === "running").length,
  );
  assert.equal(animations, 0);
  await shot("25-reduced-motion");
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(
      {
        errors,
        checks: [
          "mandatory intro and reload",
          "double-click guard",
          "read-only replay",
          "all card contexts",
          "keyboard and pointer previews",
          "viewport bounds",
          "unrevealed face privacy",
          "map enemy miniatures",
          "fight test motion",
          "encounter flip and spawn",
          "action motifs",
          "R1 choice and R2/R3/no-resolution",
          "resolution reload",
          "reduced motion",
        ],
        hunterMovement: "verified",
        enemyAttack: "verified",
      },
      null,
      2,
    ),
  );
  console.log("Story, previews, outcomes and motion browser checks passed.");
} catch (e) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  console.error(await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
}
