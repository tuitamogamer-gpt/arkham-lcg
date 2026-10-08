import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  catalogRegistryCoverage,
  coverageProvenance,
  declaredBuilders,
  focusedBehaviorCoverage,
  legalAttemptCoverage,
} from "../scripts/build-support-coverage.mjs";
import { buildCompanionOptions } from "../scripts/build-companion-options.mjs";
import {
  NATIVE_SCRIPT_CODES,
  NATIVE_INVESTIGATOR_CODES,
} from "../src/game/scriptSupport";
import coverage from "../public/data/support-coverage.json";

const identity = {
  binarySha256: "binary-identity",
  extensionSourceSha256: "extension-identity",
};
const provenance = {
  path: "output/actual-report.json",
  sha256: "report-identity",
};
const revision = "03a7f1e74925744f021f6e8fe0e39945d2c3a833";

test("source discovery retains wrapped multipart builders and excludes commented code, token helpers and effects", () => {
  const source = `partOne :: Difficulty -> PartOne
partOne d = scenario PartOne "08501a" "Ice and Death" d []
-- oldPart :: Difficulty -> OldPart
-- oldPart d = scenario OldPart "00000" "Old" d []
chaosBag :: Difficulty -> [ChaosTokenFace]
chaosBag = const []
partTwo
  :: Difficulty -> PartTwo
partTwo d = scenario PartTwo "08501b" "Ice and Death" d []
instance RunMessage PartTwo where
  runMessage = undefined
partThree :: Difficulty -> PartThree
partThree d = scenario PartThree "08501c" "Ice and Death" d []
`;
  assert.deepEqual(declaredBuilders(source, "Scenario"), [
    { name: "partOne", code: "08501a" },
    { name: "partTwo", code: "08501b" },
    { name: "partThree", code: "08501c" },
  ]);
  assert.deepEqual(
    declaredBuilders(
      "asset :: AssetCard Asset\nvariant :: AssetCard Asset_Alternate\nassetEffect :: EffectArgs -> AssetEffect\n-- old :: AssetCard Old\n",
      "Asset",
    ),
    [{ name: "asset" }, { name: "variant" }],
  );
});

test("registry coverage separates explicit aliases, reverse references and player gaps without inventing missing implementations", () => {
  const cards = [
    { code: "01020", type_code: "asset" },
    { code: "01520", type_code: "asset" },
    { code: "barkham-004", type_code: "investigator" },
    { code: "08501b", type_code: "scenario", encounter_code: "ice_and_death" },
    { code: "real-player-gap", type_code: "event" },
    { code: "hidden", type_code: "asset", hidden: true },
    { code: "mini", type_code: "investigator", miniature: true },
    { code: "key", type_code: "key" },
  ];
  assert.deepEqual(
    catalogRegistryCoverage(cards, {
      supportedCardCodes: ["c01020", "01520", "c:barkham:004"],
    }),
    {
      visibleNonMiniNonKeyRecords: 5,
      capturedRegistryCodeMatches: 3,
      capturedRegistryCodeMismatches: 2,
      unmatchedPlayerDeckDefinitions: 1,
    },
  );
  assert.deepEqual(catalogRegistryCoverage(cards, null), {
    visibleNonMiniNonKeyRecords: 5,
    capturedRegistryCodeMatches: null,
    capturedRegistryCodeMismatches: null,
    unmatchedPlayerDeckDefinitions: null,
  });
  assert.throws(
    () =>
      catalogRegistryCoverage(cards, {
        supportedCardCodes: [null as unknown as string],
      }),
    /explicit supported/,
  );
});

