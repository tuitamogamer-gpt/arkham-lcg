import type { GameState } from "./types";

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
  | "story";
export interface MotionCue {
  target: string;
  kind: MotionKind;
  delta?: number;
  from?: string;
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
  ) => cues.push({ target, kind, delta, from });
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
  }
  for (const l of after.locations.filter((l) => l.active)) {
    const old = before.locations.find((x) => x.code === l.code);
    if (!old) continue;
    if (!old.active || (!old.revealed && l.revealed))
      add(`location-${l.code}`, "reveal");
    if (!old.fire && l.fire) add(`location-${l.code}`, "damage");
  }
  for (const e of after.enemies) {
    const old = before.enemies.find((x) => x.id === e.id);
    if (!old) add(`enemy-${e.id}`, "reveal");
    else if (old.damage !== e.damage)
      add(`enemy-${e.id}`, "damage", e.damage - old.damage);
    else if (old.exhausted !== e.exhausted)
      add(`enemy-${e.id}`, e.exhausted ? "exhaust" : "ready");
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
    const attacker = after.enemies.find(
      (e) =>
        e.code === after.event?.card && e.engagedWith === after.event.actor,
    );
    if (attacker) add(`enemy-${attacker.id}`, "attack");
  }
  return cues;
}
