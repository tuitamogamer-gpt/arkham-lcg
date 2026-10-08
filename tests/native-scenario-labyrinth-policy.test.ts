import assert from "node:assert/strict";
import test from "node:test";
import {labyrinthProgress, labyrinthRiftKnowledge, observeLabyrinthChoice, selectLabyrinthChoice} from "../scripts/native-scenario-labyrinth-policy.mjs";

const actorId = "c01001";
const storyId = "story-runes";
const groupAct = {GroupA: "70007", GroupB: "70008", GroupC: "70009"};
function snapshot(group: keyof typeof groupAct = "GroupC", stage = 1): any {
  const actCode = stage === 1 ? groupAct[group] : stage === 2 ? {GroupA: "70011", GroupB: "70012", GroupC: "70013"}[group] : "70014";
  return {playerId: `player-${group}`, game: {id: `game-${group}`, totalDoom: 0,
    investigators: {[actorId]: {id: actorId, playerId: `player-${group}`, placement: {tag: "AtLocation", contents: "here"},
      tokens: [["Clue", 2], ["Resource", 5]], hand: [], remainingActions: 3, engagedEnemies: []}},
    locations: {here: {id: "here", cardCode: "c70022", revealed: true, tokens: [["Clue", 2]], connectedLocations: []}},
    assets: {}, stories: {}, enemies: {}, acts: {[`c${actCode}`]: {id: `c${actCode}`, sequence: [stage, "A"], flipped: false}},
    agendas: {}, scenario: {log: [], victoryDisplay: []}}};
}
const choice = (tag: string, raw: any = {}, label = tag, answerIndex = 0): any => ({tag, raw: {tag, ...raw}, label, answerIndex, disabled: false});
const question = (choices: any[], extra: any = {}): any => ({kind: "choices", tag: "ChooseOne", questionVersion: 3,
  isPlayerWindow: false, isWindow: false, playerId: "player-GroupC", choices, ...extra});
const ability = (cardCode: string, index: number, id: string, sourceKind = "StorySource", answerIndex = 0): any =>
  choice("AbilityLabel", {ability: {cardCode: `c${cardCode}`, index, source: {tag: sourceKind, contents: id}}}, `ability-${cardCode}-${index}`, answerIndex);
const label = (label: string, messages: any[] = [], answerIndex = 0): any => choice("Label", {label, messages}, label, answerIndex);
const storyChoice = (command: any, labelText: string, index = 0): any => label(labelText,
  [{tag: "SendMessage", contents: [{tag: "StoryTarget", contents: "vent"}, {tag: "ScenarioSpecific", contents: ["epicLabyrinth.story", command]}]}], index);
const select = (s: any, q: any, memory: any = {}, teamKnowledge: any = {}): any => selectLabyrinthChoice({snapshot: s, question: q, cards: [], memory, teamKnowledge});
const leverQuestion = () => question(["left", "middle", "right"].map((v, i) => label(`$standalone.theLabyrinthsOfLunacy.chamberOfRegret.${v}`, [], i)));
const endTurn = (index = 0) => choice("EndTurnButton", {investigatorId: actorId}, "End turn", index);

function noHiddenReads(s: any) {
  for (const [entity, fields] of [[s.game.scenario, ["meta", "setAsideCards", "cardsUnderScenarioReference"]],
    [s.game.investigators[actorId], ["deck", "cardsUnderneath"]], ...Object.values(s.game.locations).map((l) => [l, ["cardsUnderneath"]])] as any) {
    for (const field of fields) Object.defineProperty(entity, field, {get() {throw new Error(`Forbidden hidden read: ${field}`);}, configurable: true});
  }
  Object.defineProperty(s.game, "cards", {get() {throw new Error("Forbidden complete physical-card map read");}});
}

test("secret replica, set-aside and deck contents never provide a lever answer", () => {
  const s = snapshot();
  s.game.scenario.meta = {epicLabyrinthReplica: {replicaSecretChamber: "70018"}};
  noHiddenReads(s);
  assert.equal(select(s, leverQuestion()), undefined);
  assert.equal(select(s, leverQuestion(), {}, {secretChamber: {code: "70018"}}), undefined);
});