test("failed, setup-only, debug-assisted, defeated and identity-mismatched reports cannot become whole legal completions", () => {
  const valid = {
    schema: 1,
    mode: "native-scenario-legal-playthrough",
    scenario: "barkham",
    runtime: identity,
    passed: true,
    wholeScenarioCompleted: true,
    setupOnly: false,
    unrelatedSavesUnchanged: true,
    nativeMessagesSubmitted: 0,
    coordinatorOperationsSubmitted: 0,
    rngOrClockEdits: 0,
    winningResolution: 1,
    observedNativeResolution: 1,
    nativeGameEnded: true,
    milestones: [
      { name: "native-IsOver", bossVictory: true, winningRead: true },
    ],
  };
  assert.equal(
    legalAttemptCoverage(valid, identity, provenance).status,
    "reported-complete",
  );
  const epic = legalAttemptCoverage(
    {
      ...valid,
      scenario: "labyrinth",
      winningResolution: 4,
      observedNativeResolution: 4,
    },
    identity,
    provenance,
  );
  assert.equal(epic.reportedWholeScenarioCompleted, true);
  assert.equal(epic.wholeScenarioCompleted, false);
  assert.equal(epic.status, "completion-unverified");
  for (const overrides of [
    { passed: false },
    { wholeScenarioCompleted: false },
    { setupOnly: true },
    { nativeMessagesSubmitted: 1 },
    { coordinatorOperationsSubmitted: 1 },
    { rngOrClockEdits: 1 },
    { nativeMessagesSubmitted: undefined },
    { coordinatorOperationsSubmitted: undefined },
    { rngOrClockEdits: undefined },
    { unrelatedSavesUnchanged: false },
    { mode: "debug-assisted-acceptance" },
    { observedNativeResolution: 2 },
    { nativeGameEnded: false },
    {
      milestones: [
        { name: "native-IsOver", bossVictory: false, winningRead: true },
      ],
    },
    { runtime: { ...identity, binarySha256: "different" } },
  ]) {
    const result = legalAttemptCoverage(
      { ...valid, ...overrides },
      identity,
      provenance,
    );
    assert.equal(
      result.wholeScenarioCompleted,
      false,
      JSON.stringify(overrides),
    );
    assert.notEqual(result.status, "reported-complete");
  }
});

test("public provenance retains evidence hashes without disclosing external machine paths", () => {
  assert.deepEqual(
    coverageProvenance(
      "/workspace/repo/output/report.json",
      "/workspace/repo",
      "digest",
    ),
    { path: "output/report.json", sha256: "digest" },
  );
  assert.deepEqual(
    coverageProvenance(
      "/home/private-user/confidential/report.json",
      "/workspace/repo",
      "digest",
    ),
    { path: "external-evidence/digest.json", sha256: "digest" },
  );
});

test("focused test evidence rejects failed, staged, packaged and stale identities and leaves installation separate", () => {
  const proof = {
    scope: "native-aggregate",
    fullAggregate: true,
    fullAggregateBehaviorTested: true,
    upstreamRevision: revision,
    nativeEngineSha256: identity.binarySha256,
    extensionSourceSha256: identity.extensionSourceSha256,
    behavior: { examples: 232, failures: 0 },
    platform: "linux",
    verifiedAt: "2026-10-08T06:39:56Z",
    packaged: false,
    installed: false,
  };
  assert.equal(
    focusedBehaviorCoverage(proof, identity, provenance)?.examples,
    232,
  );
  assert.equal(focusedBehaviorCoverage(proof, null, provenance), null);
  for (const overrides of [
    { scope: "dependency-bootstrap" },
    { fullAggregateBehaviorTested: false },
    { behavior: { examples: 232, failures: 1 } },
    { nativeEngineSha256: "stale" },
    { packaged: true },
    { installed: true },
  ])
    assert.throws(
      () =>
        focusedBehaviorCoverage(
          { ...proof, ...overrides },
          identity,
          provenance,
        ),
      /verified private aggregate/,
    );
});

