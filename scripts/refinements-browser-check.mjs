import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createGame, reduceGame as raw } from "../src/game/engine.ts";
import { reduceGame as step } from "../tests/helpers.ts";
import { acknowledgeEvents } from "./browser-pacing.mjs";

const base = process.env.BASE_URL || "http://localhost:5187";
const out = "output/refinements";
const key = "arkham-chronicle:spreading-flames:v1";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (e.type() === "error") errors.push(e.text());
});
function ready(code = "12004") {
  let s = step(createGame("easy", 712, [code]), { type: "mulligan", ids: [] });
  s.player.hand = [];
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
  s.player.deck = [{ id: "safe", code: "12089" }];
  s.bag = ["0"];
  s.enemies = [
    {
      id: "enemy",
      code: "12122",
      location: s.player.location,
      engaged: true,
      engagedWith: code,
      exhausted: false,
      damage: 0,
    },
  ];
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
async function load(s) {
  await page.goto(base);
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key, s },
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  await page.evaluate(() => document.fonts.ready);
}
const save = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
async function shot(name, fullPage = false) {
  await page.evaluate(() =>
    Promise.all([...document.images].map((i) => i.decode().catch(() => {}))),
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
}
const s = ready();
await load(s);
const art = JSON.parse(await readFile("public/data/art-manifest.json", "utf8"));
const broken = await page.evaluate(async (paths) => {
  const failures = [];
  // Decode actual image bodies; a 200 response alone is insufficient.
  for (let i = 0; i < paths.length; i += 12)
    await Promise.all(
      paths.slice(i, i + 12).map(
        (path) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              if (!img.naturalWidth) failures.push(path);
              resolve();
            };
            img.onerror = () => {
              failures.push(path);
              resolve();
            };
            img.src = path;
          }),
      ),
    );
  return failures;
}, Object.values(art));
assert.deepEqual(broken, []);
const catalog = JSON.parse(
  await readFile("public/data/core-2026.json", "utf8"),
);
assert.deepEqual(
  catalog.filter((c) => !art[c.code]).map((c) => c.code),
  [],
  "every catalog card, including hidden faces, has a scan",
);
const originalSave = await save();
await page.getByRole("button", { name: /^Inspect agenda:/ }).hover();
await page.getByRole("tooltip").waitFor();
assert.match(await page.getByRole("tooltip").innerText(), /Past Curfew/);
assert.ok(
  !(await page.getByRole("tooltip").innerText()).includes("Smoke on the Wind"),
  "Hover must not reveal a future reverse side",
);
await shot("agenda-hover");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /^Inspect act:/ }).focus();
await page.getByRole("tooltip").waitFor();
await shot("act-keyboard-preview");
assert.deepEqual(await save(), originalSave);
await page.keyboard.press("Escape");
await page
  .getByRole("heading", { name: "Spreading Flames", exact: true })
  .hover();
await page.getByRole("tooltip").waitFor();
assert.match(await page.getByRole("tooltip").innerText(), /Campaign record/);
await page.mouse.move(5, 5);
await page.getByRole("tooltip").waitFor({ state: "hidden" });
await shot("weapons-and-symbols", true);
await page
  .getByRole("button", { name: "Fight Hellhound with M1911", exact: true })
  .click();
