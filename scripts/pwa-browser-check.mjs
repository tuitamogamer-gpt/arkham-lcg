import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createGame, reduceGame } from "../tests/helpers.ts";

// Run against a production build (vite preview), not the development server:
// BASE_URL=http://127.0.0.1:5191 PWA_SIMULATE_UPDATE=1 node --import tsx scripts/pwa-browser-check.mjs
// Omit PWA_SIMULATE_UPDATE for a read-only offline check of a deployed URL.
const root = fileURLToPath(new URL("..", import.meta.url));
const base = process.env.BASE_URL || "http://127.0.0.1:5191";
const simulateUpdate = process.env.PWA_SIMULATE_UPDATE === "1";
const out = resolve(root, process.env.QA_OUT || "output/pwa");
const swPath = resolve(root, "dist/sw.js");
if (
  simulateUpdate &&
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)
) {
  throw new Error(
    "Update simulation is allowed only against a local production preview.",
  );
}
const originalWorker = simulateUpdate ? await readFile(swPath, "utf8") : null;
await mkdir(out, { recursive: true });
let game = reduceGame(createGame("standard", 735), {
  type: "mulligan",
  ids: [],
});
game = reduceGame(game, { type: "act", kind: "investigate" });
assert.ok(game.test, "fixture pauses on a real skill test");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    serviceWorkers: "allow",
    reducedMotion: "reduce",
  });
  await context.addInitScript((save) => {
    if (!localStorage.getItem("pwa-check-seeded")) {
      localStorage.setItem(
        "arkham-chronicle:spreading-flames:v1",
        JSON.stringify(save),
      );
      localStorage.setItem("pwa-check-seeded", "yes");
    }
  }, game);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.evaluate(() =>
    Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Production service worker did not activate. Run this check against vite preview.",
              ),
            ),
          15_000,
        ),
      ),
    ]),
  );
  // The first installation intentionally does not claim a running page. A
  // navigation after activation gets the controller; allow one extra load
  // for Chromium's registration/controller bookkeeping to settle.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.reload();
    if (await page.evaluate(() => !!navigator.serviceWorker.controller)) break;
  }
  assert.equal(
    await page.evaluate(() => !!navigator.serviceWorker.controller),
    true,
    "production service worker controls the reloaded page",
  );
  const saved = await page.evaluate(
    (id) => localStorage.getItem(`arkham-chronicle:save:${id}`),
    game.id,
  );
  assert.equal(JSON.parse(saved).test.stage, "commit");
  const artPath = "/art/cards/12012.webp";
  assert.equal(
    await page.evaluate(async (url) => (await fetch(url)).ok, artPath),
    true,
  );
  await page.waitForFunction(
    async (url) => !!(await (await caches.open("arkham-art")).match(url)),
    artPath,
  );
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Settings & saves", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(async (url) => (await fetch(url)).ok, artPath),
    true,
    "visited art works offline",
  );
  assert.equal(
    await page.evaluate(
      (id) => localStorage.getItem(`arkham-chronicle:save:${id}`),
      game.id,
    ),
    saved,
    "pending test survives offline reload",
  );
  await page.screenshot({
    path: resolve(out, "offline-shell.png"),
    fullPage: true,
  });
  await context.setOffline(false);
  let updateResult = { updateSimulation: false };
  if (simulateUpdate) {
    const workerResponse = await context.request.get(
      new URL("/sw.js", base).href,
    );
    assert.equal(
      await workerResponse.text(),
      originalWorker,
      "preview must serve this checkout dist/sw.js before local simulation",
    );
    const sibling = await context.newPage();
    await sibling.goto(base);
    await sibling.evaluate(() => navigator.serviceWorker.ready);
    await sibling.reload();
    let navigations = 0;
    let siblingNavigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations++;
    });
    sibling.on("framenavigated", (frame) => {
      if (frame === sibling.mainFrame()) siblingNavigations++;
    });
    await writeFile(swPath, originalWorker + "\n/* pwa-check-new-release */\n");
    await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration()).update(),
    );
    await page.waitForFunction(
      async () =>
        (await navigator.serviceWorker.getRegistration())?.waiting?.state ===
        "installed",
    );
    await page
      .getByRole("button", { name: "Settings & saves", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save & update", exact: true })
      .waitFor();
    await sibling
      .getByRole("button", { name: "Settings & saves", exact: true })
      .click();
    await sibling
      .getByRole("button", { name: "Save & update", exact: true })
      .waitFor();
    await page.screenshot({
      path: resolve(out, "waiting-update.png"),
      fullPage: true,
    });
    assert.equal(
      navigations,
      0,
      "new release does not reload pending investigation",
    );
    assert.equal(
      siblingNavigations,
      0,
      "new release does not reload sibling table",
    );
    await Promise.all([
      page.waitForEvent("framenavigated", {
        predicate: (frame) => frame === page.mainFrame(),
      }),
      page.getByRole("button", { name: "Save & update", exact: true }).click(),
    ]);
    await page
      .getByRole("button", { name: "Settings & saves", exact: true })
      .waitFor();
    assert.equal(
      siblingNavigations,
      0,
      "another tab activating update does not reload this table",
    );
    await sibling
      .getByRole("button", { name: "Save & update", exact: true })
      .click();
    await sibling
      .getByRole("button", { name: "Settings & saves", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        (id) => localStorage.getItem(`arkham-chronicle:save:${id}`),
        game.id,
      ),
      saved,
      "pending test survives update",
    );
    updateResult = {
      updateSimulation: true,
      updateWaitsForPlayer: true,
      siblingTableNotReloaded: true,
      optedInUpdatesApplied: true,
    };
  }
  assert.deepEqual(errors, []);
  const report = {
    baseUrl: base,
    offlineShell: true,
    offlineVisitedArt: true,
    pendingTestPreserved: true,
    ...updateResult,
    pageErrors: errors,
  };
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (simulateUpdate) await writeFile(swPath, originalWorker);
  await browser.close();
}
