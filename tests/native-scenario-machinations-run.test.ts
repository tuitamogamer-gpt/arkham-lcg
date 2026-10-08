/** Harness behavior tests with explicit fake IO. These are not executed native
 * scenario playthrough evidence and create no runtime games. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { companionQuestion } from "../src/game/companionProtocol.ts";
import {
  machinationsReadResolution,
  playFreshMachinations,
} from "../scripts/native-scenario-machinations-run.mjs";

const actualResolution = JSON.parse(
  readFileSync(
    new URL("./fixtures/machinations-resolution-read.json", import.meta.url),
    "utf8",
  ),
);

const fixtureRead = () => {
  const native = structuredClone(actualResolution.nativeQuestion);
  const question = companionQuestion(
    { scenarioSteps: 1, question: { "fixture-player": native } },
    "fixture-player",
  );
  assert.ok(question);
  return { ...question, raw: native };
};

const read = (n: number, extra: any = {}): any => ({
  kind: "choices",
  tag: "Read",
  questionVersion: 1,
  choices: [
    {
      tag: "Label",
      label: "Continue",
      answerIndex: 0,
      raw: { tag: "Label", label: "Continue" },
    },
  ],
  raw: {
    tag: "Read",
    flavorText: {
      title: `$standalone.machinationsThroughTime.resolutions.resolution${n}.title`,
      body: [
        {
          tag: "ModifyEntry",
          modifiers: ["ResolutionEntry"],
          entry: {
            tag: "I18nEntry",
            key: `standalone.machinationsThroughTime.resolutions.resolution${n}.body`,
          },
        },
      ],
    },
  },
  ...extra,
});

test("winning Read uses exact native Machinations flavor title; rewarded losses and unrelated prose stay distinct", () => {
  for (const n of [1, 2, 3, 4])
    assert.equal(machinationsReadResolution(read(n)), n);
  assert.equal(machinationsReadResolution(read(10)), undefined);
  assert.equal(
    machinationsReadResolution(read(1, { tag: "ChooseOne" })),
    undefined,
  );
  const unknown = read(1);
  unknown.raw.flavorText.title =
    "$standalone.otherScenario.resolutions.resolution1.title";
  assert.equal(machinationsReadResolution(unknown), undefined);
  unknown.raw.flavorText.title = "This prose mentions resolution1";
  assert.equal(machinationsReadResolution(unknown), undefined);
  unknown.raw.flavorText.title =
    "$standalone.machinationsThroughTime.resolutions.resolution1.title.extra";
  assert.equal(machinationsReadResolution(unknown), undefined);
});

test("native labeled Read wrapper is supported without walking unrelated hidden wrapper values", () => {
  const q = read(1),
    native = q.raw;
  q.raw = { tag: "QuestionLabel", label: "Story", question: native };
  Object.defineProperty(q.raw, "metadata", {
    get() {
      throw new Error("Hidden wrapper metadata");
    },
  });
  assert.equal(machinationsReadResolution(q), 1);
});

test("actual native XP-bearing R2 Read remains a loss and source-confirmed R1/R4 titles parse exactly", () => {
  const actual = fixtureRead();
  assert.equal(machinationsReadResolution(actual), 2);
  assert.equal(actualResolution.provenance.wholeScenarioCompleted, false);
  // These title substitutions are controlled checks of resolutionWithXp,
  // not evidence of an executed winning native playthrough.
  for (const resolution of [1, 2, 4]) {
    for (const xp of [0, 1, 12]) {
      const q = structuredClone(actual);
      q.raw.flavorText.title = `$standalone.machinationsThroughTime.resolutions.resolution${resolution}.title xp=i:${xp}.0`;
      assert.equal(machinationsReadResolution(q), resolution);
    }
  }
});

test("native resolution XP accepts only its exact own title grammar and never prose or extra variables", () => {
  for (const title of [
    "$standalone.machinationsThroughTime.resolutions.resolution3.title xp=i:0.0",
    "$standalone.otherScenario.resolutions.resolution1.title xp=i:0.0",
    "This prose mentions resolution1.title xp=i:0.0",
    ...[
      "0",
      "0.5",
      "-1.0",
      "+1.0",
      "01.0",
      "1.00",
      "1e3",
      "NaN",
      "Infinity",
      "9007199254740992.0",
      "0.0 other=i:1.0",
      "0.0 xp=i:1.0",
      "0.0\n",
    ].map(
      (xp) =>
        `$standalone.machinationsThroughTime.resolutions.resolution1.title xp=i:${xp}`,
    ),
  ]) {
    const q = fixtureRead();
    q.raw.flavorText.title = title;
    assert.equal(machinationsReadResolution(q), undefined, title);
  }
  const q = fixtureRead();
  q.raw.flavorText.title = "unrelated";
  q.raw.flavorText.body = [
    {
      tag: "I18nEntry",
      key: "standalone.machinationsThroughTime.resolutions.resolution1.title xp=i:0.0",
    },
  ];
  assert.equal(machinationsReadResolution(q), undefined);
});

function ioFor(resolutions = [1, 1, 1], xpSuffix = false): any {
  const groups = ["Past", "Present", "Future"];
  const participants = groups.map((group, ordinal) => ({
    group,
    ordinal,
    setupCompleted: true,
    seatIndex: 0,
    investigatorCode: "01001",
    gameId: `game-${group}`,
    id: `seat-${group}`,
  }));
  const positions = new Map(participants.map((p) => [p.gameId, 0]));
  const proof: any = {
    wholeScenarioCompleted: false,
    milestones: [],
    games: participants,
    decks: [],
  };
  const io: any = {
    proof,
    participants,
    memories: new Map(
      participants.map((p) => [p.gameId, { group: p.group, gameId: p.gameId }]),
    ),
    cards: [],
    resuming: true,
    setupOnly: false,
    maxAnswers: 12,
    maxMinutes: 1,
    request: async (_path: string, body?: any) => {
      assert.equal(body, undefined);
      return { readyMask: 7, timerStartedAt: 1 };
    },
    pathFor: (p: any, operation: string) => `${p.gameId}/${operation}`,
    checkpoint: async () => {},
    saveSnapshot: async (p: any, _current: any, purpose: string) => ({
      gameId: p.gameId,
      purpose,
      file: `fake-${p.gameId}-${purpose}`,
    }),
    snapshot: async (p: any) => {
      const ended = positions.get(p.gameId)! > 0,
        q = read(resolutions[p.ordinal], { playerId: `player-${p.group}` });
      if (xpSuffix && resolutions[p.ordinal] !== 3)
        q.raw.flavorText.title += " xp=i:0.0";
      const current: any = {
        playerId: `player-${p.group}`,
        game: {
          id: p.gameId,
          inSetup: false,
          phase: "InvestigationPhase",
          gameState: { tag: ended ? "IsOver" : "IsActive" },
          question: ended ? {} : { [`player-${p.group}`]: q.raw },
          investigators: {
            c01001: {
              id: "c01001",
              playerId: `player-${p.group}`,
              remainingActions: 0,
              placement: { tag: "AtLocation", contents: "here" },
              tokens: [],
              hand: [],
            },
          },
          locations: {
            here: { id: "here", cardCode: "c87005b", revealed: true },
          },
          assets: {},
          enemies: {},
          stories: {},
          acts: {},
          agendas: {},
          treacheries: {},
          scenario: { id: "87001", started: true, log: [] },
        },
        offered: ended ? undefined : q,
      };
      for (const field of ["meta", "setAsideCards"])
        Object.defineProperty(current.game.scenario, field, {
          get() {
            throw new Error(`Forbidden strategy read ${field}`);
          },
        });
      return current;
    },
    questionFor: (current: any) => current.offered,
    protocol: {
      buildChoiceAnswer: (q: any, answer: number) => ({
        tag: "Answer",
        contents: {
          playerId: q.playerId,
          questionVersion: q.questionVersion,
          choice: answer,
        },
      }),
    },
    respond: async (p: any, _current: any, q: any, reply: any) => {
      assert.equal(reply.contents.playerId, `player-${p.group}`);
      assert.ok(
        q.choices.some((c: any) => c.answerIndex === reply.contents.choice),
      );
      positions.set(p.gameId, positions.get(p.gameId)! + 1);
    },
  };
  return io;
}

test("all three exact printed R1 followed by IsOver is necessary for a harness success", async () => {
  const io = ioFor();
  await playFreshMachinations(io);
  assert.equal(io.proof.wholeScenarioCompleted, true);
  assert.equal(io.proof.winningResolution, 1);
  assert.equal(
    io.proof.milestones.filter(
      (m: any) => m.name === "native-printed-Machinations-R1",
    ).length,
    3,
  );
  assert.equal(
    io.proof.milestones.filter((m: any) => m.name === "native-IsOver").length,
    3,
  );
});

test("XP-bearing native titles still require three R1 Reads and cannot turn the actual R2 form into a win", async () => {
  const winning = ioFor([1, 1, 1], true);
  await playFreshMachinations(winning);
  assert.equal(winning.proof.wholeScenarioCompleted, true);
  assert.equal(
    winning.proof.milestones.filter(
      (m: any) => m.name === "native-printed-Machinations-R1",
    ).length,
    3,
  );
  const losing = ioFor([1, 2, 1], true);
  await assert.rejects(
    playFreshMachinations(losing),
    /Only a genuine printed native Machinations R1/,
  );
  assert.equal(losing.proof.wholeScenarioCompleted, false);
  assert.equal(losing.proof.winningResolution, undefined);
  assert.ok(
    losing.proof.milestones.some(
      (m: any) =>
        m.name === "native-printed-Machinations-resolution" &&
        m.group === "Present" &&
        m.resolution === 2,
    ),
  );
});

test("one rewarded R2/R4 or fatal R3 prevents a whole winning claim", async () => {
  for (const resolution of [2, 3, 4]) {
    const io = ioFor([1, resolution, 1]);
    await assert.rejects(
      playFreshMachinations(io),
      /Only a genuine printed native Machinations R1/,
    );
    assert.equal(io.proof.wholeScenarioCompleted, false);
    assert.equal(io.proof.winningResolution, undefined);
  }
});

test("finite partial play and unsupported scenario decisions stay false with retained checkpoint", async () => {
  const finite = ioFor();
  finite.maxAnswers = 1;
  await assert.rejects(
    playFreshMachinations(finite),
    /finite offered-answer bound|finite action\/wall-time bound/,
  );
  assert.equal(finite.proof.wholeScenarioCompleted, false);
  const unknown = ioFor(),
    previous = unknown.snapshot;
  unknown.snapshot = async (p: any) => {
    const current = await previous(p);
    current.offered = {
      kind: "choices",
      tag: "ChooseOne",
      questionVersion: 1,
      playerId: current.playerId,
      choices: [
        {
          tag: "Label",
          label: "Unaudited destiny",
          answerIndex: 0,
          raw: { tag: "Label", label: "Unaudited destiny" },
        },
      ],
    };
    return current;
  };
  await assert.rejects(
    playFreshMachinations(unknown),
    /Unsupported actual legal Machinations decision/,
  );
  assert.equal(unknown.proof.wholeScenarioCompleted, false);
  assert.equal(
    unknown.proof.unsupportedDecision.snapshot.purpose,
    "unsupported-policy",
  );
});

test("a foreign requesting player cannot reach the native answer callback", async () => {
  const io = ioFor(),
    previous = io.questionFor;
  io.questionFor = (current: any) => ({
    ...previous(current),
    playerId: "foreign-player",
  });
  io.respond = async () => {
    throw new Error("Foreign answer callback must not run");
  };
  await assert.rejects(playFreshMachinations(io), /requesting native seat/);
  assert.equal(io.proof.wholeScenarioCompleted, false);
});
