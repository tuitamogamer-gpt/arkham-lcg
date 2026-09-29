import { card, code } from "./data";
import { recordDiscoveries } from "./knowledge";
import type {
  Action,
  Effect,
  EventChange,
  GameState,
  VisibleEvent,
} from "./types";

// Pacing preference. "detailed" pauses on every recorded event, "smart" only
// on notable and critical ones, "fast" only on critical ones. Every event is
// recorded in the history regardless of the tempo.
export type Tempo = "detailed" | "smart" | "fast";
let tempo: Tempo = "detailed";
export function setTempo(value: Tempo) {
  tempo = value;
}
export function currentTempo() {
  return tempo;
}
export type Importance = "minor" | "notable" | "critical";
export function eventImportance(
  e: Pick<VisibleEvent, "title" | "story" | "encounter" | "changes" | "card">,
): Importance {
  if (
    e.story ||
    e.title === "Scenario resolution" ||
    e.title === "The agenda advances" ||
    e.title === "The story advances" ||
    /^(Investigator defeated|Deck exhausted|Investigator resigns)/.test(e.title) ||
    e.changes.some((c) => c.after === "defeated" || c.after === "resigned")
  )
    return "critical";
  if (e.encounter?.stage === "revealed") return "critical";
  if (/^(Enemy attack|Attack of opportunity|Retaliation)$/.test(e.title))
    return "critical";
  if (e.encounter?.stage === "resolving")
    return e.card && card(e.card)?.type_code === "enemy" ? "notable" : "minor";
  if (
    /^(Damage and horror resolved|Cards drawn and horror resolved|Fire damage|Fire spreads|Fire burns the enemies|Hunter moves|Doom placed|Investigator defeated)$/.test(
      e.title,
    ) ||
    /^Mythos · Round/.test(e.title)
  )
    return "notable";
  if (
    e.title === "Enemy damaged" &&
    e.changes.some((c) =>
      ["Victory display", "Encounter discard", "Leaves play"].includes(c.after),
    )
  )
    return "notable";
  return "minor";
}
export function pausesAt(importance: Importance) {
  return (
    tempo === "detailed" ||
    importance === "critical" ||
    (tempo === "smart" && importance === "notable")
  );
}

