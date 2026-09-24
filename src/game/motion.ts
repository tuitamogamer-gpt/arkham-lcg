import type { GameState, VisibleEvent } from "./types";
import { card } from "./data";

export type MotionKind =
  | "gain"
  | "spend"
  | "damage"
  | "horror"
  | "heal"
  | "draw"
  | "play"
  | "move"
  | "reveal"
  | "attack"
  | "exhaust"
  | "ready"
  | "investigate"
  | "evade"
  | "engage"
  | "parley"
  | "fire"
  | "extinguish"
  | "defeat"
  | "discard"
  | "commit"
  | "boost"
  | "resign"
  | "story";
export interface MotionCue {
  target: string;
  kind: MotionKind;
  delta?: number;
  from?: string;
  to?: string;
}

export function eventMotion(e: VisibleEvent): MotionKind {
  if (e.story || e.title === "Scenario resolution") return "story";
  const kinds: Record<string, MotionKind> = {
    investigate: "investigate",
    library: "investigate",
    search: "investigate",
    takeSearch: "draw",
    fight: "attack",
    damageEnemy: "attack",
    attack: "attack",
    clueDamage: "attack",
    wrench: "attack",
    evade: "evade",
    evadeEnemy: "evade",
    engage: "engage",
    engagement: "engage",
    assignEngagement: "engage",
    parley: "parley",
    attachFire: "fire",
    fireLocation: "fire",
    fireEnemies: "fire",
    extinguish: "extinguish",
    move: "move",
    enemyMove: "move",
    olivier: "move",
    resign: "resign",
    defeat: "defeat",
    discard: "discard",
    removeThreat: "discard",
    finishLimbo: "discard",
    jumpsuit: "discard",
    resource: "gain",
    gain: "gain",
    spend: "spend",
    payGroup: "spend",
    contributeClue: "spend",
    discover: "investigate",
    heal: "heal",
    rest: "heal",
    intuitionHeal: "heal",
    bandages: "heal",
    drawOne: "draw",
    drawBatch: "draw",
    play: "play",
    playAsset: "play",
    commit: "commit",
    boost: "boost",
    encounter: "reveal",
    drawSearchedEnemy: "reveal",
    revelation: "horror",
    doom: "horror",
    applyDamage: "damage",
    damage: "damage",
    exhaustEnemy: "exhaust",
    readyCards: "ready",
  };
  return (
    kinds[e.motion?.kind || ""] ||
    (/attack|Retaliation|Enemy damaged/i.test(e.title)
      ? "attack"
      : /horror|Doom/i.test(e.title)
        ? "horror"
        : /Damage/i.test(e.title)
          ? "damage"
          : /Fire/i.test(e.title)
            ? "fire"
            : /Clue/i.test(e.title)
              ? "investigate"
              : /Resource/i.test(e.title)
                ? "gain"
                : /draw|hand/i.test(e.title)
                  ? "draw"
                  : /move/i.test(e.title)
                    ? "move"
                    : "reveal")
  );
}

