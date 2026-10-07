#!/usr/bin/env node
/** Live Chronicle UI proof for the fresh six-seat --prepare-table seed.
 * Run only after the candidate, migrations, API, and UI are ready. This script
 * spends one resource action per seat in each browser; it creates no events.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { acceptanceManifest } from "./rules-qa-runtime-identity.mjs";
import { installEpicArtworkCapture, verifyEpicArtwork, replaceEpicArtworkIndexes } from "./epic-browser-artwork.mjs";

if (process.argv.includes("--help")) {
  console.log(
    "EPIC_QA_CONFIRMED=1 node scripts/epic-table-browser-check.mjs\nRequires a fresh epic-runtime-check.mjs --prepare-table report. Defaults: API http://127.0.0.1:5294, UI http://127.0.0.1:5298, EPIC_TABLE_SEED=output/epic-table-seed-2026-10-07/report.json, QA_OUT=output/epic-tables-2026-10-07. Optional: RULES_URL (or ARKHAM_RULES_URL), BASE_URL, ARKHAM_RULES_QA_MANIFEST. Performs twelve actual UI resource actions across Chromium and WebKit; never creates events or seeds native state.\nWebKit uses a separate actual browser process per seat. EPIC_WEBKIT_HEADLESS=0 selects the genuine headed implementation (GTK on Linux); provide a local DISPLAY, optionally GDK_BACKEND=x11 and LIBGL_ALWAYS_SOFTWARE=1. The report records the actual launch settings.\n--diagnose-existing-tail instead reads and reloads the three existing Labyrinth tables in WebKit with every write blocked. It records diagnosticPassed and always leaves passed=false; existing games may already have been answered.",
  );
  process.exit(0);
}
const diagnostic = process.argv.includes("--diagnose-existing-tail");
assert.ok([undefined, "0", "1"].includes(process.env.EPIC_WEBKIT_HEADLESS), "EPIC_WEBKIT_HEADLESS must be 0 or 1 when provided.");
const webkitHeadless = process.env.EPIC_WEBKIT_HEADLESS !== "0";
if (process.platform === "linux" && !webkitHeadless) assert.ok(process.env.DISPLAY, "Headed Linux WebKit requires an actual display (for example, a private Xvfb display).");
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && diagnostic), "Use the full proof or --diagnose-existing-tail.");
assert.equal(
  process.env.EPIC_QA_CONFIRMED,
  "1",
  "Root must confirm the candidate, API, UI, and table seed before live QA.",
);
const service = new URL(
    process.env.RULES_URL ||
      process.env.ARKHAM_RULES_URL ||
      "http://127.0.0.1:5294",
  ),
  base = new URL(process.env.BASE_URL || "http://127.0.0.1:5298"),
  seedPath = resolve(
    process.env.EPIC_TABLE_SEED ||
      "output/epic-table-seed-2026-10-07/report.json",
  ),
  manifestPath = process.env.ARKHAM_RULES_QA_MANIFEST
    ? resolve(process.env.ARKHAM_RULES_QA_MANIFEST)
    : null,
  output = resolve(process.env.QA_OUT || "output/epic-tables-2026-10-07");
for (const url of [service, base]) {
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(url.protocol, "http:");
  assert.equal(url.username + url.password, "");
  assert.equal(url.pathname, "/");
  assert.equal(url.search + url.hash, "");
}
assert.notEqual(base.origin, service.origin, "UI and bridge use separate ports.");
const sha = (value) => createHash("sha256").update(value).digest("hex"),
  digest = (value) => sha(JSON.stringify(value)),
  uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  values = (value) =>
    Array.isArray(value)
      ? value.map((entry) => (Array.isArray(entry) ? entry[1] : entry))
      : Object.values(value || {}),
  pairs = (value) => (Array.isArray(value) ? value : Object.entries(value || {})),
  resourceCount = (investigator) =>
    Number(
      pairs(investigator.tokens).find(
        ([key]) => (typeof key === "string" ? key : key?.tag) === "Resource",
      )?.[1] || 0,
    ),
  redact = (value) =>
    String(value)
      .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
      .replace(/("(?:token|access_token|refresh_token)"\s*:\s*")[^"]+/gi, "$1[redacted]");
const proof = {
  startedAt: new Date().toISOString(),
  passed: false,
  mode: diagnostic ? "GET-only existing WebKit reload-tail diagnostic; no native writes" : "live candidate UI; actual seat contexts and resource answers; no response mocks",
  diagnosticOnly: diagnostic,
  seatObservation: "Each real seat page is brought to foreground before decision visibility and animation-frame checks.",
  browserSeatTopology: "Chromium: one real browser process with three distinct isolated seat contexts per event. WebKit: three separately launched real browser processes per event, each owning one seat context.",
  webkitLaunch: { headless: webkitHeadless,
    ...(process.platform === "linux" ? { implementation: webkitHeadless ? "WPE" : "GTK",
      environment: { DISPLAY: process.env.DISPLAY ?? null, GDK_BACKEND: process.env.GDK_BACKEND ?? null,
        LIBGL_ALWAYS_SOFTWARE: process.env.LIBGL_ALWAYS_SOFTWARE ?? null } } : {}) },
  service: service.origin,
  ui: base.origin,
  seedPath,
  checks: [],
  browsers: [],
  writes: [],
  blockedRequests: [],
  errors: [],
  resourceFailures: [],
  toleratedArtwork: [],
  clientAssets: [],
  clientAssetAttempts: [],
  stages: [],
  cleanupErrors: [],
  failureDiagnostics: [],
  nativeReadCompletions: [],
  seatBrowserProcesses: [],
};
await mkdir(output, { recursive: true });
const checkpoint = () =>
  writeFile(resolve(output, "report.json"), JSON.stringify(proof, null, 2) + "\n");
const pageTables = new WeakMap();
async function bounded(operation, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([operation(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Acceptance operation timed out: ${label}`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
async function stage(page, label, operation, milliseconds = 35000) {
  const table = pageTables.get(page), entry = { label, engine: table?.engine, gameId: table?.seat.gameId,
    documentId: table?.documentId, startedAt: new Date().toISOString() };
  proof.stages.push(entry);
  proof.progress = entry;
  await checkpoint();
  try {
    const result = await bounded(operation, milliseconds, label);
    entry.finishedAt = new Date().toISOString();
    return result;
  } catch (error) {
    entry.error = redact(error.stack || error);
    proof.primaryFailure ||= entry.error;
    await checkpoint();
    throw error;
  }
}
async function cleanup(label, operation) {
  try { await bounded(operation, 10000, label); }
  catch (error) { proof.cleanupErrors.push({ label, error: redact(error.stack || error) }); await checkpoint(); }
}
async function diagnoseFailure(tables) {
  await Promise.all(tables.map(async (table) => {
    const entry = { engine: table.engine, gameId: table.seat.gameId, documentId: table.documentId,
      url: table.page.url(), closed: table.page.isClosed(), observedAt: new Date().toISOString() };
    proof.failureDiagnostics.push(entry);
    try {
      entry.dom = await bounded(() => table.page.evaluate(() => {
        const decision = document.querySelector(".chronicle-companion-table .companion-decision"),
          rectangle = decision?.getBoundingClientRect();
        return { title: document.title, readyState: document.readyState, visibility: document.visibilityState,
          bodyText: document.body?.innerText.slice(0, 20000),
          decisionPresent: Boolean(decision), decisionRectangle: rectangle?.toJSON(),
          decisionDisplay: decision ? getComputedStyle(decision).display : null,
          decisionVisibility: decision ? getComputedStyle(decision).visibility : null,
          projection: typeof window.render_game_to_text === "function" ? JSON.parse(window.render_game_to_text()) : null };
      }), 6000, "read-only failure DOM probe");
    } catch (error) { entry.domError = redact(error.stack || error); }
    try {
      entry.screenshot = `failure-${table.engine}-group-${table.seat.ordinal}-document-${table.documentId}.png`;
      await bounded(() => table.page.screenshot({ path: resolve(output, entry.screenshot), fullPage: true }),
        6000, "read-only failure screenshot");
    } catch (error) { entry.screenshotError = redact(error.stack || error); }
  }));
  await checkpoint();
}
await checkpoint();
const get = async (path) => {
  const response = await fetch(new URL(path, service), {
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `Live bridge GET ${path}`);
  return response.json();
};
let allSeats = [], expectedArtworkNames = {}, cardDefinitions = [];
const classifiedErrors = new Set(), classifiedFailures = new Set(), witnessedErrors = new Set(), witnessedFailures = new Set();
async function attestArtwork(tables) {
  for (const table of tables) {
    await stage(table.page, "client-script-audit", () => Promise.all([...table.assetTasks]), 20000);
    const scope = { errors: proof.errors, resourceFailures: proof.resourceFailures,
      gameId: table.seat.gameId, engine: table.engine, documentId: table.documentId,
      classifiedErrors, classifiedFailures };
    replaceEpicArtworkIndexes(scope);
    const nativeSnapshot = (await stage(table.page, "artwork-native-snapshot", () => readSeat(table.seat), 25000)).snapshot;
    const witness = await stage(table.page, "same-document-artwork-inspection", () => verifyEpicArtwork(table.page, {
      errors: proof.errors, resourceFailures: proof.resourceFailures,
      gameId: table.seat.gameId, engine: table.engine,
      documentId: table.documentId, expectedNames: expectedArtworkNames,
      nativeSnapshot, cardDefinitions,
    }), 35000);
    const newlyClassified = witness.classifiedErrorIndexes.some((index) => !witnessedErrors.has(index)) ||
      witness.classifiedFailureIndexes.some((index) => !witnessedFailures.has(index));
    replaceEpicArtworkIndexes({ ...scope, result: witness });
    for (const index of witness.classifiedErrorIndexes) witnessedErrors.add(index);
    for (const index of witness.classifiedFailureIndexes) witnessedFailures.add(index);
    if (witness.evidence.length && newlyClassified) proof.toleratedArtwork.push({
      engine: table.engine, gameId: table.seat.gameId, ...witness,
    });
  }
}
function assertClientErrors() {
  assert.deepEqual(proof.errors.filter((_, index) => !classifiedErrors.has(index)), [],
    "No console/page error remains without exact same-render card-artwork fallback evidence.");
  assert.deepEqual(proof.resourceFailures.filter((_, index) => !classifiedFailures.has(index)), [],
    "Every failed request must have exact same-render card-artwork fallback evidence.");
}
const readSeat = async (seat) => {
    const [snapshot, cursor] = await Promise.all([
      get(`/chronicle/play/games/${seat.gameId}?seat=${seat.id}`),
      get(`/chronicle/play/games/${seat.gameId}/step?seat=${seat.id}`),
    ]);
    assert.ok(Number.isSafeInteger(cursor.step) && cursor.step >= 0, "Native saved cursor is a nonnegative integer.");
    assert.equal(snapshot.playerId, seat.baseline.playerId, "Seat owns its native player.");
    const investigators = values(snapshot.game.investigators),
      investigator = investigators.find((item) => item.id === seat.baseline.investigatorId);
    assert.ok(investigator, "Seat's native investigator is present.");
    assert.equal(investigators.length, 1, "The prepared table has one investigator per seat.");
    return {
      snapshot,
      state: {
        gameId: seat.gameId,
        seatId: seat.id,
        playerId: snapshot.playerId,
        investigatorId: investigator.id,
        resources: resourceCount(investigator),
        remainingActions: investigator.remainingActions,
        phase: snapshot.game.phase,
        scenarioSteps: snapshot.game.scenarioSteps,
        step: cursor.step,
        gameSha256: digest(snapshot.game),
      },
    };
  },
  readAll = async () =>
    new Map(await Promise.all(allSeats.map(async (seat) => [seat.id, await readSeat(seat)]))),
  unchanged = (before, after, excludedSeat) => {
    for (const seat of allSeats)
      if (seat.id !== excludedSeat)
        assert.deepEqual(
          after.get(seat.id).state,
          before.get(seat.id).state,
          `Only the answering seat may change: ${seat.gameId}`,
        );
  };
const projection = (page) => stage(page, "native-text-projection", () => page.evaluate(() => JSON.parse(window.render_game_to_text()))),
  foreground = (page) => stage(page, "observe-seat-in-foreground", () => page.bringToFront()),
  frames = async (page) => {
    await foreground(page);
    return stage(page, "fonts-and-animation-frames", () => page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    }));
  };
async function pending(page, expected) {
  await foreground(page);
  await stage(page, "pending-decision-visible", () => page.locator(".chronicle-companion-table .companion-decision").waitFor());
  await stage(page, "pending-native-resource-render", () => page.waitForFunction(
    ({ resources, remainingActions, phase }) => {
      if (typeof window.render_game_to_text !== "function") return false;
      const rendered = JSON.parse(window.render_game_to_text()),
        actor = rendered.investigators?.[0];
      return rendered.phase === phase && rendered.investigators?.length === 1 &&
        actor.resources === resources && actor.actions === remainingActions &&
        rendered.decision?.tag === "PlayerWindowChooseOne" &&
        rendered.decision.options.some((choice) => choice.text === "Take 1 resource" && !choice.disabled);
    },
    expected,
  ));
  await page.locator(".companion-decision[aria-busy='false']").waitFor();
  assert.equal(await page.locator("iframe").count(), 0, "Chronicle owns the actual table UI.");
  assert.equal(await page.locator(".companion-decision[aria-busy='true']").count(), 0);
  assert.equal(await page.locator(".companion-error").count(), 0);
  const actionPips = page.locator(".companion-investigator .companion-action-pips");
  assert.equal(await actionPips.getAttribute("aria-label"), `${expected.remainingActions} actions remaining`);
  const resources = page.locator(".companion-investigator .token-resource");
  assert.equal(await resources.count(), 1, "The investigator visibly owns the resource token.");
  assert.equal(await resources.getAttribute("aria-label"), `${expected.resources} resource`);
  const rendered = await projection(page);
  assert.equal(rendered.hand, undefined, "Text projection does not expose private hand cards.");
  return rendered;
}
async function mobile(page, filename) {
  await stage(page, "mobile-viewport", () => page.setViewportSize({ width: 320, height: 900 }));
  await frames(page);
  const layout = await stage(page, "mobile-layout", () => page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    decision: document.querySelector(".companion-decision")?.getBoundingClientRect().toJSON(),
  })));
  assert.ok(layout.document <= layout.viewport + 1, "Actual native table fits 320px without page overflow.");
  assert.ok(layout.decision && layout.decision.left >= -1 && layout.decision.right <= 321,
    "Pending native decision stays inside the mobile viewport.");
  await stage(page, "mobile-screenshot", () => page.screenshot({ path: resolve(output, filename), fullPage: true }));
  return layout;
}
async function drainNativeReads(table, observation, limit = 20000) {
    // Foreground observation triggers the product's genuine visibility poll.
    // Let its reads finish before navigating away rather than cancelling them.
    const waitingAt = Date.now();
    observation.nativeReadsPendingAtStart = table.nativeReads.size;
    observation.nativeReadBodiesCompletedAtStart = table.nativeBodiesCompleted;
    let quietAt;
    for (;;) {
      if (table.nativeReads.size) quietAt = undefined;
      else quietAt ??= Date.now();
      if (quietAt && Date.now() - quietAt >= 100) break;
      assert.ok(Date.now() - waitingAt < limit, "Native UI reads must finish before owned navigation or close.");
      await new Promise((done) => setTimeout(done, 25));
    }
    Object.assign(observation, { nativeReadsPendingBeforeNavigation: table.nativeReads.size,
      nativeReadBodiesCompletedBeforeNavigation: table.nativeBodiesCompleted,
      nativeReadsSettledAt: new Date().toISOString(), nativeReadQuietMilliseconds: Date.now() - quietAt });
}
async function reloadSeat(page, label) {
  return stage(page, label, async () => {
    await drainNativeReads(pageTables.get(page), proof.progress);
    return page.reload();
  });
}
async function runEvent(browser, engine, event, browserProof) {
  const contexts = [], tables = [], seatBrowsers = [];
  try {
    for (const seat of event.seats) {
      const owner = engine === "webkit"
        ? await bounded(() => webkit.launch({ headless: webkitHeadless }), 35000, "independent WebKit seat process launch")
        : browser;
      if (engine === "webkit") {
        seatBrowsers.push(owner);
        browserProof.version ??= owner.version();
        assert.equal(owner.version(), browserProof.version, "Every real WebKit seat process uses the same engine version.");
        proof.seatBrowserProcesses.push({ engine, eventId: event.id, gameId: seat.gameId,
          ordinal: seat.ordinal, version: owner.version(), launchMethod: "playwright.webkit.launch",
          headless: webkitHeadless, ...(process.platform === "linux" ? { implementation: proof.webkitLaunch.implementation } : {}),
          independentLaunch: true, startedAt: new Date().toISOString() });
      }
      const context = await owner.newContext({
        viewport: { width: 1440, height: 1050 },
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      contexts.push(context);
      if (engine === "webkit") {
        assert.equal(owner.contexts().length, 1, "Each independent WebKit process owns exactly one seat context.");
        proof.seatBrowserProcesses.at(-1).isolatedSeatContexts = owner.contexts().length;
      }
      const table = { seat, context, page: await context.newPage(), allowance: null, gets: new Set(), engine, documentId: 0, requestDocuments: new WeakMap(), assetTasks: new Set(), nativeReads: new Set(), nativeReadStarts: new WeakMap(), nativeReadStatuses: new WeakMap(), nativeBodiesCompleted: 0 };
      tables.push(table);
      pageTables.set(table.page, table);
      table.page.setDefaultTimeout(30000);
      table.page.on("framenavigated", (frame) => { if (frame === table.page.mainFrame()) table.documentId += 1; });
      table.page.on("request", (request) => {
        table.requestDocuments.set(request, table.documentId);
        const url = new URL(request.url());
        if (request.method() === "GET" && url.origin === service.origin) {
          table.nativeReads.add(request);
          table.nativeReadStarts.set(request, new Date().toISOString());
        }
      });
      table.page.on("requestfinished", (request) => {
        if (table.nativeReads.delete(request)) {
          table.nativeBodiesCompleted += 1;
          proof.nativeReadCompletions.push({ engine, gameId: seat.gameId,
            documentId: table.requestDocuments.get(request), url: request.url(),
            startedAt: table.nativeReadStarts.get(request), status: table.nativeReadStatuses.get(request),
            bodyCompletedAt: new Date().toISOString(), completionEvent: "Playwright requestfinished; response body downloaded" });
        }
      });
      await stage(table.page, "install-artwork-capture", () => installEpicArtworkCapture(table.page));
      table.page.on("pageerror", (error) => proof.errors.push({ engine, gameId: seat.gameId, documentId: table.documentId, kind: "pageerror", message: redact(error.message) }));
      table.page.on("console", (message) => {
        if (message.type() === "error")
          proof.errors.push({ engine, gameId: seat.gameId, documentId: table.documentId, kind: "console", message: redact(message.text()), location: message.location() });
      });
      table.page.on("response", (response) => {
        const url = new URL(response.url()), request = response.request(), documentId = table.requestDocuments.get(request);
        if (table.nativeReads.has(request)) table.nativeReadStatuses.set(request, response.status());
        if (response.status() >= 400) proof.resourceFailures.push({
          engine, gameId: seat.gameId, documentId, url: response.url(), status: response.status(),
          resourceType: request.resourceType(),
        });
        if (url.origin === base.origin && request.resourceType() === "script" && /^\/assets\/[^/]+\.js$/.test(url.pathname)) {
          const attempt = { engine, gameId: seat.gameId, documentId, url: url.href,
            scriptResponseStatus: response.status(), startedAt: new Date().toISOString() };
          proof.clientAssetAttempts.push(attempt);
          const task = (async () => {
            assert.equal(response.status(), 200, "Actual built client script loads successfully.");
            const sourcePath = resolve("dist", url.pathname.slice(1)), expected = await readFile(sourcePath);
            attempt.builtSha256 = sha(expected);
            let timer, actualSha256, verificationMethod, fetchedStatus;
            try {
              const actual = await Promise.race([response.body(), new Promise((_, reject) => {
                timer = setTimeout(() => reject(Object.assign(new Error("Script response body audit timeout"), { auditTimeout: true })), 5000);
              })]);
              actualSha256 = sha(actual);
              verificationMethod = "original-script-response-body";
            } catch (error) {
              if (!error.auditTimeout) throw error;
              const fetched = await table.page.evaluate(async (assetUrl) => {
                const reply = await fetch(assetUrl, { signal: AbortSignal.timeout(10000) });
                const bytes = await reply.arrayBuffer(), digest = await crypto.subtle.digest("SHA-256", bytes);
                return { status: reply.status, sha256: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("") };
              }, url.href);
              assert.equal(fetched.status, 200, "Read-only browser GET of the exact loaded script URL succeeds.");
              actualSha256 = fetched.sha256;
              fetchedStatus = fetched.status;
              verificationMethod = "browser-context-get-after-script-response-body-timeout";
            } finally { clearTimeout(timer); }
            assert.equal(actualSha256, sha(expected), "Actual served client script matches the current built artifact.");
            Object.assign(attempt, { verificationMethod, fetchedStatus, fetchedSha256: actualSha256, finishedAt: new Date().toISOString() });
            proof.clientAssets.push({ engine, gameId: seat.gameId, documentId,
              url: url.href, sourcePath, scriptResponseStatus: response.status(), verificationMethod,
              fetchedStatus, fetchedSha256: actualSha256, builtSha256: sha(expected) });
          })().catch((error) => proof.errors.push({ engine, gameId: seat.gameId, documentId,
            kind: "client artifact", message: redact(error.message) })).finally(() => table.assetTasks.delete(task));
          table.assetTasks.add(task);
        }
      });
      table.page.on("requestfailed", (request) => {
        table.nativeReads.delete(request);
        proof.resourceFailures.push({ engine, gameId: seat.gameId, documentId: table.requestDocuments.get(request),
          url: request.url(), resourceType: request.resourceType(), failure: request.failure()?.errorText });
      });
      await context.route("**/*", async (route) => {
        const request = route.request(), url = new URL(request.url()),
          method = request.method(), path = url.pathname;
        if (path.startsWith("/chronicle/") && url.origin !== service.origin) {
          proof.blockedRequests.push({ engine, gameId: seat.gameId, method, path, reason: "wrong rules-service origin" });
          return route.abort("blockedbyclient");
        }
        if (["GET", "HEAD", "OPTIONS"].includes(method)) {
          if (url.origin === service.origin) table.gets.add(path);
          const game = /^\/chronicle\/play\/games\/([^/]+)(?:\/step)?$/.exec(path);
          if (url.origin === service.origin && game &&
              (game[1] !== seat.gameId || url.searchParams.get("seat") !== seat.id)) {
            proof.blockedRequests.push({ engine, gameId: seat.gameId, method, path, reason: "wrong seat read" });
            return route.abort("blockedbyclient");
          }
          return route.continue();
        }
        const allowed = table.allowance;
        if (allowed && method === "POST" && url.origin === service.origin &&
            path === `/chronicle/play/games/${seat.gameId}/answer` &&
            url.searchParams.get("seat") === seat.id) {
          let body;
          try { body = request.postDataJSON(); } catch { /* An invalid body is blocked below. */ }
          if (body?.tag === "Answer" && body.contents?.choice === allowed.choice &&
              body.contents?.playerId === seat.baseline.playerId &&
              body.contents?.questionVersion === allowed.questionVersion) {
            table.allowance = null;
            proof.writes.push({ engine, eventId: event.id, gameId: seat.gameId, seatId: seat.id, path,
              choice: body.contents.choice, playerId: body.contents.playerId, questionVersion: body.contents.questionVersion });
            return route.continue();
          }
        }
        proof.blockedRequests.push({ engine, gameId: seat.gameId, method, path, reason: "unapproved write" });
        return route.abort("blockedbyclient");
      });
      await stage(table.page, "initial-table-navigation", () => table.page.goto(`${base.origin}/${seat.tableHash}`));
    }
    assert.equal(new Set(contexts).size, 3, "Three isolated browser seat contexts.");
    if (engine === "webkit") assert.equal(new Set(seatBrowsers).size, 3, "Three independently launched real WebKit browser processes.");
    for (const table of tables) {
      const { seat, page } = table,
        prefix = `${engine}-${event.scenarioId}-group-${seat.ordinal}`,
        before = await readAll(), expected = before.get(seat.id).state,
        pendingProjection = await pending(page, expected);
      await frames(page);
      await stage(page, "pending-desktop-screenshot", () => page.screenshot({ path: resolve(output, `${prefix}-pending-desktop.png`), fullPage: true }));
      const pendingLayout = await mobile(page, `${prefix}-pending-mobile.png`);
      await attestArtwork(tables);
      assertClientErrors();
      await reloadSeat(page, "pending-table-reload");
      assert.equal(new URL(page.url()).hash, seat.tableHash, "Reload preserves the selected game and seat.");
      assert.deepEqual(await pending(page, expected), pendingProjection, "Unanswered native decision survives reload.");
      unchanged(before, await readAll());
      if (diagnostic) {
        await stage(page, "existing-desktop-viewport", () => page.setViewportSize({ width: 1440, height: 1050 }));
        const currentProjection = await pending(page, expected);
        for (const sibling of tables) await pending(sibling.page, before.get(sibling.seat.id).state);
        await frames(page);
        await stage(page, "existing-desktop-screenshot", () => page.screenshot({ path: resolve(output, `${prefix}-existing-desktop.png`), fullPage: true }));
        await mobile(page, `${prefix}-existing-mobile.png`);
        await attestArtwork(tables);
        assertClientErrors();
        await reloadSeat(page, "existing-answered-table-reload");
        assert.deepEqual(await pending(page, expected), currentProjection, "Existing answered native state survives reload.");
        unchanged(before, await readAll());
        await attestArtwork(tables);
        assertClientErrors();
        proof.checks.push({ engine, gameId: seat.gameId, diagnosticOnly: true, nativeWrites: 0, savedStateUnchanged: true });
        await checkpoint();
        continue;
      }
      assert.equal(table.allowance, null);
      await stage(page, "answered-desktop-viewport", () => page.setViewportSize({ width: 1440, height: 1050 }));
      const current = await projection(page),
        choice = current.decision.options.find((entry) => entry.text === "Take 1 resource" && !entry.disabled),
        button = page.locator(".companion-decision").getByRole("button", { name: /^Take 1 resource\b/ });
      assert.ok(choice && Number.isSafeInteger(choice.index), "A real enabled native resource choice exists.");
      assert.equal(await button.count(), 1, "The exact resource action is unambiguous.");
      assert.equal(await button.isEnabled(), true);
      assert.ok(expected.remainingActions >= 1);
      table.allowance = { choice: choice.index, questionVersion: expected.scenarioSteps };
      const [response] = await Promise.all([
        page.waitForResponse((reply) => {
          const url = new URL(reply.url());
          return url.origin === service.origin && url.pathname === `/chronicle/play/games/${seat.gameId}/answer` &&
            url.searchParams.get("seat") === seat.id && reply.request().method() === "POST";
        }),
        button.click(),
      ]);
      assert.equal(response.status(), 200, "Actual native UI answer succeeds.");
      assert.equal(table.allowance, null, "One exact UI answer consumed its write allowance.");
      const after = await readAll(), actual = after.get(seat.id).state;
      assert.equal(actual.resources, expected.resources + 1, "Resource action adds exactly one native resource.");
      assert.equal(actual.remainingActions, expected.remainingActions - 1, "Resource action spends exactly one native action.");
      assert.equal(actual.phase, expected.phase);
      assert.notEqual(actual.gameSha256, expected.gameSha256);
      unchanged(before, after, seat.id);
      const answeredProjection = await pending(page, actual);
      for (const sibling of tables)
        await pending(sibling.page, after.get(sibling.seat.id).state);
      await frames(page);
      await stage(page, "answered-desktop-screenshot", () => page.screenshot({ path: resolve(output, `${prefix}-answered-desktop.png`), fullPage: true }));
      const answeredLayout = await mobile(page, `${prefix}-answered-mobile.png`);
      await attestArtwork(tables);
      assertClientErrors();
      await reloadSeat(page, "answered-table-reload");
      assert.equal(new URL(page.url()).hash, seat.tableHash);
      assert.deepEqual(await pending(page, actual), answeredProjection, "Answered native resource/action state survives reload.");
      unchanged(after, await readAll());
      for (const path of ["/chronicle/play/card-definitions", "/chronicle/play/presentation"])
        assert.ok(table.gets.has(path), `Actual native UI loaded ${path}.`);
      await attestArtwork(tables);
      assertClientErrors();
      assert.deepEqual(proof.blockedRequests, [], "No cross-seat request or extra write was attempted.");
      proof.checks.push({
        engine, eventId: event.id, scenarioId: event.scenarioId, gameId: seat.gameId,
        seatId: seat.id, ordinal: seat.ordinal, role: seat.baseline.role,
        isolatedSeatContexts: 3, pendingReload: true, answeredReload: true,
        explicitNativeResourceAction: true, onlyOwnSeatChanged: true,
        resourceDelta: actual.resources - expected.resources,
        actionDelta: actual.remainingActions - expected.remainingActions,
        nativeBefore: expected, nativeAfter: actual, pendingProjection, answeredProjection,
        pendingLayout, answeredLayout,
        screenshots: ["pending-desktop", "pending-mobile", "answered-desktop", "answered-mobile"].map((suffix) => `${prefix}-${suffix}.png`),
      });
      await checkpoint();
    }
    await attestArtwork(tables);
    assertClientErrors();
  } catch (error) {
    proof.primaryFailure ||= redact(error.stack || error);
    proof.failedAtStage = { ...proof.progress };
    await checkpoint();
    await diagnoseFailure(tables);
    throw error;
  } finally {
    await Promise.all(contexts.map((context, index) => cleanup(`${engine} seat context ${index}`, async () => {
      if (!proof.primaryFailure) {
        const observation = { label: "native-read-drain-before-context-close", engine,
          gameId: tables[index].seat.gameId, startedAt: new Date().toISOString() };
        proof.stages.push(observation);
        await drainNativeReads(tables[index], observation, 5000);
        observation.finishedAt = new Date().toISOString();
      }
      await context.close();
    })));
    await Promise.all(seatBrowsers.map((owner, index) => cleanup(`independent ${engine} seat browser process ${index}`, async () => {
      await owner.close();
      proof.seatBrowserProcesses.find((entry) => entry.gameId === event.seats[index].gameId).closedAt = new Date().toISOString();
    })));
  }
}
try {
  const seedBytes = await readFile(seedPath), seed = JSON.parse(seedBytes),
    manifestBytes = manifestPath ? await readFile(manifestPath) : null,
    manifest = manifestBytes ? await acceptanceManifest(manifestPath) : null,
    status = await get("/chronicle/status");
  proof.seedFileSha256 = sha(seedBytes);
  proof.manifest = manifest ? { path: manifestPath, sha256: sha(manifestBytes), kind: manifest.kind,
    ...(manifest.scope ? { scope: manifest.scope, platform: manifest.platform, capabilityCertified: false } : {}), binarySha256: manifest.binarySha256,
    extensionSourceSha256: manifest.extensionSourceSha256, extensions: manifest.extensions } : null;
  proof.runtime = { version: status.version,
    ...(status.runtimeScope ? { scope: status.runtimeScope, platform: status.platform, capabilityCertified: false } : {}), binarySha256: status.binarySha256,
    extensionSourceSha256: status.extensionSourceSha256, extensions: status.extensions };
  proof.runtimeStatusSha256 = digest(status);
  cardDefinitions = await get("/chronicle/play/card-definitions");
  expectedArtworkNames = Object.fromEntries(cardDefinitions.flatMap((card) =>
    [card.cardCode, ...(card.alternateCardCodes || [])].map((code) => [String(code).replace(/^c(?=\d)/, ""), card.name.title])));
  assert.equal(seed.mode, "table-seed");
  assert.equal(seed.prepared, true, "Only a successfully prepared fresh table seed may be used.");
  assert.deepEqual(seed.debugSeeds, [], "UI setup uses legitimate native setup answers.");
  assert.equal(status.ready, true);
  assert.match(status.binarySha256, /^[a-f0-9]{64}$/);
  assert.equal(status.binarySha256, seed.runtime.binarySha256);
  assert.equal(status.extensionSourceSha256, seed.runtime.extensionSourceSha256);
  if (manifest) {
    assert.equal(status.binarySha256, manifest.binarySha256);
    assert.equal(status.extensionSourceSha256, manifest.extensionSourceSha256);
  }
  const extensions = ["barkham", "epic-labyrinth", "epic-machinations"].sort();
  for (const actual of [status.extensions, seed.runtime.extensions, ...(manifest ? [manifest.extensions] : [])])
    assert.deepEqual([...actual].sort(), extensions, "The same aggregate candidate serves the seed and browser QA.");
  assert.deepEqual(seed.events.map((event) => event.scenarioId).sort(), ["70001", "87001"]);
  for (const event of seed.events) {
    assert.ok(uuid.test(event.id));
    assert.deepEqual(event.seats.map((seat) => seat.ordinal).sort(), [0, 1, 2]);
    for (const seat of event.seats) {
      for (const id of [seat.id, seat.gameId, seat.baseline.playerId])
        assert.ok(uuid.test(id));
      assert.ok(typeof seat.baseline.investigatorId === "string" && seat.baseline.investigatorId.trim(),
        "Native investigator ID is a nonempty CardCode string.");
      assert.ok(event.games.some((game) => game.gameId === seat.gameId && game.ordinal === seat.ordinal));
      assert.equal(seat.tableHash, `#${new URLSearchParams({ investigation: seat.gameId, seat: seat.id })}`);
      assert.equal(seat.baseline.phase, "InvestigationPhase");
      assert.equal(seat.baseline.decisionTag, "PlayerWindowChooseOne");
      assert.ok(seat.baseline.remainingActions >= 2, "Both browsers need one genuine resource action.");
    }
  }
  allSeats = seed.events.flatMap((event) => event.seats);
  assert.equal(new Set(allSeats.map((seat) => seat.id)).size, 6);
  assert.equal(new Set(allSeats.map((seat) => seat.gameId)).size, 6);
  proof.seedSnapshots = [];
  for (const seat of allSeats) {
    const bytes = await readFile(seat.snapshotPath), saved = JSON.parse(bytes), live = await readSeat(seat);
    assert.equal(digest(saved.game), seat.snapshotSha256, "Seed snapshot has not been altered.");
    if (!diagnostic) assert.equal(live.state.gameSha256, seat.snapshotSha256, "Live seed is still fresh before any browser action.");
    for (const key of ["playerId", "investigatorId", "phase", "scenarioSteps", "resources", "remainingActions"])
      if (!diagnostic) assert.equal(live.state[key], seat.baseline[key], `Seed baseline ${key}`);
    proof.seedSnapshots.push({ gameId: seat.gameId, seatId: seat.id, path: seat.snapshotPath,
      fileSha256: sha(bytes), gameSha256: seat.snapshotSha256 });
  }
  await checkpoint();
  for (const [engine, launcher] of diagnostic ? [["webkit", webkit]] : [["chromium", chromium], ["webkit", webkit]]) {
    const nativeBaseline = [...(await readAll()).values()].map((entry) => entry.state);
    const browser = engine === "webkit" ? null : await launcher.launch({ headless: true });
    const browserProof = { engine, version: browser?.version() ?? null, nativeBaseline,
      processTopology: engine === "webkit" ? "one independently launched browser per seat" : "one browser with three isolated seat contexts" };
    proof.browsers.push(browserProof);
    try {
      for (const event of diagnostic ? seed.events.filter((event) => event.scenarioId === "70001") : seed.events) await runEvent(browser, engine, event, browserProof);
      browserProof.nativeFinal = [...(await readAll()).values()].map((entry) => entry.state);
      for (const before of nativeBaseline) {
        const after = browserProof.nativeFinal.find((entry) => entry.seatId === before.seatId);
        assert.equal(after.resources, before.resources + (diagnostic ? 0 : 1));
        assert.equal(after.remainingActions, before.remainingActions - (diagnostic ? 0 : 1));
      }
      await checkpoint();
    } finally {
      if (browser) await cleanup(`${engine} browser process`, () => browser.close());
    }
  }
  assert.equal(proof.checks.length, diagnostic ? 3 : 12);
  assert.equal(proof.writes.length, diagnostic ? 0 : 12);
  assert.equal(proof.seatBrowserProcesses.length, diagnostic ? 3 : 6);
  assert.ok(proof.seatBrowserProcesses.every((entry) => entry.independentLaunch && entry.isolatedSeatContexts === 1 && entry.closedAt),
    "Every independently launched real WebKit seat process owns one context and closes cleanly.");
  assert.equal(new Set(proof.clientAssets.map((asset) => `${asset.engine}/${asset.gameId}`)).size, diagnostic ? 3 : 12,
    "All twelve actual browser contexts served the current built client artifact.");
  assertClientErrors();
  assert.deepEqual(proof.blockedRequests, []);
  assert.deepEqual(proof.cleanupErrors, []);
  proof.finalSeats = [...(await readAll()).values()].map((entry) => entry.state);
  for (const seat of allSeats) {
    const final = proof.finalSeats.find((entry) => entry.seatId === seat.id);
    if (!diagnostic) {
      assert.equal(final.resources, seat.baseline.resources + 2);
      assert.equal(final.remainingActions, seat.baseline.remainingActions - 2);
    }
  }
  if (diagnostic) proof.diagnosticPassed = true;
  else proof.passed = true;
  proof.finishedAt = new Date().toISOString();
  await checkpoint();
  console.log(`Epic Chronicle live table checks passed: ${proof.checks.length} seat/browser checks.`);
} catch (error) {
  proof.failure = redact(error.stack || error);
  proof.finishedAt = new Date().toISOString();
  await checkpoint();
  console.error(proof.failure);
  process.exitCode = 1;
}
