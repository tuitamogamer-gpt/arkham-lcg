/** Pure, bounded tactics for the genuine three-group Labyrinth runner.
 * Every returned choice is an enabled member of the supplied native question.
 * This module reads neither scenario metadata/replicas nor deck order, set-aside
 * cards, cardsUnderneath, or another group's play area. The only cross-group
 * secret accepted below has an explicit printed communication witness.
 * Policy unit tests establish these boundaries, not a completed playthrough.
 */
import {isDeepStrictEqual} from "node:util";
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const rows = (v) => Array.isArray(v) ? v.map((r) => Array.isArray(r) ? r[1] : r) : Object.values(v || {});
const unwrap = (v) => object(v?.contents) && /^(PlayerCard|EncounterCard)$/.test(v.tag || "") ? v.contents : v;
const code = (v) => {
  const value = typeof v === "string" ? v : v?.cardCode || v?.art || v?.id || "";
  return /^c?\d{5}[a-z]?$/.test(value) ? value.replace(/^c/, "") : undefined;
};
const enabled = (q) => (q?.choices || []).filter((c) => c && !c.disabled && Number.isSafeInteger(c.answerIndex));
const text = (c) => `${c?.label || ""} ${typeof c?.raw?.label === "string" ? c.raw.label : ""}`;
const result = (choice, reason) => choice ? {choice, reason} : undefined;
const findText = (choices, expression) => choices.find((c) => expression.test(text(c)));
const actorOf = (s) => rows(s?.game?.investigators).find((i) => i.playerId === s?.playerId);
const scenarioOf = (s) => s?.game?.scenario || s?.game?.mode?.That || s?.game?.mode?.These?.[1];
const token = (entity, type) => {
  const tokens = entity?.tokens;
  if (Array.isArray(tokens)) return Number(tokens.find((r) => Array.isArray(r) && r[0] === type)?.[1] || 0);
  return Number(tokens?.[type] || 0);
};
const locationId = (entity) => /^(AtLocation|AttachedToLocation)$/.test(entity?.placement?.tag || "") ? entity.placement.contents : undefined;
const remembered = (snapshot, key, actorId) => rows(scenarioOf(snapshot)?.log).some((r) =>
  r?.tag === key && (!actorId || r.contents?.unLabel === actorId));
const groupByAct = Object.freeze({"70007": "GroupA", "70008": "GroupB", "70009": "GroupC", "70011": "GroupA", "70012": "GroupB", "70013": "GroupC"});
const chambers = Object.freeze({"70016": "right", "70017": "middle", "70018": "left"});
const chamberNames = Object.freeze({"70016": "Bloody Prison", "70017": "Mysterious Prison", "70018": "Enshrouded Prison"});
const diagramForGroup = Object.freeze({GroupA: "70042", GroupB: "70044", GroupC: "70046"});
const diagramDestination = Object.freeze({"70042": "GroupA", "70044": "GroupB", "70046": "GroupC"});
const ownDiagramChamber = Object.freeze({GroupA: "70029", GroupB: "70030", GroupC: "70028"});

function frame(snapshot, memory) {
  const game = snapshot?.game || {}, actor = actorOf(snapshot);
  const acts = rows(game.acts), act = acts.find((a) => !a.flipped) || acts[0];
  const group = groupByAct[code(act)] || memory?.group;
  const stage = Array.isArray(act?.sequence) ? act.sequence[0] : act?.sequence?.actSequenceStep;
  const locations = rows(game.locations), hereId = locationId(actor), here = locations.find((l) => l.id === hereId);
  const assets = rows(game.assets).filter((a) => a.visible !== false);
  const controlled = assets.filter((a) => a.controller === actor?.id || a.placement?.tag === "InPlayArea" && a.placement.contents === actor?.id);
  return {game, actor, group, stage, act, locations, hereId, here, assets, controlled,
    stories: rows(game.stories), enemies: rows(game.enemies), treacheries: rows(game.treacheries), clues: token(actor, "Clue"),
    resources: token(actor, "Resource"), actions: Number(actor?.remainingActions || 0)};
}

/** Source references are taken only from the offered ability, never a queue. */
function references(source, depth = 0) {
  if (!object(source) || depth > 8) return [];
  if (source.tag === "ProxySource" && source.source && source.originalSource)
    return [...references(source.source, depth + 1), ...references(source.originalSource, depth + 1)];
  if (source.tag === "ProxySource" && Array.isArray(source.contents)) return source.contents.flatMap((s) => references(s, depth + 1));
  if (source.tag === "AbilitySource" && Array.isArray(source.contents)) return references(source.contents[0], depth + 1);
  return /^(Location|Asset|Enemy|Investigator|Story|Act|Agenda|Treachery)Source$/.test(source.tag || "")
    && typeof source.contents === "string" ? [{tag: source.tag, id: source.contents}] : [];
}
const ability = (choice) => choice?.tag === "AbilityLabel" ? choice.raw?.ability : undefined;
const abilityCode = (choice) => code(ability(choice)?.cardCode);
const byAbility = (choices, cardCode, index) => choices.find((c) => abilityCode(c) === cardCode && ability(c)?.index === index);
const target = (choice) => choice?.raw?.target || choice?.source;
const targetId = (choice) => typeof target(choice)?.contents === "string" ? target(choice).contents : undefined;
const hand = (f) => (f.actor?.hand || []).map(unwrap);
const handChoice = (f, c) => target(c)?.tag === "CardIdTarget" ? hand(f).find((v) => v.id === targetId(c)) : undefined;
const catalog = (cards) => Array.isArray(cards) ? new Map(cards.map((c) => [c.code, c])) : cards instanceof Map ? cards : new Map(Object.entries(cards || {}));

function boundAbility(f, choice) {
  const a = ability(choice);
  if (!a) return true;
  const refs = references(a.source);
  if (!refs.length) return false;
  const collections = {LocationSource: f.locations, AssetSource: f.assets, StorySource: f.stories,
    EnemySource: f.enemies, ActSource: rows(f.game.acts), AgendaSource: rows(f.game.agendas), InvestigatorSource: rows(f.game.investigators),
    TreacherySource: f.treacheries};
  const entities = refs.map((r) => ({reference: r, entity: collections[r.tag]?.find((e) => e.id === r.id)}));
  if (entities.some((r) => !r.entity)) return false;
  if (a.basic === true || [103, 104].includes(a.index)) return true;
  return entities.some(({reference, entity}) => (reference.tag !== "LocationSource" || entity.revealed === true)
    && code(entity) === abilityCode(choice));
}

/** Inspecting the effects of an offered choice does not submit those effects.
 * Limit traversal to its UI messages; the native save/metadata is never walked.
 */
function messages(choice) {
  const found = [];
  function walk(v, depth) {
    if (depth > 14 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const item of v) walk(item, depth + 1); return; }
    if (typeof v.tag === "string") found.push(v);
    if (v.contents !== undefined) walk(v.contents, depth + 1);
    if (v.messages !== undefined) walk(v.messages, depth + 1);
  }
  walk(choice?.raw?.messages || [], 0);
  return found;
}
const containsMessage = (choice, tag) => messages(choice).some((m) => m.tag === tag);
const storyCommands = (choice) => messages(choice).filter((m) => m.tag === "ScenarioSpecific" && Array.isArray(m.contents)
  && m.contents[0] === "epicLabyrinth.story").map((m) => m.contents[1]);