// Presentation only: compare public, resolved state. These cues never dispatch
// actions, inspect a future draw, or wait on an animation to advance the game.
export function tableMotion(before: GameState, after: GameState): MotionCue[] {
  if (before.id !== after.id) return [];
  const cues: MotionCue[] = [];
  const add = (
    target: string,
    kind: MotionKind,
    delta?: number,
    from?: string,
    to?: string,
  ) => cues.push({ target, kind, delta, from, to });
  for (const p of [after.player, ...after.companions]) {
    const old = [before.player, ...before.companions].find(
      (x) => x.code === p.code,
    );
    if (!old) continue;
    for (const [field, token] of [
      ["resources", "resource"],
      ["clues", "clue"],
      ["damage", "damage"],
      ["horror", "horror"],
    ] as const) {
      const delta = p[field] - old[field];
      if (!delta) continue;
      const kind =
        field === "damage" || field === "horror"
          ? delta > 0
            ? field
            : "heal"
          : delta > 0
            ? "gain"
            : "spend";
      add(`${token}-${p.code}`, kind, delta);
      add(`investigator-${p.code}`, kind);
    }
    if (p.location !== old.location)
      add(`pawn-${p.code}`, "move", undefined, `pawn-${p.code}`);
    if (p.actions !== old.actions) add(`actions-${p.code}`, "spend");
    if (p.status !== old.status)
      add(
        `investigator-${p.code}`,
        p.status === "resigned" ? "resign" : "defeat",
      );
    for (const c of p.hand) {
      if (!old.hand.some((x) => x.id === c.id))
        add(`card-${c.id}`, "draw", undefined, `player-deck-${p.code}`);
    }
    for (const c of p.assets) {
      const prev = old.assets.find((x) => x.id === c.id);
      if (!prev) add(`card-${c.id}`, "play", undefined, `card-${c.id}`);
      else {
        if (prev.exhausted !== c.exhausted)
          add(`card-${c.id}`, c.exhausted ? "exhaust" : "ready");
        if (prev.uses !== c.uses)
          add(`uses-${c.id}`, "spend", c.uses - prev.uses);
        if (prev.damage !== c.damage)
          add(`card-${c.id}`, c.damage > prev.damage ? "damage" : "heal");
        if (prev.horror !== c.horror)
          add(`card-${c.id}`, c.horror > prev.horror ? "horror" : "heal");
      }
    }
    for (const c of [...old.hand, ...old.assets]) {
      if (
        p.discard.some((x) => x.id === c.id) &&
        !old.discard.some((x) => x.id === c.id)
      )
        add(
          `card-${c.id}`,
          "discard",
          undefined,
          undefined,
          `player-discard-${p.code}`,
        );
      else if (
        after.limbo?.some((x) => x.id === c.id) &&
        !before.limbo?.some((x) => x.id === c.id)
      )
        add(`card-${c.id}`, "commit");
    }
  }
  for (const l of after.locations.filter((l) => l.active)) {
    const old = before.locations.find((x) => x.code === l.code);
    if (!old) continue;
    if (!old.active || (!old.revealed && l.revealed))
      add(`location-${l.code}`, "reveal");
    if (!old.fire && l.fire) add(`location-${l.code}`, "fire");
    if (old.fire && !l.fire) add(`location-${l.code}`, "extinguish");
    if (old.clues !== l.clues && l.revealed)
      add(`location-${l.code}`, "investigate");
  }
  for (const e of after.enemies) {
    const old = before.enemies.find((x) => x.id === e.id);
    for (const target of [`enemy-${e.id}`, `enemy-token-${e.id}`]) {
      if (!old) add(target, "reveal", undefined, "encounter-deck");
      else {
        if (old.damage !== e.damage)
          add(target, "damage", e.damage - old.damage);
        if (old.location !== e.location) add(target, "move", undefined, target);
        if (old.engagedWith !== e.engagedWith || old.engaged !== e.engaged)
          add(target, e.engaged ? "engage" : e.exhausted ? "evade" : "move");
        if (old.exhausted !== e.exhausted)
          add(target, e.exhausted ? "exhaust" : "ready");
      }
    }
  }
  for (const e of before.enemies.filter(
    (e) => !after.enemies.some((x) => x.id === e.id),
  )) {
    const defeated =
      (after.event?.description || "").includes("defeated") ||
      after.victory.length > before.victory.length;
    const destination =
      defeated && card(e.code).victory
        ? "victory-display"
        : e.owner
          ? `player-discard-${e.owner}`
          : "encounter-discard";
    for (const target of [`enemy-${e.id}`, `enemy-token-${e.id}`])
      add(
        target,
        defeated ? "defeat" : "discard",
        undefined,
        undefined,
        destination,
      );
  }
  const test = after.test || after.window?.test;
  const oldTest = before.test || before.window?.test;
  const testBecameVisible =
    !!after.test && !after.event && (!before.test || !!before.event);
  if (
    test &&
    (testBecameVisible ||
      !oldTest ||
      test.kind !== oldTest.kind ||
      test.target !== oldTest.target)
  ) {
    const kind =
      (
        {
          fight: "attack",
          investigate: "investigate",
          evade: "evade",
          parley: "parley",
          extinguish: "extinguish",
        } as Record<string, MotionKind>
      )[test.kind] || "reveal";
    add("test-scene", kind);
    if (test.target) add(`enemy-token-${test.target}`, kind);
  }
  if (test && oldTest) {
    for (const id of test.committed.filter(
      (id) => !oldTest.committed.includes(id),
    ))
      add(`commit-${id}`, "commit");
    if (test.bonus > oldTest.bonus) add("test-scene", "boost");
  }
  if (before.doom !== after.doom)
    add("doom", "horror", after.doom - before.doom);
  if (before.act !== after.act) add("act", "story");
  if (before.agenda !== after.agenda) add("agenda", "story");
  if (before.phase !== after.phase || before.round !== after.round)
    add("phase", "reveal");
  if (before.player.code !== after.player.code)
    add(`investigator-${after.player.code}`, "ready");
  if (
    after.event &&
    before.event?.id !== after.event.id &&
    /attack|Retaliation/i.test(after.event.title)
  ) {
    const attacker =
      after.enemies.find((e) => e.id === after.event?.motion?.source) ||
      after.enemies.find(
        (e) =>
          e.code === after.event?.card && e.engagedWith === after.event.actor,
      );
    if (attacker) {
      add(`enemy-${attacker.id}`, "attack");
      add(`enemy-token-${attacker.id}`, "attack");
    }
  }
  return cues;
}
