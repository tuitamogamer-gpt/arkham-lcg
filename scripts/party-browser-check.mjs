import { clickAndAcknowledge } from "./browser-pacing.mjs";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createGame } from "../tests/helpers.ts";
import { reduceGame, party } from "../src/game/engine.ts";
const baseUrl = process.env.BASE_URL || "http://localhost:5187";
const out = "output/party-browser";
const desktopOnly = process.env.DESKTOP_ONLY === "1";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const state = async () =>
  JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const shot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
};
async function settle() {
  for (let n = 0; n < 100; n++) {
    const s = await state();
    if (s.status === "resolution") break;
    if (s.test)
      await clickAndAcknowledge(
        page.getByRole("button", {
          name:
            s.test.stage === "commit"
              ? "Draw from the chaos bag"
              : "Resolve the test",
        }),
        page,
      );
    else if (s.decision) {
      const choice =
        s.decision.choices.find((c) =>
          ["skip", "keep", "stay", "wait", "doom"].includes(c.id),
        ) || s.decision.choices[0];
      await clickAndAcknowledge(
        page.locator(".decision-list>button").filter({ hasText: choice.label }),
        page,
      );
    } else break;
  }
}
await page.goto(baseUrl);
await shot("01-home");
await clickAndAcknowledge(
  page.getByRole("button", { name: "Begin your investigation", exact: true }),
  page,
);
await clickAndAcknowledge(
  page.getByRole("button", { name: "Select Daniela Reyes", exact: true }),
  page,
);
await clickAndAcknowledge(
  page.getByRole("button", { name: "Select Trish Scarborough", exact: true }),
  page,
);
assert.equal(
  await page.locator('.investigator-choice[aria-pressed="true"]').count(),
  3,
);
await clickAndAcknowledge(
  page.getByRole("button", { name: "easy", exact: true }),
  page,
);
await shot("02-party-setup");
await clickAndAcknowledge(
  page.getByRole("button", { name: "Enter Miskatonic University" }),
  page,
);
for (const c of ["12004", "12001", "12007"]) {
  assert.equal((await state()).activeInvestigator, c);
  await clickAndAcknowledge(
    page.getByRole("button", { name: "Keep hand & begin" }),
    page,
  );
}
await page.keyboard.press("3");
assert.equal((await state()).activeInvestigator, "12007");
await page.keyboard.press("1");
assert.equal((await state()).activeInvestigator, "12004");
assert.equal((await state()).party.length, 3);
assert.equal((await state()).locations[0].clues, 6);
await shot("03-three-investigators");
await clickAndAcknowledge(
  page.getByRole("button", { name: "Control Daniela Reyes", exact: true }),
  page,
);
assert.equal((await state()).activeInvestigator, "12001");
await clickAndAcknowledge(
  page.getByRole("button", { name: "Resource", exact: true }),
  page,
);
assert.ok(
  await page
    .getByRole("button", { name: "Control Joe Diamond", exact: true })
    .isDisabled(),
);
await clickAndAcknowledge(
  page.getByRole("button", { name: "Resource", exact: true }),
  page,
);
await clickAndAcknowledge(
  page.getByRole("button", { name: "Resource", exact: true }),
  page,
);
await clickAndAcknowledge(
  page.getByRole("button", { name: "End turn", exact: true }),
  page,
);
assert.equal((await state()).activeInvestigator, "12004");
assert.equal((await state()).round, 1);
for (const c of ["12004", "12007"]) {
  assert.equal((await state()).activeInvestigator, c);
  for (let i = 0; i < 3; i++)
    await clickAndAcknowledge(
      page.getByRole("button", { name: "Resource", exact: true }),
      page,
    );
  await clickAndAcknowledge(
    page.getByRole("button", { name: "End turn", exact: true }),
    page,
  );
  await settle();
}
assert.equal((await state()).round, 2);
assert.ok((await state()).party.every((p) => p.actions === 3 && !p.turnEnded));
await shot("04-second-round");
// Controlled party fixture exercises assisted tests and JSON save restoration through real UI.
let fixture = createGame("easy", 7331, ["12004", "12001", "12007"]);
while (fixture.status === "mulligan")
  fixture = reduceGame(fixture, { type: "mulligan", ids: [] });