const exchangeCommands = (choice) => messages(choice).filter((m) => m.tag === "ScenarioSpecific" && Array.isArray(m.contents)
  && m.contents[0] === "epicLabyrinth.exchange").map((m) => m.contents[1]);
const requests = (choice) => messages(choice).filter((m) => m.tag === "ScenarioSpecific" && Array.isArray(m.contents)
  && m.contents[0] === "epicLabyrinth.request").map((m) => m.contents[1]);
const choiceWitness = (s, q, c) => ({gameId: s.game.id, actorId: actorOf(s)?.id, playerId: s.playerId,
  questionVersion: q.questionVersion, questionTag: q.tag, answerIndex: c.answerIndex,
  label: c.label, rawLabel: typeof c.raw?.label === "string" ? c.raw.label : undefined});

function paradoxOffer(f, c) {
  const request = requests(c).find((r) => r?.requestOrigin === f.group && r.requestOperation?.tag === "OpenParadox");
  const contents = request?.requestOperation?.contents;
  if (!Array.isArray(contents) || contents.length !== 4 || contents[0] !== f.actor?.id
    || !["GroupA", "GroupB", "GroupC"].includes(contents[1]) || contents[1] === f.group
    || typeof contents[2] !== "string" || !contents[2] || typeof contents[3] !== "string" || !contents[3]) return undefined;
  return {destination: contents[1], recipientId: contents[2], exchangeId: contents[3]};
}

/** Match the real own-hand native commit and its continuation to the active
 * skill-test ID. Nested SkillTestMessage sum constructors keep their trailing
 * underscore in JSON; a label/hand-card resemblance alone is insufficient.
 */
function offeredCommitCard(f, question, choice) {
  const test = f.game.skillTest, card = handChoice(f, choice);
  if (question.playerId !== f.actor?.playerId || !test || test.investigator !== f.actor?.id
    || typeof test.id !== "string" || !test.id || !card || card.owner !== f.actor.id) return undefined;
  const ownCommit = messages(choice).some((m) => ["SkillTestCommitCard_", "SkillTestCommitCard", "CommitCard"].includes(m.tag)
    && Array.isArray(m.contents) && m.contents[0] === f.actor.id && (() => {
      const committed = unwrap(m.contents[1]);
      return committed?.id === card.id && committed.owner === f.actor.id && committed.cardCode === card.cardCode;
    })());
  const continuation = messages(choice).some((m) => ["CommitToSkillTest_", "CommitToSkillTest"].includes(m.tag)
    && Array.isArray(m.contents) && m.contents[0] === test.id && m.contents[1]?.tag === "StartSkillTestButton"
    && m.contents[1].investigatorId === f.actor.id);
  return ownCommit && continuation ? card : undefined;
}

/** An actor's local prerequisites. No other seat or coordinator is consulted. */
export function labyrinthProgress(snapshot, memory = {}) {
  const f = frame(snapshot, memory);
  if (!f.actor || !f.group) return {stage: f.stage, group: f.group, ready: false};
  let ready = false, conditions;
  if (f.stage === 1) {
    const key = f.controlled.some((a) => code(a) === "70040");
    const leverPulled = Object.keys(chambers).some((c) => remembered(snapshot,
      {right: "PulledTheRightLever", middle: "PulledTheMiddleLever", left: "PulledTheLeftLever"}[chambers[c]], f.actor.id))
      || memory.leverPulled === true;
    conditions = {clues: f.clues, keyControlled: key, leverPulled};
    ready = f.group === "GroupA" ? key && f.clues >= 2 : f.group === "GroupB" ? f.clues >= 2 : leverPulled;
  } else if (f.stage === 2) {
    const doom = Number(f.game.totalDoom || 0);
    const injected = remembered(snapshot, "BeenInjected", f.actor.id) || memory.injected === true;
    const valve = remembered(snapshot, "TurnedTheValve", f.actor.id) || memory.valveTurned === true;
    const victory = rows(scenarioOf(snapshot)?.victoryDisplay).some((c) => code(unwrap(c)) === "70049");
    conditions = {doom, injected, valveTurned: valve, petInVictory: victory};
    ready = f.group === "GroupA" ? doom >= 11 : f.group === "GroupB" ? injected && valve : victory;
  } else if (f.stage === 3) {
    const boss = f.enemies.find((e) => code(e) === "70048");
    const health = typeof boss?.currentHealth === "number" ? boss.currentHealth : typeof boss?.health === "number" ? boss.health : undefined;
    const damage = token(boss, "Damage");
    conditions = {bossId: boss?.id, bossHealth: health, bossDamage: damage};
    ready = !!boss && health !== undefined && damage >= health;
  }
  return {stage: f.stage, group: f.group, ready, conditions};
}

function secretKnowledge(memory, teamKnowledge, snapshot) {
  const k = memory?.secretChamber || teamKnowledge?.secretChamber;
  if (!k || !Object.hasOwn(chambers, k.code) || k.recipientGroup !== "GroupC" || !k.witness) return undefined;
  if (k.recipientGameId !== snapshot?.game?.id) return undefined;
  const w = k.witness;
  if (k.method === "arcane-runes-card-label" && w.storyCode === "70033" && w.abilityIndex === 3
    && w.cardCode === k.code && w.choiceTag === "CardLabel" && w.enabled === true
    && w.gameId === snapshot.game.id && Number.isSafeInteger(w.answerIndex)) return k;
  if (k.method === "vent-note-read" && w.storyCode === "70035" && w.noteTaken === true
    && w.gameId === snapshot.game.id && typeof w.note === "string" && noteCode(w.note) === k.code
    && Number.isSafeInteger(w.answerIndex)) return k;
  if (k.method === "rift-private-exchange" && w.exchangeId && w.a?.group === "GroupA" && w.c?.group === "GroupC"
    && w.c.gameId === snapshot.game.id && w.a.exchangeId === w.exchangeId && w.c.exchangeId === w.exchangeId
    && w.a.offerGroup === "GroupC" && w.c.offerGroup === "GroupA"
    && w.revealedLocation?.revealed === true && w.revealedLocation.cardCode === k.code
    && typeof w.revealedLocation.id === "string") return k;
}
const noteCode = (note) => /^\[Labyrinth GroupA Secrets (70016|70017|70018)\]/.exec(note)?.[1];

function riftEvidence(snapshot, question, recipientGroup) {
  const actor = actorOf(snapshot);
  const offered = enabled(question).flatMap((c) => storyCommands(c).map((command) => ({choice: c, command})))
    .find(({command: c}) => c?.tag === "OfferExchange" && Array.isArray(c.contents)
      && c.contents[0] === actor?.id && c.contents[2] === recipientGroup
      && typeof c.contents[1] === "string" && typeof c.contents[3] === "string");
  if (!offered || !rows(snapshot.game.stories).some((s) => code(s) === "70034")) return undefined;
  return {...choiceWitness(snapshot, question, offered.choice), exchangeId: offered.command.contents[1],
    recipientId: offered.command.contents[3], offerGroup: recipientGroup};
}

/** This is an explicit, recorded private conversation permitted by the actual
 * Rift prompts. Both actors must be participants in the same exchange. It
 * records only A's already revealed location, not replicaSecretChamber.
 */