// Only public information belongs in the chronicle. Never store future draw order.
export function visibleSnapshot(s: GameState) {
  return structuredClone({
    round: s.round,
    phase: s.phase,
    act: s.act,
    agenda: s.agenda,
    doom: s.doom,
    status: s.status,
    actor: s.player.code,
    party: [s.player, ...s.companions].map((p) => ({
      code: p.code,
      location: p.location,
      resources: p.resources,
      clues: p.clues,
      damage: p.damage,
      horror: p.horror,
      actions: p.actions,
      status: p.status,
      turnEnded: p.turnEnded,
      hand: p.hand,
      discard: p.discard,
      assets: p.assets,
      threats: p.threats,
      xp: p.xp,
      physicalTrauma: p.physicalTrauma,
      mentalTrauma: p.mentalTrauma,
    })),
    enemies: s.enemies,
    locations: s.locations,
    logId: s.log.at(-1)?.id || 0,
    limbo: s.limbo || [],
    encounterDiscard: s.encounterDiscard,
    victory: s.victory,
  });
}
export type VisibleSnapshot = ReturnType<typeof visibleSnapshot>;
const name = (c: string) => card(c)?.name || c;
const change = (
  label: string,
  before: unknown,
  after: unknown,
): EventChange => ({ label, before: String(before), after: String(after) });
export function visibleChanges(
  before: VisibleSnapshot,
  s: GameState,
): EventChange[] {
  const after = visibleSnapshot(s),
    changes: EventChange[] = [];
  for (const [field, label] of [
    ["round", "Round"],
    ["act", "Act"],
    ["agenda", "Agenda"],
    ["doom", "Doom"],
  ] as const)
    if (before[field] !== after[field])
      changes.push(change(label, before[field], after[field]));
  if (before.phase !== after.phase)
    changes.push(change("Phase", before.phase, after.phase));
  for (const p of after.party) {
    const prev = before.party.find((v) => v.code === p.code)!;
    for (const [field, label] of [
      ["resources", "Resources"],
      ["clues", "Clues"],
      ["damage", "Damage"],
      ["horror", "Horror"],
      ["actions", "Actions"],
      ["xp", "Experience"],
      ["physicalTrauma", "Physical trauma"],
      ["mentalTrauma", "Mental trauma"],
    ] as const)
      if (prev[field] !== p[field])
        changes.push(
          change(`${name(p.code)} · ${label}`, prev[field], p[field]),
        );
    if (prev.location !== p.location)
      changes.push(change(name(p.code), name(prev.location), name(p.location)));
    if (prev.status !== p.status)
      changes.push(change(name(p.code), prev.status, p.status));
    if (!prev.turnEnded && p.turnEnded)
      changes.push(change(`${name(p.code)} · Turn`, "In progress", "Finished"));
    for (const c of p.hand.filter((c) => !prev.hand.some((v) => v.id === c.id)))
      changes.push(
        change(
          `${name(p.code)} · ${name(c.code)}`,
          prev.discard.some((v) => v.id === c.id) ? "Discard pile" : "—",
          "In hand",
        ),
      );
    for (const c of prev.hand.filter((c) => !p.hand.some((v) => v.id === c.id)))
      changes.push(
        change(
          `${name(p.code)} · ${name(c.code)}`,
          "In hand",
          p.assets.some((a) => a.id === c.id)
            ? "In play"
            : p.discard.some((v) => v.id === c.id)
              ? "Discarded"
              : s.limbo?.some((v) => v.id === c.id)
                ? "Resolving (limbo)"
                : "Leaves hand",
        ),
      );
    for (const c of p.threats.filter((c) => !prev.threats.includes(c)))
      changes.push(
        change(`${name(p.code)} · ${name(c)}`, "—", "In threat area"),
      );
    for (const c of prev.threats.filter((c) => !p.threats.includes(c)))
      changes.push(
        change(`${name(p.code)} · ${name(c)}`, "In threat area", "Removed"),
      );
    for (const a of p.assets) {
      const old = prev.assets.find((v) => v.id === a.id);
      if (!old) {
        if (!prev.hand.some((c) => c.id === a.id))
          changes.push(
            change(`${name(p.code)} · ${name(a.code)}`, "—", "In play"),
          );
        continue;
      }
      for (const [field, label] of [
        ["damage", "Damage"],
        ["horror", "Horror"],
        ["uses", "Uses"],
      ] as const)
        if (old[field] !== a[field])
          changes.push(
            change(
              `${name(p.code)} · ${name(a.code)} · ${label}`,
              old[field],
              a[field],
            ),
          );
      if (old.exhausted !== a.exhausted)
        changes.push(
          change(
            `${name(p.code)} · ${name(a.code)}`,
            old.exhausted ? "Exhausted" : "Ready",
            a.exhausted ? "Exhausted" : "Ready",
          ),
        );
    }
    for (const a of prev.assets.filter(
      (a) => !p.assets.some((v) => v.id === a.id),
    ))
      changes.push(
        change(`${name(p.code)} · ${name(a.code)}`, "In play", "Leaves play"),
      );
  }
  for (const c of before.limbo)
    if (
      !after.limbo.some((x) => x.id === c.id) &&
      after.party.some((p) => p.discard.some((x) => x.id === c.id))
    )
      changes.push(
        change(
          `${name(c.owner)} · ${name(c.code)}`,
          "Resolving (limbo)",
          "Discarded",
        ),
      );
  for (const l of after.locations) {
    const old = before.locations.find((v) => v.code === l.code)!;
    if (!old.active && l.active)
      changes.push(change(name(l.code), "Set aside", "On the map"));
    if (old.active && !l.active)
      changes.push(change(name(l.code), "On the map", "Removed"));
    if (!old.revealed && l.revealed)
      changes.push(change(name(l.code), "Unrevealed", "Revealed"));
    if (old.clues !== l.clues && l.active)
      changes.push(change(`${name(l.code)} · Clues`, old.clues, l.clues));
    if (old.reduction !== l.reduction && l.active)
      changes.push(
        change(
          `${name(l.code)} · Shroud reduction`,
          old.reduction,
          l.reduction,
        ),
      );
    if (old.fire !== l.fire)
      changes.push(
        change(
          name(l.code),
          old.fire ? "On fire" : "No fire",
          l.fire ? "On fire" : "No fire",
        ),
      );
  }
  for (const en of after.enemies) {
    const old = before.enemies.find((v) => v.id === en.id);
    if (!old) {
      changes.push(change(name(en.code), "Not in play", name(en.location)));
      continue;
    }
    if (old.location !== en.location)
      changes.push(
        change(name(en.code), name(old.location), name(en.location)),
      );
    if (old.damage !== en.damage)
      changes.push(change(`${name(en.code)} · Damage`, old.damage, en.damage));
    if (old.exhausted !== en.exhausted)
      changes.push(
        change(
          name(en.code),
          old.exhausted ? "Exhausted" : "Ready",
          en.exhausted ? "Exhausted" : "Ready",
        ),
      );
    if (old.engagedWith !== en.engagedWith || old.engaged !== en.engaged)
      changes.push(
        change(
          `${name(en.code)} · Engagement`,
          old.engagedWith ? name(old.engagedWith) : "None",
          en.engagedWith ? name(en.engagedWith) : "None",
        ),
      );
  }
  for (const en of before.enemies.filter(
    (en) => !after.enemies.some((v) => v.id === en.id),
  ))
    changes.push(
      change(
        name(en.code),
        "In play",
        s.victory.includes(en.code)
          ? "Victory display"
          : s.encounterDiscard.includes(en.code)
            ? "Encounter discard"
            : "Leaves play",
      ),
    );
  for (const c of new Set(after.encounterDiscard)) {
    const added =
      after.encounterDiscard.filter((x) => x === c).length -
      before.encounterDiscard.filter((x) => x === c).length;
    if (added > 0)
      changes.push(
        change(
          name(c),
          "Resolving / in play",
          `Encounter discard${added > 1 ? ` ×${added}` : ""}`,
        ),
      );
  }
  return changes;
}
function sourceCard(
  before: VisibleSnapshot,
  s: GameState,
  e: Effect,
): string | undefined {
  if (e.code && card(e.code)) return e.code;
  if (["fire", "attachFire", "fireEnemies"].includes(e.kind)) return code(129);
  if (e.kind === "doom") return code(105 + Math.min(3, s.agenda));
  if (before.act !== s.act) return code(108 + s.act);
  const id =
    e.id ||
    e.source ||
    (e.kind === "perform" && e.title === "play" ? e.target : undefined);
  if (id && card(id)) return id;
  const all = [...before.party, ...visibleSnapshot(s).party].flatMap((p) => [
    ...p.hand,
    ...p.assets,
  ]);
  return (
    all.find((c) => c.id === id)?.code ||
    [...before.enemies, ...s.enemies].find((c) => c.id === id)?.code
  );
}
export function rememberEvent(
  s: GameState,
  event: Omit<VisibleEvent, "id" | "round" | "phase" | "actor">,
  pause = true,
  actor = s.player.code,
) {
  const entry: VisibleEvent = {
    ...event,
    id: ++s.eventSerial,
    round: s.round,
    phase: s.phase,
    actor,
  };
  s.eventHistory.push(entry);
  recordDiscoveries(s);
  if (s.eventHistory.length > 500) s.eventHistory.shift();
  if (pause && pausesAt(eventImportance(entry))) s.event = entry;
}
export function presentEffect(
  s: GameState,
  before: VisibleSnapshot,
  e: Effect,
) {
  const changes = visibleChanges(before, s);
  const notes = s.log.filter((l) => l.id > before.logId);
  if (!changes.length && !notes.length && e.kind !== "endEncounter") return;
  const titles: Record<string, string> = {
    nextTurn: "Investigator handoff",
    investigationEnd: "Investigation phase complete",
    enemyPhase: "Enemy phase",
    upkeep: "Upkeep phase",
    readyCards: "Cards ready",
    endResolution: "Encounter deck reshuffled",
    resumeWindow:
      s.test?.stage === "revealed"
        ? "Chaos token revealed"
        : "Fast ability resolved",
    roundEnd: "End of round",
    newRound: `Mythos · Round ${s.round}`,
    investigation: "Investigation phase",
    encounter: "Encounter revealed",
    drawSearchedEnemy: "Encounter revealed",
    revelation: "Revelation resolves",
    endEncounter: "Encounter complete",
    drawOne: e.title || "Card drawn",
    drawBatch: e.title || "Card drawn",
    drawnCard: "Drawn card resolves",
    endTest: "Skill test complete",
    finishLimbo: "Event complete",
    exhaustEnemy: "Enemy exhausts",
    defeat: e.title || "Investigator defeated",
    attack:
      e.source === "enemy"
        ? "Enemy attack"
        : e.source === "retaliate"
          ? "Retaliation"
          : e.source === "opportunity"
            ? "Attack of opportunity"
            : "Enemy attack",
    enemyMove: "Hunter moves",
    engagement: "Enemy engagement",
    assignEngagement: "Enemy engagement",
    damage: "Damage assignment",
    applyDamage: e.data?.drawCards
      ? "Cards drawn and horror resolved"
      : "Damage and horror resolved",
    fireDamage: "Fire damage",
    fireLocation: "Fire damage",
    enemyDamage: "Enemy damaged",
    fireEnemies: "Fire burns the enemies",
    fire: "Fire spreads",
    attachFire: "Fire spreads",
    doom: before.agenda !== s.agenda ? "The agenda advances" : "Doom placed",
    advanceAct: "The story advances",
    discover: "Clues discovered",
    gain: "Resources gained",
    heal: "Healing resolved",
    healCard: "Healing resolved",
    equip: "Asset enters play",
    discard: "Card discarded",
    discardAsset: "Asset leaves play",
    recover: "Card recovered",
    payEvent: "Event played",
    exhaust: "Asset exhausted",
    supply: "Supply spent",
    finish: "Scenario resolution",
    payGroup: "Group clues spent",
    contributeClue: "Clue contributed",
    removeThreat: "Threat discarded",
    move: "Investigator moves",
    returnAsset: "Item returned to hand",
    giveArmitage: "Armitage joins an investigator",
    dexter: "A magician’s trick",
    dexterSign: "Dexter’s elder sign",
    payAndEquip: "Asset enters play",
    nextTrick: "For my next trick…",
    trickPlay: "For my next trick…",
    twin45: "Second shot",
    twinShot: "Second shot",
    flameSkull: "Cosmic Flame · skull",
    cloak: "Cloak of Resonance",
    jim: "Jim Culver",
    charmMove: "Lucky Charm",
    breakingPoint: "Breaking Point",
    cosmosClue: "Will of the Cosmos",
    threatToDeck: "Shuffled into the deck",
    revealEncounter: "Revelation resolves",
    discardCanceled: "Revelation cancelled",
  };
  const actionTitles: Record<string, string> = {
    resource: "Resource gained",
    move: "Investigator moves",
    play: "Card played",
    resign: "Investigator resigns",
    clueDamage: "Clues power the attack",
    rest: "Rest and recovery",
    wrench: "Wrench provokes an attack",
    engage: "Enemy engaged",
    jumpsuit: "Jumpsuit discarded",
    charm: "Lucky Charm",
    necronomicon: "The Necronomicon",
    isabelle: "Isabelle’s resolve",
  };
  let title =
    titles[e.kind] ||
    (e.kind === "perform" ? actionTitles[e.title || ""] : undefined) ||
    "Card effect resolved";
  if (before.act !== s.act) title = "The story advances";
  if (before.status !== s.status && s.status === "resolution")
    title = "Scenario resolution";
  const c = sourceCard(before, s, e);
  let description = notes.map((n) => n.text).join(" ");
  if (e.kind === "attack" && c) {
    const amount = [
      card(c).enemy_damage ? `${card(c).enemy_damage} damage` : "",
      card(c).enemy_horror ? `${card(c).enemy_horror} horror` : "",
    ]
      .filter(Boolean)
      .join(" and ");
    if (e.source === "opportunity")
      description +=
        " This is an attack of opportunity, triggered by the action you took while engaged.";
    description += ` Resolve ${amount || "the attack"} before the next event.`;
  }
  const encounterReveal =
    e.kind === "encounter" || e.kind === "drawSearchedEnemy";
  if (encounterReveal)
    description = `${name(s.player.code)} reveals ${name(e.code!)}. Read the card, then resolve its revelation. Its effects have not resolved yet.`;
  if (!description)
    description = `${name(s.player.code)} · ${title.toLowerCase()}. Review the changes below.`;
  const story: VisibleEvent["story"] =
    before.act !== s.act
      ? {
          kind: "act",
          previous: code(108 + before.act),
          current: code(108 + s.act),
        }
      : before.agenda !== s.agenda
        ? {
            kind: "agenda",
            previous: code(105 + before.agenda),
            current: s.agenda <= 3 ? code(105 + s.agenda) : undefined,
          }
        : undefined;
  const encounterStage = encounterReveal
    ? "revealed"
    : e.kind === "revelation"
      ? "resolving"
      : e.kind === "endEncounter"
        ? "resolved"
        : undefined;
  let destination =
    "Resolve the card, then place it in the encounter discard pile.";
  const lastReveal = [...s.eventHistory]
    .reverse()
    .find((x) => x.encounter?.stage === "revealed");
  const encounterTrail = lastReveal
    ? s.eventHistory.filter((x) => x.id >= lastReveal.id && x.card === c)
    : [];
  const encounterChanges = [
    ...encounterTrail.flatMap((x) => x.changes),
    ...changes,
  ];
  const wasDiscarded =
    c &&
    encounterChanges.some(
      (x) => x.label === name(c) && x.after.startsWith("Encounter discard"),
    );
  if (c && card(c).type_code === "enemy") {
    const enemy =
      !encounterReveal && [...s.enemies].reverse().find((en) => en.code === c);
    destination = enemy
      ? `${name(enemy.location)}${enemy.engagedWith ? ` · engaged with ${name(enemy.engagedWith)}` : " · not engaged"}`
      : "Spawns at the location specified by the card; otherwise, at your location.";
  } else if (c === code(125)) {
    destination = encounterReveal
      ? "Your threat area · stays in play. An extra copy is discarded."
      : wasDiscarded
        ? "Encounter discard pile · another copy is already in your threat area."
        : s.player.threats.includes(c)
          ? `${name(s.player.code)} · threat area`
          : "Encounter discard pile";
  } else if (c === code(129)) {
    const attached =
      !encounterReveal && encounterChanges.find((x) => x.after === "On fire");
    destination =
      !encounterReveal && wasDiscarded
        ? "Encounter discard pile · every active location already has Fire!."
        : attached
          ? `${attached.label} · attached Fire!`
          : "Attaches to the nearest location without Fire!";
  } else if (encounterStage === "resolved")
    destination = "Encounter discard pile";
  rememberEvent(
    s,
    {
      title,
      description,
      card: c,
      motion: {
        kind: e.kind === "perform" ? e.title || e.kind : e.kind,
        source: e.id || e.source,
        target: e.target,
      },
      story,
      encounter: encounterStage
        ? { stage: encounterStage, destination }
        : undefined,
      changes,
      tone: notes.some((n) => n.tone === "bad")
        ? "bad"
        : notes.some((n) => n.tone === "story")
          ? "story"
          : notes.some((n) => n.tone === "good")
            ? "good"
            : "neutral",
      continueLabel: encounterReveal
        ? "Resolve revelation"
        : e.kind === "attack"
          ? "Resolve attack"
          : s.window
            ? "Continue to Fast window"
            : s.test
              ? "Continue to skill test"
              : s.decision
                ? "Continue to choice"
                : s.queue.length
                  ? "Continue to next event"
                  : s.status === "resolution"
                    ? "View scenario resolution"
                    : "Return to investigation",
    },
    true,
    e.actor === "scenario" ||
      [
        "investigationEnd",
        "enemyPhase",
        "upkeep",
        "roundEnd",
        "newRound",
        "investigation",
        "fireEnemies",
        "fireLocation",
      ].includes(e.kind)
      ? "scenario"
      : s.player.code,
  );
}
export function presentAction(
  s: GameState,
  before: VisibleSnapshot,
  action: Action,
  previousSerial: number,
) {
  if (action.type === "continue" || action.type === "clearError" || s.error)
    return;
  const changes = visibleChanges(before, s);
  // The first effect shares the action's payment and commitment changes.
  if (s.event && s.event.id > previousSerial) {
    s.event.changes = changes;
    const stored = s.eventHistory.find((e) => e.id === s.event!.id);
    if (stored) stored.changes = changes;
    return;
  }
  const fresh = s.eventHistory.filter((e) => e.id > previousSerial);
  if (fresh.length) {
    // Events that resolved without pausing already itemize their own changes.
    // Attach only the action's own payment to the first of them.
    const seen = new Set(fresh.flatMap((e) => e.changes.map((c) => c.label)));
    const extra = changes.filter((c) => !seen.has(c.label));
    if (extra.length) fresh[0].changes = [...extra, ...fresh[0].changes];
    return;
  }
  const notes = s.log.filter((l) => l.id > before.logId);
  if (!changes.length && !notes.length && action.type !== "switchInvestigator")
    return;
  const title =
    action.type === "reveal" ||
    (action.type === "passWindow" && s.test?.stage === "revealed")
      ? "Chaos token revealed"
      : action.type === "resolve"
        ? "Skill test resolved"
        : action.type === "switchInvestigator"
          ? "Investigator selected"
          : action.type === "mulligan"
            ? "Opening hand ready"
            : action.type === "boost"
              ? "Skill boosted"
              : action.type === "choose"
                ? "Choice resolved"
                : action.type === "act"
                  ? `Action · ${action.kind}`
                  : action.type === "endTurn"
                    ? "Investigator turn complete"
                    : action.type === "fast"
                      ? "Fast ability resolved"
                      : "Card played";
  rememberEvent(
    s,
    {
      title,
      description:
        notes.map((n) => n.text).join(" ") ||
        `${name(s.player.code)} · ${title.toLowerCase()}.`,
      motion: { kind: action.type === "act" ? action.kind : action.type },
      tone: "neutral",
      changes,
      continueLabel: s.window
        ? "Continue to Fast window"
        : s.test
          ? "Continue to skill test"
          : s.decision
            ? "Continue to choice"
            : "Return to investigation",
    },
    !s.test &&
      !s.decision &&
      s.status !== "mulligan" &&
      !["mulligan", "switchInvestigator", "commit", "reveal", "boost"].includes(
        action.type,
      ),
  );
}
