import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createGame, party } from "../src/game/engine.ts";
import { reduceGame } from "../tests/helpers.ts";
import { acknowledgeEvents, clickAndAcknowledge } from "./browser-pacing.mjs";

const base = process.env.BASE_URL || "http://localhost:5187";
const out = process.env.RULES_OUTPUT || "output/rules-audit/browser";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (e.type() === "error") errors.push(e.text());
});
const saved = () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("arkham-chronicle:spreading-flames:v1")),
  );
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png`, animations: "disabled" });
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    const box = await dialog.boundingBox();
    assert.ok(
      box.y >= 0 && box.y + box.height <= 801,
      "desktop dialog stays in viewport",
    );
  }
};
function fixture(codes = ["12004", "12001", "12007"]) {
  let s = createGame("easy", 7331, codes);
  while (s.status === "mulligan")
    s = reduceGame(s, { type: "mulligan", ids: [] });
  party(s).forEach((p) => {
    p.hand = [];
    p.assets = [];
    p.deck = [{ id: `draw-${p.code}`, code: "12089" }];
  });
  s.bag = ["+1"];
  return s;
}
const member = (s, c) => party(s).find((p) => p.code === c);
function enemy(s, code = "12121", id = "foe") {
  s.enemies.push({
    id,
    code,
    location: "12113",
    damage: 0,
    exhausted: false,
    engaged: true,
    engagedWith: s.player.code,
  });
}
async function load(s) {
  await page.goto(base);
  await page.evaluate(
    (s) =>
      localStorage.setItem(
        "arkham-chronicle:spreading-flames:v1",
        JSON.stringify(s),
      ),
    s,
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  await acknowledgeEvents(page);
}
const click = (locator) => clickAndAcknowledge(locator, page);
async function orderResults() {
  while ((await saved()).decision?.title === "Choose skill test result order")
    await click(page.locator(".decision-list>button").first());
}
try {
  let s = fixture();
  member(s, "12001").assets.push({
    id: "guard",
    code: "12016",
    uses: 0,
    damage: 1,
    horror: 0,
    exhausted: false,
  });
  enemy(s);
  await load(s);
  await click(page.getByRole("button", { name: "Resource", exact: true }));
  await shot("01-bodyguard-assignment");
  await click(
    page.getByRole("button", { name: /Bodyguard \(Daniela Reyes\)/ }),
  );
  assert.equal((await saved()).player.code, "12001");
  assert.ok(
    member(await saved(), "12001").discard.some((c) => c.id === "guard"),
  );
  await shot("02-owner-reaction");
  await click(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Decline", exact: true }),
  );
  if ((await saved()).decision)
    await click(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Decline", exact: true }),
    );
  assert.equal(member(await saved(), "12004").damage, 0);

  s = fixture();
  member(s, "12001").hand = [{ id: "assist", code: "12094" }];
  s.doom = 2;
  s.decision = {
    title: "Encounter fixture",
    description: "",
    choices: [
      {
        id: "go",
        label: "Reveal Cosmic Evils",
        effects: [{ kind: "revelation", code: "12124" }],
      },
    ],
  };
  s = reduceGame(s, { type: "choose", id: "go" });
  await load(s);
  await click(page.getByRole("button", { name: "Place 1 doom", exact: true }));
  assert.equal((await saved()).peril, "12004");
  assert.equal(await page.locator(".commit-list button").count(), 0);
  assert.ok(await page.getByText(/Peril: teammates cannot/).isVisible());
  await shot("03-peril-test");
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  assert.equal((await saved()).peril, "12004");

  s = fixture();
  s.player.hand = [{ id: "perception", code: "12093" }];
  member(s, "12007").hand = [{ id: "assist", code: "12094" }];
  s.player.flags.joe = true;
  await load(s);
  await click(page.getByRole("button", { name: "Investigate", exact: true }));
  await page
    .locator(".commit-list button")
    .filter({ hasText: "Perception" })
    .click();
  await page
    .locator(".commit-list button")
    .filter({ hasText: "Unexpected Courage" })
    .click();
  assert.equal(await page.locator(".commit-list button.selected").count(), 2);
  assert.equal((await saved()).limbo.length, 2);
  await shot("04-committed-cards");
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  assert.equal(await page.locator(".commit-list button.selected").count(), 2);
  await click(
    page.getByRole("button", { name: "Draw from the chaos bag", exact: true }),
  );
  await click(page.getByRole("button", { name: /Resolve.*test/i }));
  await orderResults();
  assert.ok(
    member(await saved(), "12007").discard.some((c) => c.id === "assist"),
  );
  assert.ok(
    member(await saved(), "12004").discard.some((c) => c.id === "perception"),
  );

  s = fixture();
  enemy(s, "12121", "first");
  enemy(s, "12123", "second");
  await load(s);
  await click(page.getByRole("button", { name: "Resource", exact: true }));
  await shot("05-attack-order");
  assert.equal((await saved()).decision.title, "Choose attack order");
  await click(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Bystander", exact: true }),
  );
  assert.match(
    (await saved()).log.find((l) => l.text.includes(" attacks ")).text,
    /Bystander/,
  );

  s = fixture(["12001", "12004", "12007"]);
  enemy(s, "12123");
  s.enemies[0].damage = 1;
  s.doom = 2;
  s.bag = ["elder_sign"];
  s.player.hand = [{ id: "overpower", code: "12092" }];
  s = reduceGame(s, { type: "act", kind: "fight", target: "foe" });
  s = reduceGame(s, { type: "commit", id: "overpower" });
  await load(s);
  await click(
    page.getByRole("button", { name: "Draw from the chaos bag", exact: true }),
  );
  assert.equal((await saved()).decision.title, "Daniela’s elder sign");
  await shot("06-elder-sign-before-results");
  await click(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Bystander", exact: true }),
  );
  assert.equal((await saved()).test.kind, "fight");
  assert.equal((await saved()).queuedTests.length, 3);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  await click(page.getByRole("button", { name: /Resolve.*test/i }));
  await orderResults();
  assert.equal((await saved()).test.source, "agenda1");
  assert.ok(
    member(await saved(), "12001").discard.some((c) => c.id === "overpower"),
  );
  await shot("07-queued-agenda-test");

  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/result.json`,
    JSON.stringify(
      {
        base,
        checks: [
          "Bodyguard owner and teammate assignment",
          "Peril and reload",
          "commitments and owner discard",
          "attack order",
          "elder sign timing and saved FIFO tests",
        ],
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("Rules browser checks passed; zero browser errors.");
} finally {
  await browser.close();
}