fixture.bag = ["0"];
party(fixture)
  .find((p) => p.code === "12001")
  .hand.push({ id: "ally-skill", code: "12094" });
await page.evaluate(
  (s) =>
    localStorage.setItem(
      "arkham-chronicle:spreading-flames:v1",
      JSON.stringify(s),
    ),
  fixture,
);
await page.reload();
await clickAndAcknowledge(
  page.getByRole("button", { name: "Continue investigation", exact: true }),
  page,
);
await clickAndAcknowledge(
  page.getByRole("button", { name: "Investigate", exact: true }),
  page,
);
const ally = page
  .locator(".commit-list>button")
  .filter({ hasText: "Unexpected Courage" })
  .filter({ hasText: "Daniela Reyes" })
  .first();
await ally.click();
assert.ok((await state()).test.committed.includes("ally-skill"));
await shot("05-team-skill-test");
const before = await state();
await page.reload();
await clickAndAcknowledge(
  page.getByRole("button", { name: "Continue investigation", exact: true }),
  page,
);
assert.deepEqual((await state()).test, before.test);
await clickAndAcknowledge(
  page.getByRole("button", { name: "Draw from the chaos bag" }),
  page,
);
await shot("06-chaos-reveal");
await clickAndAcknowledge(
  page.getByRole("button", { name: "Resolve the test" }),
  page,
);
await settle();
assert.equal((await state()).player.clues, 1);
await clickAndAcknowledge(
  page.getByRole("button", { name: "Settings & saves", exact: true }),
  page,
);
const download = page.waitForEvent("download");
await clickAndAcknowledge(
  page.getByRole("dialog").getByRole("button", { name: "Export saved game" }),
  page,
);
await (await download).saveAs(`${out}/party-save.json`);
await clickAndAcknowledge(
  page.getByRole("button", { name: "Close dialog" }),
  page,
);
// Show later map with three separate locations, to inspect readability and pawns.
fixture = createGame("easy", 7331, ["12004", "12001", "12007"]);
while (fixture.status === "mulligan")
  fixture = reduceGame(fixture, { type: "mulligan", ids: [] });
