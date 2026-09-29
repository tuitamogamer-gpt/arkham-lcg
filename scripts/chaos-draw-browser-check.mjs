import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createGame, reduceGame as step } from "../tests/helpers.ts";
import { acknowledgeEvents } from "./browser-pacing.mjs";

const base = process.env.BASE_URL || "http://localhost:5187";
const out = process.env.QA_OUT || "output/chaos-draw";
const saveKey = "arkham-chronicle:spreading-flames:v1";
await mkdir(out, { recursive: true });
const report = [];

function fixture(bag = ["-2"], timely = false) {
  const s = step(createGame("standard", 712), { type: "mulligan", ids: [] });
  s.player.hand = timely ? [{ id: "timely", code: "12081" }] : [];
  s.bag = bag;
  return s;
}

for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const browser = await engine.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  const saved = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) || localStorage.getItem("arkham-chronicle:save:" + (JSON.parse(localStorage.getItem("arkham-chronicle:saves") || "{}").active || ""))), saveKey);
  const resolve = () =>
    page.getByRole("button", { name: "Resolve the test", exact: true });
  async function load(s, motion = "full") {
    await page.goto(base);
    // Wait for the old page's initial save effect before installing a fixture.
    await page.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    await page.evaluate(
      ({ s, saveKey, motion }) => {
        localStorage.setItem(saveKey, JSON.stringify(s));
        localStorage.setItem("arkham-chronicle:motion", motion);
      },
      { s, saveKey, motion },
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Continue investigation", exact: true })
      .click();
    await page.evaluate(() => document.fonts.ready);
  }
  async function draw(s = fixture(), motion = "full") {
    await load(s, motion);
    await page
      .getByRole("button", { name: "Investigate", exact: true })
      .click();
    await acknowledgeEvents(page);
    await page.getByRole("button", { name: "Draw from the chaos bag" }).click();
    await acknowledgeEvents(page);
    await page.locator(".chaos-draw").waitFor();
  }
  async function shot(label) {
    await page.screenshot({ path: `${out}/${name}-${label}.png` });
  }
  async function ready() {
    await resolve().waitFor({ timeout: 7000 });
    assert.equal(
      await page.locator(".chaos-coin-back").first().isVisible(),
      false,
      "the front face is unobstructed after the 3D reveal",
    );
  }
  async function fits() {
    const box = await page.getByRole("dialog").boundingBox();
    const viewport = page.viewportSize();
    assert.ok(
      box.x >= 0 && box.x + box.width <= viewport.width + 1,
      "dialog fits horizontally",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "no page overflow",
    );
    const coinBoxes = await page
      .locator(".chaos-coin-flight")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    const stage = await page.locator(".chaos-stage").boundingBox();
    assert.ok(
      coinBoxes.every(
        (c) =>
          c.x >= stage.x &&
          c.right <= stage.x + stage.width + 1 &&
          c.y >= stage.y &&
          c.bottom <= stage.y + stage.height,
      ),
      "all actual tokens remain inside the stage",
    );
    await resolve().scrollIntoViewIfNeeded();
    const button = await resolve().boundingBox();
    assert.ok(
      button.y >= 0 && button.y + button.height <= viewport.height,
      "resolve is reachable",
    );
  }

  await draw();
  assert.equal(
    await resolve().count(),
    0,
    "result is concealed during the draw",
  );
  assert.equal(await page.locator(".chaos-verdict").count(), 0);
  const drawn = await saved();
  assert.equal(drawn.test.stage, "revealed");
  assert.deepEqual(drawn.test.tokens, ["-2"]);
  await shot("stirring");
  await page.locator('.chaos-draw[data-phase="drawing"]').waitFor();
  await shot("drawing");
  await ready();
  await shot("success");
  await fits();
  await page.waitForTimeout(1000);
  assert.deepEqual(
    await saved(),
    drawn,
    "animation must not advance or redraw the game",
  );
  await resolve().click();
  await acknowledgeEvents(page);
  assert.equal(
    (await saved()).player.clues,
    1,
    "one resolution applies exactly one clue",
  );
  assert.equal((await saved()).player.actions, 2);

  await draw();
  const beforeSkip = await saved();
  await page.getByRole("button", { name: "Reveal now" }).focus();
  await page.keyboard.press("Enter");
  await ready();
  assert.deepEqual(
    await saved(),
    beforeSkip,
    "skip only reveals the existing result",
  );
  assert.ok(await page.locator(".chaos-draw.is-instant").count());

  await draw();
  const midDraw = await saved();
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  await ready();
  assert.ok(
    await page.locator(".chaos-draw.is-instant").count(),
    "restored test shows its existing result immediately",
  );
  assert.deepEqual(await saved(), midDraw);

  for (const mode of ["subtle", "off"]) {
    await draw(fixture(), mode);
    await ready();
    assert.equal(
      await page.getByRole("button", { name: "Reveal now" }).count(),
      0,
    );
    assert.equal(
      await page
        .locator(".chaos-draw")
        .evaluate(
          (el) =>
            el
              .getAnimations({ subtree: true })
              .filter(
                (a) =>
                  a.playState === "running" &&
                  a.animationName !== "motion-soft",
              ).length,
        ),
      0,
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await draw();
  await ready();
  assert.equal(
    await page.getByRole("button", { name: "Reveal now" }).count(),
    0,
  );
  await shot("reduced-motion");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await draw();
  const beforeMotionChange = await saved();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready();
  assert.deepEqual(await saved(), beforeMotionChange);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  for (const [label, bag] of [
    ["auto-fail", ["auto_fail"]],
    ["elder-sign", ["elder_sign"]],
    ["additional-token", ["tablet", "tablet"]],
  ]) {
    await draw(fixture(bag));
    await ready();
    assert.deepEqual((await saved()).test.tokens, bag);
    assert.equal(
      await page.locator(".chaos-coin-front .chaos-token").count(),
      bag.length,
    );
    if (label === "auto-fail")
      assert.match(
        await page.locator(".chaos-verdict").innerText(),
        /AUTOMATIC FAILURE/,
      );
    await shot(label);
    await fits();
  }

  await draw(fixture(["-3"], true));
  await ready();
  assert.equal((await saved()).test.success, false);
  await page
    .getByRole("button", { name: /Commit Timely Intervention/ })
    .click();
  await acknowledgeEvents(page);
  await ready();
  const intervention = await saved();
  assert.deepEqual(
    intervention.test.tokens,
    ["-3"],
    "late commitment does not redraw",
  );
  assert.equal(
    intervention.test.success,
    true,
    "late commitment updates the verdict",
  );
  assert.equal(
    await page.getByRole("button", { name: "Reveal now" }).count(),
    0,
  );
  await shot("late-commitment");

  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await draw(fixture(["auto_fail"]), "off");
    await ready();
    await fits();
    await shot(`${width}px`);
  }
  // The engine permits a chain of additional-token symbols; even its maximum
  // draw remains legible on the smallest supported screen.
  await draw(fixture(Array(20).fill("tablet")), "off");
  await ready();
  await fits();
  assert.equal(
    await page.locator(".chaos-coin-front .chaos-token").count(),
    20,
  );
  await shot("many-tokens-320px");

  assert.deepEqual(errors, []);
  report.push({
    browser: name,
    errors,
    passed: [
      "cinematic phases",
      "manual resolution",
      "skip",
      "mid-draw reload",
      "subtle/off",
      "reduced motion and live change",
      "auto-fail",
      "elder sign",
      "additional token",
      "Timely Intervention",
      "1280/390/320px",
      "20-token chain",
    ],
  });
  await browser.close();
}
await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
