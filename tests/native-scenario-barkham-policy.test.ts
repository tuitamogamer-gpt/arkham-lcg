import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { companionQuestion } from "../src/game/companionProtocol";
import { catalogCardCode } from "../scripts/rules-protocol.mjs";
import { selectBarkhamChoice } from "../scripts/native-scenario-barkham-policy.mjs";
import type { Card } from "../src/game/types";

const manifest = JSON.parse(readFileSync(new URL("../public/data/catalog.json", import.meta.url), "utf8"));
const cards: Card[] = manifest.cardFiles.flatMap((path: string) =>
  JSON.parse(readFileSync(new URL(`../public${path}`, import.meta.url), "utf8")),
);
const catalog = new Map(cards.map((card) => [card.code, card]));
const actorId = "c:barkham:004", playerId = "own-player";
const handCard = (id: string, code: string) => ({ tag: "PlayerCard", contents: { id, cardCode: `c${code}`, owner: actorId } });
const location = (id: string, code: string, connectedLocations: string[], hidden = 0, clues = 0) => ({
  id, cardCode: `c:barkham:${code}`, connectedLocations, revealed: true,
  cardsUnderneath: Array.from({ length: hidden }, () => ({ facedown: true })), tokens: [["Clue", clues]],
});
function gameFixture(): Record<string, any> {
  return {
    investigators: { [actorId]: { id: actorId, cardCode: actorId, playerId,
      placement: { tag: "AtLocation", contents: "current" }, remainingActions: 3,
      meta: { sniffedLocations: ["current"] }, hand: [], tokens: [["Resource", 0]], engagedEnemies: [],
    } },
    locations: { current: location("current", "029", ["near", "far"]),
      near: location("near", "032", ["current"], 1), far: location("far", "034", ["current"], 1) },
    assets: {}, enemies: {}, acts: { "c:barkham:025": { id: "c:barkham:025" } },
    agendas: { "c:barkham:023": { id: "c:barkham:023" } }, treacheries: {}, cards: {},
  };
}
const actor = (game: Record<string, any>) => game.investigators[actorId];
const ability = (cardCode: string, index: number, tag: string, id: string, investigatorId = actorId) => ({
  tag: "AbilityLabel", investigatorId,
  ability: { cardCode, index, source: { tag, contents: id }, basic: index >= 100,
    type: { tag: "ActionAbility", cost: { tag: "ActionCost", contents: 1 } } },
});
function select(game: Record<string, any>, choices: unknown[], memory: Record<string, any> = {}, tag = "PlayerWindowChooseOne") {
  game.question = { [playerId]: { tag, choices } };
  const question = companionQuestion(game, playerId, { card: (code) => catalog.get(catalogCardCode(code)) });
  return selectBarkhamChoice({ snapshot: { game, playerId }, question, cards: catalog, memory });
}

// These fixtures test the policy boundary only, not native gameplay or a win.
test("hidden card identity is irrelevant even when accessing it would throw", () => {
  const game = gameFixture();
  const choices = [ability("c:barkham:032", 104, "LocationSource", "near"), ability("c:barkham:034", 104, "LocationSource", "far")];
  const expected = select(game, choices);
  for (const id of ["near", "far"]) {
    const hidden = new Array(1);
    Object.defineProperty(hidden, "0", { get() { throw new Error("Hidden identity must not be read"); } });
    game.locations[id].cardsUnderneath = hidden;
  }
  const actual = select(game, choices);
  assert.equal(actual?.choice.answerIndex, expected?.choice.answerIndex);
  assert.equal(actual?.choice.answerIndex, 1, "Equal public distances use physical ID order, independent of hidden contents.");
});

test("a foreign physical ability cannot impersonate the controlled Flashlight", () => {
  const game = gameFixture();
  game.locations.current.tokens = [["Clue", 1]];
  game.assets.foreign = { id: "foreign", cardCode: "c01087", controller: "other-investigator", uses: { Supply: 3 } };
  const chosen = select(game, [ability("c01087", 1, "AssetSource", "foreign"), ability("c:barkham:029", 103, "LocationSource", "current")]);
  assert.equal(chosen?.choice.answerIndex, 1);
  assert.equal(select(game, [ability("c:barkham:004", 1, "InvestigatorSource", "other-investigator", "other-investigator")]), undefined);
});

test("unknown prompt and disabled otherwise-known choice are not guessed", () => {
  const game = gameFixture();
  assert.equal(select(game, [{ tag: "Label", label: "Do something mysterious", messages: [] }], {}, "UnknownPrompt"), undefined);
  assert.equal(select(game, [{ tag: "InvalidLabel", label: "Sniff", messages: [] }]), undefined);
  assert.equal(select(game, [{ tag: "TargetLabel", target: { tag: "InvestigatorTarget", contents: "foreign-investigator" }, messages: [] }], {}, "ChooseOne"), undefined);
  assert.equal(select(game, [{ tag: "TargetLabel", target: { tag: "EnemyTarget", contents: "unknown-physical-enemy" }, messages: [] }], {}, "ChooseOne"), undefined);
});