export function labyrinthRiftKnowledge({aSnapshot, aQuestion, cSnapshot, cQuestion}) {
  const a = frame(aSnapshot, {}), c = frame(cSnapshot, {});
  if (a.group !== "GroupA" || c.group !== "GroupC" || a.stage !== 1 || c.stage !== 1) return undefined;
  const ae = riftEvidence(aSnapshot, aQuestion, "GroupC"), ce = riftEvidence(cSnapshot, cQuestion, "GroupA");
  const visible = a.locations.find((l) => l.revealed === true && Object.hasOwn(chambers, code(l)));
  if (!ae || !ce || !visible || ae.exchangeId !== ce.exchangeId
    || ae.recipientId !== c.actor?.id || ce.recipientId !== a.actor?.id) return undefined;
  const chamberCode = code(visible);
  return {code: chamberCode, method: "rift-private-exchange", recipientGroup: "GroupC", recipientGameId: cSnapshot.game.id,
    witness: {exchangeId: ae.exchangeId, a: {...ae, group: "GroupA"}, c: {...ce, group: "GroupC"},
      revealedLocation: {id: visible.id, cardCode: chamberCode, revealed: true}},
    communication: `Group A says: the revealed Chamber of Secrets is ${chamberNames[chamberCode]}; pull ${chambers[chamberCode]}.`};
}

/** Call after a successful native answer. It returns a new memory and never
 * changes snapshot/question/input memory. Choosing an ability is an intent;
 * injection/valve/lever records require their actual offered follow-up effect.
 */
export function observeLabyrinthChoice({snapshot, question, selection, memory = {}}) {
  const f = frame(snapshot, memory), next = {...memory, group: f.group};
  if (selection?.note !== undefined) {
    if (question?.specific?.key === "epicLabyrinth.note" && typeof selection.note === "string") {
      next.ventPayload = {...memory.ventPayload, note: selection.note, destination: "GroupC"};
      next.noteWritten = true;
    }
    return next;
  }
  const c = selection?.choice;
  if (!enabled(question).includes(c)) return next;
  const a = ability(c), commands = storyCommands(c);
  const paradox = paradoxOffer(f, c);
  if (paradox) next.paradoxExchange = {...paradox, witness: choiceWitness(snapshot, question, c)};
  const played = handChoice(f, c);
  if (played && containsMessage(c, "InitiatePlayCardWithWindows")) next.lastCardPlayed = code(played);
  if (a) {
    next.lastAbility = {cardCode: abilityCode(c), index: a.index, source: a.source,
      witness: choiceWitness(snapshot, question, c)};
    if (abilityCode(c) === "70033" && a.index === 3) next.runeRewardRequested = true;
    if (abilityCode(c) === "70041" && a.index === 2 && containsMessage(c, "Remember")) next.injected = true;
  }
  if (f.group === "GroupC" && c.tag === "CardLabel" && memory.lastAbility?.cardCode === "70033"
    && memory.lastAbility.index === 3 && Object.hasOwn(chambers, code(c.cardCode || c.raw?.cardCode))) {
    const chamberCode = code(c.cardCode || c.raw.cardCode);
    next.secretChamber = {code: chamberCode, method: "arcane-runes-card-label", recipientGroup: "GroupC", recipientGameId: snapshot.game.id,
      witness: {...choiceWitness(snapshot, question, c), storyCode: "70033", abilityIndex: 3,
        cardCode: chamberCode, choiceTag: "CardLabel", enabled: true}};
  }
  for (const command of commands) {
    if (command?.tag === "ClaimVentNote" && command.contents?.[0] === f.actor?.id)
      next.pendingNoteRead = {storyCode: "70035", witness: choiceWitness(snapshot, question, c)};
    if (command?.tag === "DepositVentItem") {
      const asset = f.controlled.find((a) => a.id === command.contents?.[1]);
      const assetCode = code(asset);
      const destination = assetCode === "70040" ? "GroupA" : diagramDestination[assetCode];
      if (destination) next.ventPayload = {...memory.ventPayload, destination, assetCode};
    }
    if (command?.tag === "DepositVentToken" && command.contents?.[1] === "Clue")
      next.ventPayload = {...memory.ventPayload, destination: "GroupB", clues: command.contents[2]};
    if (command?.tag === "SendVent") {
      if (memory.ventPayload?.destination === "GroupB" && memory.ventPayload.clues >= 1) next.clueGiftSent = true;
      next.lastVentSend = {destination: command.contents?.[1], witness: choiceWitness(snapshot, question, c)};
      next.ventPayload = undefined; next.ventSent = true;
    }
    if (command?.tag === "OfferExchangeToken" && command.contents?.[2] === "GroupB"
      && command.contents?.[4] === "Clue" && command.contents?.[5] >= 1) next.clueGiftSent = true;
  }
  if (memory.pendingNoteRead && noteCode(c.label || c.raw?.label || "")) {
    const note = c.label || c.raw.label, chamberCode = noteCode(note);
    next.secretChamber = {code: chamberCode, method: "vent-note-read", recipientGroup: "GroupC", recipientGameId: snapshot.game.id,
      witness: {...choiceWitness(snapshot, question, c), storyCode: "70035", noteTaken: true, note,
        takenQuestion: memory.pendingNoteRead.witness}};
    next.pendingNoteRead = undefined;
  }
  const effects = messages(c);
  if (effects.some((m) => m.tag === "Remember" && m.contents?.tag === "BeenInjected" && m.contents.contents?.unLabel === f.actor?.id)) next.injected = true;
  if (effects.some((m) => m.tag === "Remember" && m.contents?.tag === "TurnedTheValve" && m.contents.contents?.unLabel === f.actor?.id)) next.valveTurned = true;
  if (effects.some((m) => m.tag === "Remember" && /^PulledThe(Left|Middle|Right)Lever$/.test(m.contents?.tag || "")
    && m.contents.contents?.unLabel === f.actor?.id)) next.leverPulled = true;
  if (a && a.index === 104) {
    const destination = references(a.source).find((r) => r.tag === "LocationSource")?.id;
    if (destination) next.locationVisits = {...memory.locationVisits, [destination]: (memory.locationVisits?.[destination] || 0) + 1};
  }
  if (a && abilityCode(c) === "70035" && a.index === 2) next.expectVentDelivery = false;
  return next;
}

function moveToward(f, choices, desiredCodes, memory) {
  const moves = choices.filter((c) => ability(c)?.index === 104);
  const visibleDestinations = new Set(f.locations.filter((l) => l.revealed === true && desiredCodes.includes(code(l))).map((l) => l.id));
  const idOf = (c) => references(ability(c)?.source).find((r) => r.tag === "LocationSource")?.id;
  const direct = moves.find((c) => visibleDestinations.has(idOf(c)));
  if (direct) return direct;
  // A facedown connected location may be explored as a physical place. Its
  // hidden cardCode/name never influences which destination is selected.
  const unexplored = moves.filter((c) => f.locations.find((l) => l.id === idOf(c))?.revealed === false);
  if (unexplored.length) return unexplored.sort((a, b) => a.answerIndex - b.answerIndex)[0];
  if (!visibleDestinations.size) return undefined;
  const distances = new Map([...visibleDestinations].map((id) => [id, 0])), queue = [...visibleDestinations];
  while (queue.length) {
    const id = queue.shift(), l = f.locations.find((v) => v.id === id);
    for (const neighbour of l?.connectedLocations || []) if (!distances.has(neighbour)) {
      distances.set(neighbour, distances.get(id) + 1); queue.push(neighbour);
    }
  }
  return moves.filter((c) => distances.has(idOf(c))).sort((a, b) => distances.get(idOf(a)) - distances.get(idOf(b))
    || (memory.locationVisits?.[idOf(a)] || 0) - (memory.locationVisits?.[idOf(b)] || 0))[0];
}

