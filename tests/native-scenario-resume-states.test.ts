import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  assertEpicResumeStates,
  captureEpicStoppedStates,
  epicReadResolution,
} from "../scripts/native-scenario-playthrough-policy.mjs";

const actualMachinationsRead = JSON.parse(
  readFileSync(
    new URL("./fixtures/machinations-resolution-read.json", import.meta.url),
    "utf8",
  ),
).nativeQuestion;

const ids = [
  "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-cccc-cccccccccccc",
];
const states = () =>
  ids.map((gameId) => ({
    gameId,
    snapshot: { game: { id: gameId, gameState: { tag: "IsActive" } } },
  }));

test("resume preflight rejects a terminal loss in any group before any later answers", () => {
  assert.doesNotThrow(() =>
    assertEpicResumeStates({
      states: states(),
      validatedWinningReadGameIds: [],
      winningResolution: 1,
    }),
  );
  for (let index = 0; index < 3; index++) {
    const current = states();
    current[index].snapshot.game.gameState.tag = "IsOver";
    let answers = 0;
    assert.throws(() => {
      assertEpicResumeStates({
        states: current,
        validatedWinningReadGameIds: [],
        winningResolution: 1,
      });
      answers++;
    }, /terminal losing/);
    assert.equal(answers, 0);
    assert.doesNotThrow(() =>
      assertEpicResumeStates({
        states: current,
        validatedWinningReadGameIds: [ids[index]],
        winningResolution: 1,
      }),
    );
  }
});

test("resume preflight requires the complete unique owned roster and known current state", () => {
  for (const mutate of [
    (v: ReturnType<typeof states>) => {
      v.pop();
    },
    (v: ReturnType<typeof states>) => {
      v[1] = v[0];
    },
    (v: ReturnType<typeof states>) => {
      v[0].snapshot.game.id = ids[1];
    },
    (v: ReturnType<typeof states>) => {
      v[0].snapshot.game.gameState.tag = "IsPending";
    },
  ]) {
    const current = states();
    mutate(current);
    assert.throws(() =>
      assertEpicResumeStates({
        states: current,
        validatedWinningReadGameIds: [],
        winningResolution: 1,
      }),
    );
  }
  assert.throws(() =>
    assertEpicResumeStates({
      states: states(),
      validatedWinningReadGameIds: ["foreign"],
      winningResolution: 1,
    }),
  );
});

test("failed middle-seat capture retains its witness and still captures the later group", async () => {
  const participants = ids.map((gameId, index) => ({
    gameId,
    group: ["Past", "Present", "Future"][index],
  }));
  const retained = participants.map((p) => ({ ...p, file: `old-${p.group}` }));
  const visited: string[] = [];
  const before = JSON.stringify(retained);
  const result = await captureEpicStoppedStates({
    participants,
    previousStates: retained,
    capture: async (participant) => {
      visited.push(participant.gameId);
      if (participant.gameId === ids[1])
        throw new Error("bounded seat read failed");
      return { ...participant, file: `new-${participant.group}` };
    },
  });
  assert.deepEqual(visited, ids);
  assert.deepEqual(
    result.states.map((s) => s.file),
    ["new-Past", "old-Present", "new-Future"],
  );
  assert.equal(result.current, false);
  assert.deepEqual(result.errors, [
    { gameId: ids[1], group: "Present", message: "bounded seat read failed" },
  ]);
  assert.equal(JSON.stringify(retained), before);
  const complete = await captureEpicStoppedStates({
    participants,
    capture: async (participant) => participant,
  });
  assert.equal(complete.current, true);
  assert.equal(complete.states.length, 3);
  assert.deepEqual(complete.errors, []);
});

test("actual printed losing Read stops a still-active Epic group without matching unrelated prose", () => {
  for (const [kind, namespace, win] of [
    ["machinations", "machinationsThroughTime", 1],
    ["labyrinth", "theLabyrinthsOfLunacy", 4],
  ] as const) {
    for (const resolution of [1, 2, 3, 4]) {
      const question = {
        tag: "Read",
        raw: {
          tag: "QuestionLabel",
          question: {
            tag: "Read",
            flavorText: {
              title: `$standalone.${namespace}.resolutions.resolution${resolution}.title`,
            },
          },
        },
      };
      assert.equal(epicReadResolution(question, kind), resolution);
      const current = states().map((state, index) => ({
        ...state,
        resolution:
          index === 2 ? epicReadResolution(question, kind) : undefined,
      }));
      const check = () =>
        assertEpicResumeStates({
          states: current,
          validatedWinningReadGameIds: [],
          winningResolution: win,
        });
      if (resolution === win) assert.doesNotThrow(check);
      else assert.throws(check, /printed losing/);
    }
    assert.equal(
      epicReadResolution(
        {
          tag: "Read",
          raw: {
            tag: "Read",
            flavorText: {
              title: "unrelated resolution1 title",
              body: `standalone.${namespace}.resolutions.resolution2.title`,
            },
          },
        },
        kind,
      ),
      undefined,
    );
    assert.equal(
      epicReadResolution(
        {
          tag: "ChooseOne",
          raw: {
            tag: "Read",
            flavorText: {
              title: `$standalone.${namespace}.resolutions.resolution1.title`,
            },
          },
        },
        kind,
      ),
      undefined,
    );
  }
});

test("actual XP-bearing Machinations R2 blocks every still-active era before gameplay", () => {
  const q = { tag: "Read", raw: actualMachinationsRead };
  assert.equal(epicReadResolution(q, "machinations"), 2);
  for (const index of [0, 1, 2]) {
    const current = states().map((state, i) => ({
      ...state,
      resolution:
        i === index ? epicReadResolution(q, "machinations") : undefined,
    }));
    let answers = 0;
    assert.throws(() => {
      assertEpicResumeStates({
        states: current,
        validatedWinningReadGameIds: [],
        winningResolution: 1,
      });
      answers++;
    }, /printed losing/);
    assert.equal(answers, 0);
  }
});

test("shared resolution matcher admits XP only for printed Machinations R1/R2/R4, retaining Labyrinth bare keys", () => {
  for (const resolution of [1, 2, 3, 4]) {
    const q = {
      tag: "Read",
      raw: {
        tag: "Read",
        flavorText: {
          title: `$standalone.machinationsThroughTime.resolutions.resolution${resolution}.title xp=i:12.0`,
        },
      },
    };
    assert.equal(
      epicReadResolution(q, "machinations"),
      resolution === 3 ? undefined : resolution,
    );
    q.raw.flavorText.title = `$standalone.theLabyrinthsOfLunacy.resolutions.resolution${resolution}.title xp=i:12.0`;
    assert.equal(epicReadResolution(q, "labyrinth"), undefined);
    q.raw.flavorText.title = `$standalone.theLabyrinthsOfLunacy.resolutions.resolution${resolution}.title`;
    assert.equal(epicReadResolution(q, "labyrinth"), resolution);
    assert.equal(epicReadResolution(q, "machinations"), undefined);
  }
  const q = { tag: "Read", raw: structuredClone(actualMachinationsRead) };
  Object.defineProperty(q.raw.flavorText, "body", {
    get() {
      throw new Error("Resolution matcher must not search body prose");
    },
  });
  assert.equal(epicReadResolution(q, "machinations"), 2);
});