test("a ready engaged boss is evaded before a clue damage action", () => {
  const game = gameFixture();
  actor(game).tokens = [["Clue", 4]];
  actor(game).engagedEnemies = ["boss-physical"];
  game.enemies["boss-physical"] = { id: "boss-physical", cardCode: "c:barkham:037", exhausted: false,
    currentHealth: 4, tokens: [], placement: { tag: "InThreatArea", contents: actorId } };
  game.acts = { "c:barkham:026": { id: "c:barkham:026" } };
  const memory: Record<string, any> = {};
  const chosen = select(game, [ability("c:barkham:026", 1, "ActSource", "c:barkham:026"),
    ability("c:barkham:037", 101, "EnemySource", "boss-physical")], memory);
  assert.equal(chosen?.choice.answerIndex, 1);
  assert.deepEqual(memory.pendingAction, { kind: "evade", enemyId: "boss-physical" });
});

test("zero remaining actions can end the owning turn despite a ready engaged enemy, without ending another actor's turn", () => {
  // Actual fresh-4 stop SHA593ea10a9cc77c650377916b0cc31b1728ce8f8f5d91497533a18f9059154f32.
  const game = gameFixture();
  actor(game).remainingActions = 0;
  game.enemies.boss = {id: "boss", cardCode: "c:barkham:037", exhausted: false,
    currentHealth: 7, tokens: [], placement: {tag: "InThreatArea", contents: actorId}};
  const end = {tag: "EndTurnButton", investigatorId: actorId,
    messages: [{tag: "ChooseEndTurn", contents: actorId}]};
  assert.equal(select(game, [end])?.choice.answerIndex, 0);
  assert.equal(select(game, [{...end, investigatorId: "foreign-investigator"}]), undefined);
  assert.equal(select(game, [{...end, messages: [{tag: "ChooseEndTurn", contents: "foreign-investigator"}]}]), undefined);
  assert.equal(select(game, [{...end, messages: []}]), undefined);
  actor(game).remainingActions = 1;
  assert.equal(select(game, [end]), undefined);
});

test("exhausted boss damage follows the exact physical enemy target", () => {
  const game = gameFixture();
  actor(game).tokens = [["Clue", 2]];
  game.enemies.boss = { id: "boss", cardCode: "c:barkham:037", exhausted: true,
    currentHealth: 4, tokens: [], placement: { tag: "AtLocation", contents: "current" } };
  game.acts = { "c:barkham:026": { id: "c:barkham:026" } };
  const memory: Record<string, any> = {};
  const action = select(game, [ability("c:barkham:026", 1, "ActSource", "c:barkham:026")], memory);
  assert.equal(action?.choice.answerIndex, 0);
  const target = select(game, [{ tag: "TargetLabel", target: { tag: "EnemyTarget", contents: "same-code-different-physical-card" }, messages: [] },
    { tag: "TargetLabel", target: { tag: "EnemyTarget", contents: "boss" }, messages: [] }], memory, "ChooseOne");
  assert.equal(target?.choice.answerIndex, 1);
});

test("unknown graph shape stops instead of inventing a route", () => {
  const game = gameFixture(), memory: Record<string, any> = {};
  delete game.locations.near.connectedLocations;
  const chosen = select(game, [ability("c:barkham:032", 104, "LocationSource", "near")], memory);
  assert.equal(chosen, undefined);
  assert.match(memory.unsupportedShape, /connectedLocations/);
});

test("recorded natural agenda exposure uses public targets without reading concealed cards", () => {
  // Public target IDs and equal three-step paths from the actual stopped
  // prompt. This pure boundary fixture makes no native outcome claim.
  const current = "a8fc5a0a-8175-4113-b46b-0ff1d10b8ba1", middle = "1e896b12-4ef9-456e-a4bd-fd925a4258c5";
  const central = "43bd4989-e5dc-4f70-b44a-55cc01be50e8", velma = "a2fdbb8e-2138-4add-89bc-c9de54e30b4a";
  const asylum = "de479f8a-9c88-4a1f-b8d5-d627575d092a", game = gameFixture();
  actor(game).placement.contents = current;
  game.locations = {
    [current]: location(current, "032", [middle], 1, 2), [middle]: location(middle, "029", [current, central]),
    [central]: location(central, "027", [middle, velma, asylum]),
    [velma]: location(velma, "036", [central], 1), [asylum]: location(asylum, "031", [central], 1),
  };
  game.phase = "MythosPhase";
  game.agendas["c:barkham:023"].flipped = true;
  game.agendas["c:barkham:023"].sequence = { agendaSequenceSide: "B", agendaSequenceStep: 1 };
  game.question = { [playerId]: { tag: "ChooseOne", choices: [velma, asylum].map((id) => ({
    tag: "TargetLabel", target: { tag: "LocationTarget", contents: id }, messages: [],
  })) } };
  const snapshot = { game, playerId };
  const ownQuestion = snapshot.game.question[snapshot.playerId];
  const question = companionQuestion(snapshot.game, snapshot.playerId, { card: (code) => catalog.get(catalogCardCode(code)) });
  const chosen = selectBarkhamChoice({ snapshot, question, cards: catalog, memory: {} });
  assert.equal(chosen?.choice.answerIndex, 0);
  assert.equal((chosen?.choice.raw as any).target.contents, "a2fdbb8e-2138-4add-89bc-c9de54e30b4a");
  for (const location of Object.values(snapshot.game.locations) as any[]) {
    if (location.cardsUnderneath.length) {
      const count = location.cardsUnderneath.length;
      location.cardsUnderneath = new Array(count);
      for (let index = 0; index < count; index++) Object.defineProperty(location.cardsUnderneath, index,
        { get() { throw new Error("Concealed location card must not be read"); } });
    }
  }
  for (const choice of ownQuestion.choices) Object.defineProperty(choice, "messages",
    { get() { throw new Error("Concealed native message cards must not be read"); } });
  assert.equal(selectBarkhamChoice({ snapshot, question, cards: catalog, memory: {} })?.choice.answerIndex, 0);
});

