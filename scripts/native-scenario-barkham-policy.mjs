/** Ordinary Kate choices only. No API calls, RNG, hidden-card identities,
 * native messages, state edits, or success claims are produced here.
 * Unknown prompt shapes return undefined for the caller to retain and inspect.
 */
import { catalogCardCode } from "./rules-protocol.mjs";

const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const values = (value) => Object.values(record(value));
const unbox = (value) => value?.tag === "PlayerCard" ? record(value.contents) : record(value);
const codeOf = (value) => catalogCardCode(unbox(value).cardCode ?? unbox(value).id);
const tokenCount = (entity, token) => Array.isArray(entity?.tokens)
  ? entity.tokens.find(([name]) => name === token)?.[1] ?? 0
  : record(entity?.tokens)[token] ?? 0;
const hiddenCount = (location) => list(location?.cardsUnderneath).length;
const hereId = (actor) => actor.placement?.tag === "AtLocation" ? actor.placement.contents : undefined;
const ownAsset = (asset, actor) => asset.controller === actor.id
  || (asset.placement?.tag === "InPlayArea" && asset.placement.contents === actor.id);
const ownTreachery = (treachery, actor) => treachery.placement?.tag === "InThreatArea" && treachery.placement.contents === actor.id;
const localStubbornCat = (treachery, actor, sourceId) => treachery.id === sourceId
  && codeOf(treachery) === "barkham-055" && treachery.placement?.tag === "AttachedToLocation"
  && typeof hereId(actor) === "string" && treachery.placement.contents === hereId(actor);
const usableTreachery = (treachery, actor, sourceId) => ownTreachery(treachery, actor)
  || localStubbornCat(treachery, actor, sourceId);
const choiceTags = new Set(["ChooseOne", "PlayerWindowChooseOne", "WindowChooseOne", "ChooseN",
  "ChooseSome", "ChooseSome1", "ChooseUpToN", "ChooseOneAtATime", "ChooseOneAtATimeWithAuto", "Read"]);

function reference(value, depth = 0) {
  if (depth > 8) return {};
  const ref = record(value);
  if (ref.tag === "ProxySource") return reference(ref.source, depth + 1);
  if (ref.tag === "AbilitySource") return reference(list(ref.contents)[0], depth + 1);
  if (["UseAbilitySource", "IndexedSource"].includes(ref.tag)) return reference(list(ref.contents)[1], depth + 1);
  return { tag: ref.tag, id: typeof ref.contents === "string" ? ref.contents : undefined };
}

function messages(choice) {
  return list(record(choice.raw).messages).map((value) => {
    let message = record(value);
    for (let n = 0; n < 4 && ["Do", "Will", "SkillTestMessage"].includes(message.tag); n++) message = record(message.contents);
    if (message.tag === "SkillTestCommitCard_") message = { ...message, tag: "SkillTestCommitCard" };
    return message;
  });
}

function cardChoice(choice, actor, hand, messageTags) {
  const raw = record(choice.raw), target = reference(raw.target);
  if (target.tag !== "CardIdTarget") return undefined;
  const card = hand.find((entry) => entry.id === target.id && entry.owner === actor.id);
  if (!card) return undefined;
  return messages(choice).some((message) => {
    if (!messageTags.includes(message.tag) || list(message.contents)[0] !== actor.id) return false;
    const selected = unbox(list(message.contents)[1]);
    return selected.id === card.id;
  }) ? card : undefined;
}

function targetId(choice, tag) {
  const target = reference(record(choice.raw).target ?? choice.source);
  return target.tag === tag ? target.id : undefined;
}

function publicChoiceLocation(choice, game, catalog) {
  const target = reference(record(choice.raw).target);
  if (target.tag === "LocationTarget") return game.locations?.[target.id];
  if (target.tag || !["TargetLabel", "Label"].includes(choice.tag)) return undefined;
  const matches = values(game.locations).filter((location) => location.revealed === true && choice.label
    && [catalog?.get?.(codeOf(location))?.name, location.name, location.label].includes(choice.label));
  return matches.length === 1 ? matches[0] : undefined;
}