test("a real enabled Rune CardLabel read records the exact lever and does not mutate input memory", () => {
  for (const [chamber, index] of [["70016", 2], ["70017", 1], ["70018", 0]] as const) {
    const s = snapshot(), memory = Object.freeze({lastAbility: Object.freeze({cardCode: "70033", index: 3})});
    noHiddenReads(s);
    const reveal = choice("CardLabel", {cardCode: `c${chamber}`}, "Printed revealed chamber", 6);
    reveal.cardCode = `c${chamber}`;
    const q = question([reveal]);
    const selection = select(s, q, memory);
    assert.equal(selection.choice, reveal);
    const observed = observeLabyrinthChoice({snapshot: s, question: q, selection, memory: memory as any});
    assert.equal(observed.secretChamber?.method, "arcane-runes-card-label");
    assert.equal(select(s, leverQuestion(), observed).choice.answerIndex, index);
    assert.equal(Object.hasOwn(memory, "secretChamber"), false);
  }
});

test("Rune knowledge is not recorded from disabled or unoffered choices, or an unrelated CardLabel", () => {
  const s = snapshot(), reveal = choice("CardLabel", {cardCode: "c70018"});
  reveal.cardCode = "c70018";
  const q = question([reveal]);
  assert.equal(observeLabyrinthChoice({snapshot: s, question: q, selection: {choice: reveal, reason: ""}, memory: {}}).secretChamber, undefined);
  reveal.disabled = true;
  const memory = {lastAbility: {cardCode: "70033", index: 3, source: {}, witness: {}}};
  assert.equal(observeLabyrinthChoice({snapshot: s, question: q, selection: {choice: reveal, reason: ""}, memory}).secretChamber, undefined);
  const clone = {...reveal, disabled: false};
  assert.equal(observeLabyrinthChoice({snapshot: s, question: q, selection: {choice: clone, reason: ""}, memory}).secretChamber, undefined);
});

test("the typed Vent note contains only A's own revealed chamber and matches the real requesting actor/story", () => {
  const s = snapshot("GroupA");
  s.game.locations.here = {id: "here", revealed: true, cardCode: "c70016", tokens: []};
  s.game.stories.vent = {id: "vent", cardCode: "c70035"};
  const q = question([], {kind: "specific", specific: {scope: "scenario", key: "epicLabyrinth.note", payload: {story: "vent", investigator: actorId}}});
  noHiddenReads(s);
  assert.match(select(s, q).note, /^\[Labyrinth GroupA Secrets 70016\].*right lever/);
  s.game.locations.here.revealed = false;
  assert.equal(select(s, q), undefined);
  s.game.locations.here.revealed = true;
  q.specific.payload.investigator = "someone-else";
  assert.equal(select(s, q), undefined);
  q.specific.key = "anythingElse";
  assert.equal(select(s, q), undefined);
});

test("C must actually take and then read a Vent note before the communication supplies a lever", () => {
  const s = snapshot(), take = storyChoice({tag: "ClaimVentNote", contents: [actorId, 0]}, "Take and read note 1");
  const takeQuestion = question([take, label("Finish taking objects from the Vent", [], 1)]);
  const note = "[Labyrinth GroupA Secrets 70017] Chamber of Secrets: Mysterious Prison; pull the middle lever.";
  const read = label(note), readQuestion = question([read]);
  noHiddenReads(s);
  const m0 = observeLabyrinthChoice({snapshot: s, question: readQuestion, selection: {choice: read, reason: ""}});
  assert.equal(m0.secretChamber, undefined);
  const m1 = observeLabyrinthChoice({snapshot: s, question: takeQuestion, selection: select(s, takeQuestion)});
  assert.equal(select(s, leverQuestion(), m1), undefined);
  const m2 = observeLabyrinthChoice({snapshot: s, question: readQuestion, selection: select(s, readQuestion, m1), memory: m1});
  assert.equal(m2.secretChamber?.method, "vent-note-read");
  assert.equal(select(s, leverQuestion(), m2).choice.answerIndex, 1);
});

