// Run with: npx tsx scripts/milestone-offline-check.mjs
// Controlled Core presentation fixture + real UI/reducer action. This does not
// play a whole scenario, certify a native ending, or touch an existing save.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createGame, reduceGame } from "../tests/helpers.ts";

const base = new URL(process.env.BASE_URL || "http://127.0.0.1:5191/");
const out = process.env.QA_OUT || "output/milestone-motion/offline";
const dist = process.env.DIST_DIR || "dist";
const checks = [];
const errors = [];
const failedRequests = [];
const externalRequests = [];
const pageRequests = [];
const parsedScripts = [];
const badPageResponses = [];
let offline = false;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const clips = [
  "act-reveal.webm",
  "act-reveal.mp4",
  "agenda-omen.webm",
  "agenda-omen.mp4",
];
const startedAt = new Date().toISOString();
const report = {
  passed: false,
  startedAt,
  base: base.href,
  scope:
    "fresh production PWA, isolated Core presentation fixture, actual UI ending action; not native or whole-scenario certification",
  checkerSha256: hash(await readFile(new URL(import.meta.url))),
  checks,
  clips: [],
};
await mkdir(out, { recursive: true });
const reportPath = `${out}/report.json`;
const writeReport = () =>
  writeFile(reportPath, JSON.stringify(report, null, 2));
