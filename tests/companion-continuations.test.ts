import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanionDecision } from "../src/components/CompanionDecision";
import {
  buildContinueAnswer,
  companionContinuation,
  companionQuestion,
  companionScenarioStepId,
  type NativeGame,
  type NativeRecord,
} from "../src/game/companionProtocol";

// Pinned 03a7f1e upstream: TheForgottenAge.hs stores expeditionLeader;
// TheUntamedWilds/TheDoomOfEztli's ChooseLeadInvestigator handlers enforce it.
// Scenario/Runner.hs LoadScenario bypasses those handlers for an explicit lead.
const investigators = {
  ursula: {
    id: "ursula",
    playerId: "seat-b",
    name: { title: "Ursula Downs" },
  },
  roland: {
    id: "roland",
    playerId: "seat-a",
    name: { title: "Roland Banks" },
  },
};
function fixture(nextStep: NativeRecord, extra: NativeGame = {}) {
  const game: NativeGame = {
    scenarioSteps: 23,
    investigators,
    campaign: {
      id: "04",
      meta: { expeditionLeader: "ursula" },
      step: {
        tag: "ContinueCampaignStep",
        contents: {
          nextStep,
          canUpgradeDecks: true,
          canChooseSideStory: false,
        },
      },
    },
    ...extra,
    question: { "seat-a": { tag: "ContinueCampaign" } },
  };
  return { game, model: companionQuestion(game, "seat-a")! };
}
let submissions = 0;
function render(value: ReturnType<typeof fixture>) {
  return renderToStaticMarkup(
    createElement(CompanionDecision, {
      ...value,
      context: {},
      cards: new Map(),
      busy: false,
      inspect: () => {},
      submit: async () => {
        submissions++;
      },
      upgrade: async () => {},
      session: { gameId: "continuation-fixture" },
    }),
  );
}

test("interlude, checkpoint and campaign-specific tuples continue without selecting a lead", () => {
  for (const step of [
    { tag: "InterludeStep", contents: [2, null] },
    { tag: "CampaignSpecificStep", contents: ["embark", null] },
    { tag: "CheckpointStep", contents: 3 },
    { tag: "PrologueStep" },
  ]) {
    const f = fixture(step);
    assert.equal(companionScenarioStepId(step), undefined);
    assert.equal(f.model.continuationLead, undefined);
    assert.deepEqual(buildContinueAnswer(f.model), {
      tag: "CampaignStepAnswer",
      contents: step,
    });
    assert.throws(
      () => buildContinueAnswer(f.model, "ursula"),
      /does not choose/,
    );
    const output = render(f);
    assert.doesNotMatch(output, /Lead investigator|Expedition leader/);
    assert.match(output, /<button(?![^>]*disabled)[^>]*>Continue<\/button>/);
    assert.doesNotMatch(output, /Next: embark/);
  }
  assert.equal(submissions, 0);
});

test("Forgotten Age and Return expedition starts enforce the recorded leader across player seats", () => {
  for (const code of ["04043", "04054", "53016", "53017"]) {
    const f = fixture({ tag: "ScenarioStep", contents: `c${code}` });
    assert.equal(f.model.playerId, "seat-a");
    assert.equal(f.model.continuationLead?.requiredId, "ursula");
    assert.throws(
      () => buildContinueAnswer(f.model, "roland"),
      /expedition leader/,
    );
    const answer = buildContinueAnswer(f.model).contents as NativeRecord;
    assert.equal(answer.tag, "ScenarioStepWithOptions");
    assert.equal(
      (answer.contents as [string, NativeRecord])[1]
        .scenarioOptionsLeadInvestigator,
      "ursula",
    );
    const output = render(f);
    assert.match(
      output,
      /The expedition leader leads this scenario: Ursula Downs/,
    );
    assert.match(output, /<option value="ursula" selected="">Ursula Downs/);
    assert.match(output, /<option value="roland" disabled="">Roland Banks/);
    assert.match(output, /<button(?![^>]*disabled)[^>]*>Continue<\/button>/);
  }
  assert.equal(submissions, 0);
});

test("explicit lead changes retain every native tarot and setup option", () => {
  const options = {
    scenarioOptionsStandalone: false,
    scenarioOptionsPerformTarotReading: true,
    scenarioOptionsLeadInvestigator: "roland",
    scenarioOptionsDelayChoosingLead: true,
    scenarioOptionsSkipInvestigatorSetup: true,
    scenarioOptionsSkipStartOfGame: true,
  };
  const f = fixture({
    tag: "ScenarioStepWithOptions",
    contents: ["c04043", options],
  });
  assert.deepEqual(buildContinueAnswer(f.model, "ursula"), {
    tag: "CampaignStepAnswer",
    contents: {
      tag: "ScenarioStepWithOptions",
      contents: [
        "c04043",
        { ...options, scenarioOptionsLeadInvestigator: "ursula" },
      ],
    },
  });
  assert.deepEqual(
    (companionContinuation(f.model).nextStep as NativeRecord).contents,
    ["c04043", options],
  );
});

