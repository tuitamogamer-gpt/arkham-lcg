/** Bounded legal Machinations tactics. Only current own offered choices, own
 * hand, live local entities, revealed locations and printed local log entries
 * inform decisions. Metadata/replicas, queues, decks, set-aside cards and other
 * tables are sealed. A policy checkpoint is never a playthrough proof. */
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const rows = (v) =>
  Array.isArray(v)
    ? v.map((r) => (Array.isArray(r) ? r[1] : r))
    : Object.values(v || {});
const unwrap = (v) =>
  object(v?.contents) && /^(PlayerCard|EncounterCard)$/.test(v.tag || "")
    ? v.contents
    : v;
const code = (v) => {
  const value =
    typeof v === "string"
      ? v
      : v?.cardCode ||
        v?.art ||
        (/^c?\d{5}[a-z]?$/.test(v?.id || "") ? v.id : "");
  return /^c?\d{5}[a-z]?$/.test(value) ? value.replace(/^c/, "") : undefined;
};
const enabled = (q) =>
  (q?.choices || []).filter(
    (c) =>
      c &&
      c.disabled !== true &&
      Number.isSafeInteger(c.answerIndex) &&
      c.answerIndex >= 0,
  );
const text = (c) =>
  `${c?.label || ""} ${typeof c?.raw?.label === "string" ? c.raw.label : ""}`;
const result = (choice, reason) => (choice ? { choice, reason } : undefined);
const findText = (choices, expression) =>
  choices.find((c) => expression.test(text(c)));
const localVisible = (v) =>
  v && v.visible !== false && v.hidden !== true && v.facedown !== true;
const inPlay = (v) =>
  localVisible(v) &&
  [
    "AtLocation",
    "InPlayArea",
    "InThreatArea",
    "AttachedToLocation",
    "AttachedToEnemy",
    "AttachedToAsset",
    "AttachedToInvestigator",
  ].includes(v.placement?.tag);
const locationId = (v) =>
  /^(AtLocation|AttachedToLocation)$/.test(v?.placement?.tag || "")
    ? v.placement.contents
    : undefined;
const actorOf = (s) =>
  rows(s?.game?.investigators).find((i) => i.playerId === s?.playerId);
const scenarioOf = (s) =>
  s?.game?.scenario || s?.game?.mode?.That || s?.game?.mode?.These?.[1];
const token = (entity, type) => {
  const values = entity?.tokens;
  const n = Array.isArray(values)
    ? values.find((r) => Array.isArray(r) && r[0] === type)?.[1]
    : values?.[type];
  return n === undefined
    ? 0
    : Number.isSafeInteger(n) && n >= 0
      ? n
      : undefined;
};
const groups = ["Past", "Present", "Future"];
const scientists = {
  Past: ["87012", "87013"],
  Present: ["87021", "87022"],
  Future: ["87030", "87031"],
};
const legacyCodes = { Past: "87006", Present: "87015", Future: "87024" };
const remembered = (s, key) =>
  rows(scenarioOf(s)?.log).some((entry) => entry === key || entry?.tag === key);

function frame(snapshot, memory) {
  const game = snapshot?.game || {},
    actor = actorOf(snapshot),
    group = memory?.group;
  const locations = rows(game.locations),
    hereId = locationId(actor),
    here = locations.find((l) => l.id === hereId);
  const assets = rows(game.assets).filter(inPlay),
    enemies = rows(game.enemies).filter(inPlay);
  const controlled = assets.filter(
    (a) =>
      a.controller === actor?.id ||
      (a.placement?.tag === "InPlayArea" && a.placement.contents === actor?.id),
  );
  return {
    game,
    actor,
    group,
    locations,
    here,
    hereId,
    assets,
    enemies,
    controlled,
    stories: rows(game.stories).filter(localVisible),
    acts: rows(game.acts).filter(localVisible),
    agendas: rows(game.agendas).filter(localVisible),
    treacheries: rows(game.treacheries).filter(inPlay),
    clues: token(actor, "Clue"),
    resources: token(actor, "Resource"),
    actions: actor?.remainingActions,
  };
}

function ownedFrame(f, snapshot, question, memory) {
  return (
    f.actor &&
    groups.includes(f.group) &&
    typeof f.actor.id === "string" &&
    typeof f.game.id === "string" &&
    question?.playerId === snapshot?.playerId &&
    f.actor.playerId === snapshot.playerId &&
    Number.isSafeInteger(question.questionVersion) &&
    question.questionVersion >= 0 &&
    (!memory.gameId || memory.gameId === f.game.id) &&
    (!memory.actorId || memory.actorId === f.actor.id) &&
    (!memory.playerId || memory.playerId === snapshot.playerId)
  );
}

/** Walk only the source explicitly exposed in an offered ability. */
function references(source, depth = 0) {
  if (!object(source) || depth > 8) return [];
  if (source.tag === "ProxySource" && source.source && source.originalSource)
    return [
      ...references(source.source, depth + 1),
      ...references(source.originalSource, depth + 1),
    ];
  if (source.tag === "ProxySource" && Array.isArray(source.contents))
    return source.contents.flatMap((s) => references(s, depth + 1));
  if (source.tag === "AbilitySource" && Array.isArray(source.contents))
    return references(source.contents[0], depth + 1);
  return /^(Location|Asset|Enemy|Investigator|Story|Act|Agenda|Treachery)Source$/.test(
    source.tag || "",
  ) && typeof source.contents === "string"
    ? [{ tag: source.tag, id: source.contents }]
    : [];
}
const ability = (c) => (c?.tag === "AbilityLabel" ? c.raw?.ability : undefined);
const abilityCode = (c) => code(ability(c)?.cardCode);
const byAbility = (choices, cardCode, index) =>
  choices.find(
    (c) => abilityCode(c) === cardCode && ability(c)?.index === index,
  );
const target = (c) => c?.raw?.target || c?.source;
const targetId = (c) =>
  typeof target(c)?.contents === "string" ? target(c).contents : undefined;
const hand = (f) =>
  rows(f.actor?.hand)
    .map(unwrap)
    .filter((c) => c?.owner === f.actor?.id && localVisible(c));
const handChoice = (f, c) =>
  target(c)?.tag === "CardIdTarget"
    ? hand(f).find((card) => card.id === targetId(c))
    : undefined;
const catalog = (cards) =>
  Array.isArray(cards)
    ? new Map(cards.map((c) => [c.code, c]))
    : cards instanceof Map
      ? cards
      : new Map(Object.entries(cards || {}));
const safeFromAoo = (a) =>
  a?.doesNotProvokeAttacksOfOpportunity === true ||
  a?.doesNotProvokeAttacksOfOpportunity?.tag === "AnyEnemy";
const nativeEnemyAction = (f, c, enemy, index) => {
  const a = ability(c),
    action = index === 100 ? "Fight" : "Evade";
  return (
    c.raw?.investigatorId === f.actor.id &&
    a?.basic === true &&
    a.index === index &&
    a.source?.tag === "EnemySource" &&
    a.source.contents === enemy.id &&
    a.type?.tag === "ActionAbility" &&
    a.type.actions?.tag === "SingleAction" &&
    a.type.actions.contents === action
  );
};

