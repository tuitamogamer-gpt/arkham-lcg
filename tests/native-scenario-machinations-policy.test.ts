import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { companionQuestion } from "../src/game/companionProtocol.ts";
import {
  selectMachinationsChoice,
  observeMachinationsChoice,
} from "../scripts/native-scenario-machinations-policy.mjs";

const actorId = "c01001";
const actualRescue = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/machinations-rescue-skill-choice.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const actualInvestigation = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/machinations-investigation-result.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const actualCombat = JSON.parse(
  readFileSync(
    new URL("./fixtures/machinations-combat-window.json", import.meta.url),
    "utf8",
  ),
);
const actualCombatResult = JSON.parse(
  readFileSync(
    new URL("./fixtures/machinations-combat-result.json", import.meta.url),
    "utf8",
  ),
);
const actualScientistPenalty = JSON.parse(
  readFileSync(
    new URL("./fixtures/machinations-scientist-penalty.json", import.meta.url),
    "utf8",
  ),
);
const actualZeroAction = JSON.parse(
  readFileSync(
    new URL("./fixtures/machinations-zero-action-window.json", import.meta.url),
    "utf8",
  ),
);
const actualElderThingTarget = JSON.parse(
  readFileSync(
    new URL("./fixtures/machinations-elderthing-target.json", import.meta.url),
    "utf8",
  ),
);
const actualVanishingHistory = JSON.parse(
  readFileSync(
    new URL("./fixtures/machinations-vanishing-history.json", import.meta.url),
    "utf8",
  ),
);
const actualActionLoss = JSON.parse(
  readFileSync(
    new URL("./fixtures/machinations-action-loss-choice.json", import.meta.url),
    "utf8",
  ),
);
function snapshot(group = "Past"): any {
  return {
    playerId: `player-${group}`,
    game: {
      id: `game-${group}`,
      inSetup: false,
      phase: "InvestigationPhase",
      investigators: {
        [actorId]: {
          id: actorId,
          playerId: `player-${group}`,
          remainingActions: 3,
          placement: { tag: "AtLocation", contents: "here" },
          tokens: [
            ["Clue", 4],
            ["Resource", 5],
          ],
          hand: [],
          engagedEnemies: [],
        },
      },
      locations: {
        here: {
          id: "here",
          cardCode: "c87005b",
          revealed: true,
          tokens: [],
          connectedLocations: [],
        },
      },
      assets: {},
      enemies: {},
      stories: {},
      treacheries: {},
      acts: { act: { id: "act", cardCode: "c87004" } },
      agendas: {},
      scenario: { id: "87001", log: [] },
    },
  };
}
const choice = (
  tag: string,
  raw: any = {},
  label = tag,
  answerIndex = 0,
): any => ({ tag, raw: { tag, ...raw }, label, answerIndex, disabled: false });
const question = (s: any, choices: any[], extra: any = {}): any => ({
  kind: "choices",
  tag: "ChooseOne",
  playerId: s.playerId,
  questionVersion: 8,
  choices,
  isWindow: false,
  isPlayerWindow: false,
  ...extra,
});
const ability = (
  code: string,
  index: number,
  id: string,
  source = "StorySource",
  answerIndex = 0,
  extra: any = {},
): any =>
  choice(
    "AbilityLabel",
    {
      investigatorId: actorId,
      ability: {
        cardCode: `c${code}`,
        index,
        source: { tag: source, contents: id },
        ...extra,
      },
    },
    `ability-${code}-${index}`,
    answerIndex,
  );
const endTurn = (answerIndex = 3) =>
  choice("EndTurnButton", { investigatorId: actorId }, "End turn", answerIndex);
const select = (
  s: any,
  q: any,
  memory: any = { group: "Past" },
  cards: any[] = [],
): any => selectMachinationsChoice({ snapshot: s, question: q, memory, cards });
const asset = (id: string, code: string, where = "here") => ({
  id,
  cardCode: `c${code}`,
  placement: { tag: "AtLocation", contents: where },
});
function sealed(s: any) {
  for (const [entity, fields] of [
    [s.game.scenario, ["meta", "setAsideCards", "cardsUnderScenarioReference"]],
    [s.game.investigators[actorId], ["deck", "cardsUnderneath"]],
    ...Object.values(s.game.locations).map((l) => [l, ["cardsUnderneath"]]),
  ] as any) {
    for (const field of fields)
      Object.defineProperty(entity, field, {
        get() {
          throw new Error(`Forbidden hidden read: ${field}`);
        },
      });
  }
  for (const field of ["cards", "queue", "seed", "randomState"])
    Object.defineProperty(s.game, field, {
      get() {
        throw new Error(`Forbidden hidden read: ${field}`);
      },
    });
}
function setupScientists(s: any, group = "Past") {
  const codes: any = {
    Past: ["87012", "87013"],
    Present: ["87021", "87022"],
    Future: ["87030", "87031"],
  };
  s.game.assets = {
    thomas: asset("thomas", codes[group][0]),
    mary: asset("mary", codes[group][1]),
  };
}

test("Machinations tactics never consult replicas, RNG, decks, queues or set-aside identities", () => {
  const s = snapshot(),
    rescue = ability("87005b", 2, "here", "LocationSource");
  sealed(s);
  assert.equal(
    select(
      s,
      question(s, [rescue, endTurn()], {
        tag: "PlayerWindowChooseOne",
        isPlayerWindow: true,
      }),
    ).choice,
    rescue,
  );
});

test("unknown, malformed, disabled, foreign-player and stale memory decisions fail closed", () => {
  const s = snapshot(),
    offered = ability("87005b", 2, "here", "LocationSource");
  const q = question(s, [offered], { isPlayerWindow: true });
  assert.equal(select(s, q, {}), undefined);
  assert.equal(select(s, { ...q, playerId: "other-seat" }), undefined);
  assert.equal(select(s, { ...q, questionVersion: -1 }), undefined);
  assert.equal(
    select(s, q, { group: "Past", gameId: "other-game" }),
    undefined,
  );
  offered.disabled = true;
  assert.equal(select(s, q), undefined);
  assert.equal(
    select(
      s,
      question(s, [choice("Label", { label: "Choose an unknown destiny" })]),
    ),
    undefined,
  );
});