test("agenda exposure uses its context while other public location prompts use the fallback", () => {
  const game = gameFixture();
  const choices = ["near", "far"].map((id) => ({ tag: "TargetLabel", target: { tag: "LocationTarget", contents: id }, messages: [] }));
  game.phase = "MythosPhase";
  game.agendas["c:barkham:023"].flipped = true;
  game.agendas["c:barkham:023"].sequence = { agendaSequenceSide: "B", agendaSequenceStep: 1 };
  assert.equal(select(game, choices, {}, "ChooseOne")?.choice.answerIndex, 1);
  game.phase = "InvestigationPhase";
  assert.match(select(game, choices, {}, "ChooseOne")?.reason ?? "", /nearest offered public location/);
  game.phase = "MythosPhase";
  game.agendas["c:barkham:023"].sequence.agendaSequenceSide = "A";
  assert.match(select(game, choices, {}, "ChooseOne")?.reason ?? "", /nearest offered public location/);
  game.agendas["c:barkham:023"].sequence.agendaSequenceSide = "B";
  game.locations.far.cardsUnderneath = [];
  assert.match(select(game, choices, {}, "ChooseOne")?.reason ?? "", /nearest offered public location/);
});

test("public Hunter and location choices ignore all raw message payloads", () => {
  const game = gameFixture();
  game.locations.near.connectedLocations.push("remote");
  game.locations.remote = location("remote", "031", ["near"], 1);
  game.enemies.hunter = { id: "hunter", cardCode: "c:barkham:039", placement: { tag: "AtLocation", contents: "near" } };
  game.enemies.unrelated = { id: "unrelated", cardCode: "c:barkham:047", placement: { tag: "Unplaced" } };
  const choices = ["near", "remote"].map((id) => ({ tag: "TargetLabel", target: { tag: "LocationTarget", contents: id } }));
  for (const choice of choices) Object.defineProperty(choice, "messages",
    { get() { throw new Error("Raw native payload must not be read for public location selection"); } });
  const choose = (sourceId?: string) => {
    const inner = { tag: "ChooseOne", choices };
    game.question = { [playerId]: sourceId === undefined ? inner : {
      tag: "QuestionWithSource", source: { tag: "EnemySource", contents: sourceId }, tooltip: "$hunter.move", question: inner,
    } };
    const question = companionQuestion(game, playerId, { card: (code) => catalog.get(catalogCardCode(code)) });
    return selectBarkhamChoice({ snapshot: { game, playerId }, question, cards: catalog, memory: {} });
  };
  assert.equal(choose("hunter")?.choice.answerIndex, 1);
  assert.equal(choose()?.choice.answerIndex, 0);
  for (const loc of Object.values(game.locations) as any[]) {
    const count = loc.cardsUnderneath.length;
    loc.cardsUnderneath = new Array(count);
    for (let index = 0; index < count; index++) Object.defineProperty(loc.cardsUnderneath, index,
      { get() { throw new Error("Concealed card identity must not be read"); } });
  }
  assert.equal(choose("hunter")?.choice.answerIndex, 1);
  assert.equal(choose("foreign-enemy"), undefined);
  choices[1].target.contents = "foreign-location";
  assert.equal(choose("hunter"), undefined);
  assert.equal(choose(), undefined);
});

test("location labels must identify one exact public physical location", () => {
  const game = gameFixture();
  const choices = ["barkham-032", "barkham-034"].map((code) => ({ tag: "Label", label: catalog.get(code)?.name, messages: [] }));
  assert.equal(select(game, choices, {}, "ChooseOne")?.choice.answerIndex, 1);
  game.locations.ambiguous = location("ambiguous", "032", ["near"]);
  assert.equal(select(game, choices, {}, "ChooseOne"), undefined);
  delete game.locations.ambiguous;
  assert.equal(select(game, [choices[0], { tag: "Label", label: "unknown location", messages: [] }], {}, "ChooseOne"), undefined);
  assert.equal(select(game, [{ tag: "TargetLabel", target: { tag: "LocationTarget", contents: "foreign-location" },
    label: catalog.get("barkham-032")?.name, messages: [] }, choices[1]], {}, "ChooseOne"), undefined);
  game.locations.near.revealed = false;
  Object.defineProperty(game.locations.near, "cardCode", { get() { throw new Error("Unrevealed location front must not identify a label-only choice"); } });
  assert.equal(select(game, choices, {}, "ChooseOne"), undefined);
});

