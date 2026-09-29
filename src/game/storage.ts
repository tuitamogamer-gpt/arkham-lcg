import type { Difficulty, GameState, VisibleEvent } from "./types";
import { card, STARTER_DECKS } from "./data";
import { recordDiscoveries } from "./knowledge";
// Legacy single-slot key from the first builds; migrated into a slot on load.
export const SAVE_KEY = "arkham-chronicle:spreading-flames:v1";
const INDEX_KEY = "arkham-chronicle:saves";
const RECORD_KEY = "arkham-chronicle:record";
const slotKey = (id: string) => `arkham-chronicle:save:${id}`;
export const MAX_SLOTS = 12;
export interface SaveSummary {
  id: string;
  updatedAt: string;
  round: number;
  act: number;
  party: string[];
  difficulty: Difficulty;
  status: GameState["status"];
  result: string | null;
}
export interface ResultRecord {
  id: string;
  finishedAt: string;
  party: string[];
  difficulty: Difficulty;
  result: string;
  rounds: number;
  xp: number;
}
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
    (x.motion === undefined ||
      (record(x.motion) &&
        typeof x.motion.kind === "string" &&
        x.motion.kind.length <= 100 &&
        [x.motion.source, x.motion.target].every(
          (v) => v === undefined || (typeof v === "string" && v.length <= 100),
        ))) &&
    (x.story === undefined ||
      (record(x.story) &&
        ["act", "agenda"].includes(String(x.story.kind)) &&
        typeof x.story.previous === "string" &&
        !!card(x.story.previous) &&
        (x.story.current === undefined ||
          (typeof x.story.current === "string" && !!card(x.story.current))))) &&
    (x.encounter === undefined ||
      (record(x.encounter) &&
        ["revealed", "resolving", "resolved"].includes(
          String(x.encounter.stage),
        ) &&
        typeof x.encounter.destination === "string" &&
        x.encounter.destination.length <= 1000)) &&
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
      s.introduction !== undefined &&
      (!["campaign", "scenario", "complete"].includes(s.introduction) ||
        (s.introduction !== "complete" &&
          (s.status !== "mulligan" ||
            party.some((p) => p.mulliganDone) ||
            s.event ||
            s.test ||
            s.decision ||
            s.window ||
            s.queue.length)))
    )
      return false;
    if (
      s.discoveries !== undefined &&
      (!record(s.discoveries) ||
        !codes(s.discoveries.cards) ||
        !codes(s.discoveries.storyBacks) ||
        s.discoveries.cards.length > 196 ||
        s.discoveries.storyBacks.length > 196 ||
        !s.discoveries.storyBacks.every((c) =>
          ["act", "agenda"].includes(card(c).type_code),
        ))
    )
      return false;
    if (
      s.resolutionDepth !== undefined &&
      (!integer(s.resolutionDepth, 0, 100) ||
        s.queue.filter((e) => e.kind === "endResolution").length !==
          s.resolutionDepth)
    )
      return false;
    if (s.window !== undefined) {
      const w = s.window;
      if (
        !record(w) ||
        !["phase", "turn", "beforeCommit", "beforeToken"].includes(w.timing) ||
        typeof w.title !== "string" ||
        !s.partyOrder.includes(w.actor) ||
        s.test ||
        s.decision
      )
        return false;
      if (["beforeCommit", "beforeToken"].includes(w.timing) !== !!w.test)
        return false;
      if (w.test && w.test.stage !== "commit") return false;
      if (w.test && !validSave({ ...s, window: undefined, test: w.test }))
        return false;
    }
    if (
      (s.testInProgress !== undefined &&
        typeof s.testInProgress !== "boolean") ||
      (s.queuedTests !== undefined &&
        (!Array.isArray(s.queuedTests) ||
          s.queuedTests.length > 100 ||
          !s.queuedTests.every(
            (q) =>
              record(q) &&
              s.partyOrder.includes(q.actor) &&
              record(q.test) &&
              ["willpower", "intellect", "combat", "agility"].includes(
                q.test.skill,
              ) &&
              [q.test.difficulty, q.test.base, q.test.bonus].every((n) =>
                integer(n),
              ) &&
              typeof q.test.title === "string" &&
              typeof q.test.kind === "string" &&
              q.test.stage === "commit" &&
              Array.isArray(q.test.committed) &&
              q.test.committed.length === 0 &&
              Array.isArray(q.test.tokens) &&
              q.test.tokens.length === 0 &&
              Number.isFinite(q.test.modifier),
          )))
    )
      return false;
    if (
      (s.peril !== undefined && !s.partyOrder.includes(s.peril)) ||
      (s.limbo !== undefined &&
        (!instances(s.limbo) ||
          !s.limbo.every((c) => s.partyOrder.includes(c.owner)) ||
          new Set(s.limbo.map((c) => c.id)).size !== s.limbo.length ||
          s.limbo.some((c) =>
            party.some((p) =>
              [...p.hand, ...p.deck, ...p.discard, ...p.assets].some(
                (x) => x.id === c.id,
              ),
            ),
          )))
    )
      return false;
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
      (s.campaign.armitageBearer !== undefined &&
        !s.partyOrder.includes(s.campaign.armitageBearer)) ||
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
        (s.test.commitClosed !== undefined &&
          typeof s.test.commitClosed !== "boolean") ||
        ![s.test.difficulty, s.test.base, s.test.bonus].every((n) =>
          integer(n),
        ) ||
        !Array.isArray(s.test.committed) ||
        !s.test.committed.every(
          (id) =>
            party.some((p) => p.hand.some((c) => c.id === id)) ||
            s.limbo?.some((c) => c.id === id),
        ) ||
        (s.test.addedSkill !== undefined &&
          !["willpower", "intellect", "combat", "agility"].includes(
            s.test.addedSkill,
          )) ||
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
    if (!validSave(x)) return null;
    // Older saves kept committed cards in hand and had no persistent test scope.
    const pending = [
      x.test,
      x.window?.test,
      ...x.queue
        .filter((e) => e.kind === "resumeWindow")
        .map((e) => (e.data?.window as { test?: unknown })?.test),
      ...x.queue
        .filter((e) => e.kind === "resumeTest")
        .map((e) => e.data?.test),
    ].filter((t) => record(t) && Array.isArray(t.committed)) as {
      committed: string[];
    }[];
    for (const t of pending)
      for (const id of t.committed) {
        const owner = [x.player, ...x.companions].find((p) =>
          p.hand.some((c) => c.id === id),
        );
        if (!owner) continue;
        const index = owner.hand.findIndex((c) => c.id === id);
        const [c] = owner.hand.splice(index, 1);
        (x.limbo ||= []).push({ ...c, owner: owner.code });
      }
    if (
      x.testInProgress === undefined &&
      (pending.length > 0 || x.queue.some((e) => e.kind === "endTest"))
    )
      x.testInProgress = true;
    // Pre-window v3 saves have no enclosing resolution marker. Restore that
    // boundary around an already drawn encounter/event, so an empty deck is
    // not shuffled before its pending revelation or test completes.
    if (x.resolutionDepth === undefined) {
      let after = -1;
      x.queue.forEach((e, i) => {
        if (["revelation", "endEncounter", "finishLimbo"].includes(e.kind))
          after = i + 1;
      });
      if (after >= 0) {
        x.resolutionDepth = 1;
        x.queue.splice(after, 0, { kind: "endResolution", actor: "scenario" });
      }
    }
    recordDiscoveries(x);
    return x;
  } catch {
    return null;
  }
}
function readIndex(): { active: string | null; slots: SaveSummary[] } {
  try {
    const x: unknown = JSON.parse(localStorage.getItem(INDEX_KEY) || "null");
    if (
      record(x) &&
      Array.isArray(x.slots) &&
      x.slots.every(
        (v) =>
          record(v) &&
          typeof v.id === "string" &&
          typeof v.updatedAt === "string",
      )
    )
      return {
        active: typeof x.active === "string" ? x.active : null,
        slots: x.slots as SaveSummary[],
      };
  } catch {
    /* No index yet. */
  }
  return { active: null, slots: [] };
}
function writeIndex(index: { active: string | null; slots: SaveSummary[] }) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}
export function summarize(s: GameState): SaveSummary {
  return {
    id: s.id,
    updatedAt: new Date().toISOString(),
    round: s.round,
    act: s.act,
    party: [...s.partyOrder],
    difficulty: s.difficulty,
    status: s.status,
    result: s.campaign.result,
  };
}
export function listSaves(): SaveSummary[] {
  return [...readIndex().slots].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
export function activeSaveId(): string | null {
  return readIndex().active;
}
export function loadSave(id: string): GameState | null {
  try {
    return decodeSave(JSON.parse(localStorage.getItem(slotKey(id)) || "null"));
  } catch {
    return null;
  }
}
/** Returns the active investigation, migrating the legacy single slot first. */
export function readSave(): GameState | null {
  try {
    // The legacy key only exists when an older build (or automation) wrote
    // it, so its content is the newest state of that investigation.
    const legacy = localStorage.getItem(SAVE_KEY);
    if (legacy) {
      const s = decodeSave(JSON.parse(legacy));
      if (s) writeSave(s);
      localStorage.removeItem(SAVE_KEY);
    }
    const active = readIndex().active;
    return active ? loadSave(active) : null;
  } catch {
    return null;
  }
}
export function setActiveSave(id: string) {
  const index = readIndex();
  if (index.slots.some((v) => v.id === id)) writeIndex({ ...index, active: id });
}
/** Stores the game in its own slot and makes it the active investigation. */
export function writeSave(s: GameState) {
  const index = readIndex();
  const existing = index.slots.findIndex((v) => v.id === s.id);
  if (existing < 0 && index.slots.length >= MAX_SLOTS)
    throw new Error("slots");
  localStorage.setItem(slotKey(s.id), JSON.stringify(s));
  const summary = summarize(s);
  const slots =
    existing < 0
      ? [...index.slots, summary]
      : index.slots.map((v, i) => (i === existing ? summary : v));
  writeIndex({ active: s.id, slots });
}
export function deleteSave(id: string) {
  const index = readIndex();
  localStorage.removeItem(slotKey(id));
  writeIndex({
    active: index.active === id ? null : index.active,
    slots: index.slots.filter((v) => v.id !== id),
  });
}
export function readRecord(): ResultRecord[] {
  try {
    const x: unknown = JSON.parse(localStorage.getItem(RECORD_KEY) || "null");
    return Array.isArray(x)
      ? (x.filter(
          (v) =>
            record(v) &&
            typeof v.id === "string" &&
            typeof v.result === "string",
        ) as ResultRecord[])
      : [];
  } catch {
    return [];
  }
}
/** Appends a finished investigation once; the game id keeps it idempotent. */
export function recordResult(s: GameState) {
  if (s.status !== "resolution" || !s.campaign.result) return;
  const entries = readRecord();
  if (entries.some((v) => v.id === s.id)) return;
  entries.push({
    id: s.id,
    finishedAt: new Date().toISOString(),
    party: [...s.partyOrder],
    difficulty: s.difficulty,
    result: s.campaign.result,
    rounds: s.round,
    xp: s.campaign.xp,
  });
  localStorage.setItem(RECORD_KEY, JSON.stringify(entries.slice(-200)));
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
