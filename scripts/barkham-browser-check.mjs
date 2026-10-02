import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { barkhamCardFace } from "./barkham-card-face.mjs";

const out = process.env.QA_OUT || "output/barkham-client";
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile("public/data/catalog.json", "utf8"));
const cards = (
  await Promise.all(
    manifest.cardFiles.map((path) => readFile(`public${path}`, "utf8")),
  )
).flatMap((value) => JSON.parse(value));
function fixture(investigatorCode, faction, signatures) {
  const names = new Set();
  const pool = cards.filter(
    (c) =>
      c.pack_code === "core" &&
      [faction, "neutral"].includes(c.faction_code) &&
      ["asset", "event", "skill"].includes(c.type_code) &&
      c.xp === 0 &&
      !c.subtype_code &&
      !c.restrictions &&
      !c.hidden &&
      !c.permanent &&
      !names.has(c.name) &&
      names.add(c.name),
  );
  const slots = Object.fromEntries(pool.slice(0, 15).map((c) => [c.code, 2]));
  for (const code of signatures) slots[code] = 1;
  const weakness = cards.find(
    (c) =>
      c.pack_code === "core" &&
      c.subtype_code === "basicweakness" &&
      c.name === "Amnesia",
  );
  assert.ok(weakness);
  slots[weakness.code] = 1;
  return {
    name: "Barkham QA deck",
    investigator_code: investigatorCode,
    slots,
  };
}
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:5187");
  await page
    .getByRole("button", { name: "Expansions & campaigns", exact: true })
    .click();
  await page.locator(".rules-connection.ready").waitFor({ timeout: 30000 });
  const kate = fixture("barkham-004", "seeker", ["barkham-005", "barkham-006"]);
  await page.locator(".rules-upload input").setInputFiles({
    name: "kate.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(kate)),
  });
  await page.getByText("Kate Winthpup", { exact: true }).waitFor();
  await page
    .getByLabel("I reviewed the deck against these printed Barkham options.")
    .check();
  await page.getByText("Deckbuilding checks passed", { exact: true }).waitFor();
  // This checks the real form only. Registry gaps remain explicit until the
  // compiled engine is running; never import a synthetic deck into user saves.
  await page.screenshot({ path: `${out}/kate-deck.png`, fullPage: true });
  const duke = fixture("barkham-013", "survivor", [
    "barkham-014",
    "barkham-015",
  ]);
  await page.locator(".rules-upload input").setInputFiles({
    name: "duke.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(duke)),
  });
  await page.getByText("Duke", { exact: true }).waitFor();
  await page
    .getByLabel("I reviewed every card for cats, including its illustration.")
    .check();
  await page
    .locator(".rules-deck-issues")
    .getByText("Duke's deck cannot contain cats under any circumstances.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Use this deck & choose campaign" })
      .isEnabled(),
    false,
  );
  const removeCats = Object.keys(duke.slots).find(
    (code) => cards.find((c) => c.code === code)?.name === "Stray Cat",
  );
  delete duke.slots[removeCats];
  const extra = cards.find(
    (c) =>
      c.pack_code === "core" &&
      c.xp === 0 &&
      ["survivor", "neutral"].includes(c.faction_code) &&
      ["asset", "event", "skill"].includes(c.type_code) &&
      !c.subtype_code &&
      !c.restrictions &&
      !c.hidden &&
      !c.permanent &&
      !/cat|doyle|hope|augur|zeal/i.test(c.name) &&
      !Object.keys(duke.slots).some(
        (code) => cards.find((card) => card.code === code)?.name === c.name,
      ),
  );
  assert.ok(extra, "Duke fixture has a distinct cat-free replacement");
  duke.slots[extra.code] = 2;
  duke.name = "Duke without cats QA";
  await page.locator(".rules-upload input").setInputFiles({
    name: "duke-no-cats.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(duke)),
  });
  await page.getByRole("heading", { name: duke.name, exact: true }).waitFor();
  await page
    .getByLabel("I reviewed every card for cats, including its illustration.")
    .check();
  await page
    .getByText("Deckbuilding checks passed", { exact: true })
    .waitFor()
    .catch(async (error) => {
      console.error(await page.locator(".rules-deck-issues").innerText());
      await page.screenshot({
        path: `${out}/duke-fixture-failure.png`,
        fullPage: true,
      });
      throw error;
    });
  const artCard = page
    .locator(".barkham-deck-review li")
    .filter({ hasText: "Scavenging" });
  await artCard.getByLabel("Contains a cat", { exact: true }).check();
  await page
    .locator(".rules-deck-issues")
    .getByText("Duke's deck cannot contain cats under any circumstances.", {
      exact: true,
    })
    .waitFor();
  await artCard.getByLabel("Contains a cat", { exact: true }).uncheck();
  await page.getByText("Deckbuilding checks passed", { exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 900 });
  await page.screenshot({ path: `${out}/duke-mobile.png`, fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Barkham choices fit 320px",
  );
  const armor = fixture("01001", "guardian", ["01006", "01007"]);
  armor.name = "Customized armor QA";
  const replace = Object.keys(armor.slots).find(
    (code) => armor.slots[code] === 2,
  );
  delete armor.slots[replace];
  armor.slots["09021"] = 2;
  armor.meta = { cus_09021: "0|1,2|2" };
  await page
    .locator(".rules-upload input")
    .setInputFiles({
      name: "customized-armor.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(armor)),
    });
  await page.getByRole("heading", { name: armor.name, exact: true }).waitFor();
  await page.getByText("Deckbuilding checks passed", { exact: true }).waitFor();
  await page
    .getByText("Level 2 · 3 XP on one sheet, shared by all copies", {
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: `${out}/customization-mobile.png`,
    fullPage: true,
  });
  armor.meta.cus_09021 = "0|2";
  await page
    .locator(".rules-upload input")
    .setInputFiles({
      name: "malformed-armor.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(armor)),
    });
  await page
    .locator(".rules-deck-issues")
    .getByText(/upgrade 0 allows 0–1 marked boxes/)
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Use this deck & choose campaign" })
      .isEnabled(),
    false,
  );
  const face = await context.newPage();
  await face.setViewportSize({ width: 713, height: 1000 });
  await face.setContent(
    barkhamCardFace(cards.find((c) => c.code === "barkham-031")),
  );
  await face.screenshot({ path: `${out}/asylum-text-face.png` });
  await face.setContent(
    barkhamCardFace(
      cards.find((c) => c.code === "barkham-031"),
      true,
    ),
  );
  await face.screenshot({ path: `${out}/asylum-unrevealed.png` });
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/report.json`,
    JSON.stringify(
      {
        passed: true,
        checks: [
          "printed Barkham choices",
          "normal-class legal deck",
          "known cats forbidden",
          "artwork cat choice enforced",
          "320px no overflow",
          "unrevealed text face",
          "customization level and shared XP",
          "malformed customization sheet blocked",
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("Barkham client checks passed.");
} finally {
  await browser.close();
}
