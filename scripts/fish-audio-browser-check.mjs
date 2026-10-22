// Real production-browser audio checks with controlled Core checkpoints.
// These isolated fixtures do not certify a whole scenario or native runtime.
// Run: BASE_URL=http://127.0.0.1:5187 node --import tsx scripts/fish-audio-browser-check.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createGame, reduceGame } from "../tests/helpers.ts";

const base = new URL(process.env.BASE_URL || "http://127.0.0.1:5187/");
const out = process.env.QA_OUT || "output/fish-audio/browser";
const dist = process.env.DIST_DIR || "dist";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const paths = ["act", "agenda", "ending"].map(
  (kind) => `/audio/fish-${kind}.mp3`,
);
const report = {
  passed: false,
  startedAt: new Date().toISOString(),
  base: base.href,
  scope:
    "isolated Core presentation fixtures, actual UI/reducer/Web Audio and production PWA; not whole-scenario or native gameplay certification",
  checkerSha256: hash(await readFile(new URL(import.meta.url))),
  checks: [],
  audio: [],
  errors: [],
  expectedAudioFailures: [],
  requests: [],
};
await mkdir(out, { recursive: true });
const writeReport = () =>
  writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
await writeReport();
const browser = await chromium.launch({ headless: true });
let lastPage;
let fixtureNumber = 0;
const cleanups = new Set();

function ready() {
  const game = reduceGame(createGame("easy", 712), {
    type: "mulligan",
    ids: [],
  });
  game.id = `fish-audio-presentation-${++fixtureNumber}`;
  return game;
}
function decision(game, label, effects) {
  game.decision = {
    title: "Audio presentation fixture",
    description: "Controlled public checkpoint; not a scenario playthrough.",
    choices: [{ id: "go", label, effects }],
  };
  return game;
}
function agendaFixture() {
  const game = ready();
  game.agenda = 1;
  game.doom = 2;
  return decision(game, "Place 1 doom", [{ kind: "doom", amount: 1 }]);
}
function actFixture() {
  const game = ready();
  game.player.clues = 2;
  return reduceGame(
    decision(game, "Prepare round end", [
      { kind: "roundEnd", actor: "scenario" },
    ]),
    { type: "choose", id: "go" },
  );
}
function endingFixture() {
  return decision(ready(), "Close the authored audio case", [
    { kind: "finish", source: "saved" },
  ]);
}

