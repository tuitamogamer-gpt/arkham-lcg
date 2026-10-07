// Fixture integration check for pinned native campaign/standalone decisions.
// The isolated bridge below never opens or modifies a real saved investigation.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:5198";
const bridgePort = Number(process.env.QA_BRIDGE_PORT || 5197);
const out = resolve(process.env.QA_OUT || "output/imported-decisions");
const seat = "scarlet-keys-qa-seat";
const ids = [1, 2, 3, 4, 5, 6].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
// Relevant subset of edgeOfTheEarth.json's Fatal Mirage (08549) settings at
// revision 03a7f1e74925744f021f6e8fe0e39945d2c3a833.
const fatalMirageSettings = [
  { key: "PerformIntro", type: "ToggleOption", content: false },
  { type: "Group", key: "Choose who was killed in the plane crash",
    ifRecorded: [{ type: "option", key: "PerformIntro" }],
    content: [{ type: "SetPartnerKilled", key: "KilledInPlaneCrash", content: null }] },
  { type: "SetPartnerDetails", key: "Dr. Amy Kensler", value: "08720", maxDamage: 1, maxHorror: 3,
    content: { damage: 0, horror: 0, status: "Safe" },
    ifRecorded: [{ type: "survivedPlaneCrash", key: "08720" }] },
  { type: "SetPartnerDetails", key: "Prof. William Dyer", value: "08714", maxDamage: 0, maxHorror: 4,
    content: { damage: 0, horror: 0, status: "Safe" },
    ifRecorded: [{ type: "survivedPlaneCrash", key: "08714" }] },
];
const questions = [
  { current: "Tunguska", locations: [["Tunguska", { travel: 0 }]], available: ["Tunguska"], hasTicket: true },
  { current: "London", locations: [
    ["London", { travel: 0 }], ["Venice", { travel: 0 }],
    ["Rome", { travel: 1 }], ["Istanbul", { travel: null }],
    ["BermudaTriangle", { travel: 2 }],
  ], available: ["London", "Venice", "Istanbul"], hasTicket: true },
  { current: "London", locations: [["Venice", { travel: 1 }]], available: ["Venice"], hasTicket: true },
  { current: "Tunguska", locations: [["Tunguska", { travel: 0 }]], available: ["Tunguska"], hasTicket: false },
];
const original = questions.map((payload, i) => ({
  playerId: seat, investigatorIds: [], multiplayerMode: "Solo",
  game: {
    id: ids[i], name: "Scarlet Keys travel fixture", scenarioSteps: 101,
    phase: "CampaignPhase", activePlayerId: seat,
    campaign: { id: "09", name: "The Scarlet Keys" },
    question: { [seat]: { tag: "PickCampaignSpecific", contents: ["embark", payload] } },
  },
}));
for (const id of ids.slice(4)) original.push({
  playerId: seat, investigatorIds: [], multiplayerMode: "Solo",
  game: {
    id, name: "Fatal Mirage settings fixture", scenarioSteps: 101, phase: "SetupPhase",
    activePlayerId: seat, scenario: { id: "08549", name: "Fatal Mirage" },
    question: { [seat]: { tag: "PickScenarioSettings" } },
  },
});
let snapshots = structuredClone(original);
const answers = [], errors = [], checks = [];
let rejectNext = false;
await mkdir(out, { recursive: true });
await writeFile(resolve(out, "report.json"), JSON.stringify({ passed: false, startedAt: new Date().toISOString() }));
const options = JSON.parse(await readFile("scripts/data/native-play-options.json", "utf8"));
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", new URL(base).origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  const send = (status, value) => { res.writeHead(status); res.end(JSON.stringify(value)); };
  if (req.method === "OPTIONS") { send(204, null); return; }
  const path = new URL(req.url, `http://127.0.0.1:${bridgePort}`).pathname;
  const index = ids.findIndex(id => path.includes(id));
  if (req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (index < 0 || !path.endsWith("/answer")) { send(404, {}); return; }
    const answer = JSON.parse(Buffer.concat(chunks).toString());
    answers.push({ gameId: ids[index], answer });
    if (rejectNext) { rejectNext = false; send(409, { error: "The route changed. Choose again." }); return; }
    snapshots[index].game.scenarioSteps++;
    snapshots[index].game.question[seat] = {
      tag: "ChooseOne", choices: [{ tag: "Label", label: "Travel received by the fixture" }],
    };
    send(200, {}); return;
  }
  if (path.endsWith("/step")) send(200, { step: snapshots[index]?.game.scenarioSteps || 0 });
  else if (index >= 0) send(200, snapshots[index]);
  else if (path.endsWith("/options")) send(200, options);
  else if (path.endsWith("/presentation")) send(200, { strings: {}, scenarioSettings: { "08549": fatalMirageSettings }, campaignSettings: {} });
  else if (path.endsWith("/status")) send(200, { ready: true, version: "isolated travel fixture", supportedCardCodes: [], limitations: [] });
  else send(200, []);
});
await new Promise((ok, fail) => { server.once("error", fail); server.listen(bridgePort, "127.0.0.1", ok); });
const browsers = [];
try {
  for (const [engine, type] of [["chromium", chromium], ["webkit", webkit]]) {
    snapshots = structuredClone(original);
    const browser = await type.launch({ headless: true });
    browsers.push(browser);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: "reduce", serviceWorkers: "block" });
    page.on("pageerror", e => errors.push(`${engine}: ${e.message}`));
    page.on("console", message => { if (message.type() === "error" && !message.text().includes("409 (Conflict)")) errors.push(`${engine}: ${message.text()}`); });
    const open = async (index, selector = ".companion-travel") => {
      await page.goto("about:blank");
      await page.goto(`${base}/#investigation=${ids[index]}`);
      await page.locator(selector).waitFor();
    };
    await open(0);
    assert.equal(await page.getByRole("button", { name: "Travel here", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Travel without stopping", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Use expedited ticket", exact: true }).count(), 0);
    assert.equal(answers.filter(a => a.gameId === ids[0]).length, engine === "chromium" ? 0 : 1, "opening never answers automatically");
    await page.screenshot({ path: resolve(out, `${engine}-finale.png`), fullPage: true });
    await page.reload();
    const travel = page.getByRole("button", { name: "Travel here", exact: true });
    await travel.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Travel received by the fixture", exact: true }).waitFor();
    assert.deepEqual(answers.at(-1).answer, { tag: "CampaignSpecificAnswer", contents: ["travel", "Tunguska"] });
    await page.reload();
    await page.getByRole("button", { name: "Travel received by the fixture", exact: true }).waitFor();
    checks.push(`${engine}: current Tunguska finale, explicit keyboard answer, reload`);

    await open(1);
    const field = title => page.locator(".companion-travel fieldset").filter({ has: page.locator("legend", { hasText: title }) });
    assert.equal(await field("London").getByRole("button").count(), 0);
    assert.match(await field("Venice").innerText(), /1 travel time/);
    assert.equal(await field("Venice").getByRole("button", { name: "Use expedited ticket" }).count(), 0);
    assert.equal(await field("Rome").getByRole("button", { name: "Travel here", exact: true }).isDisabled(), true);
    assert.equal(await field("Rome").getByRole("button", { name: "Travel without stopping" }).isEnabled(), true);
    assert.match(await field("Istanbul").innerText(), /no available route/i);
    assert.equal(await field("Istanbul").locator("button:not([disabled])").count(), 0);
    assert.equal(await field("Bermuda").count(), 0);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.screenshot({ path: resolve(out, `${engine}-routes-mobile.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await field("Rome").getByRole("button", { name: "Travel without stopping" }).click();
    await page.getByRole("button", { name: "Travel received by the fixture", exact: true }).waitFor();
    assert.equal(answers.at(-1).answer.contents[0], "travelVia");
    assert.equal(answers.at(-1).answer.contents[1], "Rome");
    checks.push(`${engine}: green entry cost, locked transit, disconnected route, sealed Bermuda, 320px`);

    await page.setViewportSize({ width: 1440, height: 1050 });
    await open(2);
    rejectNext = true;
    await page.getByRole("button", { name: "Use expedited ticket", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "The route changed" }).first().waitFor();
    await page.getByRole("button", { name: "Use expedited ticket", exact: true }).click({ clickCount: 2 });
    await page.getByRole("button", { name: "Travel received by the fixture", exact: true }).waitFor();
    const ticketAnswers = answers.filter(a => a.gameId === ids[2]).slice(engine === "chromium" ? 0 : 2);
    assert.equal(ticketAnswers.length, 2, "rejected submission plus one accepted retry; double click cannot answer twice");
    assert.deepEqual(ticketAnswers[1].answer, { tag: "CampaignSpecificAnswer", contents: ["travelWithTicket", "Venice"] });
    checks.push(`${engine}: rejected choice retained, ticket retry, duplicate-click guard`);

    await open(4, '[aria-label="Dr. Amy Kensler: Status"]');
    const kensler = page.getByRole("group", { name: "Dr. Amy Kensler", exact: true });
    const dyer = page.getByRole("group", { name: "Prof. William Dyer", exact: true });
    const intro = page.getByRole("checkbox", { name: "Perform Intro", exact: true });
    await kensler.getByLabel("damage", { exact: true }).fill("1");
    await intro.check();
    await page.getByLabel("Killed In Plane Crash", { exact: true }).selectOption("08720");
    await kensler.waitFor({ state: "hidden" });
    assert.equal(await dyer.count(), 1);
    await intro.uncheck();
    await kensler.waitFor();
    assert.equal(await page.getByLabel("Killed In Plane Crash", { exact: true }).count(), 0);
    assert.equal(await kensler.getByLabel("damage", { exact: true }).inputValue(), "1", "hiding settings preserves the player's choices for a restored branch");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.screenshot({ path: resolve(out, `${engine}-fatal-mirage-mobile.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole("button", { name: "Begin with these settings", exact: true }).click();
    await page.getByRole("button", { name: "Travel received by the fixture", exact: true }).waitFor();
    assert.equal(answers.at(-1).answer.tag, "StandaloneSettingsAnswer");
    const restoredSettings = answers.at(-1).answer.contents;
    assert.ok(Array.isArray(restoredSettings));
    assert.equal(restoredSettings.some(s => s.type === "Group"), false);
    assert.equal(restoredSettings.find(s => s.value === "08720").content.damage, 1);
    assert.equal(restoredSettings.find(s => s.key === "PerformIntro").content, false);
    checks.push(`${engine}: Fatal Mirage toggled-off crash restores partner details and omits hidden records`);

    await page.setViewportSize({ width: 1440, height: 1050 });
    await open(5, '[aria-label="Dr. Amy Kensler: Status"]');
    await intro.check();
    const beforeEmptyAnswer = answers.length;
    await page.getByRole("button", { name: "Begin with these settings", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: /partner|crash/i }).first().waitFor();
    assert.equal(answers.length, beforeEmptyAnswer, "missing required crash partner is rejected before native submission");
    await page.getByLabel("Killed In Plane Crash", { exact: true }).selectOption("08720");
    await kensler.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Begin with these settings", exact: true }).click();
    await page.getByRole("button", { name: "Travel received by the fixture", exact: true }).waitFor();
    const activeSettings = answers.at(-1).answer.contents;
    assert.equal(activeSettings.find(s => s.type === "Group").content[0].content, "08720");
    assert.equal(activeSettings.some(s => s.value === "08720"), false);
    assert.equal(activeSettings.find(s => s.value === "08714").content.status, "Safe");
    checks.push(`${engine}: Fatal Mirage mandatory crash choice, active killed partner excluded, surviving partner retained`);
    await browser.close();
  }
  // Run the shared web-game skill client against the same isolated finale.
  const client = process.env.WEB_GAME_CLIENT || resolve(homedir(), ".codex/skills/develop-web-game/scripts/web_game_playwright_client.js");
  // Configure the original client for a DOM table: reduced motion and the
  // browser's default renderer. Its software-WebGL flags can stall screenshots
  // on macOS even though this fixture has no canvas or WebGL content.
  const skillOut = resolve(out, "skill"), preload = resolve(skillOut, "reduced-motion.mjs");
  await mkdir(skillOut, { recursive: true });
  await rm(resolve(skillOut, "state-0.json"), { force: true });
  const playwrightUrl = pathToFileURL(createRequire(client).resolve("playwright")).href;
  await writeFile(preload, `import playwright from ${JSON.stringify(playwrightUrl)};
const { chromium } = playwright;
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const [options = {}, ...rest] = args;
  const browser = await launch({ ...options, args: (options.args || []).filter(arg => !arg.startsWith("--use-gl=") && !arg.startsWith("--use-angle=")) }, ...rest);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = options => newPage({ ...options, reducedMotion: "reduce", serviceWorkers: "block" });
  return browser;
};
`);
  await promisify(execFile)(process.execPath, ["--import", preload, client, "--url", `${base}/#investigation=${ids[3]}`, "--click-selector", ".companion-travel button", "--actions-json", JSON.stringify({ steps: [{ buttons: [], frames: 2 }] }), "--iterations", "1", "--pause-ms", "250", "--screenshot-dir", skillOut], { timeout: 60000 });
  const textState = JSON.parse(await readFile(resolve(out, "skill/state-0.json"), "utf8"));
  assert.equal(textState.decision.options[0].text, "Travel received by the fixture");
  assert.deepEqual(errors, []);
  await writeFile(resolve(out, "report.json"), JSON.stringify({ passed: true, checks, answers, errors, evidence: "Native-shaped protocol fixtures through the real Chronicle UI; no native campaign playthrough or real save mutation." }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, errors }));
} catch (error) {
  await writeFile(resolve(out, "report.json"), JSON.stringify({ passed: false, checks, answers, errors, failure: error.message }, null, 2));
  throw error;
} finally {
  await Promise.all(browsers.map(browser => browser.close()));
  server.closeAllConnections();
  await new Promise(ok => server.close(ok));
}