test("option extraction inherits upstream alpha and beta into multipart/mini modes and preserves authored scenarios without writing by default", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "chronicle-play-option-status-"),
  );
  const data = join(directory, "frontend/src/arkham/data");
  try {
    await mkdir(data, { recursive: true });
    await writeFile(
      join(data, "campaigns.json"),
      JSON.stringify([
        { id: "11", name: "Drowned", beta: true },
        { id: "13", name: "Children", alpha: true },
        { id: "01", name: "Zealot", returnTo: { id: "50", beta: true } },
      ]),
    );
    const filenames = [
      "nightOfTheZealot",
      "theDunwichLegacy",
      "thePathToCarcosa",
      "theForgottenAge",
      "theCircleUndone",
      "theDreamEaters",
      "theInnsmouthConspiracy",
      "edgeOfTheEarth",
      "theScarletKeys",
      "theFeastOfHemlockVale",
      "theDrownedCity",
      "brethrenOfAsh",
      "childrenOfBlood",
      "side-stories",
    ];
    for (const filename of filenames)
      await writeFile(
        join(data, `${filename}.json`),
        JSON.stringify(
          filename === "theDrownedCity"
            ? [{ id: "east", name: "Eastern", campaign: "11" }]
            : filename === "childrenOfBlood"
              ? [{ id: "blood", name: "Blood", campaign: "13" }]
              : filename === "side-stories"
                ? [
                    {
                      id: "lab",
                      name: "Labyrinth",
                      beta: true,
                      miniCampaign: true,
                    },
                    {
                      id: "guard",
                      name: "Guardians",
                      campaign: "83",
                      beta: true,
                      scenarios: [
                        { id: "guard-1", name: "First" },
                        { id: "guard-2", name: "Second" },
                      ],
                    },
                  ]
                : [],
        ),
      );
    const extensionScenarios = [{ id: ":barkham:022", name: "Meowlathotep" }];
    const options = await buildCompanionOptions(directory, undefined, {
      extensionScenarios,
    });
    assert.equal(options.campaigns.find((c) => c.id === "83")?.beta, true);
    assert.equal(
      options.campaigns.find((c) => c.id === "01")?.returnTo?.beta,
      true,
    );
    assert.equal(options.scenarios.find((s) => s.id === "east")?.beta, true);
    assert.equal(options.scenarios.find((s) => s.id === "blood")?.alpha, true);
    assert.equal(
      options.scenarios.find((s) => s.id === "lab" && s.variant === "mini")
        ?.beta,
      true,
    );
    assert.equal(options.scenarios.find((s) => s.id === "guard-2")?.beta, true);
    assert.equal(
      options.scenarios.find((s) => s.id === ":barkham:022")?.beta,
      undefined,
    );
    const output = join(directory, "options.json");
    await buildCompanionOptions(directory, output, { extensionScenarios });
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), options);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("published coverage stays bound to the actual Core pool and separates native references from declared builders and certification", () => {
  assert.deepEqual(coverage.core.reachableScriptedCardCodes, [
    ...NATIVE_SCRIPT_CODES,
  ]);
  assert.deepEqual(coverage.core.investigatorCodes, [
    ...NATIVE_INVESTIGATOR_CODES,
  ]);
  assert.deepEqual(coverage.core.scenarios, [
    { id: "12105", name: "Spreading Flames" },
  ]);
  assert.equal(coverage.catalog.cardDefinitions, 6109);
  assert.equal(coverage.native.playModeCount, 161);
  assert.equal(
    coverage.native.scenarios.find((s) => s.id === "08501b")
      ?.sourceBuilderDeclared,
    true,
  );
  assert.equal(
    coverage.native.scenarios.find((s) => s.id === "10679a")
      ?.sourceBuilderDeclared,
    true,
  );
  assert.equal(
    coverage.native.scenarios.find((s) => s.id === ":barkham:022")
      ?.sourceBuilderDeclared,
    true,
  );
  assert.equal(
    coverage.native.scenarios.find(
      (s) => s.id === "70001" && s.variant === "mini",
    )?.beta,
    true,
  );
  assert.equal(
    coverage.native.campaigns.find((c) => c.id === "13")?.alpha,
    true,
  );
  assert.equal(
    coverage.native.scenarios.filter((s) => !s.sourceBuilderDeclared).length,
    0,
  );
  assert.deepEqual(coverage.evidence.installation, {
    packaged: false,
    installed: false,
    capabilityCertified: false,
    scope:
      "This source inventory and private QA evidence do not establish an installed or certified macOS release.",
  });
  for (const report of coverage.evidence.legalAttempts) {
    if (report.status !== "reported-complete" || !report.passed)
      assert.equal(report.wholeScenarioCompleted, false);
    if (report.wholeScenarioCompleted) {
      assert.equal(report.status, "reported-complete");
      assert.equal(report.passed, true);
      assert.equal(report.reportedWholeScenarioCompleted, true);
      assert.equal(report.setupOnly, false);
      assert.equal(report.identityMatches, true);
      assert.equal(report.nativeGameEnded, true);
      // The current completion validator recognizes the strict Barkham R1
      // contract; unknown successful Epic contracts remain unverified.
      assert.equal(report.scenario, "barkham");
      assert.equal(report.observedNativeResolution, 1);
      assert.match(report.provenance.sha256, /^[a-f0-9]{64}$/);
    } else assert.notEqual(report.status, "reported-complete");
  }
});