function availableAbility(choices, game, actor, cardCode, index, sourceId) {
  return choices.find((choice) => {
    const raw = record(choice.raw), ability = record(raw.ability), source = reference(ability.source);
    if (raw.tag !== "AbilityLabel" || raw.investigatorId !== actor.id
      || catalogCardCode(ability.cardCode) !== cardCode || ability.index !== index
      || (sourceId !== undefined && source.id !== sourceId)) return false;
    switch (source.tag) {
      case "InvestigatorSource": return source.id === actor.id && codeOf(actor) === cardCode;
      case "LocationSource": return !!game.locations?.[source.id] && codeOf(game.locations[source.id]) === cardCode;
      case "EnemySource": return !!game.enemies?.[source.id] && codeOf(game.enemies[source.id]) === cardCode;
      case "AssetSource": return !!game.assets?.[source.id] && ownAsset(game.assets[source.id], actor)
        && codeOf(game.assets[source.id]) === cardCode;
      case "TreacherySource": return !!game.treacheries?.[source.id] && usableTreachery(game.treacheries[source.id], actor, source.id)
        && codeOf(game.treacheries[source.id]) === cardCode;
      case "ActSource": return !!game.acts?.[source.id] && codeOf(game.acts[source.id]) === cardCode;
      case "AgendaSource": return !!game.agendas?.[source.id] && codeOf(game.agendas[source.id]) === cardCode;
      default: return false;
    }
  });
}

function ownedChoice(choice, actor, game) {
  const raw = record(choice.raw), component = record(raw.component);
  if (typeof raw.investigatorId === "string" && raw.investigatorId !== actor.id) return false;
  if (typeof component.investigatorId === "string" && component.investigatorId !== actor.id) return false;
  if (typeof component.assetId === "string" && !ownAsset(record(game.assets?.[component.assetId]), actor)) return false;
  const target = reference(raw.target);
  if (target.tag === "InvestigatorTarget" && target.id !== actor.id) return false;
  if (target.tag === "EnemyTarget" && !game.enemies?.[target.id]) return false;
  if (target.tag === "LocationTarget" && !game.locations?.[target.id]) return false;
  if (target.tag === "AssetTarget" && !ownAsset(record(game.assets?.[target.id]), actor)) return false;
  if (target.tag === "CardIdTarget" && !list(actor.hand).map(unbox).some((card) => card.id === target.id && card.owner === actor.id)) return false;
  if (raw.tag === "AbilityLabel") {
    const source = reference(record(raw.ability).source);
    if (source.tag === "InvestigatorSource" && source.id !== actor.id) return false;
    if (source.tag === "AssetSource" && !ownAsset(record(game.assets?.[source.id]), actor)) return false;
    if (source.tag === "TreacherySource" && !usableTreachery(record(game.treacheries?.[source.id]), actor, source.id)) return false;
  }
  return true;
}

function routes(game, start, memory, blockedLocationId) {
  const locations = record(game.locations), distances = new Map([[start, 0]]), firstSteps = new Map();
  const queue = [start];
  for (let n = 0; n < queue.length && n < 100; n++) {
    const id = queue[n], location = locations[id];
    if (!location || !Array.isArray(location.connectedLocations)
      || !location.connectedLocations.every((neighbor) => typeof neighbor === "string" && locations[neighbor])) {
      memory.unsupportedShape = "Expected public location.connectedLocations containing physical location IDs.";
      return undefined;
    }
    for (const next of [...location.connectedLocations].sort()) {
      if (distances.has(next) || next === blockedLocationId) continue;
      distances.set(next, distances.get(id) + 1);
      firstSteps.set(next, id === start ? next : firstSteps.get(id));
      queue.push(next);
    }
  }
  return { distances, firstSteps };
}

function closestLocation(game, actor, locations, memory, blockedLocationId) {
  const graph = routes(game, hereId(actor), memory, blockedLocationId);
  if (!graph) return undefined;
  const goal = [...locations].filter((location) => graph.distances.has(location.id)).sort((a, b) =>
    graph.distances.get(a.id) - graph.distances.get(b.id) || a.id.localeCompare(b.id))[0];
  return goal ? { location: goal, firstStep: graph.firstSteps.get(goal.id) } : undefined;
}

function supplies(asset) {
  if (Array.isArray(asset.uses)) return asset.uses.find(([type]) => (type?.tag ?? type) === "Supply")?.[1] ?? 0;
  return record(asset.uses).Supply ?? record(asset.uses).supply ?? 0;
}

/** The returned choice is the original enabled object from question.choices.
 * memory is a caller-owned, JSON-serializable strategy log, never native state.
 */