test("ordinary scenario controls collect an explicit lead and supplied answers validate the living roster", () => {
  const f = fixture(
    { tag: "ScenarioStep", contents: "c02062" },
    {
      investigators: {
        ...investigators,
        dead: { id: "dead", killed: true },
        insane: { id: "insane", drivenInsane: true },
      },
    },
  );
  assert.deepEqual(f.model.continuationLead?.eligibleIds, ["ursula", "roland"]);
  assert.equal(f.model.continuationLead?.requiredId, undefined);
  const output = render(f);
  assert.match(output, /<option value="" selected="">Choose lead investigator/);
  assert.match(output, /<button[^>]*disabled[^>]*>Continue<\/button>/);
  assert.doesNotMatch(output, /value="dead"|value="insane"/);
  // A missing option is also valid native behavior: LoadScenario then asks
  // ChooseLeadInvestigator. The adapter must not silently select an owner.
  assert.deepEqual(buildContinueAnswer(f.model), {
    tag: "CampaignStepAnswer",
    contents: { tag: "ScenarioStep", contents: "c02062" },
  });
  for (const id of ["dead", "insane", "another-campaign"])
    assert.throws(
      () => buildContinueAnswer(f.model, id),
      /living investigator/,
    );
  const answer = buildContinueAnswer(f.model, "roland")
    .contents as NativeRecord;
  assert.equal(
    (answer.contents as [string, NativeRecord])[1]
      .scenarioOptionsLeadInvestigator,
    "roland",
  );
});

test("a killed recorded expedition leader blocks continuation while preserving the question", () => {
  const f = fixture(
    { tag: "ScenarioStep", contents: "c53017" },
    {
      investigators: {
        ...investigators,
        ursula: { ...investigators.ursula, killed: true },
      },
    },
  );
  assert.throws(() => buildContinueAnswer(f.model), /living investigator/);
  assert.match(render(f), /recorded expedition leader is unavailable/);
  assert.match(render(f), /<button[^>]*disabled[^>]*>Continue<\/button>/);
  assert.equal(f.model.question.tag, "ContinueCampaign");
});

test("standalone options preserve their independent lead choice and nested return step", () => {
  const returnStep = { tag: "ScenarioStep", contents: "c02062" };
  const options = {
    scenarioOptionsStandalone: true,
    scenarioOptionsPerformTarotReading: true,
    scenarioOptionsLeadInvestigator: "roland",
  };
  for (const tag of [
    "ScenarioStepWithOptions",
    "StandaloneScenarioStepWithOptions",
  ]) {
    const nextStep = {
      tag,
      contents:
        tag === "StandaloneScenarioStepWithOptions"
          ? ["c04043", returnStep, options]
          : ["c04043", options],
    };
    const f = fixture(nextStep);
    assert.equal(f.model.continuationLead?.requiredId, undefined);
    assert.equal(f.model.continuationLead?.existingId, "roland");
    assert.match(render(f), /<option value="roland" selected="">Roland Banks/);
    assert.deepEqual(buildContinueAnswer(f.model, "ursula"), {
      tag: "CampaignStepAnswer",
      contents: {
        tag,
        contents:
          tag === "StandaloneScenarioStepWithOptions"
            ? [
                "c04043",
                returnStep,
                { ...options, scenarioOptionsLeadInvestigator: "ursula" },
              ]
            : [
                "c04043",
                { ...options, scenarioOptionsLeadInvestigator: "ursula" },
              ],
      },
    });
  }
  const direct = fixture({
    tag: "StandaloneScenarioStep",
    contents: ["c81001", returnStep],
  });
  assert.equal(
    companionScenarioStepId(companionContinuation(direct.model).nextStep),
    "c81001",
  );
  assert.deepEqual(buildContinueAnswer(direct.model, "roland").contents, {
    tag: "StandaloneScenarioStepWithOptions",
    contents: [
      "c81001",
      returnStep,
      {
        scenarioOptionsStandalone: false,
        scenarioOptionsPerformTarotReading: false,
        scenarioOptionsLeadInvestigator: "roland",
      },
    ],
  });
});

test("mid-scenario continuation takes priority over the campaign's parked side-story return", () => {
  const next = {
    tag: "ScenarioStepWithOptions",
    contents: [
      "c88002",
      {
        scenarioOptionsStandalone: false,
        scenarioOptionsPerformTarotReading: false,
        scenarioOptionsSkipInvestigatorSetup: true,
      },
    ],
  };
  const f = fixture(
    { tag: "ScenarioStep", contents: "c04043" },
    {
      scenario: {
        campaignStep: {
          tag: "ContinueCampaignStep",
          contents: { nextStep: next },
        },
      },
    },
  );
  assert.equal(f.model.continuationLead?.requiredId, undefined);
  assert.deepEqual(companionContinuation(f.model).nextStep, next);
  assert.equal(
    (
      (buildContinueAnswer(f.model, "roland").contents as NativeRecord)
        .contents as [string, NativeRecord]
    )[1].scenarioOptionsSkipInvestigatorSetup,
    true,
  );
});