fixture.act = 3;
fixture.locations.forEach((l) => {
  l.active = l.code !== "12113";
  l.revealed = l.active;
  l.clues = l.code === "12116" ? 0 : 3;
});
party(fixture).forEach((p, i) => (p.location = ["12116", "12118", "12120"][i]));
fixture.enemies = [
  {
    id: "enemy-display",
    code: "12114",
    location: "12117",
    damage: 2,
    exhausted: false,
    engaged: false,
  },
];
await page.evaluate(
  (s) =>
    localStorage.setItem(
      "arkham-chronicle:spreading-flames:v1",
      JSON.stringify(s),
    ),
  fixture,
);
await page.reload();
await clickAndAcknowledge(
  page.getByRole("button", { name: "Continue investigation", exact: true }),
  page,
);
await shot("07-expanded-map");
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
]) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(150);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${viewport.width}px desktop overflow`,
  );
  const geometry = await page.locator(".map-location").evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        name: n.getAttribute("aria-label"),
      };
    }),
  );
  for (let i = 0; i < geometry.length; i++)
    for (let j = i + 1; j < geometry.length; j++) {
      const a = geometry[i],
        b = geometry[j];
      assert.ok(
        a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y,
        `${viewport.width}px map overlap ${a.name} / ${b.name}`,
      );
    }
  const controls = await page.locator(".action-bar").boundingBox();
  assert.ok(
    controls.y + controls.height <= viewport.height,
    `${viewport.width}px main actions visible without scrolling`,
  );
  await page.screenshot({ path: `${out}/desktop-${viewport.width}.png` });
}
await page.setViewportSize({ width: 1440, height: 1000 });
await clickAndAcknowledge(
  page.getByRole("button", { name: "Control Trish Scarborough", exact: true }),
  page,
);
await page.evaluate(() => scrollTo(0, 0));
await shot("desktop-trish");
// Desktop work is the current priority; preserve optional earlier mobile coverage.
if (!desktopOnly) {
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(baseUrl);
  await mobile.evaluate(() => document.fonts.ready);
  await mobile.waitForTimeout(600);
  await mobile.screenshot({
    path: `${out}/08-home-mobile.png`,
    fullPage: true,
  });
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "mobile home overflow",
  );
  await clickAndAcknowledge(
    mobile.getByRole("button", {
      name: "Begin your investigation",
      exact: true,
    }),
    mobile,
  );
  await clickAndAcknowledge(
    mobile.getByRole("button", { name: "Select Daniela Reyes" }),
    mobile,
  );
  await clickAndAcknowledge(
    mobile.getByRole("button", { name: "Select Trish Scarborough" }),
    mobile,
  );
  await mobile.waitForTimeout(600);
  await mobile.screenshot({
    path: `${out}/09-setup-mobile.png`,
    fullPage: true,
  });
  await clickAndAcknowledge(
    mobile.getByRole("button", { name: "Enter Miskatonic University" }),
    mobile,
  );
  for (let i = 0; i < 3; i++)
    await clickAndAcknowledge(
      mobile.getByRole("button", { name: "Keep hand & begin" }),
      mobile,
    );
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "mobile party table overflow",
  );
  await mobile.waitForTimeout(600);
  await mobile.screenshot({
    path: `${out}/10-party-mobile.png`,
    fullPage: true,
  });
  await mobile.evaluate(
    (s) =>
      localStorage.setItem(
        "arkham-chronicle:spreading-flames:v1",
        JSON.stringify(s),
      ),
    fixture,
  );
  await mobile.reload();
  await clickAndAcknowledge(
    mobile.getByRole("button", { name: "Continue investigation", exact: true }),
    mobile,
  );
  await mobile.waitForTimeout(600);
  await mobile.screenshot({ path: `${out}/11-map-mobile.png`, fullPage: true });
  const mapGeometry = async () =>
    mobile.locator(".map-location").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          name: n.getAttribute("aria-label"),
        };
      }),
    );
  const assertMap = async () => {
    const boxes = await mapGeometry();
    for (let i = 0; i < boxes.length; i++) {
      assert.ok(
        boxes[i].x >= 62 &&
          boxes[i].right <= (await mobile.evaluate(() => innerWidth)),
        `map card ${boxes[i].name} within viewport`,
      );
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        assert.ok(
          a.right <= b.x ||
            b.right <= a.x ||
            a.bottom <= b.y ||
            b.bottom <= a.y,
          `map cards overlap: ${a.name} / ${b.name}`,
        );
      }
    }
  };
  await assertMap();
  // All hand/seat controls stay reachable in a narrow phone layout.
  await mobile.setViewportSize({ width: 320, height: 568 });
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "320px table overflow",
  );
  await assertMap();
  await mobile.waitForTimeout(600);
  await mobile.screenshot({
    path: `${out}/12-small-phone.png`,
    fullPage: true,
  });
}
assert.deepEqual(errors, []);
await writeFile(
  `${out}/results.json`,
  JSON.stringify(
    {
      baseUrl,
      errors,
      checks: [
        "three investigator setup",
        "individual mulligans",
        "turn order selection",
        "no turn interleaving",
        "shared round and upkeep",
        "assisting card commitment",
        "pending test reload",
        "chaos test",
        "party save export",
        "expanded map",
        "keyboard seats",
        "1280/1440/1920 desktop geometry",
        ...(desktopOnly
          ? []
          : ["mobile setup", "mobile table", "320px layout"]),
      ],
    },
    null,
    2,
  ),
);
await browser.close();
console.log("Party browser checks passed. Screenshots saved to " + out);