test("only actual own-hand commit cards are selected, capped at two before the random test", () => {
  const game = gameFixture(), memory: Record<string, any> = {};
  const ownCards = [handCard("perception", "01090"), handCard("courage", "01093"), handCard("courage-two", "01093")];
  actor(game).hand = ownCards;
  game.cards = Object.fromEntries(ownCards.map((card) => [card.contents.id, card]));
  game.skillTest = { id: "actual-test", investigator: actorId, action: "Investigate",
    skills: ["SkillIntellect"], modifiedSkillValue: 1, modifiedDifficulty: 3 };
  const choices = ownCards.map((card) => ({ tag: "TargetLabel", target: { tag: "CardIdTarget", contents: card.contents.id },
    messages: [{ tag: "SkillTestCommitCard", contents: [actorId, card] }] }));
  const start = { tag: "StartSkillTestButton", investigatorId: actorId };
  assert.equal(select(game, [...choices, start], memory, "ChooseOne")?.choice.answerIndex, 0);
  assert.equal(select(game, [...choices, start], memory, "ChooseOne")?.choice.answerIndex, 1);
  assert.equal(select(game, [...choices, start], memory, "ChooseOne")?.choice.answerIndex, 3);
  assert.deepEqual(memory.committedCardIds, ["perception", "courage"]);
  game.skillTest.committedCards = { [actorId]: ownCards.slice(0, 2) };
  assert.equal(select(game, [...choices, start], {}, "ChooseOne")?.choice.answerIndex, 3,
    "A new strategy memory still respects two already committed native cards.");
});

test("recorded nested commit messages bind the actual own actor and physical hand card", () => {
  const game = gameFixture(), memory: Record<string, any> = {};
  const manual = handCard("e2ef82b6-c123-45c6-b13b-9c84e1453fb4", "01092");
  const courage = handCard("9bbd6196-724e-4741-bd18-ed85742abb0b", "01093");
  actor(game).hand = [manual, courage];
  game.skillTest = { id: "eaa2cebf-5c8e-486f-b90d-2516ca1f839c", investigator: actorId, action: "Evade",
    skills: ["SkillAgility"], modifiedSkillValue: 4, modifiedDifficulty: 3 };
  const commit = (card: ReturnType<typeof handCard>, who = actorId) => ({ tag: "TargetLabel",
    target: { tag: "CardIdTarget", contents: card.contents.id }, messages: [
      { tag: "SkillTestMessage", contents: { tag: "SkillTestCommitCard_", contents: [who, card] } },
      { tag: "Do", contents: { tag: "SkillTestMessage", contents: { tag: "CommitToSkillTest_",
        contents: [game.skillTest.id, { tag: "StartSkillTestButton", investigatorId: actorId }] } } },
    ] });
  const start = { tag: "StartSkillTestButton", investigatorId: actorId };
  assert.equal(select(game, [commit(manual), commit(courage), start], memory, "ChooseOne")?.choice.answerIndex, 0);
  assert.equal(select(game, [commit(manual), commit(courage), start], memory, "ChooseOne")?.choice.answerIndex, 1);
  assert.equal(select(game, [commit(manual), commit(courage), start], memory, "ChooseOne")?.choice.answerIndex, 2);
  assert.deepEqual(memory.committedCardIds, [manual.contents.id, courage.contents.id]);
  assert.equal(select(game, [commit(manual, "foreign-investigator"), start], {}, "ChooseOne")?.choice.answerIndex, 1);
  const mismatched = commit(manual);
  (mismatched.messages[0].contents as any).contents[1] = courage;
  assert.equal(select(game, [mismatched, start], {}, "ChooseOne")?.choice.answerIndex, 1);
  const foreign = handCard("foreign-manual", "01092");
  foreign.contents.owner = "foreign-investigator";
  actor(game).hand.push(foreign);
  assert.equal(select(game, [commit(foreign), start], {}, "ChooseOne")?.choice.answerIndex, 1);
});

test("Trench Coat uses its offered own card, body slot and damage component", () => {
  const game = gameFixture(), coat = handCard("new-coat", "04203");
  actor(game).hand = [coat];
  actor(game).tokens = [["Resource", 3]];
  const play = { tag: "TargetLabel", target: { tag: "CardIdTarget", contents: coat.contents.id },
    messages: [{ tag: "InitiatePlayCardWithWindows", contents: [actorId, coat, []] }] };
  const end = { tag: "EndTurnButton", investigatorId: actorId, messages: [] };
  const memory: Record<string, any> = {};
  assert.equal(select(game, [play, end], memory)?.choice.answerIndex, 0);
  assert.deepEqual(memory.pendingAction, { kind: "play", cardCode: "04203" });
  game.assets.existing = { id: "existing", cardCode: "c04203", controller: actorId,
    placement: { tag: "InPlayArea", contents: actorId }, health: 2, tokens: [] };
  assert.equal(select(game, [play, end])?.choice.answerIndex, 1, "The occupied body slot does not silently play a second coat.");
  const soak = { tag: "ComponentLabel", component: { tag: "AssetComponent", assetId: "existing", tokenType: "DamageToken" }, messages: [] };
  const self = { tag: "ComponentLabel", component: { tag: "InvestigatorComponent", investigatorId: actorId, tokenType: "DamageToken" }, messages: [] };
  assert.equal(select(game, [soak, self], {}, "ChooseOne")?.choice.answerIndex, 0);
  game.assets.existing.controller = "foreign-investigator";
  game.assets.existing.placement.contents = "foreign-investigator";
  assert.equal(select(game, [soak, self], {}, "ChooseOne")?.choice.answerIndex, 1);
});