function boundAbility(f, c) {
  const a = ability(c);
  if (!a) return true;
  if (
    c.raw?.investigatorId !== undefined &&
    c.raw.investigatorId !== f.actor?.id
  )
    return false;
  if (!Number.isSafeInteger(a.index) || a.index < 0) return false;
  const refs = references(a.source);
  if (!refs.length) return false;
  const collections = {
    LocationSource: f.locations,
    AssetSource: f.assets,
    EnemySource: f.enemies,
    StorySource: f.stories,
    ActSource: f.acts,
    AgendaSource: f.agendas,
    TreacherySource: f.treacheries,
    InvestigatorSource: [f.actor],
  };
  const physical = refs.map((r) => ({
    reference: r,
    entity: collections[r.tag]?.find((e) => e.id === r.id),
  }));
  if (physical.some((p) => !p.entity)) return false;
  if (
    [103, 104].includes(a.index) &&
    physical.some((p) => p.reference.tag === "LocationSource")
  )
    return true;
  return physical.some(
    ({ reference, entity }) =>
      (reference.tag !== "LocationSource" || entity.revealed === true) &&
      code(entity) === abilityCode(c),
  );
}

/** Offered UI effects may identify a response; native continuations/queues are
 * never consulted or submitted. Traversal is deliberately bounded. */
function messages(c) {
  const found = [];
  function walk(v, depth) {
    if (depth > 14 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const item of v) walk(item, depth + 1);
      return;
    }
    if (typeof v.tag === "string") found.push(v);
    if (v.contents !== undefined) walk(v.contents, depth + 1);
    if (v.messages !== undefined) walk(v.messages, depth + 1);
  }
  walk(c?.raw?.messages || [], 0);
  return found;
}
const containsMessage = (c, tag) => messages(c).some((m) => m.tag === tag);
const sourceEqual = (left, right) => {
  const a = references(left),
    b = references(right);
  return (
    a.length > 0 &&
    a.length === b.length &&
    a.every((r, i) => r.tag === b[i].tag && r.id === b[i].id) &&
    (right?.tag !== "AbilitySource" ||
      (left?.tag === "AbilitySource" &&
        left.contents?.[1] === right.contents?.[1]))
  );
};
const choiceWitness = (s, q, c) => ({
  gameId: s.game.id,
  actorId: actorOf(s)?.id,
  playerId: s.playerId,
  questionVersion: q.questionVersion,
  questionTag: q.tag,
  answerIndex: c.answerIndex,
  label: c.label,
});

function offeredCommitCard(f, question, c) {
  const test = f.game.skillTest,
    card = handChoice(f, c);
  if (
    question.playerId !== f.actor?.playerId ||
    !test ||
    test.investigator !== f.actor?.id ||
    typeof test.id !== "string" ||
    !test.id ||
    !card
  )
    return undefined;
  const ownCommit = messages(c).some(
    (m) =>
      ["SkillTestCommitCard_", "SkillTestCommitCard", "CommitCard"].includes(
        m.tag,
      ) &&
      Array.isArray(m.contents) &&
      m.contents[0] === f.actor.id &&
      (() => {
        const native = unwrap(m.contents[1]);
        return (
          native?.id === card.id &&
          native.owner === f.actor.id &&
          native.cardCode === card.cardCode
        );
      })(),
  );
  const continuation = messages(c).some(
    (m) =>
      ["CommitToSkillTest_", "CommitToSkillTest"].includes(m.tag) &&
      m.contents?.[0] === test.id &&
      m.contents?.[1]?.tag === "StartSkillTestButton" &&
      m.contents[1].investigatorId === f.actor.id,
  );
  return ownCommit && continuation ? card : undefined;
}