test("nonbasic abilities require exact visible physical source, code and actor", () => {
  const s = snapshot();
  for (const offered of [
    ability("87005b", 2, "absent", "LocationSource"),
    ability("87034", 2, "here", "LocationSource"),
  ])
    assert.equal(
      select(s, question(s, [offered], { isPlayerWindow: true })),
      undefined,
    );
  const foreign = ability("87005b", 2, "here", "LocationSource");
  foreign.raw.investigatorId = "foreign-actor";
  assert.equal(
    select(s, question(s, [foreign], { isPlayerWindow: true })),
    undefined,
  );
  s.game.locations.here.revealed = false;
  assert.equal(
    select(
      s,
      question(s, [ability("87005b", 2, "here", "LocationSource")], {
        isPlayerWindow: true,
      }),
    ),
    undefined,
  );
});

test("facedown exploration depends on offered physical IDs, never hidden card identity/name/shroud", () => {
  const s = snapshot();
  setupScientists(s);
  s.game.locations.unknown = {
    id: "unknown",
    revealed: false,
    connectedLocations: ["here"],
  };
  for (const field of ["cardCode", "name", "shroud"])
    Object.defineProperty(s.game.locations.unknown, field, {
      get() {
        throw new Error(`Hidden ${field}`);
      },
    });
  sealed(s);
  const move = ability("87099", 104, "unknown", "LocationSource");
  assert.equal(
    select(s, question(s, [move, endTurn()], { isPlayerWindow: true })).choice,
    move,
  );
});

test("native rescue is used for missing scientists and never replayed once both are present", () => {
  const s = snapshot(),
    rescue = ability("87005b", 2, "here", "LocationSource"),
    end = endTurn();
  const q = question(s, [rescue, end], { isPlayerWindow: true });
  assert.equal(select(s, q).choice, rescue);
  setupScientists(s);
  assert.equal(select(s, q).choice, end);
  s.game.assets.thomas.placement = { tag: "OutOfPlay" };
  assert.equal(select(s, q).choice, rescue);
});

test("scientist move reaction precedes optional skip; subsequent targets bind owned act witness", () => {
  const s = snapshot();
  s.game.assets.thomas = asset("thomas", "87012", "origin");
  const reaction = ability("87004", 1, "act", "ActSource"),
    skip = choice("SkipTriggersButton", {}, "Skip", 1);
  const q = question(s, [skip, reaction], {
    tag: "WindowChooseOne",
    isWindow: true,
  });
  const selected = select(s, q);
  assert.equal(selected.choice, reaction);
  const m = observeMachinationsChoice({
    snapshot: s,
    question: q,
    selection: selected,
    memory: { group: "Past" },
  });
  const carry = choice(
    "TargetLabel",
    { target: { tag: "AssetTarget", contents: "thomas" } },
    "Thomas",
    4,
  );
  const done = choice("Done", { label: "$doneMovingScientists" }, "Done", 5);
  const followup = question(s, [carry, done], {
    tag: "ChooseSome",
    source: {
      tag: "AbilitySource",
      contents: [{ tag: "ActSource", contents: "act" }, 1],
    },
  });
  assert.equal(select(s, followup, m).choice, carry);
  s.game.assets.thomas.placement.contents = "here";
  assert.equal(select(s, followup, m).choice, done);
  assert.equal(select(s, followup, { group: "Past" }), undefined);
  assert.equal(
    select(
      s,
      { ...followup, source: { tag: "ActSource", contents: "foreign" } },
      m,
    ),
    undefined,
  );
});

test("rescue result accepts only actual offered local scientist CardLabel under own successful ability witness", () => {
  const s = snapshot(),
    rescue = ability("87005b", 2, "here", "LocationSource"),
    q = question(s, [rescue], { isPlayerWindow: true });
  const memory = observeMachinationsChoice({
    snapshot: s,
    question: q,
    selection: select(s, q),
    memory: { group: "Past" },
  });
  const actual = choice("CardLabel", { cardCode: "c87013" }, "Mary", 2),
    foreign = choice("CardLabel", { cardCode: "c87022" }, "Foreign Mary", 1);
  actual.cardCode = "c87013";
  foreign.cardCode = "c87022";
  const followup = question(s, [foreign, actual]);
  sealed(s);
  assert.equal(select(s, followup, memory).choice, actual);
  assert.equal(select(s, followup, { group: "Past" }), undefined);
  actual.disabled = true;
  assert.equal(select(s, followup, memory), undefined);
});

function testSkill(
  s: any,
  skill: string,
  sourceId = "here",
  index = 2,
  targetId = actorId,
) {
  return choice(
    "SkillLabel",
    {
      skillType: skill,
      messages: [
        {
          tag: "BeginSkillTestWithPreMessages'",
          contents: [
            [],
            {
              id: "fresh-native-test",
              investigator: actorId,
              source: {
                tag: "AbilitySource",
                contents: [
                  { tag: "LocationSource", contents: sourceId },
                  index,
                ],
              },
              target: { tag: "InvestigatorTarget", contents: targetId },
              type: { tag: "SkillSkillTest", contents: skill },
            },
          ],
        },
      ],
    },
    skill,
    skill === "SkillCombat" ? 1 : 0,
  );
}
test("actual nested SkillLabel chooses printed stronger skill and rejects foreign source/index/actor/target", () => {
  const s = snapshot(),
    rescue = ability("87005b", 2, "here", "LocationSource"),
    q = question(s, [rescue], { isPlayerWindow: true });
  const memory = observeMachinationsChoice({
    snapshot: s,
    question: q,
    selection: select(s, q),
    memory: { group: "Past" },
  });
  const combat = testSkill(s, "SkillCombat"),
    agility = testSkill(s, "SkillAgility");
  const definitions = [{ code: "01001", skill_combat: 4, skill_agility: 2 }];
  assert.equal(
    select(s, question(s, [agility, combat]), memory, definitions).choice,
    combat,
  );
  for (const bad of [
    testSkill(s, "SkillCombat", "elsewhere"),
    testSkill(s, "SkillCombat", "here", 1),
    testSkill(s, "SkillCombat", "here", 2, "other"),
  ])
    assert.equal(select(s, question(s, [bad]), memory, definitions), undefined);
  const bad = testSkill(s, "SkillCombat");
  bad.raw.messages[0].contents[1].investigator = "foreign";
  assert.equal(select(s, question(s, [bad]), memory, definitions), undefined);
});

