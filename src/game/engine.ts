import { BAGS, CONNECTIONS, STARTER_DECKS, card, code } from "./data";
import { visibleSnapshot, presentEffect, presentAction } from "./presentation";
import type {
  Action,
  Asset,
  Choice,
  Decision,
  Difficulty,
  Effect,
  Enemy,
  GameState,
  Instance,
  Investigator,
  Skill,
  Test,
  PlayerWindow,
  TimingGroup,
} from "./types";
const SKILLS: Skill[] = ["willpower", "intellect", "combat", "agility"];
const C = code;
const eff = (kind: string, extra: Omit<Effect, "kind"> = {}): Effect => ({
  kind,
  ...extra,
});
const option = (
  id: string,
  label: string,
  effects: Effect[],
  detail?: string,
): Choice => ({ id, label, effects, detail });
function random(s: GameState) {
  let x = s.seed;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.seed = x >>> 0;
  return s.seed / 4294967296;
}
function shuffle<T>(s: GameState, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function instance(s: GameState, c: string): Instance {
  return { id: `i${s.nextId++}`, code: c };
}
function log(
  s: GameState,
  text: string,
  tone: "neutral" | "good" | "bad" | "story" = "neutral",
) {
  s.log.push({ id: s.nextId++, round: s.round, text, tone });
  if (s.log.length > 250) s.log.shift();
}
function front(s: GameState, ...effects: Effect[]) {
  s.queue.unshift(
    ...effects.map((e) => ({ ...e, actor: e.actor || s.player.code })),
  );
}
function choice(
  s: GameState,
  title: string,
  description: string,
  choices: Choice[],
) {
  s.decision = { title, description, choices };
}
const skip = option("skip", "Continue", []);
export const party = (s: GameState): Investigator[] =>
  [s.player, ...s.companions].sort(
    (a, b) => s.partyOrder.indexOf(a.code) - s.partyOrder.indexOf(b.code),
  );
const survivors = (s: GameState) => {
  const ps = party(s).filter((p) => p.status === "active");
  const lead = ps.findIndex((p) => p.code === s.leadInvestigator);
  return lead > 0 ? [...ps.slice(lead), ...ps.slice(0, lead)] : ps;
};
export const partySize = (s: GameState) => s.partyOrder.length;
export const health = (s: GameState, p = s.player) => card(p.code).health || 7;
export const sanity = (s: GameState, p = s.player) => card(p.code).sanity || 7;
export const enemyHealth = (s: GameState, e: Enemy) =>
  (card(e.code).health || 1) *
  (card(e.code).health_per_investigator ? partySize(s) : 1);
function focus(s: GameState, c: string) {
  if (s.player.code === c) return;
  const index = s.companions.findIndex((p) => p.code === c);
  if (index < 0) return;
  [s.player, s.companions[index]] = [s.companions[index], s.player];
}
function enqueue(s: GameState, ...effects: Effect[]) {
  s.queue.push(
    ...effects.map((e) => ({ ...e, actor: e.actor || s.player.code })),
  );
}
const ownTurn = (s: GameState) =>
  s.phase === "investigation" &&
  s.turnInvestigator === s.player.code &&
  s.player.turnStarted &&
  !s.player.turnEnded;
type FastOption = { id: string; actor: string; label: string; action: Action };
export function fastOptions(s: GameState): FastOption[] {
  if (!s.window || s.status !== "playing") return [];
  const options: FastOption[] = [];
  for (const p of survivors(s)) {
    if (!mayParticipate(s, p.code)) continue;
    const view = {
      ...s,
      player: p,
      companions: party(s).filter((x) => x.code !== p.code),
      event: null,
    };
    const add = (id: string, label: string, action: Action) =>
      options.push({ id: `${p.code}:${id}`, actor: p.code, label, action });
    for (const c of p.hand)
      if (!canPlay(view, c.id))
        add(
          c.id,
          `Play ${card(c.code).name} · ${card(c.code).cost || 0} resource${card(c.code).cost === 1 ? "" : "s"}`,
          { type: "play", id: c.id },
        );
    for (const en of s.enemies)
      for (const kind of ["wrench", "clueDamage"])
        if (!canAct(view, kind, en.id))
          add(
            `${kind}:${en.id}`,
            `${kind === "wrench" ? "Daniela’s Wrench" : "Blaze of Glory"} · ${card(en.code).name}`,
            { type: "act", kind, target: en.id },
          );
    for (const target of availableConnections(view))
      for (const kind of ["olivier", "move"])
        if (!canAct(view, kind, target))
          add(
            `${kind}:${target}`,
            `${kind === "olivier" ? "Olivier Bishop" : "Miskatonic Quad"} · move to ${card(target).name}`,
            { type: "act", kind, target },
          );
    if (!canAct(view, "jumpsuit"))
      add("jumpsuit", "Jumpsuit · recover a Tool or Weapon", {
        type: "act",
        kind: "jumpsuit",
      });
    const t = s.window.test;
    if (t && s.window.actor === p.code && p.resources > 0)
      for (const a of p.assets)
        if (boostAmount(a, t))
          add(
            `boost:${a.id}`,
            `${card(a.code).name} · +${boostAmount(a, t)} ${t.skill} · 1 resource`,
            { type: "boost", id: a.id },
          );
  }
  return options;
}
function boostAmount(a: Asset, t: Test): number {
  const matches: Record<string, Skill[]> = {
    [C(17)]: ["combat", "agility"],
    [C(35)]: ["intellect", "willpower"],
    [C(47)]: ["intellect", "agility"],
    [C(76)]: ["willpower", "agility"],
  };
  const doubled: Record<string, string[]> = {
    [C(17)]: ["fight", "evade"],
    [C(35)]: ["investigate", "parley"],
    [C(47)]: ["evade", "parley"],
    [C(76)]: ["treachery", "extinguish", "parley"],
  };
  return matches[a.code]?.includes(t.skill)
    ? doubled[a.code].includes(t.kind)
      ? 2
      : 1
    : 0;
}
function openWindow(s: GameState, window: PlayerWindow) {
  focus(s, window.actor);
  s.window = window;
  if (
    (window.test &&
      party(s).find((p) => p.code === window.actor)?.status !== "active") ||
    !fastOptions(s).length
  )
    closeWindow(s);
}
function closeWindow(s: GameState) {
  const w = s.window;
  if (!w) return;
  delete s.window;
  focus(s, w.actor);
  if (w.test) {
    if (s.player.status !== "active") {
      front(
        s,
        eff("endTest", { actor: "scenario", data: { ids: w.test.committed } }),
      );
      return;
    }
    s.test = w.test;
    s.test.base = stats(s, s.test.skill, s.test.kind);
    if (w.timing === "beforeToken") reveal(s);
  }
}
function ordered(
  s: GameState,
  title: string,
  groups: TimingGroup[],
  actor = s.player.code,
) {
  front(
    s,
    eff("orderEffects", {
      actor: "scenario",
      title,
      target: actor,
      data: {
        groups: groups.map((g) => ({
          ...g,
          effects: g.effects.map((e) => ({
            ...e,
            actor: e.actor || s.player.code,
          })),
        })),
      },
    }),
  );
}
const group = (
  label: string,
  effects: Effect[],
  priority = 2,
): TimingGroup => ({ label, effects, priority });
function timingEligible(s: GameState, g: TimingGroup) {
  const e = g.effects[0];
  if (!e) return false;
  const p = party(s).find((p) => p.code === e.actor) || s.player;
  if (
    REACTIONS.has(e.kind) &&
    (p.status !== "active" || !mayParticipate(s, p.code))
  )
    return false;
  const a = p.assets.find((a) => a.id === e.id);
  const at = s.locations.find((l) => l.code === p.location)!;
  switch (e.kind) {
    case "lessonLearned":
      return (
        p.hand.some((c) => c.code === C(22)) && p.resources >= 1 && at.clues > 0
      );
    case "daniela":
      return p.code === C(1) && !p.flags.daniela && !!activeEnemy(s, e.id);
    case "joe":
      return p.code === C(4) && !p.flags.joe;
    case "dorothy":
    case "assetReward":
    case "covert":
    case "logan":
      return !!a && !a.exhausted;
    case "bandage":
      return (
        !!a &&
        a.uses > 0 &&
        !!(
          party(s).find(
            (p) => p.code === e.target && p.status === "active" && p.damage > 0,
          ) ||
          party(s)
            .flatMap((p) => p.assets)
            .find((a) => a.id === e.target && a.damage > 0)
        )
      );
    case "bodyguard":
      return s.enemies.some((en) => en.location === p.location);
    case "lookFound":
      return (
        p.hand.some((c) => c.code === C(78)) && p.resources >= 2 && at.clues > 0
      );
    case "gatherIntel":
      return p.hand.some((c) => c.code === C(36)) && p.resources >= 1;
    case "hunt": {
      const en = activeEnemy(s, e.id);
      return !!en && !en.exhausted && !en.engaged;
    }
    default:
      return true;
  }
}
function resetEncounter(s: GameState) {
  if (!s.encounterDeck.length && s.encounterDiscard.length) {
    s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
    log(
      s,
      "The encounter deck is empty. Reshuffle the encounter discard pile.",
    );
  }
}
export function canSwitch(s: GameState, c: string): boolean {
  return (
    s.status === "playing" &&
    s.phase === "investigation" &&
    !s.test &&
    !s.decision &&
    !s.event &&
    !s.window &&
    !s.queue.length &&
    (!s.player.turnStarted ||
      s.player.turnEnded ||
      s.player.status !== "active") &&
    survivors(s).some((p) => p.code === c && !p.turnEnded)
  );
}
export const groupClues = (s: GameState, at?: string) =>
  survivors(s)
    .filter((p) => !at || p.location === at)
    .reduce((n, p) => n + p.clues, 0);
function spendGroupClues(s: GameState, n: number, at?: string) {
  // The controller explicitly chooses contributors when more than one can pay.
  const eligible = survivors(s).filter(
    (p) => (!at || p.location === at) && p.clues > 0,
  );
  if (n <= 0) return;
  if (eligible.length === 1) {
    eligible[0].clues -= n;
    return;
  }
  choice(
    s,
    "Spend group clues",
    `${n} clue${n === 1 ? "" : "s"} still required. Choose an investigator to contribute one.`,
    eligible.map((p) =>
      option(p.code, `${card(p.code).name} · ${p.clues} clues`, [
        eff("contributeClue", { target: p.code, amount: n, source: at }),
      ]),
    ),
  );
}
function elimination(s: GameState, status: "defeated" | "resigned") {
  const p = s.player;
  if (p.status !== "active") return;
  p.status = status;
  p.turnEnded = true;
  p.actions = 0;
  if (p.hand.some((c) => c.code === C(6))) p.flags.game_xpPenalty = 2;
  if (p.threats.includes(C(3))) p.physicalTrauma++;
  location(s).clues += p.clues;
  p.clues = 0;
  p.resources = 0;
  p.assets = [];
  p.threats.forEach((c) => {
    if (!card(c).subtype_code) s.encounterDiscard.push(c);
  });
  p.threats = [];
  for (const en of s.enemies)
    if (en.engaged && (!en.engagedWith || en.engagedWith === p.code)) {
      en.engaged = false;
      delete en.engagedWith;
    }
  log(
    s,
    `${card(p.code).name} ${status === "resigned" ? "resigns" : "is defeated"}.`,
    "bad",
  );
  s.enemies = s.enemies.filter((en) => en.owner !== p.code);
  const remaining = survivors(s);
  if (!remaining.length) {
    finish(s, status === "resigned" ? "resigned" : "defeat");
    return;
  }
  const replaceLead = s.leadInvestigator === p.code;
  if (replaceLead && remaining.length === 1)
    s.leadInvestigator = remaining[0].code;
  const suspended = s.queue.find(
    (e) => e.kind === "resumeTest" && e.actor === p.code,
  );
  if (suspended) s.queue = s.queue.filter((e) => e !== suspended);
  const follow = [
    ...(suspended
      ? [
          eff("endTest", {
            actor: p.code,
            data: { ids: (suspended.data!.test as unknown as Test).committed },
          }),
        ]
      : []),
    ...(replaceLead && remaining.length > 1
      ? [eff("chooseLead", { actor: "scenario" })]
      : []),
    eff("engagement", { actor: remaining[0].code }),
    eff("act2check", { actor: remaining[0].code }),
  ];
  // Everyone hit by simultaneous damage must check defeat before engagement or
  // replacement-lead choices can offer an investigator who is already dying.
  let after = 0;
  while (s.queue[after]?.kind === "defeatCheck") after++;
  s.queue.splice(after, 0, ...follow);
  if (s.phase === "investigation" && s.turnInvestigator === p.code)
    enqueue(s, eff("nextTurn", { actor: "scenario" }));
}
export const location = (s: GameState) =>
  s.locations.find((l) => l.code === s.player.location)!;
export const engaged = (s: GameState) =>
  s.enemies.filter(
    (e) => e.engaged && (!e.engagedWith || e.engagedWith === s.player.code),
  );
export const availableConnections = (s: GameState, from = s.player.location) =>
  (CONNECTIONS[from] || []).filter((c) =>
    s.locations.some((l) => l.code === c && l.active),
  );
const has = (s: GameState, c: string) =>
  s.player.assets.find((a) => a.code === c);
const activeEnemy = (s: GameState, id?: string) =>
  s.enemies.find((e) => e.id === id);
const handCard = (s: GameState, id?: string) =>
  s.player.hand.find((c) => c.id === id);
function asset(s: GameState, id?: string) {
  return s.player.assets.find((a) => a.id === id);
}
function removeHand(s: GameState, id: string, discard = true) {
  const i = s.player.hand.findIndex((c) => c.id === id);
  if (i < 0) return;
  const [c] = s.player.hand.splice(i, 1);
  if (discard) s.player.discard.push(c);
  return c;
}
function enterLimbo(s: GameState, id: string, owner = s.player) {
  const i = owner.hand.findIndex((c) => c.id === id);
  if (i < 0) return;
  const [c] = owner.hand.splice(i, 1);
  (s.limbo ||= []).push({ ...c, owner: owner.code });
}
function leaveLimbo(s: GameState, ids: string[], discard = true) {
  for (const c of s.limbo || []) {
    if (!ids.includes(c.id)) continue;
    const owner = party(s).find((p) => p.code === c.owner)!;
    (discard ? owner.discard : owner.hand).push({ id: c.id, code: c.code });
  }
  s.limbo = (s.limbo || []).filter((c) => !ids.includes(c.id));
}
const mayParticipate = (s: GameState, actor: string) =>
  !s.peril || s.peril === actor;
const REACTIONS = new Set([
  "daniela",
  "bandage",
  "bodyguard",
  "gatherIntel",
  "hunterInstinct",
  "assetReward",
  "lessonLearned",
  "logan",
  "covert",
  "aleks",
  "dorothy",
  "joe",
  "lookFound",
  "cleaverHeal",
]);
function discardable(s: GameState) {
  return s.player.hand.filter((c) => !card(c.code).subtype_code);
}
export function stats(s: GameState, skill: Skill, kind = "", p = s.player) {
  const owns = (c: string) => p.assets.some((a) => a.code === c);
  let n = card(p.code)[`skill_${skill}`] || 0;
  if (skill === "intellect") {
    if (owns(C(30))) n++;
    if (kind === "investigate" && owns(C(34))) n++;
    if (owns(C(115))) n++;
  }
  if (skill === "combat" && owns(C(18))) n++;
  if (skill === "agility" && owns(C(46))) n++;
  if (skill === "willpower" && owns(C(115))) n++;
  return n;
}
export function createGame(
  difficulty: Difficulty = "standard",
  seed = Date.now() >>> 0 || 1,
  investigatorCodes: string[] = [C(4)],
): GameState {
  if (
    investigatorCodes.length < 1 ||
    investigatorCodes.length > 3 ||
    new Set(investigatorCodes).size !== investigatorCodes.length ||
    investigatorCodes.some((c) => !STARTER_DECKS[c])
  )
    throw new Error("Choose 1–3 different supported investigators.");
  const s: GameState = {
    version: 3,
    id: `case-${seed}`,
    seed: seed || 1,
    nextId: 1,
    difficulty,
    status: "mulligan",
    phase: "investigation",
    round: 1,
    act: 1,
    agenda: 1,
    doom: 0,
    player: {
      code: investigatorCodes[0],
      actions: 3,
      actionsTaken: 0,
      turnEnded: false,
      turnStarted: false,
      mulliganDone: false,
      status: "active",
      flags: {},
      xp: 0,
      physicalTrauma: 0,
      mentalTrauma: 0,
      location: C(113),
      resources: 5,
      clues: 0,
      damage: 0,
      horror: 0,
      hand: [],
      deck: [],
      discard: [],
      assets: [],
      threats: [],
    },
    companions: [],
    partyOrder: [...investigatorCodes],
    leadInvestigator: investigatorCodes[0],
    turnInvestigator: investigatorCodes[0],
    locations: [113, 117, 116, 118, 119, 120].map((n) => ({
      code: C(n),
      revealed: n === 113,
      active: n === 113,
      clues: n === 113 ? 2 * investigatorCodes.length : 0,
      fire: false,
      reduction: 0,
    })),
    enemies: [],
    encounterDeck: [],
    encounterDiscard: [],
    fireSetAside: 5,
    flags: {},
    bag: [...BAGS[difficulty]],
    queue: [],
    event: null,
    eventHistory: [],
    eventSerial: 0,
    decision: null,
    test: null,
    log: [],
    error: null,
    victory: [],
    campaign: {
      notes: [],
      xp: 0,
      physicalTrauma: 0,
      mentalTrauma: 0,
      result: null,
    },
  };
  s.companions = investigatorCodes
    .slice(1)
    .map((c) => ({ ...structuredClone(s.player), code: c }));
  for (const p of party(s)) {
    p.deck = shuffle(
      s,
      STARTER_DECKS[p.code].map((c) => instance(s, c)),
    );
    const setAside: Instance[] = [];
    while (p.hand.length < 5) {
      const c = p.deck.shift()!;
      if (card(c.code).subtype_code) setAside.push(c);
      else p.hand.push(c);
    }
    p.deck = shuffle(s, [...p.deck, ...setAside]);
  }
  s.encounterDeck = shuffle(
    s,
    [
      121, 121, 122, 122, 123, 123, 123, 124, 124, 124, 125, 125, 126, 126, 127,
      127, 128, 128, 130, 130, 131, 131, 132, 132,
    ].map(C),
  );
  log(
    s,
    "You arrive at Miskatonic University. Your friend is missing. The room is in disarray.",
    "story",
  );
  return s;
}
function checkDefeat(s: GameState) {
  if (s.player.status !== "active") return;
  if (s.player.damage >= health(s) || s.player.horror >= sanity(s)) {
    if (s.player.damage >= health(s) && s.player.horror >= sanity(s)) {
      choice(
        s,
        "Choose trauma",
        "Damage and horror defeated you simultaneously. Choose one type of trauma.",
        [
          option("physical", "Suffer 1 physical trauma", [
            eff("defeat", { source: "physical" }),
          ]),
          option("mental", "Suffer 1 mental trauma", [
            eff("defeat", { source: "mental" }),
          ]),
        ],
      );
      return;
    }
    if (s.player.damage >= health(s)) s.player.physicalTrauma++;
    if (s.player.horror >= sanity(s)) s.player.mentalTrauma++;
    elimination(s, "defeated");
  }
}
function victoryXP(s: GameState) {
  return (
    s.victory.reduce((a, c) => a + (card(c).victory || 0), 0) +
    s.locations
      .filter((l) => l.active && l.revealed && l.clues === 0)
      .reduce((a, l) => a + (card(l.code).victory || 0), 0)
  );
}
function finish(s: GameState, result: string) {
  delete s.window;
  s.resolutionDepth = 0;
  leaveLimbo(
    s,
    (s.limbo || []).map((c) => c.id),
  );
  delete s.peril;
  s.queuedTests = [];
  s.testInProgress = false;
  s.status = "resolution";
  s.test = null;
  s.decision = null;
  s.queue = [];
  s.campaign.result = result;
  const success = result === "saved" || result === "pursuer";
  const earned =
    victoryXP(s) + (success ? 3 : 2) + (result === "saved" ? 1 : 0);
  const bearer =
    party(s).find((p) => p.code === s.campaign.armitageBearer) ||
    party(s).find((p) => p.assets.some((a) => a.code === C(115))) ||
    s.player;
  for (const p of party(s)) {
    const penalty =
      p.flags.game_xpPenalty || (p.hand.some((c) => c.code === C(6)) ? 2 : 0);
    p.xp = Math.max(0, earned - Number(penalty));
    if (p.status === "active" && p.threats.includes(C(3))) p.physicalTrauma++;
    if (result === "saved") p.physicalTrauma++;
    else p.mentalTrauma++;
  }
  s.campaign.xp = s.player.xp;
  s.campaign.physicalTrauma = s.player.physicalTrauma;
  s.campaign.mentalTrauma = s.player.mentalTrauma;
  if (success)
    s.campaign.notes.push(
      "The investigators defeated their masked pursuer.",
      `${card(bearer.code).name} is the bearer of Dr. Henry Armitage.`,
    );
  s.campaign.notes.push(
    result === "saved"
      ? "The investigators saved Miskatonic University."
      : "Miskatonic University burned.",
  );
  log(
    s,
    result === "saved"
      ? "The university is saved. The investigation will continue."
      : "Smoke rises over Miskatonic. This night will stay with you.",
    "story",
  );
}
function discardEnemy(
  s: GameState,
  e: Enemy,
  defeated = false,
  credit = true,
  collect?: TimingGroup[],
) {
  s.enemies = s.enemies.filter((x) => x.id !== e.id);
  if (defeated && card(e.code).victory) {
    if (!s.victory.includes(e.code)) s.victory.push(e.code);
  } else if (e.owner)
    party(s)
      .find((p) => p.code === e.owner)
      ?.discard.push({ id: e.id, code: e.code });
  else s.encounterDiscard.push(e.code);
  if (!defeated) return;
  log(s, `${card(e.code).name} is defeated.`, "good");
  const follow: TimingGroup[] = [];
  if (e.code === C(123))
    follow.push(
      group(
        "Bystander · Doomed",
        [eff("doom", { amount: 1, actor: s.leadInvestigator })],
        0,
      ),
    );
  if (e.code === C(132))
    follow.push(
      group(
        "Mutated Experiment · horror",
        [
          eff("damageGroup", {
            actor: "scenario",
            data: {
              effects: survivors(s)
                .filter((p) => p.location === e.location)
                .map((p) => eff("damage", { horror: 1, actor: p.code })),
            },
          }),
        ],
        0,
      ),
    );
  if (e.code === C(114) && s.act === 4)
    follow.push(group("The Experiment · objective", [eff("victory")], 0));
  const logan = has(s, C(18));
  if (credit && logan && !logan.exhausted)
    follow.push(
      group("Logan Hastings", [
        eff("logan", { id: logan.id, actor: s.player.code }),
      ]),
    );
  if (collect) collect.push(...follow);
  else ordered(s, "Choose defeat effect order", follow, s.leadInvestigator);
}
function enemyDamage(s: GameState, id: string, n: number, credit = true) {
  const e = activeEnemy(s, id);
  if (!e) return;
  e.damage += n;
  const triggers: TimingGroup[] = [];
  if (credit && n > 0 && s.player.threats.includes(C(3))) {
    s.player.flags.game_harmsWay =
      Number(s.player.flags.game_harmsWay || 0) + 1;
    if (Number(s.player.flags.game_harmsWay) >= 3) {
      s.player.threats = s.player.threats.filter((c) => c !== C(3));
      s.player.discard.push(instance(s, C(3)));
    }
    triggers.push(
      group(
        "In Harm’s Way",
        [eff("damage", { damage: 1, actor: s.player.code, source: C(3) })],
        1,
      ),
    );
  }
  if (e.damage >= enemyHealth(s, e)) discardEnemy(s, e, true, credit, triggers);
  ordered(s, "Choose damage effect order", triggers, s.leadInvestigator);
}
function discardAsset(
  s: GameState,
  id: string,
  defeated = false,
  collect?: TimingGroup[],
) {
  const owner = party(s).find((p) => p.assets.some((a) => a.id === id));
  const a = owner?.assets.find((a) => a.id === id);
  if (!a) return;
  owner!.assets = owner!.assets.filter((x) => x.id !== id);
  owner!.discard.push({ id: a.id, code: a.code });
  log(s, `${card(a.code).name} ${defeated ? "is defeated" : "is discarded"}.`);
  if (
    defeated &&
    a.code === C(16) &&
    s.enemies.some((e) => e.location === owner!.location)
  ) {
    const g = group(`Bodyguard · ${card(owner!.code).name}`, [
      eff("bodyguard", { actor: owner!.code }),
    ]);
    if (collect) collect.push(g);
    else ordered(s, "Choose reaction order", [g]);
  }
}
function testStart(
  s: GameState,
  kind: string,
  skill: Skill,
  difficulty: number,
  title: string,
  target?: string,
  source?: string,
  bonus = 0,
) {
  const test: Test = {
    kind,
    skill,
    difficulty: Math.max(0, difficulty),
    title,
    target,
    source,
    base: stats(s, skill, kind),
    bonus,
    committed: [],
    stage: "commit",
    tokens: [],
    modifier: 0,
  };
  if (s.testInProgress)
    (s.queuedTests ||= []).push({ actor: s.player.code, test });
  else {
    s.testInProgress = true;
    openWindow(s, {
      timing: "beforeCommit",
      title: "Before committing cards",
      actor: s.player.code,
      test,
    });
  }
  return test;
}
function draw(s: GameState, n = 1) {
  front(s, eff("drawOne", { amount: n }));
}
function receiveDraw(s: GameState, cards: Instance[]) {
  s.player.hand.push(...cards);
  for (const c of cards) log(s, `Drew ${card(c.code).name}.`);
  front(s, ...cards.map((c) => eff("drawnCard", { id: c.id, code: c.code })));
}
function discover(s: GameState, n: number, target = s.player.location) {
  const l = s.locations.find((x) => x.code === target)!;
  const found = Math.min(l.clues, n);
  if (!found) return;
  l.clues -= found;
  s.player.clues += found;
  log(
    s,
    `Discovered ${found} clue${found === 1 ? "" : "s"} at ${card(target).name}.`,
    "good",
  );
  const triggers: TimingGroup[] = [];
  if (s.player.threats.includes(C(125)))
    triggers.push(
      group(
        "Unspeakable Truths · take 1 horror",
        [eff("damage", { horror: 1, source: C(125) })],
        0,
      ),
    );
  if (target === C(118))
    triggers.push(
      group(
        "Science Hall · discard a card",
        [eff("discardChoice", { title: "Science Hall", amount: 1 })],
        0,
      ),
    );
  if (target === C(119) && !s.player.flags.observatory) {
    triggers.push(
      group("Warren Observatory", [
        eff("optionalDraw", {
          title: "Warren Observatory",
          amount: 1,
          source: "observatory",
        }),
      ]),
    );
  }
  ordered(s, "Choose discovery effect order", triggers, s.leadInvestigator);
}
function revealLocation(s: GameState, c: string) {
  const l = s.locations.find((l) => l.code === c)!;
  if (!l.revealed) {
    l.revealed = true;
    l.clues =
      (card(c).clues || 0) *
      (card(c).clues_per_investigator === false ? 1 : partySize(s));
    log(s, `Discovered ${card(c).name}.`, "story");
  }
}
function move(s: GameState, target: string) {
  s.player.location = target;
  revealLocation(s, target);
  s.enemies
    .filter(
      (e) => e.engaged && (!e.engagedWith || e.engagedWith === s.player.code),
    )
    .forEach((e) => {
      e.location = target;
      e.engagedWith = s.player.code;
    });
  if (s.player.threats.includes(C(104)) && !s.player.flags.woundedMove) {
    s.player.flags.woundedMove = true;
    front(s, eff("damage", { damage: 1, source: C(104) }));
  }
  log(s, `Moved to ${card(target).name}.`);
  front(s, eff("engagement"), eff("act2check"));
}
function distance(s: GameState, a: string, b: string) {
  const q: [[string, number]] = [[a, 0]];
  const seen = new Set<string>();
  while (q.length) {
    const [c, n] = q.shift()!;
    if (c === b) return n;
    seen.add(c);
    for (const next of availableConnections(s, c))
      if (!seen.has(next)) q.push([next, n + 1]);
  }
  return Infinity;
}
function spawn(s: GameState, c: string, target = s.player.location) {
  const e: Enemy = {
    ...instance(s, c),
    location: target,
    damage: 0,
    exhausted: false,
    engaged: false,
    owner: card(c).subtype_code ? s.player.code : undefined,
  };
  s.enemies.push(e);
  log(s, `${card(c).name} appears at ${card(target).name}.`, "bad");
  ordered(
    s,
    "Choose arrival reaction order",
    survivors(s)
      .filter((p) => p.location === target)
      .map((p) =>
        group(`Gather Intel · ${card(p.code).name}`, [
          eff("gatherIntel", { actor: p.code }),
        ]),
      ),
    s.leadInvestigator,
  );
  front(s, eff("engagement"));
}
function fire(s: GameState) {
  const eligible = s.locations.filter((l) => l.active && !l.fire);
  if (!eligible.length) {
    s.encounterDiscard.push(C(129));
    return;
  }
  const min = Math.min(
    ...eligible.map((l) => distance(s, s.player.location, l.code)),
  );
  const nearest = eligible.filter(
    (l) => distance(s, s.player.location, l.code) === min,
  );
  if (nearest.length === 1) {
    nearest[0].fire = true;
    log(s, `Fire spreads to ${card(nearest[0].code).name}.`, "bad");
  } else
    choice(
      s,
      "The fire spreads",
      "Choose an equally near location for Fire! to attach to.",
      nearest.map((l) =>
        option(l.code, card(l.code).name, [
          eff("attachFire", { target: l.code }),
        ]),
      ),
    );
}
function advanceAgenda(s: GameState) {
  const limit = [3, 5, 10][s.agenda - 1];
  if (s.doom < limit) return;
  s.doom = 0;
  s.agenda++;
  log(
    s,
    `The agenda advances. ${s.agenda <= 3 ? card(C(105 + s.agenda)).name : "The campus is consumed."}`,
    "bad",
  );
  if (s.agenda === 2)
    front(
      s,
      ...survivors(s).map((p) =>
        eff("test", {
          actor: p.code,
          skill: "willpower",
          difficulty: 3,
          title: "Past Curfew",
          source: "agenda1",
        }),
      ),
    );
  if (s.agenda === 3) {
    if (s.fireSetAside > 1) {
      s.encounterDiscard.push(...Array(s.fireSetAside - 1).fill(C(129)));
      s.fireSetAside = 1;
    }
    front(
      s,
      ...survivors(s).map((p) =>
        eff("test", {
          actor: p.code,
          skill: "agility",
          difficulty: 3,
          title: "Lit Up",
          source: "agenda2",
        }),
      ),
    );
  }
  if (s.agenda === 4) {
    for (const p of survivors(s)) {
      p.physicalTrauma++;
      p.status = "defeated";
      p.turnEnded = true;
    }
    finish(s, "overrun");
  }
}
function advanceAct(s: GameState) {
  if (s.act === 1) {
    // Clues were paid as a group before advancing.
    s.act = 2;
    for (const en of [...s.enemies]) discardEnemy(s, en);
    for (const c of [C(117), C(116)])
      s.locations.find((l) => l.code === c)!.active = true;
    s.locations.find((l) => l.code === C(113))!.fire = true;
    s.fireSetAside = Math.max(0, s.fireSetAside - 1);
    s.encounterDiscard.push(...Array(s.fireSetAside).fill(C(129)));
    s.fireSetAside = 0;
    spawn(s, C(114), C(117));
    log(
      s,
      "Flames engulf the room. A masked figure waits in the dormitories. Reach Miskatonic Quad.",
      "story",
    );
  } else if (s.act === 2) {
    s.act = 3;
    for (const en of [...s.enemies])
      if (en.code !== C(114)) discardEnemy(s, en);
    s.enemies = [];
    s.victory = s.victory.filter((c) => c !== C(114));
    const room = s.locations.find((l) => l.code === C(113))!;
    if (room.fire) s.encounterDiscard.push(C(129));
    room.fire = false;
    room.clues = 0;
    room.active = false;
    for (const l of s.locations) if (l.code !== C(113)) l.active = true;
    log(
      s,
      `You escape the dorms. Search the campus and bring ${3 * partySize(s)} group clues to Orne Library.`,
      "story",
    );
  } else if (s.act === 3) {
    // Clues were paid by investigators at Orne Library.
    s.act = 4;
    const armitage: Asset = {
      ...instance(s, C(115)),
      exhausted: false,
      uses: 0,
      damage: 0,
      horror: 0,
    };
    s.player.assets.push(armitage);
    front(s, eff("chooseArmitage"));
    spawn(s, C(114), C(116));
    s.locations.find((l) => l.code === C(116))!.clues += 3 * partySize(s);
    for (let i = 0; i < partySize(s); i++) {
      const d = s.encounterDeck.indexOf(C(129)),
        x = s.encounterDiscard.indexOf(C(129));
      if (d >= 0) {
        s.encounterDeck.splice(d, 1);
        shuffle(s, s.encounterDeck);
      } else if (x >= 0) s.encounterDiscard.splice(x, 1);
      else break;
      front(s, eff("fire", { actor: s.leadInvestigator }));
    }
    log(
      s,
      "Dr. Armitage joins you. Defeat the Servant of Flame. Clues can now deal damage.",
      "story",
    );
  }
}
function encounter(s: GameState, c: string) {
  log(s, `Encounter: ${card(c).name}.`, "bad");
  if (card(c).type_code === "enemy") {
    spawn(s, c);
    return;
  }
  switch (c) {
    case "12124":
      choice(
        s,
        "Cosmic Evils",
        "Choose the doom, or endure the pain and draw another encounter.",
        [
          option("doom", "Place 1 doom", [eff("doom", { amount: 1 })]),
          option("pain", "Take 1 damage and 1 horror · Surge", [
            eff("damage", { damage: 1, horror: 1, direct: true }),
            eff("surge"),
          ]),
        ],
      );
      break;
    case "12125":
      if (!s.player.threats.includes(c)) s.player.threats.push(c);
      else s.encounterDiscard.push(c);
      break;
    case "12126":
      if (s.player.clues === 0) front(s, eff("surge"));
      else
        testStart(
          s,
          "treachery",
          "intellect",
          3,
          "Forbidden Secrets",
          undefined,
          c,
        );
      break;
    case "12127":
      choice(
        s,
        "Extraplanar Visions",
        "Choose a skill. Difficulty equals the number of cards in your hand.",
        (["willpower", "intellect"] as Skill[]).map((k) =>
          option(k, `${k} (${stats(s, k)})`, [
            eff("test", {
              skill: k,
              difficulty: s.player.hand.length,
              title: card(c).name,
              source: c,
            }),
          ]),
        ),
      );
      break;
    case "12128":
      testStart(
        s,
        "treachery",
        "willpower",
        3,
        "Wild Compulsion",
        undefined,
        c,
      );
      break;
    case "12129":
      fire(s);
      break;
    case "12130":
      choice(
        s,
        "Noxious Smoke",
        "Choose a skill to escape the smoke.",
        (["willpower", "agility"] as Skill[]).map((k) =>
          option(k, `${k} (${stats(s, k)})`, [
            eff("test", {
              skill: k,
              difficulty: 3,
              title: card(c).name,
              source: c,
            }),
          ]),
        ),
      );
      break;
    case "12131":
      testStart(
        s,
        "treachery",
        "willpower",
        s.enemies.some((e) => e.location === s.player.location) ? 4 : 2,
        "Mutated!",
        undefined,
        c,
      );
      break;
  }
}
type Allocation = Record<string, { damage: number; horror: number }>;
function damageWindow(s: GameState, e: Effect) {
  const dmg = e.damage || 0,
    hor = e.horror || 0;
  const allocations = structuredClone(
    (e.data?.allocations || {}) as Allocation,
  );
  if (!dmg && !hor) {
    const remaining = (e.data?.remaining || []) as Effect[];
    if (remaining.length) {
      const [next, ...rest] = remaining;
      front(s, { ...next, data: { allocations, remaining: rest } });
    } else
      front(
        s,
        eff("applyDamage", {
          source: e.source,
          data: { ...e.data, allocations },
        }),
      );
    return;
  }
  const type = dmg > 0 ? "damage" : "horror";
  const eligible = e.direct
    ? []
    : survivors(s)
        .filter((p) => p.location === s.player.location)
        .flatMap((p) =>
          p.assets.filter(
            (a) =>
              p.code === s.player.code ||
              (type === "damage" && a.code === C(16)),
          ),
        )
        .filter(
          (a) =>
            (card(a.code)[type === "damage" ? "health" : "sanity"] || 0) >
            a[type] + (allocations[a.id]?.[type] || 0),
        );
  if (!eligible.length) {
    const self = allocations[s.player.code] || { damage: 0, horror: 0 };
    self[type] += type === "damage" ? dmg : hor;
    allocations[s.player.code] = self;
    front(
      s,
      eff("damage", {
        damage: type === "damage" ? 0 : dmg,
        horror: type === "horror" ? 0 : hor,
        direct: e.direct,
        source: e.source,
        data: { ...e.data, allocations },
      }),
    );
    return;
  }
  const assign = (id: string): Effect[] => {
    const next = structuredClone(allocations);
    next[id] ||= { damage: 0, horror: 0 };
    next[id][type]++;
    return [
      eff("damage", {
        damage: dmg - (type === "damage" ? 1 : 0),
        horror: hor - (type === "horror" ? 1 : 0),
        direct: e.direct,
        source: e.source,
        data: { ...e.data, allocations: next },
      }),
    ];
  };
  choice(
    s,
    `Assign ${dmg ? `${dmg} damage` : ""}${dmg && hor ? " and " : ""}${hor ? `${hor} horror` : ""}`,
    "Choose where each point goes. All assigned damage and horror are applied together.",
    [
      option(
        "self",
        `${card(s.player.code).name} · take 1 ${type}`,
        assign(s.player.code),
      ),
      ...eligible.map((a) =>
        option(
          a.id,
          `${card(a.code).name} (${card(party(s).find((p) => p.assets.some((x) => x.id === a.id))!.code).name}) · take 1 ${type}`,
          assign(a.id),
          `${a[type] + (allocations[a.id]?.[type] || 0)} of ${card(a.code)[type === "damage" ? "health" : "sanity"]} ${type} assigned`,
        ),
      ),
    ],
  );
}
function drain(s: GameState) {
  let iterations = 0;
  while (
    s.queue.length &&
    !s.event &&
    !s.decision &&
    !s.test &&
    !s.window &&
    s.status === "playing"
  ) {
    if (++iterations > 500) throw new Error("Effect loop exceeded safe bound");
    const e = s.queue.shift()!;
    if (e.actor && e.actor !== "scenario") focus(s, e.actor);
    if (
      e.actor !== "scenario" &&
      s.player.status !== "active" &&
      ![
        "nextTurn",
        "investigationEnd",
        "enemyPhase",
        "enemyAttacks",
        "upkeep",
        "roundEnd",
        "newRound",
        "investigation",
        "finish",
        "act2check",
        "engagement",
        "advanceAct",
        "doom",
        "endEncounter",
        "finishLimbo",
        "endTest",
        "exhaustEnemy",
        "queuedTest",
        "endResolution",
        "resumeWindow",
      ].includes(e.kind)
    )
      continue;
    if (REACTIONS.has(e.kind) && !mayParticipate(s, s.player.code)) continue;
    const before = visibleSnapshot(s);
    if (
      [
        "perform",
        "encounter",
        "revelation",
        "draw",
        "advanceAct",
        "doom",
      ].includes(e.kind)
    ) {
      if (!s.resolutionDepth) resetEncounter(s);
      s.resolutionDepth = (s.resolutionDepth || 0) + 1;
      front(s, eff("endResolution", { actor: "scenario" }));
    }
    switch (e.kind) {
      case "endResolution":
        s.resolutionDepth = Math.max(0, (s.resolutionDepth || 0) - 1);
        if (!s.resolutionDepth) resetEncounter(s);
        break;
      case "playerWindow":
        openWindow(s, {
          timing: "phase",
          title: e.title!,
          actor: s.player.code,
        });
        break;
      case "resumeWindow":
        openWindow(s, e.data!.window as unknown as PlayerWindow);
        break;
      case "orderEffects": {
        const groups = e.data!.groups as TimingGroup[];
        const available = groups
          .map((g, i) => ({ g, i }))
          .filter(({ g }) => timingEligible(s, g));
        if (!available.length) break;
        const priority = Math.min(...available.map(({ g }) => g.priority));
        const eligible = available.filter(({ g }) => g.priority === priority);
        const next = (i: number) => [
          ...groups[i].effects,
          { ...e, data: { groups: groups.filter((_, n) => n !== i) } },
        ];
        if (eligible.length === 1) front(s, ...next(eligible[0].i));
        else {
          focus(
            s,
            party(s).find((p) => p.code === e.target && p.status === "active")
              ?.code || s.leadInvestigator,
          );
          choice(
            s,
            e.title || "Choose effect order",
            `${card(s.player.code).name} chooses the next effect. Resolve it completely before choosing another.`,
            eligible.map(({ g, i }) => option(String(i), g.label, next(i))),
          );
        }
        break;
      }
      case "chooseLead":
        if (survivors(s).length === 1)
          s.leadInvestigator = survivors(s)[0].code;
        else
          choice(
            s,
            "Choose lead investigator",
            "The lead investigator has left the scenario. Choose a remaining investigator to lead the group.",
            survivors(s).map((p) =>
              option(p.code, card(p.code).name, [
                eff("setLead", { target: p.code, actor: "scenario" }),
              ]),
            ),
          );
        break;
      case "setLead":
        s.leadInvestigator = e.target!;
        log(
          s,
          `${card(e.target!).name} is now the lead investigator.`,
          "story",
        );
        break;
      case "finishLimbo":
        leaveLimbo(s, e.data!.ids as string[]);
        break;
      case "endTest":
        leaveLimbo(s, e.data!.ids as string[]);
        s.testInProgress = false;
        if (s.queuedTests?.length) {
          // Finish the action/event containing this test before starting a
          // queued test. Queued tests are FIFO, not nested effect-stack entries.
          let after = 0;
          while (
            [
              "finishLimbo",
              "freeMove",
              "endResolution",
              "endEncounter",
            ].includes(s.queue[after]?.kind)
          )
            after++;
          s.queue.splice(after, 0, eff("queuedTest", { actor: "scenario" }));
        }
        break;
      case "queuedTest": {
        const next = s.queuedTests?.shift();
        if (!next) break;
        focus(s, next.actor);
        if (s.player.status !== "active") {
          front(s, eff("queuedTest", { actor: "scenario" }));
          break;
        }
        s.testInProgress = true;
        openWindow(s, {
          timing: "beforeCommit",
          title: "Before committing cards",
          actor: next.actor,
          test: next.test,
        });
        break;
      }
      case "defeatCheck":
        checkDefeat(s);
        break;
      case "defeat":
        if (e.source === "physical") s.player.physicalTrauma++;
        else s.player.mentalTrauma++;
        elimination(s, "defeated");
        break;
      case "resumeTest":
        s.test = e.data!.test as unknown as Test;
        s.testInProgress = true;
        if (s.test.stage === "revealed") {
          refreshTest(s);
          logTestResult(s);
        }
        break;
      case "restoreTurn":
        break;
      case "daniela": {
        const en = activeEnemy(s, e.id);
        if (!en || s.player.code !== C(1) || s.player.flags.daniela) break;
        const weapons = s.player.assets.filter(
          (a) =>
            [C(2), C(19), C(20), C(45), C(77), C(86)].includes(a.code) &&
            (![C(19), C(45)].includes(a.code) || a.uses > 0),
        );
        choice(
          s,
          "Daniela strikes back",
          `Daniela’s reaction: after the enemy attack resolves, fight ${card(en.code).name} without spending an action (once per round). This is a counterattack, not a defense: it does not prevent the damage or horror. A firearm still spends 1 ammo.`,
          [
            option("basic", "Fight · bare hands", [
              eff("flag", { source: "daniela" }),
              eff("perform", { title: "fight", target: en.id }),
            ]),
            ...weapons.map((a) =>
              option(a.id, `Fight · ${card(a.code).name}`, [
                eff("flag", { source: "daniela" }),
                eff("perform", { title: "fight", target: en.id, source: a.id }),
              ]),
            ),
            option("skip", "Decline", []),
          ],
        );
        break;
      }
      case "elderDamage":
        if (s.enemies.some((en) => en.location === s.player.location))
          choice(
            s,
            "Daniela’s elder sign",
            "Deal 1 damage to an enemy at your location.",
            s.enemies
              .filter((en) => en.location === s.player.location)
              .map((en) =>
                option(en.id, card(en.code).name, [
                  eff("enemyDamage", { id: en.id, amount: 1 }),
                ]),
              ),
          );
        break;
      case "covert": {
        const a = asset(s, e.id);
        if (a && !a.exhausted)
          choice(
            s,
            "Covert Ops",
            "Exhaust Covert Ops after evading to draw a card or move.",
            [
              option("draw", "Draw 1 card", [
                eff("exhaust", { id: a.id }),
                eff("draw"),
              ]),
              ...availableConnections(s).map((c) =>
                option(c, `Move to ${card(c).name}`, [
                  eff("exhaust", { id: a.id }),
                  eff("move", { target: c }),
                ]),
              ),
              option("skip", "Decline", []),
            ],
          );
        break;
      }
      case "assetReward": {
        const a = asset(s, e.id);
        if (a && !a.exhausted)
          choice(
            s,
            card(a.code).name,
            `Exhaust this asset to ${e.source === "gain" ? "gain a resource" : "draw a card"}.`,
            [
              option("use", "Use ability", [
                eff("exhaust", { id: a.id }),
                eff(e.source!, { amount: e.amount }),
              ]),
              option("skip", "Decline", []),
            ],
          );
        break;
      }
      case "operativeAttack": {
        const en = activeEnemy(s, e.id);
        if (en) {
          en.exhausted = false;
          en.engaged = true;
          en.engagedWith = s.player.code;
          front(s, eff("attack", { id: en.id }));
        }
        break;
      }
      case "autoEvade":
        choice(
          s,
          "Breaking and Entering",
          "You succeeded by at least 2. You may automatically evade an enemy here.",
          [
            ...s.enemies
              .filter((en) => en.location === s.player.location)
              .map((en) =>
                option(en.id, `Evade ${card(en.code).name}`, [
                  eff("evadeEnemy", { id: en.id }),
                ]),
              ),
            option("skip", "Decline", []),
          ],
        );
        break;
      case "evadeEnemy":
        evadeEnemy(s, e.id!);
        break;
      case "freeMove":
        choice(
          s,
          "Slip into the shadows",
          "You may disengage from every enemy and move to a connecting location.",
          [
            ...availableConnections(s).map((c) =>
              option(c, `Move to ${card(c).name}`, [
                eff("disengage"),
                eff("move", { target: c }),
              ]),
            ),
            option("stay", "Stay here", []),
          ],
        );
        break;
      case "aleks": {
        const a = asset(s, e.id);
        if (!a) break;
        choice(
          s,
          "Aleksey Saburov",
          "At the beginning of your turn, heal 1 damage or horror from Aleksey.",
          [
            ...(a.damage
              ? [
                  option("damage", "Heal 1 damage", [
                    eff("healAsset", { id: a.id, damage: 1 }),
                  ]),
                ]
              : []),
            ...(a.horror
              ? [
                  option("horror", "Heal 1 horror", [
                    eff("healAsset", { id: a.id, horror: 1 }),
                  ]),
                ]
              : []),
            option("skip", "Decline", []),
          ],
        );
        break;
      }
      case "healAsset": {
        const a = party(s)
          .flatMap((p) => p.assets)
          .find((a) => a.id === e.id);
        if (a) {
          a.damage = Math.max(0, a.damage - (e.damage || 0));
          a.horror = Math.max(0, a.horror - (e.horror || 0));
        }
        break;
      }
      case "bandage": {
        const a = asset(s, e.id),
          target =
            party(s).find((p) => p.code === e.target) ||
            party(s)
              .flatMap((p) => p.assets)
              .find((a) => a.id === e.target);
        if (
          a &&
          a.uses > 0 &&
          target &&
          target.damage > 0 &&
          (!("status" in target) || target.status === "active")
        )
          choice(
            s,
            "Bandages",
            `Spend 1 supply to heal 1 damage from ${card(target.code).name}.`,
            [
              option("heal", "Use Bandages", [
                eff("supply", { id: a.id }),
                eff("healCard", { target: e.target }),
              ]),
              option("skip", "Decline", []),
            ],
          );
        break;
      }
      case "healCard": {
        const target =
          party(s).find((p) => p.code === e.target) ||
          party(s)
            .flatMap((p) => p.assets)
            .find((a) => a.id === e.target);
        if (target) target.damage = Math.max(0, target.damage - 1);
        break;
      }
      case "supply": {
        const a = asset(s, e.id);
        if (a) useSupply(s, a);
        break;
      }
      case "hunterInstinct": {
        const a = has(s, C(74));
        const eligible = s.player.discard.filter(
          (c) =>
            card(c.code).type_code === "event" &&
            !card(c.code).xp &&
            !card(c.code).subtype_code,
        );
        if (a && a.uses > 0 && !a.exhausted && eligible.length)
          choice(
            s,
            "Hunter’s Instinct",
            "After engaging an enemy, exhaust this asset and spend 1 supply to recover a level 0 event.",
            [
              ...eligible.map((c) =>
                option(c.id, card(c.code).name, [
                  eff("exhaust", { id: a.id }),
                  eff("supply", { id: a.id }),
                  eff("recover", { id: c.id }),
                ]),
              ),
              option("skip", "Decline", []),
            ],
          );
        break;
      }
      case "recover": {
        const i = s.player.discard.findIndex((c) => c.id === e.id);
        if (i >= 0) s.player.hand.push(...s.player.discard.splice(i, 1));
        break;
      }
      case "lookFound": {
        const c = s.player.hand.find((c) => c.code === C(78));
        if (c && s.player.resources >= 2 && location(s).clues)
          choice(
            s,
            "Look what I found!",
            "After failing an investigation by 2 or less, pay 2 resources to discover 2 clues.",
            [
              option("play", "Play · discover 2 clues", [
                eff("payEvent", { id: c.id, amount: 2 }),
                eff("discover", { amount: 2 }),
                eff("finishLimbo", { data: { ids: [c.id] } }),
              ]),
              option("skip", "Decline", []),
            ],
          );
        break;
      }
      case "cleaverBonus":
        choice(
          s,
          "Meat Cleaver",
          "Take 1 horror to deal 1 additional damage with this attack?",
          [
            option("horror", "Take 1 horror · +1 damage", [
              eff("damage", { horror: 1 }),
              eff("weaponTest", { target: e.target, id: e.id, amount: 1 }),
            ]),
            option("skip", "Attack normally", [
              eff("weaponTest", { target: e.target, id: e.id }),
            ]),
          ],
        );
        break;
      case "weaponTest": {
        const en = activeEnemy(s, e.target),
          a = asset(s, e.id);
        if (!en || !a) break;
        const bonus = sanity(s) - s.player.horror <= 3 ? 2 : 1;
        const test = testStart(
          s,
          "fight",
          "combat",
          card(en.code).enemy_fight || 0,
          `Fight ${card(en.code).name}`,
          en.id,
          a.id,
          bonus,
        );
        test.extraDamage = e.amount || 0;
        break;
      }
      case "cleaverHeal":
        if (!activeEnemy(s, e.id) && s.player.horror > 0)
          choice(
            s,
            "Meat Cleaver",
            "After defeating an enemy, you may heal 1 horror.",
            [
              option("heal", "Heal 1 horror", [eff("heal", { horror: 1 })]),
              option("skip", "Decline", []),
            ],
          );
        break;
      case "chooseKitSkill":
        choice(
          s,
          "Thieves’ Kit",
          "Choose the skill for this investigation.",
          (["intellect", "agility"] as Skill[]).map((skill) =>
            option(skill, `${skill} (${stats(s, skill, "investigate")})`, [
              eff("kitTest", { id: e.id, target: e.target, skill }),
            ]),
          ),
        );
        break;
      case "kitTest":
        testStart(
          s,
          "investigate",
          e.skill!,
          Math.max(
            0,
            (card(e.target!).shroud || 0) -
              s.locations.find((l) => l.code === e.target)!.reduction,
          ),
          `Investigate ${card(e.target!).name}`,
          e.target,
          e.id,
        );
        break;
      case "paintTown": {
        const top = s.encounterDeck
          .slice(0, 9)
          .filter(
            (c) =>
              card(c).type_code === "enemy" &&
              !card(c).traits?.includes("Elite"),
          );
        if (top.length)
          choice(
            s,
            "Paint the Town Red",
            "Draw one of these non-Elite enemies and gain resources equal to its printed health.",
            [...new Set(top)].map((c) =>
              option(c, `${card(c).name} · ${card(c).health} resources`, [
                eff("drawSearchedEnemy", { code: c }),
              ]),
            ),
          );
        else {
          shuffle(s, s.encounterDeck);
          log(s, "No non-Elite enemy found. Shuffle the encounter deck.");
        }
        break;
      }
      case "drawSearchedEnemy": {
        const i = s.encounterDeck.indexOf(e.code!);
        if (i >= 0) s.encounterDeck.splice(i, 1);
        shuffle(s, s.encounterDeck);
        s.player.resources += card(e.code!).health || 0;
        log(s, `Encounter revealed: ${card(e.code!).name}.`, "bad");
        front(s, eff("revelation", { code: e.code }));
        break;
      }
      case "prestidigitation": {
        const eligible = s.player.hand.filter(
          (c) =>
            card(c.code).type_code === "asset" &&
            card(c.code).traits?.includes("Item") &&
            Math.max(0, (card(c.code).cost || 0) - 2) <= s.player.resources &&
            (!card(c.code).is_unique ||
              !survivors(s).some((p) =>
                p.assets.some((a) => a.code === c.code),
              )),
        );
        if (eligible.length)
          choice(
            s,
            "Prestidigitation",
            "Play an Item with a 2-resource discount. Return an Item you control to your hand at the end of this turn.",
            eligible.map((c) =>
              option(
                c.id,
                `${card(c.code).name} · ${Math.max(0, (card(c.code).cost || 0) - 2)} resources`,
                [eff("discountEquip", { id: c.id })],
              ),
            ),
          );
        break;
      }
      case "discountEquip": {
        const c = handCard(s, e.id);
        if (c) {
          front(s, eff("equip", { id: c.id }));
          spend(s, Math.max(0, (card(c.code).cost || 0) - 2));
          s.player.flags.prestidigitation = true;
        }
        break;
      }
      case "returnItem": {
        const items = s.player.assets.filter((a) =>
          card(a.code).traits?.includes("Item"),
        );
        if (items.length)
          choice(
            s,
            "Prestidigitation · curtain call",
            "Return an Item asset you control to your hand.",
            items.map((a) =>
              option(a.id, card(a.code).name, [
                eff("returnAsset", { id: a.id }),
              ]),
            ),
          );
        break;
      }
      case "returnAsset": {
        const a = asset(s, e.id);
        if (a) {
          s.player.assets = s.player.assets.filter((x) => x.id !== a.id);
          s.player.hand.push({ id: a.id, code: a.code });
        }
        break;
      }
      case "returnShove": {
        const c = s.player.discard.find((c) => c.code === C(79));
        if (c) front(s, eff("recover", { id: c.id }));
        break;
      }
      case "chooseArmitage": {
        const current = party(s).find((p) =>
          p.assets.some((a) => a.code === C(115)),
        );
        if (current && survivors(s).length > 1)
          choice(
            s,
            "Dr. Henry Armitage",
            "Choose the investigator who will take control of Dr. Armitage.",
            survivors(s).map((p) =>
              option(p.code, card(p.code).name, [
                eff("giveArmitage", { target: p.code }),
              ]),
            ),
          );
        break;
      }
      case "giveArmitage": {
        const from = party(s).find((p) =>
            p.assets.some((a) => a.code === C(115)),
          ),
          to = party(s).find((p) => p.code === e.target);
        if (from && to && from !== to) {
          const a = from.assets.find((a) => a.code === C(115))!;
          from.assets = from.assets.filter((x) => x.id !== a.id);
          to.assets.push(a);
        }
        break;
      }
      case "drawOne": {
        const cards: Instance[] = [];
        let horror = 0,
          empty = false;
        for (let i = 0; i < (e.amount || 1); i++) {
          if (!s.player.deck.length) {
            if (!s.player.discard.length) {
              empty = true;
              break;
            }
            s.player.deck = shuffle(s, s.player.discard.splice(0));
            horror++;
            e.title = "Deck reshuffled";
            log(
              s,
              `${card(s.player.code).name} has an empty deck. Reshuffle the discard pile; the replacement draw and 1 horror resolve together.`,
            );
          }
          cards.push(s.player.deck.shift()!);
        }
        front(
          s,
          eff("drawBatch", { data: { cards }, horror }),
          ...(empty
            ? [eff("defeat", { source: "mental", title: "Deck exhausted" })]
            : []),
        );
        break;
      }
      case "drawBatch": {
        const cards = e.data!.cards as Instance[];
        if (e.horror)
          front(
            s,
            eff("damage", { horror: e.horror, data: { drawCards: cards } }),
          );
        else {
          receiveDraw(s, cards);
          if (cards.length === 1) e.code = cards[0].code;
          if (cards.length > 1) e.title = `${cards.length} cards drawn`;
        }
        break;
      }
      case "drawnCard": {
        const c = handCard(s, e.id);
        if (!c) break;
        if ([C(3), C(103), C(104)].includes(c.code)) {
          removeHand(s, c.id, false);
          s.player.threats.push(c.code);
          log(s, `Revelation: ${card(c.code).name}.`, "bad");
        } else if (c.code === C(9)) {
          removeHand(s, c.id, false);
          spawn(s, c.code);
        } else if (c.code === C(100)) {
          enterLimbo(s, c.id);
          log(
            s,
            "Overzealous: draw an encounter and give it surge. Repeated instances of surge do not stack.",
            "bad",
          );
          front(
            s,
            eff("encounter", { data: { surge: true } }),
            eff("finishLimbo", { data: { ids: [c.id] } }),
          );
        } else {
          if (
            c.code === C(5) &&
            s.phase === "investigation" &&
            s.player.turnStarted &&
            !s.player.turnEnded &&
            s.turnInvestigator === s.player.code
          )
            front(
              s,
              eff("optionalDraw", {
                title: "Detective's Intuition",
                amount: 2,
              }),
            );
        }
        break;
      }
      case "draw":
        draw(s, e.amount);
        break;
      case "optionalDraw":
        choice(
          s,
          e.title || "Draw cards",
          `You may draw ${e.amount || 1} card${e.amount === 1 ? "" : "s"}.`,
          [
            option("draw", "Draw cards", [
              ...(e.source ? [eff("flag", { source: e.source })] : []),
              eff("draw", { amount: e.amount }),
            ]),
            option("skip", "Decline", []),
          ],
        );
        break;
      case "gain":
        s.player.resources += e.amount || 0;
        break;
      case "heal":
        s.player.damage = Math.max(0, s.player.damage - (e.damage || 0));
        s.player.horror = Math.max(0, s.player.horror - (e.horror || 0));
        break;
      case "discover":
        discover(s, e.amount || 1, e.target);
        break;
      case "damage":
        damageWindow(s, e);
        break;
      case "damageGroup": {
        const [first, ...remaining] = e.data!.effects as Effect[];
        if (first) front(s, { ...first, data: { remaining } });
        break;
      }
      case "applyDamage": {
        const allocations = e.data!.allocations as Allocation;
        const defeated: string[] = [];
        const hurt: string[] = [];
        const reactions: Effect[] = [];
        for (const [id, n] of Object.entries(allocations)) {
          const p =
            id === "self" ? s.player : party(s).find((p) => p.code === id);
          const a = party(s)
            .flatMap((p) => p.assets)
            .find((a) => a.id === id);
          const en = activeEnemy(s, id);
          if (p) {
            p.damage += n.damage;
            p.horror += n.horror;
            hurt.push(p.code);
            log(
              s,
              `${card(p.code).name} took ${n.damage ? n.damage + " damage" : ""}${n.damage && n.horror ? " and " : ""}${n.horror ? n.horror + " horror" : ""}.`,
              "bad",
            );
          } else if (a) {
            a.damage += n.damage;
            a.horror += n.horror;
            if (
              a.damage >= (card(a.code).health || Infinity) ||
              a.horror >= (card(a.code).sanity || Infinity)
            )
              defeated.push(id);
          } else if (en) {
            en.damage += n.damage;
          }
          if (
            n.damage > 0 &&
            (p || (a && card(a.code).traits?.includes("Ally")))
          ) {
            const at =
              p?.location ||
              party(s).find((p) => p.assets.some((x) => x.id === id))!.location;
            reactions.push(
              ...survivors(s)
                .filter((p) => p.location === at && mayParticipate(s, p.code))
                .flatMap((p) =>
                  p.assets
                    .filter((a) => a.code === C(73) && a.uses > 0)
                    .map((a) =>
                      eff("bandage", {
                        actor: p.code,
                        id: a.id,
                        target: id === "self" ? s.player.code : id,
                      }),
                    ),
                ),
            );
          }
        }
        const triggers = reactions.map((r) =>
          group(
            `Bandages · ${
              card(
                party(s).find((p) => p.code === r.target)?.code ||
                  party(s)
                    .flatMap((p) => p.assets)
                    .find((a) => a.id === r.target)?.code ||
                  C(73),
              ).name
            }`,
            [r],
          ),
        );
        for (const id of defeated) discardAsset(s, id, true, triggers);
        for (const en of [...s.enemies])
          if (allocations[en.id] && en.damage >= enemyHealth(s, en))
            discardEnemy(s, en, true, false, triggers);
        front(s, eff("restoreTurn", { actor: s.player.code }));
        ordered(s, "Choose damage effect order", triggers, s.leadInvestigator);
        if (e.data?.drawCards) receiveDraw(s, e.data.drawCards as Instance[]);
        front(s, ...hurt.map((actor) => eff("defeatCheck", { actor })));
        break;
      }
      case "attack": {
        const enemy = activeEnemy(s, e.id);
        if (
          !enemy ||
          ((e.source === "enemy" || e.source === "opportunity") &&
            (enemy.exhausted ||
              !enemy.engaged ||
              (enemy.engagedWith && enemy.engagedWith !== s.player.code))) ||
          (e.source === "retaliate" && enemy.exhausted)
        )
          break;
        log(
          s,
          `${card(enemy.code).name} attacks ${card(s.player.code).name}.`,
          "bad",
        );
        s.player.flags[`attacked_${enemy.id}`] = true;
        const daniela = survivors(s).find(
          (p) =>
            p.code === C(1) &&
            p.location === s.player.location &&
            !p.flags.daniela,
        );
        const reactions = [
          group("Lesson Learned", [
            eff("lessonLearned", { actor: s.player.code }),
          ]),
        ];
        if (daniela)
          reactions.push(
            group("Daniela Reyes · counterattack", [
              eff("daniela", { actor: daniela.code, id: enemy.id }),
            ]),
          );
        front(
          s,
          eff("damage", {
            source: enemy.code,
            damage: card(enemy.code).enemy_damage || 0,
            horror: card(enemy.code).enemy_horror || 0,
          }),
          ...(enemy.code === C(122) && s.phase === "enemy"
            ? [eff("discardAssetChoice")]
            : []),
          eff("orderEffects", {
            actor: "scenario",
            title: "Choose attack reaction order",
            target: s.player.code,
            data: { groups: reactions },
          }),
          eff("restoreTurn", { actor: s.player.code }),
          ...(e.source === "enemy"
            ? [eff("exhaustEnemy", { id: enemy.id, actor: "scenario" })]
            : []),
        );
        break;
      }
      case "exhaustEnemy": {
        const en = activeEnemy(s, e.id);
        if (en) en.exhausted = true;
        break;
      }
      case "lessonLearned": {
        const c = s.player.hand.find((c) => c.code === C(22));
        if (c && s.player.resources >= 1 && location(s).clues > 0)
          choice(
            s,
            "Lesson Learned",
            "After being attacked, you may pay 1 resource to discover a clue.",
            [
              option("play", "Play Lesson Learned", [
                eff("payEvent", { id: c.id, amount: 1 }),
                eff("discover"),
                eff("finishLimbo", { data: { ids: [c.id] } }),
              ]),
              option("skip", "Decline", []),
            ],
          );
        break;
      }
      case "gatherIntel": {
        const c = s.player.hand.find((c) => c.code === C(36));
        if (c && s.player.resources >= 1)
          choice(
            s,
            "Gather Intel",
            "An enemy entered your location. Pay 1 resource to draw 2 cards.",
            [
              option("play", "Play Gather Intel", [
                eff("payEvent", { id: c.id, amount: 1 }),
                eff("draw", { amount: 2 }),
                eff("finishLimbo", { data: { ids: [c.id] } }),
              ]),
              option("skip", "Decline", []),
            ],
          );
        break;
      }
      case "payEvent":
        enterLimbo(s, e.id!);
        spend(s, e.amount || 0);
        break;
      case "engagement":
        for (const en of s.enemies) {
          if (en.exhausted || en.engaged) continue;
          let targets = survivors(s).filter((p) => p.location === en.location);
          if (en.code === C(9))
            targets = targets.filter((p) => p.code === C(7));
          if (en.code === C(114) && targets.length) {
            const min = Math.min(
              ...targets.map((p) => stats(s, "agility", "", p)),
            );
            targets = targets.filter((p) => stats(s, "agility", "", p) === min);
          }
          if (targets.length === 1) {
            en.engaged = true;
            en.engagedWith = targets[0].code;
            front(s, eff("hunterInstinct", { actor: targets[0].code }));
          } else if (targets.length > 1) {
            choice(
              s,
              "Choose engagement",
              `${card(en.code).name} must engage an investigator here.`,
              targets.map((p) =>
                option(p.code, card(p.code).name, [
                  eff("assignEngagement", { id: en.id, target: p.code }),
                  eff("engagement"),
                ]),
              ),
            );
            break;
          }
        }
        break;
      case "assignEngagement": {
        const en = activeEnemy(s, e.id);
        if (en) {
          en.engaged = true;
          en.engagedWith = e.target;
          front(s, eff("hunterInstinct", { actor: e.target }));
        }
        break;
      }
      case "move":
        move(s, e.target!);
        break;
      case "act2check":
        if (s.act === 2 && survivors(s).every((p) => p.location === C(116)))
          advanceAct(s);
        break;
      case "fire":
        fire(s);
        break;
      case "attachFire":
        s.locations.find((l) => l.code === e.target)!.fire = true;
        log(s, `Fire spreads to ${card(e.target!).name}.`, "bad");
        break;
      case "doom":
        s.doom += e.amount || 1;
        log(
          s,
          `Place ${e.amount || 1} doom. The agenda has ${s.doom} of ${[3, 5, 10][s.agenda - 1]} doom.`,
          "bad",
        );
        if (s.agenda === 3) {
          const i = s.encounterDiscard.lastIndexOf(C(129));
          if (i >= 0) {
            s.encounterDiscard.splice(i, 1);
            front(s, eff("fire", { actor: s.leadInvestigator }));
          }
        }
        advanceAgenda(s);
        break;
      case "encounter":
        resetEncounter(s);
        if (s.encounterDeck.length) {
          e.code = s.encounterDeck.shift()!;
          log(s, `Encounter revealed: ${card(e.code).name}.`, "bad");
          front(s, eff("revelation", { code: e.code, data: e.data }));
        }
        break;
      case "revelation": {
        // The card remains outside the discard until all revelation effects,
        // nested tests, and reactions complete. Surge begins after this boundary.
        front(
          s,
          eff("endEncounter", {
            code: e.code,
            target: s.peril,
            data: { surge: !!e.data?.surge },
          }),
        );
        if (card(e.code!).text?.includes("Peril")) s.peril = s.player.code;
        encounter(s, e.code!);
        break;
      }
      case "endEncounter":
        if (
          card(e.code!).type_code === "treachery" &&
          ![C(125), C(129)].includes(e.code!)
        )
          s.encounterDiscard.push(e.code!);
        s.peril = e.target;
        if (e.data?.surge) front(s, eff("encounter"));
        break;
      case "surge": {
        const end = s.queue.findIndex((x) => x.kind === "endEncounter");
        if (end >= 0) s.queue[end].data = { ...s.queue[end].data, surge: true };
        else front(s, eff("encounter"));
        break;
      }
      case "test":
        testStart(
          s,
          "treachery",
          e.skill!,
          e.difficulty!,
          e.title!,
          e.target,
          e.source,
        );
        break;
      case "discardChoice": {
        const list = discardable(s);
        if (!list.length) break;
        choice(
          s,
          e.title || "Discard a card",
          "Choose a non-weakness card from your hand.",
          list.map((c) =>
            option(c.id, card(c.code).name, [
              eff("discard", { id: c.id }),
              ...(e.amount && e.amount > 1
                ? [
                    eff("discardChoice", {
                      amount: e.amount - 1,
                      title: e.title,
                    }),
                  ]
                : []),
            ]),
          ),
        );
        break;
      }
      case "discard":
        removeHand(s, e.id!);
        break;
      case "discardRandom": {
        const list = s.player.hand;
        if (list.length)
          removeHand(s, list[Math.floor(random(s) * list.length)].id);
        break;
      }
      case "discardAssetChoice":
        if (s.player.assets.length)
          choice(
            s,
            "Hellhound",
            "Choose an asset to discard.",
            s.player.assets.map((a) =>
              option(a.id, card(a.code).name, [
                eff("discardAsset", { id: a.id }),
              ]),
            ),
          );
        break;
      case "discardAsset":
        discardAsset(s, e.id!);
        break;
      case "bodyguard":
        choice(
          s,
          "Bodyguard",
          "Your defeated Bodyguard can deal 1 damage to an enemy here.",
          [
            ...s.enemies
              .filter((en) => en.location === s.player.location)
              .map((en) =>
                option(en.id, card(en.code).name, [
                  eff("enemyDamage", { id: en.id, amount: 1 }),
                ]),
              ),
            option("skip", "Decline", []),
          ],
        );
        break;
      case "fightResult": {
        const a = asset(s, e.source);
        const damage = e.amount!;
        if (
          a?.code === C(20) &&
          !a.exhausted &&
          engaged(s).length === 1 &&
          engaged(s)[0].id === e.id
        ) {
          choice(s, "Machete", "Exhaust Machete to deal 1 additional damage.", [
            option("exhaust", `Exhaust · deal ${damage + 1} damage`, [
              eff("exhaust", { id: a.id }),
              eff("enemyDamage", { id: e.id, amount: damage + 1 }),
            ]),
            option("keep", `Keep ready · deal ${damage} damage`, [
              eff("enemyDamage", { id: e.id, amount: damage }),
            ]),
          ]);
        } else if (a?.code === C(86))
          choice(
            s,
            "Broken Bottle",
            "Discard Broken Bottle to deal 1 additional damage?",
            [
              option("discard", `Discard · deal ${damage + 1} damage`, [
                eff("discardAsset", { id: a.id }),
                eff("enemyDamage", { id: e.id, amount: damage + 1 }),
              ]),
              option("keep", `Keep · deal ${damage} damage`, [
                eff("enemyDamage", { id: e.id, amount: damage }),
              ]),
            ],
          );
        else front(s, eff("enemyDamage", { id: e.id, amount: damage }));
        break;
      }
      case "testEvade":
        evadeEnemy(s, e.id!, !!e.data?.slippery);
        break;
      case "testParley": {
        const en = activeEnemy(s, e.id);
        if (en) discardEnemy(s, en);
        break;
      }
      case "testExtinguish": {
        const l = s.locations.find((l) => l.code === e.target);
        if (l?.fire) {
          l.fire = false;
          s.encounterDiscard.push(C(129));
          log(s, "The fire is extinguished.", "good");
        }
        break;
      }
      case "tokenFire": {
        const i = s.encounterDiscard.lastIndexOf(C(129));
        if (i >= 0) {
          s.encounterDiscard.splice(i, 1);
          front(s, eff("fire"));
        }
        break;
      }
      case "enemyDamage":
        enemyDamage(s, e.id!, e.amount || 1);
        break;
      case "logan":
        choice(
          s,
          "Logan Hastings",
          "Exhaust Logan Hastings to gain 1 resource.",
          [
            option("gain", "Gain 1 resource", [
              eff("exhaust", { id: e.id }),
              eff("gain", { amount: 1 }),
            ]),
            option("skip", "Decline", []),
          ],
        );
        break;
      case "exhaust": {
        const a = asset(s, e.id);
        if (a) a.exhausted = true;
        break;
      }
      case "dorothy": {
        const a = asset(s, e.id);
        if (a && !a.exhausted)
          choice(
            s,
            "Dorothy Simmons",
            "You succeeded by exactly 1 or 3. Exhaust Dorothy to gain 1 resource.",
            [
              option("gain", "Gain 1 resource", [
                eff("exhaust", { id: e.id }),
                eff("gain", { amount: 1 }),
              ]),
              option("skip", "Decline", []),
            ],
          );
        break;
      }
      case "joe":
        if (s.player.code === C(4) && !s.player.flags.joe) {
          choice(
            s,
            "A detective’s intuition",
            "Joe Diamond: after a successful investigation, draw 1 card (once per round).",
            [
              option("draw", "Draw 1 card", [
                eff("flag", { source: "joe" }),
                eff("draw"),
              ]),
              option("skip", "Decline", []),
            ],
          );
        }
        break;
      case "flag":
        s.player.flags[e.source!] = true;
        break;
      case "flashlight": {
        const a = asset(s, e.id);
        if (a)
          choice(
            s,
            "Hand-Crank Flashlight",
            "Discard the flashlight to reduce this location’s shroud by 1 until the end of the round.",
            [
              option("use", "Discard & reduce shroud", [
                eff("discardAsset", { id: a.id }),
                eff("reduceShroud", { target: e.target }),
              ]),
              option("keep", "Keep flashlight", []),
            ],
          );
        break;
      }
      case "reduceShroud":
        s.locations.find((l) => l.code === e.target)!.reduction++;
        break;
      case "localMapMove": {
        const a = asset(s, e.id);
        if (a && !a.exhausted)
          choice(
            s,
            "Local Map",
            "Exhaust Local Map to move to the investigated location.",
            [
              option("move", `Move to ${card(e.target!).name}`, [
                eff("exhaust", { id: a.id }),
                eff("move", { target: e.target }),
              ]),
              option("stay", "Stay here", []),
            ],
          );
        break;
      }
      case "cracksMove":
        choice(
          s,
          "Through the Cracks",
          "You may disengage from every enemy and move to a revealed connecting location.",
          [
            ...availableConnections(s)
              .filter((c) => s.locations.find((l) => l.code === c)?.revealed)
              .map((c) =>
                option(c, `Move to ${card(c).name}`, [
                  eff("disengage"),
                  eff("move", { target: c }),
                ]),
              ),
            option("stay", "Stay here", []),
          ],
        );
        break;
      case "disengage":
        s.enemies
          .filter(
            (e) =>
              e.engaged && (!e.engagedWith || e.engagedWith === s.player.code),
          )
          .forEach((e) => {
            e.engaged = false;
            delete e.engagedWith;
          });
        break;
      case "forbidden":
        if ((e.amount || 0) > 0)
          choice(
            s,
            "Forbidden Secrets",
            `${e.amount} point${e.amount === 1 ? "" : "s"} failed. Choose for each point.`,
            [
              ...(s.player.clues > 0
                ? [
                    option("clue", "Place 1 clue on your location", [
                      eff("dropClue"),
                      eff("forbidden", { amount: e.amount! - 1 }),
                    ]),
                  ]
                : []),
              option("horror", "Take 1 horror", [
                eff("damage", { horror: 1 }),
                eff("forbidden", { amount: e.amount! - 1 }),
              ]),
            ],
          );
        break;
      case "dropClue":
        s.player.clues--;
        location(s).clues++;
        break;
      case "compulsion":
        if ((e.amount || 0) > 0) {
          const opts: Choice[] = [];
          if (s.player.resources > 0)
            opts.push(
              option("resource", "Lose 1 resource", [
                eff("gain", { amount: -1 }),
                eff("compulsion", { amount: e.amount! - 1 }),
              ]),
            );
          if (s.player.hand.length)
            opts.push(
              option("card", "Discard 1 random card", [
                eff("discardRandom"),
                eff("compulsion", { amount: e.amount! - 1 }),
              ]),
            );
          if (opts.length)
            choice(
              s,
              "Wild Compulsion",
              `${e.amount} point${e.amount === 1 ? "" : "s"} failed. Choose for each point.`,
              opts,
            );
        }
        break;
      case "mutated":
        choice(s, "Mutated!", "Choose the consequence of your failed test.", [
          option("damage", "Take 2 damage", [eff("damage", { damage: 2 })]),
          option("horror", "Each investigator here takes 1 horror", [
            eff("damageGroup", {
              source: C(131),
              data: {
                effects: survivors(s)
                  .filter((p) => p.location === s.player.location)
                  .map((p) =>
                    eff("damage", { actor: p.code, horror: 1, source: C(131) }),
                  ),
              },
            }),
          ]),
        ]);
        break;
      case "removeThreat":
        s.player.threats = s.player.threats.filter((c) => c !== e.code);
        if (card(e.code!).subtype_code)
          s.player.discard.push(instance(s, e.code!));
        else s.encounterDiscard.push(e.code!);
        break;
      case "nextTurn": {
        const next = survivors(s).find((p) => !p.turnEnded);
        if (next) {
          focus(s, next.code);
          s.turnInvestigator = next.code;
          log(s, `${card(next.code).name} takes the next turn.`, "story");
        } else front(s, eff("investigationEnd", { actor: "scenario" }));
        break;
      }
      case "investigationEnd": {
        log(
          s,
          "The investigation phase ends. Resolve fire before the enemy phase.",
        );
        front(s, eff("enemyPhase", { actor: "scenario" }));
        ordered(
          s,
          "Choose Fire order",
          s.locations
            .filter((l) => l.active && l.fire)
            .map((l) =>
              group(
                `Fire! · ${card(l.code).name}`,
                [eff("fireLocation", { target: l.code, actor: "scenario" })],
                0,
              ),
            ),
          s.leadInvestigator,
        );
        break;
      }
      case "fireLocation": {
        e.code = C(129);
        log(
          s,
          `Fire at ${card(e.target!).name} deals 1 direct damage simultaneously to each non-Elite card with health here, including ${
            survivors(s)
              .filter((p) => p.location === e.target)
              .map((p) => card(p.code).name)
              .join(", ") || "the enemies"
          }.`,
          "bad",
        );
        const allocations: Allocation = {};
        for (const p of survivors(s).filter((p) => p.location === e.target)) {
          allocations[p.code] = { damage: 1, horror: 0 };
          for (const a of p.assets)
            if (card(a.code).health && !card(a.code).traits?.includes("Elite"))
              allocations[a.id] = { damage: 1, horror: 0 };
        }
        for (const en of s.enemies.filter(
          (en) =>
            en.location === e.target &&
            !card(en.code).traits?.includes("Elite"),
        ))
          allocations[en.id] = { damage: 1, horror: 0 };
        if (Object.keys(allocations).length)
          front(
            s,
            eff("applyDamage", {
              actor: "scenario",
              source: C(129),
              data: { allocations },
            }),
          );
        break;
      }
      case "fireDamage":
        e.code = C(129);
        log(
          s,
          `Fire at ${card(s.player.location).name} burns ${card(s.player.code).name} and each of their assets with health for 1 damage.`,
          "bad",
        );
        front(
          s,
          eff("applyDamage", {
            source: C(129),
            data: {
              allocations: Object.fromEntries([
                [s.player.code, { damage: 1, horror: 0 }],
                ...s.player.assets
                  .filter((a) => card(a.code).health)
                  .map((a) => [a.id, { damage: 1, horror: 0 }]),
              ]),
            },
          }),
        );
        break;
      case "fireEnemies":
        for (const en of [...s.enemies])
          if (
            s.locations.find((l) => l.code === en.location)?.fire &&
            !card(en.code).traits?.includes("Elite")
          )
            enemyDamage(s, en.id, 1, false);
        break;
      case "enemyPhase":
        focus(s, s.leadInvestigator);
        s.phase = "enemy";
        log(s, "Enemy phase. Hunters close in.");
        front(s, eff("engagement"), eff("enemyAttacks", { actor: "scenario" }));
        ordered(
          s,
          "Choose Hunter order",
          s.enemies
            .filter(
              (en) =>
                !en.exhausted &&
                !en.engaged &&
                card(en.code).text?.includes("Hunter"),
            )
            .map((en) =>
              group(card(en.code).name, [eff("hunt", { id: en.id })], 0),
            ),
          s.leadInvestigator,
        );
        break;
      case "hunt": {
        const en = activeEnemy(s, e.id);
        if (!en || en.exhausted || en.engaged) break;
        let targets = survivors(s).filter(
          (p) => en.code !== C(9) || p.code === C(7),
        );
        const min = Math.min(
          ...targets.map((p) => distance(s, en.location, p.location)),
        );
        targets = targets.filter(
          (p) => distance(s, en.location, p.location) === min,
        );
        if (en.code === C(114) && targets.length) {
          const agi = Math.min(
            ...targets.map((p) => stats(s, "agility", "", p)),
          );
          targets = targets.filter((p) => stats(s, "agility", "", p) === agi);
        }
        if (!targets.length || min === 0 || !Number.isFinite(min)) break;
        const steps = availableConnections(s, en.location).filter((c) =>
          targets.some((p) => distance(s, c, p.location) === min - 1),
        );
        if (steps.length === 1)
          front(s, eff("enemyMove", { id: en.id, target: steps[0] }));
        else if (steps.length > 1)
          choice(
            s,
            "Hunter movement",
            `${card(en.code).name} has equally short routes. Choose its destination.`,
            steps.map((c) =>
              option(c, card(c).name, [
                eff("enemyMove", { id: en.id, target: c }),
              ]),
            ),
          );
        break;
      }
      case "enemyMove": {
        const en = activeEnemy(s, e.id);
        if (en) {
          en.location = e.target!;
          ordered(
            s,
            "Choose arrival reaction order",
            survivors(s)
              .filter((p) => p.location === en.location)
              .map((p) =>
                group(`Gather Intel · ${card(p.code).name}`, [
                  eff("gatherIntel", { actor: p.code }),
                ]),
              ),
            s.leadInvestigator,
          );
          front(s, eff("engagement"));
        }
        break;
      }
      case "enemyAttacks":
        front(
          s,
          ...survivors(s).flatMap((p) => [
            eff("playerWindow", {
              actor: "scenario",
              title: `Before ${card(p.code).name} resolves enemy attacks`,
            }),
            eff("investigatorAttacks", {
              actor: p.code,
            }),
          ]),
          eff("playerWindow", {
            actor: "scenario",
            title: "After all enemy attacks",
          }),
          eff("upkeep", { actor: "scenario" }),
        );
        break;
      case "investigatorAttacks":
        front(
          s,
          eff("orderAttacks", {
            source: "enemy",
            data: {
              ids: engaged(s)
                .filter((en) => !en.exhausted)
                .map((en) => en.id),
            },
          }),
        );
        break;
      case "orderAttacks": {
        const ids = (e.data!.ids as string[]).filter((id) => {
          const en = activeEnemy(s, id);
          return (
            en &&
            en.engaged &&
            !en.exhausted &&
            (!en.engagedWith || en.engagedWith === s.player.code)
          );
        });
        const next = (id: string) => [
          eff("attack", { id, source: e.source }),
          eff("orderAttacks", {
            source: e.source,
            data: { ids: ids.filter((x) => x !== id) },
          }),
        ];
        if (ids.length === 1) front(s, ...next(ids[0]));
        else if (ids.length > 1)
          choice(
            s,
            "Choose attack order",
            "Choose the next enemy to attack this investigator. Its attack and reactions finish before the next attack.",
            ids.map((id) =>
              option(id, card(activeEnemy(s, id)!.code).name, next(id)),
            ),
          );
        break;
      }
      case "upkeep":
        s.phase = "upkeep";
        log(s, "Upkeep phase begins. A player window precedes readying cards.");
        front(
          s,
          eff("playerWindow", {
            actor: "scenario",
            title: "Before readying cards",
          }),
          eff("readyCards", { actor: "scenario" }),
        );
        break;
      case "readyCards":
        for (const en of s.enemies) {
          if (en.skipReady) en.skipReady = false;
          else en.exhausted = false;
        }
        for (const p of survivors(s))
          p.assets.forEach((a) => (a.exhausted = false));
        log(
          s,
          "Upkeep: each investigator readies cards, draws a card, and gains a resource.",
        );
        front(
          s,
          eff("engagement"),
          ...survivors(s).map((p) => eff("draw", { actor: p.code })),
          ...survivors(s).map((p) => eff("gain", { amount: 1, actor: p.code })),
          ...survivors(s).map((p) => eff("handLimit", { actor: p.code })),
          eff("roundEnd", { actor: "scenario" }),
        );
        break;
      case "handLimit": {
        const limit = 8 + (has(s, C(32)) ? 2 : 0);
        if (s.player.hand.length > limit && discardable(s).length)
          front(
            s,
            eff("discardChoice", {
              title: `Hand limit · keep ${limit} cards`,
              amount: s.player.hand.length - limit,
            }),
          );
        break;
      }
      case "roundEnd": {
        s.phase = "roundEnd";
        focus(s, s.leadInvestigator);
        const at = s.act === 3 ? C(120) : undefined;
        const cost = (s.act === 1 ? 2 : 3) * partySize(s);
        if ([1, 3].includes(s.act) && groupClues(s, at) >= cost)
          choice(
            s,
            "Advance the act?",
            `Spend ${cost} clues as a group${at ? " at Orne Library" : ""} to continue the story.`,
            [
              option("advance", "Spend clues & advance", [
                eff("payGroup", { amount: cost, source: at }),
                eff("advanceAct"),
                eff("newRound", { actor: "scenario" }),
              ]),
              option("wait", "Wait until next round", [
                eff("newRound", { actor: "scenario" }),
              ]),
            ],
          );
        else front(s, eff("newRound", { actor: "scenario" }));
        break;
      }
      case "payGroup":
        spendGroupClues(s, e.amount!, e.source);
        break;
      case "contributeClue": {
        const p = party(s).find((p) => p.code === e.target)!;
        if (p.clues > 0) {
          p.clues--;
          front(
            s,
            eff("payGroup", { amount: e.amount! - 1, source: e.source }),
          );
        }
        break;
      }
      case "advanceAct":
        advanceAct(s);
        break;
      case "newRound":
        s.round++;
        s.flags = Object.fromEntries(
          Object.entries(s.flags).filter(([k]) => k.startsWith("game_")),
        );
        for (const p of survivors(s)) {
          p.flags = Object.fromEntries(
            Object.entries(p.flags).filter(([k]) => k.startsWith("game_")),
          );
          p.actions = 3;
          p.actionsTaken = 0;
          p.turnEnded = false;
          p.turnStarted = false;
        }
        s.locations.forEach((l) => (l.reduction = 0));
        s.phase = "mythos";
        focus(s, s.leadInvestigator);
        log(s, `Round ${s.round}. The mythos stirs.`, "story");
        front(
          s,
          eff("doom", { amount: 1, actor: s.leadInvestigator }),
          ...survivors(s).map((p) => eff("encounter", { actor: p.code })),
          eff("playerWindow", {
            actor: "scenario",
            title: "After mythos encounters",
          }),
          eff("investigation", { actor: "scenario" }),
        );
        break;
      case "investigation":
        s.phase = "investigation";
        focus(s, s.leadInvestigator);
        s.turnInvestigator = s.player.code;
        log(
          s,
          "Investigation phase. Choose which investigator takes the first turn.",
          "story",
        );
        front(
          s,
          eff("playerWindow", {
            actor: "scenario",
            title: "Before choosing the first investigator",
          }),
        );
        break;
      case "perform":
        perform(s, e);
        break;
      case "equip":
        equip(s, e.id!);
        break;
      case "search": {
        const top = s.player.deck.slice(0, 9);
        const dead = top.find((c) => c.code === C(6));
        if (dead) {
          s.player.deck = s.player.deck.filter((c) => c.id !== dead.id);
          s.player.hand.push(dead);
          shuffle(s, s.player.deck);
          log(s, "Dead Ends cancels your search. Draw it and shuffle.", "bad");
          break;
        }
        const found = top.filter(
          (c) =>
            card(c.code).type_code === "asset" &&
            /Tool|Weapon/.test(card(c.code).traits || ""),
        );
        if (found.length)
          choice(
            s,
            "Right Tool for the Job",
            "Choose a Tool or Weapon from the top 9 cards. Your deck will be shuffled.",
            found.map((c) =>
              option(c.id, card(c.code).name, [
                eff("takeSearch", { id: c.id }),
              ]),
            ),
          );
        else {
          shuffle(s, s.player.deck);
          log(s, "No eligible Tool or Weapon in the top 9 cards.");
        }
        break;
      }
      case "takeSearch": {
        const c = s.player.deck.find((c) => c.id === e.id);
        if (c) {
          s.player.deck = s.player.deck.filter((c) => c.id !== e.id);
          s.player.hand.push(c);
        }
        shuffle(s, s.player.deck);
        break;
      }
      case "intuitionHeal":
        if (s.player.damage || s.player.horror)
          choice(
            s,
            "Detective's Intuition",
            "Gain 2 resources and choose a kind of healing.",
            [
              ...(s.player.damage
                ? [
                    option("damage", "Heal 1 damage", [
                      eff("heal", { damage: 1 }),
                    ]),
                  ]
                : []),
              ...(s.player.horror
                ? [
                    option("horror", "Heal 1 horror", [
                      eff("heal", { horror: 1 }),
                    ]),
                  ]
                : []),
            ],
          );
        break;
      case "victory":
        if (party(s).length > 1)
          choice(
            s,
            "Choose Armitage’s bearer",
            "Choose any investigator to add Dr. Henry Armitage to their campaign deck. This can differ from who controlled him during the scenario.",
            party(s).map((p) =>
              option(p.code, card(p.code).name, [
                eff("armitageBearer", { target: p.code }),
                eff("victoryChoice"),
              ]),
            ),
          );
        else
          front(
            s,
            eff("armitageBearer", { target: s.player.code }),
            eff("victoryChoice"),
          );
        break;
      case "armitageBearer":
        s.campaign.armitageBearer = e.target;
        log(
          s,
          `${card(e.target!).name} will be the bearer of Dr. Henry Armitage.`,
          "story",
        );
        break;
      case "victoryChoice":
        choice(
          s,
          "The masked pursuer falls",
          "Dr. Armitage needs your help. Will you stay to fight the flames, or leave with him?",
          [
            option(
              "save",
              "Stay and save the university",
              [eff("finish", { source: "saved" })],
              "+1 additional XP · 1 physical trauma",
            ),
            option(
              "leave",
              "Leave with Dr. Armitage",
              [eff("finish", { source: "pursuer" })],
              "The university burns · 1 mental trauma",
            ),
          ],
        );
        break;
      case "finish":
        finish(s, e.source!);
        break;
    }
    presentEffect(s, before, e);
  }
  if (
    !s.queue.length &&
    !s.event &&
    !s.test &&
    !s.decision &&
    !s.window &&
    s.status === "playing" &&
    s.phase === "investigation" &&
    survivors(s).some((p) => p.code === s.turnInvestigator && !p.turnEnded)
  )
    focus(s, s.turnInvestigator);
}
function equip(s: GameState, id: string) {
  const c = handCard(s, id);
  if (!c) return;
  const def = card(c.code);
  const slot = def.slot;
  const conflicts = slot
    ? s.player.assets.filter(
        (a) => card(a.code).slot === slot && a.code !== C(115),
      )
    : [];
  const cap = slot === "Hand" ? 2 : 1;
  if (conflicts.length >= cap) {
    choice(
      s,
      `Make room for ${def.name}`,
      `Your ${slot?.toLowerCase()} slots are full. Discard an asset.`,
      conflicts.map((a) =>
        option(a.id, `Replace ${card(a.code).name}`, [
          eff("discardAsset", { id: a.id }),
          eff("equip", { id }),
        ]),
      ),
    );
    return;
  }
  removeHand(s, id, false);
  const uses = Number(def.text?.match(/Uses \((\d+)/)?.[1] || 0);
  s.player.assets.push({ ...c, exhausted: false, uses, damage: 0, horror: 0 });
  log(s, `Played ${def.name}.`, "good");
  if (c.code === C(32))
    front(s, eff("optionalDraw", { title: "Laboratory Assistant", amount: 2 }));
}
function perform(s: GameState, e: Effect) {
  const target = e.target,
    source = e.source;
  switch (e.title) {
    case "resource":
      s.player.resources++;
      log(s, "Gained 1 resource.");
      break;
    case "draw":
      draw(s);
      break;
    case "move":
      move(s, target!);
      break;
    case "investigate": {
      const l = s.locations.find(
        (l) => l.code === (target || s.player.location),
      )!;
      const a = asset(s, source);
      let bonus = 0;
      if (a?.code === C(49)) {
        a.uses--;
        front(s, eff("chooseKitSkill", { id: a.id, target: l.code }));
        break;
      }
      if (a) {
        if (a.uses > 0 && [C(31), C(33)].includes(a.code)) a.uses--;
        if (a.code === C(31)) a.exhausted = true;
        bonus = 1;
      }
      testStart(
        s,
        "investigate",
        "intellect",
        (card(l.code).shroud || 0) - l.reduction,
        `Investigate ${card(l.code).name}`,
        l.code,
        source,
        bonus,
      );
      break;
    }
    case "fight": {
      const en = activeEnemy(s, target);
      if (!en) break;
      const a = asset(s, source);
      if (a && [C(19), C(45)].includes(a.code)) a.uses--;
      if (a?.code === C(77)) {
        front(s, eff("cleaverBonus", { id: a.id, target: en.id }));
        break;
      }
      testStart(
        s,
        "fight",
        a?.code === C(45) ? "agility" : "combat",
        card(en.code).enemy_fight || 0,
        `Fight ${card(en.code).name}`,
        en.id,
        source,
        a?.code === C(2) ? 2 : a?.code === C(45) ? 0 : a ? 1 : 0,
      );
      break;
    }
    case "evade": {
      const en = activeEnemy(s, target);
      if (en)
        testStart(
          s,
          "evade",
          "agility",
          card(en.code).enemy_evade || 0,
          `Evade ${card(en.code).name}`,
          en.id,
          source,
          source === "cracks" ? Math.min(3, s.player.clues) : 0,
        );
      break;
    }
    case "engage": {
      const en = activeEnemy(s, target);
      if (en) {
        const enters = en.location !== s.player.location;
        en.engaged = true;
        en.engagedWith = s.player.code;
        en.location = s.player.location;
        if (enters) front(s, eff("gatherIntel"));
        log(s, `Engaged ${card(en.code).name}.`);
        front(s, eff("hunterInstinct"));
      }
      break;
    }
    case "parley":
      testStart(s, "parley", "intellect", 2, "Calm the Bystander", target);
      break;
    case "extinguish":
      testStart(
        s,
        "extinguish",
        "agility",
        3,
        "Extinguish Fire!",
        s.player.location,
      );
      break;
    case "rest":
      s.player.flags.game_dormRest = true;
      s.player.damage = Math.max(0, s.player.damage - 1);
      s.player.horror = Math.max(0, s.player.horror - 1);
      log(s, "Rested in the dormitories: heal 1 damage and 1 horror.", "good");
      break;
    case "library":
      s.player.flags.game_library = true;
      draw(s, 3);
      break;
    case "removeThreat":
      front(
        s,
        eff("removeThreat", { code: target, actor: source || s.player.code }),
      );
      break;
    case "resign":
      elimination(s, "resigned");
      break;
    case "clueDamage":
      front(
        s,
        eff("payGroup", { amount: partySize(s) }),
        eff("enemyDamage", { id: target, amount: partySize(s) }),
      );
      break;
    case "olivier":
      has(s, C(46))!.exhausted = true;
      move(s, target!);
      break;
    case "wrench": {
      has(s, C(2))!.exhausted = true;
      const en = activeEnemy(s, target)!;
      en.engaged = true;
      en.engagedWith = s.player.code;
      front(s, eff("hunterInstinct"), eff("attack", { id: en.id }));
      break;
    }
    case "jumpsuit": {
      discardAsset(s, has(s, C(75))!.id);
      const eligible = s.player.discard.filter(
        (c) =>
          card(c.code).type_code === "asset" &&
          /Tool|Weapon/.test(card(c.code).traits || ""),
      );
      choice(
        s,
        "Jumpsuit",
        "Recover a Tool or Weapon from your discard pile.",
        eligible.map((c) =>
          option(c.id, card(c.code).name, [eff("recover", { id: c.id })]),
        ),
      );
      break;
    }
    case "play": {
      const c = handCard(s, target);
      if (!c) break;
      const def = card(c.code);
      if (def.type_code === "asset") {
        equip(s, c.id);
        break;
      }
      enterLimbo(s, c.id);
      front(s, eff("finishLimbo", { data: { ids: [c.id] } }));
      log(s, `Played ${def.name}.`);
      switch (c.code) {
        case "12089":
          s.player.resources += 3;
          break;
        case "12005":
          s.player.resources += 2;
          front(s, eff("intuitionHeal"));
          break;
        case "12038":
          discover(s, 1);
          break;
        case "12024":
          discover(
            s,
            s.enemies.some((e) => e.location === s.player.location) ? 2 : 1,
          );
          break;
        case "12023":
          front(s, eff("search"));
          break;
        case "12037": {
          const ens = engaged(s);
          if (ens.length === 1)
            front(
              s,
              eff("perform", {
                title: "evade",
                target: ens[0].id,
                source: "cracks",
              }),
            );
          else
            choice(
              s,
              "Through the Cracks",
              "Choose an engaged enemy to evade.",
              ens.map((en) =>
                option(en.id, card(en.code).name, [
                  eff("perform", {
                    title: "evade",
                    target: en.id,
                    source: "cracks",
                  }),
                ]),
              ),
            );
          break;
        }
        case "12050": {
          const test = testStart(
            s,
            "investigate",
            "intellect",
            Math.max(
              0,
              (card(s.player.location).shroud || 0) - location(s).reduction,
            ),
            "Breaking and Entering",
            s.player.location,
            "breaking",
          );
          test.addedSkill = "agility";
          break;
        }
        case "12051":
          front(s, eff("paintTown"));
          break;
        case "12052":
          front(s, eff("prestidigitation"));
          break;
        case "12079":
          choice(
            s,
            "Shove off!",
            "Choose an engaged enemy to evade.",
            engaged(s).map((en) =>
              option(en.id, card(en.code).name, [
                eff("perform", {
                  title: "evade",
                  target: en.id,
                  source: "shove",
                }),
              ]),
            ),
          );
          break;
        case "12006":
          break;
      }
      break;
    }
  }
}
export function canAct(
  s: GameState,
  kind: string,
  target?: string,
  source?: string,
): string | null {
  const inWindow = !!s.window;
  if (
    s.status !== "playing" ||
    s.player.status !== "active" ||
    (!inWindow && (s.player.turnEnded || s.phase !== "investigation")) ||
    s.event ||
    s.test ||
    s.decision ||
    (!inWindow && s.queue.length) ||
    !mayParticipate(s, s.player.code)
  )
    return "Finish the current resolution first.";
  const fast =
    ["clueDamage", "olivier", "jumpsuit", "wrench"].includes(kind) ||
    (kind === "move" &&
      partySize(s) <= 2 &&
      s.player.location === C(116) &&
      !s.flags.quad);
  if (inWindow && !fast) return "Only Fast abilities are legal in this window.";
  if (inWindow && ["olivier", "jumpsuit", "move"].includes(kind) && !ownTurn(s))
    return "This ability is only available during your turn.";
  const cost =
    kind === "library" || kind === "removeThreat"
      ? 2
      : fast ||
          (kind === "evade" &&
            s.player.code === C(7) &&
            !s.player.flags.extraEvade)
        ? 0
        : 1;
  if (s.player.actions < cost)
    return `You need ${cost} action${cost === 1 ? "" : "s"}.`;
  if (kind === "investigate") {
    const l = s.locations.find((l) => l.code === (target || s.player.location));
    if (!l?.active || !l.revealed) return "Choose a revealed location.";
    if (l.code !== s.player.location) {
      const a = asset(s, source);
      if (a?.code !== C(33) || !availableConnections(s).includes(l.code))
        return "Investigate your location or use Local Map.";
    }
    if (source) {
      const a = asset(s, source);
      if (!a || ![C(31), C(33), C(49), C(88)].includes(a.code))
        return "This asset cannot investigate.";
      if (a.code === C(33) && !availableConnections(s).includes(l.code))
        return "Local Map requires a revealed connecting location.";
      if (a.code === C(31) && a.exhausted)
        return "Fingerprint Kit is exhausted.";
      if ([C(31), C(33), C(49)].includes(a.code) && a.uses <= 0)
        return "This asset has no uses left.";
    }
  }
  if (["fight", "evade", "engage", "parley", "clueDamage"].includes(kind)) {
    const en = activeEnemy(s, target);
    if (!en) return "Choose an enemy.";
    if (
      en.location !== s.player.location &&
      !(
        kind === "engage" &&
        s.player.location === C(113) &&
        availableConnections(s).includes(en.location)
      )
    )
      return "That enemy is at another location.";
    if (
      kind === "evade" &&
      (!en.engaged || (en.engagedWith && en.engagedWith !== s.player.code))
    )
      return "You can only evade an enemy engaged with you.";
    if (
      kind === "engage" &&
      en.engaged &&
      (!en.engagedWith || en.engagedWith === s.player.code)
    )
      return "That enemy is already engaged with you.";
    if (kind === "parley" && en.code !== C(123))
      return "Only Bystanders can be parleyed with here.";
    if (kind === "clueDamage" && (s.act !== 4 || groupClues(s) < partySize(s)))
      return `Blaze of Glory requires ${partySize(s)} group clues.`;
    if (kind === "fight" && source) {
      const a = asset(s, source);
      if (!a || ![C(2), C(19), C(20), C(45), C(77), C(86)].includes(a.code))
        return "Choose a weapon.";
      if ([C(19), C(45)].includes(a.code) && a.uses <= 0)
        return `${card(a.code).name} is out of ammunition.`;
    }
  }
  if (kind === "move" && !availableConnections(s).includes(target || ""))
    return "That location is not connected.";
  if (kind === "extinguish" && !location(s).fire)
    return "There is no fire here.";
  if (
    kind === "rest" &&
    (s.player.location !== C(117) || s.player.flags.game_dormRest)
  )
    return "Rest is only available once per game in the Dormitories.";
  if (kind === "rest" && !s.player.damage && !s.player.horror)
    return "There is no damage or horror to heal.";
  if (
    kind === "library" &&
    (s.player.location !== C(120) || s.player.flags.game_library)
  )
    return "The library action is only available once per game.";
  if (
    kind === "removeThreat" &&
    (!survivors(s).some(
      (p) =>
        p.code === (source || s.player.code) &&
        p.location === s.player.location &&
        p.threats.includes(target || ""),
    ) ||
      ![C(125), C(103), C(104)].includes(target || ""))
  )
    return "This threat is not in play.";
  if (kind === "resign" && s.act !== 4)
    return "Resigning becomes available during Act 4.";
  if (
    kind === "olivier" &&
    (!has(s, C(46)) ||
      has(s, C(46))!.exhausted ||
      !availableConnections(s).includes(target || ""))
  )
    return "Choose a connecting location and a ready Olivier Bishop.";
  if (
    kind === "jumpsuit" &&
    (!has(s, C(75)) ||
      !s.player.discard.some(
        (c) =>
          card(c.code).type_code === "asset" &&
          /Tool|Weapon/.test(card(c.code).traits || ""),
      ))
  )
    return "Jumpsuit needs a Tool or Weapon in your discard pile.";
  if (
    kind === "wrench" &&
    (!has(s, C(2)) ||
      has(s, C(2))!.exhausted ||
      activeEnemy(s, target)?.location !== s.player.location)
  )
    return "Choose a ready Wrench and an enemy here.";
  return null;
}
export function canPlay(s: GameState, id: string): string | null {
  const c = handCard(s, id);
  if (!c) return "Card is not in your hand.";
  const def = card(c.code);
  const inWindow = !!s.window;
  if (
    s.status !== "playing" ||
    s.player.status !== "active" ||
    (!inWindow && (s.player.turnEnded || s.phase !== "investigation")) ||
    s.event ||
    s.test ||
    s.decision ||
    (!inWindow && s.queue.length) ||
    !mayParticipate(s, s.player.code)
  )
    return "Finish the current resolution first.";
  if (def.type_code === "skill")
    return "Commit this card during a matching skill test.";
  if ([C(22), C(36), C(78)].includes(c.code))
    return "This event will be offered automatically at its reaction window.";
  if (!["asset", "event"].includes(def.type_code))
    return "This card cannot be played.";
  if (s.player.resources < (def.cost || 0)) return "Not enough resources.";
  const fast = def.text?.startsWith("Fast.");
  if (inWindow && (!fast || !ownTurn(s)))
    return "This Fast card may only be played during your turn.";
  if (!fast && s.player.actions < 1) return "No actions remaining.";
  if (c.code === C(24) && s.player.actionsTaken > 0)
    return "Play only as your first action.";
  if ([C(24), C(38)].includes(c.code) && location(s).clues === 0)
    return "No clues at this location.";
  if ([C(37), C(79)].includes(c.code) && !engaged(s).length)
    return "No engaged enemy to evade.";
  if (
    def.is_unique &&
    survivors(s).some((p) => p.assets.some((a) => a.code === c.code))
  )
    return "A unique copy is already in play.";
  if ([C(48), C(74)].includes(c.code) && has(s, c.code))
    return "Limit 1 per investigator.";
  if (
    c.code === C(52) &&
    !s.player.hand.some(
      (x) =>
        x.id !== id &&
        card(x.code).type_code === "asset" &&
        card(x.code).traits?.includes("Item") &&
        Math.max(0, (card(x.code).cost || 0) - 2) <= s.player.resources - 1 &&
        (!card(x.code).is_unique ||
          !survivors(s).some((p) => p.assets.some((a) => a.code === x.code))),
    )
  )
    return "No affordable Item in your hand.";
  return null;
}
export function commitValue(s: GameState, id: string) {
  const owner = commitOwner(s, id),
    c = committedCard(s, id);
  if (
    !c ||
    !owner ||
    !s.test ||
    (!s.test.committed.includes(id) &&
      (owner.status !== "active" ||
        owner.location !== s.player.location ||
        (s.peril === s.player.code && owner.code !== s.peril))) ||
    card(c.code).subtype_code
  )
    return 0;
  return (
    (card(c.code)[`skill_${s.test.skill}`] || 0) +
    (card(c.code).skill_wild || 0)
  );
}
export function testValue(s: GameState) {
  const t = s.test;
  if (!t) return 0;
  return (
    stats(s, t.skill, t.kind) +
    (t.addedSkill ? stats(s, t.addedSkill) : 0) +
    t.bonus +
    t.committed.reduce((n, id) => n + commitValue(s, id), 0)
  );
}
function reveal(s: GameState) {
  const t = s.test!;
  let mod = 0;
  const hard = s.difficulty === "hard" || s.difficulty === "expert";
  const remaining = [...s.bag];
  for (let i = 0; i < 20 && remaining.length; i++) {
    const index = Math.floor(random(s) * remaining.length);
    const [token] = remaining.splice(index, 1);
    t.tokens.push(token);
    if (token === "auto_fail") break;
    if (token === "elder_sign") {
      mod += s.player.code === C(7) ? 0 : 1;
      break;
    }
    if (token === "skull") {
      mod -= s.act + (hard ? 1 : 0);
      break;
    }
    if (token === "elder_thing") {
      mod -= hard ? 4 : 3;
      break;
    }
    if (token === "tablet") {
      mod -= hard ? 2 : 1;
      continue;
    }
    mod += Number(token) || 0;
    break;
  }
  t.modifier = mod;
  t.margin =
    (t.tokens.includes("auto_fail") ? 0 : Math.max(0, testValue(s) + mod)) -
    t.difficulty;
  t.success = !t.tokens.includes("auto_fail") && t.margin >= 0;
  t.stage = "revealed";
  if (t.tokens.includes("elder_sign") && s.player.code === C(1)) {
    // Daniela's non-conditional symbol effect resolves at ST.4, before the
    // modified skill and success are finalized. A resulting test must queue.
    s.test = null;
    front(s, eff("elderDamage"), eff("resumeTest", { data: { test: t } }));
  } else logTestResult(s);
}
function logTestResult(s: GameState) {
  const t = s.test!;
  log(
    s,
    `${t.title}: ${t.success ? "success" : "failure"} (${t.tokens.join(", ")}).`,
    t.success ? "good" : "bad",
  );
}
function attackDamage(s: GameState, t: Test) {
  const weapon = asset(s, t.source);
  const bonus =
    weapon?.code === C(19) ||
    (weapon?.code === C(2) && s.player.flags[`attacked_${t.target}`]) ||
    (weapon?.code === C(45) && activeEnemy(s, t.target)?.exhausted);
  return 1 + (bonus ? 1 : 0) + (t.extraDamage || 0);
}
function resolve(s: GameState) {
  const t = s.test!;
  s.testInProgress = true;
  const success = t.success!;
  const committed = t.committed
    .map((id) => committedCard(s, id)!)
    .filter(Boolean);
  // Normalize commitments from older saves, then discard only at ST.8.
  t.committed.forEach((id) => {
    const owner = commitOwner(s, id);
    if (owner) enterLimbo(s, id, owner);
  });
  s.test = null;
  const effects: Effect[] = [];
  const results: TimingGroup[] = [];
  const reactions: TimingGroup[] = [];
  let retaliation: Effect | undefined;
  if (success) {
    switch (t.kind) {
      case "investigate": {
        const a = asset(s, t.source);
        const extra =
          committed.filter((c) => c.code === C(39)).length +
          (a?.code === C(31) ? 1 : 0);
        effects.push(eff("discover", { amount: 1 + extra, target: t.target }));
        reactions.push(group("Joe Diamond · draw a card", [eff("joe")]));
        const dorothy = has(s, C(30));
        if (dorothy && (t.margin === 1 || t.margin === 3))
          reactions.push(
            group("Dorothy Simmons", [eff("dorothy", { id: dorothy.id })]),
          );
        if (a?.code === C(88))
          effects.push(eff("flashlight", { id: a.id, target: t.target }));
        if (a?.code === C(33))
          effects.push(eff("localMapMove", { id: a.id, target: t.target }));
        if (a?.code === C(49)) effects.push(eff("gain", { amount: 1 }));
        if (t.source === "breaking" && (t.margin || 0) >= 2)
          effects.push(eff("autoEvade"));
        break;
      }
      case "fight": {
        const a = asset(s, t.source);
        const damage =
          attackDamage(s, t) + committed.filter((c) => c.code === C(25)).length;
        effects.push(
          eff("fightResult", {
            id: t.target,
            source: t.source,
            amount: damage,
          }),
        );
        if (a?.code === C(77))
          effects.push(eff("cleaverHeal", { id: t.target }));
        break;
      }
      case "evade": {
        effects.push(
          eff("testEvade", {
            id: t.target,
            data: { slippery: committed.some((c) => c.code === C(80)) },
          }),
        );
        if (t.source === "cracks") effects.push(eff("cracksMove"));
        if (t.source === "shove")
          effects.push(eff("enemyDamage", { id: t.target, amount: 1 }));
        break;
      }
      case "parley": {
        effects.push(eff("testParley", { id: t.target }));
        break;
      }
      case "extinguish":
        effects.push(eff("testExtinguish", { target: t.target }));
        break;
    }
    for (const c of committed)
      if ([C(90), C(91), C(92), C(93)].includes(c.code))
        results.push(
          group(`${card(c.code).name} · draw a card`, [eff("draw")]),
        );
    if (t.tokens.includes("elder_sign") && s.player.code === C(4))
      results.push(
        group("Joe’s elder sign · draw a card and gain 1 resource", [
          eff("draw"),
          eff("gain", { amount: 1 }),
        ]),
      );
  } else {
    if (t.kind === "fight") {
      const en = activeEnemy(s, t.target);
      if (en?.engagedWith && en.engagedWith !== s.player.code) {
        const damage = attackDamage(s, t);
        effects.push(eff("damage", { actor: en.engagedWith, damage }));
      }
      if (en && !en.exhausted && card(en.code).text?.includes("Retaliate"))
        retaliation = eff("attack", { id: en.id, source: "retaliate" });
    }
    const margin = Math.abs(t.margin || 0);
    switch (t.source) {
      case "agenda1":
        effects.push(eff("damage", { horror: 1 }));
        break;
      case "agenda2":
        effects.push(eff("damage", { damage: 1 }));
        break;
      case "12126":
        effects.push(eff("forbidden", { amount: margin }));
        break;
      case "12127":
        effects.push(eff("damage", { damage: 1 }), eff("discardRandom"));
        break;
      case "12128":
        effects.push(eff("compulsion", { amount: margin }));
        break;
      case "12130":
        effects.push(eff("damage", { damage: margin }));
        break;
      case "12131":
        effects.push(eff("mutated"));
        break;
    }
    for (const token of t.tokens)
      if (token === "tablet")
        results.push(
          group("Tablet · take 1 damage", [eff("damage", { damage: 1 })]),
        );
    if (
      t.tokens.includes("elder_thing") &&
      (hardDifficulty(s) || margin >= 2)
    ) {
      results.push(
        group("Elder thing · draw Fire! from the discard pile", [
          eff("tokenFire"),
        ]),
      );
    }
  }
  if (!success && t.kind === "investigate" && Math.abs(t.margin || 0) <= 2)
    reactions.push(group("Look what I found!", [eff("lookFound")]));
  if (!success && t.source === "shove") s.player.flags.shove = true;
  if (success && (t.margin || 0) >= 2) {
    const a = has(s, C(44));
    if (a && !a.exhausted)
      reactions.push(
        group(card(C(44)).name, [
          eff("assetReward", { id: a.id, source: "draw", amount: 1 }),
        ]),
      );
    if (committed.some((c) => c.code === C(53)))
      results.push(
        group(`${card(C(53)).name} · disengage and move`, [eff("cracksMove")]),
      );
  }
  const after = [eff("endTest", { data: { ids: t.committed } })];
  if (t.tokens.includes("elder_sign") && s.player.code === C(7))
    after.push(eff("freeMove", { source: "disengage" }));
  front(s, ...(retaliation ? [retaliation] : []), ...after);
  ordered(s, "Choose test reaction order", reactions);
  if (effects.length) results.unshift(group(t.title, effects));
  ordered(s, "Choose skill test result order", results);
}
function hardDifficulty(s: GameState) {
  return s.difficulty === "hard" || s.difficulty === "expert";
}
function beginTurn(s: GameState) {
  if (s.player.turnStarted) return;
  s.player.turnStarted = true;
  for (const p of party(s)) delete p.flags.woundedMove;
  s.turnInvestigator = s.player.code;
  const a = has(s, C(72));
  if (a && (a.damage || a.horror)) front(s, eff("aleks", { id: a.id }));
}
function spend(s: GameState, n: number) {
  s.player.resources -= n;
  if (n > 0 && s.player.threats.includes(C(103)))
    front(s, eff("damage", { damage: 1, source: C(103) }));
}
function useSupply(s: GameState, a: Asset) {
  a.uses--;
  if (a.uses <= 0 && [C(73), C(74)].includes(a.code)) discardAsset(s, a.id);
}
export const commitOwner = (s: GameState, id: string) =>
  party(s).find(
    (p) =>
      p.hand.some((c) => c.id === id) ||
      (s.limbo || []).some((c) => c.id === id && c.owner === p.code),
  );
const committedCard = (s: GameState, id: string) =>
  commitOwner(s, id)?.hand.find((c) => c.id === id) ||
  s.limbo?.find((c) => c.id === id);
export const commitCards = (s: GameState, p: Investigator) => [
  ...p.hand,
  ...(s.limbo || []).filter(
    (c) => c.owner === p.code && s.test?.committed.includes(c.id),
  ),
];
function refreshTest(s: GameState) {
  const t = s.test!;
  t.margin =
    (t.tokens.includes("auto_fail")
      ? 0
      : Math.max(0, testValue(s) + t.modifier)) - t.difficulty;
  t.success = !t.tokens.includes("auto_fail") && t.margin >= 0;
}
function evadeEnemy(s: GameState, id: string, slippery = false) {
  const en = activeEnemy(s, id);
  if (!en) return;
  en.engaged = false;
  delete en.engagedWith;
  en.exhausted = true;
  if (slippery && !card(en.code).traits?.includes("Elite")) en.skipReady = true;
  log(s, `${card(en.code).name} is evaded.`, "good");
  const follow: TimingGroup[] = [];
  if (en.code === C(9)) {
    follow.push(
      group(
        "Black Chamber Operative",
        [
          s.player.clues
            ? eff("dropClue")
            : eff("operativeAttack", { id: en.id }),
        ],
        0,
      ),
    );
  }
  const ops = has(s, C(8)),
    fingers = has(s, C(48));
  if (ops && !ops.exhausted)
    follow.push(group(card(C(8)).name, [eff("covert", { id: ops.id })]));
  if (fingers && !fingers.exhausted)
    follow.push(
      group("Sticky Fingers", [
        eff("assetReward", { id: fingers.id, amount: 1, source: "gain" }),
      ]),
    );
  ordered(s, "Choose evasion effect order", follow, s.leadInvestigator);
}
function actionCost(s: GameState, n: number, safe: boolean, isAction = n > 0) {
  const first = s.player.actionsTaken === 0;
  beginTurn(s);
  s.player.actions -= n;
  if (isAction) s.player.actionsTaken++;
  if (n > 0 && !safe && !(has(s, C(115)) && first))
    enqueue(
      s,
      eff("orderAttacks", {
        source: "opportunity",
        data: {
          ids: engaged(s)
            .filter((en) => !en.exhausted)
            .map((en) => en.id),
        },
      }),
    );
}
export function reduceGame(state: GameState, action: Action): GameState {
  if (action.type === "continue") {
    // An old click must never acknowledge a newer event.
    if (!state.event || action.eventId !== state.event.id) return state;
    const s = structuredClone(state);
    s.event = null;
    s.error = null;
    drain(s);
    return s;
  }
  if (state.event && action.type !== "clearError") return state;
  const before = visibleSnapshot(state);
  const result = reduceCore(state, action);
  if (result !== state)
    presentAction(result, before, action, state.eventSerial);
  return result;
}
function reduceCore(state: GameState, action: Action): GameState {
  const s = structuredClone(state);
  s.error = null;
  if (action.type === "clearError") return s;
  if (action.type === "openWindow") {
    if (
      s.window ||
      s.test ||
      s.decision ||
      s.queue.length ||
      s.phase !== "investigation" ||
      s.status !== "playing" ||
      s.player.status !== "active" ||
      s.player.turnEnded
    )
      return state;
    beginTurn(s);
    enqueue(
      s,
      eff("playerWindow", { title: "Between actions", actor: s.player.code }),
    );
    drain(s);
    return s;
  }
  if (action.type === "passWindow") {
    if (!s.window) return state;
    closeWindow(s);
    drain(s);
    return s;
  }
  if (action.type === "fast") {
    const selected = fastOptions(s).find((o) => o.id === action.id);
    if (!selected || !s.window) return state;
    const window = s.window;
    delete s.window;
    focus(s, selected.actor);
    front(s, eff("resumeWindow", { actor: "scenario", data: { window } }));
    const a = selected.action;
    if (a.type === "boost") {
      window.test!.bonus += boostAmount(asset(s, a.id)!, window.test!);
      spend(s, 1);
    } else if (a.type === "play") {
      front(s, eff("perform", { title: "play", target: a.id }));
      spend(s, card(handCard(s, a.id)!.code).cost || 0);
    } else if (a.type === "act") {
      if (a.kind === "move") s.flags.quad = true;
      front(
        s,
        eff("perform", { title: a.kind, target: a.target, source: a.source }),
      );
    }
    drain(s);
    return s;
  }
  if (s.window) return state;
  if (action.type === "switchInvestigator") {
    if (canSwitch(s, action.code)) {
      focus(s, action.code);
      s.turnInvestigator = action.code;
    } else
      s.error =
        "Finish this investigator’s turn and any pending choice before changing seats.";
    return s;
  }
  if (action.type === "mulligan") {
    if (s.status !== "mulligan") return state;
    const ids = [...new Set(action.ids)].filter((id) =>
      s.player.hand.some((c) => c.id === id),
    );
    const old = ids.map((id) => removeHand(s, id, false)!);
    const weak: Instance[] = [];
    while (s.player.hand.length < 5) {
      const c = s.player.deck.shift();
      if (!c) break;
      if (card(c.code).subtype_code) weak.push(c);
      else s.player.hand.push(c);
    }
    s.player.deck = shuffle(s, [...s.player.deck, ...old, ...weak]);
    s.player.mulliganDone = true;
    log(s, `${card(s.player.code).name} is ready.`, "story");
    const next = party(s).find((p) => !p.mulliganDone);
    if (next) focus(s, next.code);
    else {
      s.status = "playing";
      focus(s, s.leadInvestigator);
      log(s, "Opening hands ready. Begin your investigation.", "story");
      front(
        s,
        eff("playerWindow", {
          actor: "scenario",
          title: "Before choosing the first investigator",
        }),
      );
      drain(s);
    }
    return s;
  }
  if (action.type === "choose") {
    if (!s.decision) return state;
    const c = s.decision.choices.find((c) => c.id === action.id);
    if (!c) return state;
    s.decision = null;
    front(s, ...c.effects);
    drain(s);
    return s;
  }
  if (action.type === "commit") {
    if (!s.test) return state;
    if (s.test.stage === "commit" && s.test.commitClosed) return state;
    const late = s.test.stage === "revealed";
    if (
      late &&
      (committedCard(s, action.id)?.code !== C(81) ||
        commitOwner(s, action.id)?.code !== s.player.code ||
        s.test.committed.includes(action.id))
    )
      return state;
    if (s.test.committed.includes(action.id)) {
      s.test.committed = s.test.committed.filter((id) => id !== action.id);
      leaveLimbo(s, [action.id], false);
      return s;
    }
    if (commitValue(s, action.id) <= 0) return state;
    const c = committedCard(s, action.id)!;
    const owner = commitOwner(s, action.id)!;
    if (
      owner.code !== s.player.code &&
      s.test.committed.some((id) => commitOwner(s, id)?.code === owner.code)
    ) {
      s.error = "Each assisting investigator may commit at most one card.";
      return s;
    }
    if (
      card(c.code).text?.includes("Max 1 committed") &&
      s.test.committed.some((id) => committedCard(s, id)?.code === c.code)
    ) {
      s.error = "Only one copy may be committed to this test.";
      return s;
    }
    s.test.committed.push(action.id);
    enterLimbo(s, action.id, owner);
    if (late) refreshTest(s);
    return s;
  }
  if (action.type === "boost") {
    if (
      !s.test ||
      s.test.stage !== "commit" ||
      s.player.resources < 1 ||
      !mayParticipate(s, s.player.code)
    )
      return state;
    const a = asset(s, action.id);
    const valid =
      (a?.code === C(17) && ["combat", "agility"].includes(s.test.skill)) ||
      (a?.code === C(35) &&
        ["intellect", "willpower"].includes(s.test.skill)) ||
      (a?.code === C(47) && ["intellect", "agility"].includes(s.test.skill)) ||
      (a?.code === C(76) && ["willpower", "agility"].includes(s.test.skill));
    if (!valid) return state;
    s.test.commitClosed = true;
    s.test.bonus +=
      (a?.code === C(17) && ["fight", "evade"].includes(s.test.kind)) ||
      (a?.code === C(35) && ["investigate", "parley"].includes(s.test.kind)) ||
      (a?.code === C(47) && ["evade", "parley"].includes(s.test.kind)) ||
      (a?.code === C(76) &&
        ["treachery", "extinguish", "parley"].includes(s.test.kind))
        ? 2
        : 1;
    const obligations = s.player.threats.includes(C(103));
    if (obligations) {
      const paused = s.test;
      s.test = null;
      // Resume this test before any effects that were waiting for it to finish.
      front(s, eff("resumeTest", { data: { test: paused } }));
    }
    spend(s, 1);
    if (obligations) drain(s);
    return s;
  }
  if (action.type === "reveal") {
    if (s.test?.stage === "commit") {
      const test = s.test;
      test.commitClosed = true;
      s.test = null;
      openWindow(s, {
        timing: "beforeToken",
        title: "Before revealing the chaos token",
        actor: s.player.code,
        test,
      });
    }
    drain(s);
    return s;
  }
  if (action.type === "resolve") {
    if (s.test?.stage === "revealed") {
      resolve(s);
      drain(s);
    }
    return s;
  }
  if (action.type === "play") {
    const reason = canPlay(s, action.id);
    if (reason) {
      s.error = reason;
      return s;
    }
    const c = handCard(s, action.id)!;
    const d = card(c.code);
    const fast = !!d.text?.startsWith("Fast.");
    spend(s, d.cost || 0);
    actionCost(
      s,
      fast ? 0 : 1,
      fast || [C(24), C(37), C(50), C(51), C(79)].includes(c.code),
    );
    enqueue(s, eff("perform", { title: "play", target: action.id }));
    drain(s);
    return s;
  }
  if (action.type === "act") {
    if (
      ![
        "resource",
        "draw",
        "move",
        "investigate",
        "fight",
        "evade",
        "engage",
        "parley",
        "extinguish",
        "rest",
        "library",
        "removeThreat",
        "resign",
        "clueDamage",
        "olivier",
        "jumpsuit",
        "wrench",
      ].includes(action.kind)
    )
      return state;
    const reason = canAct(s, action.kind, action.target, action.source);
    if (reason) {
      s.error = reason;
      return s;
    }
    const fast =
      ["clueDamage", "olivier", "jumpsuit", "wrench"].includes(action.kind) ||
      (action.kind === "move" &&
        partySize(s) <= 2 &&
        s.player.location === C(116) &&
        !s.flags.quad);
    if (action.kind === "move" && fast) s.flags.quad = true;
    const safe =
      fast ||
      ["fight", "evade", "parley", "resign"].includes(action.kind) ||
      (action.kind === "engage" && s.player.location === C(113));
    const extraEvade =
      action.kind === "evade" &&
      s.player.code === C(7) &&
      !s.player.flags.extraEvade;
    if (extraEvade) s.player.flags.extraEvade = true;
    actionCost(
      s,
      fast || extraEvade
        ? 0
        : ["library", "removeThreat"].includes(action.kind)
          ? 2
          : 1,
      safe,
      !fast,
    );
    enqueue(
      s,
      eff("perform", {
        title: action.kind,
        target: action.target,
        source: action.source,
      }),
    );
    drain(s);
    return s;
  }
  if (action.type === "endTurn") {
    if (
      s.status !== "playing" ||
      s.player.status !== "active" ||
      s.player.turnEnded ||
      s.phase !== "investigation" ||
      s.test ||
      s.decision
    )
      return state;
    beginTurn(s);
    s.player.actions = 0;
    s.player.turnEnded = true;
    const returns: Effect[] = [];
    if (s.player.flags.prestidigitation) returns.push(eff("returnItem"));
    if (s.player.flags.shove) returns.push(eff("returnShove"));
    enqueue(s, ...returns, eff("nextTurn", { actor: "scenario" }));
    drain(s);
    return s;
  }
  return s;
}
export function gameSummary(s: GameState) {
  return {
    status: s.status,
    round: s.round,
    phase: s.phase,
    actions: s.player.actions,
    activeInvestigator: s.player.code,
    party: party(s).map((p) => ({
      code: p.code,
      name: card(p.code).name,
      location: p.location,
      actions: p.actions,
      resources: p.resources,
      clues: p.clues,
      health: health(s, p) - p.damage,
      sanity: sanity(s, p) - p.horror,
      status: p.status,
      turnEnded: p.turnEnded,
    })),
    act: s.act,
    agenda: s.agenda,
    doom: s.doom,
    player: {
      location: card(s.player.location).name,
      resources: s.player.resources,
      clues: s.player.clues,
      code: s.player.code,
      name: card(s.player.code).name,
      health: health(s) - s.player.damage,
      sanity: sanity(s) - s.player.horror,
      hand: s.player.hand.map((c) => ({
        id: c.id,
        name: card(c.code).name,
        playable: !canPlay(s, c.id),
      })),
      assets: s.player.assets.map((a) => ({ ...a, name: card(a.code).name })),
    },
    locations: s.locations
      .filter((l) => l.active)
      .map((l) => ({ ...l, name: card(l.code).name })),
    enemies: s.enemies.map((e) => ({ ...e, name: card(e.code).name })),
    test: s.test,
    window: s.window
      ? {
          ...s.window,
          options: fastOptions(s).map(({ id, label, actor }) => ({
            id,
            label,
            actor,
          })),
        }
      : null,
    decision: s.decision
      ? {
          title: s.decision.title,
          choices: s.decision.choices.map((c) => ({
            id: c.id,
            label: c.label,
          })),
        }
      : null,
    campaign: s.campaign,
    error: s.error,
    event: s.event,
    eventHistoryCount: s.eventHistory.length,
    paused: !!s.event || !!s.test || !!s.decision || !!s.window,
    coordinateSystem:
      "DOM layout; map percentages measured from top-left, x right, y down",
  };
}