function riftPair() {
  const a = snapshot("GroupA"), c = snapshot("GroupC");
  a.game.locations.here = {id: "a-public-chamber", cardCode: "c70018", revealed: true, tokens: []};
  for (const s of [a, c]) s.game.stories.rift = {id: "rift", cardCode: "c70034"};
  const aq = question([storyChoice({tag: "OfferExchange", contents: [actorId, "actual-exchange", "GroupC", actorId]}, "Offer resources, clues, cards or story assets to GroupC")]);
  const cq = question([storyChoice({tag: "OfferExchange", contents: [actorId, "actual-exchange", "GroupA", actorId]}, "Offer resources, clues, cards or story assets to GroupA")]);
  return {aSnapshot: a, aQuestion: aq, cSnapshot: c, cQuestion: cq};
}

test("Rift conversation requires actual A/C participant offers in one open exchange and A's revealed local card", () => {
  const pair = riftPair();
  noHiddenReads(pair.aSnapshot); noHiddenReads(pair.cSnapshot);
  const known = labyrinthRiftKnowledge(pair);
  assert.equal(known?.method, "rift-private-exchange");
  assert.equal(select(pair.cSnapshot, leverQuestion(), {}, {secretChamber: known}).choice.answerIndex, 0);
  pair.aSnapshot.game.locations.here.revealed = false;
  assert.equal(labyrinthRiftKnowledge(pair), undefined);
  pair.aSnapshot.game.locations.here.revealed = true;
  pair.cQuestion.choices[0].disabled = true;
  assert.equal(labyrinthRiftKnowledge(pair), undefined);
});

test("a mismatched Rift exchange or secret communication for another game cannot authorize the lever", () => {
  const pair = riftPair(), known = labyrinthRiftKnowledge(pair)!;
  assert.equal(select({...pair.cSnapshot, game: {...pair.cSnapshot.game, id: "foreign-game"}}, leverQuestion(), {}, {secretChamber: known}), undefined);
  pair.cQuestion = question([storyChoice({tag: "OfferExchange", contents: [actorId, "other-exchange", "GroupA", actorId]}, "Offer resources, clues, cards or story assets to GroupA")]);
  assert.equal(labyrinthRiftKnowledge(pair), undefined);
});

test("stage-one A requires a physical controlled key and two actual native clues", () => {
  const s = snapshot("GroupA");
  assert.equal(labyrinthProgress(s).ready, false);
  s.game.assets.key = {id: "key", cardCode: "c70040", visible: true, controller: actorId};
  noHiddenReads(s);
  assert.equal(labyrinthProgress(s).ready, true);
  s.game.assets.key.controller = "foreign-controller";
  assert.equal(labyrinthProgress(s).ready, false);
});

test("printed Mythos threshold needs the real local prerequisite and explicit runner scheduling control", () => {
  const s = snapshot("GroupA"), ordinary = label("Place 1 doom", [], 0), advance = label("Satisfy doom threshold", [], 1);
  const q = question([ordinary, advance]);
  assert.equal(select(s, q, {allowStageAdvance: true}).choice, ordinary);
  s.game.assets.key = {id: "key", cardCode: "c70040", controller: actorId};
  assert.equal(select(s, q).choice, ordinary);
  assert.equal(select(s, q, {allowStageAdvance: true}).choice, advance);
  advance.disabled = true;
  assert.equal(select(s, q, {allowStageAdvance: true}).choice, ordinary);
});

test("C lever action is not attempted without printed communication even when clues are available", () => {
  const s = snapshot(), lever = ability("70024", 1, "here", "LocationSource", 0), end = endTurn(1);
  s.game.locations.here.cardCode = "c70024";
  s.game.locations.here.tokens = [];
  const q = question([lever, end], {tag: "PlayerWindowChooseOne", isPlayerWindow: true});
  assert.equal(select(s, q).choice, end);
});

test("B cannot turn Poison's valve without actual injection and physical owned diagram", () => {
  const s = snapshot("GroupB", 2), valve = ability("70031", 1, "here", "LocationSource"), end = endTurn(1);
  s.game.locations.here.cardCode = "c70031"; s.game.locations.here.tokens = [];
  s.game.assets.diagram = {id: "diagram", cardCode: "c70044", controller: actorId};
  const q = question([valve, end], {tag: "PlayerWindowChooseOne", isPlayerWindow: true});
  assert.equal(select(s, q).choice, end);
  s.game.scenario.log = [{tag: "BeenInjected", contents: {getLabel: {title: "Roland Banks"}, unLabel: actorId}}];
  assert.equal(select(s, q).choice, valve);
});