test("Future discovery retains eight local clues despite a test being offered earlier", () => {
  const s = snapshot("Future");
  setupScientists(s, "Future");
  s.game.locations.here.cardCode = "c87028";
  s.game.stories.legacy = { id: "legacy", cardCode: "c87024" };
  const discover = ability("87024", 2, "legacy"),
    end = endTurn(),
    q = question(s, [discover, end], { isPlayerWindow: true });
  s.game.investigators[actorId].tokens = [["Clue", 7]];
  assert.equal(select(s, q, { group: "Future" }).choice, end);
  s.game.investigators[actorId].tokens = [["Clue", 8]];
  sealed(s);
  assert.equal(select(s, q, { group: "Future" }).choice, discover);
});

test("Present teleportation retains four local clues and never uses global replica totals", () => {
  const s = snapshot("Present");
  setupScientists(s, "Present");
  s.game.stories.legacy = { id: "legacy", cardCode: "c87015" };
  const research = ability("87015", 2, "legacy"),
    end = endTurn(),
    q = question(s, [research, end], { isPlayerWindow: true });
  s.game.investigators[actorId].tokens = [["Clue", 3]];
  assert.equal(select(s, q, { group: "Present" }).choice, end);
  s.game.investigators[actorId].tokens = [["Clue", 4]];
  assert.equal(select(s, q, { group: "Present" }).choice, research);
});

test("Redeem reserves all remaining printed three-clue payments before placing scientists at risk", () => {
  const s = snapshot();
  setupScientists(s);
  s.game.stories.redeem = { id: "redeem", cardCode: "c87034", flipped: true };
  s.game.enemies.edwin = {
    id: "edwin",
    cardCode: "c87037a",
    exhausted: false,
    placement: { tag: "InThreatArea", contents: actorId },
  };
  s.game.investigators[actorId].engagedEnemies = ["edwin"];
  const parley = ability("87034", 2, "redeem"),
    evade = choice("EvadeLabel", { enemyId: "edwin" }, "Evade", 1);
  const q = question(s, [parley, evade], { isPlayerWindow: true });
  s.game.investigators[actorId].tokens = [["Clue", 9]];
  assert.equal(select(s, q).choice, parley);
  s.game.investigators[actorId].tokens = [["Clue", 2]];
  assert.equal(select(s, q).choice, evade);
  s.game.enemies.edwin.tokens = [["Redemption", 2]];
  s.game.investigators[actorId].tokens = [["Clue", 3]];
  assert.equal(select(s, q).choice, parley);
});

test("attack-safe Abomination action recognizes native AnyEnemy matcher; rejects missing AOO guard while engaged", () => {
  const s = snapshot();
  setupScientists(s);
  s.game.stories.plot = { id: "plot", cardCode: "c87042", flipped: true };
  s.game.enemies.boss = {
    id: "boss",
    cardCode: "c87043",
    exhausted: false,
    placement: { tag: "InThreatArea", contents: actorId },
  };
  const attack = ability("87042", 1, "plot", "StorySource", 0, {
    doesNotProvokeAttacksOfOpportunity: { tag: "AnyEnemy" },
  });
  const q = question(s, [attack], { isPlayerWindow: true });
  assert.equal(select(s, q).choice, attack);
  attack.raw.ability.doesNotProvokeAttacksOfOpportunity = null;
  assert.equal(select(s, q), undefined);
});

test("Anomalies only chooses actual local horror and does not read selected dormant plots", () => {
  const s = snapshot();
  setupScientists(s);
  s.game.stories.plot = { id: "plot", cardCode: "c87038", flipped: true };
  const clear = ability("87038", 1, "plot"),
    end = endTurn(),
    q = question(s, [clear, end], { isPlayerWindow: true });
  assert.equal(select(s, q).choice, end);
  s.game.locations.here.tokens = [["Horror", 1]];
  sealed(s);
  assert.equal(select(s, q).choice, clear);
});

test("Mob search follows actual own story offer and leaves encounter order sealed", () => {
  const s = snapshot();
  setupScientists(s);
  s.game.stories.mob = { id: "mob", cardCode: "c87039", flipped: true };
  const remove = ability("87039", 1, "mob"),
    q = question(s, [remove], { isPlayerWindow: true });
  const memory = observeMachinationsChoice({
    snapshot: s,
    question: q,
    selection: select(s, q),
    memory: { group: "Past" },
  });
  const search = choice(
    "Label",
    { label: "$standalone.machinationsThroughTime.mobTroubles.search" },
    "Search for Sheldon Gang",
    2,
  );
  sealed(s);
  assert.equal(select(s, question(s, [search]), memory).choice, search);
  assert.equal(select(s, question(s, [search]), { group: "Past" }), undefined);
});

test("observer is immutable and ignores unoffered clone/disabled choices and another seat", () => {
  const s = snapshot(),
    rescue = ability("87005b", 2, "here", "LocationSource"),
    q = question(s, [rescue], { isPlayerWindow: true });
  const memory = Object.freeze({ group: "Past" as const });
  const selected = select(s, q, memory),
    next = observeMachinationsChoice({
      snapshot: s,
      question: q,
      selection: selected,
      memory,
    });
  assert.equal(next.lastAbility?.witness.gameId, s.game.id);
  assert.equal(Object.hasOwn(memory, "lastAbility"), false);
  assert.deepEqual(
    observeMachinationsChoice({
      snapshot: s,
      question: q,
      selection: { ...selected, choice: { ...rescue } },
      memory,
    }),
    memory,
  );
  rescue.disabled = true;
  assert.deepEqual(
    observeMachinationsChoice({
      snapshot: s,
      question: q,
      selection: selected,
      memory,
    }),
    memory,
  );
  rescue.disabled = false;
  assert.deepEqual(
    observeMachinationsChoice({
      snapshot: s,
      question: { ...q, playerId: "other" },
      selection: selected,
      memory,
    }),
    memory,
  );
});

