// Real Chronicle UI with isolated questions from the pinned native protocol.
// This bridge neither starts the native runtime nor opens a private saved game.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:5198";
const port = Number(process.env.QA_BRIDGE_PORT || 5197);
const out = resolve(process.env.QA_OUT || "output/campaign-continuation");
const seat = "campaign-continuation-qa-seat";
const ids = Array.from(
  { length: 6 },
  (_, n) => `00000000-0000-4000-8000-${String(n + 31).padStart(12, "0")}`,
);
const scenarioOptions = {
  scenarioOptionsStandalone: false,
  scenarioOptionsPerformTarotReading: true,
  scenarioOptionsLeadInvestigator: "01001",
};
// ContinueCampaign.vue locks the lead to campaign.meta.expeditionLeader at
// 04043 / 04054 / 53016 / 53017. The native Scenario.Runner consumes this answer.
const steps = [
  { tag: "ScenarioStepWithOptions", contents: ["c04043", scenarioOptions] },
  { tag: "CampaignSpecificStep", contents: ["embark", null] },
  { tag: "InterludeStep", contents: [2, null] },
  { tag: "ScenarioStep", contents: "c02062" },
  { tag: "ScenarioStep", contents: "c53017" },
  { tag: "ScenarioStepWithOptions", contents: ["c02062", scenarioOptions] },
];
const original = steps.map((nextStep, i) => ({
  playerId: seat,
  investigatorIds: ["01001", "01002"],
  multiplayerMode: "Solo",
  game: {
    id: ids[i],
    name: "Campaign continuation fixture",
    scenarioSteps: 101,
    phase: "CampaignPhase",
    activePlayerId: seat,
    investigators: {
      "01001": {
        id: "01001",
        cardCode: "01001",
        playerId: seat,
        xp: 5,
        name: { title: "Roland Banks" },
      },
      "01002": {
        id: "01002",
        cardCode: "01002",
        playerId: seat,
        xp: 5,
        name: { title: "Daisy Walker" },
      },
    },
    campaign: {
      id: i === 1 ? "09" : "04",
      name: "The Forgotten Age",
      meta: { expeditionLeader: "01002" },
      completedSteps:
        i === 5 ? [{ tag: "ScenarioStep", contents: "c02001" }] : [],
      step: {
        tag: "ContinueCampaignStep",
        contents: {
          nextStep,
          canUpgradeDecks: i === 5,
          canChooseSideStory: false,
          ...(i === 5 ? { chooseSideStory: false, lead: "01002" } : {}),
        },
      },
    },
    question: { [seat]: { tag: "ContinueCampaign" } },
  },
}));
let snapshots = structuredClone(original);
const answers = [],
  upgrades = [],
  errors = [],
  checks = [];