function mundane(f, question, choices, definitions, memory) {
  if (f.game.inSetup === true) {
    const keepHand = findText(choices, /doneWithMulligan|Done with mulligan|Keep (?:the |my |your |this )?(?:opening )?hand/i);
    if (keepHand) return result(keepHand, "Keep the genuine random legal opening hand at the actual native mulligan prompt.");
  }
  const assignments = choices.filter((c) => {
    const component = c.raw?.component;
    return c.tag === "ComponentLabel" && ["DamageToken", "HorrorToken"].includes(component?.tokenType)
      && (component.tag === "InvestigatorComponent" && component.investigatorId === f.actor.id
        || component.tag === "AssetComponent" && f.controlled.some((a) => a.id === component.assetId));
  });
  if (assignments.length) return result(assignments.find((c) => c.raw.component.tag === "AssetComponent") || assignments[0],
    "Assign the actually offered damage/horror to a controlled physical soak asset, then the actor; native capacity checks remain authoritative.");
  const apply = choices.find((c) => c.tag === "SkillTestApplyResultsButton");
  if (apply) return result(apply, "Apply the actual native skill-test result; RNG remains native.");
  const test = f.game.skillTest, foughtEnemy = f.enemies.find((e) => e.id === test?.target?.contents);
  if (question.tag === "ChooseOne" && question.playerId === f.actor.playerId && !question.isPlayerWindow
    && test?.investigator === f.actor.id && test.action === "Fight" && test.step === "ApplySkillTestResultsStep"
    && test.result?.tag === "SucceededBy" && Array.isArray(test.result.contents)
    && Number.isSafeInteger(test.result.contents[1]) && test.result.contents[1] >= 0
    && test.target?.tag === "EnemyTarget" && foughtEnemy && test.source
    && (locationId(foughtEnemy) === f.hereId || (f.actor.engagedEnemies || []).includes(foughtEnemy.id))) {
    // Inspect only each offered option's immediate effect. A skill bonus can
    // contain the attack under its later result-options continuation.
    const damage = choices.filter((c) => c.tag === "Label" && Array.isArray(c.raw?.messages)
      && c.raw.messages.some((wrapped) => {
        const m = wrapped?.tag === "SkillTestMessage" ? wrapped.contents : wrapped;
        if (m?.tag !== "Successful_" || !Array.isArray(m.contents)) return false;
        const [action, investigator, source, target, margin] = m.contents;
        return Array.isArray(action) && action[0] === "Fight" && action[1]?.tag === "EnemyTarget"
          && action[1].contents === foughtEnemy.id && investigator === f.actor.id
          && target?.tag === "EnemyTarget" && target.contents === foughtEnemy.id
          && isDeepStrictEqual(source, test.source) && margin === test.result.contents[1];
      }));
    if (damage.length === 1) return result(damage[0], "Resolve the owning actor's actual successful native fight against its physical local enemy before the retained skill-card bonus; damage stays native.");
  }
  const start = choices.find((c) => c.tag === "StartSkillTestButton" && c.raw?.investigatorId === f.actor.id);
  if (start && f.game.skillTest?.investigator === f.actor.id && question.playerId === f.actor.playerId) {
    const st = f.game.skillTest, skillTag = st?.skills?.[0] || st?.type?.contents || st?.type?.tag || st?.skillType;
    const skill = String(Array.isArray(skillTag) ? skillTag[0] : skillTag || "").replace(/^Skill/, "").toLowerCase();
    const relevant = ["intellect", "combat", "willpower", "agility"].includes(skill);
    const committed = rows(st?.committedCards).flat().map(unwrap), committedIds = new Set(committed.map((c) => c?.id));
    const icons = relevant ? committed.reduce((n, c) => {
      const d = definitions.get(code(c)); return n + Number(d?.[`skill_${skill}`] || 0) + Number(d?.skill_wild || 0);
    }, 0) : 0;
    // Native offers enforce all commit restrictions. Prefer a useful printed
    // skill over spending a required story asset; never inspect deck cards.
    const commit = choices.map((c) => ({choice: c, card: offeredCommitCard(f, question, c)}))
      .filter(({card}) => card && !committedIds.has(card.id))
      .map((r) => ({...r, definition: definitions.get(code(r.card))}))
      .filter((r) => relevant && r.definition?.type_code === "skill"
        && Number(r.definition[`skill_${skill}`] || 0) + Number(r.definition.skill_wild || 0) > 0)
      .sort((a, b) => (Number(b.definition[`skill_${skill}`] || 0) + Number(b.definition.skill_wild || 0))
        - (Number(a.definition[`skill_${skill}`] || 0) + Number(a.definition.skill_wild || 0)))[0];
    const margin = Number.isFinite(st.modifiedSkillValue) && Number.isFinite(st.modifiedDifficulty)
      ? st.modifiedSkillValue - st.modifiedDifficulty : undefined;
    if (commit && icons < 3 && committed.length < 2 && (margin === undefined || margin < 4))
      return result(commit.choice, "Commit an actually offered matching printed skill from the actor's own visible hand to the exact active native test, at most two cards.");
    return result(start, "Begin the actual native skill test after bounded useful hand commitments.");
  }
  const defensive = choices.find((c) => code(handChoice(f, c)) === "01023");
  if (defensive && containsMessage(defensive, "InitiatePlayCardWithWindows")) return result(defensive, "Play the genuinely offered Dodge against the native attack.");
  // Tortured Victim's Revelation is offered before this physical enemy has
  // spawned. Bind its printed alternatives to the same visible 70053 source
  // and this actor; the engine alone chooses which held card is discarded.
  if (question.tag === "ChooseOne" && question.playerId === f.actor.playerId && hand(f).length > 0) {
    const victimDiscard = choices.find((c) => c.tag === "Label" && messages(c).some((m) => {
      const d = m.contents;
      if (m.tag !== "DiscardFromHand" || !object(d) || d.discardAmount !== 1
        || d.discardStrategy !== "DiscardRandom" || d.discardInvestigator !== f.actor.id
        || d.discardSource?.tag !== "EnemySource" || d.discardFilter?.tag !== "AnyCard"
        || d.discardDestination !== "ToDiscardPile" || d.discardTarget !== null || d.discardThen !== null
        || !Array.isArray(d.discardBatchCards) || d.discardBatchCards.length !== 0) return false;
      const enemy = f.enemies.find((e) => e.id === d.discardSource.contents && code(e) === "70053");
      return !!enemy && choices.some((other) => other !== c && messages(other).some((a) => {
        const attack = a.contents;
        return a.tag === "InitiateEnemyAttack_" && attack?.attackEnemy === enemy.id
          && attack.attackSource?.tag === "EnemySource" && attack.attackSource.contents === enemy.id
          && attack.attackTarget?.tag === "SingleAttackTarget"
          && attack.attackTarget.contents?.tag === "InvestigatorTarget" && attack.attackTarget.contents.contents === f.actor.id;
      }));
    }));
    if (victimDiscard) return result(victimDiscard, "Choose Tortured Victim's actually offered random discard from the actor's nonempty visible hand, leaving the random physical card selection to native rules.");
  }
  const fights = choices.filter((c) => /^FightLabel/.test(c.tag) && f.enemies.some((e) => e.id === c.raw?.enemyId
    && (locationId(e) === f.hereId || (f.actor.engagedEnemies || []).includes(e.id))));
  if (fights.length && !question.isPlayerWindow) return result(fights.find((c) => (f.actor.engagedEnemies || []).includes(c.raw.enemyId)) || fights[0],
    "Choose an actually offered visible local enemy for the native attack already initiated.");
  const healing = findText(choices, /heal 2 horror|heal2Horror/i);
  if (healing && memory.lastCardPlayed === "03191" && token(f.actor, "Horror") > 0)
    return result(healing, "Resolve the actually played Logical Reasoning's printed horror healing.");
  const discards = choices.filter((c) => handChoice(f, c) && messages(c).some((m) => /^(DiscardCard|Discard|DiscardCardFromHand|DiscardFromHand)$/.test(m.tag)));
  if (discards.length) {
    const value = (c) => {
      const cardCode = code(handChoice(f, c)), d = definitions.get(cardCode);
      return ["01006", "01016", "01020", "01030", "01033"].includes(cardCode) ? 4
        : d?.type_code === "skill" ? 3 : cardCode === "03191" ? 2 : 1;
    };
    return result(discards.sort((a, b) => value(a) - value(b))[0], "Discard an actually offered visible hand card for the genuine native hand-limit/penalty prompt.");
  }
  if (question.tag === "Read") return result(findText(choices, /^(Continue|Proceed|Finish|Done)\b|Finish Labyrinth resolution/i)
    || (choices.length === 1 ? choices[0] : undefined), "Continue the actual printed story/resolution.");
  const waiting = findText(choices, /Waiting (for|to)|Waiting.*group/i);
  if (waiting && choices.length === 1) return result(waiting, "Answer the real native waiting checkpoint; no coordinator operation is submitted.");
  const self = choices.find((c) => (c.tag === "PortraitLabel" && c.raw?.investigatorId === f.actor.id)
    || target(c)?.tag === "InvestigatorTarget" && targetId(c) === f.actor.id);
  if (self && (choices.every((c) => c.tag === "PortraitLabel" || target(c)?.tag === "InvestigatorTarget")
    || memory.lastAbility?.cardCode === "70041")) return result(self, "Choose the actor's real local investigator for the offered native effect.");
  const skip = choices.find((c) => c.tag === "SkipTriggersButton");
  if (skip && question.isWindow) return result(skip, "Decline remaining optional abilities after the audited scenario reactions.");
  if (choices.length === 1 && !question.isPlayerWindow) return result(choices[0], "Resolve the sole enabled actual native response.");
}

