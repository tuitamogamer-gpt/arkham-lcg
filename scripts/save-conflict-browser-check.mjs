// Run with: node --import tsx scripts/save-conflict-browser-check.mjs
// Real tabs share browser storage and receive native storage events. Only the
// quota failure is injected; save ownership and conflict handling are the app's.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createGame, reduceGame } from "../tests/helpers.ts";
import { acknowledgeEvents } from "./browser-pacing.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:5187";
const output = resolve(process.env.QA_OUT || "output/save-conflict");
const prefix = "arkham-chronicle:save:";
const indexKey = "arkham-chronicle:saves";
const fixture = reduceGame(createGame("easy", 91), {
  type: "mulligan",
  ids: [],
});
const checks = [],
  errors = [];
await mkdir(output, { recursive: true });
await writeFile(
  resolve(output, "report.json"),
  JSON.stringify({ passed: false }),
);
const browser = await chromium.launch();

async function seededContext(games, active = games[0].id) {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
  });
  context.setDefaultTimeout(15000);
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
  });
  await context.addInitScript(
    ({ games, active, prefix, indexKey, origin }) => {
      if (location.origin !== origin) return;
      // Seed once per origin, not once per page: a later tab or reload must see
      // the application's actual saves, including deletions and new copies.
      if (localStorage.getItem("save-conflict-fixture")) return;
      localStorage.setItem("arkham-chronicle:tutorial", "done");
      localStorage.setItem("arkham-chronicle:tempo", "fast");
      for (const game of games)
        localStorage.setItem(`${prefix}${game.id}`, JSON.stringify(game));
      localStorage.setItem(
        indexKey,
        JSON.stringify({
          active,
          slots: games.map((game) => ({
            id: game.id,
            updatedAt: "2026-10-13T12:00:00.000Z",
            round: game.round,
            act: game.act,
            party: game.partyOrder,
            difficulty: game.difficulty,
            status: game.status,
            result: game.campaign.result,
          })),
        }),
      );
      localStorage.setItem("save-conflict-fixture", "1");
    },
    { games, active, prefix, indexKey, origin: new URL(base).origin },
  );
  return context;
}

async function openCurrent(context) {
  const page = await context.newPage();
  await page.goto(base);
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Resource", exact: true }).waitFor();
  await page.locator(".autosaved").filter({ hasText: "Autosaved" }).waitFor();
  return page;
}

const state = (page) =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const stored = (page, id) =>
  page.evaluate((key) => localStorage.getItem(key), `${prefix}${id}`);
const index = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), indexKey);
const settings = (page) =>
  page.getByRole("button", { name: "Settings & saves", exact: true }).click();
const closeDialog = (page) =>
  page.getByRole("button", { name: "Close dialog", exact: true }).click();
async function resource(page) {
  const before = await state(page);
  await page.getByRole("button", { name: "Resource", exact: true }).click();
  await page.waitForFunction(
    (resources) =>
      JSON.parse(window.render_game_to_text()).player.resources ===
      resources + 1,
    before.player.resources,
  );
  await acknowledgeEvents(page);
}
async function exportedCurrent(page, name = "Export current investigation") {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("dialog", { name: "Settings and saves", exact: true })
      .getByRole("button", { name, exact: true })
      .click(),
  ]);
  return JSON.parse(await readFile(await download.path(), "utf8"));
}

