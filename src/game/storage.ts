import type { GameState, VisibleEvent } from "./types";
import { card, STARTER_DECKS } from "./data";
export const SAVE_KEY = "arkham-chronicle:spreading-flames:v1";
const integer = (n: unknown, min = 0, max = 100000): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const instances = (xs: unknown): boolean =>
  Array.isArray(xs) &&
  xs.every(
    (c) =>
      record(c) &&
      typeof c.id === "string" &&
      typeof c.code === "string" &&
      !!card(c.code),
  );
const codes = (xs: unknown): boolean =>
  Array.isArray(xs) && xs.every((c) => typeof c === "string" && !!card(c));
const effects = (xs: unknown): boolean =>
  Array.isArray(xs) &&
  xs.length < 500 &&
  xs.every(
    (e) =>
      record(e) &&
      typeof e.kind === "string" &&
      (!e.code || (typeof e.code === "string" && !!card(e.code))),
  );
const phases = ["investigation", "enemy", "upkeep", "mythos", "roundEnd"];
function validEvent(x: unknown, party: string[]): x is VisibleEvent {
  if (!record(x)) return false;
  return (
    integer(x.id, 1, 1000000) &&
    integer(x.round, 1, 999) &&
    phases.includes(String(x.phase)) &&
    (x.actor === "scenario" || party.includes(String(x.actor))) &&
    [x.title, x.description, x.continueLabel].every(
      (t) => typeof t === "string" && t.length <= 10000,
    ) &&
    (!x.card || (typeof x.card === "string" && !!card(x.card))) &&
    ["neutral", "good", "bad", "story"].includes(String(x.tone)) &&
    Array.isArray(x.changes) &&
    x.changes.length <= 256 &&
    x.changes.every(
      (c) =>
        record(c) &&
        [c.label, c.before, c.after].every(
          (t) => typeof t === "string" && t.length <= 1000,
        ),
    )
  );
}
export function validSave(x: unknown): x is GameState {
  try {
    if (!record(x)) return false;
    const s = x as unknown as GameState,
      p = s.player;
    if (
      s.version !== 3 ||
      !record(p) ||
      !STARTER_DECKS[p.code] ||
      typeof s.id !== "string"
    )
      return false;
    if (
      !Array.isArray(s.companions) ||
      s.companions.length > 2 ||
      !Array.isArray(s.partyOrder)
    )
      return false;
    const party = [p, ...s.companions];
    if (
      !integer(s.eventSerial, 0, 1000000) ||
      !Array.isArray(s.eventHistory) ||
      s.eventHistory.length > 500 ||
      !s.eventHistory.every(
        (e) => validEvent(e, s.partyOrder) && e.id <= s.eventSerial,
      ) ||
      new Set(s.eventHistory.map((e) => e.id)).size !== s.eventHistory.length ||
      !(
        s.event === null ||
        (validEvent(s.event, s.partyOrder) &&
          s.event.id === s.eventSerial &&
          s.eventHistory.some((e) => e.id === s.event!.id))
      )
    )
      return false;
    if (
      party.length < 1 ||
      party.length > 3 ||
      new Set(party.map((p) => p.code)).size !== party.length ||
      s.partyOrder.length !== party.length ||
      new Set(s.partyOrder).size !== party.length ||
      !s.partyOrder.every((c) => party.some((p) => p.code === c)) ||
      !s.partyOrder.includes(s.leadInvestigator) ||
      !s.partyOrder.includes(s.turnInvestigator)
    )
      return false;
    for (const member of party) {
      if (
        !record(member) ||
        !STARTER_DECKS[member.code] ||
        !["active", "defeated", "resigned"].includes(member.status) ||
        !record(member.flags) ||
        ![
          member.resources,
          member.clues,
          member.damage,
          member.horror,
          member.actionsTaken,
          member.xp,
          member.physicalTrauma,
          member.mentalTrauma,
        ].every((n) => integer(n)) ||
        !integer(member.actions, 0, 3) ||
        ![member.turnStarted, member.turnEnded, member.mulliganDone].every(
          (b) => typeof b === "boolean",
        )
      )
        return false;
      if (
        !["12113", "12116", "12117", "12118", "12119", "12120"].includes(
          member.location,
        ) ||
        ![member.hand, member.deck, member.discard, member.assets].every(
          instances,
        ) ||
        !codes(member.threats)
      )
        return false;
      if (
        !member.assets.every(
          (a) =>
            integer(a.uses) &&
            integer(a.damage) &&
            integer(a.horror) &&
            typeof a.exhausted === "boolean",
        )
      )
        return false;
      if (
        member.status === "active" &&
        !s.locations?.some((l) => l.code === member.location && l.active)
      )
        return false;
    }
    if (
      !["mulligan", "playing", "resolution"].includes(s.status) ||
      !["investigation", "enemy", "upkeep", "mythos", "roundEnd"].includes(
        s.phase,
      ) ||
      !["easy", "standard", "hard", "expert"].includes(s.difficulty)
    )
      return false;
    if (
      !integer(s.round, 1, 999) ||
      !integer(s.seed, 1, 4294967295) ||
      !integer(s.nextId, 1) ||
      !integer(s.act, 1, 4) ||
      !integer(s.agenda, 1, 4) ||
      !integer(s.doom) ||
      !integer(p.actions, 0, 3) ||
      !integer(p.actionsTaken)
    )
      return false;
    if (
      ![p.resources, p.clues, p.damage, p.horror].every((n) => integer(n)) ||
      !["12113", "12116", "12117", "12118", "12119", "12120"].includes(
        p.location,
      )
    )
      return false;
    if (
      ![p.hand, p.deck, p.discard, p.assets, s.enemies].every(instances) ||
      !codes(p.threats) ||
      !codes(s.encounterDeck) ||
      !codes(s.encounterDiscard) ||
      !codes(s.victory)
    )
      return false;
    if (
      !p.assets.every(
        (a) =>
          integer(a.uses) &&
          integer(a.damage) &&
          integer(a.horror) &&
          typeof a.exhausted === "boolean",
      )
    )
      return false;
    if (
      !s.enemies.every(
        (e) =>
          integer(e.damage) &&
          !!card(e.location) &&
          typeof e.exhausted === "boolean" &&
          typeof e.engaged === "boolean" &&
          (!e.engagedWith || s.partyOrder.includes(e.engagedWith)) &&
          (!e.owner || s.partyOrder.includes(e.owner)),
      )
    )
      return false;
    if (
      !Array.isArray(s.locations) ||
      s.locations.length !== 6 ||
      new Set(s.locations.map((l) => l.code)).size !== 6 ||
      !s.locations.every(
        (l) =>
          card(l.code)?.type_code === "location" &&
          integer(l.clues) &&
          integer(l.reduction) &&
          typeof l.active === "boolean" &&
          typeof l.revealed === "boolean" &&
          typeof l.fire === "boolean",
      )
    )
      return false;
    if (
      (p.status === "active" &&
        !s.locations.some((l) => l.code === p.location && l.active)) ||
      !integer(s.fireSetAside, 0, 5) ||
      !record(s.flags) ||
      !effects(s.queue)
    )
      return false;
    if (
      !Array.isArray(s.bag) ||
      s.bag.length < 1 ||
      s.bag.length > 44 ||
      !s.bag.every(
        (t) =>
          typeof t === "string" &&
          /^(?:[+-]?\d|skull|tablet|elder_thing|auto_fail|elder_sign)$/.test(t),
      )
    )
      return false;
    if (
      !Array.isArray(s.log) ||
      !s.log.every(
        (l) =>
          integer(l.id) &&
          integer(l.round, 1) &&
          typeof l.text === "string" &&
          ["neutral", "good", "bad", "story"].includes(l.tone),
      )
    )
      return false;
    if (
      !record(s.campaign) ||
      !Array.isArray(s.campaign.notes) ||
      !s.campaign.notes.every((n) => typeof n === "string") ||
      ![
        s.campaign.xp,
        s.campaign.physicalTrauma,
        s.campaign.mentalTrauma,
      ].every((n) => integer(n))
    )
      return false;
    if (
      s.decision !== null &&
      (!record(s.decision) ||
        typeof s.decision.title !== "string" ||
        typeof s.decision.description !== "string" ||
        !Array.isArray(s.decision.choices) ||
        !s.decision.choices.length ||
        !s.decision.choices.every(
          (c) =>
            typeof c.id === "string" &&
            typeof c.label === "string" &&
            effects(c.effects),
        ))
    )
      return false;
    if (
      s.test !== null &&
      (!record(s.test) ||
        !["commit", "revealed"].includes(s.test.stage) ||
        !["willpower", "intellect", "combat", "agility"].includes(
          s.test.skill,
        ) ||
        typeof s.test.title !== "string" ||
        typeof s.test.kind !== "string" ||
        ![s.test.difficulty, s.test.base, s.test.bonus].every((n) =>
          integer(n),
        ) ||
        !Array.isArray(s.test.committed) ||
        !s.test.committed.every((id) =>
          party.some((p) => p.hand.some((c) => c.id === id)),
        ) ||
        !Array.isArray(s.test.tokens) ||
        !Number.isFinite(s.test.modifier))
    )
      return false;
    return true;
  } catch {
    return false;
  }
}
export function decodeSave(value: unknown): GameState | null {
  try {
    const x = structuredClone(value);
    if (record(x) && x.version === 1 && record(x.player)) {
      const p = x.player;
      const campaign = record(x.campaign) ? x.campaign : {};
      Object.assign(p, {
        actions: x.actions,
        actionsTaken: x.actionsTaken,
        turnEnded: x.status === "resolution",
        turnStarted: Number(x.actionsTaken) > 0,
        mulliganDone: x.status !== "mulligan",
        status:
          x.status === "resolution" && campaign.result === "defeat"
            ? "defeated"
            : x.status === "resolution" && campaign.result === "resigned"
              ? "resigned"
              : "active",
        flags: { ...(record(x.flags) ? x.flags : {}) },
        xp: campaign.xp ?? 0,
        physicalTrauma: campaign.physicalTrauma ?? 0,
        mentalTrauma: campaign.mentalTrauma ?? 0,
      });
      Object.assign(x, {
        version: 2,
        companions: [],
        partyOrder: [p.code],
        leadInvestigator: p.code,
        turnInvestigator: p.code,
      });
      delete x.actions;
      delete x.actionsTaken;
      if (Array.isArray(x.enemies))
        x.enemies.forEach((e) => {
          if (record(e) && e.engaged) e.engagedWith = p.code;
        });
    }
    if (record(x) && x.version === 2) {
      x.version = 3;
      x.event = null;
      x.eventHistory = [];
      x.eventSerial = 0;
    }
    return validSave(x) ? x : null;
  } catch {
    return null;
  }
}
export function readSave(): GameState | null {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    return decodeSave(data);
  } catch {
    return null;
  }
}
export function writeSave(s: GameState) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}
export function exportSave(s: GameState) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `arkham-${s.id}-round-${s.round}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