test("native commit binds own-hand card and exact nested test continuation", () => {
  const s = snapshot();
  const card = { id: "own-skill", cardCode: "c01091", owner: actorId };
  s.game.investigators[actorId].hand = [card];
  s.game.skillTest = {
    id: "native-test",
    investigator: actorId,
    skills: ["SkillIntellect"],
    committedCards: {},
    modifiedSkillValue: 3,
    modifiedDifficulty: 3,
  };
  const commit = choice(
    "TargetLabel",
    {
      target: { tag: "CardIdTarget", contents: card.id },
      messages: [
        {
          tag: "SkillTestMessage",
          contents: {
            tag: "SkillTestCommitCard_",
            contents: [actorId, { tag: "PlayerCard", contents: card }],
          },
        },
        {
          tag: "CommitToSkillTest_",
          contents: [
            "native-test",
            { tag: "StartSkillTestButton", investigatorId: actorId },
          ],
        },
      ],
    },
    "Commit Deduction",
    1,
  );
  const start = choice(
      "StartSkillTestButton",
      { investigatorId: actorId },
      "Start",
      2,
    ),
    q = question(s, [commit, start]);
  const cards = [{ code: "01091", type_code: "skill", skill_intellect: 1 }];
  sealed(s);
  assert.equal(select(s, q, { group: "Past" }, cards).choice, commit);
  commit.raw.messages[1].contents[0] = "other-test";
  assert.equal(select(s, q, { group: "Past" }, cards).choice, start);
  card.owner = "foreign";
  assert.equal(select(s, q, { group: "Past" }, cards).choice, start);
});

test("printed legacy route uses revealed university, not a facedown preloaded identity", () => {
  const s = snapshot();
  setupScientists(s);
  s.game.stories.legacy = { id: "legacy", cardCode: "c87006" };
  s.game.locations.university = {
    id: "university",
    cardCode: "c87010",
    revealed: true,
    connectedLocations: ["here"],
  };
  s.game.locations.home = {
    id: "home",
    cardCode: "c87011",
    revealed: true,
    connectedLocations: ["here"],
  };
  const home = ability("87011", 104, "home", "LocationSource", 0),
    university = ability("87010", 104, "university", "LocationSource", 1);
  sealed(s);
  assert.equal(
    select(s, question(s, [home, university], { isPlayerWindow: true })).choice,
    university,
  );
});

test("malformed clue counters cannot authorize a paid objective", () => {
  const s = snapshot();
  setupScientists(s);
  s.game.stories.redeem = { id: "redeem", cardCode: "c87034", flipped: true };
  const offered = ability("87034", 2, "redeem"),
    end = endTurn(),
    q = question(s, [offered, end], { isPlayerWindow: true });
  for (const value of [-1, "9", 2.5, NaN]) {
    s.game.investigators[actorId].tokens = [["Clue", value]];
    assert.equal(select(s, q).choice, end);
  }
});

test("Bitter Rivalry follows only the exact owned nested fight message and live physical Rival", () => {
  const s = snapshot();
  setupScientists(s);
  s.game.stories.bitter = { id: "bitter", cardCode: "c87033", flipped: true };
  s.game.enemies.edwin = {
    id: "edwin",
    cardCode: "c87037a",
    placement: { tag: "AtLocation", contents: "here" },
  };
  s.game.investigators[actorId].tokens = [["Clue", 9]];
  const action = ability("87033", 2, "bitter"),
    q = question(s, [action], { isPlayerWindow: true });
  const memory = observeMachinationsChoice({
    snapshot: s,
    question: q,
    selection: select(s, q),
    memory: { group: "Past" },
  });
  const fight = choice(
    "Label",
    {
      label: "$Fight Edwin Bennet",
      messages: [
        {
          tag: "FightMessage",
          contents: {
            tag: "ChooseFightEnemy_",
            contents: {
              chooseFightInvestigator: actorId,
              chooseFightEnemyMatcher: {
                tag: "EnemyWithId",
                contents: "edwin",
              },
              chooseFightSource: {
                tag: "AbilitySource",
                contents: [{ tag: "StorySource", contents: "bitter" }, 2],
              },
              chooseFightSkillTest: "native-fight-id",
            },
          },
        },
      ],
    },
    "Fight Edwin Bennet",
  );
  assert.equal(select(s, question(s, [fight]), memory).choice, fight);
  fight.raw.messages[0].contents.contents.chooseFightInvestigator = "foreign";
  assert.equal(select(s, question(s, [fight]), memory), undefined);
  fight.raw.messages[0].contents.contents.chooseFightInvestigator = actorId;
  s.game.enemies.edwin.placement.tag = "OutOfPlay";
  assert.equal(select(s, question(s, [fight]), memory), undefined);
});

test("fully marked Rival can be brought to the real university without spending another clue", () => {
  const s = snapshot();
  setupScientists(s);
  s.game.locations.here.cardCode = "c87010";
  s.game.stories.redeem = { id: "redeem", cardCode: "c87034", flipped: true };
  s.game.enemies.edwin = {
    id: "edwin",
    cardCode: "c87037a",
    tokens: [["Redemption", 3]],
    placement: { tag: "AtLocation", contents: "elsewhere" },
  };
  s.game.investigators[actorId].tokens = [];
  const bring = ability("87034", 1, "redeem"),
    end = endTurn(),
    q = question(s, [bring, end], { isPlayerWindow: true });
  assert.equal(select(s, q).choice, bring);
  s.game.investigators[actorId].remainingActions = 1;
  assert.equal(select(s, q).choice, end);
});

test("actual232 nested apostrophe-and-underscore skill constructor selects public Roland combat without hidden reads", () => {
  const fixture = structuredClone(actualRescue),
    s = fixture.snapshot;
  const q: any = companionQuestion(s.game, s.playerId)!;
  assert.equal(q.tag, "ChooseOne");
  assert.equal(
    q.choices[0].raw.messages[0].contents.tag,
    "BeginSkillTestWithPreMessages'_",
  );
  sealed(s);
  const decision = select(s, q, fixture.memory);
  assert.equal(decision.choice.answerIndex, fixture.expected.answerIndex);
  assert.equal(decision.choice.raw.skillType, fixture.expected.skillType);
  assert.ok(q.choices.includes(decision.choice));
  assert.equal(fixture.provenance.wholeScenarioCompleted, false);
});

