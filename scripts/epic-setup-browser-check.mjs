#!/usr/bin/env node
/** Fresh, real Chromium setup/Ready proof for --prepare-client-setup.
 * Every mutation originates in the built Chronicle UI. Interception only
 * verifies bindings and blocks unexpected requests; it never supplies replies.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { tsImport } from "tsx/esm/api";
import {
  acceptanceManifest,
  nativeQaKind,
} from "./rules-qa-runtime-identity.mjs";
import {
  installEpicArtworkCapture,
  replaceEpicArtworkIndexes,
  verifyEpicArtwork,
} from "./epic-browser-artwork.mjs";

if (process.argv.includes("--help")) {
  console.log(
    "EPIC_QA_CONFIRMED=1 node scripts/epic-setup-browser-check.mjs\nRequires EPIC_SETUP_SEED from epic-runtime-check.mjs --prepare-client-setup and ARKHAM_RULES_QA_MANIFEST for the actual Linux aggregate. Defaults: RULES_URL=http://127.0.0.1:5494, BASE_URL=http://127.0.0.1:5498, EPIC_SETUP_SEED=output/epic-client-setup-seed/report.json, QA_OUT=output/epic-browser-setup. Completes six untouched native setup paths through the built UI, verifies six automatic seat-bound Ready posts and both native shared timers, then performs six genuine UI resource actions and reloads. No event creation, native seeding, direct writes, or response mocks.",
  );
  process.exit(0);
}
assert.equal(
  process.env.EPIC_QA_CONFIRMED,
  "1",
  "Confirm the actual candidate/API/UI and untouched seed before live QA.",
);
assert.ok(
  process.env.ARKHAM_RULES_QA_MANIFEST,
  "The verified Linux native aggregate manifest is required.",
);
const service = new URL(
    process.env.RULES_URL ||
      process.env.ARKHAM_RULES_URL ||
      "http://127.0.0.1:5494",
  ),
  base = new URL(process.env.BASE_URL || "http://127.0.0.1:5498"),
  seedPath = resolve(
    process.env.EPIC_SETUP_SEED || "output/epic-client-setup-seed/report.json",
  ),
  manifestPath = resolve(process.env.ARKHAM_RULES_QA_MANIFEST),
  output = resolve(process.env.QA_OUT || "output/epic-browser-setup");
for (const url of [service, base]) {
  assert.ok(
    ["127.0.0.1", "localhost"].includes(url.hostname),
    "Acceptance is confined to loopback.",
  );
  assert.equal(url.protocol, "http:");
  assert.equal(url.username + url.password + url.search + url.hash, "");
  assert.equal(url.pathname, "/");
}
assert.notEqual(base.origin, service.origin);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex"),
  digest = (value) => sha(JSON.stringify(value)),
  uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  values = (value) =>
    Array.isArray(value)
      ? value.map((v) => (Array.isArray(v) ? v[1] : v))
      : Object.values(value || {}),
  pairs = (value) =>
    Array.isArray(value) ? value : Object.entries(value || {}),
  scenario = (snapshot) =>
    snapshot.game.scenario ||
    snapshot.game.mode?.That ||
    snapshot.game.mode?.These?.[1],
  setupComplete = (snapshot) =>
    snapshot.game.gameState?.tag === "IsActive" &&
    scenario(snapshot)?.started === true &&
    snapshot.game.phase === "InvestigationPhase" &&
    snapshot.game.inSetup === false,
  resourceCount = (investigator) =>
    Number(
      pairs(investigator.tokens).find(
        ([key]) => (typeof key === "string" ? key : key?.tag) === "Resource",
      )?.[1] || 0,
    ),
  redact = (message) =>
    String(message)
      .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
      .replace(
        /("(?:token|access_token|refresh_token|password)"\s*:\s*")[^"]+/gi,
        "$1[redacted]",
      ),
  pause = () => new Promise((done) => setTimeout(done, 100));
const proof = {
  startedAt: new Date().toISOString(),
  passed: false,
  mode: "fresh native setup through built Chromium UI; six isolated seats; actual automatic Ready and native answers",
  scope: "native-acceptance",
  platform: "linux",
  capabilityCertified: false,
  service: service.origin,
  ui: base.origin,
  seedPath,
  responseMocks: 0,
  directMutations: 0,
  createdEvents: 0,
  nativeStateSeeds: 0,
  seedSnapshots: [],
  events: [],
  setupAnswers: [],
  readyChecks: [],
  checks: [],
  clientAssets: [],
  writes: [],
  readinessReads: [],
  blockedRequests: [],
  resourceFailures: [],
  toleratedArtwork: [],
  errors: [],
};
await mkdir(output, { recursive: true });
const checkpoint = () =>
  writeFile(
    resolve(output, "report.json"),
    JSON.stringify(proof, null, 2) + "\n",
  );
await checkpoint();
async function get(path) {
  const response = await fetch(new URL(path, service), {
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `Live diagnostic GET ${path}`);
  return response.json();
}
async function readReady(seat, diagnostic = true) {
  const path = `/chronicle/play/games/${seat.gameId}/ready?seat=${seat.id}`,
    status = await get(path);
  validateReady(status, seat);
  proof.readinessReads.push({
    at: new Date().toISOString(),
    diagnostic,
    gameId: seat.gameId,
    seatId: seat.id,
    path,
    ...status,
  });
  return status;
}
function validateReady(status, seat) {
  assert.equal(
    status.eventId,
    seat.eventId,
    "Readiness comes from the persisted seat's own event.",
  );
  assert.equal(status.requiredMask, 7);
  assert.ok(
    Number.isSafeInteger(status.readyMask) &&
      status.readyMask >= 0 &&
      status.readyMask <= 7,
  );
  assert.ok(
    Number.isSafeInteger(status.timerStartedAt) && status.timerStartedAt >= 0,
  );
  assert.equal(
    status.groupReady,
    (status.readyMask & (1 << seat.ordinal)) !== 0,
  );
  assert.equal(
    status.ready,
    status.readyMask === 7 && status.timerStartedAt > 0,
  );
  if (status.readyMask !== 7)
    assert.equal(
      status.timerStartedAt,
      0,
      "Shared timer waits for all three actual Ready marks.",
    );
}
let protocol,
  context,
  browser,
  stopReason,
  artworkExpectedNames,
  artworkDefinitions,
  allSeats = [];
const activeTables = new Set(),
  artworkErrorIndexes = new Set(),
  artworkFailureIndexes = new Set(),
  artworkWitnessErrorIndexes = new Set(),
  artworkWitnessFailureIndexes = new Set();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    stopReason = `Live acceptance interrupted by ${signal}.`;
    proof.passed = false;
    proof.interrupted = { signal, at: new Date().toISOString() };
    process.exitCode = 1;
    void checkpoint()
      .then(() => browser?.close())
      .catch(() => {});
  });
const checkRunning = () => {
  if (stopReason) throw new Error(stopReason);
};
const nativeModel = (snapshot) =>
  protocol.companionQuestion(
    {
      ...snapshot.game,
      scenario: scenario(snapshot),
      campaign:
        snapshot.game.campaign ??
        snapshot.game.mode?.This ??
        snapshot.game.mode?.These?.[0],
    },
    snapshot.playerId,
    context,
  );
async function readSeat(seat) {
  const [snapshot, cursor] = await Promise.all([
    get(`/chronicle/play/games/${seat.gameId}?seat=${seat.id}`),
    get(`/chronicle/play/games/${seat.gameId}/step?seat=${seat.id}`),
  ]);
  assert.equal(
    snapshot.playerId,
    seat.baseline.playerId,
    "Snapshot belongs to this seat's actual native player.",
  );
  assert.ok(Number.isSafeInteger(cursor.step) && cursor.step >= 0);
  const investigators = values(snapshot.game.investigators),
    model = nativeModel(snapshot);
  assert.ok(
    investigators.length <= 1,
    "Each fresh group has one real Roland investigator after deck selection.",
  );
  for (const investigator of investigators) {
    assert.equal(investigator.playerId, snapshot.playerId);
    assert.equal(
      String(investigator.id).replace(/^c/, ""),
      "01001",
      "The actual saved Roland deck supplied this investigator.",
    );
  }
  return {
    snapshot,
    model,
    state: {
      gameId: seat.gameId,
      seatId: seat.id,
      playerId: snapshot.playerId,
      gameState: snapshot.game.gameState,
      phase: snapshot.game.phase,
      inSetup: snapshot.game.inSetup,
      scenarioStarted: scenario(snapshot)?.started,
      scenarioSteps: snapshot.game.scenarioSteps,
      step: cursor.step,
      decisionTag: model?.tag || null,
      questionSha256: digest(snapshot.game.question),
      gameSha256: digest(snapshot.game),
      investigators: investigators.map((investigator) => ({
        id: investigator.id,
        resources: resourceCount(investigator),
        remainingActions: investigator.remainingActions,
      })),
    },
  };
}
const readAll = async () =>
    new Map(
      await Promise.all(
        allSeats.map(async (seat) => [seat.id, await readSeat(seat)]),
      ),
    ),
  unchanged = (before, after, excludedSeat) => {
    for (const seat of allSeats)
      if (seat.id !== excludedSeat)
        assert.deepEqual(
          after.get(seat.id).state,
          before.get(seat.id).state,
          `Only the answering seat may change: ${seat.gameId}`,
        );
  },
  projection = (page) =>
    page.evaluate(() =>
      typeof window.render_game_to_text === "function"
        ? JSON.parse(window.render_game_to_text())
        : null,
    );
async function renderedQuestion(table, current, enabled = true) {
  assert.ok(current.model, "The actual native seat has a pending question.");
  await table.page.waitForFunction(
    ({ tag, options, phase, investigators }) => {
      if (typeof window.render_game_to_text !== "function") return false;
      const rendered = JSON.parse(window.render_game_to_text()),
        decision = rendered.decision;
      return (
        decision?.tag === tag &&
        JSON.stringify(decision.options) === JSON.stringify(options) &&
        rendered.phase === phase &&
        JSON.stringify(
          rendered.investigators.map(({ resources, actions }) => ({
            resources,
            actions,
          })),
        ) === JSON.stringify(investigators)
      );
    },
    {
      tag: current.model.tag,
      options: current.model.choices.map((choice) => ({
        index: choice.answerIndex,
        text: choice.label,
        disabled: choice.disabled,
      })),
      phase: current.state.phase,
      investigators: current.state.investigators.map((investigator) => ({
        resources: investigator.resources,
        actions: Number(investigator.remainingActions || 0),
      })),
    },
  );
  const decision = table.page.locator(".companion-decision");
  await decision.waitFor();
  if (enabled)
    await table.page
      .locator(".companion-decision[aria-busy='false']")
      .waitFor();
  assert.equal(
    await table.page.locator(".companion-error").count(),
    0,
    "The actual UI reports no native/protocol errors.",
  );
  assert.equal(
    await table.page.locator("iframe").count(),
    0,
    "Chronicle renders its actual table.",
  );
  return projection(table.page);
}
async function verifyArtwork() {
  for (const table of activeTables) {
    if (table.documentId === 0) continue;
    const indexScope = {
      errors: proof.errors,
      resourceFailures: proof.resourceFailures,
      gameId: table.seat.gameId,
      engine: "chromium",
      documentId: table.documentId,
      classifiedErrors: artworkErrorIndexes,
      classifiedFailures: artworkFailureIndexes,
    };
    replaceEpicArtworkIndexes(indexScope);
    const current = await readSeat(table.seat),
      result = await verifyEpicArtwork(table.page, {
        ...indexScope,
        expectedNames: artworkExpectedNames,
        nativeSnapshot: current.snapshot,
        cardDefinitions: artworkDefinitions,
      });
    const newErrors = result.classifiedErrorIndexes.filter(
        (index) => !artworkWitnessErrorIndexes.has(index),
      ),
      newFailures = result.classifiedFailureIndexes.filter(
        (index) => !artworkWitnessFailureIndexes.has(index),
      );
    replaceEpicArtworkIndexes({ ...indexScope, result });
    if (newErrors.length || newFailures.length) {
      for (const index of newErrors) artworkWitnessErrorIndexes.add(index);
      for (const index of newFailures) artworkWitnessFailureIndexes.add(index);
      proof.toleratedArtwork.push({
        engine: "chromium",
        gameId: table.seat.gameId,
        seatId: table.seat.id,
        ...result,
        classifiedErrorIndexes: newErrors,
        classifiedFailureIndexes: newFailures,
      });
    }
  }
}
function assertLiveErrors() {
  assert.deepEqual(
    proof.blockedRequests,
    [],
    "No unrelated write or misbound read was attempted.",
  );
  assert.deepEqual(
    proof.errors.filter((_, index) => !artworkErrorIndexes.has(index)),
    [],
    "No actual page, console or network guard error remains outside verified same-document card artwork fallback.",
  );
  assert.deepEqual(
    proof.resourceFailures.filter(
      (_, index) => !artworkFailureIndexes.has(index),
    ),
    [],
    "Every actual resource/request failure is fatal unless its exact external card-image 503 has verified same-document artwork fallback.",
  );
}
async function drain(table) {
  const tasks = () => [...activeTables].flatMap((live) => [...live.tasks]);
  while (tasks().length) await Promise.all(tasks());
  await verifyArtwork();
  assertLiveErrors();
}

// Documented startAt confirmations and setup story source acknowledgements.
// No general 'first enabled choice' fallback is allowed.
const printedLocations = {
    70001: [["70016", "70017", "70018"], ["70019", "70020"], ["70022"]],
    87001: [["87005b"], ["87005b"], ["87005b"]],
  },
  printedSetupStories = { 87001: [["87006"], ["87015"], ["87024"]] };
function referencedCode(choice, snapshot) {
  if (choice.cardCode) return protocol.companionCatalogCode(choice.cardCode);
  const target = choice.raw?.target || choice.source,
    id = target?.contents;
  if (typeof id !== "string") return undefined;
  const fields = {
    LocationTarget: "locations",
    StoryTarget: "stories",
    AssetTarget: "assets",
    CardTarget: "cards",
  };
  const entity = values(snapshot.game[fields[target.tag]]).find(
    (value) => value.id === id,
  );
  return entity
    ? protocol.companionCatalogCode(
        String(entity.cardCode || entity.card?.cardCode || entity.art || ""),
      )
    : undefined;
}
function setupChoice(table, current) {
  const { model, snapshot } = current,
    available = model.choices.filter((choice) => !choice.disabled),
    mulligan = available.find((choice) =>
      /doneWithMulligan|done with mulligan/i.test(JSON.stringify(choice.raw)),
    );
  if (model.tag === "ChooseOne" && mulligan)
    return {
      choice: mulligan,
      reason: "Keep the actual initial hand; finish native mulligan.",
    };
  const waiting = available.find((choice) => {
    const raw = JSON.stringify(choice.raw);
    return (
      /"ScenarioSpecific"/.test(raw) &&
      /epic(?:Labyrinth|Machinations)\.wait"/.test(raw)
    );
  });
  if (model.tag === "ChooseOne" && waiting)
    return {
      choice: waiting,
      sharedSetupWait: true,
      reason: "Read the documented shared setup progress checkpoint.",
    };
  if (model.tag === "Read") {
    const continuation = available.filter((choice) =>
      /^(Continue|Begin|Proceed|Finish|Done)\b/i.test(choice.label),
    );
    assert.equal(
      continuation.length,
      1,
      "Printed setup text has one unambiguous acknowledgement.",
    );
    return {
      choice: continuation[0],
      reason: "Acknowledge printed native scenario/setup instructions.",
    };
  }
  if (model.tag === "WindowChooseOne") {
    const skip = available.find(
      (choice) => choice.tag === "SkipTriggersButton",
    );
    assert.ok(skip, "Only declining optional setup abilities is permitted.");
    return { choice: skip, reason: "Decline optional native setup abilities." };
  }
  if (model.tag === "ChooseOne" && !setupComplete(snapshot)) {
    const printed = available.filter((choice) => {
      if (!["TargetLabel", "CardLabel", "ComponentLabel"].includes(choice.tag))
        return false;
      const code = referencedCode(choice, snapshot);
      return [
        ...(printedLocations[table.event.scenarioId]?.[table.seat.ordinal] ||
          []),
        ...(printedSetupStories[table.event.scenarioId]?.[table.seat.ordinal] ||
          []),
      ].includes(code);
    });
    assert.equal(
      printed.length,
      1,
      `One documented setup location/story is required: ${available.map((v) => v.label).join(" | ")}`,
    );
    return {
      choice: printed[0],
      reason:
        "Confirm the printed native starting location or setup story source.",
    };
  }
  throw new Error(
    `No documented setup UI action for ${model.tag}: ${available.map((v) => v.label).join(" | ")}`,
  );
}
async function setupPeerProgress(table) {
  const peers = await Promise.all(
    table.event.seats.filter((seat) => seat.id !== table.seat.id).map(readSeat),
  );
  return digest(
    peers.map(({ snapshot, state }) => ({
      gameId: state.gameId,
      gameState: state.gameState,
      phase: state.phase,
      inSetup: state.inSetup,
      scenarioStarted: state.scenarioStarted,
      questionSha256: state.questionSha256,
      investigators: values(snapshot.game.investigators).map(
        (investigator) => investigator.id,
      ),
      // Native waiting answers may advance only a cursor; that is not progress
      // by another group's printed setup path.
    })),
  );
}
async function uiAnswer(table, current, reply, click, category, selected) {
  await drain(table);
  await renderedQuestion(table, current);
  assert.equal(table.allowance, null);
  table.allowance = {
    reply,
    questionSha256: current.state.questionSha256,
    decisionTag: current.model.tag,
    category,
    ...(selected
      ? {
          choiceTag: selected.choice.tag,
          label: selected.choice.label,
          reason: selected.reason,
        }
      : {}),
  };
  const [response] = await Promise.all([
    table.page.waitForResponse((reply) => {
      const url = new URL(reply.url());
      return (
        reply.request().method() === "POST" &&
        url.origin === service.origin &&
        url.pathname === `/chronicle/play/games/${table.seat.gameId}/answer` &&
        url.searchParams.get("seat") === table.seat.id
      );
    }),
    click(),
  ]);
  assert.equal(
    response.status(),
    200,
    "Actual built-client native answer succeeds.",
  );
  assert.equal(
    table.allowance,
    null,
    "Exactly one real UI answer consumed its allowance.",
  );
  await drain(table);
  if (category !== "resource")
    proof.setupAnswers.push({
      eventId: table.event.id,
      gameId: table.seat.gameId,
      seatId: table.seat.id,
      category,
      decisionTag: current.model.tag,
      answerTag: reply.tag,
      questionVersion: current.model.questionVersion,
      ...(selected
        ? {
            index: selected.choice.answerIndex,
            label: selected.choice.label,
            reason: selected.reason,
          }
        : { deckId: table.seat.deckId }),
    });
  await checkpoint();
}
async function clickChoice(table, current, selected, category) {
  const position = current.model.choices.findIndex(
    (choice) => choice.answerIndex === selected.choice.answerIndex,
  );
  assert.ok(position >= 0);
  const rows = table.page.locator(".companion-decision .companion-choice"),
    button = rows.nth(position).getByRole("button").first();
  assert.equal(
    await rows.count(),
    current.model.choices.length,
    "Visible native choices preserve their exact indices.",
  );
  await uiAnswer(
    table,
    current,
    protocol.buildChoiceAnswer(current.model, selected.choice.answerIndex),
    async () => {
      assert.equal(await button.isEnabled(), true);
      await button.click();
    },
    category,
    selected,
  );
}
async function driveSetup(table) {
  for (let iteration = 0; iteration < 100; iteration++) {
    checkRunning();
    await drain(table);
    const current = await readSeat(table.seat);
    if (setupComplete(current.snapshot)) {
      const deadline = Date.now() + 30000;
      while (table.readyPost?.status !== 200 && Date.now() < deadline) {
        checkRunning();
        await pause();
      }
      assert.equal(
        table.readyPost?.status,
        200,
        "The real client automatically marked this actual setup-complete seat Ready.",
      );
      await drain(table);
      const ready = await readReady(table.seat);
      assert.equal(ready.groupReady, true);
      if (!ready.ready) {
        const panel = table.page.locator(
          '[aria-label="Epic setup readiness"][role="status"]',
        );
        await panel
          .filter({ hasText: /Waiting for all three groups to finish setup\./ })
          .waitFor();
        const text = await panel.innerText();
        assert.match(text, /Waiting for all three groups to finish setup\./);
        const rendered = await renderedQuestion(table, current, false);
        for (const button of await table.page
          .locator(".companion-decision .companion-choice > button:first-child")
          .all())
          assert.equal(
            await button.isDisabled(),
            true,
            "Native optional choices stay disabled before the shared timer starts.",
          );
        const after = await readSeat(table.seat);
        assert.equal(
          after.state.questionSha256,
          current.state.questionSha256,
          "Waiting UI preserves the actual native pending question.",
        );
        const filename = `chromium-${table.event.scenarioId}-group-${table.seat.ordinal}-waiting.png`;
        await table.page.screenshot({
          path: resolve(output, filename),
          fullPage: true,
        });
        proof.readyChecks.push({
          eventId: table.event.id,
          gameId: table.seat.gameId,
          seatId: table.seat.id,
          kind: "actual waiting UI",
          status: ready,
          native: current.state,
          projection: rendered,
          nativeQuestionPreserved: true,
          optionalControlsDisabled: true,
          screenshot: filename,
        });
      }
      return current;
    }
    assert.ok(
      current.model,
      "Untouched native setup must retain its real pending question.",
    );
    assert.notEqual(
      current.model.tag,
      "PlayerWindowChooseOne",
      "Setup cannot reach playable actions before the Ready checkpoint.",
    );
    await renderedQuestion(table, current);
    if (current.model.kind === "deck") {
      assert.equal(current.model.tag, "ChooseDeck");
      const selector = table.page.getByRole("combobox", {
        name: "Saved deck",
        exact: true,
      });
      await selector
        .locator(`option[value="${table.seat.deckId}"]`)
        .waitFor({ state: "attached" });
      await selector.selectOption(table.seat.deckId);
      await uiAnswer(
        table,
        current,
        protocol.buildDeckAnswer(current.model, table.seat.deckId),
        () =>
          table.page
            .getByRole("button", { name: "Use saved deck", exact: true })
            .click(),
        "saved deck",
      );
    } else if (current.model.tag === "PickScenarioSettings") {
      const settings = protocol.standaloneSettingsForAnswer(
        current.model.settings,
        protocol.standaloneSettingsState(current.model.settings),
      );
      await uiAnswer(
        table,
        current,
        protocol.buildSettingsAnswer(current.model, settings),
        () =>
          table.page
            .getByRole("button", {
              name: "Begin with these settings",
              exact: true,
            })
            .click(),
        "printed scenario defaults",
      );
    } else {
      const selected = setupChoice(table, current);
      let peerProgress;
      if (selected.sharedSetupWait) {
        peerProgress = await setupPeerProgress(table);
        if (table.waitingPeerProgress === peerProgress) return null;
      }
      await clickChoice(table, current, selected, "native setup");
      // Present/Future may need the other untouched group to finish its own
      // setup before this checkpoint can proceed. Visit that browser next.
      if (selected.sharedSetupWait) {
        table.waitingPeerProgress = peerProgress;
        return null;
      }
    }
  }
  throw new Error(
    `Native setup did not reach automatic Ready for ${table.seat.gameId}.`,
  );
}
async function playable(table) {
  await table.page
    .locator('[aria-label="Epic setup readiness"]')
    .waitFor({ state: "hidden" });
  for (let attempt = 0; attempt < 30; attempt++) {
    const current = await readSeat(table.seat);
    assert.equal(setupComplete(current.snapshot), true);
    const ready = await readReady(table.seat);
    assert.equal(ready.ready, true);
    await renderedQuestion(table, current);
    if (current.model.tag === "PlayerWindowChooseOne") return current;
    assert.equal(
      current.model.tag,
      "WindowChooseOne",
      "After shared readiness, only the preserved initial optional window may be declined.",
    );
    const choice = current.model.choices.find(
      (choice) => choice.tag === "SkipTriggersButton" && !choice.disabled,
    );
    assert.ok(choice);
    await clickChoice(
      table,
      current,
      {
        choice,
        reason:
          "Decline the preserved initial optional window after all three groups are ready.",
      },
      "initial optional window",
    );
  }
  throw new Error(
    `Native first PlayerWindow did not appear for ${table.seat.gameId}.`,
  );
}

async function installGuard(table) {
  const { page, seat, event } = table;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) table.documentId++;
  });
  page.on("request", (request) =>
    table.requestDocuments.set(request, table.documentId),
  );
  await installEpicArtworkCapture(page);
  page.on("pageerror", (error) =>
    proof.errors.push({
      gameId: seat.gameId,
      engine: "chromium",
      documentId: table.documentId,
      kind: "pageerror",
      message: redact(error.message),
    }),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      proof.errors.push({
        gameId: seat.gameId,
        engine: "chromium",
        documentId: table.documentId,
        kind: "console",
        message: redact(message.text()),
        location: {
          ...message.location(),
          url: redact(message.location().url),
        },
      });
  });
  page.on("requestfailed", (request) =>
    proof.resourceFailures.push({
      engine: "chromium",
      gameId: seat.gameId,
      seatId: seat.id,
      documentId: table.requestDocuments.get(request) ?? table.documentId,
      url: redact(request.url()),
      resourceType: request.resourceType(),
      failure: redact(request.failure()?.errorText || "Unknown network error"),
    }),
  );
  const tracked = new Map();
  page.on("response", (response) => {
    if (response.status() >= 400)
      proof.resourceFailures.push({
        engine: "chromium",
        gameId: seat.gameId,
        seatId: seat.id,
        documentId:
          table.requestDocuments.get(response.request()) ?? table.documentId,
        url: redact(response.url()),
        status: response.status(),
        resourceType: response.request().resourceType(),
      });
    const request = response.request(),
      url = new URL(response.url()),
      write = tracked.get(request),
      readyResponse =
        url.origin === service.origin &&
        url.pathname === `/chronicle/play/games/${seat.gameId}/ready`,
      clientAsset =
        url.origin === base.origin &&
        request.resourceType() === "script" &&
        /^\/assets\/[^/]+\.js$/.test(url.pathname);
    if (!write && !readyResponse && !clientAsset) return;
    const task = (async () => {
      if (clientAsset) {
        assert.equal(
          response.status(),
          200,
          "The actual browser loads the built client bundle.",
        );
        const bytes = await response.body(),
          disk = await readFile(resolve("dist", `.${url.pathname}`));
        assert.equal(
          sha(bytes),
          sha(disk),
          "The served browser bundle matches the actual built artifact.",
        );
        table.clientAssets.add(url.pathname);
        if (!proof.clientAssets.some((asset) => asset.path === url.pathname))
          proof.clientAssets.push({
            path: url.pathname,
            sha256: sha(bytes),
            bytes: bytes.length,
            actualBrowserResponse: true,
          });
      }
      if (write) {
        write.status = response.status();
        assert.equal(
          write.status,
          200,
          "Every allowlisted built-client write reached the actual API successfully.",
        );
      }
      if (readyResponse && request.method() !== "OPTIONS") {
        const status = await response.json();
        validateReady(status, seat);
        if (request.method() === "GET")
          proof.readinessReads.push({
            at: new Date().toISOString(),
            diagnostic: false,
            gameId: seat.gameId,
            seatId: seat.id,
            path: url.pathname + url.search,
            status: response.status(),
            ...status,
          });
        if (write) {
          write.ready = status;
          assert.equal(status.groupReady, true);
          const after = await readSeat(seat);
          assert.equal(
            after.state.questionSha256,
            write.nativeBefore.questionSha256,
            "Actual automatic Ready preserves the real native pending setup/fast window.",
          );
          proof.readyChecks.push({
            eventId: event.id,
            gameId: seat.gameId,
            seatId: seat.id,
            kind: "actual automatic client Ready",
            status,
            nativeBefore: write.nativeBefore,
            nativeAfter: after.state,
            pendingQuestionPreserved: true,
          });
        }
      }
    })().catch((error) =>
      proof.errors.push({
        gameId: seat.gameId,
        engine: "chromium",
        documentId: table.requestDocuments.get(request) ?? table.documentId,
        kind: "response assertion",
        message: redact(error.message),
      }),
    );
    table.tasks.add(task);
    void task.finally(() => table.tasks.delete(task));
  });
  await table.context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method(),
      path = url.pathname,
      bound =
        url.searchParams.get("seat") === seat.id &&
        [...url.searchParams.keys()].length === 1,
      block = async (reason) => {
        proof.blockedRequests.push({
          eventId: event.id,
          gameId: seat.gameId,
          seatId: seat.id,
          method,
          path,
          reason,
        });
        await route.abort("blockedbyclient");
      };
    try {
      if (path.startsWith("/chronicle/") && url.origin !== service.origin)
        return block("wrong rules-service origin");
      if (["GET", "HEAD", "OPTIONS"].includes(method)) {
        if (url.origin === service.origin) {
          const globalRead =
              [
                "/chronicle/status",
                "/chronicle/play/options",
                "/chronicle/play/card-definitions",
                "/chronicle/play/presentation",
              ].includes(path) && !url.search,
            seatRead =
              [
                "/chronicle/play/decks",
                `/chronicle/play/games/${seat.gameId}`,
                `/chronicle/play/games/${seat.gameId}/step`,
                `/chronicle/play/games/${seat.gameId}/ready`,
              ].includes(path) && bound;
          if (!globalRead && !seatRead)
            return block("unexpected or misbound native read");
          if (method === "GET") table.gets.add(path);
        }
        return route.continue();
      }
      checkRunning();
      if (method !== "POST" || url.origin !== service.origin || !bound)
        return block("unrelated write or wrong seat binding");
      let body;
      try {
        body = request.postDataJSON();
      } catch {
        return block("invalid request JSON");
      }
      if (path === `/chronicle/play/games/${seat.gameId}/ready`) {
        assert.equal(
          table.readyPost,
          null,
          "Exactly one automatic Ready POST is permitted per fresh seat.",
        );
        assert.deepEqual(
          body,
          {},
          "Ready accepts no client-supplied event/native identity.",
        );
        // Reserve before any diagnostic await so a duplicate client request
        // cannot pass the same fresh-seat Ready allowance concurrently.
        table.readyPost = { status: null };
        const current = await readSeat(seat),
          previous = await readReady(seat);
        assert.equal(
          setupComplete(current.snapshot),
          true,
          "Client Ready occurs only at the actual native setup-complete checkpoint.",
        );
        assert.equal(
          previous.groupReady,
          false,
          "Fresh client actually causes this group's native Ready mark.",
        );
        const write = {
          at: new Date().toISOString(),
          source: "built Chromium UI",
          eventId: event.id,
          gameId: seat.gameId,
          seatId: seat.id,
          method,
          path: path + url.search,
          category: "automatic Ready",
          requestBody: {},
          nativeBefore: current.state,
          readyBefore: previous,
          status: null,
        };
        table.readyPost = write;
        tracked.set(request, write);
        proof.writes.push(write);
        return route.continue();
      }
      const allowance = table.allowance;
      if (path !== `/chronicle/play/games/${seat.gameId}/answer` || !allowance)
        return block("no exact native UI answer allowance");
      // A request consumes its allowance synchronously. Concurrent requests
      // cannot share it while the actual native question is being verified.
      table.allowance = null;
      assert.deepEqual(
        body,
        allowance.reply,
        "UI Answer matches the exact native player/version/choice or saved deck.",
      );
      const current = await readSeat(seat);
      assert.equal(
        current.state.questionSha256,
        allowance.questionSha256,
        "Allowlisted UI response still answers the actual current native question.",
      );
      assert.equal(current.model?.tag, allowance.decisionTag);
      if (body.tag === "Answer") {
        assert.equal(body.contents.playerId, seat.baseline.playerId);
        assert.equal(
          body.contents.questionVersion,
          current.model.questionVersion,
        );
        assert.ok(
          current.model.choices.some(
            (choice) =>
              choice.answerIndex === body.contents.choice && !choice.disabled,
          ),
        );
      } else if (body.tag === "DeckAnswer") {
        assert.equal(current.model.kind, "deck");
        assert.equal(body.playerId, seat.baseline.playerId);
        assert.equal(body.deckId, seat.deckId);
      } else assert.equal(body.tag, "StandaloneSettingsAnswer");
      if (setupComplete(current.snapshot))
        assert.equal(
          (await readReady(seat)).ready,
          true,
          "No initial optional choice or native player action is submitted before mask seven and a real timer.",
        );
      const write = {
        at: new Date().toISOString(),
        source: "built Chromium UI",
        eventId: event.id,
        gameId: seat.gameId,
        seatId: seat.id,
        method,
        path: path + url.search,
        category: allowance.category,
        decisionTag: current.model.tag,
        answerTag: body.tag,
        playerId: seat.baseline.playerId,
        questionVersion: current.model.questionVersion,
        ...(body.tag === "Answer"
          ? {
              choice: body.contents.choice,
              label: allowance.label,
              choiceTag: allowance.choiceTag,
              reason: allowance.reason,
            }
          : body.tag === "DeckAnswer"
            ? { deckId: body.deckId }
            : { settingsSha256: digest(body.contents) }),
        status: null,
      };
      tracked.set(request, write);
      proof.writes.push(write);
      return route.continue();
    } catch (error) {
      return block(redact(error.message));
    }
  });
}

async function resourceProof(table) {
  const before = await readAll(),
    current = before.get(table.seat.id),
    actor = current.state.investigators[0];
  assert.equal(current.model.tag, "PlayerWindowChooseOne");
  assert.equal(current.state.investigators.length, 1);
  assert.ok(actor.remainingActions >= 1);
  await renderedQuestion(table, current);
  const pendingProjection = await projection(table.page),
    choice = current.model.choices.find(
      (choice) => choice.label === "Take 1 resource" && !choice.disabled,
    );
  assert.ok(
    choice,
    "The real native PlayerWindow offers the actual resource action.",
  );
  await clickChoice(
    table,
    current,
    { choice, reason: "Explicit actual first-investigation resource action." },
    "resource",
  );
  const after = await readAll(),
    actual = after.get(table.seat.id),
    afterActor = actual.state.investigators[0];
  assert.equal(
    afterActor.resources,
    actor.resources + 1,
    "Actual native resource increases by exactly one.",
  );
  assert.equal(
    afterActor.remainingActions,
    actor.remainingActions - 1,
    "Actual native action decreases by exactly one.",
  );
  assert.equal(actual.state.phase, current.state.phase);
  assert.notEqual(actual.state.gameSha256, current.state.gameSha256);
  unchanged(before, after, table.seat.id);
  await renderedQuestion(table, actual);
  const answeredProjection = await projection(table.page);
  assert.equal(
    answeredProjection.investigators[0].resources,
    afterActor.resources,
  );
  assert.equal(
    answeredProjection.investigators[0].actions,
    afterActor.remainingActions,
  );
  assert.equal(
    answeredProjection.hand,
    undefined,
    "Text projection does not expose private hands.",
  );
  const filename = `chromium-${table.event.scenarioId}-group-${table.seat.ordinal}-resource.png`;
  await table.page.screenshot({
    path: resolve(output, filename),
    fullPage: true,
  });
  await drain(table);
  await table.page.reload();
  assert.equal(
    new URL(table.page.url()).hash,
    table.seat.tableHash,
    "Reload retains the exact native game and seat binding.",
  );
  await renderedQuestion(table, actual);
  assert.deepEqual(
    await projection(table.page),
    answeredProjection,
    "Native resource/action result and pending decision survive reload.",
  );
  unchanged(after, await readAll());
  await drain(table);
  proof.checks.push({
    eventId: table.event.id,
    scenarioId: table.event.scenarioId,
    gameId: table.seat.gameId,
    seatId: table.seat.id,
    ordinal: table.seat.ordinal,
    role: table.seat.baseline.role,
    actualUiResourceAction: true,
    resourceDelta: 1,
    actionDelta: -1,
    onlyOwnSeatChanged: true,
    answeredReload: true,
    nativeBefore: current.state,
    nativeAfter: actual.state,
    pendingProjection,
    answeredProjection,
    screenshot: filename,
  });
  await checkpoint();
}
async function runEvent(browser, event) {
  const tables = [];
  try {
    for (const seat of event.seats) {
      const browserContext = await browser.newContext({
          viewport: { width: 1440, height: 1050 },
          reducedMotion: "reduce",
          serviceWorkers: "block",
        }),
        table = {
          event,
          seat,
          context: browserContext,
          page: await browserContext.newPage(),
          allowance: null,
          readyPost: null,
          waitingPeerProgress: null,
          documentId: 0,
          requestDocuments: new Map(),
          tasks: new Set(),
          gets: new Set(),
          clientAssets: new Set(),
        };
      tables.push(table);
      activeTables.add(table);
      table.page.setDefaultTimeout(30000);
      await installGuard(table);
      await table.page.goto(`${base.origin}/${seat.tableHash}`);
      const current = await readSeat(seat);
      assert.equal(
        current.model.tag,
        "ChooseDeck",
        "Opening the actual UI does not bypass untouched native deck/setup questions.",
      );
      await renderedQuestion(table, current);
    }
    assert.equal(new Set(tables.map((table) => table.context)).size, 3);
    const completed = new Set();
    for (let round = 0; round < 20 && completed.size < 3; round++)
      for (const table of tables)
        if (!completed.has(table.seat.id) && (await driveSetup(table)))
          completed.add(table.seat.id);
    assert.equal(
      completed.size,
      3,
      "All three real UI setup paths finish, including native shared setup waits.",
    );
    const readiness = await Promise.all(
      event.seats.map((seat) => readReady(seat)),
    );
    for (const status of readiness) {
      assert.equal(status.readyMask, 7);
      assert.ok(status.timerStartedAt > 0);
      assert.equal(status.ready, true);
    }
    assert.equal(
      new Set(readiness.map((status) => status.timerStartedAt)).size,
      1,
      "All three native groups share the exact actual start timer.",
    );
    for (const table of tables) await playable(table);
    const native = await Promise.all(event.seats.map((seat) => readSeat(seat)));
    assert.ok(
      native.every((current) => current.model.tag === "PlayerWindowChooseOne"),
    );
    proof.events.push({
      eventId: event.id,
      scenarioId: event.scenarioId,
      isolatedBrowserContexts: 3,
      untouchedChooseDeckAtOpen: true,
      nativeSetupThroughUi: true,
      actualClientReadyPosts: 3,
      readyMask: 7,
      timerStartedAt: readiness[0].timerStartedAt,
      allThreeActualNativePlayerWindows: true,
      native: native.map((current) => current.state),
    });
    for (const table of tables) await resourceProof(table);
    for (const table of tables) {
      await drain(table);
      assert.ok(
        table.clientAssets.size > 0,
        "Each actual isolated seat loads the verified built client bundle.",
      );
      assert.ok(
        proof.readinessReads.some(
          (read) =>
            !read.diagnostic &&
            read.seatId === table.seat.id &&
            read.status === 200,
        ),
        "Each actual isolated client receives its own successful seat-bound readiness GET.",
      );
      for (const path of [
        "/chronicle/play/card-definitions",
        "/chronicle/play/presentation",
        "/chronicle/play/decks",
        `/chronicle/play/games/${table.seat.gameId}/ready`,
      ])
        assert.ok(
          table.gets.has(path),
          `Actual built UI requested ${path} for this actual seat.`,
        );
    }
  } finally {
    try {
      await verifyArtwork();
      assertLiveErrors();
    } finally {
      await Promise.all(tables.map((table) => table.context.close()));
      for (const table of tables) activeTables.delete(table);
    }
  }
}

try {
  const [seedBytes, manifestBytes, protocolBytes] = await Promise.all([
      readFile(seedPath),
      readFile(manifestPath),
      readFile(
        new URL("../src/game/companionProtocol.ts", import.meta.url),
        "utf8",
      ),
    ]),
    seed = JSON.parse(seedBytes),
    manifest = await acceptanceManifest(manifestPath),
    status = await get("/chronicle/status");
  assert.equal(manifest.kind, nativeQaKind);
  assert.equal(manifest.scope, "native-acceptance");
  assert.equal(manifest.platform, "linux");
  assert.equal(manifest.capabilityCertified, false);
  assert.equal(seed.mode, "client-setup-seed");
  assert.equal(seed.prepared, true);
  assert.deepEqual(
    seed.setupAnswers,
    [],
    "Seed contains no native deck/setup answers.",
  );
  assert.deepEqual(
    seed.debugSeeds,
    [],
    "Seed contains no native state injections.",
  );
  assert.equal(status.ready, true);
  assert.equal(status.runtimeScope, "native-acceptance");
  assert.equal(status.platform, "linux");
  for (const identity of [seed.runtime, manifest]) {
    assert.equal(status.binarySha256, identity.binarySha256);
    assert.equal(status.extensionSourceSha256, identity.extensionSourceSha256);
    assert.deepEqual(
      [...status.extensions].sort(),
      [...identity.extensions].sort(),
    );
  }
  assert.deepEqual([...status.extensions].sort(), [
    "barkham",
    "epic-labyrinth",
    "epic-machinations",
  ]);
  assert.match(status.binarySha256, /^[a-f0-9]{64}$/);
  proof.seedFileSha256 = sha(seedBytes);
  proof.manifest = {
    path: manifestPath,
    sha256: sha(manifestBytes),
    kind: manifest.kind,
    scope: manifest.scope,
    platform: manifest.platform,
    capabilityCertified: false,
    binarySha256: manifest.binarySha256,
    extensionSourceSha256: manifest.extensionSourceSha256,
    extensions: manifest.extensions,
  };
  proof.runtime = {
    version: status.version,
    scope: status.runtimeScope,
    platform: status.platform,
    capabilityCertified: false,
    binarySha256: status.binarySha256,
    extensionSourceSha256: status.extensionSourceSha256,
    extensions: status.extensions,
  };
  proof.runtimeStatusSha256 = digest(status);
  // Read the same original adapter source as the built UI; do not invent JSON
  // choice indices or reproduce the rules in this acceptance harness.
  protocol = await tsImport(
    "../src/game/companionProtocol.ts",
    import.meta.url,
  );
  proof.protocolSourceSha256 = sha(protocolBytes);
  const [presentation, definitions, catalog] = await Promise.all([
    get("/chronicle/play/presentation"),
    get("/chronicle/play/card-definitions"),
    readFile("public/data/catalog.json", "utf8").then(JSON.parse),
  ]);
  artworkDefinitions = definitions;
  const cards = (
      await Promise.all(
        catalog.cardFiles.map((path) =>
          readFile(`public${path}`, "utf8").then(JSON.parse),
        ),
      )
    ).flat(),
    cardMap = new Map(cards.map((card) => [card.code, card]));
  artworkExpectedNames = Object.fromEntries(
    definitions.map((card) => [
      protocol.companionCatalogCode(card.cardCode),
      card.name.title,
    ]),
  );
  for (const card of definitions)
    for (const code of [card.cardCode, ...(card.alternateCardCodes || [])]) {
      const catalogCode = protocol.companionCatalogCode(code);
      if (!cardMap.has(catalogCode))
        cardMap.set(catalogCode, {
          name: card.name.title,
          back_name: card.name.subtitle,
        });
    }
  context = {
    card: (code) => cardMap.get(protocol.companionCatalogCode(code)),
    translate: protocol.companionTranslator(presentation.strings),
    scenarioSettings: (id) => presentation.scenarioSettings[id],
    campaignSettings: (id) => presentation.campaignSettings[id],
  };
  assert.equal(seed.events.length, 2);
  assert.deepEqual(seed.events.map((event) => event.scenarioId).sort(), [
    "70001",
    "87001",
  ]);
  for (const event of seed.events) {
    assert.ok(uuid.test(event.id));
    assert.equal(event.seats.length, 3);
    event.seats.sort((a, b) => a.ordinal - b.ordinal);
    assert.deepEqual(
      event.seats.map((seat) => seat.ordinal),
      [0, 1, 2],
    );
    for (const seat of event.seats) {
      seat.eventId = event.id;
      for (const id of [
        seat.id,
        seat.gameId,
        seat.deckId,
        seat.baseline.playerId,
      ])
        assert.ok(uuid.test(id));
      assert.ok(
        event.games.some(
          (game) =>
            game.gameId === seat.gameId && game.ordinal === seat.ordinal,
        ),
      );
      assert.equal(
        seat.tableHash,
        `#${new URLSearchParams({ investigation: seat.gameId, seat: seat.id })}`,
      );
      assert.equal(seat.baseline.decisionTag, "ChooseDeck");
    }
  }
  allSeats = seed.events.flatMap((event) => event.seats);
  for (const key of ["id", "gameId", "deckId"])
    assert.equal(new Set(allSeats.map((seat) => seat[key])).size, 6);
  for (const seat of allSeats) {
    const bytes = await readFile(seat.snapshotPath),
      saved = JSON.parse(bytes),
      current = await readSeat(seat),
      ready = await readReady(seat),
      decks = await get(`/chronicle/play/decks?seat=${seat.id}`),
      deck = decks.find((deck) => deck.id === seat.deckId);
    assert.equal(
      digest(saved.game),
      seat.snapshotSha256,
      "Untouched native seed snapshot file matches its recorded hash.",
    );
    assert.equal(
      current.state.gameSha256,
      seat.snapshotSha256,
      "Actual native game remains untouched before browser setup.",
    );
    assert.equal(current.state.playerId, seat.baseline.playerId);
    assert.equal(current.state.phase, seat.baseline.phase);
    assert.deepEqual(current.state.gameState, seat.baseline.gameState);
    assert.equal(current.model.tag, "ChooseDeck");
    assert.equal(current.snapshot.game.inSetup, true);
    assert.equal(ready.readyMask, 0);
    assert.equal(ready.timerStartedAt, 0);
    assert.ok(deck, "Exact saved seat deck exists in the actual API.");
    assert.equal(
      String((deck.playList || deck.list).investigator_code).replace(/^c/, ""),
      "01001",
    );
    proof.seedSnapshots.push({
      gameId: seat.gameId,
      seatId: seat.id,
      deckId: seat.deckId,
      snapshotPath: seat.snapshotPath,
      fileSha256: sha(bytes),
      gameSha256: current.state.gameSha256,
      native: current.state,
      ready,
    });
  }
  await checkpoint();
  browser = await chromium.launch({ headless: true });
  proof.browser = {
    engine: "chromium",
    version: browser.version(),
    actualLaunch: true,
  };
  for (const event of seed.events) await runEvent(browser, event);
  assert.equal(proof.events.length, 2);
  assert.equal(proof.checks.length, 6);
  const readyWrites = proof.writes.filter(
      (write) => write.category === "automatic Ready",
    ),
    deckWrites = proof.writes.filter(
      (write) => write.answerTag === "DeckAnswer",
    ),
    resources = proof.writes.filter((write) => write.category === "resource");
  assert.equal(readyWrites.length, 6);
  assert.equal(deckWrites.length, 6);
  assert.equal(resources.length, 6);
  for (const seat of allSeats) {
    assert.equal(
      readyWrites.filter((write) => write.seatId === seat.id).length,
      1,
    );
    assert.equal(
      deckWrites.filter((write) => write.seatId === seat.id).length,
      1,
    );
    assert.equal(
      resources.filter((write) => write.seatId === seat.id).length,
      1,
    );
  }
  assert.ok(proof.writes.every((write) => write.status === 200));
  assertLiveErrors();
  proof.summary = {
    freshNativeSetup: true,
    untouchedNativeChooseDeckSeats: 6,
    isolatedBrowserContexts: 6,
    actualSavedDeckUiSelections: 6,
    actualAutomaticClientReadyPosts: 6,
    eventsWithMaskSevenAndNativeTimer: 2,
    actualNativePlayerWindows: 6,
    actualUiResourceActions: 6,
    exactOwnSeatResourceActionDeltas: 6,
    otherSeatNativeStatesUnchanged: true,
    actualReloadChecks: 6,
    responseMocks: 0,
    directMutations: 0,
    verifiedArtworkFallbacks: proof.toleratedArtwork.length,
  };
  proof.passed = true;
} catch (error) {
  proof.failure = redact(error.stack || error.message || error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  proof.finishedAt = new Date().toISOString();
  await checkpoint();
}
console.log(
  `${proof.passed ? "PASS" : "FAIL"}: fresh Epic browser setup/Ready proof; ${proof.events.length} ready events, ${proof.writes.filter((write) => write.category === "automatic Ready").length} actual client Ready posts, ${proof.checks.length} actual UI resource actions. Report: ${resolve(output, "report.json")}`,
);
if (proof.failure) console.error(proof.failure);