// Instrument real browser objects rather than replacing audio with mock success.
// Decoded Fish buffers are distinct from the procedural noise's createBuffer.
function instrument({ fixture, effects, motion }) {
  if (!localStorage.getItem("fish-audio-fixture-initialized")) {
    localStorage.setItem("arkham-chronicle:tutorial", "done");
    localStorage.setItem("arkham-chronicle:motion", motion);
    if (effects) localStorage.setItem("arkham-chronicle:effects", "on");
    else localStorage.removeItem("arkham-chronicle:effects");
    localStorage.setItem("arkham-chronicle:ambience", "off");
    localStorage.setItem(
      "arkham-chronicle:spreading-flames:v1",
      JSON.stringify(fixture),
    );
    localStorage.setItem("fish-audio-fixture-initialized", "yes");
  }
  const qa = (window.fishAudioQa = {
    decoded: [],
    starts: [],
    stops: [],
    ended: [],
    requests: [],
    gains: [],
  });
  const decoded = new WeakMap();
  const inputs = new WeakMap();
  let next = 0;
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : String(input),
      location.href,
    );
    const isFish = /^\/audio\/fish-(act|agenda|ending)\.mp3$/.test(
      url.pathname,
    );
    if (isFish)
      qa.requests.push({ path: url.pathname, time: performance.now() });
    const response = await originalFetch.call(this, input, init);
    if (isFish) {
      const originalArrayBuffer = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => {
        const bytes = await originalArrayBuffer();
        inputs.set(bytes, url.pathname);
        return bytes;
      };
    }
    return response;
  };
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context)
    throw new Error("The real Chromium Web Audio API is unavailable");
  const originalDecode = Context.prototype.decodeAudioData;
  Context.prototype.decodeAudioData = function (bytes, success, failure) {
    const path = inputs.get(bytes) || "decoded-audio";
    const keep = (buffer) => {
      if (!decoded.has(buffer)) {
        const row = {
          id: ++next,
          path,
          duration: buffer.duration,
          channels: buffer.numberOfChannels,
          sampleRate: buffer.sampleRate,
        };
        decoded.set(buffer, row);
        qa.decoded.push(row);
      }
      return buffer;
    };
    // The application uses the Promise API. Preserve the callback overload too.
    return originalDecode
      .call(
        this,
        bytes,
        success ? (buffer) => success(keep(buffer)) : undefined,
        failure,
      )
      .then(keep);
  };
  const originalStart = AudioBufferSourceNode.prototype.start;
  const originalStop = AudioBufferSourceNode.prototype.stop;
  const voices = new WeakMap();
  AudioBufferSourceNode.prototype.start = function (...args) {
    const result = originalStart.apply(this, args);
    const buffer = decoded.get(this.buffer);
    if (buffer) {
      const row = {
        ...buffer,
        voice: ++next,
        time: performance.now(),
        contextTime: this.context.currentTime,
        contextState: this.context.state,
        loop: this.loop,
      };
      voices.set(this, row);
      qa.starts.push(row);
      this.addEventListener("ended", () =>
        qa.ended.push({ voice: row.voice, time: performance.now() }),
      );
    }
    return result;
  };
  AudioBufferSourceNode.prototype.stop = function (...args) {
    const row = voices.get(this);
    if (row)
      qa.stops.push({
        voice: row.voice,
        time: performance.now(),
        contextTime: this.context.currentTime,
      });
    return originalStop.apply(this, args);
  };
  const originalConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (...args) {
    if (
      this instanceof GainNode &&
      args[0] === this.context.destination &&
      !qa.gains.includes(this.gain)
    ) {
      qa.gains.push(this.gain);
      Object.defineProperty(qa, "audioContext", {
        configurable: true,
        value: this.context,
      });
    }
    return originalConnect.apply(this, args);
  };
}