test("actual232 rescue rejects other actor/source/index/target and an invented constructor", () => {
  for (const change of [
    (q: any) => {
      q.choices[0].raw.messages[0].contents.contents[1].investigator =
        "foreign";
    },
    (q: any) => {
      q.choices[0].raw.messages[0].contents.contents[1].source.contents[0].contents =
        "foreign-location";
    },
    (q: any) => {
      q.choices[0].raw.messages[0].contents.contents[1].source.contents[1] = 1;
    },
    (q: any) => {
      q.choices[0].raw.messages[0].contents.contents[1].target.contents =
        "foreign";
    },
    (q: any) => {
      q.choices[0].raw.messages[0].contents.tag = "InventedBeginSkillTest";
    },
  ]) {
    const fixture = structuredClone(actualRescue),
      s = fixture.snapshot;
    const q: any = companionQuestion(s.game, s.playerId)!;
    q.choices = [q.choices[0]];
    change(q);
    sealed(s);
    assert.equal(select(s, q, fixture.memory), undefined);
  }
});

test("actual232 Mary result selects direct Successful_ and never the nested Perception bonus", () => {
  const fixture = structuredClone(actualInvestigation),
    s = fixture.snapshot,
    q: any = companionQuestion(s.game, s.playerId)!;
  sealed(s);
  const selected = select(s, q, fixture.memory);
  assert.equal(selected.choice, q.choices[0]);
  assert.equal(selected.choice.answerIndex, fixture.expected.answerIndex);
  assert.ok(q.choices.includes(selected.choice));
  assert.equal(fixture.provenance.wholeScenarioCompleted, false);
  q.choices = [q.choices[1]];
  assert.equal(select(s, q, fixture.memory), undefined);
});

test("investigation result binds own actor, exact source, location, proxy target, step and success margin", () => {
  const changes = [
    (s: any, q: any) => {
      q.playerId = "foreign";
    },
    (s: any) => {
      s.game.skillTest.investigator = "foreign";
    },
    (s: any) => {
      s.game.skillTest.step = "DetermineSkillTestResultStep";
    },
    (s: any) => {
      s.game.skillTest.result.tag = "FailedBy";
    },
    (s: any) => {
      s.game.skillTest.result.contents[1] = -1;
    },
    (s: any) => {
      s.game.skillTest.source.contents[1] = 2;
    },
    (s: any, q: any, m: any) => {
      s.game.skillTest.source.contents[1] = undefined;
      q.choices[0].raw.messages[0].contents.contents[2].contents[1] = undefined;
      m.lastAbility.index = undefined;
      m.lastAbility.cardCode = "99999";
      (Object.values(s.game.assets)[0] as any).cardCode = "c99999";
    },
    (s: any) => {
      s.game.skillTest.source.contents[0].contents = "foreign-asset";
    },
    (s: any) => {
      s.game.skillTest.target.contents[0].contents = "foreign-location";
    },
    (s: any) => {
      s.game.skillTest.target.contents[1].contents = "foreign-asset";
    },
    (s: any) => {
      Object.values(s.game.locations).forEach((l: any) => (l.revealed = false));
    },
    (s: any, q: any) => {
      q.choices[0].disabled = true;
    },
    (s: any, q: any) => {
      q.choices.push({ ...q.choices[0], answerIndex: 2 });
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents.contents[1] = "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents.contents[2].contents[1] = 2;
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents.contents[3].contents =
        "foreign-asset";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents.contents[4] = 7;
    },
    (s: any, q: any, m: any) => {
      m.lastAbility.witness.actorId = "foreign";
    },
    (s: any, q: any, m: any) => {
      m.lastAbility.source.contents = "foreign-asset";
    },
  ];
  for (const change of changes) {
    const fixture = structuredClone(actualInvestigation),
      s = fixture.snapshot,
      q: any = companionQuestion(s.game, s.playerId)!;
    change(s, q, fixture.memory);
    sealed(s);
    assert.equal(select(s, q, fixture.memory), undefined);
  }
});

test("pinned native Flashlight keeps a LocationTarget and requires an owned controlled physical source", () => {
  const fixture = structuredClone(actualInvestigation),
    s = fixture.snapshot,
    a: any = Object.values(s.game.assets)[0];
  a.cardCode = "c01087";
  a.controller = actorId;
  a.placement = { tag: "InPlayArea", contents: actorId };
  fixture.memory.lastAbility.cardCode = "01087";
  s.game.skillTest.target = s.game.skillTest.target.contents[0];
  const q: any = companionQuestion(s.game, s.playerId)!;
  q.choices[0].raw.messages[0].contents.contents[3] = s.game.skillTest.target;
  sealed(s);
  assert.equal(select(s, q, fixture.memory).choice, q.choices[0]);
  s.game.skillTest.target = {
    tag: "ProxyTarget",
    contents: [s.game.skillTest.target, { tag: "AssetTarget", contents: a.id }],
  };
  assert.equal(select(s, q, fixture.memory), undefined);
  s.game.skillTest.target = s.game.skillTest.target.contents[0];
  a.controller = "foreign";
  a.placement.contents = "foreign";
  assert.equal(select(s, q, fixture.memory), undefined);
});

test("pinned Present Mary investigate is ability 2; her ability 1 skill boost cannot bind a result", () => {
  const fixture = structuredClone(actualInvestigation),
    s = fixture.snapshot,
    a: any = Object.values(s.game.assets)[0];
  a.cardCode = "c87022";
  fixture.memory.lastAbility.cardCode = "87022";
  fixture.memory.lastAbility.index = 2;
  s.game.skillTest.source.contents[1] = 2;
  const q: any = companionQuestion(s.game, s.playerId)!;
  q.choices[0].raw.messages[0].contents.contents[2].contents[1] = 2;
  sealed(s);
  assert.equal(select(s, q, fixture.memory).choice, q.choices[0]);
  fixture.memory.lastAbility.index = 1;
  s.game.skillTest.source.contents[1] = 1;
  q.choices[0].raw.messages[0].contents.contents[2].contents[1] = 1;
  assert.equal(select(s, q, fixture.memory), undefined);
});

test("actual232 combat window uses the own physical Machete against its single ready engaged non-Rival", () => {
  const fixture = structuredClone(actualCombat),
    s = fixture.snapshot,
    q: any = companionQuestion(s.game, s.playerId)!;
  sealed(s);
  assert.equal(select(s, q, fixture.memory).choice.answerIndex, 11);
  q.choices = [q.choices[8]];
  assert.equal(select(s, q, fixture.memory).choice.answerIndex, 8);
  assert.equal(q.choices[0].raw.ability.index, 100);
});