test("last pacification banks the printed boss reserve without reading its hidden card", () => {
  const game = gameFixture(), memory: Record<string, any> = {};
  game.locations.current.cardsUnderneath = new Array(1);
  Object.defineProperty(game.locations.current.cardsUnderneath, "0", { get() { throw new Error("Last hidden cat identity must not be read"); } });
  game.locations.current.tokens = [["Clue", 2]];
  game.locations.near.cardsUnderneath = [];
  game.locations.far.cardsUnderneath = [];
  for (const [index, code] of ["039", "040", "041"].entries()) game.enemies[`mask-${index}`] = {
    id: `mask-${index}`, cardCode: `c:barkham:${code}`, defeated: false, exhausted: false,
    placement: { tag: "AtLocation", contents: "far" },
  };
  const choices = [ability("c:barkham:023", 1, "AgendaSource", "c:barkham:023"),
    ability("c:barkham:029", 103, "LocationSource", "current")];
  actor(game).tokens = [["Clue", 5]];
  assert.equal(select(game, choices, memory)?.choice.answerIndex, 1);
  assert.equal(memory.finalPacifyClueReserve, 4, "The solo boss has printed health 4 plus three visible live Meowsks.");
  actor(game).tokens = [["Clue", 6]];
  assert.equal(select(game, choices, memory)?.choice.answerIndex, 0);
  actor(game).tokens = [["Clue", 5]];
  game.enemies["mask-2"].defeated = true;
  assert.equal(select(game, choices, memory)?.choice.answerIndex, 0, "A defeated physical Meowsk is not counted as a live attachment.");
  game.enemies["mask-2"].defeated = false;
  game.locations.current.tokens = [];
  game.locations.near.tokens = [["Clue", 2]];
  assert.equal(select(game, [choices[0], ability("c:barkham:032", 104, "LocationSource", "near")], memory)?.choice.answerIndex, 1);
});

test("one remaining action does not voluntarily enter an actual ready enemy location", () => {
  const game = gameFixture();
  actor(game).remainingActions = 1;
  game.locations.far.cardsUnderneath = [];
  game.enemies.visible = { id: "visible", cardCode: "c:barkham:037", exhausted: false,
    currentHealth: 4, tokens: [], placement: { tag: "AtLocation", contents: "near" } };
  actor(game).tokens = [["Clue", 2]];
  const choices = [ability("c:barkham:032", 104, "LocationSource", "near"),
    { tag: "EndTurnButton", investigatorId: actorId, messages: [] }];
  assert.equal(select(game, choices)?.choice.answerIndex, 1);
  actor(game).remainingActions = 3;
  assert.equal(select(game, choices)?.choice.answerIndex, 0);
  actor(game).remainingActions = 1;
  game.enemies.visible.exhausted = true;
  assert.equal(select(game, choices)?.choice.answerIndex, 0);
});

test("recorded below-reserve clue route chooses a preparation goal other than the unrevealed boss location", () => {
  // Only public state and the unchanged actual offered question were retained
  // from second Kate / resume-4 / answer 50. This policy test is not a new game.
  const recorded = JSON.parse(readFileSync(new URL("./fixtures/barkham-boss-clue-route.json", import.meta.url), "utf8"));
  const { snapshot } = recorded, game = snapshot.game, ownPlayer = snapshot.playerId;
  const question = companionQuestion(game, ownPlayer, { card: (code) => catalog.get(catalogCardCode(code)) });
  const memory: Record<string, any> = {};
  const chosen = selectBarkhamChoice({ snapshot, question, cards: catalog, memory });
  assert.equal(recorded.evidence.originalSelectedAnswerIndex, 4, "The old trace selected the nearest unrevealed boss destination.");
  assert.equal(memory.bossClueReserve, 4, "The actual public boss has 8 health, requiring four two-damage clues.");
  assert.equal(chosen?.choice.answerIndex, 6);
  assert.equal((chosen?.choice.raw as any).ability.source.contents, "86279cc0-ba47-4e39-93b1-9bd5bc32ba97");
  assert.equal(chosen?.choice.label, "Move to Snoutside");
  for (const loc of Object.values(game.locations) as any[]) {
    const count = loc.cardsUnderneath.length;
    loc.cardsUnderneath = new Array(count);
    for (let index = 0; index < count; index++) Object.defineProperty(loc.cardsUnderneath, index,
      { get() { throw new Error("Concealed card identities must not select the clue route"); } });
  }
  Object.defineProperty(game.investigators[actorId], "deck", { get() { throw new Error("Own deck order must not select the clue route"); } });
  assert.equal(selectBarkhamChoice({ snapshot, question, cards: catalog, memory: {} })?.choice.answerIndex, 6);

  game.investigators[actorId].tokens = [["Clue", 4], ["Damage", 1], ["Horror", 2], ["Resource", 1]];
  assert.equal(selectBarkhamChoice({ snapshot, question, cards: catalog, memory: {} })?.choice.answerIndex, 4,
    "Meeting the actual reserve permits the exact printed boss destination.");
});

