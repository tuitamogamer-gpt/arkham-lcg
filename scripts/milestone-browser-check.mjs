// Presentation integration checks only: fresh controlled Core save fixtures,
// actual Core UI/reducer actions, and GET-only authored native wire snapshots.
// This does not play or certify a complete native scenario or touch QA saves.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createGame, reduceGame } from "../tests/helpers.ts";
import { decodeSave } from "../src/game/storage.ts";

const base = process.env.BASE_URL || "http://127.0.0.1:5198";
const out = process.env.QA_OUT || "output/milestone-motion/browser";
const checks = [],
  errors = [],
  expectedImportErrors = [],
  blockedWrites = [],
  media = [];
await mkdir(out, { recursive: true });
const reportPath = `${out}/report.json`;
const startedAt = new Date().toISOString();
await writeFile(
  reportPath,
  JSON.stringify(
    { passed: false, startedAt, scope: "isolated presentation fixtures" },
    null,
    2,
  ),
);
const browser = await chromium.launch({ headless: true });
let nextId = 0;
let lastPage;
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function ready() {
  const game = reduceGame(createGame("easy", 712), {
    type: "mulligan",
    ids: [],
  });
  game.id = `milestone-presentation-${++nextId}`;
  return game;
}
function decision(game, label, effects) {
  game.decision = {
    title: "Presentation fixture",
    description:
      "Controlled public checkpoint; this is not a scenario playthrough.",
    choices: [{ id: "go", label, effects }],
  };
  return game;
}
function actFixture() {
  const game = ready();
  game.player.clues = 2;
  // Let the actual reducer author its end-of-round clue payment decision.
  return reduceGame(
    decision(game, "Prepare round end", [
      { kind: "roundEnd", actor: "scenario" },
    ]),
    { type: "choose", id: "go" },
  );
}
function agendaFixture(final = false) {
  const game = ready();
  game.agenda = final ? 3 : 1;
  game.doom = final ? 9 : 2;
  return decision(game, "Place 1 doom", [{ kind: "doom", amount: 1 }]);
}
async function context({
  motion = "full",
  reduced = false,
  width = 1440,
  fixture,
  errorSink = errors,
} = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: reduced ? "reduce" : "no-preference",
    serviceWorkers: "block",
  });
  await ctx.addInitScript(
    ({ motion, fixture }) => {
      localStorage.setItem("arkham-chronicle:motion", motion);
      localStorage.setItem("arkham-chronicle:tutorial", "done");
      if (fixture && !localStorage.getItem("milestone-fixture-initialized")) {
        localStorage.setItem(
          "arkham-chronicle:spreading-flames:v1",
          JSON.stringify(fixture),
        );
        localStorage.setItem("milestone-fixture-initialized", "yes");
      }
      window.milestoneAdded = [];
      window.milestoneSpacePrevented = [];
      window.addEventListener("keydown", (event) => {
        if (event.code === "Space")
          queueMicrotask(() =>
            window.milestoneSpacePrevented.push(event.defaultPrevented),
          );
      });
      const observer = new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes) {
            if (node instanceof Element) {
              const notices = [
                ...(node.matches(".milestone-notice") ? [node] : []),
                ...node.querySelectorAll(".milestone-notice"),
              ];
              for (const notice of notices)
                window.milestoneAdded.push({
                  kind: notice.dataset.milestone,
                  key: notice.dataset.milestoneKey,
                  time: performance.now(),
                });
            }
          }
      });
      observer.observe(document, { childList: true, subtree: true });
    },
    { motion, fixture },
  );
  const page = await ctx.newPage();
  lastPage = page;
  page.on("pageerror", (e) => errorSink.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errorSink.push(message.text());
  });
  return { ctx, page };
}
async function openCore(page, fixture) {
  await page.goto(base);
  await page
    .getByRole("button", {
      name:
        fixture.status === "resolution"
          ? "Open campaign record"
          : "Continue investigation",
      exact: true,
    })
    .click();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.locator(".milestone-notice").count(),
    0,
    "initial save hydration never animates",
  );
}
async function save(page) {
  return page.evaluate(() => {
    const id = JSON.parse(
      localStorage.getItem("arkham-chronicle:saves") || "{}",
    ).active;
    return JSON.parse(localStorage.getItem(`arkham-chronicle:save:${id}`));
  });
}
async function acknowledgeUntil(page, milestone) {
  // The actual engine may pause on clue/doom bookkeeping before advancing.
  // Only explicit enabled Continue buttons move these real checkpoints.
  for (let guard = 0; guard < 20; guard++) {
    const current = await save(page);
    if (
      milestone === "act"
        ? current.act === 2
        : milestone === "agenda"
          ? current.agenda === 2
          : current.status === "resolution"
    )
      return;
    assert.ok(
      current.event,
      "a real checkpoint precedes the expected transition",
    );
    await page
      .getByRole("button", { name: "Continue game", exact: true })
      .click();
  }
  throw Error("Expected actual Core milestone was not reached.");
}
async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png` });
}
async function assertNotice(
  page,
  kind,
  title,
  { quiet = false, video = false } = {},
) {
  const notice = page.locator(`.milestone-notice[data-milestone="${kind}"]`);
  await notice.waitFor();
  assert.equal(
    await page.locator(".milestone-notice").count(),
    1,
    "one cue per significant transition",
  );
  assert.equal(await notice.locator("strong").innerText(), title);
  assert.equal(await notice.getAttribute("role"), "status");
  assert.equal(
    await notice.evaluate((node) => getComputedStyle(node).pointerEvents),
    "none",
  );
  assert.equal(
    await notice.locator("button,input,[tabindex='0']").count(),
    0,
    "ornament does not add interactive controls",
  );
  const key = await notice.getAttribute("data-milestone-key");
  const art = page.locator(`.milestone-art-layer[data-milestone-key="${key}"]`);
  if (quiet) {
    assert.match(await notice.getAttribute("class"), /quiet/);
    assert.equal(
      await page
        .locator(".milestone-art-layer,.milestone-art video,.milestone-art svg")
        .count(),
      0,
      "reduced/subtle mode never instantiates media or the Player",
    );
  } else if (video) {
    assert.equal(
      await art.count(),
      1,
      "one decorative sibling belongs to the same significant cue",
    );
    await page.waitForFunction(
      (key) => {
        const layer = [
          ...document.querySelectorAll(".milestone-art-layer"),
        ].find((layer) => layer.dataset.milestoneKey === key);
        const video = layer?.querySelector("video");
        return (
          video &&
          video.readyState >= 2 &&
          video.videoWidth > 0 &&
          video.currentTime > 0
        );
      },
      key,
      { timeout: 1500 },
    );
    const info = await art.locator("video").evaluate((v) => ({
      src: v.currentSrc,
      width: v.videoWidth,
      height: v.videoHeight,
      time: v.currentTime,
      paused: v.paused,
      muted: v.muted,
      loop: v.loop,
    }));
    assert.ok(
      new URL(info.src).pathname.startsWith("/motion/"),
      "only local authored video",
    );
    assert.equal(info.muted, true);
    assert.equal(info.loop, false);
    assert.equal(info.paused, false);
    media.push({ kind, ...info });
  } else {
    assert.equal(
      await art.count(),
      1,
      "one decorative sibling belongs to the same significant cue",
    );
    await art.locator("svg").waitFor({ timeout: 1500 });
    await page.waitForFunction(
      (key) => {
        const layer = [
          ...document.querySelectorAll(".milestone-art-layer"),
        ].find((layer) => layer.dataset.milestoneKey === key);
        const svg = layer?.querySelector("svg");
        return (
          svg &&
          svg.getBoundingClientRect().width > 100 &&
          Number(getComputedStyle(svg).opacity) > 0
        );
      },
      key,
      { timeout: 1500 },
    );
    const svg = await art.locator("svg").evaluate((svg) => ({
      width: svg.getBoundingClientRect().width,
      opacity: getComputedStyle(svg).opacity,
      frame: svg.innerHTML,
    }));
    assert.ok(
      svg.width > 100 && Number(svg.opacity) > 0,
      "Remotion seal painted a real frame",
    );
    media.push({ kind, remotionPaint: true, width: svg.width });
  }
  return notice;
}
async function noTimerMutation(page) {
  const before = await save(page);
  await page.waitForTimeout(2400);
  assert.deepEqual(
    await save(page),
    before,
    "animation completion never changes rules state, checkpoints, RNG, log or saved data",
  );
  assert.equal(
    await page.locator(".milestone-notice").count(),
    0,
    "finite accent is removed",
  );
  assert.equal(
    await page.locator(".milestone-art-layer").count(),
    0,
    "finite art sibling is removed with its notice",
  );
}

try {
  const act = actFixture();
  const { ctx, page } = await context({ fixture: act });
  await openCore(page, act);
  await page
    .getByRole("button", { name: "Spend clues & advance", exact: true })
    .click();
  await acknowledgeUntil(page, "act");
  await assertNotice(page, "act", "Act 2", { video: true });
  assert.equal((await save(page)).act, 2);
  // Continue is a genuine engine checkpoint. The accent must not trap it.
  const control = page.getByRole("button", {
    name: "Continue game",
    exact: true,
  });
  assert.equal(
    await control.isEnabled(),
    true,
    "actual checkpoint control remains enabled before the effect ends",
  );
  await shot(page, "core-act-desktop");
  await noTimerMutation(page);
  const seen = await page.evaluate(() => window.milestoneAdded.length);
  await control.click();
  await page.waitForTimeout(80);
  assert.equal(
    await page.evaluate(() => window.milestoneAdded.length),
    seen,
    "routine checkpoint continuation does not replay the cue",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  assert.equal(
    await page.locator(".milestone-notice").count(),
    0,
    "reload of advanced save is silent",
  );
  checks.push(
    "Actual Core clue-payment act advancement: local video decodes; one accent; enabled checkpoint; timers preserve state; continuation and reload silent.",
  );
  await ctx.close();

  {
    const fixture = ready();
    const { ctx, page } = await context({ fixture });
    await openCore(page, fixture);
    const advanced = reduceGame(
      decision(structuredClone(fixture), "Advance authored case", [
        { kind: "advanceAct" },
      ]),
      { type: "choose", id: "go" },
    );
    const ending = reduceGame(
      decision(structuredClone(advanced), "Close authored case", [
        { kind: "finish", source: "saved" },
      ]),
      { type: "choose", id: "go" },
    );
    for (const [name, imported] of [
      ["act", advanced],
      ["ending", ending],
    ]) {
      assert.equal(
        imported.id,
        fixture.id,
        "regression uses the same mounted investigation identity",
      );
      const payload = JSON.stringify(imported);
      const decoded = decodeSave(JSON.parse(payload));
      assert.ok(
        decoded,
        "import uses the application's actual valid export/save format",
      );
      await page
        .getByRole("button", { name: "Settings & saves", exact: true })
        .click();
      await page.locator('input[type="file"]').setInputFiles({
        name: `authored-same-id-${name}.json`,
        mimeType: "application/json",
        buffer: Buffer.from(payload),
      });
      await page
        .getByRole("status")
        .filter({ hasText: "Saved investigation restored." })
        .waitFor();
      await page.waitForFunction(
        ({ id, expected }) => {
          const current = JSON.parse(
            localStorage.getItem(`arkham-chronicle:save:${id}`) || "null",
          );
          return (
            current?.act === expected.act &&
            current?.status === expected.status &&
            current?.eventSerial === expected.eventSerial &&
            current?.campaign.result === expected.campaign.result
          );
        },
        { id: decoded.id, expected: decoded },
      );
      assert.deepEqual(
        await save(page),
        decoded,
        "same-id import restores the exact decoded state",
      );
      await page.waitForTimeout(100);
      assert.equal(
        await page.locator(".milestone-notice").count(),
        0,
        "successful same-id restoration does not animate saved progression",
      );
      assert.equal(
        await page.evaluate(() => window.milestoneAdded.length),
        0,
        "restoration never briefly instantiates a saved milestone",
      );
    }
    await shot(page, "same-id-restored-ending-silent");
    checks.push(
      "Actual UI same-id save imports while the game is mounted: newer act and ending restore their exact decoded states without even briefly creating a milestone.",
    );
    await ctx.close();
  }

  for (const width of [390, 320]) {
    const fixture = agendaFixture();
    const { ctx, page } = await context({ fixture, width });
    await openCore(page, fixture);
    await page
      .getByRole("button", { name: "Place 1 doom", exact: true })
      .click();
    await acknowledgeUntil(page, "agenda");
    const notice = await assertNotice(page, "agenda", "Agenda 2", {
      video: true,
    });
    const bounds = await notice.boundingBox();
    assert.ok(
      bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
      "milestone stays within the narrow viewport",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "no horizontal overflow",
    );
    await shot(page, `core-agenda-${width}`);
    await noTimerMutation(page);
    checks.push(
      `Actual Core doom advancement: decoded agenda video, correct title, preserved native checkpoint and ${width}px layout.`,
    );
    await ctx.close();
  }

  for (const [kind, result, title] of [
    ["victory", "saved", "Objective complete"],
    ["defeat", "overrun", "Investigation lost"],
    ["ended", "resigned", "Investigation ended"],
  ]) {
    let fixture = kind === "defeat" ? agendaFixture(true) : ready();
    if (kind !== "defeat")
      fixture = decision(fixture, "Close the authored case", [
        { kind: "finish", source: result },
      ]);
    const { ctx, page } = await context({ fixture });
    await openCore(page, fixture);
    await page
      .getByRole("button", {
        name: kind === "defeat" ? "Place 1 doom" : "Close the authored case",
        exact: true,
      })
      .click();
    await acknowledgeUntil(page, "ending");
    await assertNotice(page, kind, title);
    assert.equal(
      (await save(page)).campaign.result,
      result,
      "result comes from the authoritative actual reducer",
    );
    const home = page.getByRole("button", {
      name: "Return to the archive",
      exact: true,
    });
    assert.equal(
      await home.isEnabled(),
      true,
      "resolution control is immediately usable",
    );
    if ((await save(page)).event)
      assert.equal(
        await page
          .getByRole("button", { name: "Continue game", exact: true })
          .isEnabled(),
        true,
        "the actual ending checkpoint stays usable during the ornament",
      );
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await page.keyboard.press("Space");
    assert.deepEqual(
      await page.evaluate(() => window.milestoneSpacePrevented),
      [false],
      "Player never captures the host's Space shortcut",
    );
    await shot(page, `core-${kind}-remotion`);
    await noTimerMutation(page);
    checks.push(
      `Actual Core ${result} resolution: correct ${kind} title, painted silent Remotion seal, usable controls, Space is not captured, no timer state mutation.`,
    );
    await ctx.close();
  }

  for (const options of [{ motion: "subtle" }, { reduced: true }]) {
    const fixture = agendaFixture(true);
    const { ctx, page } = await context({ fixture, ...options });
    const requested = [];
    page.on("request", (request) => requested.push(request.url()));
    await openCore(page, fixture);
    await page
      .getByRole("button", { name: "Place 1 doom", exact: true })
      .click();
    await acknowledgeUntil(page, "ending");
    await assertNotice(page, "defeat", "Investigation lost", { quiet: true });
    assert.equal(
      requested.filter((url) =>
        /ResolutionPlayer|\/motion\/.*\.(?:webm|mp4)/.test(url),
      ).length,
      0,
      "quiet modes never load motion assets or the lazy Player module",
    );
    await shot(page, `core-${options.reduced ? "reduced" : "subtle"}`);
    await noTimerMutation(page);
    checks.push(
      `${options.reduced ? "OS reduced motion" : "Subtle preference"}: static accessible badge only; no media/Player load; saved state unchanged.`,
    );
    await ctx.close();
  }
  {
    const fixture = agendaFixture();
    const { ctx, page } = await context({ fixture, motion: "off" });
    await openCore(page, fixture);
    await page
      .getByRole("button", { name: "Place 1 doom", exact: true })
      .click();
    await acknowledgeUntil(page, "agenda");
    assert.equal((await save(page)).agenda, 2);
    assert.equal(await page.locator(".milestone-notice").count(), 0);
    await page.evaluate(() => {
      document.documentElement.dataset.motion = "full";
    });
    await page.waitForTimeout(100);
    assert.equal(
      await page.locator(".milestone-notice").count(),
      0,
      "turning on motion cannot replay an already observed transition",
    );
    checks.push(
      "Off preference emits no overlay; enabling after a transition does not replay it.",
    );
    await ctx.close();
  }
  {
    const fixture = agendaFixture();
    const { ctx, page } = await context({ fixture });
    await openCore(page, fixture);
    await page
      .getByRole("button", { name: "Place 1 doom", exact: true })
      .click();
    await acknowledgeUntil(page, "agenda");
    await assertNotice(page, "agenda", "Agenda 2", { video: true });
    await page.evaluate(() => {
      document.documentElement.dataset.motion = "subtle";
    });
    await assertNotice(page, "agenda", "Agenda 2", { quiet: true });
    await page.evaluate(() => {
      document.documentElement.dataset.motion = "off";
    });
    await page.waitForTimeout(40);
    assert.equal(await page.locator(".milestone-notice").count(), 0);
    checks.push(
      "Active motion preference changes immediately remove video/Player and Off cancels the notice.",
    );
    await ctx.close();
  }
  {
    const fixture = agendaFixture(true);
    const { ctx, page } = await context({
      fixture,
      errorSink: expectedImportErrors,
    });
    const failedImports = [];
    await page.route("**/*", async (route) => {
      if (
        /\/(?:ResolutionPlayer[^/]*\.(?:js|tsx)|milestone-remotion[^/]*\.js)(?:\?|$)/.test(
          new URL(route.request().url()).pathname,
        )
      ) {
        failedImports.push(route.request().url());
        await route.abort("failed");
      } else await route.continue();
    });
    await openCore(page, fixture);
    await page
      .getByRole("button", { name: "Place 1 doom", exact: true })
      .click();
    await acknowledgeUntil(page, "ending");
    const notice = page.locator('.milestone-notice[data-milestone="defeat"]');
    await notice.waitFor();
    await page.waitForTimeout(350);
    assert.ok(
      failedImports.length > 0,
      "genuine lazy decorative import failure was injected",
    );
    assert.equal(
      await notice.locator("strong").innerText(),
      "Investigation lost",
      "accessible authoritative title survives a failed ornament",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Return to the archive", exact: true })
        .isEnabled(),
      true,
    );
    assert.equal((await save(page)).campaign.result, "overrun");
    await shot(page, "core-failed-decorative-import");
    await noTimerMutation(page);
    if ((await save(page)).event)
      await page
        .getByRole("button", { name: "Continue game", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Return to the archive", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open campaign record", exact: true })
      .waitFor();
    checks.push(
      "Fault injection aborts the actual lazy ornament module: accessible ending title, saved result and enabled navigation survive within the local art error boundary.",
    );
    await ctx.close();
  }

  // A separate public-wire projection fixture. All bridge requests are mocked
  // GET/HEAD/OPTIONS; POST is rejected, recorded and must remain absent.
  const nativeId = "00000000-0000-4000-8000-000000000091",
    seat = "own-presentation-player";
  let wire = {
    playerId: seat,
    investigatorIds: [],
    multiplayerMode: "Solo",
    game: {
      id: nativeId,
      name: "Authored milestone wire fixture",
      scenarioSteps: 50,
      gameState: { tag: "IsActive" },
      inSetup: false,
      phase: "InvestigationPhase",
      mode: {
        That: { id: "c:barkham:022", name: "Barkham Horror", started: true },
      },
      acts: {
        "c:barkham:025": {
          id: "c:barkham:025",
          cardId: "physical-act-one",
          deckId: 1,
          sequence: [1, "A"],
          cardCode: "c:barkham:025",
        },
      },
      agendas: {
        "c:barkham:023": {
          id: "c:barkham:023",
          cardId: "physical-agenda-one",
          deckId: 1,
          sequence: { agendaSequenceStep: 1, agendaSequenceSide: "A" },
          cardCode: "c:barkham:023",
        },
      },
      question: {
        [seat]: {
          tag: "ChooseOne",
          choices: [{ tag: "Label", label: "Public fixture choice" }],
        },
      },
    },
  };
  {
    const { ctx, page } = await context();
    await page.route("**/chronicle/**", async (route) => {
      const method = route.request().method(),
        path = new URL(route.request().url()).pathname;
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        blockedWrites.push({ method, path });
        await route.fulfill({
          status: 409,
          json: { error: "Presentation fixture accepts no mutations." },
        });
        return;
      }
      let response = [];
      if (path.endsWith("/step")) response = { step: wire.game.scenarioSteps };
      else if (path.endsWith(nativeId)) response = wire;
      else if (path.endsWith("/status"))
        response = {
          ready: true,
          version: "GET-only presentation fixture",
          supportedCardCodes: [],
          limitations: [],
        };
      else if (path.endsWith("/presentation"))
        response = { strings: {}, scenarioSettings: {}, campaignSettings: {} };
      else if (path.endsWith("/options"))
        response = { investigators: [], scenarios: [], campaigns: [] };
      await route.fulfill({
        status: 200,
        json: response,
        headers: {
          "Access-Control-Allow-Origin": new URL(base).origin,
          "Access-Control-Allow-Credentials": "true",
        },
      });
    });
    await page.goto(`${base}/#investigation=${nativeId}`);
    await page
      .getByRole("button", { name: "Public fixture choice", exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".milestone-notice").count(),
      0,
      "native initial hydration silent",
    );
    const nativeInitialHash = digest(wire);
    wire = structuredClone(wire);
    wire.game.scenarioSteps++;
    wire.game.acts = {
      "c:barkham:026": {
        id: "c:barkham:026",
        cardId: "physical-act-two",
        deckId: 1,
        sequence: [2, "A"],
        cardCode: "c:barkham:026",
      },
    };
    await assertNotice(page, "act", "Act 2", { video: true });
    assert.equal(
      await page
        .getByRole("button", { name: "Public fixture choice", exact: true })
        .isEnabled(),
      true,
    );
    const advancedHash = digest(wire);
    await shot(page, "native-act-get-only");
    await page.waitForTimeout(5200);
    assert.equal(
      digest(wire),
      advancedHash,
      "media and polling cannot mutate the native fixture",
    );
    assert.equal(
      await page.evaluate(() => window.milestoneAdded.length),
      1,
      "identical native polling never replays a cue",
    );
    // A lower native step represents a restored/undo checkpoint; no new cue.
    wire.game.scenarioSteps--;
    wire.game.acts = {
      "c:barkham:025": {
        id: "c:barkham:025",
        cardId: "physical-act-one",
        deckId: 1,
        sequence: [1, "A"],
        cardCode: "c:barkham:025",
      },
    };
    await page.waitForTimeout(2900);
    assert.equal(await page.evaluate(() => window.milestoneAdded.length), 1);
    wire.game.scenarioSteps++;
    wire.game.acts = {
      "c:barkham:026": {
        id: "c:barkham:026",
        cardId: "physical-act-two",
        deckId: 1,
        sequence: [2, "A"],
        cardCode: "c:barkham:026",
      },
    };
    await page.waitForTimeout(2900);
    assert.equal(
      await page.evaluate(() => window.milestoneAdded.length),
      1,
      "replaying a previously observed act remains silent",
    );
    wire.game.scenarioSteps++;
    wire.game.gameState = { tag: "IsOver" };
    wire.game.question = {};
    await assertNotice(page, "ended", "Investigation ended");
    await shot(page, "native-ended-get-only");
    await page.waitForTimeout(2400);
    await page.reload();
    await page
      .getByText("The investigation is complete.", { exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".milestone-notice").count(),
      0,
      "native ended hydration silent",
    );
    assert.equal(
      blockedWrites.length,
      0,
      "no native mutation requests were attempted",
    );
    checks.push(
      `GET-only native wire projection: actual CompanionTable polling detects physical act advancement and neutral IsOver, keeps choice enabled, suppresses hydration/identical polls/undo/replay/reload; initial SHA ${nativeInitialHash}.`,
    );
    await ctx.close();
  }
  assert.deepEqual(errors, [], "no browser runtime or console errors");
  assert.ok(
    expectedImportErrors.every((message) =>
      /net::ERR_FAILED|Failed to fetch dynamically imported module/.test(
        message,
      ),
    ),
    "the fault-injection context records only its intentionally aborted import errors",
  );
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        passed: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        browser: "actual Playwright Chromium",
        base,
        scope:
          "fresh controlled Core UI/reducer presentation fixtures and GET-only authored native wire projection; not a complete native legal playthrough",
        checks,
        media,
        blockedWrites,
        errors,
        expectedImportErrors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Milestone browser checks passed: ${checks.length}; ${reportPath}`,
  );
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    await writeFile(
      `${out}/failure-dom.txt`,
      await lastPage.locator("body").innerText(),
    ).catch(() => {});
    await writeFile(
      `${out}/failure-media.json`,
      JSON.stringify(
        await lastPage
          .locator(".milestone-notice,.milestone-art-layer")
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              html: node.innerHTML,
              rect: node.getBoundingClientRect().toJSON(),
              styles: { opacity: getComputedStyle(node).opacity },
              svgs: [...node.querySelectorAll("svg")].map((svg) => ({
                rect: svg.getBoundingClientRect().toJSON(),
                opacity: getComputedStyle(svg).opacity,
              })),
            })),
          ),
        null,
        2,
      ),
    ).catch(() => {});
  }
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        passed: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        scope: "isolated presentation fixtures",
        checks,
        media,
        blockedWrites,
        errors,
        expectedImportErrors,
        failure: error.stack,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