test("the chamber's genuine enabled reward is selected, but a mismatched physical ability source is rejected", () => {
  const s = snapshot("GroupA", 2), reward = ability("70029", 1, "here", "LocationSource"), end = endTurn(1);
  s.game.locations.here.cardCode = "c70029";
  const q = question([reward, end], {tag: "PlayerWindowChooseOne", isPlayerWindow: true});
  assert.equal(select(s, q).choice, reward);
  reward.raw.ability.source.contents = "does-not-exist";
  assert.equal(select(s, q).choice, end);
});

test("Pet progress requires a real native physical victory-display card; thirteen boss damage requires known health", () => {
  const c = snapshot("GroupC", 2);
  assert.equal(labyrinthProgress(c).ready, false);
  c.game.scenario.victoryDisplay = [{tag: "EncounterCard", contents: {id: "actual-pet-card", cardCode: "c70049"}}];
  assert.equal(labyrinthProgress(c).ready, true);
  const a = snapshot("GroupA", 3);
  a.game.enemies.boss = {id: "boss", cardCode: "c70048", tokens: [["Damage", 13]]};
  assert.equal(labyrinthProgress(a, {group: "GroupA"}).ready, false);
  a.game.enemies.boss.currentHealth = 12;
  assert.equal(labyrinthProgress(a, {group: "GroupA"}).ready, true);
  a.game.enemies.boss.tokens = [["Damage", 11]];
  assert.equal(labyrinthProgress(a, {group: "GroupA"}).ready, false);
});

test("unknown multiple offered decisions stay unsupported instead of choosing their first option", () => {
  const s = snapshot();
  assert.equal(select(s, question([label("Unrecognized consequence", [], 0), label("Another unrecognized consequence", [], 1)])), undefined);
  assert.equal(select(s, question([endTurn()], {tag: "PlayerWindowChooseOne", isPlayerWindow: true})).choice.tag, "EndTurnButton");
});

test("offered facedown movement does not branch on the hidden location code or read hidden collections", () => {
  const s = snapshot("GroupC", 2);
  s.game.locations.here.tokens = [];
  s.game.locations.unknown = {id: "unknown", revealed: false, connectedLocations: ["here"]};
  Object.defineProperty(s.game.locations.unknown, "cardCode", {get() {throw new Error("Forbidden facedown identity read");}});
  noHiddenReads(s);
  const move = ability("70029", 104, "unknown", "LocationSource"), end = endTurn(1);
  const q = question([move, end], {tag: "PlayerWindowChooseOne", isPlayerWindow: true});
  assert.equal(select(s, q).choice, move);
});

test("actual native ProxySource record selects the physical owned Hunger Diagram proxy", () => {
  const s = snapshot("GroupB", 2);
  s.game.locations.here = {id: "here", cardCode: "c70030", revealed: true, tokens: []};
  s.game.assets.hunger = {id: "hunger", cardCode: "c70044", controller: actorId};
  const proxy = ability("70044", 2, "hunger", "AssetSource");
  proxy.raw.ability.source = {tag: "ProxySource", source: {tag: "LocationSource", contents: "here"},
    originalSource: {tag: "AssetSource", contents: "hunger"}};
  const q = question([proxy, endTurn(1)], {tag: "PlayerWindowChooseOne", isPlayerWindow: true});
  assert.equal(select(s, q).choice, proxy);
  proxy.raw.ability.source.originalSource.contents = "missing-physical-diagram";
  assert.equal(select(s, q).choice.tag, "EndTurnButton");
});

test("actual scenario.log and Labeled unLabel bind injection and valve to the actor", () => {
  const s = snapshot("GroupB", 2);
  s.game.scenario.log = ["BeenInjected", "TurnedTheValve"].map((tag) => ({tag, contents: {getLabel: {title: "Roland Banks"}, unLabel: actorId}}));
  assert.equal(labyrinthProgress(s).ready, true);
  s.game.scenario.log[0].contents.unLabel = "foreign-investigator";
  assert.equal(labyrinthProgress(s).ready, false);
});