test("actual native basic fight rejects a different actor, enemy, action or index", () => {
  for (const change of [
    (c: any) => {
      c.raw.investigatorId = "foreign";
    },
    (c: any) => {
      c.raw.ability.source.contents = "foreign-enemy";
    },
    (c: any) => {
      c.raw.ability.index = 101;
    },
    (c: any) => {
      c.raw.ability.basic = false;
    },
    (c: any) => {
      c.raw.ability.type.actions.contents = "Evade";
    },
    (c: any) => {
      c.disabled = true;
    },
  ]) {
    const fixture = structuredClone(actualCombat),
      s = fixture.snapshot,
      q: any = companionQuestion(s.game, s.playerId)!;
    q.choices = [q.choices[8]];
    change(q.choices[0]);
    sealed(s);
    assert.equal(select(s, q, fixture.memory), undefined);
  }
});

test("native Rival basic evade is accepted while its basic fight and untargeted weapon are refused", () => {
  const fixture = structuredClone(actualCombat),
    s = fixture.snapshot,
    e: any = Object.values(s.game.enemies)[0];
  e.cardCode = "c87037a";
  const q: any = companionQuestion(s.game, s.playerId)!;
  for (const c of [q.choices[8], q.choices[9]])
    c.raw.ability.cardCode = "c87037a";
  sealed(s);
  assert.equal(select(s, q, fixture.memory).choice.answerIndex, 9);
  q.choices = [q.choices[8], q.choices[11]];
  assert.equal(select(s, q, fixture.memory), undefined);
});

test("Machete requires current own control and cannot risk another local Rival target", () => {
  for (const change of [
    (s: any) => {
      const a: any = Object.values(s.game.assets)[0];
      a.controller = "foreign";
      a.placement.contents = "foreign";
    },
    (s: any) => {
      s.game.enemies.edwin = {
        id: "edwin",
        cardCode: "c87037a",
        exhausted: true,
        placement: {
          tag: "AtLocation",
          contents: s.game.investigators[actorId].placement.contents,
        },
      };
    },
    (s: any, q: any) => {
      q.choices[0].raw.investigatorId = "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].raw.ability.type.actions.contents = "Investigate";
    },
  ]) {
    const fixture = structuredClone(actualCombat),
      s = fixture.snapshot,
      q: any = companionQuestion(s.game, s.playerId)!;
    q.choices = [q.choices[11]];
    change(s, q);
    sealed(s);
    assert.equal(select(s, q, fixture.memory), undefined);
  }
});

test("the currently revealed Uneasy Alliance bring uses its own offer only at a prepared university after combat", () => {
  const s = snapshot();
  setupScientists(s);
  s.game.locations.here.cardCode = "c87010";
  s.game.stories.alliance = {
    id: "alliance",
    cardCode: "c87035",
    flipped: true,
  };
  s.game.assets.edwin = asset("edwin", "87037b", "elsewhere");
  const bring = ability("87035", 2, "alliance", "StorySource", 0, {
      type: { tag: "ActionAbility", cost: { tag: "ActionCost", contents: 1 } },
    }),
    end = endTurn(),
    q = question(s, [bring, end], { isPlayerWindow: true });
  sealed(s);
  assert.equal(select(s, q).choice, bring);
  s.game.assets.edwin.placement.contents = "here";
  assert.equal(select(s, q).choice, end);
  s.game.assets.edwin.exhausted = true;
  assert.equal(select(s, q).choice, bring);
  s.game.assets.mary.placement.contents = "elsewhere";
  assert.equal(select(s, q).choice, end);
  s.game.assets.mary.placement.contents = "here";
  s.game.enemies.satyr = {
    id: "satyr",
    cardCode: "c87044",
    exhausted: false,
    placement: { tag: "InThreatArea", contents: actorId },
  };
  assert.equal(select(s, q), undefined);
});

test("actual232 Machete result selects its direct Successful_ rather than deferred Overpower", () => {
  const fixture = structuredClone(actualCombatResult),
    s = fixture.snapshot,
    q: any = companionQuestion(s.game, s.playerId)!;
  sealed(s);
  assert.equal(select(s, q, fixture.memory).choice, q.choices[0]);
  q.choices = [q.choices[1]];
  assert.equal(select(s, q, fixture.memory), undefined);
});

test("combat results require exact own test, physical weapon, live target, step and direct success margin", () => {
  for (const change of [
    (s: any) => {
      s.game.skillTest.investigator = "foreign";
    },
    (s: any) => {
      s.game.skillTest.action = "Parley";
    },
    (s: any) => {
      s.game.skillTest.step = "DetermineSkillTestResultStep";
    },
    (s: any) => {
      s.game.skillTest.result.tag = "FailedBy";
    },
    (s: any) => {
      s.game.skillTest.target.contents = "foreign";
    },
    (s: any) => {
      s.game.skillTest.source.contents[0].contents = "foreign";
    },
    (s: any) => {
      s.game.skillTest.source.contents[1] = 2;
    },
    (s: any) => {
      const a: any = Object.values(s.game.assets)[0];
      a.controller = "foreign";
      a.placement.contents = "foreign";
    },
    (s: any) => {
      const e: any = Object.values(s.game.enemies)[0];
      e.placement = { tag: "AtLocation", contents: "elsewhere" };
    },
    (s: any) => {
      const e: any = Object.values(s.game.enemies)[0];
      e.cardCode = "c87037a";
    },
    (s: any, q: any) => {
      q.choices[0].disabled = true;
    },
    (s: any, q: any) => {
      q.choices.push({ ...q.choices[0], answerIndex: 2 });
    },
    (s: any, q: any, m: any) => {
      m.lastAbility.witness.playerId = "foreign";
    },
    (s: any, q: any, m: any, success: any) => {
      success.contents[1] = "foreign";
    },
    (s: any, q: any, m: any, success: any) => {
      success.contents[2].contents[1] = 2;
    },
    (s: any, q: any, m: any, success: any) => {
      success.contents[3].contents = "foreign";
    },
    (s: any, q: any, m: any, success: any) => {
      success.contents[4] = 4;
    },
  ]) {
    const fixture = structuredClone(actualCombatResult),
      s = fixture.snapshot,
      q: any = companionQuestion(s.game, s.playerId)!,
      success = q.choices[0].raw.messages.find(
        (m: any) =>
          m.tag === "SkillTestMessage" && m.contents.tag === "Successful_",
      ).contents;
    change(s, q, fixture.memory, success);
    sealed(s);
    assert.equal(select(s, q, fixture.memory), undefined);
  }
});