test("below-reserve exclusion binds the exact boss location and survives clue-goal fallbacks", () => {
  const game = gameFixture();
  for (const loc of Object.values(game.locations) as any[]) loc.cardsUnderneath = [];
  game.locations.current.tokens = [];
  game.locations.near.revealed = false;
  game.locations.far.tokens = [["Clue", 1]];
  game.enemies.boss = { id: "physical-boss", cardCode: "c:barkham:037", exhausted: false,
    currentHealth: 8, tokens: [], placement: { tag: "AtLocation", contents: "near" } };
  actor(game).tokens = [["Clue", 3]];
  const moveNear = ability("c:barkham:032", 104, "LocationSource", "near");
  const moveFar = ability("c:barkham:034", 104, "LocationSource", "far");
  const end = { tag: "EndTurnButton", investigatorId: actorId, messages: [] };
  assert.equal(select(game, [moveNear, moveFar, end])?.choice.answerIndex, 1);
  game.enemies.boss.placement.contents = "far";
  assert.equal(select(game, [moveNear, moveFar, end])?.choice.answerIndex, 0,
    "Only the boss's actual physical location is removed; other clue locations remain eligible.");
  game.enemies.boss.placement.contents = "near";
  game.locations.far.tokens = [];
  assert.equal(select(game, [moveNear, moveFar, end])?.choice.answerIndex, 2,
    "An empty preparation set must not reintroduce the boss via the later unrevealed-location fallback.");
  game.enemies.boss.cardCode = "c:barkham:039";
  assert.equal(select(game, [moveNear, moveFar, end])?.choice.answerIndex, 0,
    "Another actual enemy does not impersonate the boss reserve policy.");
  game.enemies.boss.cardCode = "c:barkham:037";
  game.locations.far.tokens = [["Clue", 1]];
  game.locations.current.connectedLocations = ["near"];
  game.locations.near.connectedLocations = ["current", "far"];
  game.locations.far.connectedLocations = ["near"];
  assert.equal(select(game, [moveNear, moveFar, end]), undefined,
    "When every preparation path crosses the unprepared boss, stop without inventing an alternative route.");
});

test("recorded successful evade ordering resolves only its exact own physical native result", () => {
  const recorded = JSON.parse(readFileSync(new URL("./fixtures/barkham-successful-evade-result.json", import.meta.url), "utf8"));
  const choose = (snapshot: typeof recorded.snapshot) => selectBarkhamChoice({ snapshot,
    question: companionQuestion(snapshot.game, snapshot.playerId, { card: (code) => catalog.get(catalogCardCode(code)) }),
    cards: catalog, memory: {} });
  const { snapshot } = recorded;
  assert.equal(choose(snapshot)?.choice.answerIndex, 0);
  assert.equal(choose(snapshot)?.choice.label, "Evade GHOST CAT!");
  assert.equal(snapshot.game.skillTest.result.tag, "SucceededBy");
  assert.equal(snapshot.game.skills["1fae4ca7-e1e8-4266-9369-43030da1a786"].owner, actorId);
  Object.defineProperty(snapshot.game.investigators[actorId], "deck", { get() { throw new Error("Native draw order must not select a completed test result"); } });
  assert.equal(choose(snapshot)?.choice.answerIndex, 0);

  const negative = (edit: (fresh: typeof snapshot) => void) => {
    const fresh = structuredClone(recorded.snapshot);
    edit(fresh);
    assert.equal(choose(fresh), undefined);
  };
  const resultMessage = (fresh: typeof snapshot) => fresh.game.question[fresh.playerId].choices[0].messages[1].contents;
  negative((fresh) => { resultMessage(fresh).contents[1] = "foreign-investigator"; });
  negative((fresh) => { resultMessage(fresh).contents[0][1].contents = "foreign-enemy"; });
  negative((fresh) => { resultMessage(fresh).contents[3].contents = "foreign-enemy"; });
  negative((fresh) => { resultMessage(fresh).contents[2].contents[0].contents = "foreign-enemy"; });
  negative((fresh) => { resultMessage(fresh).contents[2].contents[1] = 100; });
  negative((fresh) => { resultMessage(fresh).contents[4] = 5; });
  negative((fresh) => { fresh.game.skillTest.investigator = "foreign-investigator"; });
  negative((fresh) => { fresh.game.skillTest.result.tag = "FailedBy"; });
  negative((fresh) => { fresh.game.skillTestResults.skillTestResultsSuccess = false; });
  negative((fresh) => { delete fresh.game.enemies[fresh.game.skillTest.target.contents]; });
});