function directSuccessfulChoice(f, choices, test, actionTarget, effectTarget) {
  const matches = choices.filter(
    (c) =>
      c.tag === "Label" &&
      c.raw?.tag === "Label" &&
      Array.isArray(c.raw.messages) &&
      c.raw.messages.some((wrapped) => {
        const m =
          wrapped?.tag === "SkillTestMessage" ? wrapped.contents : wrapped;
        if (
          m?.tag !== "Successful_" ||
          !Array.isArray(m.contents) ||
          m.contents.length !== 5
        )
          return false;
        const [action, investigator, source, target, margin] = m.contents;
        return (
          Array.isArray(action) &&
          action.length === 2 &&
          action[0] === test.action &&
          action[1]?.tag === actionTarget.tag &&
          action[1].contents === actionTarget.contents &&
          investigator === f.actor.id &&
          sourceEqual(source, test.source) &&
          target?.tag === effectTarget.tag &&
          target.contents === effectTarget.contents &&
          margin === test.result.contents[1]
        );
      }),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** A result ordering choice must expose Successful_ directly, not inside a
 * deferred bonus option. Bind it to this owned test and physical investigate
 * source. Mary sets a location/asset ProxyTarget; Flashlight keeps the native
 * LocationTarget. Present Mary's investigate is ability 2, not her skill boost. */
function successfulInvestigation(f, question, choices, memory) {
  const test = f.game.skillTest;
  if (
    question.tag !== "ChooseOne" ||
    question.isPlayerWindow ||
    test?.investigator !== f.actor.id ||
    test.action !== "Investigate" ||
    test.step !== "ApplySkillTestResultsStep" ||
    typeof test.id !== "string" ||
    !test.id ||
    test.result?.tag !== "SucceededBy" ||
    !Array.isArray(test.result.contents) ||
    !Number.isSafeInteger(test.result.contents[1]) ||
    test.result.contents[1] < 0 ||
    f.here?.revealed !== true ||
    test.source?.tag !== "AbilitySource" ||
    !Array.isArray(test.source.contents) ||
    test.source.contents.length !== 2
  )
    return undefined;
  const [physical, index] = test.source.contents;
  if (!Number.isSafeInteger(index) || index < 0) return undefined;
  let expectedTarget;
  if (
    physical?.tag === "LocationSource" &&
    physical.contents === f.hereId &&
    index === 103 &&
    test.target?.tag === "LocationTarget" &&
    test.target.contents === f.hereId
  ) {
    expectedTarget = test.target;
  } else if (physical?.tag === "AssetSource") {
    const asset = f.assets.find((a) => a.id === physical.contents),
      prior = memory.lastAbility;
    const maryIndex = { 87013: 1, 87022: 2, 87031: 1 }[code(asset)],
      mary = maryIndex === index && locationId(asset) === f.hereId,
      flashlight =
        code(asset) === "01087" &&
        index === 1 &&
        f.controlled.some((a) => a.id === asset?.id);
    if (
      !asset ||
      !(mary || flashlight) ||
      prior?.cardCode !== code(asset) ||
      prior.index !== index ||
      prior.witness?.gameId !== f.game.id ||
      prior.witness.actorId !== f.actor.id ||
      prior.witness.playerId !== f.actor.playerId ||
      !sourceEqual(prior.source, physical)
    )
      return undefined;
    if (mary) {
      if (
        test.target?.tag !== "ProxyTarget" ||
        !Array.isArray(test.target.contents) ||
        test.target.contents.length !== 2 ||
        test.target.contents[0]?.tag !== "LocationTarget" ||
        test.target.contents[0].contents !== f.hereId ||
        test.target.contents[1]?.tag !== "AssetTarget" ||
        test.target.contents[1].contents !== asset.id
      )
        return undefined;
      expectedTarget = test.target.contents[1];
    } else {
      if (
        test.target?.tag !== "LocationTarget" ||
        test.target.contents !== f.hereId
      )
        return undefined;
      expectedTarget = test.target;
    }
  } else return undefined;
  return directSuccessfulChoice(
    f,
    choices,
    test,
    { tag: "LocationTarget", contents: f.hereId },
    expectedTarget,
  );
}

function successfulCombat(f, question, choices, memory) {
  const test = f.game.skillTest,
    prior = memory.lastAbility;
  if (
    question.tag !== "ChooseOne" ||
    question.isPlayerWindow ||
    test?.investigator !== f.actor.id ||
    !["Fight", "Evade"].includes(test.action) ||
    test.step !== "ApplySkillTestResultsStep" ||
    typeof test.id !== "string" ||
    !test.id ||
    test.result?.tag !== "SucceededBy" ||
    !Array.isArray(test.result.contents) ||
    !Number.isSafeInteger(test.result.contents[1]) ||
    test.result.contents[1] < 0 ||
    test.target?.tag !== "EnemyTarget" ||
    test.source?.tag !== "AbilitySource" ||
    !Array.isArray(test.source.contents) ||
    test.source.contents.length !== 2 ||
    prior?.witness?.gameId !== f.game.id ||
    prior.witness.actorId !== f.actor.id ||
    prior.witness.playerId !== f.actor.playerId
  )
    return undefined;
  const [physical, index] = test.source.contents,
    enemy = f.enemies.find((e) => e.id === test.target.contents);
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    !enemy ||
    !(
      locationId(enemy) === f.hereId ||
      (enemy.placement?.tag === "InThreatArea" &&
        enemy.placement.contents === f.actor.id)
    ) ||
    (test.action === "Fight" && ["87037", "87037a"].includes(code(enemy))) ||
    prior.index !== index ||
    !sourceEqual(prior.source, physical)
  )
    return undefined;
  const basic =
    physical?.tag === "EnemySource" &&
    physical.contents === enemy.id &&
    index === (test.action === "Fight" ? 100 : 101) &&
    prior.cardCode === code(enemy);
  const weapon =
    test.action === "Fight" &&
    physical?.tag === "AssetSource" &&
    index === 1 &&
    prior.cardCode === "01020" &&
    f.controlled.some((a) => a.id === physical.contents && code(a) === "01020");
  if (!basic && !weapon) return undefined;
  return directSuccessfulChoice(f, choices, test, test.target, test.target);
}

function failedElderThing(f, question) {
  const test = f.game.skillTest;
  if (
    question.tag !== "ChooseOne" ||
    question.isPlayerWindow ||
    test?.investigator !== f.actor.id ||
    test.step !== "ApplySkillTestResultsStep" ||
    typeof test.id !== "string" ||
    !test.id ||
    test.result?.tag !== "FailedBy" ||
    !Array.isArray(test.result.contents) ||
    !Number.isSafeInteger(test.result.contents[1]) ||
    test.result.contents[1] < 0 ||
    !Array.isArray(test.revealedChaosTokens) ||
    !test.revealedChaosTokens.some(
      (t) =>
        t.chaosTokenFace === "ElderThing" &&
        t.chaosTokenRevealedBy === f.actor.id &&
        t.chaosTokenCancelled === false,
    )
  )
    return false;
  return true;
}

function elderThingPenaltyOptions(f, choices, expectedId) {
  if (!Array.isArray(choices) || choices.length !== 2) return;
  const candidates = choices.map((c, index) => {
    const raw = c.raw || c;
    if (
      raw.tag !== "Label" ||
      (c.raw && c.tag !== "Label") ||
      c.disabled === true ||
      !Array.isArray(raw.messages) ||
      raw.messages.length !== 1
    )
      return;
    const m = raw.messages[0];
    if (
      m?.tag !== "DealAssetDamageWithCheck" ||
      !Array.isArray(m.contents) ||
      m.contents.length !== 5
    )
      return;
    const [id, source, damage, horror, check] = m.contents,
      asset = f.assets.find(
        (a) =>
          a.id === id &&
          ((scientists[f.group].includes(code(a)) &&
            locationId(a) === f.hereId) ||
            (code(a) === "01033" &&
              a.controller === f.actor.id &&
              f.controlled.some((own) => own.id === a.id))),
      );
    if (
      !asset ||
      (expectedId !== undefined && id !== expectedId) ||
      source?.tag !== "ChaosTokenEffectSource" ||
      source.contents !== "ElderThing" ||
      check !== true ||
      !((damage === 1 && horror === 0) || (damage === 0 && horror === 1)) ||
      !Number.isSafeInteger(asset.health) ||
      asset.health <= 0 ||
      !Number.isSafeInteger(asset.sanity) ||
      asset.sanity <= 0 ||
      token(asset, "Damage") === undefined ||
      token(asset, "Horror") === undefined
    )
      return;
    return {
      choice: c,
      id,
      index: c.answerIndex ?? index,
      kind: damage ? "damage" : "horror",
      remaining: damage
        ? asset.health - token(asset, "Damage") - damage
        : asset.sanity - token(asset, "Horror") - horror,
    };
  });
  if (
    candidates.some((c) => !c) ||
    candidates[0].id !== candidates[1].id ||
    candidates[0].kind === candidates[1].kind
  )
    return undefined;
  return candidates;
}

function scientistElderThingPenalty(f, question, choices) {
  if (!failedElderThing(f, question)) return;
  return elderThingPenaltyOptions(f, choices)?.sort(
    (a, b) => b.remaining - a.remaining || a.index - b.index,
  )[0].choice;
}

function elderThingTarget(f, question, choices) {
  if (!failedElderThing(f, question) || !choices.length) return;
  const candidates = choices.map((c) => {
    if (
      c.tag !== "TargetLabel" ||
      c.raw?.tag !== "TargetLabel" ||
      c.raw.target?.tag !== "AssetTarget" ||
      !Array.isArray(c.raw?.messages) ||
      c.raw.messages.length !== 1
    )
      return;
    const ask = c.raw.messages[0];
    if (
      ask?.tag !== "Ask" ||
      !Array.isArray(ask.contents) ||
      ask.contents.length !== 2 ||
      ask.contents[0] !== f.actor.playerId ||
      ask.contents[1]?.tag !== "ChooseOne"
    )
      return;
    const options = elderThingPenaltyOptions(
      f,
      ask.contents[1].choices,
      targetId(c),
    );
    if (!options) return;
    return {
      choice: c,
      controlled: f.controlled.some(
        (a) => a.id === targetId(c) && code(a) === "01033",
      ),
      remaining: Math.max(...options.map((o) => o.remaining)),
    };
  });
  if (candidates.some((c) => !c)) return;
  return candidates.sort(
    (a, b) =>
      Number(b.controlled) - Number(a.controlled) ||
      b.remaining - a.remaining ||
      a.choice.answerIndex - b.choice.answerIndex,
  )[0].choice;
}

function tearInTimeActionLoss(f, question, choices) {
  const test = f.game.skillTest;
  if (
    question.tag !== "ChooseOne" ||
    question.isPlayerWindow ||
    choices.length !== 2 ||
    !Number.isSafeInteger(f.actions) ||
    f.actions <= 0 ||
    test?.investigator !== f.actor.id ||
    typeof test.id !== "string" ||
    !test.id ||
    test.step !== "ApplySkillTestResultsStep" ||
    test.result?.tag !== "FailedBy" ||
    !Array.isArray(test.result.contents) ||
    test.result.contents[0] !== "NonAutomatic" ||
    !Number.isSafeInteger(test.result.contents[1]) ||
    test.result.contents[1] <= 0 ||
    test.source?.tag !== "TreacherySource" ||
    typeof test.source.contents !== "string" ||
    !test.source.contents ||
    test.target?.tag !== "TreacheryTarget" ||
    test.target.contents !== test.source.contents
  )
    return;
  const loss = choices.find(
      (c) => c.raw?.label === "$label.loseActions count=i:1.0",
    ),
    horror = choices.find(
      (c) => c.raw?.label === "$label.takeHorror count=i:1.0",
    );
  if (
    !loss ||
    !horror ||
    [loss, horror].some(
      (c) =>
        c.tag !== "Label" ||
        c.raw.tag !== "Label" ||
        !Array.isArray(c.raw.messages) ||
        c.raw.messages.length !== 1,
    )
  )
    return;
  const lose = loss.raw.messages[0],
    take = horror.raw.messages[0];
  if (
    lose?.tag !== "LoseActions" ||
    !Array.isArray(lose.contents) ||
    lose.contents.length !== 3 ||
    lose.contents[0] !== f.actor.id ||
    !sourceEqual(lose.contents[1], test.source) ||
    lose.contents[2] !== 1 ||
    take?.tag !== "InvestigatorMessage" ||
    take.contents?.tag !== "InvestigatorAssignDamage_" ||
    !Array.isArray(take.contents.contents) ||
    take.contents.contents.length !== 5
  )
    return;
  const [actor, source, damageType, damage, amount] = take.contents.contents;
  if (
    actor !== f.actor.id ||
    !sourceEqual(source, test.source) ||
    damageType?.tag !== "DamageAny" ||
    damage !== 0 ||
    amount !== 1
  )
    return;
  return loss;
}

function vanishingHistoryItem(f, question, choices, definitions) {
  if (question.tag !== "ChooseOne" || question.isPlayerWindow) return;
  const item = choices.find(
      (c) =>
        c.tag === "Label" &&
        c.raw?.label ===
          "$standalone.machinationsThroughTime.label.vanishingHistory.discardItem",
    ),
    cards = choices.find(
      (c) =>
        c.tag === "Label" &&
        c.raw?.label ===
          "$standalone.machinationsThroughTime.label.vanishingHistory.discardCards",
    );
  if (
    !item ||
    !cards ||
    item.raw.tag !== "Label" ||
    cards.raw.tag !== "Label" ||
    !Array.isArray(item.raw.messages) ||
    item.raw.messages.length !== 1 ||
    !Array.isArray(cards.raw.messages) ||
    cards.raw.messages.length !== 1
  )
    return;
  const discard = cards.raw.messages[0],
    source = discard?.contents?.discardSource,
    ask = item.raw.messages[0];
  if (
    discard?.tag !== "DiscardFromHand" ||
    discard.contents?.discardInvestigator !== f.actor.id ||
    discard.contents.discardAmount !== 3 ||
    discard.contents.discardFilter?.tag !== "NonWeakness" ||
    discard.contents.discardStrategy !== "DiscardChoose" ||
    discard.contents.discardDestination !== "ToDiscardPile" ||
    source?.tag !== "TreacherySource" ||
    typeof source.contents !== "string" ||
    !source.contents ||
    ask?.tag !== "Ask" ||
    !Array.isArray(ask.contents) ||
    ask.contents.length !== 2 ||
    ask.contents[0] !== f.actor.playerId ||
    ask.contents[1]?.tag !== "ChooseOne" ||
    !Array.isArray(ask.contents[1].choices) ||
    !ask.contents[1].choices.length
  )
    return;
  const valid = ask.contents[1].choices.every((c) => {
    if (!object(c) || c.disabled === true) return false;
    const a = f.controlled.find(
        (a) => a.id === c.target?.contents && a.controller === f.actor.id,
      ),
      definition = a && definitions.get(code(a));
    if (
      c.tag !== "TargetLabel" ||
      c.target?.tag !== "AssetTarget" ||
      !definition ||
      definition.type_code !== "asset" ||
      !/\bItem\b/.test(definition.traits || "") ||
      definition.subtype_code === "story" ||
      definition.encounter_code ||
      !Array.isArray(c.messages) ||
      c.messages.length !== 1
    )
      return false;
    const m = c.messages[0];
    return (
      m?.tag === "Discard" &&
      Array.isArray(m.contents) &&
      m.contents.length === 3 &&
      m.contents[0] === f.actor.id &&
      m.contents[1]?.tag === "TreacherySource" &&
      m.contents[1].contents === source.contents &&
      m.contents[2]?.tag === "AssetTarget" &&
      m.contents[2].contents === a.id
    );
  });
  return valid ? item : undefined;
}

function skillSelection(f, choices, definitions, memory) {
  const prior = memory.lastAbility;
  if (
    !prior ||
    prior.witness?.gameId !== f.game.id ||
    prior.witness?.actorId !== f.actor.id
  )
    return undefined;
  const expected = {
    tag: "AbilitySource",
    contents: [prior.source, prior.index],
  };
  const candidates = choices
    .filter((c) =>
      ["SkillLabel", "SkillLabelWithLabel", "Label"].includes(c.tag),
    )
    .flatMap((c) => {
      const test = messages(c)
        .flatMap((m) => {
          if (
            [
              "BeginSkillTestWithPreMessages'",
              "BeginSkillTestWithPreMessages'_",
              "BeginSkillTestWithPreMessages_",
            ].includes(m.tag) &&
            Array.isArray(m.contents) &&
            m.contents.length === 2 &&
            Array.isArray(m.contents[0])
          )
            return [m.contents[1]];
          if (m.tag === "BeginSkillTest" && object(m.contents))
            return [m.contents];
          return [];
        })
        .find(
          (t) =>
            t?.investigator === f.actor.id &&
            typeof t.id === "string" &&
            t.id &&
            sourceEqual(t.source, expected),
        );
      if (!test) return [];
      if (
        ["87005b", "87038"].includes(prior.cardCode) &&
        (test.target?.tag !== "InvestigatorTarget" ||
          test.target.contents !== f.actor.id)
      )
        return [];
      if (
        ["87033", "87034"].includes(prior.cardCode) &&
        (test.target?.tag !== "EnemyTarget" ||
          !f.enemies.some(
            (e) =>
              e.id === test.target.contents &&
              ["87037", "87037a"].includes(code(e)),
          ))
      )
        return [];
      const skill =
        test.type?.tag === "SkillSkillTest"
          ? test.type.contents
          : test.skills?.[0];
      const declared = c.raw?.skillType || c.skill;
      if (
        typeof skill !== "string" ||
        !/^Skill(Combat|Intellect|Willpower|Agility)$/.test(skill) ||
        (declared && declared !== skill)
      )
        return [];
      const name = skill.replace(/^Skill/, "").toLowerCase();
      const actorDefinition = definitions.get(code(f.actor));
      const value = Number.isFinite(f.actor[name])
        ? f.actor[name]
        : Number(actorDefinition?.[`skill_${name}`] || 0);
      return [{ choice: c, value }];
    });
  return candidates.sort(
    (a, b) => b.value - a.value || a.choice.answerIndex - b.choice.answerIndex,
  )[0]?.choice;
}

function scientistMovement(f, question, choices, memory) {
  if (question.isWindow) {
    const reaction = byAbility(choices, "87004", 1);
    if (
      reaction &&
      f.assets.some((a) => scientists[f.group]?.includes(code(a)))
    )
      return reaction;
  }
  const prior = memory.lastAbility;
  if (
    prior?.cardCode !== "87004" ||
    prior.index !== 1 ||
    prior.witness?.gameId !== f.game.id
  )
    return undefined;
  if (
    question.source &&
    !sourceEqual(question.source, {
      tag: "AbilitySource",
      contents: [prior.source, 1],
    })
  )
    return undefined;
  if (!["ChooseSome", "ChooseSome1", "ChooseOneAtATime"].includes(question.tag))
    return undefined;
  const scientist = choices.find(
    (c) =>
      target(c)?.tag === "AssetTarget" &&
      f.assets.some(
        (a) =>
          a.id === targetId(c) &&
          [
            "87012",
            "87013",
            "87021",
            "87022",
            "87030",
            "87031",
            "87014",
            "87023",
          ].includes(code(a)) &&
          locationId(a) !== f.hereId,
      ),
  );
  return (
    scientist ||
    choices.find(
      (c) => c.tag === "Done" && /doneMovingScientists/i.test(text(c)),
    )
  );
}

function moveToward(f, choices, destinationIds, memory) {
  const desired = new Set(
    destinationIds.filter((id) => typeof id === "string"),
  );
  const moves = choices.filter((c) => ability(c)?.index === 104);
  const idOf = (c) =>
    references(ability(c)?.source).find((r) => r.tag === "LocationSource")?.id;
  const direct = moves.find((c) => desired.has(idOf(c)));
  if (direct) return direct;
  const distances = new Map([...desired].map((id) => [id, 0])),
    queue = [...desired];
  while (queue.length) {
    const id = queue.shift(),
      location = f.locations.find((l) => l.id === id);
    for (const neighbour of rows(location?.connectedLocations))
      if (typeof neighbour === "string" && !distances.has(neighbour)) {
        distances.set(neighbour, distances.get(id) + 1);
        queue.push(neighbour);
      }
  }
  const useful = moves
    .filter(
      (c) =>
        distances.has(idOf(c)) &&
        distances.get(idOf(c)) < (distances.get(f.hereId) ?? Infinity),
    )
    .sort(
      (a, b) =>
        distances.get(idOf(a)) - distances.get(idOf(b)) ||
        a.answerIndex - b.answerIndex,
    )[0];
  if (useful) return useful;
  // Facedown cardCode/name/shroud is never inspected. Explore physical offered
  // destinations in least-visited order, then stop at the runner's finite bound.
  return moves
    .filter(
      (c) => f.locations.find((l) => l.id === idOf(c))?.revealed === false,
    )
    .sort(
      (a, b) =>
        (memory.locationVisits?.[idOf(a)] || 0) -
          (memory.locationVisits?.[idOf(b)] || 0) ||
        a.answerIndex - b.answerIndex,
    )[0];
}

function printedLegacyGoal(snapshot, f) {
  const atCode = (wanted) =>
    f.locations.find((l) => l.revealed === true && code(l) === wanted)?.id;
  const assetAt = (wanted) =>
    locationId(f.assets.find((a) => code(a) === wanted));
  if (!f.stories.some((s) => code(s) === legacyCodes[f.group]))
    return undefined;
  if (f.group === "Past") {
    if (!remembered(snapshot, "ThomasAndMaryHaveMet")) return atCode("87010");
    if (!remembered(snapshot, "ThomasAndMaryAreInspiredByNikolaTesla"))
      return assetAt("87014");
    if (!remembered(snapshot, "FundingForAnObservatoryHasBegun"))
      return atCode("87010");
  } else if (f.group === "Present") {
    if (!remembered(snapshot, "TheObservatoryIsBuilt")) return atCode("87019");
    if (!remembered(snapshot, "TeleportationResearchHasBegun")) {
      const ezra = assetAt("87023");
      return ezra && ezra !== f.hereId ? ezra : atCode("87019");
    }
    if (!remembered(snapshot, "CorriganIndustriesHasBeenFounded"))
      return atCode("87020");
  } else {
    const machine = f.assets.find((a) => code(a) === "87032");
    if (!machine) return atCode("87029");
    if (!remembered(snapshot, "ThomasAndMaryHaveMadeAHistoricDiscovery"))
      return atCode("87028");
    if (!remembered(snapshot, "ThomasAndMaryHaveWonANobelPrize"))
      return atCode("87025");
  }
}

function sharedClueReserve(f) {
  const rival = f.enemies.find((e) => ["87037", "87037a"].includes(code(e)));
  const redeem = f.stories.some(
    (s) => s.flipped === true && code(s) === "87034",
  );
  const bitter = f.stories.some(
    (s) => s.flipped === true && code(s) === "87033",
  );
  if (!redeem && !bitter) return 0;
  const marks = rival ? token(rival, redeem ? "Redemption" : "Target") : 0;
  return Number.isSafeInteger(marks) ? 3 * Math.max(0, 3 - marks) : undefined;
}

function mundane(f, question, choices, definitions, memory) {
  if (f.game.inSetup === true) {
    const keep = findText(
      choices,
      /doneWithMulligan|Done with mulligan|Keep (?:the |my |your |this )?(?:opening )?hand/i,
    );
    if (keep)
      return result(
        keep,
        "Keep the genuine native opening hand; no draw is replaced.",
      );
  }
  if (
    question.tag === "PlayerWindowChooseOne" &&
    question.isPlayerWindow === true &&
    f.game.phase === "InvestigationPhase" &&
    f.game.activeInvestigatorId === f.actor.id &&
    f.actions === 0 &&
    f.actor.endedTurn === false &&
    !f.game.skillTest
  ) {
    const ends = choices.filter(
      (c) =>
        c.tag === "EndTurnButton" &&
        c.raw?.investigatorId === f.actor.id &&
        Array.isArray(c.raw.messages) &&
        c.raw.messages.length === 1 &&
        c.raw.messages[0]?.tag === "ChooseEndTurn" &&
        c.raw.messages[0].contents === f.actor.id,
    );
    if (ends.length === 1)
      return result(
        ends[0],
        "End the actual owning investigator's zero-action native turn through its exact offered button; the remaining fast ability is optional.",
      );
  }
  const investigated = successfulInvestigation(f, question, choices, memory);
  if (investigated)
    return result(
      investigated,
      "Resolve the directly offered successful investigation bound to this owned physical source, current location and exact native result margin.",
    );
  const combated = successfulCombat(f, question, choices, memory);
  if (combated)
    return result(
      combated,
      "Resolve the directly offered successful native combat result for this exact owned source, live non-Rival fight or evade target and success margin.",
    );
  const actionPenalty = tearInTimeActionLoss(f, question, choices);
  if (actionPenalty)
    return result(
      actionPenalty,
      "Pay the actual offered one-action penalty from this owned failed treachery test instead of assigning horror; native action loss remains authoritative.",
    );
  const scientistPenalty =
    elderThingTarget(f, question, choices) ||
    scientistElderThingPenalty(f, question, choices);
  if (scientistPenalty)
    return result(
      scientistPenalty,
      "Choose the actual owned failed ElderThing target/effect, preserving local scenario scientists through the offered controlled ally and public remaining health/sanity; native damage and abduction remain authoritative.",
    );
  const disappearingItem = vanishingHistoryItem(
    f,
    question,
    choices,
    definitions,
  );
  if (disappearingItem)
    return result(
      disappearingItem,
      "Resolve the printed Vanishing History item penalty through the exact offered own non-story Item discard follow-up; native discard remains authoritative.",
    );
  const apply = choices.find(
    (c) =>
      c.tag === "SkillTestApplyResultsButton" &&
      f.game.skillTest?.investigator === f.actor.id,
  );
  if (apply)
    return result(
      apply,
      "Apply the actual native skill-test result without editing tokens or RNG.",
    );
  const start = choices.find(
    (c) =>
      c.tag === "StartSkillTestButton" && c.raw?.investigatorId === f.actor.id,
  );
  if (start && f.game.skillTest?.investigator === f.actor.id) {
    const test = f.game.skillTest,
      skill = String(test.skills?.[0] || "")
        .replace(/^Skill/, "")
        .toLowerCase();
    const committed = rows(test.committedCards).flatMap((v) =>
      Array.isArray(v) ? v.map(unwrap) : [unwrap(v)],
    );
    const ids = new Set(committed.map((c) => c?.id));
    const candidates = choices
      .map((c) => ({ choice: c, card: offeredCommitCard(f, question, c) }))
      .filter((r) => r.card && !ids.has(r.card.id))
      .map((r) => ({ ...r, definition: definitions.get(code(r.card)) }))
      .filter(
        (r) =>
          ["intellect", "combat", "willpower", "agility"].includes(skill) &&
          r.definition?.type_code === "skill" &&
          Number(r.definition[`skill_${skill}`] || 0) +
            Number(r.definition.skill_wild || 0) >
            0,
      )
      .sort(
        (a, b) =>
          Number(b.definition[`skill_${skill}`] || 0) +
          Number(b.definition.skill_wild || 0) -
          Number(a.definition[`skill_${skill}`] || 0) -
          Number(a.definition.skill_wild || 0),
      );
    const margin =
      Number.isFinite(test.modifiedSkillValue) &&
      Number.isFinite(test.modifiedDifficulty)
        ? test.modifiedSkillValue - test.modifiedDifficulty
        : undefined;
    if (
      candidates.length &&
      committed.length < 2 &&
      (margin === undefined || margin < 4)
    )
      return result(
        candidates[0].choice,
        "Commit an actual offered useful skill from the own visible hand to this exact native test, at most two cards.",
      );
    return result(
      start,
      "Start the real native test after bounded hand commitments.",
    );
  }
  const selectedSkill = skillSelection(f, choices, definitions, memory);
  if (selectedSkill)
    return result(
      selectedSkill,
      "Choose the printed skill in the exact offered test for the preceding owned physical ability.",
    );
  const assignments = choices.filter(
    (c) =>
      c.tag === "ComponentLabel" &&
      ["DamageToken", "HorrorToken"].includes(c.raw?.component?.tokenType) &&
      ((c.raw.component.tag === "InvestigatorComponent" &&
        c.raw.component.investigatorId === f.actor.id) ||
        (c.raw.component.tag === "AssetComponent" &&
          f.controlled.some((a) => a.id === c.raw.component.assetId))),
  );
  if (assignments.length)
    return result(
      assignments.find((c) => c.raw.component.tag === "AssetComponent") ||
        assignments[0],
      "Assign the offered native damage/horror to controlled soak, preserving local scientists.",
    );
  if (question.tag === "Read")
    return result(
      findText(choices, /^(Continue|Proceed|Finish|Done)\b/i) ||
        (choices.length === 1 ? choices[0] : undefined),
      "Continue the genuine native printed story or resolution.",
    );
  const waiting = findText(choices, /Waiting (for|to)|Waiting.*group/i);
  if (waiting && choices.length === 1)
    return result(
      waiting,
      "Answer the actual native wait; no coordinator operation is submitted.",
    );
  if (f.game.inSetup === true && choices.length === 1 && !ability(choices[0]))
    return result(
      choices[0],
      "Resolve the sole enabled native setup response.",
    );
}

/** A returned choice is always an actual enabled own question member. Unknown
 * prompts remain undefined and must be retained as false partial checkpoints. */
export function selectMachinationsChoice({
  snapshot,
  question,
  cards,
  memory = {},
}) {
  const f = frame(snapshot, memory);
  if (!ownedFrame(f, snapshot, question, memory) || question.kind !== "choices")
    return undefined;
  const choices = enabled(question).filter((c) => boundAbility(f, c)),
    definitions = catalog(cards);
  if (!choices.length) return undefined;
  const movement = scientistMovement(f, question, choices, memory);
  if (movement)
    return result(
      movement,
      "Use the actual act reaction and move only an offered local scientist to this physical destination.",
    );
  const ordinary = mundane(f, question, choices, definitions, memory);
  if (ordinary) return ordinary;
  const forced = choices.find((c) =>
    /^(ForcedAbility|SilentForcedAbility|Objective)$/.test(
      ability(c)?.type?.tag || "",
    ),
  );
  if (forced && !question.isPlayerWindow)
    return result(
      forced,
      "Resolve the actual offered physical forced objective; native criteria remain authoritative.",
    );

  if (!question.isPlayerWindow) {
    const prior = memory.lastAbility;
    if (
      prior?.witness?.gameId === f.game.id &&
      prior.witness.actorId === f.actor.id
    ) {
      if (prior.cardCode === "87005b" && prior.index === 2) {
        const rescued = choices.find(
          (c) =>
            c.tag === "CardLabel" &&
            scientists[f.group].includes(code(c.cardCode || c.raw?.cardCode)),
        );
        if (rescued)
          return result(
            rescued,
            "Rescue an actually offered local Thomas/Mary after the real successful Tindalos test; no set-aside identities are read.",
          );
      }
      if (prior.cardCode === "87039" && prior.index === 1) {
        const gang = choices.find(
          (c) =>
            target(c)?.tag === "EnemyTarget" &&
            f.enemies.some((e) => e.id === targetId(c) && code(e) === "87041"),
        );
        const search = findText(
          choices,
          /mobTroubles\.search|search.*Sheldon/i,
        );
        if (gang || search)
          return result(
            gang || search,
            "Use the actual Mob removal/search offer; the native encounter deck remains sealed.",
          );
      }
      if (prior.cardCode === "87033" && prior.index === 2) {
        const expected = { tag: "AbilitySource", contents: [prior.source, 2] };
        const initiatedFight = choices.find((c) =>
          messages(c).some((m) => {
            if (m.tag !== "ChooseFightEnemy_" || !object(m.contents))
              return false;
            const offered = m.contents,
              matcher = offered.chooseFightEnemyMatcher;
            return (
              offered.chooseFightInvestigator === f.actor.id &&
              sourceEqual(offered.chooseFightSource, expected) &&
              typeof offered.chooseFightSkillTest === "string" &&
              offered.chooseFightSkillTest &&
              matcher?.tag === "EnemyWithId" &&
              f.enemies.some(
                (e) =>
                  e.id === matcher.contents &&
                  ["87037", "87037a"].includes(code(e)),
              )
            );
          }),
        );
        const targetFight = choices.find(
          (c) =>
            /^FightLabel/.test(c.tag) &&
            f.enemies.some(
              (e) =>
                e.id === c.raw?.enemyId &&
                ["87037", "87037a"].includes(code(e)),
            ),
        );
        if (initiatedFight || targetFight)
          return result(
            initiatedFight || targetFight,
            "Resolve the actual offered story fight against the exact physical Rival; native success, not damage, places its target token.",
          );
      }
      if (prior.cardCode === "87014" && prior.index === 1) {
        const gain =
          findText(choices, /gainClues|gain.*clue/i) ||
          findText(choices, /gainResources|gain.*resources/i) ||
          findText(choices, /drawCards|draw.*cards/i);
        if (gain)
          return result(
            gain,
            "Accept an actually offered unused printed Tesla benefit, preferring needed clues.",
          );
      }
      if (memory.lastCardPlayed === "03191") {
        const heal = findText(choices, /heal2Horror|heal 2 horror/i);
        if (heal && token(f.actor, "Horror") > 0)
          return result(
            heal,
            "Resolve the actually played Logical Reasoning's printed horror healing.",
          );
      }
    }
    const optional = choices.find(
      (c) =>
        c.tag === "SkipTriggersButton" ||
        (c.tag === "Label" && c.raw?.label === "$label.skip"),
    );
    if (
      optional &&
      (question.isWindow || optional.raw?.label === "$label.skip")
    )
      return result(
        optional,
        "Decline the remaining real optional effects after required scientist movement.",
      );
    return undefined;
  }

  const ownScientists = f.assets.filter((a) =>
    scientists[f.group].includes(code(a)),
  );
  const atTindalos = f.here?.revealed === true && code(f.here) === "87005b";
  const rescue = byAbility(choices, "87005b", 2);
  if (atTindalos && ownScientists.length < 2 && rescue && f.actions > 0)
    return result(
      rescue,
      "Rescue the actually offered missing local scientist at Tindalos before leaving; combat/agility test stays native.",
    );

  const engaged = f.enemies.filter(
    (e) =>
      e.exhausted !== true &&
      (rows(f.actor.engagedEnemies).includes(e.id) ||
        (e.placement?.tag === "InThreatArea" &&
          e.placement.contents === f.actor.id)),
  );
  const safeStory = choices.find(
    (c) =>
      abilityCode(c) === "87042" &&
      ability(c)?.index === 1 &&
      safeFromAoo(ability(c)),
  );
  if (engaged.some((e) => code(e) === "87043") && f.clues >= 1 && safeStory)
    return result(
      safeStory,
      "Spend one real clue on the printed attack-safe Abomination test against the public local boss.",
    );
  if (engaged.length) {
    const evade = choices.find((c) =>
      engaged.some(
        (e) =>
          ["87037", "87037a"].includes(code(e)) &&
          ((/^EvadeLabel/.test(c.tag) && e.id === c.raw?.enemyId) ||
            nativeEnemyAction(f, c, e, 101)),
      ),
    );
    const parley = byAbility(choices, "87034", 2);
    if (
      parley &&
      f.clues >= sharedClueReserve(f) &&
      sharedClueReserve(f) >= 3 &&
      engaged.some((e) => ["87037", "87037a"].includes(code(e)))
    )
      return result(
        parley,
        "Use the actual no-attack-of-opportunity parley against Edwin while retaining the three-clue printed payment.",
      );
    if (evade)
      return result(
        evade,
        "Evade the actual local Rival without killing the scientist-recovery objective.",
      );
    const localRival = f.enemies.some(
      (e) =>
        ["87037", "87037a"].includes(code(e)) &&
        (locationId(e) === f.hereId ||
          (e.placement?.tag === "InThreatArea" &&
            e.placement.contents === f.actor.id)),
    );
    const machete = byAbility(choices, "01020", 1);
    if (
      engaged.length === 1 &&
      !localRival &&
      machete?.raw?.investigatorId === f.actor.id &&
      ability(machete).source?.tag === "AssetSource" &&
      f.controlled.some(
        (a) => a.id === ability(machete).source.contents && code(a) === "01020",
      ) &&
      ability(machete).type?.tag === "ActionAbility" &&
      ability(machete).type.actions?.tag === "SingleAction" &&
      ability(machete).type.actions.contents === "Fight" &&
      f.actions > 0
    )
      return result(
        machete,
        "Use the actually offered owned Machete against the sole ready engaged non-Rival enemy; native fight and extra damage remain authoritative.",
      );
    const fight = choices.find((c) =>
      engaged.some(
        (e) =>
          !["87037", "87037a"].includes(code(e)) &&
          ((/^FightLabel/.test(c.tag) && e.id === c.raw?.enemyId) ||
            nativeEnemyAction(f, c, e, 100)),
      ),
    );
    if (fight)
      return result(
        fight,
        "Fight an actual engaged non-Rival enemy through the native offered attack.",
      );
    return undefined;
  }

  const colleague = f.assets.find((a) => code(a) === "87037b"),
    bringColleague = byAbility(choices, "87035", 2);
  if (
    bringColleague?.raw?.investigatorId === f.actor.id &&
    ability(bringColleague).source?.tag === "StorySource" &&
    ability(bringColleague).type?.tag === "ActionAbility" &&
    ability(bringColleague).type.cost?.tag === "ActionCost" &&
    ability(bringColleague).type.cost.contents === 1 &&
    f.actions >= 1 &&
    f.here?.revealed === true &&
    code(f.here) ===
      { Past: "87010", Present: "87019", Future: "87028" }[f.group] &&
    ownScientists.length === 2 &&
    ownScientists.every((a) => locationId(a) === f.hereId) &&
    colleague &&
    (locationId(colleague) !== f.hereId || colleague.exhausted === true)
  )
    return result(
      bringColleague,
      "Bring and ready the actual live local colleague through the owned offered one-action story ability at the prepared revealed university, after ready enemies are handled.",
    );

  const legacy = legacyCodes[f.group];
  for (const index of [4, 1, 2, 3]) {
    const offered = byAbility(choices, legacy, index);
    if (!offered) continue;
    const minimum =
      index === 2 ? { Past: 2, Present: 4, Future: 8 }[f.group] : 0;
    if (minimum && !(f.clues >= minimum)) continue;
    return result(
      offered,
      "Complete this era's actual offered Noble Legacy ability with its printed local clue reserve.",
    );
  }
  const objective = choices.find(
    (c) =>
      ["87033", "87034", "87035", "87038", "87039", "87042"].includes(
        abilityCode(c),
      ) &&
      ((["87033", "87034"].includes(abilityCode(c)) &&
        ability(c).index === 3) ||
        (abilityCode(c) === "87035" && ability(c).index === 5) ||
        (["87038", "87039", "87042"].includes(abilityCode(c)) &&
          ability(c).index === 2)),
  );
  if (objective)
    return result(
      objective,
      "Resolve the genuinely offered completed shared-story objective; do not synthesize global progress.",
    );
  const plot = byAbility(choices, "87039", 1);
  if (plot && f.clues >= 1)
    return result(
      plot,
      "Remove one actual Sheldon Gang through the printed debt-paid clue action.",
    );
  const anomaly = byAbility(choices, "87038", 1);
  if (anomaly && token(f.here, "Horror") > 0)
    return result(
      anomaly,
      "Clear actual public local anomalies through the printed native test; payment and success remain native.",
    );
  const redeem = byAbility(choices, "87034", 2),
    rival = byAbility(choices, "87033", 2);
  if (
    sharedClueReserve(f) >= 3 &&
    f.clues >= sharedClueReserve(f) &&
    (redeem || rival)
  )
    return result(
      redeem || rival,
      "Take the actual shared Rival/redemption test only with the printed three-player clue payment available.",
    );
  const abomination = byAbility(choices, "87042", 1);
  if (abomination && f.clues >= 1)
    return result(
      abomination,
      "Use the offered clue-powered Abomination test; native success determines its damage.",
    );
  const sadie = byAbility(choices, "87040", 1);
  if (sadie && f.resources >= 3)
    return result(
      sadie,
      "Parley with the actual local Sadie while preserving her printed three-resource debt payment.",
    );
  // The Rival must follow the scientists' public objective destination. The
  // native two-action bring can move an actual Edwin from another era without
  // exposing that era's play area or reading authoritative replicas.
  const markedHere = f.enemies.some(
    (e) => ["87037", "87037a"].includes(code(e)) && locationId(e) === f.hereId,
  );
  const bring =
    byAbility(choices, "87034", 1) || byAbility(choices, "87033", 1);
  const preparedForRival =
    f.here?.revealed === true &&
    (code(f.here) ===
      { Past: "87010", Present: "87019", Future: "87028" }[f.group] ||
      (code(f.here) === "87005b" &&
        f.enemies.some((e) => token(e, "Target") >= 3)));
  const markedRival = f.enemies.some(
    (e) =>
      ["87037", "87037a"].includes(code(e)) &&
      (token(e, "Redemption") >= 3 || token(e, "Target") >= 3),
  );
  if (
    bring &&
    preparedForRival &&
    !markedHere &&
    ownScientists.length === 2 &&
    (markedRival ||
      (sharedClueReserve(f) >= 3 && f.clues >= sharedClueReserve(f))) &&
    f.actions >= 2
  )
    return result(
      bring,
      "Use the actually offered two-action bring for the physical Rival at this own prepared scientist location.",
    );

  const play = (wanted) =>
    choices.find(
      (c) =>
        code(handChoice(f, c)) === wanted &&
        containsMessage(c, "InitiatePlayCardWithWindows"),
    );
  for (const wanted of ["01030", "01033", "01016", "01006", "01020"]) {
    const offered = play(wanted);
    if (offered && !f.controlled.some((a) => code(a) === wanted))
      return result(
        offered,
        "Play actually offered useful own-hand clue/combat equipment; native resource and slot limits remain authoritative.",
      );
  }
  if (token(f.actor, "Horror") >= 3 && play("03191"))
    return result(
      play("03191"),
      "Play the own-hand printed horror healing before further exploration.",
    );
  for (const wanted of ["87014", "87013", "87022", "87031"]) {
    const offered = byAbility(choices, wanted, 1);
    if (offered)
      return result(
        offered,
        "Use the actual offered local scientist's printed clue/support ability.",
      );
  }

  // Scientists at a different revealed local place must be collected before a
  // legacy route. Their locations are physical public entities, not set-aside.
  const stranded = ownScientists
    .map(locationId)
    .filter((id) => id && id !== f.hereId);
  const legacyReserve =
    f.group === "Future" &&
    !remembered(snapshot, "ThomasAndMaryHaveMadeAHistoricDiscovery")
      ? 8
      : 4;
  const needClues =
    f.clues < Math.max(legacyReserve, sharedClueReserve(f) ?? Infinity);
  const cluesHere = token(f.here, "Clue");
  if (needClues && cluesHere > 0 && f.here?.revealed === true) {
    const flashlight = byAbility(choices, "01087", 1),
      investigate = choices.find((c) => ability(c)?.index === 103);
    if (flashlight || investigate)
      return result(
        flashlight || investigate,
        "Investigate this actually revealed clue-bearing location to fund printed objectives.",
      );
  }
  const destinations = stranded.length
    ? stranded
    : [printedLegacyGoal(snapshot, f)].filter(Boolean);
  if (!destinations.length) {
    const visibleAnomalies =
      choices.some((c) => abilityCode(c) === "87038") ||
      f.stories.some((s) => s.flipped === true && code(s) === "87038");
    if (visibleAnomalies)
      destinations.push(
        ...f.locations
          .filter((l) => l.revealed === true && token(l, "Horror") > 0)
          .map((l) => l.id),
      );
    const localSadie = f.enemies.find((e) => code(e) === "87040");
    if (localSadie && !remembered(snapshot, "TheDebtHasBeenPaid"))
      destinations.push(locationId(localSadie));
    const edwin = f.enemies.find((e) => ["87037", "87037a"].includes(code(e)));
    if (edwin) {
      const fullyMarked = token(edwin, "Target") >= 3,
        redeemed = token(edwin, "Redemption") >= 3;
      if (fullyMarked)
        destinations.push(
          f.locations.find((l) => l.revealed === true && code(l) === "87005b")
            ?.id,
        );
      else if (redeemed)
        destinations.push(
          f.locations.find(
            (l) =>
              l.revealed === true &&
              code(l) ===
                { Past: "87010", Present: "87019", Future: "87028" }[f.group],
          )?.id,
        );
      else destinations.push(locationId(edwin));
    }
    const boss = f.enemies.find((e) => code(e) === "87043");
    if (boss && f.clues >= 1) destinations.push(locationId(boss));
  }
  if (!destinations.length && needClues)
    destinations.push(
      ...f.locations
        .filter((l) => l.revealed === true && token(l, "Clue") > 0)
        .map((l) => l.id),
    );
  const move = moveToward(f, choices, destinations, memory);
  if (move)
    return result(
      move,
      "Move through an actually offered public physical route, carrying scientists via the separate native reaction.",
    );
  const resources = choices.find(
    (c) =>
      c.tag === "ComponentLabel" &&
      c.raw?.component?.tag === "InvestigatorComponent" &&
      c.raw.component.investigatorId === f.actor.id &&
      c.raw.component.tokenType === "ResourceToken",
  );
  if (resources && f.resources < 2 && f.actions > 0)
    return result(
      resources,
      "Take the actual native resource action to fund printed legacy costs.",
    );
  const end = choices.find(
    (c) => c.tag === "EndTurnButton" && c.raw?.investigatorId === f.actor.id,
  );
  if (end)
    return result(
      end,
      "End this own real turn when no audited local objective is presently actionable; eras retain independent rounds.",
    );
  return undefined;
}

/** Commit memory only after a successful actual answer. Inputs stay immutable. */
export function observeMachinationsChoice({
  snapshot,
  question,
  selection,
  memory = {},
}) {
  const f = frame(snapshot, memory);
  if (
    !ownedFrame(f, snapshot, question, memory) ||
    !enabled(question).includes(selection?.choice) ||
    !boundAbility(f, selection.choice)
  )
    return { ...memory };
  const c = selection.choice,
    a = ability(c),
    next = {
      ...memory,
      gameId: f.game.id,
      actorId: f.actor.id,
      playerId: snapshot.playerId,
    };
  if (a) {
    next.lastAbility = {
      cardCode: abilityCode(c),
      index: a.index,
      source: a.source,
      witness: choiceWitness(snapshot, question, c),
    };
    if (a.index === 104) {
      const id = references(a.source).find(
        (r) => r.tag === "LocationSource",
      )?.id;
      if (id)
        next.locationVisits = {
          ...memory.locationVisits,
          [id]: (memory.locationVisits?.[id] || 0) + 1,
        };
    }
  }
  const played = handChoice(f, c);
  if (played && containsMessage(c, "InitiatePlayCardWithWindows"))
    next.lastCardPlayed = code(played);
  return next;
}