async function context(
  fixture,
  {
    effects = false,
    motion = "off",
    width = 390,
    worker = false,
    expectedFailure = false,
  } = {},
) {
  const ctx = await browser.newContext({
    viewport: { width, height: 960 },
    serviceWorkers: worker ? "allow" : "block",
  });
  cleanups.add(ctx);
  await ctx.addInitScript(instrument, { fixture, effects, motion });
  const page = await ctx.newPage();
  lastPage = page;
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const row = { text: message.text(), url: message.location().url };
    if (expectedFailure && paths.some((path) => row.url.endsWith(path)))
      report.expectedAudioFailures.push(row);
    else report.errors.push(row);
  });
  ctx.on("request", (request) => {
    if (/^https?:/.test(request.url()))
      report.requests.push({
        url: request.url(),
        method: request.method(),
        worker: !!request.serviceWorker(),
      });
  });
  return { ctx, page };
}
async function close(ctx) {
  cleanups.delete(ctx);
  await ctx.close();
}
async function within(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function openCore(page, fixture, { effects = false, volume } = {}) {
  const response = await page.goto(base.href);
  assert.equal(response.status(), 200);
  assert.equal(
    hash(await response.body()),
    report.build.indexSha256,
    "browser serves the exact reviewed production HTML",
  );
  // Real settings are reachable from home before a fixture's game decision
  // opens its deliberately modal choice. Opt in through that actual UI.
  if (effects) {
    await enable(page);
    if (volume !== undefined) {
      await settings(page);
      await setVolume(
        page.getByRole("slider", { name: "Sound volume", exact: true }),
        volume,
      );
      await closeSettings(page);
    }
  }
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
  await page
    .getByText("Autosaved", { exact: true })
    .or(
      page.getByText("Your campaign record is saved on this device.", {
        exact: true,
      }),
    )
    .waitFor({ state: "attached" });
}
async function save(page) {
  await page
    .getByText("Autosaved", { exact: true })
    .or(
      page.getByText("Your campaign record is saved on this device.", {
        exact: true,
      }),
    )
    .waitFor({ state: "attached" });
  return page.evaluate(() => {
    const id = JSON.parse(
      localStorage.getItem("arkham-chronicle:saves") || "{}",
    ).active;
    return JSON.parse(localStorage.getItem(`arkham-chronicle:save:${id}`));
  });
}
async function state(page) {
  return page.evaluate(() => ({
    ...window.fishAudioQa,
    gains: window.fishAudioQa.gains.map((gain) => gain.value),
  }));
}
async function viewTable(page) {
  const paused = page.getByRole("button", {
    name: "View table · keep paused",
    exact: true,
  });
  if (await paused.isVisible()) await paused.click();
}
async function settings(page) {
  await viewTable(page);
  await page
    .getByRole("button", { name: "Settings & saves", exact: true })
    .click();
}
async function closeSettings(page) {
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
}
async function enable(page) {
  await settings(page);
  await page
    .getByRole("button", { name: "Sound effects: off", exact: true })
    .click();
  await closeSettings(page);
}
async function setVolume(range, value) {
  // input[type=range] is not fillable. Use a real pointer and native arrow
  // adjustments so React receives the same events as the player's control.
  const box = await range.boundingBox();
  assert.ok(box && box.width > 20);
  await range.click({
    position: { x: 8 + ((box.width - 16) * value) / 100, y: box.height / 2 },
  });
  const initial = Number(await range.inputValue());
  assert.ok(
    Math.abs(initial - value) <= 5,
    "range pointer reaches the requested volume neighborhood",
  );
  for (let n = Math.abs(initial - value); n > 0; n--)
    await range.press(initial < value ? "ArrowRight" : "ArrowLeft");
  assert.equal(await range.inputValue(), String(value));
}
async function trigger(page, kind) {
  await page
    .getByRole("button", {
      name:
        kind === "act"
          ? "Spend clues & advance"
          : kind === "agenda"
            ? "Place 1 doom"
            : "Close the authored audio case",
      exact: true,
    })
    .click();
  for (let n = 0; n < 20; n++) {
    const game = await save(page);
    if (
      kind === "act"
        ? game.act === 2
        : kind === "agenda"
          ? game.agenda === 2
          : game.status === "resolution"
    )
      return game;
    assert.ok(
      game.event,
      "native Core checkpoint must precede expected milestone",
    );
    await page
      .getByRole("button", { name: "Continue game", exact: true })
      .click();
  }
  throw new Error(`Core ${kind} transition did not complete`);
}
async function waitVoice(page, path) {
  await page.waitForFunction(
    (path) => window.fishAudioQa.starts.some((row) => row.path === path),
    path,
  );
  const row = (await state(page)).starts.find((row) => row.path === path);
  assert.ok(
    row.duration > 0 && row.duration < 10,
    "actual decoded finite Fish clip",
  );
  assert.equal(row.contextState, "running");
  assert.equal(row.loop, false);
  report.audio.push(row);
  return row;
}
async function settledUnchanged(page, before, ms = 250) {
  await page.waitForTimeout(ms);
  assert.deepEqual(
    await save(page),
    before,
    "presentation preferences and playback never modify any game field",
  );
}
async function screenshot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
async function clearPublicCheckpoints(page) {
  for (let n = 0; n < 20; n++) {
    const current = await save(page);
    if (current.event)
      await page
        .getByRole("button", { name: "Continue game", exact: true })
        .click();
    else if (current.window)
      await page
        .getByRole("button", { name: "Pass Fast window", exact: true })
        .click();
    else return current;
  }
  throw new Error("Controlled public checkpoints did not settle");
}

try {
  report.build = {
    indexSha256: hash(await readFile(`${dist}/index.html`)),
    workerSha256: hash(await readFile(`${dist}/sw.js`)),
  };
  report.assets = await Promise.all(
    paths.map(async (path) => {
      const bytes = await readFile(`${dist}${path}`);
      return { path, bytes: bytes.length, sha256: hash(bytes) };
    }),
  );

  {
    const fixture = agendaFixture();
    const { ctx, page } = await context(fixture);
    await openCore(page, fixture);
    assert.deepEqual(
      (await state(page)).requests,
      [],
      "initial hydration makes no Fish fetch",
    );
    const advanced = await trigger(page, "agenda");
    assert.equal(advanced.agenda, 2);
    assert.deepEqual(
      (await state(page)).requests,
      [],
      "off-by-default milestone does not fetch audio",
    );
    assert.deepEqual((await state(page)).starts, []);
    await enable(page);
    await settledUnchanged(page, advanced);
    assert.deepEqual(
      (await state(page)).starts,
      [],
      "opting in after a milestone never replays it",
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Continue investigation", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("arkham-chronicle:effects"),
      ),
      "on",
      "the real opt-in survives reload",
    );
    await settings(page);
    assert.equal(
      await page
        .getByRole("button", { name: "Sound effects: on", exact: true })
        .count(),
      1,
    );
    await closeSettings(page);
    assert.deepEqual(
      (await state(page)).starts,
      [],
      "hydration of advanced save remains silent",
    );
    report.checks.push(
      "Effects are off by default: hydration and an actual agenda advance make no audio fetch or playback; enabling later and reload never replay the observed transition.",
    );
    await close(ctx);
  }

  {
    const fixture = actFixture();
    const { ctx, page } = await context(fixture);
    await openCore(page, fixture, { effects: true, volume: 25 });
    const original = await save(page);
    await page.waitForFunction(
      () => Math.abs(window.fishAudioQa.gains[0].value - 0.225) < 0.005,
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("arkham-chronicle:volume"),
      ),
      "0.25",
    );
    assert.deepEqual(await save(page), original);
    const advanced = await trigger(page, "act");
    const voice = await waitVoice(page, "/audio/fish-act.mp3");
    assert.equal(
      await page.locator(".milestone-notice").count(),
      0,
      "visual motion Off does not suppress sound",
    );
    assert.equal(
      (await state(page)).starts.length,
      1,
      "one voice for one actual milestone",
    );
    await settings(page);
    const mute = page.getByRole("button", {
      name: "Mute all audio",
      exact: true,
    });
    assert.ok(
      !(await state(page)).ended.some((row) => row.voice === voice.voice),
      "the finite voice is still playing before the mute gesture",
    );
    await mute.click();
    await page.waitForFunction(
      (voice) => window.fishAudioQa.stops.some((row) => row.voice === voice),
      voice.voice,
    );
    assert.equal(await mute.getAttribute("aria-pressed"), "true");
    assert.ok(
      (await state(page)).gains.every((gain) => gain === 0),
      "master mute zeroes the actual destination gain",
    );
    const muted = await state(page);
    await mute.click();
    await page.waitForTimeout(150);
    assert.equal(
      (await state(page)).starts.length,
      muted.starts.length,
      "unmuting never replays a canceled voice",
    );
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 960 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${width}px settings must not overflow`,
      );
      await screenshot(page, `settings-${width}`);
    }
    await closeSettings(page);
    await settledUnchanged(page, advanced);
    if (advanced.event)
      await page
        .getByRole("button", { name: "Continue game", exact: true })
        .click();
    await page.waitForTimeout(100);
    assert.equal(
      (await state(page)).starts.length,
      1,
      "routine continuation does not replay act sound",
    );
    report.checks.push(
      "An actual clue-payment act transition decodes and starts the local Fish MP3 once with motion Off; real master volume and mute apply immediately, cancel playback, persist and never change the save or replay on unmute.",
    );
    report.checks.push(
      "Sound controls remain accessible and within 390px/320px settings layouts, with screenshots retained.",
    );
    await close(ctx);
  }

  {
    const fixture = ready();
    const { ctx, page } = await context(fixture);
    await openCore(page, fixture, { effects: true });
    const original = await save(page);
    await page.getByRole("button", { name: "Resource", exact: true }).click();
    await clearPublicCheckpoints(page);
    await page
      .getByRole("button", { name: "Undo last action", exact: true })
      .click();
    const undone = await save(page);
    assert.equal(undone.player.resources, original.player.resources);
    assert.equal(undone.player.actionsTaken, original.player.actionsTaken);
    assert.deepEqual(
      (await state(page)).starts,
      [],
      "routine actions and actual undo never start a Fish cue",
    );
    await page.getByRole("button", { name: "Campaigns", exact: true }).click();
    await page
      .getByRole("button", { name: "Continue investigation", exact: true })
      .click();
    assert.deepEqual(
      (await state(page)).starts,
      [],
      "leaving and reopening a scope does not replay",
    );
    report.checks.push(
      "Actual routine resource action, Undo and leaving/reopening an investigation stay silent for Fish cues.",
    );
    await close(ctx);
  }

  {
    // Advancing an act itself crosses an Undo barrier. Hold its audio while a
    // subsequent legal, public resource action is taken and genuinely undone.
    // The voice must be canceled by this actual rewind before its fetch ends.
    const fixture = decision(ready(), "Advance the authored audio act", [
      { kind: "advanceAct" },
    ]);
    const { ctx, page } = await context(fixture);
    let release;
    let noteIntercepted;
    const gated = new Promise((resolve) => {
      release = resolve;
    });
    const intercepted = new Promise((resolve) => {
      noteIntercepted = resolve;
    });
    await page.route("**/audio/fish-act.mp3", async (route) => {
      noteIntercepted();
      await gated;
      try {
        await route.continue();
      } catch {
        /* The actual Undo may already have aborted it. */
      }
    });
    await openCore(page, fixture, { effects: true });
    await page
      .getByRole("button", {
        name: "Advance the authored audio act",
        exact: true,
      })
      .click();
    assert.equal((await save(page)).act, 2);
    await within(intercepted, "Actual delayed act request");
    const beforeResource = await clearPublicCheckpoints(page);
    await page.getByRole("button", { name: "Resource", exact: true }).click();
    await clearPublicCheckpoints(page);
    const afterResource = await save(page);
    assert.equal(
      afterResource.player.resources,
      beforeResource.player.resources + 1,
    );
    assert.equal(
      afterResource.player.actionsTaken,
      beforeResource.player.actionsTaken + 1,
    );
    const undo = page.getByRole("button", {
      name: "Undo last action",
      exact: true,
    });
    assert.equal(
      await undo.isEnabled(),
      true,
      "the actual public resource action is legitimately undoable",
    );
    await undo.click();
    const restored = await save(page);
    assert.deepEqual(
      restored,
      beforeResource,
      "actual Undo restores the complete pre-action Core state",
    );
    assert.ok(
      restored.eventSerial < afterResource.eventSerial,
      "the real reducer cursor rewinds",
    );
    release();
    await page.waitForTimeout(500);
    assert.deepEqual(
      (await state(page)).starts,
      [],
      "the delayed act fetch cannot play after actual Undo",
    );
    assert.deepEqual(await save(page), restored);
    report.checks.push(
      "A genuinely delayed act audio fetch is canceled by a subsequent legal Core resource-action Undo: complete state/cursor restores before release and no late Fish voice starts.",
    );
    await close(ctx);
  }

  {
    const fixture = agendaFixture();
    const { ctx, page } = await context(fixture);
    let release;
    const gated = new Promise((resolve) => {
      release = resolve;
    });
    let intercepted = 0;
    await page.route("**/audio/fish-agenda.mp3", async (route) => {
      intercepted++;
      await gated;
      try {
        await route.continue();
      } catch {
        /* An intentionally canceled request may already be gone. */
      }
    });
    await openCore(page, fixture, { effects: true });
    const advanced = await trigger(page, "agenda");
    await page.waitForFunction(() =>
      window.fishAudioQa.requests.some(
        (row) => row.path === "/audio/fish-agenda.mp3",
      ),
    );
    assert.equal(intercepted, 1, "the actual audio fetch is held in flight");
    await settings(page);
    await page
      .getByRole("button", { name: "Mute all audio", exact: true })
      .click();
    release();
    await page.waitForTimeout(500);
    assert.deepEqual(
      (await state(page)).starts,
      [],
      "late fetch/decode cannot start after mute",
    );
    await page
      .getByRole("button", { name: "Mute all audio", exact: true })
      .click();
    await closeSettings(page);
    await settledUnchanged(page, advanced, 250);
    assert.deepEqual(
      (await state(page)).starts,
      [],
      "unmute cannot resurrect a canceled pending cue",
    );
    report.checks.push(
      "Muting during a genuinely delayed Fish fetch prevents every late decode/playback and unmute never resurrects it; the current game is unchanged.",
    );
    await close(ctx);
  }

  {
    const fixture = agendaFixture();
    const { ctx, page } = await context(fixture, { expectedFailure: true });
    let failed = 0;
    await page.route("**/audio/fish-agenda.mp3", async (route) => {
      failed++;
      await route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "Authored QA audio failure",
      });
    });
    await openCore(page, fixture, { effects: true });
    const advanced = await trigger(page, "agenda");
    await page.waitForFunction(() =>
      window.fishAudioQa.requests.some(
        (row) => row.path === "/audio/fish-agenda.mp3",
      ),
    );
    await page.waitForTimeout(200);
    assert.equal(failed, 1);
    assert.deepEqual((await state(page)).starts, []);
    await settledUnchanged(page, advanced);
    assert.ok(
      await page
        .getByRole("button", { name: "Continue game", exact: true })
        .isEnabled(),
      "audio failure does not disable actual checkpoint control",
    );
    await page
      .getByRole("button", { name: "Continue game", exact: true })
      .click();
    report.checks.push(
      "A real injected HTTP503 for the Fish clip remains a silent presentation failure: no voice, no save mutation or page exception and the actual Continue control works.",
    );
    await close(ctx);
  }

  {
    const fixture = agendaFixture();
    const { ctx, page } = await context(fixture);
    await openCore(page, fixture, { effects: true });
    await page.evaluate(async () => {
      const qa = window.fishAudioQa;
      const context = qa.audioContext;
      await context.suspend();
      const resume = context.resume;
      context.resume = () =>
        Promise.reject(
          new DOMException("Authored autoplay-denial fault", "NotAllowedError"),
        );
      Object.defineProperty(qa, "restoreAudioResume", {
        value: () => {
          context.resume = resume;
          return context.resume();
        },
      });
    });
    const advanced = await trigger(page, "agenda");
    assert.deepEqual(
      (await state(page)).starts,
      [],
      "suspended browser audio must not play or queue a voice",
    );
    assert.deepEqual(
      (await state(page)).requests,
      [],
      "autoplay denial is checked before fetching a Fish clip",
    );
    await page.evaluate(() => window.fishAudioQa.restoreAudioResume());
    await settledUnchanged(page, advanced, 200);
    assert.deepEqual(
      (await state(page)).starts,
      [],
      "a later successful resume does not replay the old event",
    );
    report.checks.push(
      "A real suspended AudioContext with injected NotAllowedError resume failures leaves the actual agenda checkpoint usable, emits no unhandled error/audio fetch, and never queues a voice for later resume.",
    );
    await close(ctx);
  }

  {
    const fixture = agendaFixture();
    const { ctx, page } = await context(fixture);
    await openCore(page, fixture, { effects: true });
    const advanced = await trigger(page, "agenda");
    const voice = await waitVoice(page, "/audio/fish-agenda.mp3");
    await viewTable(page);
    await page.getByRole("button", { name: "Campaigns", exact: true }).click();
    await page.waitForFunction(
      (voice) => window.fishAudioQa.stops.some((row) => row.voice === voice),
      voice.voice,
    );
    await page
      .getByRole("button", { name: "Continue investigation", exact: true })
      .click();
    await settledUnchanged(page, advanced, 100);
    assert.equal(
      (await state(page)).starts.length,
      1,
      "reentering a table cannot replay the canceled cue",
    );
    report.checks.push(
      "Leaving the actual table stops the current agenda voice; reopening preserves every save field and never replays it.",
    );
    await close(ctx);
  }

  {
    const fixture = endingFixture();
    const { ctx, page } = await context(fixture, { worker: true });
    await openCore(page, fixture);
    await page.evaluate(() =>
      Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error("Production service worker activation timed out"),
              ),
            20000,
          ),
        ),
      ]),
    );
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, {
      timeout: 30000,
    });
    // Card art is cached on first use, separately from MP3 precaching. Reopen
    // this fixture online under the worker, so the later offline test asks
    // only for artwork the player has actually viewed and cached.
    await page
      .getByRole("button", { name: "Continue investigation", exact: true })
      .click();
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() =>
      [...document.images].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    );
    const viewedArt = await page.evaluate(async () =>
      Promise.all(
        [...new Set([...document.images].map((image) => image.currentSrc))].map(
          async (url) => {
            let response;
            const expected = new URL(url);
            for (const name of await caches.keys()) {
              const cache = await caches.open(name);
              const request = (await cache.keys()).find((request) => {
                const cached = new URL(request.url);
                return (
                  cached.origin === expected.origin &&
                  cached.pathname === expected.pathname
                );
              });
              if (request) {
                response = await cache.match(request);
                break;
              }
            }
            return {
              url,
              status: response?.status,
              bytes: response ? (await response.arrayBuffer()).byteLength : 0,
            };
          },
        ),
      ),
    );
    report.viewedArt = viewedArt;
    assert.ok(viewedArt.length > 0);
    assert.ok(
      viewedArt.every((entry) => entry.status === 200 && entry.bytes > 0),
      "every viewed art response is genuinely cached before going offline",
    );
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    assert.deepEqual(
      (await state(page)).starts,
      [],
      "PWA precache never plays audio",
    );
    const cached = await page.evaluate(
      async (paths) =>
        Promise.all(
          paths.map(async (path) => {
            let response;
            for (const name of await caches.keys()) {
              const cache = await caches.open(name);
              const request = (await cache.keys()).find(
                (request) => new URL(request.url).pathname === path,
              );
              if (request) {
                response = await cache.match(request);
                break;
              }
            }
            if (!response) return { path, missing: true };
            const bytes = await response.arrayBuffer();
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            return {
              path,
              status: response.status,
              bytes: bytes.byteLength,
              sha256: [...new Uint8Array(digest)]
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(""),
            };
          }),
        ),
      paths,
    );
    for (const expected of report.assets) {
      const actual = cached.find((row) => row.path === expected.path);
      assert.deepEqual(
        actual,
        { ...expected, status: 200 },
        "all unused Fish assets are byte-identical in the actual production cache",
      );
    }
    report.cachedAudio = cached;
    await ctx.setOffline(true);
    report.offlineAudio = await page.evaluate(
      async (paths) =>
        Promise.all(
          paths.map(async (path) => {
            const response = await fetch(path, { cache: "no-store" });
            const bytes = await response.arrayBuffer();
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            return {
              path,
              status: response.status,
              bytes: bytes.byteLength,
              sha256: [...new Uint8Array(digest)]
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(""),
            };
          }),
        ),
      paths,
    );
    assert.deepEqual(
      report.offlineAudio,
      cached,
      "ordinary offline fetch receives exact production MP3s through the worker",
    );
    await enable(page);
    await page
      .getByRole("button", { name: "Continue investigation", exact: true })
      .click();
    const ending = await trigger(page, "ending");
    await waitVoice(page, "/audio/fish-ending.mp3");
    assert.equal(ending.status, "resolution");
    assert.equal(ending.campaign.result, "saved");
    await screenshot(page, "offline-ending");
    await settledUnchanged(page, ending, 350);
    await page.reload();
    await page
      .getByRole("button", { name: "Open campaign record", exact: true })
      .click();
    assert.deepEqual(
      (await state(page)).starts,
      [],
      "offline reload of the ending never repeats its audio",
    );
    assert.deepEqual(await save(page), ending);
    report.checks.push(
      "A fresh real production PWA precaches all three unused MP3s with exact SHA256/length; offline fetch, first ending decode/playback and silent saved-ending reload work without modifying game state.",
    );
    await close(ctx);
  }

  assert.deepEqual(
    report.errors,
    [],
    "no unclassified console or browser errors",
  );
  assert.deepEqual(
    report.requests.filter((row) => new URL(row.url).origin !== base.origin),
    [],
    "all app and service-worker audio stays local; no Fish API or generated remote URL in player flow",
  );
  assert.deepEqual(
    report.requests.filter(
      (row) => !["GET", "HEAD", "OPTIONS"].includes(row.method),
    ),
    [],
    "audio checks submit no network mutations",
  );
  assert.equal(
    hash(await readFile(`${dist}/index.html`)),
    report.build.indexSha256,
    "the verified production build did not change",
  );
  assert.equal(
    hash(await readFile(`${dist}/sw.js`)),
    report.build.workerSha256,
  );
  report.passed = true;
} catch (error) {
  report.error = error.stack || error.message;
  if (lastPage && !lastPage.isClosed())
    await screenshot(lastPage, "failure").catch(() => {});
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeReport();
  await Promise.allSettled([...cleanups].map((ctx) => ctx.close()));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