try {
  const context = await seededContext([fixture]);
  const writer = await openCurrent(context);
  const stale = await openCurrent(context);
  await resource(writer);
  await writer.locator(".autosaved").filter({ hasText: "Autosaved" }).waitFor();
  const latest = await stored(writer, fixture.id);
  assert.equal(
    JSON.parse(latest).player.resources,
    fixture.player.resources + 1,
  );
  await stale
    .getByRole("region", { name: "Investigation save status" })
    .filter({ hasText: "Another tab changed" })
    .waitFor();
  assert.equal((await state(stale)).player.resources, fixture.player.resources);
  await resource(stale);
  await resource(stale);
  await stale
    .locator(".autosaved")
    .filter({ hasText: "Save needs attention" })
    .waitFor();
  assert.equal(
    await stored(stale, fixture.id),
    latest,
    "The stale tab overwrote the other tab's saved progress.",
  );
  await settings(stale);
  const unsaved = await exportedCurrent(stale);
  assert.equal(unsaved.id, fixture.id);
  assert.equal(unsaved.player.resources, fixture.player.resources + 2);
  await stale.screenshot({
    path: resolve(output, "two-tab-conflict.png"),
    fullPage: true,
  });
  checks.push(
    "A second real tab detects an external save and keeps its own unsaved actions without overwriting it",
  );

  for (const width of [390, 320]) {
    await stale.setViewportSize({ width, height: 900 });
    await stale.evaluate(() => document.fonts.ready);
    const geometry = await stale.getByRole("dialog").evaluate((dialog) => ({
      content: dialog.scrollWidth,
      available: dialog.clientWidth,
      left: dialog.getBoundingClientRect().left,
      right: dialog.getBoundingClientRect().right,
      buttons: [...dialog.querySelectorAll(".save-health-actions button")].map(
        (button) => ({
          left: button.getBoundingClientRect().left,
          right: button.getBoundingClientRect().right,
        }),
      ),
    }));
    assert.ok(
      geometry.content <= geometry.available,
      `Conflict settings overflow at ${width}px.`,
    );
    assert.ok(
      geometry.left >= 0 && geometry.right <= width,
      `Conflict dialog leaves the ${width}px viewport.`,
    );
    assert.ok(
      geometry.buttons.every(
        (button) =>
          button.left >= geometry.left && button.right <= geometry.right,
      ),
      `A recovery button is clipped at ${width}px.`,
    );
    await stale.screenshot({
      path: resolve(output, `conflict-settings-${width}.png`),
      fullPage: true,
    });
  }
  await stale.setViewportSize({ width: 1440, height: 1000 });
  checks.push(
    "Conflict settings and every recovery action fit 390px and 320px mobile viewports",
  );

  await stale
    .getByRole("button", {
      name: "Save as separate investigation",
      exact: true,
    })
    .click();
  await stale.locator(".autosaved").filter({ hasText: "Autosaved" }).waitFor();
  const forkIndex = await index(stale);
  assert.equal(forkIndex.slots.length, 2);
  assert.notEqual(forkIndex.active, fixture.id);
  assert.equal(await stored(stale, fixture.id), latest);
  const fork = JSON.parse(await stored(stale, forkIndex.active));
  assert.deepEqual(
    { ...fork, id: fixture.id },
    unsaved,
    "Saving a separate copy lost this tab's progress.",
  );
  await stale.reload();
  await stale
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  await stale.waitForFunction(
    (resources) =>
      JSON.parse(window.render_game_to_text()).player.resources === resources,
    unsaved.player.resources,
  );
  assert.equal(await stored(stale, fixture.id), latest);
  checks.push(
    "Save as separate investigation preserves both exact game versions and resumes the new copy after reload",
  );

  // Reopen the original in the second tab and advance it. The first tab still
  // owns its earlier revision and an undo history from its original action.
  await settings(stale);
  await stale
    .locator(".save-slot-actions")
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await stale.waitForFunction(
    (resources) =>
      JSON.parse(window.render_game_to_text()).player.resources === resources,
    JSON.parse(latest).player.resources,
  );
  await resource(stale);
  await stale.locator(".autosaved").filter({ hasText: "Autosaved" }).waitFor();
  const reviewedBytes = await stored(stale, fixture.id);
  const reviewed = JSON.parse(reviewedBytes);
  assert.notEqual(reviewedBytes, latest);
  await writer
    .getByRole("region", { name: "Investigation save status" })
    .filter({ hasText: "Another tab changed" })
    .waitFor();
  assert.equal(
    await writer
      .getByRole("button", { name: "Undo last action", exact: true })
      .isEnabled(),
    true,
  );
  await settings(writer);
  await writer
    .getByRole("button", { name: "Review saved version", exact: true })
    .click();
  const reviewDialog = writer.getByRole("dialog", {
    name: "Choose the version to continue",
    exact: true,
  });
  await reviewDialog
    .getByText(
      `Your open version: round ${fixture.round}, act ${fixture.act}, 1 actions taken by Joe Diamond.`,
      { exact: true },
    )
    .waitFor();
  await reviewDialog
    .getByText(
      `Saved version: round ${fixture.round}, act ${fixture.act}, 2 actions taken by Joe Diamond.`,
      { exact: true },
    )
    .waitFor();
  await reviewDialog
    .getByRole("button", { name: "Keep this tab’s version", exact: true })
    .click();
  assert.deepEqual(
    await exportedCurrent(writer),
    JSON.parse(latest),
    "Cancelling saved-version review replaced this tab's game.",
  );
  assert.equal(await stored(writer, fixture.id), reviewedBytes);
  await writer
    .getByRole("button", { name: "Review saved version", exact: true })
    .click();
  await writer
    .getByRole("dialog", {
      name: "Choose the version to continue",
      exact: true,
    })
    .getByRole("button", { name: "Use saved version", exact: true })
    .click();
  await writer.locator(".autosaved").filter({ hasText: "Autosaved" }).waitFor();
  assert.equal(
    (await state(writer)).player.resources,
    reviewed.player.resources,
  );
  assert.equal(
    await writer
      .getByRole("button", { name: "Undo last action", exact: true })
      .isDisabled(),
    true,
    "Restoring another tab's game retained an undo entry from the stale version.",
  );
  assert.equal(
    await stored(writer, fixture.id),
    reviewedBytes,
    "Restoring the latest save wrote an older version back to storage.",
  );
  await settings(writer);
  assert.deepEqual(
    await exportedCurrent(writer, "Export saved game"),
    reviewed,
    "The confirmed saved version did not restore the entire game.",
  );
  assert.deepEqual(
    JSON.parse(await stored(writer, fork.id)),
    fork,
    "Restoring the original changed the separate copy.",
  );
  checks.push(
    "Review saved version preserves the open game on cancel, then explicit confirmation restores the exact latest game and resets undo without overwriting either save",
  );
  await context.close();

  const deletionContext = await seededContext([fixture]);
  const deleter = await openCurrent(deletionContext);
  const deletedTab = await openCurrent(deletionContext);
  await settings(deleter);
  const actions = deleter.locator(".save-slot-actions");
  await actions.getByRole("button", { name: "Delete", exact: true }).click();
  await actions
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await deletedTab.waitForFunction(
    (key) => localStorage.getItem(key) === null,
    `${prefix}${fixture.id}`,
  );
  await deletedTab
    .getByRole("region", { name: "Investigation save status" })
    .filter({ hasText: "Another tab changed" })
    .waitFor();
  await resource(deletedTab);
  await deletedTab
    .locator(".autosaved")
    .filter({ hasText: "Save needs attention" })
    .waitFor();
  assert.equal(
    await stored(deletedTab, fixture.id),
    null,
    "The stale tab resurrected a deleted investigation.",
  );
  assert.equal((await index(deletedTab)).slots.length, 0);
  await settings(deletedTab);
  const deletedButOpen = await exportedCurrent(deletedTab);
  assert.equal(deletedButOpen.player.resources, fixture.player.resources + 1);
  await deletedTab
    .getByRole("button", { name: "Review saved version", exact: true })
    .click();
  await deletedTab
    .getByText(
      "There is no readable saved version now. Your version remains open in this tab.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await deletedTab
      .getByRole("button", { name: "Use saved version", exact: true })
      .count(),
    0,
  );
  checks.push(
    "Deleting in another tab cannot be undone by a stale autosave, and the remaining open version is exportable",
  );
  await deletionContext.close();

  const newer = reduceGame(fixture, { type: "resource" });
  const current = reduceGame(createGame("easy", 93), {
    type: "mulligan",
    ids: [],
  });
  const importContext = await seededContext([newer, current], current.id);
  const importPage = await openCurrent(importContext);
  const existingBytes = await stored(importPage, newer.id);
  const currentBytes = await stored(importPage, current.id);
  await settings(importPage);
  await importPage.locator('input[type="file"]').setInputFiles({
    name: "older-investigation.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await importPage
    .locator(".autosaved")
    .filter({ hasText: "Autosaved" })
    .waitFor();
  await importPage.waitForFunction(
    (key) => JSON.parse(localStorage.getItem(key)).slots.length === 3,
    indexKey,
  );
  const importedIndex = await index(importPage);
  assert.ok(![fixture.id, current.id].includes(importedIndex.active));
  assert.equal(
    await stored(importPage, newer.id),
    existingBytes,
    "Import overwrote newer progress with an old backup.",
  );
  assert.equal(
    await stored(importPage, current.id),
    currentBytes,
    "Import replaced the previously open investigation.",
  );
  const imported = JSON.parse(await stored(importPage, importedIndex.active));
  assert.deepEqual({ ...imported, id: fixture.id }, fixture);
  checks.push(
    "Importing a stale backup gives it a new ID while preserving both the newer saved version and the previously open investigation",
  );
  await importContext.close();

  const quotaContext = await seededContext([fixture, current], fixture.id);
  const quotaPage = await openCurrent(quotaContext);
  const beforeQuota = await stored(quotaPage, fixture.id);
  const otherBefore = await stored(quotaPage, current.id);
  await quotaPage.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.saveConflictQuotaFailure = true;
    Storage.prototype.setItem = function (key, value) {
      if (
        window.saveConflictQuotaFailure &&
        key.startsWith("arkham-chronicle:save")
      )
        throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await resource(quotaPage);
  await quotaPage
    .locator(".autosaved")
    .filter({ hasText: "Save needs attention" })
    .waitFor();
  await settings(quotaPage);
  const quotaMemory = await exportedCurrent(quotaPage);
  assert.equal(quotaMemory.player.resources, fixture.player.resources + 1);
  await quotaPage
    .locator(".save-slot-actions")
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await quotaPage
    .locator(".save-health")
    .filter({ hasText: "Switching investigations is paused" })
    .waitFor();
  assert.deepEqual(
    await exportedCurrent(quotaPage),
    quotaMemory,
    "Opening another save discarded unsaved changes after quota failure.",
  );
  assert.equal(await stored(quotaPage, fixture.id), beforeQuota);
  assert.equal(await stored(quotaPage, current.id), otherBefore);
  assert.equal((await index(quotaPage)).active, fixture.id);
  checks.push(
    "A failed save blocks Open and preserves the complete unsaved game plus both stored slots",
  );

  await closeDialog(quotaPage);
  await quotaPage
    .getByRole("button", { name: "Campaigns", exact: true })
    .click();
  await quotaPage
    .getByRole("button", { name: "Start a new investigation", exact: true })
    .click();
  await quotaPage
    .getByRole("button", { name: "Enter Miskatonic University", exact: true })
    .click();
  await quotaPage.locator(".save-health").waitFor();
  assert.deepEqual(
    await exportedCurrent(quotaPage),
    quotaMemory,
    "Starting a new game discarded unsaved changes after quota failure.",
  );
  assert.equal((await index(quotaPage)).slots.length, 2);
  assert.equal(await stored(quotaPage, fixture.id), beforeQuota);
  assert.equal(await stored(quotaPage, current.id), otherBefore);
  await quotaPage.screenshot({
    path: resolve(output, "quota-switch-protection.png"),
    fullPage: true,
  });
  checks.push(
    "A failed save blocks Start without creating a new slot or discarding current progress",
  );

  await quotaPage.evaluate(() => {
    window.saveConflictQuotaFailure = false;
  });
  await quotaPage
    .getByRole("button", { name: "Retry saving", exact: true })
    .click();
  await quotaPage.locator(".save-health").waitFor({ state: "detached" });
  assert.deepEqual(
    JSON.parse(await stored(quotaPage, fixture.id)),
    quotaMemory,
  );
  await quotaPage
    .locator(".save-slot-actions")
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await quotaPage.waitForFunction(
    ({ key, id }) => JSON.parse(localStorage.getItem(key)).active === id,
    { key: indexKey, id: current.id },
  );
  assert.deepEqual(
    JSON.parse(await stored(quotaPage, fixture.id)),
    quotaMemory,
  );
  checks.push(
    "After storage recovers, Retry saves the preserved game and switching investigations works again",
  );
  await quotaContext.close();
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
} catch (error) {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(
      {
        passed: false,
        checks,
        errors,
        failure: String(error.stack || error),
      },
      null,
      2,
    ),
  );
  for (const [i, context] of browser.contexts().entries()) {
    for (const [j, page] of context.pages().entries())
      await page
        .screenshot({
          path: resolve(output, `failure-${i}-${j}.png`),
          fullPage: true,
        })
        .catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