await writeReport();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
  serviceWorkers: "allow",
});
try {
  const html = await readFile(`${dist}/index.html`);
  report.build = {
    indexSha256: hash(html),
    serviceWorkerSha256: hash(await readFile(`${dist}/sw.js`)),
  };
  assert.equal(
    hash(Buffer.from(await (await fetch(base)).arrayBuffer())),
    hash(html),
    "preview serves the exact local production build",
  );
  const assetNames = await readdir(`${dist}/assets`);
  const lazyAssets = assetNames.filter((name) =>
    /^(?:ResolutionPlayer|milestone-remotion)-.*\.js$/.test(name),
  );
  assert.equal(
    lazyAssets.length,
    2,
    "one lazy Player and one isolated Remotion runtime chunk",
  );
  assert.ok(
    !html.toString().includes("milestone-remotion-"),
    "initial HTML does not preload the Remotion module",
  );
  report.build.lazyAssets = await Promise.all(
    lazyAssets.map(async (name) => {
      const bytes = await readFile(`${dist}/assets/${name}`);
      return {
        path: `/assets/${name}`,
        bytes: bytes.length,
        sha256: hash(bytes),
      };
    }),
  );

  const fixture = reduceGame(createGame("easy", 712), {
    type: "mulligan",
    ids: [],
  });
  fixture.id = "milestone-offline-presentation";
  fixture.decision = {
    title: "Offline presentation fixture",
    description:
      "Controlled public checkpoint; this is not a scenario playthrough.",
    choices: [
      {
        id: "go",
        label: "Close the authored offline case",
        effects: [{ kind: "finish", source: "saved" }],
      },
    ],
  };
  await ctx.addInitScript((fixture) => {
    localStorage.setItem("arkham-chronicle:motion", "full");
    localStorage.setItem("arkham-chronicle:tutorial", "done");
    if (!localStorage.getItem("milestone-offline-fixture-initialized")) {
      localStorage.setItem(
        "arkham-chronicle:spreading-flames:v1",
        JSON.stringify(fixture),
      );
      localStorage.setItem("milestone-offline-fixture-initialized", "yes");
    }
  }, fixture);
  ctx.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== base.origin
    )
      externalRequests.push(request.url());
  });
  ctx.on("requestfailed", (request) =>
    failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText,
      fromServiceWorker: !!request.serviceWorker(),
      offline,
    }),
  );
  const page = await ctx.newPage();
  page.on("request", (request) =>
    pageRequests.push({
      url: request.url(),
      resourceType: request.resourceType(),
    }),
  );
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      badPageResponses.push({ url: response.url(), status: response.status() });
  });
  await page.goto(base.href);
  console.log("Production page loaded; waiting for worker activation.");
  // Prompt-update workers intentionally do not claim an already open table.
  // A fresh registration activates first; the next navigation is controlled.
  await page.evaluate(() =>
    Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error("Production worker did not activate within 15 seconds"),
            ),
          15000,
        ),
      ),
    ]),
  );
  console.log("Worker activated; reloading under its controller.");
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, {
    timeout: 45000,
  });
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      controller: navigator.serviceWorker.controller?.scriptURL,
      active: registration?.active?.scriptURL,
      activeState: registration?.active?.state,
      caches: await caches.keys(),
    };
  });
  assert.equal(worker.activeState, "activated");
  assert.equal(worker.controller, new URL("sw.js", base).href);
  assert.equal(worker.active, worker.controller);
  report.serviceWorker = worker;
  checks.push(
    "Fresh browser installs the actual production service worker, activates it, and reloads under its controller.",
  );

  await page
    .getByRole("button", { name: "Continue investigation", exact: true })
    .click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  assert.equal(
    await page.locator(".milestone-notice").count(),
    0,
    "save hydration is silent",
  );
  assert.equal(await page.locator(".milestone-art-layer").count(), 0);
  // Attach after installation and the controlled reload. Enabling emits the
  // page's existing parsed-script inventory and observes later lazy imports.
  const debuggerSession = await ctx.newCDPSession(page);
  debuggerSession.on("Debugger.scriptParsed", (event) =>
    parsedScripts.push(event.url),
  );
  await debuggerSession.send("Debugger.enable");
  const initialResources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => ({
      url: entry.name,
      initiatorType: entry.initiatorType,
    })),
  );
  const isRemotion = (url) =>
    lazyAssets.some(
      (name) => new URL(url, base).pathname === `/assets/${name}`,
    );
  assert.equal(
    parsedScripts.filter(isRemotion).length,
    0,
    "no Player/Remotion module was parsed or executed in the initial page",
  );
  assert.equal(
    initialResources.filter((entry) => isRemotion(entry.url)).length,
    0,
    "initial window performance contains no eager Player/Remotion fetch",
  );
  assert.equal(
    pageRequests.filter((request) => isRemotion(request.url)).length,
    0,
    "initial page never requested the lazy modules; worker precaching is allowed",
  );
  report.initialRemotion = {
    parsedScripts: [],
    pageRequests: [],
    resources: [],
  };
  checks.push(
    "Initial home and Core save load parse, fetch, and execute no lazy Player or Remotion module; service-worker prefetch stays separate.",
  );

  const cached = await page.evaluate(
    async (paths) => {
      const results = [];
      for (const path of paths) {
        let found;
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          const request = (await cache.keys()).find(
            (request) => new URL(request.url).pathname === path,
          );
          if (!request) continue;
          const response = await cache.match(request);
          const buffer = await response.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", buffer);
          found = {
            path,
            cache: name,
            status: response.status,
            bytes: buffer.byteLength,
            sha256: Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join(""),
          };
          break;
        }
        results.push(found || { path, missing: true });
      }
      return results;
    },
    [
      ...clips.map((name) => `/motion/${name}`),
      ...report.build.lazyAssets.map((asset) => asset.path),
    ],
  );
  for (const clip of clips) {
    const bytes = await readFile(`${dist}/motion/${clip}`);
    const entry = cached.find((entry) => entry.path === `/motion/${clip}`);
    assert.equal(entry.status, 200, `${clip} is precached`);
    assert.equal(entry.bytes, bytes.length);
    assert.equal(
      entry.sha256,
      hash(bytes),
      `${clip} cache holds the exact production bytes`,
    );
    report.clips.push({
      name: clip,
      bytes: bytes.length,
      sha256: hash(bytes),
      cache: entry.cache,
    });
  }
  for (const asset of report.build.lazyAssets) {
    const entry = cached.find((entry) => entry.path === asset.path);
    assert.equal(
      entry.sha256,
      asset.sha256,
      "unused lazy module is already available in the offline cache",
    );
  }
  checks.push(
    "All four final WebM/MP4 clips and both unexecuted lazy modules are precached with byte length and SHA-256 matching the local production build.",
  );

  offline = true;
  await ctx.setOffline(true);
  report.offlineClips = await page.evaluate(
    async (paths) =>
      Promise.all(
        paths.map(async (path) => {
          const response = await fetch(path, { cache: "no-store" });
          const buffer = await response.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", buffer);
          return {
            path,
            status: response.status,
            bytes: buffer.byteLength,
            sha256: Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join(""),
          };
        }),
      ),
    clips.map((name) => `/motion/${name}`),
  );
  for (const clip of report.clips) {
    const response = report.offlineClips.find(
      (entry) => entry.path === `/motion/${clip.name}`,
    );
    assert.equal(response.status, 200);
    assert.equal(response.bytes, clip.bytes);
    assert.equal(response.sha256, clip.sha256);
  }
  checks.push(
    "With browser networking disabled, ordinary fetch retrieves every clip from the installed worker with exact production bytes and HTTP 200.",
  );

  await page
    .getByRole("button", {
      name: "Close the authored offline case",
      exact: true,
    })
    .click();
  const notice = page.locator('.milestone-notice[data-milestone="victory"]');
  await notice.waitFor();
  assert.equal(
    await notice.locator("strong").innerText(),
    "Objective complete",
  );
  const cueKey = await notice.getAttribute("data-milestone-key");
  await page.waitForFunction(
    (key) => {
      const layer = [...document.querySelectorAll(".milestone-art-layer")].find(
        (node) => node.dataset.milestoneKey === key,
      );
      const svg = layer?.querySelector("svg");
      return (
        svg &&
        svg.getBoundingClientRect().width > 100 &&
        Number(getComputedStyle(svg).opacity) > 0
      );
    },
    cueKey,
    { timeout: 1500 },
  );
  const art = page.locator(".milestone-art-layer");
  assert.equal(
    await art.count(),
    1,
    "one decorative layer for the current cue",
  );
  assert.equal(await art.getAttribute("data-milestone-key"), cueKey);
  assert.equal(await art.getAttribute("aria-hidden"), "true");
  assert.equal(
    await art.evaluate((node) => getComputedStyle(node).pointerEvents),
    "none",
  );
  report.remotionPaint = await art.locator("svg").evaluate((svg) => ({
    width: svg.getBoundingClientRect().width,
    opacity: getComputedStyle(svg).opacity,
  }));
  assert.equal(
    parsedScripts.filter(isRemotion).length,
    2,
    "both lazy modules are parsed only after the real ending UI action, while offline",
  );
  report.lazyModulesAfterEnding = [
    ...new Set(parsedScripts.filter(isRemotion)),
  ];
  assert.equal(
    await notice.evaluate((node) => getComputedStyle(node).pointerEvents),
    "none",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Return to the archive", exact: true })
      .isEnabled(),
    true,
  );
  // Capture a settled visible frame rather than the first translucent tick.
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/offline-ending.png` });
  const save = () =>
    page.evaluate(() => {
      const id = JSON.parse(
        localStorage.getItem("arkham-chronicle:saves"),
      ).active;
      return JSON.parse(localStorage.getItem(`arkham-chronicle:save:${id}`));
    });
  const ended = await save();
  assert.equal(ended.campaign.result, "saved");
  assert.equal(ended.status, "resolution");
  checks.push(
    "Actual Core UI/reducer ending works offline: lazy cached Player modules load for the first time, Remotion paints a visible frame, and the result control remains enabled.",
  );

  await page.evaluate(() => {
    document.documentElement.dataset.motion = "subtle";
  });
  await page.waitForFunction(
    () => !document.querySelector(".milestone-art-layer"),
  );
  assert.match(await notice.getAttribute("class"), /quiet/);
  assert.equal(
    await page.locator(".milestone-art-layer").count(),
    0,
    "quiet mode removes every decorative sibling",
  );
  assert.equal(await notice.locator("video,svg").count(), 0);
  assert.deepEqual(await save(), ended);
  checks.push(
    "An offline switch to Subtle removes the matched sibling artwork completely, keeps the accessible quiet notice, and leaves the ending save unchanged.",
  );

  await page.waitForTimeout(2400);
  assert.equal(await page.locator(".milestone-notice").count(), 0);
  assert.equal(await page.locator(".milestone-art-layer").count(), 0);
  assert.deepEqual(
    await save(),
    ended,
    "motion completion does not mutate the ending, rules, RNG, log, or save",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Open campaign record", exact: true })
    .click();
  assert.equal(
    await page.locator(".milestone-notice").count(),
    0,
    "offline reload never replays a saved ending",
  );
  assert.equal(
    await page.locator(".milestone-art-layer").count(),
    0,
    "silent offline reload creates no orphan artwork",
  );
  assert.deepEqual(await save(), ended);
  checks.push(
    "The finite cue disappears without changing the save; an offline app reload reopens the ending silently and preserves the exact game state.",
  );

  assert.deepEqual(
    externalRequests,
    [],
    "all app and worker requests remain same-origin",
  );
  // The established art cache uses StaleWhileRevalidate. Its cached response
  // succeeds offline while a worker-only refresh predictably fails. Preserve
  // those attempts explicitly; never classify a page, media or module failure
  // as this background case, and prove every fallback response is cached.
  const backgroundArtRevalidations = [];
  const unexpectedFailedRequests = [];
  for (const request of failedRequests) {
    const url = new URL(request.url);
    if (
      request.fromServiceWorker &&
      request.offline &&
      request.error === "net::ERR_INTERNET_DISCONNECTED" &&
      url.origin === base.origin &&
      url.pathname.startsWith("/art/")
    ) {
      const cached = await page.evaluate(async (url) => {
        const response = await caches.match(url);
        return (
          response && {
            status: response.status,
            bytes: (await response.arrayBuffer()).byteLength,
          }
        );
      }, request.url);
      if (cached?.status === 200 && cached.bytes > 0) {
        backgroundArtRevalidations.push({ ...request, cachedResponse: cached });
        continue;
      }
    }
    unexpectedFailedRequests.push(request);
  }
  report.backgroundArtRevalidations = backgroundArtRevalidations;
  report.unexpectedFailedRequests = unexpectedFailedRequests;
  report.displayedImages = await page.evaluate(() =>
    [...document.images].map((image) => ({
      src: image.currentSrc,
      complete: image.complete,
      width: image.naturalWidth,
    })),
  );
  assert.ok(
    report.displayedImages.every((image) => image.complete && image.width > 0),
    "every displayed cached image remains decoded offline",
  );
  assert.deepEqual(
    unexpectedFailedRequests,
    [],
    "cached offline flow has no failed page, media, module or unclassified worker request",
  );
  assert.deepEqual(
    badPageResponses,
    [],
    "every page response succeeds, including cached art fallbacks",
  );
  assert.deepEqual(errors, [], "no page or console error");
  assert.equal(
    hash(await readFile(`${dist}/index.html`)),
    report.build.indexSha256,
    "the tested production build was unchanged throughout",
  );
  assert.equal(
    hash(await readFile(`${dist}/sw.js`)),
    report.build.serviceWorkerSha256,
  );
  checks.push(
    "No external request, failed page/media/module request, page error, console error, or build change; expected worker-only art revalidations are disclosed with successful cached fallback evidence.",
  );
  Object.assign(report, {
    passed: true,
    finishedAt: new Date().toISOString(),
    errors,
    failedRequests,
    externalRequests,
  });
  await writeReport();
  console.log(
    JSON.stringify({ passed: true, checks: checks.length, reportPath }),
  );
} catch (error) {
  Object.assign(report, {
    passed: false,
    finishedAt: new Date().toISOString(),
    error: error.stack,
    errors,
    failedRequests,
    externalRequests,
    parsedScripts,
  });
  await writeReport();
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