/** Returns undefined at an unaudited decision. The runner must retain that
 * checkpoint and stop, rather than filling it with an arbitrary choice.
 */
export function selectLabyrinthChoice({snapshot, question, cards, memory = {}, teamKnowledge = {}}) {
  const f = frame(snapshot, memory), choices = enabled(question).filter((c) => boundAbility(f, c)), definitions = catalog(cards);
  if (!f.actor || !["GroupA", "GroupB", "GroupC"].includes(f.group)) return undefined;
  if (question?.kind === "specific") {
    if (question.specific?.scope !== "scenario" || question.specific.key !== "epicLabyrinth.note" || f.group !== "GroupA") return undefined;
    const visible = f.locations.find((l) => l.revealed === true && Object.hasOwn(chambers, code(l)));
    const payload = question.specific.payload;
    if (!visible || payload?.investigator !== f.actor.id || !f.stories.some((s) => s.id === payload?.story && code(s) === "70035")) return undefined;
    const chamberCode = code(visible);
    return {note: `[Labyrinth GroupA Secrets ${chamberCode}] Chamber of Secrets: ${chamberNames[chamberCode]}; pull the ${chambers[chamberCode]} lever.`,
      reason: "Write only Group A's actually revealed chamber identity in the current printed Vent note prompt."};
  }
  if (question?.kind !== "choices" || !choices.length) return undefined;
  const local = labyrinthProgress(snapshot, memory);
  const cGiftNeeded = f.stage === 1 && f.group === "GroupC" && !memory.clueGiftSent
    && f.stories.some((s) => ["70034", "70035"].includes(code(s)));
  const leverOptions = choices.filter((c) => /chamberOfRegret\.(left|middle|right)\b|^(Left|Middle|Right)( lever)?\b/i.test(text(c)));
  if (leverOptions.length) {
    const known = secretKnowledge(memory, teamKnowledge, snapshot);
    if (!known) return undefined;
    return result(findText(leverOptions, new RegExp(`chamberOfRegret\\.${chambers[known.code]}\\b|^${chambers[known.code]}( lever)?\\b`, "i")),
      `Pull ${chambers[known.code]} using the documented ${known.method} reveal (${known.code}).`);
  }
  const threshold = findText(choices, /satisfyDoomThreshold|satisfy.*doom threshold/i);
  const ordinaryDoom = findText(choices, /placeAgendaDoom|place 1 doom/i);
  if (threshold || ordinaryDoom) return result(local.ready && memory.allowStageAdvance === true ? threshold || ordinaryDoom : ordinaryDoom,
    local.ready && memory.allowStageAdvance === true ? "Use the printed Mythos threshold option only after the three-seat runner has scheduled all local prerequisites."
      : "Place the ordinary native Mythos doom while working on local prerequisites.");
  const confirmation = choices.find((c) => target(c)?.tag === "AgendaTarget");
  if (confirmation && choices.length === 1) return result(confirmation, "Confirm the actual native agenda target after its stage barrier.");

  // Shared-story placement is selected from actual visible physical targets.
  const place = choices.filter((c) => storyCommands(c).some((m) => m?.tag === "PlaceStoryAt"));
  if (place.length) {
    const own = place.find((c) => targetId(c) === f.hereId);
    const regret = place.find((c) => f.locations.some((l) => l.id === targetId(c) && l.revealed === true && code(l) === "70024"));
    return result(f.group === "GroupC" ? regret || own : own,
      "Attach the drawn printed shared story to an actually offered local chamber.");
  }
  const finishTrade = findText(choices, /Finish trading clues and move chamber clues/i);
  if (finishTrade) return result(finishTrade, "Finish the solo group's actual Rune trade menu and reach printed chamber-clue movement.");
  const rain = findText(choices, /Move 1 clue\(s\) from Sorrows to Rain/i);
  if (rain) return result(rain, "Move the genuinely offered chamber clue to low-shroud Rain using the printed Rune reward.");
  const keep = findText(choices, /Keep chamber clues where they are/i);
  if (keep) return result(keep, "Keep remaining chamber clues after the useful offered Rain transfer.");
  const runeReveal = choices.find((c) => c.tag === "CardLabel" && Object.hasOwn(chambers, code(c.cardCode || c.raw?.cardCode)));
  if (runeReveal && f.group === "GroupC" && memory.lastAbility?.cardCode === "70033" && memory.lastAbility.index === 3)
    return result(runeReveal, "Read the actual Arcane Runes reward CardLabel; this is the printed Group A chamber reveal.");
  if (memory.pendingNoteRead && choices.length === 1 && noteCode(choices[0].label || choices[0].raw?.label || ""))
    return result(choices[0], "Actually read the note just taken through the printed Vent claim menu.");

  const paradoxOffers = choices.map((choice) => ({choice, offer: paradoxOffer(f, choice)})).filter((row) => row.offer);
  if (paradoxOffers.length) {
    const witness = memory.lastAbility?.witness;
    if (memory.lastAbility?.cardCode !== "70059" || memory.lastAbility.index !== 1
      || witness?.gameId !== snapshot.game.id || witness.actorId !== f.actor.id || witness.playerId !== snapshot.playerId
      || question.playerId !== snapshot.playerId || question.questionVersion <= witness.questionVersion
      || new Set(paradoxOffers.map((row) => row.offer.exchangeId)).size !== 1) return undefined;
    const nextGroup = {GroupA: "GroupB", GroupB: "GroupC", GroupC: "GroupA"}[f.group];
    return result((paradoxOffers.find((row) => row.offer.destination === nextGroup) || paradoxOffers[0]).choice,
      "Choose an actually offered next-group participant for the printed Paradox exchange; retain owned cards and grant no chamber knowledge.");
  }
  const privateOffers = choices.flatMap((choice) => exchangeCommands(choice)).filter((c) => c?.tag === "OfferPrivate"
    && Array.isArray(c.contents) && c.contents[0] === f.actor.id
    && ["GroupA", "GroupB", "GroupC"].includes(c.contents[2]) && c.contents[2] !== f.group
    && typeof c.contents[1] === "string" && c.contents[1] && typeof c.contents[3] === "string" && c.contents[3]);
  if (privateOffers.length) {
    const identifiers = new Set(privateOffers.map((c) => c.contents[1]));
    if (question.playerId !== snapshot.playerId || identifiers.size !== 1) return undefined;
    const identifier = privateOffers[0].contents[1];
    return result(choices.find((c) => requests(c).some((r) => r?.requestOrigin === f.group
      && r.requestOperation?.tag === "CloseExchange" && r.requestOperation.contents === identifier)),
      "Finish the actually offered participant-scoped Paradox exchange without transferring tokens/cards or inventing private information.");
  }

  const exchangeOffers = choices.filter((c) => storyCommands(c).some((m) => m?.tag === "OfferExchange"));
  if (exchangeOffers.length) {
    const key = f.controlled.find((a) => code(a) === "70040");
    const wrongDiagram = f.controlled.find((a) => diagramDestination[code(a)] && diagramDestination[code(a)] !== f.group);
    const destination = f.stage === 1 && key && f.group !== "GroupA" ? "GroupA" : wrongDiagram ? diagramDestination[code(wrongDiagram)]
      : cGiftNeeded && f.clues >= 3 ? "GroupB" : undefined;
    if (destination) return result(exchangeOffers.find((c) => storyCommands(c).some((m) => m.contents?.[2] === destination)),
      "Open the actual permitted Rift offer to the printed story asset's needed group.");
    if (f.group === "GroupC" && f.stage === 1 && !secretKnowledge(memory, teamKnowledge, snapshot)) return undefined;
    return result(findText(choices, /Finish private exchange and return to your original group|Finish the private exchange/i),
      "Finish the real authorized private exchange after its legal transfers and recorded communication.");
  }
  const exchangeAssets = choices.filter((c) => storyCommands(c).some((m) => m?.tag === "OfferExchangeStoryAsset"));
  if (exchangeAssets.length) {
    const useful = exchangeAssets.find((c) => storyCommands(c).some((m) => {
      const asset = f.controlled.find((a) => a.id === m.contents?.[4]);
      return code(asset) === "70040" && m.contents?.[2] === "GroupA" || diagramDestination[code(asset)] === m.contents?.[2];
    }));
    if (useful) return result(useful, "Offer the actual controlled story asset through the printed Rift menu.");
  }
  const backToExchange = findText(choices, /Return to the private exchange/i);
  const giftClue = choices.find((c) => storyCommands(c).some((m) => m?.tag === "OfferExchangeToken"
    && m.contents?.[0] === f.actor.id && m.contents?.[2] === "GroupB" && m.contents?.[4] === "Clue" && m.contents?.[5] === 1));
  if (giftClue && cGiftNeeded && f.clues >= 3) return result(giftClue, "Give one actual spare clue to B through the authorized Rift, retaining the two-clue lever cost.");
  if (backToExchange) return result(backToExchange, "Return from the empty completed Rift offer menu.");

  const ventDepositFinish = findText(choices, /Finish placing objects in the Vent/i);
  if (ventDepositFinish) {
    const usefulItem = choices.find((c) => storyCommands(c).some((m) => {
      if (m?.tag !== "DepositVentItem") return false;
      const asset = f.controlled.find((a) => a.id === m.contents?.[1]), cardCode = code(asset);
      return f.stage === 1 && f.group !== "GroupA" && cardCode === "70040"
        || diagramDestination[cardCode] && diagramDestination[cardCode] !== f.group;
    }));
    if (usefulItem && !memory.ventPayload) return result(usefulItem, "Deposit only an actually controlled printed key/diagram for its needed group.");
    const depositClue = choices.find((c) => storyCommands(c).some((m) => m?.tag === "DepositVentToken"
      && m.contents?.[0] === f.actor.id && m.contents?.[1] === "Clue" && m.contents?.[2] === 1));
    if (depositClue && cGiftNeeded && f.clues >= 3 && !memory.ventPayload)
      return result(depositClue, "Deposit one actual spare clue for B, preserving the two clues required for C's lever.");
    const write = findText(choices, /Write a private note for another group/i);
    if (write && f.group === "GroupA" && f.stage === 1 && !memory.noteWritten && !memory.ventPayload)
      return result(write, "Open the printed Vent note prompt to communicate the actor's revealed chamber.");
    return result(ventDepositFinish, "Finish the actual Vent deposit menu without inspecting its hidden contents.");
  }
  const ventClaimFinish = findText(choices, /Finish taking objects from the Vent/i);
  if (ventClaimFinish) {
    const claim = choices.find((c) => storyCommands(c).some((m) => ["ClaimVentItem", "ClaimVentNote", "ClaimVentToken"].includes(m?.tag)));
    return result(claim || ventClaimFinish, "Claim an actually offered received Vent item/token/note, then finish; hidden cardsUnderneath are never inspected.");
  }
  const ventSend = choices.filter((c) => storyCommands(c).some((m) => m?.tag === "SendVent"));
  if (ventSend.length) return result(ventSend.find((c) => storyCommands(c).some((m) => m.contents?.[1] === memory.ventPayload?.destination)),
    "Send the actually deposited payload to its recorded printed destination at the real round end.");
  const noExcess = findText(choices, /Advance without moving excess damage/i);
  if (noExcess) return result(noExcess, "Advance the actual Escape objective without an unnecessary excess-damage transfer.");
  const doomConversion = choices.filter((c) => /Turn \d+ of your clues into additional doom in Chamber of Decay/i.test(text(c)));
  if (doomConversion.length) {
    const required = Math.max(0, 11 - Number(f.game.totalDoom || 0));
    const finishThisTurn = Number(f.game.totalDoom || 0) + f.actions + f.clues >= 11;
    const amount = Math.min(f.clues, finishThisTurn ? required : Math.max(0, 5 - Number(f.game.totalDoom || 0)));
    return result(findText(doomConversion, new RegExp(`Turn ${amount} of your clues\\b`, "i")), "Convert only the printed number of the actor's clues needed to reach eleven visible doom.");
  }

  // Native round reactions/forced stories are handled before optional skips.
  for (const [c, index, reason] of [["70002", 1, "Draw the native randomly sampled first-act shared story."],
    ["70004", 1, "Draw the native randomly sampled second-act shared story."], ["70034", 1, "Choose the real printed Rift participant at the native round end."],
    ["70036", 1, "Resolve the printed Dilemma at the actual round end, accepting its native hand/resource penalty and diagram reward."]]) {
    const offered = byAbility(choices, c, index); if (offered) return result(offered, reason);
  }
  const escape = byAbility(choices, "70014", 1);
  if (escape && local.ready) return result(escape, "Resolve the actual round-end Escape reaction after this visible boss has no remaining health.");
  const ventReaction = byAbility(choices, "70035", 3);
  if (ventReaction && memory.ventPayload?.destination) return result(ventReaction, "Use the printed Vent round-end reaction for the recorded real payload.");
  const roland = byAbility(choices, "01001", 1);
  if (roland && f.here?.revealed === true && token(f.here, "Clue") > 0)
    return result(roland, "Resolve Roland's actually offered printed enemy-defeat reaction for a visible local clue.");
  const milan = byAbility(choices, "01033", 1);
  if (milan) return result(milan, "Resolve the actually offered Dr. Milan successful-investigation resource reaction.");

  const routine = mundane(f, question, choices, definitions, memory);
  if (routine && !question.isPlayerWindow) return routine;
  if (!question.isPlayerWindow) return undefined;

  // Ordinary player turns: deal with actual visible enemies before provoking
  // attacks, then establish printed tools and the current act's objective.
  const engaged = f.enemies.filter((e) => (f.actor.engagedEnemies || []).includes(e.id)
    || e.placement?.tag === "InThreatArea" && e.placement.contents === f.actor.id);
  const fightTarget = (c) => c.raw?.enemyId || targetId(c);
  const combatAbilities = choices.filter((c) => {
    const a = ability(c), type = a?.type?.abilityType || a?.type;
    return type && /Fight/.test(JSON.stringify(type.actions || type.action || ""));
  });
  const damageWeapon = combatAbilities.find((c) => ["01006", "01016", "01020"].includes(abilityCode(c)));
  const mechanism = byAbility(choices, "70057", 1);
  if (mechanism) return result(mechanism, "Attempt the printed Dreadful Mechanism combat test before other actions trigger its native penalty.");
  if (engaged.length && damageWeapon) return result(damageWeapon, "Fight the actor's real engaged enemy using an actually offered two-damage Roland weapon.");
  if (engaged.length) {
    const fight = choices.find((c) => /^FightLabel/.test(c.tag) && engaged.some((e) => e.id === fightTarget(c)));
    if (fight) return result(fight, "Fight the actual engaged enemy through its offered native fight target.");
  }
  const uncontrolledKey = f.assets.find((a) => code(a) === "70040" && !a.controller && locationId(a) === f.hereId);
  const pickup = byAbility(choices, "70040", 2);
  if (f.stage === 1 && uncontrolledKey && pickup && (f.group === "GroupA" || !memory.ventSent))
    return result(pickup, "Investigate the actual uncontrolled Key of Mysteries using its printed pickup ability.");
  const runeResolve = byAbility(choices, "70033", 3);
  if (f.stage === 1 && runeResolve && !memory.runeRewardRequested) return result(runeResolve, "Resolve the genuinely unlocked Rune reward; no coordinator metadata is read.");
  const runeDecode = byAbility(choices, "70033", 1);
  const localRune = f.stories.find((s) => code(s) === "70033");
  if (f.stage === 1 && localRune && !memory.runeRewardRequested && locationId(localRune) && locationId(localRune) !== f.hereId) {
    const move = choices.find((c) => ability(c)?.index === 104
      && references(ability(c).source).some((r) => r.tag === "LocationSource" && r.id === locationId(localRune)));
    if (move) return result(move, "Move through the actual offered connection to the publicly attached local Rune, before decoding it; the destination's hidden identity is not inspected.");
  }
  const ventClaim = byAbility(choices, "70035", 2);
  const vent = f.stories.find((s) => code(s) === "70035" && locationId(s) === f.hereId);
  if (ventClaim && vent && (token(vent, "Clue") > 0 || token(vent, "Resource") > 0 || memory.expectVentDelivery === true))
    return result(ventClaim, "Open the actual Vent claim menu for visible tokens or a runner-recorded legitimate delivery.");
  const ventDeposit = byAbility(choices, "70035", 1);
  const wrongAsset = f.controlled.some((a) => f.stage === 1 && f.group !== "GroupA" && code(a) === "70040"
    || diagramDestination[code(a)] && diagramDestination[code(a)] !== f.group);
  if (ventDeposit && !memory.ventPayload && (wrongAsset || cGiftNeeded && f.clues >= 3
    || f.group === "GroupA" && f.stage === 1 && !memory.noteWritten))
    return result(ventDeposit, "Use the actual printed Vent deposit ability for an owned required transfer or private note.");

  if (f.stage === 1 && f.group === "GroupC" && f.clues >= 2 && !cGiftNeeded && !local.ready && secretKnowledge(memory, teamKnowledge, snapshot)) {
    const lever = byAbility(choices, "70024", 1);
    if (lever) return result(lever, "Pay the real two-clue/action lever cost only after the printed communication reveal.");
    const move = moveToward(f, choices, ["70024"], memory);
    if (move) return result(move, "Move by an actual offered connection toward Chamber of Regret with two clues and a legally known lever.");
  }
  if (f.stage === 2) {
    for (const chamberCode of ["70028", "70029", "70030"]) {
      const reward = byAbility(choices, chamberCode, 1);
      if (reward) return result(reward, "Take the actual chamber-earned set-aside diagram after clearing its visible clues.");
    }
    const desired = diagramForGroup[f.group], owned = f.controlled.some((a) => code(a) === desired);
    if (owned) {
      const use = byAbility(choices, desired, 2);
      const doom = Number(f.game.totalDoom || 0);
      // Rot does not immediately check agenda advancement. At the next Mythos
      // the agenda checks all local doom against seven; reaching 7–10 without
      // eleven before that check kills A. Budget the remaining actual turn.
      const rotSafe = f.group !== "GroupA" || doom + f.actions + f.clues >= 11 || doom < 5;
      if (use && !local.ready && rotSafe && (f.group !== "GroupA" || token(f.here, "Clue") === 0))
        return result(use, "Use the actual owned diagram's printed proxy ability at its required chamber within the safe local doom/turn budget.");
      const syringe = byAbility(choices, "70041", 2);
      if (f.group === "GroupB" && syringe && !local.conditions.injected) return result(syringe, "Inject the real local investigator using the obtained physical Mysterious Syringe.");
      const poison = byAbility(choices, "70031", 1);
      if (f.group === "GroupB" && poison && local.conditions.injected && !local.conditions.valveTurned)
        return result(poison, "Turn the actual Poison valve after the local printed injection prerequisite.");
    }
    const glyph = f.stories.find((s) => code(s) === "70038");
    if (!owned && glyph) {
      const action = byAbility(choices, "70038", token(glyph, "Damage") >= 1 ? 2 : 1);
      if (action) return result(action, "Earn the printed Glyph diagram by actual local damage/shared-horror skill tests.");
    }
    const gate = byAbility(choices, "70037", 1);
    if (!owned && gate) return result(gate, "Pay the actual Gate clue cost and enter the group's printed alternate diagram chamber.");
    if (!local.ready) {
      const targetCodes = f.group === "GroupB" && local.conditions.injected ? ["70031"] : [ownDiagramChamber[f.group]];
      if (owned && f.group === "GroupA") targetCodes.splice(0, 1, "70029");
      if (owned && f.group === "GroupB" && !local.conditions.injected) targetCodes.splice(0, 1, "70030");
      if (owned && f.group === "GroupC") targetCodes.splice(0, 1, "70028");
      if (owned && f.group === "GroupA" && Number(f.game.totalDoom || 0) + f.actions + f.clues < 11) {
        const availableClues = f.locations.filter((l) => l.revealed === true && token(l, "Clue") > 0).map(code);
        if (availableClues.length) targetCodes.splice(0, targetCodes.length, ...availableClues);
      }
      // Movement is considered after useful investigation below. In
      // particular a Gate arrival must clear its new chamber before leaving.
      f.desiredLocations = targetCodes;
    }
  }

  // Useful cards must be physically present in this actor's hand and actually
  // offered for play; affordability and slots remain native responsibilities.
  const play = (cardCodes) => choices.find((c) => cardCodes.includes(code(handChoice(f, c))) && containsMessage(c, "InitiatePlayCardWithWindows"));
  const clueNeeded = f.stage === 1 && !local.ready || f.stage === 2 && !local.ready || f.stage === 3 && f.clues < 1;
  const hunch = play(["01037"]);
  if (hunch && clueNeeded && f.here?.revealed === true && token(f.here, "Clue") > 0) return result(hunch, "Play the actual fast Working a Hunch to discover a required visible clue.");
  const intelligence = play(["01030", "01033"]);
  if (intelligence && !local.ready && !f.controlled.some((a) => code(a) === code(handChoice(f, intelligence))))
    return result(intelligence, "Play an actually offered printed intellect tool for the actor's remaining tests.");
  const weapon = play(["01006", "01016", "01020"]);
  if (weapon && !f.controlled.some((a) => ["01006", "01016", "01020"].includes(code(a))))
    return result(weapon, "Equip a physically held, genuinely offered Roland weapon for native encounters and the final boss.");
  const horror = token(f.actor, "Horror"), healing = play(["03191"]);
  if (healing && horror >= 2) return result(healing, "Play the real offered Logical Reasoning to preserve the actor's remaining sanity.");
  const soak = play(["05109"]);
  if (soak && horror >= 2 && !f.controlled.some((a) => code(a) === "05109")) return result(soak, "Play the actual printed horror-soak asset before continuing dangerous native rounds.");
  if (f.stage === 1 && runeDecode && !memory.runeRewardRequested) return result(runeDecode, "Attempt the printed local intellect-three Rune test with native RNG.");

  if (f.stage === 3 && !local.ready) {
    const proxy = byAbility(choices, "70006", 1);
    if (proxy) return result(proxy, "Pay the offered distortion proxy's real clue/action cost to deal three printed nonattack boss damage.");
    const boss = f.enemies.find((e) => code(e) === "70048");
    if (boss && locationId(boss) === f.hereId) {
      if (damageWeapon) return result(damageWeapon, "Attack the actual local Eixodolon with a genuinely offered Roland weapon.");
      const fight = choices.find((c) => /^FightLabel/.test(c.tag) && fightTarget(c) === boss.id);
      if (fight) return result(fight, "Attack the actual local Eixodolon through its native fight choice.");
    }
    const move = moveToward(f, choices, f.locations.filter((l) => l.revealed === true
      && /\bDistortion\b/.test(definitions.get(code(l))?.traits || "")).map(code), memory);
    if (move && f.clues > 0) return result(move, "Move through a real connection to a revealed printed distortion for the clue-damage ability.");
  }
  const investigate = choices.find((c) => ability(c)?.index === 103 && references(ability(c).source).some((r) => r.id === f.hereId));
  const flashlight = byAbility(choices, "01087", 1);
  if (clueNeeded && f.here?.revealed === true && token(f.here, "Clue") > 0) {
    if (flashlight) return result(flashlight, "Investigate a visible required clue using the actual offered Flashlight supply cost.");
    if (investigate) return result(investigate, "Investigate actual visible clues using the actor's ordinary native action.");
  }
  if (cGiftNeeded && !local.ready) {
    const ventLocation = f.stories.find((s) => code(s) === "70035");
    const destinations = f.clues < 3 ? ["70024"] : ventLocation ? f.locations.filter((l) => l.id === locationId(ventLocation)
      && l.revealed === true).map(code) : [];
    if (destinations.length && (!f.here?.revealed || !destinations.includes(code(f.here)))) {
      const move = moveToward(f, choices, destinations, memory);
      if (move) return result(move, "Collect and route a real spare clue through local chambers for B before spending C's lever clues.");
    }
  }
  if (f.stage === 2 && !local.ready && f.desiredLocations && (!f.here?.revealed || !f.desiredLocations.includes(code(f.here)))) {
    const move = moveToward(f, choices, f.desiredLocations, memory);
    if (move) return result(move, "Follow actual offered local connections toward the printed diagram/antidote objective.");
  }
  const cache = play(["01088"]);
  if (cache && f.resources < 4) return result(cache, "Play the actually held Emergency Cache for ordinary native resources.");
  const resource = choices.find((c) => c.raw?.component?.investigatorId === f.actor.id && c.raw.component.tokenType === "ResourceToken");
  if (resource && !local.ready && f.resources < 4) return result(resource, "Take the actual native resource action toward printed equipment costs.");
  const draw = choices.find((c) => c.raw?.component?.tag === "InvestigatorDeckComponent" && c.raw.component.investigatorId === f.actor.id);
  if (draw && !local.ready && f.actor.hand?.length < 5) return result(draw, "Take an ordinary native draw without inspecting deck order.");
  const end = choices.find((c) => c.tag === "EndTurnButton" && c.raw?.investigatorId === f.actor.id);
  if (f.stage === 2 && f.group === "GroupA" && !local.ready && Number(f.game.totalDoom || 0) >= 6)
    return undefined; // Never voluntarily enter a lethal 7–10 doom check.
  return result(end, local.ready ? "End the genuine local turn after meeting this act's prerequisite; natural phases/barriers remain native."
    : "End the genuine turn when no audited useful action remains; natural rounds may unlock the shared story.");
}
