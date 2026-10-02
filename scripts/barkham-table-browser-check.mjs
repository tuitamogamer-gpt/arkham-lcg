import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// These are existing native QA investigations. This check never answers,
// undoes, imports, or changes one; all non-read bridge requests are blocked.
const base = process.env.BASE_URL || "http://127.0.0.1:5198";
const service = process.env.RULES_URL || "http://127.0.0.1:5194";
const out = process.env.QA_OUT || "output/barkham-tables";
await mkdir(out, { recursive: true });
const proof = JSON.parse(
  await readFile("output/barkham-runtime/report.json", "utf8"),
);
assert.equal(proof.passed, true);
const readGame = async (id) => {
  const response = await fetch(`${service}/chronicle/play/games/${id}`);
  assert.equal(response.status, 200, `live saved investigation ${id}`);
  return response.json();
};
const digest = (game) =>
  createHash("sha256").update(JSON.stringify(game)).digest("hex");
const browser = await chromium.launch({ headless: true });
const errors = [],
  blockedWrites = [],
  checks = [],
  gets = new Set();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`${service}/chronicle/**`, async (route) => {
    const request = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      gets.add(new URL(request.url()).pathname);
      await route.continue();
    } else {
      blockedWrites.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
      });
      await route.fulfill({
        status: 409,
        json: { error: "Browser QA preserves this saved investigation." },
      });
    }
  });
  for (const code of ["barkham-004", "barkham-013"]) {
    const check = proof.checks.find((entry) => entry.investigatorCode === code);
    assert.ok(check?.gameId, `actual saved ${code} proof`);
    const before = await readGame(check.gameId),
      hash = digest(before.game);
    await page.goto("about:blank");
    await page.goto(`${base}/#investigation=${check.gameId}`);
    await page
      .locator(".chronicle-companion-table .companion-decision")
      .waitFor();
    await page.waitForFunction(
      () =>
        typeof window.render_game_to_text === "function" &&
        JSON.parse(window.render_game_to_text()).decision?.count > 0,
    );
    assert.equal(
      await page.locator("iframe").count(),
      0,
      "gameplay uses the original Chronicle table",
    );
    const projection = await page.evaluate(() =>
      JSON.parse(window.render_game_to_text()),
    );
    assert.equal(projection.phase, before.game.phase);
    assert.equal(projection.decision.tag, "PlayerWindowChooseOne");
    assert.ok(
      projection.decision.options.some((choice) =>
        /Take 1 resource/.test(choice.text),
      ),
      "explicit native resource action",
    );
    assert.ok(
      projection.decision.options.some((choice) =>
        /Draw 1 card/.test(choice.text),
      ),
      "explicit native draw action",
    );
    assert.equal(
      projection.hand,
      undefined,
      "text projection does not expose hand cards",
    );
    const name = code === "barkham-004" ? "Kate Winthpup" : "Duke";
    await page
      .getByRole("button", { name: new RegExp(`TAKING A TURN.*${name}`) })
      .waitFor();
    if (code === "barkham-004")
      await page.getByText("Sniffed", { exact: true }).waitFor();
    else {
      await page.getByText("5 Treats", { exact: true }).waitFor();
      await page
        .locator(".companion-card figcaption")
        .filter({ hasText: /^Friendly Human$/ })
        .waitFor();
    }
    await page
      .locator(".chronicle-companion-table img")
      .evaluateAll((images) =>
        images.forEach((image) => (image.loading = "eager")),
      );
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".chronicle-companion-table img")].every(
          (image) =>
            image.complete &&
            image.naturalWidth > 0 &&
            getComputedStyle(image).opacity !== "0",
        ),
      null,
      { timeout: 35000 },
    );
    const imageProof = await page
      .locator(".companion-card")
      .evaluateAll((cards) =>
        cards.map((card) => ({
          name: card.querySelector("figcaption")?.textContent,
          images: [...card.querySelectorAll("img")].map((image) => ({
            src: image.src,
            width: image.naturalWidth,
            height: image.naturalHeight,
          })),
        })),
      );
    assert.ok(
      imageProof.every((card) => card.images.some((image) => image.width > 0)),
      "every visible native card face decoded",
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    await page.screenshot({
      path: `${out}/${code}-desktop.png`,
      fullPage: true,
    });
    await writeFile(
      `${out}/${code}-visible-images.json`,
      JSON.stringify(imageProof, null, 2),
    );
    await page
      .getByRole("button", { name: "Inspect chaos bag", exact: true })
      .click();
    assert.ok(
      (await page.locator(".companion-bag-contents .chaos-token").count()) > 0,
      "native chaosTokenFace renders",
    );
    assert.ok(
      (await page
        .locator(".companion-bag-contents .chaos-token.fail")
        .count()) > 0,
      "auto-fail uses the original game symbol",
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "The chaos bag" })
      .waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByRole("button", { name: "Inspect chaos bag", exact: true })
        .evaluate((button) => button === document.activeElement),
      true,
      "modal restores focus",
    );
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "original table fits 320px",
    );
    await page.screenshot({
      path: `${out}/${code}-mobile.png`,
      fullPage: true,
    });
    await page.reload();
    await page
      .locator(".chronicle-companion-table .companion-decision")
      .waitFor();
    if (code === "barkham-004")
      await page.getByText("Sniffed", { exact: true }).waitFor();
    else await page.getByText("5 Treats", { exact: true }).waitFor();
    assert.match(
      page.url(),
      new RegExp(check.gameId),
      "saved investigation stays open on reload",
    );
    assert.equal(
      digest((await readGame(check.gameId)).game),
      hash,
      "saved native game remains unchanged",
    );
    checks.push({
      investigatorCode: code,
      gameId: check.gameId,
      liveReads: true,
      originalTable: true,
      desktop1440: true,
      mobile320: true,
      reload: true,
      artworkDecoded: true,
      savedStateUnchanged: true,
    });
    await page.setViewportSize({ width: 1440, height: 1050 });
  }
  assert.ok(
    gets.has("/chronicle/play/card-definitions"),
    "actual native definitions were loaded",
  );
  assert.ok(
    gets.has("/chronicle/play/presentation"),
    "actual native presentation was loaded",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedWrites, [], "no game mutation was attempted");
  await writeFile(
    `${out}/report.json`,
    JSON.stringify(
      {
        passed: true,
        mode: "live service, read only, no response mocks",
        binarySha256: proof.binarySha256,
        checks,
        errors,
        blockedWrites,
      },
      null,
      2,
    ),
  );
  console.log("Barkham original-table live read-only browser checks passed.");
} finally {
  await browser.close();
}