test("act-three distortion movement uses revealed printed catalog traits, with no native traits field", () => {
  const s = snapshot("GroupA", 3);
  s.game.locations.here = {id: "here", revealed: true, cardCode: "c70032", tokens: [], connectedLocations: ["night"]};
  s.game.locations.night = {id: "night", revealed: true, cardCode: "c70022", tokens: [], connectedLocations: ["here"]};
  s.game.enemies.boss = {id: "boss", cardCode: "c70048", currentHealth: 12, tokens: [], placement: {tag: "AtLocation", contents: "here"}};
  const move = ability("70022", 104, "night", "LocationSource"), q = question([move, endTurn(1)], {tag: "PlayerWindowChooseOne", isPlayerWindow: true});
  const r: any = selectLabyrinthChoice({snapshot: s, question: q, cards: [{code: "70022", traits: "Distortion."}], memory: {group: "GroupA"}});
  assert.equal(r.choice, move);
});

test("A's Rot plan refuses a lethal next Mythos and caps partial clue conversion below its threshold", () => {
  const s = snapshot("GroupA", 2);
  s.game.locations.here = {id: "here", cardCode: "c70029", revealed: true, tokens: []};
  s.game.assets.rot = {id: "rot", cardCode: "c70042", controller: actorId};
  const rot = ability("70042", 2, "rot", "AssetSource"), q = question([rot, endTurn(1)], {tag: "PlayerWindowChooseOne", isPlayerWindow: true});
  s.game.totalDoom = 6; s.game.investigators[actorId].tokens = [["Clue", 0]];
  assert.equal(select(s, q), undefined);
  s.game.investigators[actorId].tokens = [["Clue", 2]];
  assert.equal(select(s, q).choice, rot);
  s.game.totalDoom = 5; s.game.investigators[actorId].remainingActions = 0;
  const convert = question([0, 1, 2].map((n) => label(`Turn ${n} of your clues into additional doom in Chamber of Decay`, [], n)));
  assert.equal(select(s, convert).choice.answerIndex, 0);
  s.game.totalDoom = 9;
  assert.equal(select(s, convert).choice.answerIndex, 2);
});

test("C's post-key spare-clue gift opens the actual Vent menu and waits for a recorded real send", () => {
  const s = snapshot();
  s.game.investigators[actorId].tokens = [["Clue", 3]];
  s.game.stories.vent = {id: "vent", cardCode: "c70035", placement: {tag: "AtLocation", contents: "here"}};
  const deposit = ability("70035", 1, "vent"), q = question([deposit, endTurn(1)], {tag: "PlayerWindowChooseOne", isPlayerWindow: true});
  assert.equal(select(s, q, {ventSent: true}).choice, deposit);
  const place = storyChoice({tag: "DepositVentToken", contents: [actorId, "Clue", 1]}, "Place 1 Clue token(s)");
  const pq = question([place, label("Finish placing objects in the Vent", [], 1)]);
  const m = observeLabyrinthChoice({snapshot: s, question: pq, selection: select(s, pq), memory: {ventSent: true}});
  assert.equal(m.ventPayload?.destination, "GroupB");
  assert.equal(m.clueGiftSent, undefined);
  const send = storyChoice({tag: "SendVent", contents: [actorId, "GroupB"]}, "Send the Vent's contents to GroupB");
  const sq = question([send]);
  assert.equal(observeLabyrinthChoice({snapshot: s, question: sq, selection: select(s, sq, m), memory: m}).clueGiftSent, true);
});

test("C's spare Rift clue is offered despite the actor's retained Note also appearing in the menu", () => {
  const s = snapshot(); s.game.investigators[actorId].tokens = [["Clue", 3]];
  s.game.stories.rift = {id: "rift", cardCode: "c70034"};
  s.game.assets.note = {id: "note", cardCode: "c70039", controller: actorId};
  const note = storyChoice({tag: "OfferExchangeStoryAsset", contents: [actorId, "actual-exchange", "GroupB", "recipient", "note"]}, "Eixodolon's Note");
  const clue = storyChoice({tag: "OfferExchangeToken", contents: [actorId, "actual-exchange", "GroupB", "recipient", "Clue", 1]}, "Give 1 Clue token(s)", 1);
  const q = question([note, clue, label("Return to the private exchange", [], 2)]);
  assert.equal(select(s, q).choice, clue);
});