await acknowledgeEvents(page);
assert.equal((await save()).player.assets[0].uses, 3);
assert.equal((await save()).player.actions, 2);
assert.match(
  await page.getByRole("dialog").innerText(),
  /Attacking with M1911/,
);
await shot("pistol-test");
await page.getByRole("button", { name: "Draw from the chaos bag" }).click();
await acknowledgeEvents(page);
await page.getByRole("button", { name: "Resolve the test" }).click();
await acknowledgeEvents(page);
assert.equal((await save()).enemies[0].damage, 2);
// Actual story transitions and persistence.
for (const kind of ["act", "agenda"]) {
  const story = ready();
  story.enemies = [];
  if (kind === "agenda") story.doom = 2;
  const next = trigger(story, [
    { kind: kind === "act" ? "advanceAct" : "doom", amount: 1 },
  ]);
  await load(next);
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert.ok(await page.locator(".story-passage").isVisible());
  assert.ok(await page.locator(".next-chapter").isVisible());
  await shot(`${kind}-story`);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  assert.ok(await page.locator(".story-passage").isVisible());
  await page.getByRole("button", { name: "Inspect full card" }).click();
  assert.equal(
    await page.getByRole("dialog").count(),
    1,
    "only top inspection dialog is accessible",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  assert.ok(await page.locator(".story-passage").isVisible());
}
let encounter = ready();
encounter.enemies = [];
encounter.encounterDeck = ["12125"];
encounter = trigger(encounter, [{ kind: "encounter" }]);
await load(encounter);
assert.match(
  await page.locator(".encounter-route").innerText(),
  /Your threat area/,
);
await shot("encounter-reveal");
await page.getByRole("button", { name: "Continue game", exact: true }).click();
assert.match(await page.locator(".encounter-route").innerText(), /threat area/);
await shot("encounter-threat-area");
await acknowledgeEvents(page);
assert.ok((await save()).player.threats.includes("12125"));
const completed = trigger(ready(), [{ kind: "endEncounter", code: "12130" }]);
await load(completed);
assert.match(
  await page.locator(".encounter-route").innerText(),
  /Encounter discard pile/,
);
await shot("encounter-discard");
// Real post-attack reaction, with the injury already applied.
let reaction = trigger(ready("12001"), [
  { kind: "attack", id: "enemy", source: "opportunity" },
]);
for (
  let n = 0;
  n < 30 && reaction.decision?.title !== "Daniela strikes back";
  n++
) {
  if (reaction.event)
    reaction = raw(reaction, { type: "continue", eventId: reaction.event.id });
  else if (reaction.decision)
    reaction = step(reaction, {
      type: "choose",
      id: (
        reaction.decision.choices.find((c) => /Daniela/.test(c.label)) ||
        reaction.decision.choices.find((c) => c.id === "self") ||
        reaction.decision.choices[0]
      ).id,
    });
  else break;
}
await load(reaction);
assert.match(
  await page.getByRole("dialog").innerText(),
  /counterattack, not a defense/,
);
await shot("daniela-counterattack");
await page.getByRole("button", { name: "Fight · M1911", exact: true }).click();
await acknowledgeEvents(page);
assert.equal((await save()).player.actions, 3);
assert.equal((await save()).player.assets[0].uses, 3);
// Small viewports retain readable decisions and an on-screen continuation.
for (const width of [1280, 390]) {
  await page.setViewportSize({ width, height: 800 });
  await load(completed);
  assert.ok(
    await page
      .getByRole("button", { name: "Continue game", exact: true })
      .isVisible(),
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await shot(`encounter-${width}`);
}
// Even a corrupt local image must leave a bounded, readable card fallback.
await page.setViewportSize({ width: 1280, height: 900 });
await page.route("**/art/cards/12122.jpg", (route) =>
  route.fulfill({
    status: 200,
    contentType: "image/jpeg",
    body: "corrupt image fixture",
  }),
);
let missing = ready();
missing.encounterDeck = ["12122"];
missing = trigger(missing, [{ kind: "encounter" }]);
await load(missing);
await page.locator(".event-source .card-face:not(.official-scan)").waitFor();
await shot("image-fallback-dialog");
await page
  .getByRole("button", { name: "View table · keep paused", exact: true })
  .click();
const fallback = page.locator(".enemy-card-preview .table-card-fallback");
await fallback.waitFor();
assert.ok(
  await fallback.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return [...el.children]
      .filter((c) => getComputedStyle(c).display !== "none")
      .every((c) => {
        const r = c.getBoundingClientRect();
        return (
          r.top >= box.top - 1 &&
          r.bottom <= box.bottom + 1 &&
          r.right <= box.right + 1
        );
      });
  }),
  "fallback text stays inside the enemy card",
);
await shot("image-fallback-table", true);
await page.unroute("**/art/cards/12122.jpg");
assert.deepEqual(errors, []);
await writeFile(
  `${out}/results.json`,
  JSON.stringify(
    {
      cardFaces: Object.keys(art).length,
      broken,
      fallback: "corrupt-image recovery and bounded text verified",
      weaponAttack: "1 action + 1 ammo, 2 damage",
      counterattack: "0 actions + 1 ammo, injuries preserved",
      hover: "pointer and keyboard, no save changes or future story",
      story: "act/agenda persisted on reload",
      encounters: "reveal, threat, discard",
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
console.log(
  "Refinement browser checks passed; all catalog card faces decoded.",
);