test("native basic fight/evade result indexes stay exact and Rival is never accepted as a basic kill", () => {
  for (const action of ["Fight", "Evade"]) {
    const fixture = structuredClone(actualCombatResult),
      s = fixture.snapshot,
      e: any = Object.values(s.game.enemies)[0],
      index = action === "Fight" ? 100 : 101;
    s.game.skillTest.action = action;
    s.game.skillTest.source = {
      tag: "AbilitySource",
      contents: [{ tag: "EnemySource", contents: e.id }, index],
    };
    fixture.memory.lastAbility.cardCode = "87044";
    fixture.memory.lastAbility.source = s.game.skillTest.source.contents[0];
    fixture.memory.lastAbility.index = index;
    const q: any = companionQuestion(s.game, s.playerId)!;
    const success = q.choices[0].raw.messages.find(
      (m: any) =>
        m.tag === "SkillTestMessage" && m.contents.tag === "Successful_",
    ).contents;
    success.contents[0][0] = action;
    success.contents[2] = s.game.skillTest.source;
    sealed(s);
    assert.equal(select(s, q, fixture.memory).choice, q.choices[0]);
    e.cardCode = "c87037a";
    fixture.memory.lastAbility.cardCode = "87037a";
    assert.equal(!!select(s, q, fixture.memory), action === "Evade");
    fixture.memory.lastAbility.index = 1;
    s.game.skillTest.source.contents[1] = 1;
    assert.equal(select(s, q, fixture.memory), undefined);
  }
});

test("actual failed ElderThing penalty chooses the live local scientist's stronger remaining capacity", () => {
  const fixture = structuredClone(actualScientistPenalty),
    s = fixture.snapshot,
    a: any = Object.values(s.game.assets)[0],
    q: any = companionQuestion(s.game, s.playerId)!;
  sealed(s);
  assert.equal(select(s, q, fixture.memory).choice.answerIndex, 0);
  a.tokens = [["Damage", 1]];
  assert.equal(select(s, q, fixture.memory).choice.answerIndex, 1);
  a.tokens = [["Horror", 1]];
  assert.equal(select(s, q, fixture.memory).choice.answerIndex, 0);
});

test("scientist penalty rejects another seat/test/asset/source, malformed amounts and nested effects", () => {
  for (const change of [
    (s: any, q: any) => {
      q.playerId = "foreign";
    },
    (s: any) => {
      s.game.skillTest.investigator = "foreign";
    },
    (s: any) => {
      s.game.skillTest.result.tag = "SucceededBy";
    },
    (s: any) => {
      s.game.skillTest.step = "RevealChaosTokenStep";
    },
    (s: any) => {
      s.game.skillTest.revealedChaosTokens = {};
    },
    (s: any) => {
      s.game.skillTest.revealedChaosTokens[0].chaosTokenRevealedBy = "foreign";
    },
    (s: any) => {
      s.game.skillTest.revealedChaosTokens[0].chaosTokenCancelled = true;
    },
    (s: any) => {
      const a: any = Object.values(s.game.assets)[0];
      a.placement.contents = "elsewhere";
    },
    (s: any) => {
      const a: any = Object.values(s.game.assets)[0];
      a.cardCode = "c99999";
    },
    (s: any) => {
      const a: any = Object.values(s.game.assets)[0];
      a.tokens = [["Damage", -1]];
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents[0] = "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents[1].contents = "Skull";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents[2] = 2;
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents[4] = false;
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages = [
        { tag: "SkillTestResultOptions_", contents: q.choices[0].raw.messages },
      ];
    },
  ]) {
    const fixture = structuredClone(actualScientistPenalty),
      s = fixture.snapshot,
      q: any = companionQuestion(s.game, s.playerId)!;
    change(s, q);
    sealed(s);
    assert.equal(select(s, q, fixture.memory), undefined);
  }
});

test("actual zero-action Future window ends the own turn despite optional River fast ability and ready engagement", () => {
  const fixture = structuredClone(actualZeroAction),
    s = fixture.snapshot,
    q: any = companionQuestion(s.game, s.playerId)!;
  sealed(s);
  assert.equal(q.isPlayerWindow, true);
  assert.equal(select(s, q, fixture.memory).choice.answerIndex, 0);
  assert.equal(q.choices[1].raw.ability.type.tag, "FastAbility'");
});

test("zero-action EndTurn binding rejects remaining actions, active test, foreign actor and malformed native message", () => {
  for (const change of [
    (s: any) => {
      s.game.investigators[actorId].remainingActions = 1;
    },
    (s: any) => {
      s.game.investigators[actorId].remainingActions = -1;
    },
    (s: any) => {
      s.game.activeInvestigatorId = "foreign";
    },
    (s: any) => {
      s.game.skillTest = { investigator: actorId };
    },
    (s: any) => {
      s.game.investigators[actorId].endedTurn = true;
    },
    (s: any, q: any) => {
      q.playerId = "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].disabled = true;
    },
    (s: any, q: any) => {
      q.choices[0].raw.investigatorId = "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents = "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].tag = "FakeEndTurn";
    },
    (s: any, q: any) => {
      q.choices.push({ ...q.choices[0], answerIndex: 2 });
    },
  ]) {
    const fixture = structuredClone(actualZeroAction),
      s = fixture.snapshot,
      q: any = companionQuestion(s.game, s.playerId)!;
    change(s, q);
    sealed(s);
    assert.equal(select(s, q, fixture.memory), undefined);
  }
});

test("actual ElderThing nested target protects scenario scientists through the own controlled Milan and resolves its offered penalty", () => {
  const fixture = structuredClone(actualElderThingTarget),
    s = fixture.snapshot,
    q: any = companionQuestion(s.game, s.playerId)!;
  sealed(s);
  assert.equal(select(s, q, fixture.memory).choice.answerIndex, 0);
  s.game.question[s.playerId] = q.choices[0].raw.messages[0].contents[1];
  const followup: any = companionQuestion(s.game, s.playerId)!;
  assert.equal(select(s, followup, fixture.memory).choice.answerIndex, 0);
  assert.equal(fixture.provenance.wholeScenarioCompleted, false);
});