test("ordinary native attack damage and horror choose actual owned physical soak instead of a foreign asset", () => {
  const s = snapshot("GroupA");
  s.game.assets.soak = {id: "soak", cardCode: "c05109", controller: actorId};
  s.game.assets.foreign = {id: "foreign", cardCode: "c05109", controller: "foreign-investigator"};
  const foreign = choice("ComponentLabel", {component: {tag: "AssetComponent", assetId: "foreign", tokenType: "HorrorToken"}}, "Foreign soak");
  const own = choice("ComponentLabel", {component: {tag: "AssetComponent", assetId: "soak", tokenType: "HorrorToken"}}, "Own soak", 1);
  const self = choice("ComponentLabel", {component: {tag: "InvestigatorComponent", investigatorId: actorId, tokenType: "HorrorToken"}}, "Own horror", 2);
  assert.equal(select(s, question([foreign, own, self])).choice, own);
  own.disabled = true;
  assert.equal(select(s, question([foreign, own, self])).choice, self);
});

test("the actual keep-mulligan choice preserves random opening cards rather than selecting a hand card", () => {
  const s = snapshot(); s.game.inSetup = true;
  const done = label("$game.doneWithMulligan", [], 1), card = choice("TargetLabel", {target: {tag: "CardIdTarget", contents: "opening-card"}});
  assert.equal(select(s, question([card, done], {tag: "ChooseSome"})).choice, done);
});

test("an insufficient Rot budget routes to already revealed physical clues before ending into a fatal Mythos", () => {
  const s = snapshot("GroupA", 2);
  s.game.totalDoom = 6; s.game.investigators[actorId].tokens = [["Clue", 0]];
  s.game.locations.here = {id: "here", revealed: true, cardCode: "c70029", tokens: [], connectedLocations: ["secrets"]};
  s.game.locations.secrets = {id: "secrets", revealed: true, cardCode: "c70016", tokens: [["Clue", 2]], connectedLocations: ["here"]};
  s.game.assets.rot = {id: "rot", cardCode: "c70042", controller: actorId};
  const move = ability("70016", 104, "secrets", "LocationSource"), q = question([move, endTurn(1)], {tag: "PlayerWindowChooseOne", isPlayerWindow: true});
  assert.equal(select(s, q).choice, move);
});

test("every successful actual Vent send has a new marker after clearing its payload, including a second send", () => {
  const s = snapshot(), send = storyChoice({tag: "SendVent", contents: [actorId, "GroupB"]}, "Send the Vent's contents to GroupB"), q = question([send]);
  const memory: any = {ventSent: true, ventPayload: {destination: "GroupB", clues: 1}, lastVentSend: {destination: "GroupA", witness: {questionVersion: 1}}};
  const next = observeLabyrinthChoice({snapshot: s, question: q, selection: select(s, q, memory), memory});
  assert.equal(next.ventPayload, undefined);
  assert.equal(next.lastVentSend?.destination, "GroupB");
  assert.notEqual(next.lastVentSend, memory.lastVentSend);
});

const nativeRequest = (group: string, operation: any, labelText: string, index = 0) => label(labelText,
  [{tag: "ScenarioSpecific", contents: ["epicLabyrinth.request", {requestId: `request-${index}`, requestOrigin: group, requestOperation: operation}]}], index);
const paradoxMemory = (s: any): any => ({lastAbility: {cardCode: "70059", index: 1, source: {tag: "TreacherySource", contents: "discarded-paradox"},
  witness: {gameId: s.game.id, actorId, playerId: s.playerId, questionVersion: 153}}});
const exchangeId = "5d9e8fa3-4a68-4d6e-b02c-6969eaeecee2";