let upgradedInvestigators = new Set();
let rejectNext = false;
const options = JSON.parse(
  await readFile("scripts/data/native-play-options.json", "utf8"),
);
await mkdir(out, { recursive: true });
await writeFile(
  resolve(out, "report.json"),
  JSON.stringify({ passed: false, startedAt: new Date().toISOString() }),
);
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", new URL(base).origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  const send = (status, value) => {
    res.writeHead(status);
    res.end(JSON.stringify(value));
  };
  if (req.method === "OPTIONS") {
    send(204, null);
    return;
  }
  const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
  const index = ids.findIndex((id) => path.includes(id));
  if (req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (index === 5 && path.endsWith("/upgrade-deck")) {
      const request = JSON.parse(Buffer.concat(chunks).toString());
      const game = snapshots[index].game;
      if (
        game.campaign.step.tag !== "UpgradeDeckStep" ||
        !game.investigators[request.investigatorId] ||
        upgradedInvestigators.has(request.investigatorId)
      ) {
        send(409, { error: "This investigator is not waiting to upgrade." });
        return;
      }
      upgrades.push(request);
      upgradedInvestigators.add(request.investigatorId);
      game.scenarioSteps++;
      if (upgradedInvestigators.size === 2) {
        // Fixture equivalent of FinishedUpgradingDecks: return to the exact
        // serialized continuation, with native CampaignStep decoder defaults.
        const continuation = game.campaign.step.contents;
        game.campaign.step = {
          ...continuation,
          contents: {
            chooseSideStory: false,
            lead: null,
            canChooseSideStory: true,
            ...continuation.contents,
          },
        };
        game.question[seat] = { tag: "ContinueCampaign" };
      }
      send(200, {});
      return;
    }
    if (index < 0 || !path.endsWith("/answer")) {
      send(404, {});
      return;
    }
    const answer = JSON.parse(Buffer.concat(chunks).toString());
    answers.push({ gameId: ids[index], answer });
    if (rejectNext) {
      rejectNext = false;
      send(409, { error: "The campaign changed. Choose again." });
      return;
    }
    snapshots[index].game.scenarioSteps++;
    if (index === 5 && answer.contents?.tag === "UpgradeDeckStep") {
      snapshots[index].game.campaign.step = structuredClone(answer.contents);
      snapshots[index].game.question[seat] = { tag: "ChooseUpgradeDeck" };
      send(200, {});
      return;
    }
    snapshots[index].game.question[seat] = {
      tag: "ChooseOne",
      choices: [
        { tag: "Label", label: "Continuation received by the fixture" },
      ],
    };
    send(200, {});
    return;
  }
  if (path.endsWith("/step"))
    send(200, { step: snapshots[index]?.game.scenarioSteps || 0 });
  else if (index >= 0) send(200, snapshots[index]);
  else if (path.endsWith("/options")) send(200, options);
  else if (path.endsWith("/presentation"))
    send(200, {
      strings: {},
      scenarioSettings: {},
      campaignSettings: {},
      sideStories: [{ id: "81001", name: "Curse of the Rougarou", xp: 1 }],
    });
  else if (path.endsWith("/status"))
    send(200, {
      ready: true,
      version: "isolated campaign fixture",
      supportedCardCodes: [],
      limitations: [],
    });
  else send(200, []);
});
await new Promise((ok, fail) => {
  server.once("error", fail);
  server.listen(port, "127.0.0.1", ok);
});
const browsers = [];
try {
  const engines =
    process.env.QA_BROWSERS === "chromium"
      ? [["chromium", chromium]]
      : [
          ["chromium", chromium],
          ["webkit", webkit],
        ];
  for (const [engine, type] of engines) {
    snapshots = structuredClone(original);
    upgradedInvestigators = new Set();
    const browser = await type.launch({ headless: true });
    browsers.push(browser);
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    page.on("pageerror", (error) => errors.push(`${engine}: ${error.message}`));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().includes("409 (Conflict)")
      )
        errors.push(`${engine}: ${message.text()} (${message.location().url})`);
    });
    const panel = page.locator(".companion-checkpoint");
    const open = async (index) => {
      await page.goto("about:blank");
      await page.goto(`${base}/#investigation=${ids[index]}`);
      await panel
        .getByRole("heading", { name: "Continue the campaign", exact: true })
        .waitFor();
    };
    const received = () =>
      panel
        .getByRole("button", {
          name: "Continuation received by the fixture",
          exact: true,
        })
        .waitFor();

    await open(0);
    const beforeForced = answers.length;
    const lead = panel.getByRole("combobox", {
      name: "Lead investigator",
      exact: true,
    });
    // A forced lead may be shown as locked text or a disabled selector.
    if (await lead.count()) {
      assert.equal(await lead.inputValue(), "01002");
      if (!(await lead.isDisabled())) {
        const otherLeads = lead.locator(
          'option[value]:not([value=""]):not([value="01002"])',
        );
        for (const option of await otherLeads.all())
          assert.equal(
            await option.getAttribute("disabled"),
            "",
            "every alternative to the expedition leader is disabled",
          );
      }
    }
    assert.match(await panel.innerText(), /Daisy Walker/);
    assert.equal(
      answers.length,
      beforeForced,
      "opening a forced lead never answers automatically",
    );
    await page.screenshot({
      path: resolve(out, `${engine}-expedition-leader.png`),
      fullPage: true,
    });
    await page.reload();
    const continueButton = panel.getByRole("button", {
      name: "Continue",
      exact: true,
    });
    await continueButton.focus();
    await page.keyboard.press("Enter");
    await received();
    assert.deepEqual(answers.at(-1).answer, {
      tag: "CampaignStepAnswer",
      contents: {
        tag: "ScenarioStepWithOptions",
        contents: [
          "c04043",
          {
            ...scenarioOptions,
            scenarioOptionsLeadInvestigator: "01002",
          },
        ],
      },
    });
    await page.reload();
    await received();
    checks.push(
      `${engine}: mandatory expedition leader, explicit keyboard continuation, options preserved, pending/answered reload`,
    );

    for (const index of [1, 2]) {
      await open(index);
      assert.equal(
        await lead.count(),
        0,
        "non-scenario steps have no lead selector",
      );
      await page.setViewportSize({ width: 320, height: 900 });
      await page.screenshot({
        path: resolve(
          out,
          `${engine}-${index === 1 ? "campaign-specific" : "interlude"}-mobile.png`,
        ),
        fullPage: true,
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await continueButton.click();
      await received();
      assert.deepEqual(answers.at(-1).answer, {
        tag: "CampaignStepAnswer",
        contents: steps[index],
      });
      checks.push(
        `${engine}: ${steps[index].tag} needs no lead, native tuple preserved, 320px`,
      );
    }

    await page.setViewportSize({ width: 1440, height: 1050 });
    await open(3);
    await lead.selectOption("01002");
    rejectNext = true;
    await continueButton.click();
    await page
      .getByRole("alert")
      .filter({ hasText: "The campaign changed" })
      .first()
      .waitFor();
    assert.equal(
      await lead.inputValue(),
      "01002",
      "rejected continuation retains chosen lead",
    );
    const beforeRetry = answers.length;
    await continueButton.click({ clickCount: 2 });
    await received();
    assert.equal(
      answers.length,
      beforeRetry + 1,
      "double click submits one accepted retry",
    );
    assert.equal(
      answers.at(-1).answer.contents.contents[1]
        .scenarioOptionsLeadInvestigator,
      "01002",
    );
    checks.push(
      `${engine}: ordinary scenario keeps explicit lead selection, rejected-answer retry, duplicate-click guard`,
    );

    await open(4);
    await continueButton.click();
    await received();
    assert.equal(answers.at(-1).answer.contents.contents[0], "c53017");
    assert.equal(
      answers.at(-1).answer.contents.contents[1]
        .scenarioOptionsLeadInvestigator,
      "01002",
    );
    checks.push(
      `${engine}: Return to The Forgotten Age keeps mandatory expedition leader`,
    );

    await open(5);
    assert.equal(
      await panel.getByRole("group", { name: "Add a side story" }).count(),
      0,
    );
    await panel
      .getByRole("button", { name: "Upgrade decks first", exact: true })
      .click();
    await panel
      .getByRole("button", {
        name: "Keep this investigator’s current deck",
        exact: true,
      })
      .waitFor();
    assert.deepEqual(answers.at(-1).answer, {
      tag: "CampaignStepAnswer",
      contents: {
        tag: "UpgradeDeckStep",
        contents: original[5].game.campaign.step,
      },
    });
    await page.reload();
    const keepDeck = panel.getByRole("button", {
      name: "Keep this investigator’s current deck",
      exact: true,
    });
    await keepDeck.waitFor();
    const upgradesBefore = upgrades.length;
    for (const investigator of ["01001", "01002"]) {
      await panel
        .getByRole("combobox", { name: "Investigator", exact: true })
        .selectOption(investigator);
      await keepDeck.click();
      if (investigator === "01001")
        await page.waitForFunction(
          () =>
            document.querySelector(".companion-decision select")?.value === "",
        );
      else
        await panel
          .getByRole("heading", { name: "Continue the campaign", exact: true })
          .waitFor();
    }
    assert.deepEqual(upgrades.slice(upgradesBefore), [
      { investigatorId: "01001" },
      { investigatorId: "01002" },
    ]);
    await panel
      .getByRole("heading", { name: "Continue the campaign", exact: true })
      .waitFor();
    assert.deepEqual(
      snapshots[5].game.campaign.step,
      original[5].game.campaign.step,
    );
    assert.equal(
      await panel.getByRole("group", { name: "Add a side story" }).count(),
      0,
    );
    await page.reload();
    await continueButton.waitFor();
    assert.equal(
      await panel.getByRole("group", { name: "Add a side story" }).count(),
      0,
    );
    assert.equal(
      await lead.inputValue(),
      "01001",
      "existing scenario lead survives deck upgrades",
    );
    await continueButton.click();
    await received();
    assert.deepEqual(answers.at(-1).answer, {
      tag: "CampaignStepAnswer",
      contents: steps[5],
    });
    checks.push(
      `${engine}: deck upgrades preserve restricted side stories, lead and scenario options through both investigators and reloads`,
    );
    await browser.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        passed: true,
        checks,
        answers,
        upgrades,
        errors,
        evidence:
          "Pinned native-shaped protocol fixtures through Chronicle UI; no native campaign playthrough or private-save mutation.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks, errors }));
} catch (error) {
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        passed: false,
        checks,
        answers,
        upgrades,
        errors,
        failure: error.message,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
  server.closeAllConnections();
  await new Promise((ok) => server.close(ok));
}