test("ElderThing target rejects foreign nested Ask, mismatched asset/effect and unsupported public asset", () => {
  for (const change of [
    (s: any, q: any) => {
      q.playerId = "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents[0] = "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].raw.target.contents = "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents[1].choices[0].messages[0].contents[0] =
        "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents[1].choices[0].messages[0].contents[1].contents =
        "Skull";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents[1].choices[0].messages[0].contents[2] = 2;
    },
    (s: any) => {
      const a: any = Object.values(s.game.assets).find(
        (a: any) => a.cardCode === "c01033",
      );
      a.controller = "foreign";
    },
    (s: any) => {
      const a: any = Object.values(s.game.assets).find(
        (a: any) => a.cardCode === "c01033",
      );
      a.cardCode = "c99999";
    },
  ]) {
    const fixture = structuredClone(actualElderThingTarget),
      s = fixture.snapshot,
      q: any = companionQuestion(s.game, s.playerId)!;
    change(s, q);
    sealed(s);
    assert.equal(select(s, q, fixture.memory), undefined);
  }
});

test("without an offered controlled Milan the actual local scientist target follows public surviving capacity", () => {
  const fixture = structuredClone(actualElderThingTarget),
    s = fixture.snapshot,
    q: any = companionQuestion(s.game, s.playerId)!;
  q.choices = q.choices.slice(1);
  sealed(s);
  assert.equal(select(s, q, fixture.memory).choice.answerIndex, 1);
  s.game.assets[q.choices[0].raw.target.contents].tokens = [["Horror", 1]];
  assert.equal(select(s, q, fixture.memory).choice.answerIndex, 2);
});

test("actual Vanishing History chooses the bounded own non-story Item discard Ask using public printed cards", () => {
  const fixture = structuredClone(actualVanishingHistory),
    s = fixture.snapshot,
    q: any = companionQuestion(s.game, s.playerId)!;
  sealed(s);
  assert.equal(
    select(s, q, fixture.memory, fixture.cards).choice.answerIndex,
    0,
  );
  assert.equal(fixture.provenance.wholeScenarioCompleted, false);
});

test("Vanishing History rejects another actor/source/target, non-Item/story cards and unsupported nested effects", () => {
  for (const change of [
    (f: any, q: any) => {
      q.playerId = "foreign";
    },
    (f: any, q: any) => {
      q.choices[0].raw.messages[0].contents[0] = "foreign";
    },
    (f: any, q: any) => {
      q.choices[1].raw.messages[0].contents.discardInvestigator = "foreign";
    },
    (f: any, q: any) => {
      q.choices[0].raw.messages[0].contents[1].choices[0].messages[0].contents[0] =
        "foreign";
    },
    (f: any, q: any) => {
      q.choices[0].raw.messages[0].contents[1].choices[0].messages[0].contents[1].contents =
        "foreign";
    },
    (f: any, q: any) => {
      q.choices[0].raw.messages[0].contents[1].choices[0].messages[0].contents[2].contents =
        "foreign";
    },
    (f: any, q: any) => {
      q.choices[0].raw.messages[0].contents[1].choices[0] = null;
    },
    (f: any, q: any) => {
      q.choices[0].raw.messages[0].contents[1].choices[0].messages[0].tag =
        "FakeDiscard";
    },
    (f: any) => {
      const a: any = Object.values(f.snapshot.game.assets)[0];
      a.controller = "foreign";
    },
    (f: any) => {
      f.cards[0].traits = "Ally. Scientist.";
    },
    (f: any) => {
      f.cards[0].subtype_code = "story";
    },
  ]) {
    const fixture = structuredClone(actualVanishingHistory),
      s = fixture.snapshot,
      q: any = companionQuestion(s.game, s.playerId)!;
    change(fixture, q);
    sealed(s);
    assert.equal(select(s, q, fixture.memory, fixture.cards), undefined);
  }
});

test("actual failed A Tear in Time selects its own one-action penalty without altering the native test", () => {
  const fixture = structuredClone(actualActionLoss),
    s = fixture.snapshot,
    q: any = companionQuestion(s.game, s.playerId)!,
    before = structuredClone(s.game.skillTest);
  sealed(s);
  const selected = select(s, q, fixture.memory);
  assert.equal(selected.choice.answerIndex, 0);
  assert.equal(selected.choice, q.choices[0]);
  assert.deepEqual(s.game.skillTest, before);
  assert.equal(s.game.investigators[actorId].remainingActions, 3);
  assert.equal(fixture.provenance.wholeScenarioCompleted, false);
});

test("A Tear in Time action penalty rejects foreign sources/actors, exhausted actions and malformed failed results", () => {
  for (const change of [
    (s: any, q: any) => {
      q.playerId = "foreign";
    },
    (s: any) => {
      s.game.skillTest.investigator = "foreign";
    },
    (s: any) => {
      s.game.skillTest.step = "RunSkillTestStep";
    },
    (s: any) => {
      s.game.skillTest.result.tag = "SucceededBy";
    },
    (s: any) => {
      s.game.skillTest.result.contents[1] = 0;
    },
    (s: any) => {
      s.game.skillTest.result.contents[1] = 0.5;
    },
    (s: any) => {
      s.game.skillTest.target.contents = "foreign";
    },
    (s: any) => {
      s.game.investigators[actorId].remainingActions = 0;
    },
    (s: any) => {
      s.game.investigators[actorId].remainingActions = -1;
    },
    (s: any, q: any) => {
      q.choices[0].disabled = true;
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents[0] = "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents[1].contents = "foreign";
    },
    (s: any, q: any) => {
      q.choices[0].raw.messages[0].contents[2] = 2;
    },
    (s: any, q: any) => {
      q.choices[1].raw.messages[0].contents.contents[0] = "foreign";
    },
    (s: any, q: any) => {
      q.choices[1].raw.messages[0].contents.contents[1].contents = "foreign";
    },
    (s: any, q: any) => {
      q.choices[1].raw.messages[0].contents.contents[3] = 1;
    },
    (s: any, q: any) => {
      q.choices[1].raw.messages[0].contents.tag = "UnsupportedEffect";
    },
  ]) {
    const fixture = structuredClone(actualActionLoss),
      s = fixture.snapshot,
      q: any = companionQuestion(s.game, s.playerId)!;
    change(s, q);
    sealed(s);
    assert.equal(select(s, q, fixture.memory), undefined);
  }
});
