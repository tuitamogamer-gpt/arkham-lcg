// Original data-only inventory. No upstream source is executed or copied into
// the client. This report cannot unlock a runtime, certify installation, or
// turn registered card/reference definitions into verified gameplay.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCompanionOptions } from "./build-companion-options.mjs";
import { presentationRevision } from "./build-companion-presentation.mjs";
import { catalogCardCode } from "./rules-protocol.mjs";
import { verifyNativeQaManifest } from "./rules-qa-runtime-identity.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const unique = (values) => [...new Set(values)].sort();
const sourceDirectories = {
  Scenario: "Scenario/Scenarios",
  Asset: "Asset/Assets",
  Event: "Event/Events",
  Skill: "Skill/Cards",
  Investigator: "Investigator/Cards",
};

/** Match the discover tool's wrapped-signature convention, excluding commented
 * declarations and helper signatures. A declaration is source evidence only.
 */
export function declaredBuilders(text, kind) {
  const lines = [];
  for (const line of text.split(/\r?\n/)) {
    if (
      line.trimStart().startsWith("::") &&
      lines.length &&
      !lines.at(-1).trimStart().startsWith("::")
    )
      lines[lines.length - 1] += ` ${line.trimStart()}`;
    else lines.push(line);
  }
  const result = [];
  const signature =
    kind === "Scenario"
      ? /^\s*([a-z][\w']*)\s*::\s*Difficulty\s*->\s*([A-Z][A-Za-z0-9]*)\s*$/
      : new RegExp(`^\\s*([a-z][\\w']*)\\s*::\\s*${kind}Card(?:\\s+.*)?$`);
  for (let index = 0; index < lines.length; index++) {
    const match = signature.exec(lines[index]);
    if (!match) continue;
    // Only the literal in this builder's declaration/definition block is read.
    // Reference-card normalizations in allScenarioCards remain separate.
    let end = index + 1;
    while (
      end < lines.length &&
      !/^(?:instance\b|newtype\b|data\b|[a-z][\w']*\s*::)/.test(lines[end])
    )
      end++;
    const body = lines
      .slice(index + 1, end)
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    const code =
      kind === "Scenario"
        ? body.match(/"((?:\d{5}[a-z]?|:barkham:\d{3}))"/)?.[1]
        : undefined;
    result.push({ name: match[1], ...(code ? { code } : {}) });
  }
  return result;
}

export function catalogRegistryCoverage(cards, registry) {
  const visible = cards.filter(
    (card) => !card.miniature && !card.hidden && card.type_code !== "key",
  );
  if (!registry)
    return {
      visibleNonMiniNonKeyRecords: visible.length,
      capturedRegistryCodeMatches: null,
      capturedRegistryCodeMismatches: null,
      unmatchedPlayerDeckDefinitions: null,
    };
  if (
    !Array.isArray(registry.supportedCardCodes) ||
    registry.supportedCardCodes.some((code) => typeof code !== "string")
  )
    throw new Error(
      "The registry capture needs explicit supported card-code aliases.",
    );
  const aliases = new Set(registry.supportedCardCodes.map(catalogCardCode));
  const unmatched = visible.filter((card) => !aliases.has(card.code));
  return {
    visibleNonMiniNonKeyRecords: visible.length,
    capturedRegistryCodeMatches: visible.length - unmatched.length,
    capturedRegistryCodeMismatches: unmatched.length,
    unmatchedPlayerDeckDefinitions: unmatched.filter(
      (card) =>
        !card.encounter_code &&
        ["investigator", "asset", "event", "skill", "treachery"].includes(
          card.type_code,
        ),
    ).length,
  };
}

/** Validate the report's scope and identities. The map does not replay a game
 * and labels successful reports as reported completion, not certification.
 */
export function legalAttemptCoverage(report, identity, provenance) {
  const identityMatches =
    !!identity &&
    report.runtime?.binarySha256 === identity.binarySha256 &&
    report.runtime?.extensionSourceSha256 === identity.extensionSourceSha256;
  const legal =
    report.schema === 1 && report.mode === "native-scenario-legal-playthrough";
  const unassisted =
    report.nativeMessagesSubmitted === 0 &&
    report.coordinatorOperationsSubmitted === 0 &&
    report.rngOrClockEdits === 0;
  const winningEnd =
    report.scenario === "barkham" &&
    report.winningResolution === 1 &&
    report.observedNativeResolution === 1 &&
    report.nativeGameEnded === true &&
    report.milestones?.some(
      (milestone) =>
        milestone.name === "native-IsOver" &&
        milestone.bossVictory === true &&
        milestone.winningRead === true,
    );
  const completed =
    legal &&
    unassisted &&
    identityMatches &&
    winningEnd &&
    report.passed === true &&
    report.wholeScenarioCompleted === true &&
    report.setupOnly === false &&
    report.unrelatedSavesUnchanged === true;
  const needsCompletionReview =
    legal &&
    unassisted &&
    identityMatches &&
    report.scenario !== "barkham" &&
    report.passed === true &&
    report.wholeScenarioCompleted === true &&
    report.setupOnly === false &&
    report.unrelatedSavesUnchanged === true;
  return {
    provenance,
    scenario: typeof report.scenario === "string" ? report.scenario : "unknown",
    passed: legal && report.passed === true,
    reportedWholeScenarioCompleted:
      legal && report.wholeScenarioCompleted === true,
    wholeScenarioCompleted: completed,
    status:
      !legal || !unassisted
        ? "not-legal-proof"
        : completed
          ? "reported-complete"
          : needsCompletionReview
            ? "completion-unverified"
            : "incomplete",
    setupOnly: report.setupOnly === true,
    identityMatches,
    observedNativeResolution: Number.isSafeInteger(
      report.observedNativeResolution,
    )
      ? report.observedNativeResolution
      : null,
    nativeGameEnded: report.nativeGameEnded === true,
  };
}

export function focusedBehaviorCoverage(proof, verifiedManifest, provenance) {
  if (!proof || !verifiedManifest) return null;
  if (
    proof.scope !== "native-aggregate" ||
    proof.fullAggregate !== true ||
    proof.fullAggregateBehaviorTested !== true ||
    proof.behavior?.failures !== 0 ||
    !Number.isSafeInteger(proof.behavior?.examples) ||
    proof.behavior.examples < 1 ||
    proof.nativeEngineSha256 !== verifiedManifest.binarySha256 ||
    proof.extensionSourceSha256 !== verifiedManifest.extensionSourceSha256 ||
    proof.upstreamRevision !== presentationRevision ||
    proof.packaged !== false ||
    proof.installed !== false
  )
    throw new Error(
      "Focused native evidence must match the verified private aggregate; setup, declarations and dependency checks do not qualify.",
    );
  return {
    provenance,
    examples: proof.behavior.examples,
    failures: 0,
    platform: proof.platform,
    verifiedAt: proof.verifiedAt,
    binarySha256: proof.nativeEngineSha256,
    extensionSourceSha256: proof.extensionSourceSha256,
    scope:
      "Focused aggregate extension behavior; every upstream card interaction and whole legal victories are outside this proof.",
  };
}

export function coverageProvenance(path, project, sha256) {
  const localPath = relative(resolve(project), resolve(path)).replaceAll(
    "\\",
    "/",
  );
  return {
    path:
      localPath === ".." || localPath.startsWith("../")
        ? `external-evidence/${sha256}.json`
        : localPath,
    sha256,
  };
}

async function readRecord(path, project) {
  const bytes = await readFile(path);
  // Provenance paths are repository-relative, never serialized account/game data.
  return {
    value: JSON.parse(bytes),
    provenance: coverageProvenance(path, project, hash(bytes)),
  };
}

async function sourceInventory(source, project) {
  const files = [],
    counts = {},
    scenarioCodes = new Set();
  async function visit(directory) {
    const result = [];
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) result.push(...(await visit(path)));
      else if (entry.isFile() && entry.name.endsWith(".hs")) result.push(path);
    }
    return result;
  }
  for (const [kind, directory] of Object.entries(sourceDirectories)) {
    counts[kind] = 0;
    for (const path of await visit(
      resolve(source, "backend/arkham-api/library/Arkham", directory),
    )) {
      const bytes = await readFile(path),
        entries = declaredBuilders(bytes.toString("utf8"), kind);
      counts[kind] += entries.length;
      files.push([relative(source, path).replaceAll("\\", "/"), hash(bytes)]);
      if (kind === "Scenario")
        for (const entry of entries)
          if (entry.code) scenarioCodes.add(entry.code);
    }
  }
  const campaignBytes = await readFile(
    resolve(source, "backend/arkham-api/library/Arkham/Campaign.hs"),
  );
  const scenarioBytes = await readFile(
    resolve(source, "backend/arkham-api/library/Arkham/Scenario.hs"),
  );
  files.push(
    ["backend/arkham-api/library/Arkham/Campaign.hs", hash(campaignBytes)],
    ["backend/arkham-api/library/Arkham/Scenario.hs", hash(scenarioBytes)],
  );
  const campaignRegistryKeys = [
    ...campaignBytes
      .toString("utf8")
      .matchAll(/\("([^"]+)",\s*SomeCampaign\s+/g),
  ].length;
  const aliasLine =
    scenarioBytes
      .toString("utf8")
      .match(/^scenarioCardCodeAliases\s*=\s*(.*)$/m)?.[1] || "";
  const scenarioAliases = [
    ...aliasLine.matchAll(/\("([^"]+)",\s*"([^"]+)"\)/g),
  ].map((match) => [match[1], match[2]]);
  for (const [alias, canonical] of scenarioAliases)
    if (scenarioCodes.has(canonical)) scenarioCodes.add(alias);
  // Authored extension registration is source evidence; compiled manifests
  // continue to determine actual capability in the existing launcher.
  const barkhamPath = resolve(
    project,
    "rules/extensions/barkham/backend/Arkham/Homebrew/Barkham/Content.hs",
  );
  const barkham = await readFile(barkhamPath);
  files.push([
    "chronicle/rules/extensions/barkham/backend/Arkham/Homebrew/Barkham/Content.hs",
    hash(barkham),
  ]);
  for (const match of barkham
    .toString("utf8")
    .matchAll(/\("(:barkham:\d{3})",\s*HomebrewScenario\s+/g))
    scenarioCodes.add(match[1]);
  // Record the original metadata inputs too; a Git revision alone does not
  // describe a checkout containing staged authored extension seams.
  for (const path of (
    await readdir(resolve(source, "frontend/src/arkham/data"))
  )
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const input = `frontend/src/arkham/data/${path}`;
    files.push([input, hash(await readFile(resolve(source, input)))]);
  }
  return {
    counts,
    sourceFiles: files.length,
    sourceSha256: hash(
      JSON.stringify(files.sort((a, b) => a[0].localeCompare(b[0]))),
    ),
    scenarioCodes,
    scenarioAliases,
    campaignRegistryKeys,
  };
}

export async function buildSupportCoverage({
  project = projectRoot,
  source,
  registryFile,
  nativeQaManifestFile,
  legalReportFiles = [],
  destination,
} = {}) {
  if (!source)
    throw new Error(
      "Specify the pinned native source checkout with --source or ARKHAM_RULES_SOURCE.",
    );
  project = resolve(project);
  source = resolve(source);
  const revision = (
    await run("git", ["-C", source, "rev-parse", "HEAD"])
  ).stdout.trim();
  if (revision !== presentationRevision)
    throw new Error(
      "Support inventory source is not the pinned native revision.",
    );
  const provenance = [];
  const catalogRecord = await readRecord(
    resolve(project, "public/data/catalog.json"),
    project,
  );
  provenance.push(catalogRecord.provenance);
  const catalog = catalogRecord.value,
    cards = [];
  for (const file of catalog.cardFiles) {
    if (!/^\/data\/cards-\d+\.json$/.test(file))
      throw new Error(
        "Catalog card snapshots must be local published data files.",
      );
    const record = await readRecord(
      resolve(project, "public", file.slice(1)),
      project,
    );
    cards.push(...record.value);
    provenance.push(record.provenance);
  }
  const { tsImport } = await import("tsx/esm/api");
  const core = await tsImport(
    pathToFileURL(resolve(project, "src/game/scriptSupport.ts")).href,
    import.meta.url,
  );
  const { SPREADING_FLAMES } = await tsImport(
    pathToFileURL(resolve(project, "src/game/scenario.ts")).href,
    import.meta.url,
  );
  for (const file of [
    "src/game/scriptSupport.ts",
    "src/game/scenario.ts",
    "src/game/data.ts",
    "public/data/core-2026.json",
    "scripts/build-companion-options.mjs",
    "scripts/build-support-coverage.mjs",
    "rules/extensions/barkham/frontend/scenarios.json",
  ]) {
    provenance.push({
      path: file,
      sha256: hash(await readFile(resolve(project, file))),
    });
  }
  const options = await buildCompanionOptions(source, undefined);
  const inventory = await sourceInventory(source, project);
  let registry = null,
    manifest = null,
    focusedNativeTests = null;
  if (nativeQaManifestFile) {
    manifest = await verifyNativeQaManifest(resolve(nativeQaManifestFile));
    const record = await readRecord(manifest.nativeProof.path, project);
    focusedNativeTests = focusedBehaviorCoverage(
      record.value,
      manifest,
      record.provenance,
    );
    provenance.push(
      (await readRecord(resolve(nativeQaManifestFile), project)).provenance,
    );
  }
  if (registryFile) {
    const record = await readRecord(resolve(registryFile), project),
      value = record.value;
    if (
      !manifest ||
      value.binarySha256 !== manifest.binarySha256 ||
      value.extensionSourceSha256 !== manifest.extensionSourceSha256 ||
      value.runtimeScope !== "native-acceptance" ||
      value.capabilityCertified !== false
    )
      throw new Error(
        "Registry capture must match the independently verified private QA manifest and cannot claim installed certification.",
      );
    registry = { record, value };
  }
  const legalAttempts = [];
  for (const path of legalReportFiles) {
    const record = await readRecord(resolve(path), project);
    legalAttempts.push(
      legalAttemptCoverage(record.value, manifest, record.provenance),
    );
  }
  const result = {
    schemaVersion: 1,
    sourceRevision: revision,
    catalog: {
      revision: catalog.revision,
      cardDefinitions: cards.length,
      products: catalog.products.length,
      ...catalogRegistryCoverage(cards, registry?.value),
    },
    core: {
      scenarios: [{ id: SPREADING_FLAMES.code, name: SPREADING_FLAMES.name }],
      investigatorCodes: [...core.NATIVE_INVESTIGATOR_CODES],
      reachableScriptedCardCodes: [...core.NATIVE_SCRIPT_CODES],
      scope:
        "Independent Core TypeScript engine: fixed starter lists and this reachable scenario pool; focused regressions do not certify every possible interaction.",
    },
    native: {
      declaredBuilders: inventory.counts,
      sourceFiles: inventory.sourceFiles,
      sourceSha256: inventory.sourceSha256,
      campaignRegistryKeys: inventory.campaignRegistryKeys,
      playModeCount: options.scenarios.length,
      uniqueScenarioIds: new Set(
        options.scenarios.map((scenario) => scenario.id),
      ).size,
      campaigns: options.campaigns.map(({ id, name, beta, alpha }) => ({
        id,
        name,
        ...(beta ? { beta } : {}),
        ...(alpha ? { alpha } : {}),
      })),
      scenarios: options.scenarios.map(
        ({ id, name, campaign, variant, beta, alpha }) => ({
          id,
          name,
          ...(campaign ? { campaign } : {}),
          ...(variant ? { variant } : {}),
          ...(beta ? { beta } : {}),
          ...(alpha ? { alpha } : {}),
          sourceBuilderDeclared: inventory.scenarioCodes.has(id),
        }),
      ),
      scenarioAliases: inventory.scenarioAliases,
    },
    evidence: {
      registry: registry
        ? {
            provenance: registry.record.provenance,
            scope:
              "Recorded private native QA registry; these aliases/reference codes are not an executable-builder allowlist.",
            platform: registry.value.platform,
            recordedReady: registry.value.ready === true,
            binarySha256: registry.value.binarySha256,
            extensionSourceSha256: registry.value.extensionSourceSha256,
            supportedCodeAliases: unique(
              registry.value.supportedCardCodes.map(catalogCardCode),
            ).length,
            investigatorCodes: unique(registry.value.investigatorCodes || [])
              .length,
            scenarioReferenceCodes: unique(registry.value.scenarioIds || [])
              .length,
          }
        : null,
      focusedNativeTests,
      legalAttempts,
      installation: {
        packaged: false,
        installed: false,
        capabilityCertified: false,
        scope:
          "This source inventory and private QA evidence do not establish an installed or certified macOS release.",
      },
    },
    provenance,
    limitations: [
      "Catalog records, reference faces, aliases and executable builders are different representations; a code mismatch is not proof of absent implementation.",
      "Source declarations and recorded registry definitions do not certify all rule interactions or unlock capabilities.",
      "Focused native extension tests and a legally completed scenario are separate evidence; debug-assisted, setup-only, failed and defeat reports cannot establish a successful whole scenario.",
      "Legal reports retain their own acceptance status and hashes. This inventory does not replay those games.",
      "The existing Barkham winning report contract is recognized; future successful Epic report contracts require review and remain completion-unverified until their winning group evidence is validated.",
      "Upstream alpha/beta provenance is retained per play mode; isolated passing tests do not remove it.",
      "Recorded ready status is historical evidence, not a claim that a service is running now.",
    ],
  };
  if (destination) {
    await mkdir(dirname(resolve(destination)), { recursive: true });
    await writeFile(
      resolve(destination),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }
  return result;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const input = {
    source: process.env.ARKHAM_RULES_SOURCE,
    destination: resolve(projectRoot, "public/data/support-coverage.json"),
    legalReportFiles: [],
  };
  const flags = {
    "--source": "source",
    "--output": "destination",
    "--registry": "registryFile",
    "--native-qa-manifest": "nativeQaManifestFile",
    "--legal-report": "legalReportFiles",
  };
  for (let index = 2; index < process.argv.length; index++) {
    const key = flags[process.argv[index]],
      value = process.argv[++index];
    if (!key || !value || value.startsWith("--"))
      throw new Error(
        "Use --source, --output, --registry, --native-qa-manifest and repeated --legal-report paths.",
      );
    if (key === "legalReportFiles") input.legalReportFiles.push(value);
    else input[key] = value;
  }
  const result = await buildSupportCoverage(input);
  console.log(
    `Recorded ${result.catalog.cardDefinitions} catalog definitions, ${result.core.reachableScriptedCardCodes.length} Core scripts and ${result.native.declaredBuilders.Scenario} native scenario declarations; installation certification remains false.`,
  );
}