const recordedPolicy = (name: string) => JSON.parse(readFileSync(
  new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const recordedQuestion = (snapshot: any) => companionQuestion(snapshot.game, snapshot.playerId,
  { card: (code) => catalog.get(catalogCardCode(code)) });
const chooseRecorded = (snapshot: any, memory: Record<string, any> = {}) => selectBarkhamChoice({
  snapshot, question: recordedQuestion(snapshot), cards: catalog, memory,
});

test("recorded Stubborn Cat action binds the exact own current location attachment", () => {
  const recorded = recordedPolicy("barkham-stubborn-cat-action"), { snapshot } = recorded;
  const game = snapshot.game, owner = game.investigators[actorId], memory: Record<string, any> = {};
  const before = structuredClone(game), question = recordedQuestion(snapshot);
  const chosen = selectBarkhamChoice({ snapshot, question, cards: catalog, memory });
  assert.equal(recorded.evidence.originalSelectedAnswerIndex, 4, "The retained loss trace left its clue location.");
  assert.equal(chosen?.choice.answerIndex, 10);
  const raw = chosen?.choice.raw as any;
  assert.equal(raw.ability.cardCode, "c:barkham:055");
  assert.equal(raw.ability.source.contents, "fecbc8fe-9f19-4500-b7f0-bf7598a66ed6");
  assert.deepEqual(memory.pendingAction, { kind: "stubborn-cat",
    treacheryId: raw.ability.source.contents, locationId: owner.placement.contents,
    investigatorId: actorId, gameId: game.id, questionVersion: question?.questionVersion });
  assert.deepEqual(game, before, "Only the caller's strategy memory changes; the public question and game remain untouched.");

  for (const loc of Object.values(game.locations) as any[]) {
    const count = loc.cardsUnderneath.length;
    loc.cardsUnderneath = new Array(count);
    for (let i = 0; i < count; i++) Object.defineProperty(loc.cardsUnderneath, i,
      { get() { throw new Error("Concealed cats cannot justify clearing a public location attachment"); } });
  }
  for (const [entity, field] of [[owner, "deck"], [game, "scenario"], [game, "queue"]] as const)
    Object.defineProperty(entity, field, { get() { throw new Error(`Forbidden strategy read: ${field}`); } });
  assert.equal(selectBarkhamChoice({ snapshot, question, cards: catalog, memory: {} })?.choice.answerIndex, 10);

  const negative = (edit: (fresh: any) => void) => {
    const fresh = structuredClone(recorded.snapshot);
    edit(fresh);
    assert.notEqual(chooseRecorded(fresh)?.choice.answerIndex, 10);
  };
  const catId = raw.ability.source.contents;
  negative((fresh) => { fresh.game.treacheries[catId].placement.contents = "foreign-location"; });
  negative((fresh) => { fresh.game.treacheries[catId].id = "same-code-other-physical-card"; });
  negative((fresh) => { fresh.game.treacheries[catId].cardCode = "c:barkham:050"; });
  negative((fresh) => { fresh.game.treacheries[catId].placement.tag = "InThreatArea";
    fresh.game.treacheries[catId].placement.contents = "foreign-investigator"; });
  negative((fresh) => { fresh.game.question[fresh.playerId].choices[10].investigatorId = "foreign-investigator"; });
  negative((fresh) => { fresh.game.question[fresh.playerId].choices[10].ability.source.contents = "foreign-treachery"; });
  negative((fresh) => { fresh.game.question[fresh.playerId].choices[10].ability.index = 2; });
  negative((fresh) => { fresh.game.locations[fresh.game.investigators[actorId].placement.contents].tokens = []; });
  const fresh = structuredClone(recorded.snapshot), disabled = recordedQuestion(fresh)!;
  disabled.choices[10].disabled = true;
  assert.notEqual(selectBarkhamChoice({ snapshot: fresh, question: disabled, cards: catalog, memory: {} })?.choice.answerIndex, 10);
});

function stubbornCatFollowup() {
  const { snapshot } = recordedPolicy("barkham-stubborn-cat-action"), memory: Record<string, any> = {};
  assert.equal(chooseRecorded(snapshot, memory)?.choice.answerIndex, 10);
  const catId = memory.pendingAction.treacheryId;
  // This shape follows pinned native skillLabeled/beginSkillTest and the
  // printed Stubborn Cat Willpower/Agility choice. It is a pure boundary
  // fixture, not an answered native prompt or a successful chaos draw.
  const skillChoices = ["SkillWillpower", "SkillAgility"].map((skillType) => ({
    tag: "SkillLabel", skillType, messages: [{ tag: "SkillTestMessage", contents: {
      tag: "BeginSkillTestWithPreMessages'_", contents: [[], {
        id: "92c38650-59ec-4aa2-a73e-bd66db02a803", investigator: actorId,
        source: { tag: "AbilitySource", contents: [{ tag: "TreacherySource", contents: catId }, 1] },
        target: { tag: "TreacheryTarget", contents: catId },
        type: { tag: "SkillSkillTest", contents: skillType },
        baseValue: { tag: "SkillBaseValue", contents: skillType }, difficulty: { tag: "Fixed", contents: 4 },
      }],
    } }],
  }));
  snapshot.game.scenarioSteps++;
  snapshot.game.question[snapshot.playerId] = { tag: "ChooseOne", choices: skillChoices };
  return { snapshot, memory };
}

test("Stubborn Cat follow-up chooses only the offered own physical agility-four native test", () => {
  const { snapshot, memory } = stubbornCatFollowup(), question = recordedQuestion(snapshot)!;
  const before = structuredClone(snapshot), chosen = selectBarkhamChoice({ snapshot, question, cards: catalog, memory });
  assert.equal(chosen?.choice, question.choices[1]);
  assert.equal(chosen?.choice.skill, "SkillAgility");
  assert.equal(memory.pendingAction, undefined);
  assert.deepEqual(snapshot, before);
  const negative = (edit: (fresh: ReturnType<typeof stubbornCatFollowup>) => void) => {
    const fresh = stubbornCatFollowup();
    edit(fresh);
    assert.equal(chooseRecorded(fresh.snapshot, fresh.memory), undefined);
  };
  const testAt = (fresh: ReturnType<typeof stubbornCatFollowup>, index = 1) =>
    fresh.snapshot.game.question[fresh.snapshot.playerId].choices[index].messages[0].contents.contents[1];
  negative((fresh) => { delete fresh.memory.pendingAction; });
  negative((fresh) => { fresh.memory.pendingAction.gameId = "foreign-game"; });
  negative((fresh) => { delete fresh.memory.pendingAction.gameId; });
  negative((fresh) => { fresh.memory.pendingAction.investigatorId = "foreign-investigator"; });
  negative((fresh) => { fresh.snapshot.game.scenarioSteps--; });
  negative((fresh) => { fresh.snapshot.game.investigators[actorId].placement.contents = "foreign-location"; });
  negative((fresh) => { delete fresh.snapshot.game.treacheries[fresh.memory.pendingAction.treacheryId]; });
  negative((fresh) => { testAt(fresh).investigator = "foreign-investigator"; });
  negative((fresh) => { testAt(fresh).source.contents[0].contents = "foreign-treachery"; });
  negative((fresh) => { testAt(fresh).source.contents[1] = 2; });
  negative((fresh) => { testAt(fresh).target.contents = "foreign-treachery"; });
  negative((fresh) => { testAt(fresh).id = "different-test-from-the-other-offer"; });
  negative((fresh) => { testAt(fresh).type.contents = "SkillWillpower"; });
  negative((fresh) => { testAt(fresh).difficulty.contents = 3; });
  negative((fresh) => { fresh.snapshot.game.question[fresh.snapshot.playerId].choices[1].messages[0].contents.contents[0]
    = [{ tag: "UnexpectedEffect" }]; });
  negative((fresh) => { fresh.snapshot.game.question[fresh.snapshot.playerId].choices[1].messages.push({ tag: "UnexpectedEffect" }); });
  const fresh = stubbornCatFollowup(), disabled = recordedQuestion(fresh.snapshot)!;
  disabled.choices[1].disabled = true;
  assert.equal(selectBarkhamChoice({ snapshot: fresh.snapshot, question: disabled, cards: catalog, memory: fresh.memory }), undefined);
});

test("recorded boss offer prefers no-AOO damage only inside the current lethal clue/action budget", () => {
  const recorded = recordedPolicy("barkham-safe-boss-damage"), { snapshot } = recorded;
  const game = snapshot.game, owner = game.investigators[actorId];
  const boss = Object.values(game.enemies).find((enemy: any) => enemy.cardCode === "c:barkham:037") as any;
  assert.equal(recorded.evidence.originalSelectedAnswerIndex, 13);
  assert.equal(chooseRecorded(snapshot)?.choice.answerIndex, 13,
    "The actual retained one-clue/seven-health state remains an evade, with no winning claim.");
  // Change public arithmetic only to exercise a hypothetical two-health,
  // two-clue finishing opportunity. This does not change any native save.
  boss.tokens = [["Damage", 5]];
  owner.tokens = [["Clue", 2]];
  owner.remainingActions = 3;
  owner.meta.sniffedLocations = [];
  const memory: Record<string, any> = {}, chosen = chooseRecorded(snapshot, memory);
  assert.equal(chosen?.choice.answerIndex, 17, "The actual printed AnyEnemy/no-AOO offer precedes an unnecessary sniff/evade.");
  assert.deepEqual(memory.pendingAction, { kind: "damage", enemyId: boss.id });
  const lethal = structuredClone(snapshot);
  const negative = (edit: (fresh: any) => void) => {
    const fresh = structuredClone(lethal);
    edit(fresh);
    assert.notEqual(chooseRecorded(fresh)?.choice.answerIndex, 17);
  };
  negative((fresh) => { fresh.game.investigators[actorId].remainingActions = 1; });
  negative((fresh) => { fresh.game.investigators[actorId].tokens = [["Clue", 1]]; });
  negative((fresh) => { fresh.game.enemies[boss.id].currentHealth = undefined; });
  negative((fresh) => { fresh.game.enemies[boss.id].tokens = [["Damage", 5.5]]; });
  negative((fresh) => { fresh.game.question[fresh.playerId].choices[17].ability.doesNotProvokeAttacksOfOpportunity = null; });
  negative((fresh) => { fresh.game.question[fresh.playerId].choices[17].ability.doesNotProvokeAttacksOfOpportunity = { tag: "EnemyWithId", contents: "other-enemy" }; });
  negative((fresh) => { fresh.game.question[fresh.playerId].choices[17].ability.type.cost.contents[0].contents = 2; });
  negative((fresh) => { fresh.game.question[fresh.playerId].choices[17].ability.source.contents = "foreign-act"; });
  negative((fresh) => { fresh.game.question[fresh.playerId].choices[17].investigatorId = "foreign-investigator"; });
  const fresh = structuredClone(lethal), disabled = recordedQuestion(fresh)!;
  disabled.choices[17].disabled = true;
  assert.notEqual(selectBarkhamChoice({ snapshot: fresh, question: disabled, cards: catalog, memory: {} })?.choice.answerIndex, 17);
});
