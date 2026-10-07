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

if (process.argv.includes("--help")) {
  console.log(
    "EPIC_QA_CONFIRMED=1 node scripts/epic-table-browser-check.mjs\nRequires a fresh epic-runtime-check.mjs --prepare-table report. Defaults: API http://127.0.0.1:5294, UI http://127.0.0.1:5298, EPIC_TABLE_SEED=output/epic-table-seed-2026-10-07/report.json, QA_OUT=output/epic-tables-2026-10-07. Optional: RULES_URL (or ARKHAM_RULES_URL), BASE_URL, ARKHAM_RULES_QA_MANIFEST. Performs twelve actual UI resource actions across Chromium and WebKit; never creates events or seeds native state.",
  );
  process.exit(0);
}
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
  mode: "live candidate UI; actual seat contexts and resource answers; no response mocks",
  service: service.origin,
  ui: base.origin,
  seedPath,
  checks: [],
  browsers: [],
  writes: [],
  blockedRequests: [],
  errors: [],
};
await mkdir(output, { recursive: true });
const checkpoint = () =>
  writeFile(resolve(output, "report.json"), JSON.stringify(proof, null, 2) + "\n");
await checkpoint();
const get = async (path) => {
  const response = await fetch(new URL(path, service), {
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, `Live bridge GET ${path}`);
  return response.json();
};
let allSeats = [];
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
const projection = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text())),
  frames = (page) =>
    page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