export function selectBarkhamChoice({ snapshot, question, cards, memory = {} }) {
  const game = record(snapshot?.game), playerId = snapshot?.playerId;
  if (!question || question.playerId !== playerId || question.kind !== "choices" || !choiceTags.has(question.tag)) return undefined;
  const actors = values(game.investigators).filter((actor) => actor.playerId === playerId && codeOf(actor) === "barkham-004");
  if (actors.length !== 1) return undefined;
  const actor = actors[0], here = game.locations?.[hereId(actor)];
  const enabled = list(question.choices).filter((choice) => choice.disabled === false
    && Number.isSafeInteger(choice.answerIndex) && ownedChoice(choice, actor, game));
  if (!enabled.length) return undefined;
  const hand = list(actor.hand).map(unbox).filter((card) => card.owner === actor.id && typeof card.id === "string");
  const ownedAssets = values(game.assets).filter((asset) => ownAsset(asset, actor));
  const catalog = Array.isArray(cards) ? new Map(cards.map((card) => [card.code, card])) : cards;
  const offered = list(question.choices).filter((choice) => choice.disabled === false && Number.isSafeInteger(choice.answerIndex));
  const locationsOnly = question.tag === "ChooseOne" && offered.every((choice) => ["TargetLabel", "Label"].includes(choice.tag))
    && offered.some((choice) => reference(record(choice.raw).target).tag === "LocationTarget"
      || publicChoiceLocation(choice, game, catalog));
  const source = reference(question.source);
  if (locationsOnly && (offered.length !== enabled.length || offered.some((choice) => !publicChoiceLocation(choice, game, catalog)))) return undefined;
  if (locationsOnly && source.tag === "EnemySource" && !game.enemies?.[source.id]) return undefined;
  const decide = (choice, reason, pendingAction) => {
    if (!choice) return undefined;
    if (pendingAction) memory.pendingAction = pendingAction;
    return { choice, reason };
  };
  const ability = (code, index, sourceId) => availableAbility(enabled, game, actor, code, index, sourceId);
  const play = (code) => enabled.find((choice) => {
    const card = cardChoice(choice, actor, hand, ["InitiatePlayCardWithWindows", "PlayCard"]);
    return card && codeOf(card) === code;
  });
  const pending = record(memory.pendingAction);
  const takeTarget = (tag, id, reason, clear = true) => {
    const choice = enabled.find((entry) => targetId(entry, tag) === id);
    if (!choice) return undefined;
    if (clear) delete memory.pendingAction;
    return decide(choice, reason);
  };

  if (!question.isPlayerWindow) {
    for (const [code, index] of [["barkham-005", 1], ["01033", 1], ["02020", 1]]) {
      const choice = ability(code, index);
      if (choice) return decide(choice, `Use the offered printed ${code} reaction from the controlled physical card.`);
    }
    if (pending.kind === "stubborn-cat") {
      const cat = record(game.treacheries?.[pending.treacheryId]);
      if (typeof pending.gameId !== "string" || !pending.gameId || pending.gameId !== game.id || pending.investigatorId !== actor.id
        || pending.locationId !== hereId(actor) || !localStubbornCat(cat, actor, pending.treacheryId)
        || !Number.isSafeInteger(pending.questionVersion) || question.questionVersion <= pending.questionVersion
        || question.tag !== "ChooseOne" || enabled.length !== 2
        || (source.tag && (source.tag !== "TreacherySource" || source.id !== cat.id))) return undefined;
      const tests = enabled.map((choice) => {
        const raw = record(choice.raw), skill = raw.skillType;
        if (choice.tag !== "SkillLabel" || !["SkillWillpower", "SkillAgility"].includes(skill)) return undefined;
        const starts = messages(choice);
        if (starts.length !== 1 || starts[0].tag !== "BeginSkillTestWithPreMessages'_") return undefined;
        const contents = list(starts[0].contents), test = record(contents[1]);
        const testSource = reference(test.source), testTarget = reference(test.target);
        return contents.length === 2 && Array.isArray(contents[0]) && contents[0].length === 0
          && typeof test.id === "string" && test.id && test.investigator === actor.id
          && test.source?.tag === "AbilitySource" && list(test.source.contents)[1] === 1
          && testSource.tag === "TreacherySource" && testSource.id === cat.id
          && testTarget.tag === "TreacheryTarget" && testTarget.id === cat.id
          && test.type?.tag === "SkillSkillTest" && test.type.contents === skill
          && test.baseValue?.tag === "SkillBaseValue" && test.baseValue.contents === skill
          && test.difficulty?.tag === "Fixed" && test.difficulty.contents === 4
          ? { choice, skill, id: test.id } : undefined;
      });
      if (tests.some((test) => !test) || new Set(tests.map((test) => test.id)).size !== 1
        || new Set(tests.map((test) => test.skill)).size !== 2) return undefined;
      delete memory.pendingAction;
      return decide(tests.find((test) => test.skill === "SkillAgility").choice,
        "Choose the actual printed agility-four Stubborn Cat test for the exact own location attachment; the native chaos draw remains authoritative.");
    }
    if (pending.kind === "sniff") {
      const answer = takeTarget("LocationTarget", pending.locationId, "Sniff the exact current physical location.");
      if (answer) return answer;
    }
    if (pending.enemyId) {
      const answer = takeTarget("EnemyTarget", pending.enemyId, "Choose the exact visible enemy for the preceding printed action.");
      if (answer) return answer;
      const direct = enabled.find((choice) => ["EvadeLabel", "EvadeLabelWithSkill", "FightLabel", "FightLabelWithSkill"].includes(choice.tag)
        && record(choice.raw).enemyId === pending.enemyId);
      if (direct) return decide(direct, "Resolve the preceding action against its exact physical enemy.");
    }
    if (pending.kind === "shortcut") {
      const self = takeTarget("InvestigatorTarget", actor.id, "Move only the owning investigator with Shortcut.", false);
      if (self) return self;
      const destination = takeTarget("LocationTarget", pending.locationId, "Take Shortcut to the chosen public connected location.");
      if (destination) return destination;
    }

    const test = record(game.skillTest);
    const start = enabled.find((choice) => choice.tag === "StartSkillTestButton" && record(choice.raw).investigatorId === actor.id);
    if (start && test.investigator === actor.id && typeof test.id === "string") {
      if (memory.commitTestId !== test.id) { memory.commitTestId = test.id; memory.committedCardIds = []; }
      const nativeCommitted = list(record(test.committedCards)[actor.id]).map(unbox).map((card) => card.id).filter((id) => typeof id === "string");
      const committed = [...new Set([...list(memory.committedCardIds), ...nativeCommitted])];
      if (committed.length < 2 && Number.isFinite(test.modifiedSkillValue) && Number.isFinite(test.modifiedDifficulty)
        && test.modifiedSkillValue - test.modifiedDifficulty < 4) {
        const priorities = test.action === "Investigate"
          ? ["01039", "01090", "01093"]
          : list(test.skills).includes("SkillAgility") ? ["01092", "01093"]
            : list(test.skills).includes("SkillWillpower") ? ["01089", "01093"] : ["01093"];
        for (const code of priorities) {
          const choice = enabled.find((entry) => {
            const card = cardChoice(entry, actor, hand, ["SkillTestCommitCard", "CommitCard"]);
            return card && codeOf(card) === code && !committed.includes(card.id);
          });
          if (choice) {
            const card = cardChoice(choice, actor, hand, ["SkillTestCommitCard", "CommitCard"]);
            memory.committedCardIds = [...committed, card.id];
            return decide(choice, "Commit an offered matching known skill from the actual own hand, at most two cards per test.");
          }
        }
      }
      return decide(start, "Begin the native test with its actual random chaos draw.");
    }
    const apply = enabled.find((choice) => choice.tag === "SkillTestApplyResultsButton");
    if (apply && test.investigator === actor.id) return decide(apply, "Apply the actual native skill-test result.");

    const testTarget = reference(test.target), testSource = reference(test.source);
    if (test.investigator === actor.id && typeof test.id === "string" && test.action === "Evade"
      && test.step === "ApplySkillTestResultsStep" && test.result?.tag === "SucceededBy"
      && game.skillTestResults?.skillTestResultsSuccess === true
      && testTarget.tag === "EnemyTarget" && !!game.enemies?.[testTarget.id]
      && testSource.tag === "EnemySource" && testSource.id === testTarget.id
      && test.source?.tag === "AbilitySource" && list(test.source.contents)[1] === 101) {
      const result = enabled.find((choice) => choice.tag === "Label" && messages(choice).some((message) => {
        const contents = list(message.contents), action = list(contents[0]);
        const actionTarget = reference(action[1]), target = reference(contents[3]), source = reference(contents[2]);
        return message.tag === "Successful_" && action[0] === "Evade" && contents[1] === actor.id
          && actionTarget.tag === "EnemyTarget" && actionTarget.id === testTarget.id
          && target.tag === "EnemyTarget" && target.id === testTarget.id
          && source.tag === "EnemySource" && source.id === testSource.id
          && record(contents[2]).tag === "AbilitySource" && list(record(contents[2]).contents)[1] === 101
          && Number.isFinite(contents[4]) && contents[4] >= 0 && contents[4] === list(test.result.contents)[1];
      }));
      if (result) return decide(result, "Resolve the offered successful evade result for the exact own native test and physical enemy before the remaining committed-skill option.");
    }

    // Damage and horror labels are native ComponentLabel pattern synonyms.
    const soak = enabled.filter((choice) => {
      const component = record(record(choice.raw).component);
      return choice.tag === "ComponentLabel" && ["DamageToken", "HorrorToken"].includes(component.tokenType)
        && ((component.tag === "InvestigatorComponent" && component.investigatorId === actor.id)
          || (component.tag === "AssetComponent" && ownAsset(record(game.assets?.[component.assetId]), actor)));
    });
    if (soak.length) {
      const asset = soak.find((choice) => record(record(choice.raw).component).tag === "AssetComponent");
      return decide(asset ?? soak[0], "Assign the offered damage or horror to a controlled physical asset, then the owning investigator.");
    }

    // The natural four-doom exposure can offer tied locations. The native
    // messages contain the concealed cards; only public targets/counts matter.
    const naturalExposure = game.phase === "MythosPhase" && values(game.agendas).some((agenda) =>
      codeOf(agenda) === "barkham-023" && agenda.flipped === true
        && agenda.sequence?.agendaSequenceSide === "B");
    if (naturalExposure && question.tag === "ChooseOne" && enabled.every((choice) =>
      choice.tag === "TargetLabel" && hiddenCount(game.locations?.[targetId(choice, "LocationTarget")]) > 0)) {
      const destinations = enabled.map((choice) => game.locations[targetId(choice, "LocationTarget")]);
      const target = closestLocation(game, actor, destinations, memory);
      if (!target) return undefined;
      return takeTarget("LocationTarget", target.location.id,
        "Resolve the natural agenda exposure at the nearest offered physical location using only public connections and facedown-card counts.");
    }

    const bossSpawn = values(game.acts).some((act) => codeOf(act) === "barkham-025")
      && values(game.locations).every((location) => hiddenCount(location) === 0)
      && !values(game.enemies).some((enemy) => codeOf(enemy) === "barkham-037");
    if (bossSpawn && enabled.every((choice) => targetId(choice, "LocationTarget"))) {
      const current = takeTarget("LocationTarget", hereId(actor), "Choose the offered own Central location for the real boss spawn.");
      if (current) return current;
      const destinations = enabled.map((choice) => game.locations?.[targetId(choice, "LocationTarget")]).filter(Boolean);
      const target = closestLocation(game, actor, destinations, memory);
      if (target) return takeTarget("LocationTarget", target.location.id, "Choose the nearest offered public Central boss spawn.");
    }
    // Bound public location prompts include printed Hunter ties and other
    // mandatory location selections. Choice messages may hold concealed cards,
    // so this fallback reads only targets, labels, source and the public map.
    if (locationsOnly) {
      const graph = routes(game, hereId(actor), memory);
      if (!graph) return undefined;
      const options = enabled.map((choice) => ({ choice, location: publicChoiceLocation(choice, game, catalog) }));
      if (options.some(({ location }) => !graph.distances.has(location.id))) return undefined;
      const enemySource = source.tag === "EnemySource" && !!game.enemies?.[source.id];
      options.sort((a, b) => (enemySource ? -1 : 1)
        * (graph.distances.get(a.location.id) - graph.distances.get(b.location.id))
        || a.location.id.localeCompare(b.location.id));
      delete memory.pendingAction;
      return decide(options[0].choice, enemySource
        ? "Choose the farthest offered public location for the actual public enemy source, with physical ID ordering for equal distances."
        : "Choose the nearest offered public location by public connections, with physical ID ordering for equal distances.");
    }
    const skip = enabled.find((choice) => choice.tag === "SkipTriggersButton" && record(choice.raw).investigatorId === actor.id);
    if (skip) return decide(skip, "Decline other optional reactions.");
    const intro = enabled.find((choice) => choice.label === "Follow the foul stench")
      ?? enabled.find((choice) => choice.label === "Track the cat to its lair — begin in Snoutside");
    if (intro) return decide(intro, "Choose the printed Snoutside introduction without consulting hidden cats.");
    const continueChoice = enabled.find((choice) => ["Label", "Done"].includes(choice.tag)
      && /^(Continue|Done|Begin|Proceed|Finish)\b/i.test(choice.label));
    if ((question.tag === "Read" || !test.id) && continueChoice)
      return decide(continueChoice, "Continue the actual printed narrative or completed mandatory choice.");
    if (enabled.length === 1 && ["Label", "Done", "TargetLabel", "PortraitLabel", "CostLabel", "EffectActionButton"].includes(enabled[0].tag))
      return decide(enabled[0], "Resolve the sole enabled option of this recognized native choice prompt.");
    return undefined;
  }

  delete memory.pendingAction;
  if (!here || typeof actor.remainingActions !== "number") return undefined;
  const sniffed = list(actor.meta?.sniffedLocations).includes(here.id);
  const engaged = values(game.enemies).filter((enemy) => list(actor.engagedEnemies).includes(enemy.id)
    || (enemy.placement?.tag === "InThreatArea" && enemy.placement.contents === actor.id));
  if (engaged.some((enemy) => typeof enemy.exhausted !== "boolean" && typeof enemy.ready !== "boolean")) {
    memory.unsupportedShape = "Expected the native exhausted flag of the actual engaged enemy.";
    return undefined;
  }
  const readyEngaged = engaged.filter((enemy) => typeof enemy.exhausted === "boolean" ? !enemy.exhausted : enemy.ready === true);
  const boss = values(game.enemies).find((enemy) => codeOf(enemy) === "barkham-037");
  const bossHere = boss && (boss.placement?.contents === here.id
    || boss.placement?.contents === actor.id || list(actor.engagedEnemies).includes(boss.id));
  const clues = tokenCount(actor, "Clue"), localClues = tokenCount(here, "Clue");
  const hiddenTotal = values(game.locations).reduce((count, location) => count + hiddenCount(location), 0);
  const visibleMasks = values(game.enemies).filter((enemy) => !enemy.defeated
    && ["AtLocation", "InThreatArea"].includes(enemy.placement?.tag)
    && /^barkham-0(38|39|40|41|42|43|44)$/.test(codeOf(enemy))).length;
  const finalPacifyReserve = !boss && hiddenTotal === 1 && hiddenCount(here) === 1
    ? Math.ceil((4 + visibleMasks) / 2) : undefined;
  if (finalPacifyReserve !== undefined) memory.finalPacifyClueReserve = finalPacifyReserve;
  const hasFoulOdor = values(game.treacheries).find((treachery) => codeOf(treachery) === "barkham-006" && ownTreachery(treachery, actor));
  if (readyEngaged.length) {
    if (actor.remainingActions === 0) {
      const end = enabled.find((choice) => choice.tag === "EndTurnButton"
        && record(choice.raw).investigatorId === actor.id
        && messages(choice).length === 1 && messages(choice)[0].tag === "ChooseEndTurn"
        && messages(choice)[0].contents === actor.id);
      if (end) return decide(end, "End the actually completed turn with zero remaining actions; the native enemy phase and attacks remain authoritative.");
    }
    const bossDamage = tokenCount(boss, "Damage"), health = boss?.currentHealth;
    const remaining = Number.isSafeInteger(health) && Number.isSafeInteger(bossDamage)
      && health > 0 && bossDamage >= 0 ? health - bossDamage : undefined;
    const safeDamage = bossHere && Number.isSafeInteger(remaining) && remaining > 0
      && Number.isSafeInteger(clues) && clues >= remaining
      && Number.isSafeInteger(actor.remainingActions) && actor.remainingActions >= remaining
      ? ability("barkham-026", 2) : undefined;
    const safeAbility = record(record(safeDamage?.raw).ability), costs = list(safeAbility.type?.cost?.contents);
    if (safeDamage && safeAbility.doesNotProvokeAttacksOfOpportunity?.tag === "AnyEnemy"
      && safeAbility.type?.tag === "ActionAbility" && safeAbility.type?.cost?.tag === "Costs" && costs.length === 2
      && costs.some((cost) => cost.tag === "ActionCost" && cost.contents === 1)
      && costs.some((cost) => cost.tag === "ClueCost" && cost.contents?.tag === "Static" && cost.contents.contents === 1))
      return decide(safeDamage, "Use the offered one-clue/one-damage action without attacks of opportunity when the remaining boss health fits the actual current clue and action budget.",
        { kind: "damage", enemyId: boss.id });
    if (!sniffed) {
      const sniff = ability("barkham-004", 1, actor.id);
      if (sniff) return decide(sniff, "Sniff without attacks of opportunity before the necessary evade test.", { kind: "sniff", locationId: here.id });
    }
    const enemies = [...readyEngaged].sort((a, b) => (codeOf(b) === "barkham-037") - (codeOf(a) === "barkham-037") || a.id.localeCompare(b.id));
    for (const enemy of enemies) {
      const evade = ability(codeOf(enemy), 101, enemy.id);
      if (evade) return decide(evade, "Use the offered basic evade on the exact ready engaged enemy.", { kind: "evade", enemyId: enemy.id });
    }
    return undefined;
  }
  if (hasFoulOdor) {
    const clear = ability("barkham-006", 1, hasFoulOdor.id);
    if (clear) return decide(clear, "Discard the actual Foul Odor with its printed action before further tests.");
  }
  for (const [code, index] of [["01098", 1], ["01099", 2], ["01100", 2]]) {
    const threat = values(game.treacheries).find((treachery) => codeOf(treachery) === code && ownTreachery(treachery, actor));
    if (threat) {
      const clear = ability(code, index, threat.id);
      if (clear) return decide(clear, "Pay the printed two-action cost to clear the actual harmful basic weakness.");
    }
  }
  if (codeOf(here) === "barkham-035" && tokenCount(actor, "Damage") >= 2) {
    const heal = ability("barkham-035", 1, here.id);
    if (heal) return decide(heal, "Use the offered once-per-game hospital action to heal actual damage.");
  }
  if (bossHere && clues >= 1) {
    const damage = ability("barkham-026", 1);
    if (damage) return decide(damage, "Spend one actual clue for two printed damage while no ready enemy is engaged.", { kind: "damage", enemyId: boss.id });
  }

  for (const code of ["04203", "01033", "01030", "01087", "barkham-005", "barkham-017", "02020"]) {
    if (ownedAssets.some((asset) => codeOf(asset) === code)) continue;
    const printed = catalog?.get?.(code);
    if (!printed) { memory.unsupportedShape = `Missing catalogue definition for ${code}.`; return undefined; }
    const slot = printed.slot?.toLowerCase();
    const matchingSlots = slot ? ownedAssets.filter((asset) => catalog?.get?.(codeOf(asset))?.slot?.toLowerCase() === slot).length : 0;
    if (matchingSlots >= (slot === "hand" ? 2 : 1)) continue;
    const choice = play(code);
    if (choice) return decide(choice, "Play the affordable offered physical asset without duplicating an occupied printed slot.", { kind: "play", cardCode: code });
  }
  const hunch = localClues > 0 ? play("01037") : undefined;
  if (hunch) return decide(hunch, "Play the offered Working a Hunch to discover a real clue without a chaos test.", { kind: "play", cardCode: "01037" });
  const cache = tokenCount(actor, "Resource") <= 2 ? play("01088") : undefined;
  if (cache) return decide(cache, "Play the actual Emergency Cache for ordinary printed resources.", { kind: "play", cardCode: "01088" });
  if (!boss && hiddenCount(here) > 0 && clues >= 2 + (finalPacifyReserve ?? 0)) {
    const pacify = ability("barkham-023", 1);
    if (pacify) return decide(pacify, "Pay two actual clues to pacify the facedown card without using its hidden identity.");
  }
  if (localClues > 0) {
    const flashlight = ownedAssets.find((asset) => codeOf(asset) === "01087" && supplies(asset) > 0);
    const investigate = flashlight ? ability("01087", 1, flashlight.id) : undefined;
    const basic = ability(codeOf(here), 103, here.id);
    const cat = here.revealed === true && !investigate && !basic
      ? values(game.treacheries).find((treachery) => localStubbornCat(treachery, actor, treachery.id)) : undefined;
    const clearCat = cat ? ability("barkham-055", 1, cat.id) : undefined;
    if (clearCat) return decide(clearCat, "Use the actually offered Stubborn Cat action on this exact location attachment before trying to investigate its visible clues.",
      { kind: "stubborn-cat", treacheryId: cat.id, locationId: here.id,
        investigatorId: actor.id, gameId: game.id, questionVersion: question.questionVersion });
    if (!sniffed) {
      const sniff = ability("barkham-004", 1, actor.id);
      if (sniff) return decide(sniff, "Sniff the current physical location before its repeated clue tests.", { kind: "sniff", locationId: here.id });
    }
    if (investigate) return decide(investigate, "Investigate using the actual Flashlight supply and printed shroud reduction.", { kind: "investigate", locationId: here.id });
    if (basic) return decide(basic, "Investigate the revealed current location for its actual remaining clues.", { kind: "investigate", locationId: here.id });
  }

  const locations = values(game.locations);
  const damage = tokenCount(actor, "Damage"), health = Number(actor.currentHealth ?? actor.health);
  const hospital = damage >= 2 && health - damage <= 3 ? locations.filter((location) => location.revealed === true && codeOf(location) === "barkham-035") : [];
  let goals = hospital;
  let unpreparedBossLocationId;
  if (!goals.length && boss) {
    const bossLocation = boss.placement?.tag === "AtLocation" ? game.locations?.[boss.placement.contents] : undefined;
    const reserve = Number.isFinite(boss.currentHealth) ? Math.ceil(Math.max(0, boss.currentHealth - tokenCount(boss, "Damage")) / 2) : undefined;
    if (reserve === undefined) { memory.unsupportedShape = "Expected actual boss.currentHealth for the clue reserve."; return undefined; }
    // An unrevealed boss location is not a preparation destination or transit
    // step. Collect its public clue reserve elsewhere before entering it.
    if (clues < reserve) unpreparedBossLocationId = bossLocation?.id;
    goals = clues >= reserve && bossLocation ? [bossLocation]
      : locations.filter((location) => location.id !== unpreparedBossLocationId
        && (location.revealed !== true || tokenCount(location, "Clue") > 0));
    memory.bossClueReserve = reserve;
  }
  if (!goals.length) goals = locations.filter((location) => location.id !== here.id
    && location.id !== unpreparedBossLocationId && hiddenCount(location) > 0);
  if (!goals.length) goals = locations.filter((location) => location.id !== here.id
    && location.id !== unpreparedBossLocationId && (location.revealed !== true || tokenCount(location, "Clue") > 0));
  const route = goals.length ? closestLocation(game, actor, goals, memory, unpreparedBossLocationId) : undefined;
  if (goals.length && !route) return undefined;
  if (route?.firstStep) {
    const readyAtDestination = values(game.enemies).some((enemy) => !enemy.defeated
      && enemy.placement?.tag === "AtLocation" && enemy.placement.contents === route.firstStep
      && (typeof enemy.exhausted === "boolean" ? !enemy.exhausted : enemy.ready === true));
    if (actor.remainingActions === 1 && readyAtDestination) {
      const wait = enabled.find((choice) => choice.tag === "EndTurnButton" && record(choice.raw).investigatorId === actor.id);
      if (wait) return decide(wait, "Wait for refreshed actions before voluntarily moving into a location with an actual ready enemy.");
      return undefined;
    }
    const shortcut = play("02022");
    if (shortcut) return decide(shortcut, "Play Shortcut along the shortest public connection route.", { kind: "shortcut", locationId: route.firstStep });
    const next = game.locations[route.firstStep], move = ability(codeOf(next), 104, next.id);
    if (move) return decide(move, "Move along the shortest public connection route using only facedown-card counts.", { kind: "move", locationId: next.id });
  }
  const end = enabled.find((choice) => choice.tag === "EndTurnButton" && record(choice.raw).investigatorId === actor.id);
  if (actor.remainingActions === 0 && end) return decide(end, "End the completed ordinary turn.");
  const draw = enabled.find((choice) => record(record(choice.raw).component).tag === "InvestigatorDeckComponent"
    && record(record(choice.raw).component).investigatorId === actor.id);
  if (draw && hand.length < 5) return decide(draw, "Take the offered ordinary draw action for the own investigator.");
  const resource = enabled.find((choice) => record(record(choice.raw).component).tag === "InvestigatorComponent"
    && record(record(choice.raw).component).investigatorId === actor.id
    && record(record(choice.raw).component).tokenType === "ResourceToken");
  if (resource && tokenCount(actor, "Resource") < 5) return decide(resource, "Take the offered ordinary resource action for the own investigator.");
  return end ? decide(end, "End the turn when the bounded known strategy has no useful offered action.") : undefined;
}