test("the real discarded Paradox OpenParadox wire chooses an offered participant and records no chamber knowledge", () => {
  const s = snapshot("GroupA"), memory = paradoxMemory(s);
  const b = nativeRequest("GroupA", {tag: "OpenParadox", contents: [actorId, "GroupB", actorId, exchangeId]}, 'Talk and exchange privately with "01001" in GroupB');
  const c = nativeRequest("GroupA", {tag: "OpenParadox", contents: [actorId, "GroupC", actorId, exchangeId]}, 'Talk and exchange privately with "01001" in GroupC', 1);
  const q = question([b, c], {playerId: s.playerId, questionVersion: 154});
  noHiddenReads(s);
  const selection = select(s, q, memory);
  assert.equal(selection.choice, b);
  const observed = observeLabyrinthChoice({snapshot: s, question: q, selection, memory});
  assert.equal(observed.paradoxExchange?.destination, "GroupB");
  assert.equal(observed.secretChamber, undefined);
  assert.equal(select(s, q), undefined);
  b.disabled = true;
  assert.equal(select(s, q, memory).choice, c);
});

test("Paradox words cannot stand in for actual origin/actor-bound native operation choices", () => {
  const s = snapshot("GroupA"), memory = paradoxMemory(s);
  const fake = label('Talk and exchange privately with "01001" in GroupB');
  const wrong = nativeRequest("GroupC", {tag: "OpenParadox", contents: [actorId, "GroupB", actorId, exchangeId]}, 'Talk and exchange privately with "01001" in GroupC', 1);
  const q = question([fake, wrong], {playerId: s.playerId, questionVersion: 154});
  assert.equal(select(s, q, memory), undefined);
  wrong.raw.messages[0].contents[1].requestOrigin = "GroupA";
  wrong.raw.messages[0].contents[1].requestOperation.contents[0] = "foreign-investigator";
  assert.equal(select(s, q, memory), undefined);
});

test("both real Paradox participants finish only their actual matching exchange without transferring anything", () => {
  for (const group of ["GroupA", "GroupB"] as const) {
    const s = snapshot(group), other = group === "GroupA" ? "GroupB" : "GroupA";
    const finish = nativeRequest(group, {tag: "CloseExchange", contents: exchangeId}, "Finish the private exchange");
    const offer = label(`Offer resources, cards or story assets to ${other}`,
      [{tag: "ScenarioSpecific", contents: ["epicLabyrinth.exchange", {tag: "OfferPrivate", contents: [actorId, exchangeId, other, actorId]}]}], 1);
    const q = question([finish, offer], {playerId: s.playerId});
    noHiddenReads(s);
    assert.equal(select(s, q).choice, finish);
    const memory = observeLabyrinthChoice({snapshot: s, question: q, selection: select(s, q)});
    assert.equal(memory.secretChamber, undefined);
    finish.disabled = true;
    assert.equal(select(s, q), undefined);
  }
});

test("private exchange finish rejects another UUID or another request origin", () => {
  const s = snapshot("GroupA"), finish = nativeRequest("GroupA", {tag: "CloseExchange", contents: "unrelated-exchange"}, "Finish the private exchange");
  const offer = label("Offer resources, cards or story assets to GroupB",
    [{tag: "ScenarioSpecific", contents: ["epicLabyrinth.exchange", {tag: "OfferPrivate", contents: [actorId, exchangeId, "GroupB", actorId]}]}], 1);
  const q = question([finish, offer], {playerId: s.playerId});
  assert.equal(select(s, q), undefined);
  finish.raw.messages[0].contents[1].requestOperation.contents = exchangeId;
  finish.raw.messages[0].contents[1].requestOrigin = "GroupC";
  assert.equal(select(s, q), undefined);
});

function nativeCommitFixture() {
  const s = snapshot(), card = {id: "47934534-dc23-4fe6-b413-3c2a5e8d342f", cardCode: "c01089", owner: actorId};
  const testId = "714e7e13-f963-4beb-a934-fb4fa540797b";
  s.game.investigators[actorId].hand = [{tag: "PlayerCard", contents: card}];
  s.game.skillTest = {id: testId, investigator: actorId, skills: ["SkillWillpower"], type: {tag: "SkillSkillTest", contents: "SkillWillpower"},
    modifiedSkillValue: 2, modifiedDifficulty: 3, committedCards: {}};
  const commit = choice("TargetLabel", {target: {tag: "CardIdTarget", contents: card.id}, messages: [
    {tag: "SkillTestMessage", contents: {tag: "SkillTestCommitCard_", contents: [actorId, {tag: "PlayerCard", contents: {...card}}]}},
    {tag: "Do", contents: {tag: "SkillTestMessage", contents: {tag: "CommitToSkillTest_", contents: [testId, {tag: "StartSkillTestButton", investigatorId: actorId}]}}},
  ]}, "Guts");
  const start = choice("StartSkillTestButton", {investigatorId: actorId}, "Start skill test", 1);
  return {s, q: question([commit, start], {playerId: s.playerId}), commit, start,
    cards: [{code: "01089", type_code: "skill", skill_willpower: 2}]};
}