async function pending(page, expected) {
  await page.locator(".chronicle-companion-table .companion-decision").waitFor();
  await page.waitForFunction(
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
  );
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
  await page.setViewportSize({ width: 320, height: 900 });
  await frames(page);
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    decision: document.querySelector(".companion-decision")?.getBoundingClientRect().toJSON(),
  }));
  assert.ok(layout.document <= layout.viewport + 1, "Actual native table fits 320px without page overflow.");
  assert.ok(layout.decision && layout.decision.left >= -1 && layout.decision.right <= 321,
    "Pending native decision stays inside the mobile viewport.");
  await page.screenshot({ path: resolve(output, filename), fullPage: true });
  return layout;
}
async function runEvent(browser, engine, event) {
  const contexts = [], tables = [];
  try {
    for (const seat of event.seats) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1050 },
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      contexts.push(context);
      const table = { seat, context, page: await context.newPage(), allowance: null, gets: new Set() };
      tables.push(table);
      table.page.setDefaultTimeout(30000);
      table.page.on("pageerror", (error) => proof.errors.push({ engine, gameId: seat.gameId, kind: "pageerror", message: redact(error.message) }));
      table.page.on("console", (message) => {
        if (message.type() === "error")
          proof.errors.push({ engine, gameId: seat.gameId, kind: "console", message: redact(message.text()) });
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
      await table.page.goto(`${base.origin}/${seat.tableHash}`);
    }
    assert.equal(new Set(contexts).size, 3, "Three isolated browser seat contexts.");
    for (const table of tables) {
      const { seat, page } = table,
        prefix = `${engine}-${event.scenarioId}-group-${seat.ordinal}`,
        before = await readAll(), expected = before.get(seat.id).state,
        pendingProjection = await pending(page, expected);
      await frames(page);
      await page.screenshot({ path: resolve(output, `${prefix}-pending-desktop.png`), fullPage: true });
      const pendingLayout = await mobile(page, `${prefix}-pending-mobile.png`);
      await page.reload();
      assert.equal(new URL(page.url()).hash, seat.tableHash, "Reload preserves the selected game and seat.");
      assert.deepEqual(await pending(page, expected), pendingProjection, "Unanswered native decision survives reload.");
      unchanged(before, await readAll());
      assert.equal(table.allowance, null);
      await page.setViewportSize({ width: 1440, height: 1050 });
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
      await page.screenshot({ path: resolve(output, `${prefix}-answered-desktop.png`), fullPage: true });
      const answeredLayout = await mobile(page, `${prefix}-answered-mobile.png`);
      await page.reload();
      assert.equal(new URL(page.url()).hash, seat.tableHash);
      assert.deepEqual(await pending(page, actual), answeredProjection, "Answered native resource/action state survives reload.");
      unchanged(after, await readAll());
      for (const path of ["/chronicle/play/card-definitions", "/chronicle/play/presentation"])
        assert.ok(table.gets.has(path), `Actual native UI loaded ${path}.`);
      assert.deepEqual(proof.errors, [], "No console errors or page errors.");
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
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
try {
  const seedBytes = await readFile(seedPath), seed = JSON.parse(seedBytes),
    manifestBytes = manifestPath ? await readFile(manifestPath) : null,
    manifest = manifestBytes ? JSON.parse(manifestBytes) : null,
    status = await get("/chronicle/status");
  proof.seedFileSha256 = sha(seedBytes);
  proof.manifest = manifest ? { path: manifestPath, sha256: sha(manifestBytes), binarySha256: manifest.binarySha256,
    extensionSourceSha256: manifest.extensionSourceSha256, extensions: manifest.extensions } : null;
  proof.runtime = { version: status.version, binarySha256: status.binarySha256,
    extensionSourceSha256: status.extensionSourceSha256, extensions: status.extensions };
  proof.runtimeStatusSha256 = digest(status);
  assert.equal(seed.mode, "table-seed");
  assert.equal(seed.prepared, true, "Only a successfully prepared fresh table seed may be used.");
  assert.deepEqual(seed.debugSeeds, [], "UI setup uses legitimate native setup answers.");
  assert.equal(status.ready, true);
  assert.match(status.binarySha256, /^[a-f0-9]{64}$/);
  assert.equal(status.binarySha256, seed.runtime.binarySha256);
  assert.equal(status.extensionSourceSha256, seed.runtime.extensionSourceSha256);
  if (manifest) {
    assert.equal(manifest.kind, "chronicle-derived");
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
    assert.equal(live.state.gameSha256, seat.snapshotSha256, "Live seed is still fresh before any browser action.");
    for (const key of ["playerId", "investigatorId", "phase", "scenarioSteps", "resources", "remainingActions"])
      assert.equal(live.state[key], seat.baseline[key], `Seed baseline ${key}`);
    proof.seedSnapshots.push({ gameId: seat.gameId, seatId: seat.id, path: seat.snapshotPath,
      fileSha256: sha(bytes), gameSha256: seat.snapshotSha256 });
  }
  await checkpoint();
  for (const [engine, launcher] of [["chromium", chromium], ["webkit", webkit]]) {
    const nativeBaseline = [...(await readAll()).values()].map((entry) => entry.state);
    const browser = await launcher.launch({ headless: true });
    const browserProof = { engine, version: browser.version(), nativeBaseline };
    proof.browsers.push(browserProof);
    try {
      for (const event of seed.events) await runEvent(browser, engine, event);
      browserProof.nativeFinal = [...(await readAll()).values()].map((entry) => entry.state);
      for (const before of nativeBaseline) {
        const after = browserProof.nativeFinal.find((entry) => entry.seatId === before.seatId);
        assert.equal(after.resources, before.resources + 1);
        assert.equal(after.remainingActions, before.remainingActions - 1);
      }
      await checkpoint();
    } finally {
      await browser.close();
    }
  }
  assert.equal(proof.checks.length, 12);
  assert.equal(proof.writes.length, 12);
  assert.deepEqual(proof.errors, []);
  assert.deepEqual(proof.blockedRequests, []);
  proof.finalSeats = [...(await readAll()).values()].map((entry) => entry.state);
  for (const seat of allSeats) {
    const final = proof.finalSeats.find((entry) => entry.seatId === seat.id);
    assert.equal(final.resources, seat.baseline.resources + 2);
    assert.equal(final.remainingActions, seat.baseline.remainingActions - 2);
  }
  proof.passed = true;
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
