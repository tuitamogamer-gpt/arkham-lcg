import assert from "node:assert/strict";
import test from "node:test";
import { selectSuccessfulInvestigationChoice } from "../scripts/native-scenario-playthrough-policy.mjs";

// Public fields reduced from the actual 232-test Labyrinth Group A stop:
// 00038-0-unsupported-policy snapshot SHA22f4ef5815dbd10c81de2eb359e5f3e220ea1280261cc2855aab0f1b587dbeaf.
const target = { tag: "LocationTarget", contents: "own-location" };
const successful = {
  tag: "SkillTestMessage",
  contents: {
    tag: "Successful_",
    contents: [
      ["Investigate", target],
      "own-investigator",
      {
        tag: "AbilitySource",
        contents: [{ tag: "LocationSource", contents: "own-location" }, 103],
      },
      target,
      6,
    ],
  },
};
const original = {
  answerIndex: 0,
  disabled: false,
  label: "Discover Clue at Chamber of Secrets: Bloody Prison",
  raw: { tag: "Label", messages: [successful] },
};
const bonus = {
  answerIndex: 1,
  disabled: false,
  label: "Perception",
  raw: {
    tag: "Label",
    messages: [
      {
        tag: "SkillTestMessage",
        contents: {
          tag: "SkillTestResultOptions_",
          contents: [{ option: original.raw }],
        },
      },
    ],
  },
};
const input = () => ({
  snapshot: {
    playerId: "own-player",
    game: {
      investigators: {
        own: {
          id: "own-investigator",
          playerId: "own-player",
          placement: { tag: "AtLocation", contents: "own-location" },
        },
      },
      locations: { "own-location": { revealed: true } },
      skillTest: {
        investigator: "own-investigator",
        action: "Investigate",
        result: { tag: "SucceededBy", contents: ["NonAutomatic", 6] },
        step: "ApplySkillTestResultsStep",
        source: {
          tag: "AbilitySource",
          contents: [{ tag: "LocationSource", contents: "own-location" }, 103],
        },
        target,
      },
    },
  },
  question: {
    kind: "choices",
    tag: "ChooseOne",
    playerId: "own-player",
    isPlayerWindow: false,
    choices: [original, bonus],
  },
});

test("native successful investigation result uses physical identity despite a subtitle, ahead of nested bonus options", () => {
  const value = input();
  assert.equal(selectSuccessfulInvestigationChoice(value)?.choice, original);
  value.question.choices.reverse();
  assert.equal(selectSuccessfulInvestigationChoice(value)?.choice, original);
  const renamed = { ...original, label: "Localized location name" };
  value.question.choices = [bonus, renamed];
  assert.equal(selectSuccessfulInvestigationChoice(value)?.choice, renamed);
});

test("native result selection rejects foreign actor, location, source, failed tests and duplicate or disabled results", () => {
  for (const mutate of [
    (v: any) => {
      v.question.playerId = "other-player";
    },
    (v: any) => {
      v.snapshot.game.skillTest.investigator = "other-investigator";
    },
    (v: any) => {
      v.snapshot.game.skillTest.result.tag = "FailedBy";
    },
    (v: any) => {
      v.snapshot.game.skillTest.result.contents[1] = 1;
    },
    (v: any) => {
      v.snapshot.game.skillTest.source = {
        tag: "AssetSource",
        contents: "foreign-asset",
      };
    },
    (v: any) => {
      v.snapshot.game.skillTest.step = "StartSkillTestStep";
    },
    (v: any) => {
      v.snapshot.game.locations["own-location"].revealed = false;
    },
    (v: any) => {
      v.question.choices[0].raw.messages[0].contents.contents[1] =
        "other-investigator";
    },
    (v: any) => {
      v.question.choices[0].raw.messages[0].contents.contents[2].contents[0].contents =
        "other-location";
    },
    (v: any) => {
      v.question.choices[0].raw.messages[0].contents.contents[2].contents[1] = 1;
    },
    (v: any) => {
      v.question.choices[0].disabled = true;
    },
    (v: any) => {
      v.question.choices.push(structuredClone(v.question.choices[0]));
    },
    (v: any) => {
      v.question.choices = [v.question.choices[1]];
    },
  ]) {
    const value = structuredClone(input());
    mutate(value);
    assert.equal(selectSuccessfulInvestigationChoice(value), undefined);
  }
});

test("native investigation selector does not read sealed state or mutate the snapshot/question", () => {
  const value = input();
  const before = JSON.stringify(value);
  for (const key of ["meta", "deck", "setAsideCards", "replicas"]) {
    Object.defineProperty(value.snapshot.game, key, {
      get: () => {
        throw new Error(`Sealed ${key} read`);
      },
    });
  }
  assert.equal(selectSuccessfulInvestigationChoice(value)?.choice, original);
  assert.equal(JSON.stringify(value), before);
});
