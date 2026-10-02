import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.BASE_URL || "http://127.0.0.1:5198";
const bridge = process.env.ARKHAM_RULES_URL || "http://127.0.0.1:5194";
const out = process.env.QA_OUT || "output/expanded-play-release";
const catalog = JSON.parse(await readFile("public/data/catalog.json", "utf8"));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  trace = [];
let page;
const get = async (path) => {
  const response = await fetch(`${bridge}/chronicle/play/${path}`);
  assert.ok(response.ok, `GET ${path}: ${response.status}`);
  return response.json();
};
function question(snapshot) {
  let q = snapshot.game.question[snapshot.playerId];
  while (
    q &&
    ["QuestionLabel", "PayCostQuestion", "QuestionWithSource"].includes(q.tag)
  )
    q = q.question ?? q.contents?.[1];
  return q;
}
const tokens = (entity, kind) =>
  Array.isArray(entity.tokens)
    ? entity.tokens.find(([key]) => key === kind)?.[1] || 0
    : entity.tokens?.[kind] || 0;
try {
  page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  if (new URL(base).origin === "https://arkham-lcg.vercel.app") {
    await page
      .context()
      .grantPermissions(["local-network-access"], {
        origin: new URL(base).origin,
      });
  }
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const originalSaves = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) =>
        key.startsWith("arkham-chronicle:save:"),
      ),
    ),
  );
  await page
    .getByRole("button", { name: "Expansions & campaigns", exact: true })
    .click();
  await page.locator(".rules-connection.ready").waitFor({ timeout: 30000 });
  await page.getByText("Deckbuilding checks passed", { exact: true }).waitFor();
  const starter = catalog.starterDecks.find(
    (d) => d.investigatorCode === "60101",
  );
  await page.getByLabel("Official starter deck").selectOption(starter.id);
  assert.match(
    await page.locator(".rules-deck-panel").innerText(),
    /Sold separately/,
  );
  await page
    .getByRole("button", { name: "Use this deck & choose campaign" })
    .click();
  await page.getByRole("heading", { name: "Begin an investigation" }).waitFor();
  await page.getByLabel("Play mode").selectOption("scenario");
  await page.getByLabel("Scenario", { exact: true }).selectOption("01104");
  await page
    .getByLabel("Investigation name")
    .fill(`Chronicle release QA ${new Date().toISOString()}`);
  await page
    .getByRole("button", { name: "Begin investigation", exact: true })
    .click();
  await page
    .locator(".chronicle-companion-table .companion-decision")
    .waitFor();
  const gameId = new URLSearchParams(new URL(page.url()).hash.slice(1)).get(
    "investigation",
  );
  assert.ok(gameId);
  const decks = await get("decks");
  const selectedDeck = decks.find(
    (d) =>
      (d.playList ?? d.list)?.investigator_code?.replace(/^c/, "") === "60101",
  );
  assert.ok(selectedDeck, "actual imported Nathaniel deck available");
  for (let n = 0; n < 35; n++) {
    const snapshot = await get(`games/${gameId}`),
      q = question(snapshot);
    trace.push({
      step: snapshot.game.scenarioSteps,
      phase: snapshot.game.phase,
      question: q?.tag,
    });
    if (
      snapshot.game.phase === "InvestigationPhase" &&
      q?.tag === "PlayerWindowChooseOne"
    )
      break;
    await page.locator(".companion-decision").waitFor();
    let button;
    if (q?.tag === "ChooseDeck") {
      await page
        .getByLabel("Saved deck", { exact: true })
        .selectOption(selectedDeck.id);
      button = page.getByRole("button", {
        name: "Use saved deck",
        exact: true,
      });
    } else {
      const available = page.locator(
        ".companion-decision .button:not(.secondary):not([disabled])",
      );
      const done = available.filter({
        hasText:
          /Done with mulligan|Continue|Begin scenario|Confirm settings|Start game|Done$/i,
      });
      button = (await done.count()) ? done.first() : available.first();
    }
    assert.ok(
      await button.count(),
      `explicit renderer supports setup ${q?.tag}`,
    );
    await button.click();
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".companion-checkpoint")
          ?.matches('[aria-busy="true"]'),
    );
    const after = await get(`games/${gameId}`);
    assert.ok(
      after.game.scenarioSteps !== snapshot.game.scenarioSteps ||
        JSON.stringify(question(after)) !== JSON.stringify(q),
      `printed ${q?.tag} answer advanced native rules`,
    );
    if (n === 34) throw Error("Setup did not reach a playable investigation.");
  }
  const before = await get(`games/${gameId}`),
    actor = Object.values(before.game.investigators)[0];
  const resource = page.getByRole("button", { name: /Take 1 resource/ });
  await resource.waitFor();
  await resource.click();
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".companion-checkpoint")
        ?.matches('[aria-busy="true"]'),
  );
  const after = await get(`games/${gameId}`),
    changed = Object.values(after.game.investigators)[0];
  assert.equal(tokens(changed, "Resource"), tokens(actor, "Resource") + 1);
  assert.equal(changed.remainingActions, actor.remainingActions - 1);
  assert.equal(await page.locator("iframe").count(), 0);
  await page.reload();
  await page
    .locator(".chronicle-companion-table .companion-decision")
    .waitFor();
  const reloaded = await get(`games/${gameId}`);
  assert.equal(reloaded.game.scenarioSteps, after.game.scenarioSteps);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".companion-hand").scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      [
        ...document.querySelectorAll(
          ".companion-investigator .card-face.official-scan img",
        ),
      ].every(
        (image) =>
          image.complete &&
          image.naturalWidth > 0 &&
          getComputedStyle(image).opacity !== "0",
      ),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${out}/table-desktop.png`, fullPage: true });
  await page
    .getByRole("button", { name: "Inspect Study", exact: true })
    .click();
  const sourceModal = page.getByRole("dialog");
  await sourceModal.waitFor();
  assert.match(await sourceModal.innerText(), /Study/);
  assert.equal(
    await sourceModal.getByRole("button", { name: /Flip|Reverse/ }).count(),
    0,
    "visible native encounter keeps its displayed physical side",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Inspect chaos bag", exact: true })
    .click();
  await page.locator(".companion-bag-contents .chaos-token.fail").waitFor();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.screenshot({ path: `${out}/table-mobile.png`, fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.deepEqual(
    await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) =>
          key.startsWith("arkham-chronicle:save:"),
        ),
      ),
    ),
    originalSaves,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/report.json`,
    JSON.stringify(
      {
        passed: true,
        base,
        gameId,
        trace,
        checks: [
          "separate starter source",
          "original client setup and native decisions",
          "resource/action effect",
          "saved reload",
          "physical table without iframe",
          "visible native card inspection preserves side",
          "320px layout",
          "chaos bag and Escape",
          "Core saves intact",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(`Expanded client real-game checks passed: ${gameId}`);
} catch (error) {
  await writeFile(
    `${out}/failed-trace.json`,
    JSON.stringify({ trace, error: error.message }, null, 2),
  );
  if (page && !page.isClosed()) {
    await writeFile(
      `${out}/failed-page.txt`,
      await page.locator("body").innerText(),
    );
    await page.screenshot({ path: `${out}/failed-page.png`, fullPage: true });
  }
  throw error;
} finally {
  await browser.close();
}
