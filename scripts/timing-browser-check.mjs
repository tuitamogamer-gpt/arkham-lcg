import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createGame, reduceGame, party } from "../src/game/engine.ts";

const base = process.env.BASE_URL || "http://localhost:5187";
const out = process.env.TIMING_OUTPUT || "output/timing-windows/browser";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (e.type() === "error") errors.push(e.text());
});
const key = "arkham-chronicle:spreading-flames:v1";
const saved = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
const summary = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const dialog = () => page.getByRole("dialog");
async function ack() {
  for (let n = 0; n < 200; n++) {
    if (!(await summary()).event) return;
    await page
      .getByRole("button", { name: "Continue game", exact: true })
      .click();
  }
  throw Error("Event loop");
}
async function click(locator) {
  await locator.click();
  await ack();
}
function step(s, a) {
  s = reduceGame(s, a);
  while (s.event) s = reduceGame(s, { type: "continue", eventId: s.event.id });
  return s;
}
function fixture(codes = ["12004", "12001", "12007"]) {
  let s = createGame("easy", 3481, codes);
  while (s.status === "mulligan") s = step(s, { type: "mulligan", ids: [] });
  if (s.window) s = step(s, { type: "passWindow" });
  for (const p of party(s)) {
    p.hand = [];
    p.assets = [];
    p.deck = [{ id: `draw-${p.code}`, code: "12089" }];
  }
  s.bag = ["0"];
  return s;
}
const member = (s, c) => party(s).find((p) => p.code === c);
function run(s, effects) {
  s.decision = {
    title: "Fixture",
    description: "",
    choices: [{ id: "go", label: "Go", effects }],
  };
  return step(s, { type: "choose", id: "go" });
}
async function load(s) {
  await page.goto(base);
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key, s },
  );
  await reload();
  await ack();
}
async function reload() {
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
}
async function shot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/${name}.png`, animations: "disabled" });
  const box = await dialog().boundingBox();
  assert.ok(
    box && box.y >= 0 && box.y + box.height <= page.viewportSize().height + 1,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
}
try {
  let s = fixture();
  s.player.flags.joe = true;
  s.player.hand = [
    { id: "glass", code: "12034" },
    { id: "hunch", code: "12038" },
    { id: "perception", code: "12093" },
  ];
  member(s, "12001").assets = [
    {
      id: "wrench",
      code: "12002",
      damage: 0,
      horror: 0,
      uses: 0,
      exhausted: false,
    },
  ];
  s.enemies = [
    {
      id: "foe",
      code: "12121",
      location: "12113",
      damage: 0,
      exhausted: true,
      engaged: true,
      engagedWith: "12004",
    },
  ];
  await load(s);
  await click(page.getByRole("button", { name: "Investigate", exact: true }));
  assert.equal((await summary()).window.timing, "beforeCommit");
  await shot("01-before-commit");
  const held = JSON.stringify(await saved());
  await page.waitForTimeout(500);
  assert.equal(JSON.stringify(await saved()), held, "no timed progression");
  await page.keyboard.press("Escape");
  assert.equal(
    JSON.stringify(await saved()),
    held,
    "Escape cannot pass a window",
  );
  await reload();
  assert.equal((await saved()).window.timing, "beforeCommit");
  await click(dialog().getByRole("button", { name: /Play Magnifying Glass/ }));
  assert.equal((await saved()).player.actions, 2);
  assert.equal((await saved()).player.resources, 4);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    const pass = await page
      .getByRole("button", { name: "Pass Fast window", exact: true })
      .boundingBox();
    assert.ok(pass.y + pass.height < viewport.height);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await click(
    page.getByRole("button", { name: "Pass Fast window", exact: true }),
  );
  await page
    .locator(".commit-list button")
    .filter({ hasText: "Perception" })
    .click();
  await click(
    page.getByRole("button", { name: "Draw from the chaos bag", exact: true }),
  );
  assert.equal((await saved()).window.timing, "beforeToken");
  assert.deepEqual((await saved()).window.test.tokens, []);
  await shot("02-before-token");
  await click(dialog().getByRole("button", { name: /Daniela’s Wrench/ }));
  assert.equal((await saved()).decision.title, "Daniela strikes back");
  await click(dialog().getByRole("button", { name: "Decline", exact: true }));
  assert.equal((await saved()).window.actor, "12004");
  assert.equal(member(await saved(), "12001").turnStarted, false);
  await shot("03-window-resumed");
  await click(dialog().getByRole("button", { name: /Play Working a Hunch/ }));
  assert.equal((await saved()).test.stage, "revealed");
  await click(
    page.getByRole("button", { name: "Resolve the test", exact: true }),
  );
  assert.equal(
    (await saved()).decision.title,
    "Choose skill test result order",
  );
  await shot("04-test-result-order");
  await reload();
  await click(dialog().getByRole("button", { name: /Perception/ }));
  assert.ok((await saved()).player.discard.some((c) => c.id === "perception"));

  s = fixture();
  s.leadInvestigator = "12001";
  const hall = s.locations.find((l) => l.code === "12118");
  Object.assign(hall, { active: true, revealed: true, clues: 2 });
  s.player.location = hall.code;
  s.player.threats = ["12125"];
  s.player.hand = [{ id: "cache", code: "12089" }];
  s = run(s, [{ kind: "discover", amount: 1 }]);
  await load(s);
  assert.equal((await saved()).player.code, "12001");
  await shot("05-forced-order");
  await click(dialog().getByRole("button", { name: /Science Hall/ }));
  await click(
    dialog().getByRole("button", { name: "Emergency Cache", exact: true }),
  );
  assert.equal(member(await saved(), "12004").horror, 1);

  s = fixture(["12004", "12001"]);
  Object.assign(
    s.locations.find((l) => l.code === "12117"),
    { active: true, revealed: true, fire: true },
  );
  s.locations.find((l) => l.code === "12113").fire = true;
  member(s, "12001").location = "12117";
  s = run(s, [{ kind: "investigationEnd", actor: "scenario" }]);
  await load(s);
  await shot("06-fire-order");
  await dialog()
    .getByRole("button", { name: /Dormitories/ })
    .click();
  assert.match((await saved()).event.description, /Dormitories/);
  await page
    .getByRole("button", { name: "Continue game", exact: true })
    .click();
  assert.equal(member(await saved(), "12001").damage, 1);
  assert.equal(member(await saved(), "12004").damage, 0);
  await shot("07-fire-first-location");

  s = fixture(["12004"]);
  s.encounterDeck = ["12130"];
  s.encounterDiscard = ["12129"];
  s.bag = ["elder_thing"];
  s = run(s, [{ kind: "encounter" }]);
  await load(s);
  await click(dialog().getByRole("button", { name: /willpower/ }));
  assert.equal((await saved()).encounterDeck.length, 0);
  await reload();
  await click(
    page.getByRole("button", { name: "Draw from the chaos bag", exact: true }),
  );
  await click(
    page.getByRole("button", { name: "Resolve the test", exact: true }),
  );
  await shot("08-encounter-boundary");
  await click(dialog().getByRole("button", { name: /Elder thing/ }));
  assert.equal(
    (await saved()).locations.find((l) => l.code === "12113").fire,
    true,
  );
  assert.deepEqual((await saved()).encounterDeck, ["12130"]);
  assert.equal((await saved()).resolutionDepth, 0);
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/result.json`,
    JSON.stringify(
      {
        base,
        checks: [
          "Fast before/after commitments",
          "no timed or Escape progression",
          "save/reload windows and result order",
          "teammate Wrench and actor restoration",
          "simultaneous Forced and Fire order",
          "deferred encounter reset",
          "desktop 1280, 1440 and 1920",
        ],
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("Timing browser checks passed; zero browser errors.");
} finally {
  await browser.close();
}