test("real nested SkillTestMessage commit binds own hand and exact test continuation, without hidden reads or mutation", () => {
  const {s, q, commit, cards} = nativeCommitFixture();
  const before = JSON.stringify({s, q});
  assert.equal((selectLabyrinthChoice({snapshot: s, question: q, cards}) as any).choice, commit);
  assert.equal(JSON.stringify({s, q}), before);
  noHiddenReads(s);
  assert.equal((selectLabyrinthChoice({snapshot: s, question: q, cards}) as any).choice, commit);
});

test("nested commit rejects foreign actors, card payload mismatches, stale tests, disabled choices and duplicate physical commits", () => {
  const changes = [
    (f: any) => {f.q.playerId = "foreign-player";},
    (f: any) => {f.s.game.skillTest.investigator = "foreign-investigator";},
    (f: any) => {f.commit.raw.messages[0].contents.contents[0] = "foreign-investigator";},
    (f: any) => {f.commit.raw.messages[0].contents.contents[1].contents.id = "another-physical-card";},
    (f: any) => {f.commit.raw.messages[0].contents.contents[1].contents.owner = "foreign-investigator";},
    (f: any) => {f.commit.raw.messages[0].contents.contents[1].contents.cardCode = "c01093";},
    (f: any) => {f.commit.raw.messages[1].contents.contents.contents[0] = "stale-test";},
    (f: any) => {f.commit.raw.messages[1].contents.contents.contents[1].investigatorId = "foreign-investigator";},
    (f: any) => {f.commit.disabled = true;},
    (f: any) => {f.s.game.skillTest.committedCards = {[actorId]: f.s.game.investigators[actorId].hand};},
  ];
  for (const change of changes) {
    const f = nativeCommitFixture(); change(f);
    const selected: any = selectLabyrinthChoice({snapshot: f.s, question: f.q, cards: f.cards});
    assert.notEqual(selected?.choice, f.commit);
  }
});

test("nested commit remains bounded to two physical cards and a useful native modified-value margin", () => {
  const f = nativeCommitFixture();
  f.s.game.skillTest.modifiedSkillValue = 7;
  assert.equal((selectLabyrinthChoice({snapshot: f.s, question: f.q, cards: f.cards}) as any).choice, f.start);
  f.s.game.skillTest.modifiedSkillValue = 2;
  f.s.game.skillTest.committedCards = {[actorId]: [{id: "committed-one", cardCode: "c01039"}, {id: "committed-two", cardCode: "c01039"}]};
  assert.equal((selectLabyrinthChoice({snapshot: f.s, question: f.q, cards: f.cards}) as any).choice, f.start);
});

test("C can reach the Rune's public physical attachment before learning the secret, without reading a facedown identity", () => {
  const s = snapshot();
  s.game.locations.regret = {id: "regret", revealed: false, tokens: [], connectedLocations: ["here"]};
  Object.defineProperty(s.game.locations.regret, "cardCode", {get() {throw new Error("Forbidden facedown identity read");}});
  s.game.stories.runes = {id: "c70033", placement: {tag: "AttachedToLocation", contents: "regret"}, tokens: []};
  const move = ability("70024", 104, "regret", "LocationSource"), q = question([move, endTurn(1)], {tag: "PlayerWindowChooseOne", isPlayerWindow: true});
  noHiddenReads(s);
  assert.equal(select(s, q).choice, move);
  assert.equal(observeLabyrinthChoice({snapshot: s, question: q, selection: select(s, q)}).secretChamber, undefined);
});
