import { BAGS, CONNECTIONS, JOE_DECK, card, code } from "./data";
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
  Skill,
  Test,
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
  s.queue.unshift(...effects);
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
export const location = (s: GameState) =>
  s.locations.find((l) => l.code === s.player.location)!;
export const engaged = (s: GameState) =>
  s.enemies.filter((e) => e.engaged && !e.exhausted);
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
function discardable(s: GameState) {
  return s.player.hand.filter((c) => !card(c.code).subtype_code);
}
export function stats(s: GameState, skill: Skill, kind = "") {
  let n = card(s.player.code)[`skill_${skill}`] || 0;
  if (skill === "intellect") {
    if (has(s, C(30))) n++;
    if (kind === "investigate" && has(s, C(34))) n++;
    if (has(s, C(115))) n++;
  }
  if (skill === "combat" && has(s, C(18))) n++;
  if (skill === "willpower" && has(s, C(115))) n++;
  return n;
}
export function createGame(
  difficulty: Difficulty = "standard",
  seed = Date.now() >>> 0 || 1,
): GameState {
  const s: GameState = {
    version: 1,
    id: `case-${seed}`,
    seed: seed || 1,
    nextId: 1,
    difficulty,
    status: "mulligan",
    phase: "investigation",
    round: 1,
    actions: 3,
    actionsTaken: 0,
    act: 1,
    agenda: 1,
    doom: 0,
    player: {
      code: C(4),
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
    locations: [113, 117, 116, 118, 119, 120].map((n) => ({
      code: C(n),
      revealed: n === 113,
      active: n === 113,
      clues: n === 113 ? 2 : 0,
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
  s.player.deck = shuffle(
    s,
    JOE_DECK.map((c) => instance(s, c)),
  );
  const setAside: Instance[] = [];
  while (s.player.hand.length < 5) {
    const c = s.player.deck.shift()!;
    if (card(c.code).subtype_code) setAside.push(c);
    else s.player.hand.push(c);
  }
  s.player.deck = shuffle(s, [...s.player.deck, ...setAside]);
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
  if (s.player.damage >= 7 || s.player.horror >= 7) {
    if (s.player.damage >= 7) s.campaign.physicalTrauma++;
    if (s.player.horror >= 7) s.campaign.mentalTrauma++;
    finish(s, "defeat");
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
  s.status = "resolution";
  s.test = null;
  s.decision = null;
  s.queue = [];
  s.campaign.result = result;
  const penalty = s.player.hand.some((c) => c.code === C(6)) ? 2 : 0;
  const success = result === "saved" || result === "pursuer";
  s.campaign.xp = Math.max(
    0,
    victoryXP(s) + (success ? 3 : 2) + (result === "saved" ? 1 : 0) - penalty,
  );
  if (success)
    s.campaign.notes.push(
      "The investigators defeated their masked pursuer.",
      "Joe Diamond is the bearer of Dr. Henry Armitage.",
    );
  if (result === "saved") {
    s.campaign.physicalTrauma++;
    s.campaign.notes.push("The investigators saved Miskatonic University.");
  } else {
    s.campaign.mentalTrauma++;
    s.campaign.notes.push("Miskatonic University burned.");
  }
  log(
    s,
    result === "saved"
      ? "The university is saved. The investigation will continue."
      : "Smoke rises over Miskatonic. This night will stay with you.",
    "story",
  );
}
function discardEnemy(s: GameState, e: Enemy, defeated = false, credit = true) {
  s.enemies = s.enemies.filter((x) => x.id !== e.id);
  if (defeated && card(e.code).victory) {
    if (!s.victory.includes(e.code)) s.victory.push(e.code);
  } else s.encounterDiscard.push(e.code);
  if (!defeated) return;
  log(s, `${card(e.code).name} is defeated.`, "good");
  const follow: Effect[] = [];
  if (e.code === C(123)) follow.push(eff("doom", { amount: 1 }));
  if (e.code === C(132) && e.location === s.player.location)
    follow.push(eff("damage", { horror: 1 }));
  if (e.code === C(114) && s.act === 4) follow.push(eff("victory"));
  const logan = has(s, C(18));
  if (credit && logan && !logan.exhausted)
    follow.push(eff("logan", { id: logan.id }));
  front(s, ...follow);
}
function enemyDamage(s: GameState, id: string, n: number, credit = true) {
  const e = activeEnemy(s, id);
  if (!e) return;
  e.damage += n;
  if (e.damage >= (card(e.code).health || 1)) discardEnemy(s, e, true, credit);
}
function discardAsset(s: GameState, id: string, defeated = false) {
  const a = asset(s, id);
  if (!a) return;
  s.player.assets = s.player.assets.filter((x) => x.id !== id);
  s.player.discard.push({ id: a.id, code: a.code });
  log(s, `${card(a.code).name} ${defeated ? "is defeated" : "is discarded"}.`);
  if (
    defeated &&
    a.code === C(16) &&
    s.enemies.some((e) => e.location === s.player.location)
  )
    front(s, eff("bodyguard"));
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
  s.test = {
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
}
function draw(s: GameState, n = 1) {
  front(s, ...Array.from({ length: n }, () => eff("drawOne")));
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
  if (s.player.threats.includes(C(125))) front(s, eff("damage", { horror: 1 }));
  if (target === C(118))
    front(s, eff("discardChoice", { title: "Science Hall", amount: 1 }));
  if (target === C(119) && !s.flags.observatory) {
    front(
      s,
      eff("optionalDraw", {
        title: "Warren Observatory",
        amount: 1,
        source: "observatory",
      }),
    );
  }
}
function revealLocation(s: GameState, c: string) {
  const l = s.locations.find((l) => l.code === c)!;
  if (!l.revealed) {
    l.revealed = true;
    l.clues = card(c).clues || 0;
    log(s, `Discovered ${card(c).name}.`, "story");
  }
}
function move(s: GameState, target: string) {
  s.player.location = target;
  revealLocation(s, target);
  s.enemies.filter((e) => e.engaged).forEach((e) => (e.location = target));
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
    engaged: target === s.player.location,
  };
  s.enemies.push(e);
  log(s, `${card(c).name} appears at ${card(target).name}.`, "bad");
  if (e.engaged) front(s, eff("gatherIntel"));
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
      eff("test", {
        skill: "willpower",
        difficulty: 3,
        title: "Past Curfew",
        source: "agenda1",
      }),
    );
  if (s.agenda === 3) {
    if (s.fireSetAside > 1) {
      s.encounterDiscard.push(...Array(s.fireSetAside - 1).fill(C(129)));
      s.fireSetAside = 1;
    }
    front(
      s,
      eff("test", {
        skill: "agility",
        difficulty: 3,
        title: "Lit Up",
        source: "agenda2",
      }),
    );
  }
  if (s.agenda === 4) {
    s.campaign.physicalTrauma++;
    finish(s, "overrun");
  }
}
function advanceAct(s: GameState) {
  if (s.act === 1) {
    s.player.clues -= 2;
    s.act = 2;
    s.enemies.forEach((e) => s.encounterDiscard.push(e.code));
    s.enemies = [];
    for (const c of [C(117), C(116)])
      s.locations.find((l) => l.code === c)!.active = true;
    location(s).fire = true;
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
    s.enemies.forEach((e) => {
      if (e.code !== C(114)) s.encounterDiscard.push(e.code);
    });
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
      "You escape the dorms. Search the campus and bring 3 clues to Orne Library.",
      "story",
    );
  } else if (s.act === 3) {
    s.player.clues -= 3;
    s.act = 4;
    const armitage: Asset = {
      ...instance(s, C(115)),
      exhausted: false,
      uses: 0,
      damage: 0,
      horror: 0,
    };
    s.player.assets.push(armitage);
    spawn(s, C(114), C(116));
    s.locations.find((l) => l.code === C(116))!.clues += 3;
    const d = s.encounterDeck.indexOf(C(129)),
      x = s.encounterDiscard.indexOf(C(129));
    if (d >= 0) {
      s.encounterDeck.splice(d, 1);
      shuffle(s, s.encounterDeck);
      front(s, eff("fire"));
    } else if (x >= 0) {
      s.encounterDiscard.splice(x, 1);
      front(s, eff("fire"));
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
  if (c !== C(125) && c !== C(129)) s.encounterDiscard.push(c);
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
            eff("encounter"),
          ]),
        ],
      );
      break;
    case "12125":
      if (!s.player.threats.includes(c)) s.player.threats.push(c);
      else s.encounterDiscard.push(c);
      break;
    case "12126":
      if (s.player.clues === 0) front(s, eff("encounter"));
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
    front(s, eff("applyDamage", { data: { allocations } }));
    return;
  }
  const type = dmg > 0 ? "damage" : "horror";
  const eligible = e.direct
    ? []
    : s.player.assets.filter(
        (a) =>
          (card(a.code)[type === "damage" ? "health" : "sanity"] || 0) >
          a[type] + (allocations[a.id]?.[type] || 0),
      );
  if (!eligible.length) {
    const self = allocations.self || { damage: 0, horror: 0 };
    self[type] += type === "damage" ? dmg : hor;
    allocations.self = self;
    front(
      s,
      eff("damage", {
        damage: type === "damage" ? 0 : dmg,
        horror: type === "horror" ? 0 : hor,
        direct: e.direct,
        data: { allocations },
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
        data: { allocations: next },
      }),
    ];
  };
  choice(
    s,
    `Assign ${dmg ? `${dmg} damage` : ""}${dmg && hor ? " and " : ""}${hor ? `${hor} horror` : ""}`,
    "Choose where each point goes. All assigned damage and horror are applied together.",
    [
      option("self", `Joe Diamond · take 1 ${type}`, assign("self")),
      ...eligible.map((a) =>
        option(
          a.id,
          `${card(a.code).name} · take 1 ${type}`,
          assign(a.id),
          `${a[type] + (allocations[a.id]?.[type] || 0)} of ${card(a.code)[type === "damage" ? "health" : "sanity"]} ${type} assigned`,
        ),
      ),
    ],
  );
}
function drain(s: GameState) {
  let iterations = 0;
  while (s.queue.length && !s.decision && !s.test && s.status === "playing") {
    if (++iterations > 500) throw new Error("Effect loop exceeded safe bound");
    const e = s.queue.shift()!;
    switch (e.kind) {
      case "drawOne": {
        if (!s.player.deck.length) {
          if (!s.player.discard.length) break;
          s.player.deck = shuffle(s, s.player.discard.splice(0));
          front(s, eff("damage", { horror: 1 }), eff("drawOne"));
          break;
        }
        const c = s.player.deck.shift()!;
        if (c.code === C(100)) {
          s.player.discard.push(c);
          log(
            s,
            "Overzealous: draw an encounter, then another for surge.",
            "bad",
          );
          front(s, eff("encounter"), eff("encounter"));
        } else {
          s.player.hand.push(c);
          log(s, `Drew ${card(c.code).name}.`);
          if (c.code === C(5) && s.phase === "investigation")
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
      case "applyDamage": {
        const allocations = e.data!.allocations as Allocation;
        const defeated: string[] = [];
        for (const [id, n] of Object.entries(allocations)) {
          if (id === "self") {
            s.player.damage += n.damage;
            s.player.horror += n.horror;
            log(
              s,
              `Took ${n.damage ? n.damage + " damage" : ""}${n.damage && n.horror ? " and " : ""}${n.horror ? n.horror + " horror" : ""}.`,
              "bad",
            );
          } else {
            const a = asset(s, id);
            if (a) {
              a.damage += n.damage;
              a.horror += n.horror;
              if (
                a.damage >= (card(a.code).health || Infinity) ||
                a.horror >= (card(a.code).sanity || Infinity)
              )
                defeated.push(id);
            }
          }
        }
        for (const id of defeated) discardAsset(s, id, true);
        checkDefeat(s);
        break;
      }
      case "attack": {
        const enemy = activeEnemy(s, e.id);
        if (!enemy || enemy.exhausted) break;
        log(s, `${card(enemy.code).name} attacks.`, "bad");
        front(
          s,
          eff("damage", {
            damage: card(enemy.code).enemy_damage || 0,
            horror: card(enemy.code).enemy_horror || 0,
          }),
          ...(enemy.code === C(122) && e.source === "enemy"
            ? [eff("discardAssetChoice")]
            : []),
          eff("lessonLearned"),
        );
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
              ]),
              option("skip", "Decline", []),
            ],
          );
        break;
      }
      case "payEvent":
        s.player.resources -= e.amount || 0;
        removeHand(s, e.id!);
        break;
      case "engagement":
        s.enemies
          .filter((en) => en.location === s.player.location && !en.exhausted)
          .forEach((en) => (en.engaged = true));
        break;
      case "move":
        move(s, e.target!);
        break;
      case "act2check":
        if (s.act === 2 && s.player.location === C(116)) advanceAct(s);
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
        if (s.agenda === 3) {
          const i = s.encounterDiscard.lastIndexOf(C(129));
          if (i >= 0) {
            s.encounterDiscard.splice(i, 1);
            front(s, eff("fire"));
          }
        }
        advanceAgenda(s);
        break;
      case "encounter":
        if (!s.encounterDeck.length) {
          s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
        }
        if (s.encounterDeck.length) encounter(s, s.encounterDeck.shift()!);
        break;
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
        if (!s.flags.joe) {
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
        s.flags[e.source!] = true;
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
        s.enemies.forEach((e) => (e.engaged = false));
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
          option("horror", "Take 1 horror", [eff("damage", { horror: 1 })]),
        ]);
        break;
      case "removeThreat":
        s.player.threats = s.player.threats.filter((c) => c !== e.code);
        s.encounterDiscard.push(e.code!);
        break;
      case "enemyPhase":
        s.phase = "enemy";
        log(s, "Enemy phase. Hunters close in.");
        for (const en of s.enemies) {
          if (
            !en.exhausted &&
            !en.engaged &&
            card(en.code).text?.includes("Hunter") &&
            en.location !== s.player.location
          ) {
            const next = availableConnections(s, en.location).sort(
              (a, b) =>
                distance(s, a, s.player.location) -
                distance(s, b, s.player.location),
            )[0];
            if (next) en.location = next;
            if (en.location === s.player.location) {
              en.engaged = true;
              front(s, eff("gatherIntel"));
            }
          }
        }
        s.queue.push(
          ...engaged(s).map((en) =>
            eff("attack", { id: en.id, source: "enemy" }),
          ),
          eff("upkeep"),
        );
        break;
      case "upkeep":
        s.phase = "upkeep";
        s.enemies.forEach((e) => {
          e.exhausted = false;
          if (e.location === s.player.location) e.engaged = true;
        });
        s.player.assets.forEach((a) => (a.exhausted = false));
        s.player.resources++;
        log(s, "Upkeep: ready cards, draw a card, gain a resource.");
        front(s, eff("draw"), eff("handLimit"), eff("roundEnd"));
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
      case "roundEnd":
        s.phase = "roundEnd";
        if (
          (s.act === 1 && s.player.clues >= 2) ||
          (s.act === 3 && s.player.location === C(120) && s.player.clues >= 3)
        )
          choice(
            s,
            "Advance the act?",
            `Spend ${s.act === 1 ? 2 : 3} clues to continue the story.`,
            [
              option("advance", "Spend clues & advance", [
                eff("advanceAct"),
                eff("newRound"),
              ]),
              option("wait", "Wait until next round", [eff("newRound")]),
            ],
          );
        else front(s, eff("newRound"));
        break;
      case "advanceAct":
        advanceAct(s);
        break;
      case "newRound":
        s.round++;
        s.flags = {
          ...Object.fromEntries(
            Object.entries(s.flags).filter(([k]) => k.startsWith("game_")),
          ),
        };
        s.locations.forEach((l) => (l.reduction = 0));
        s.phase = "mythos";
        s.actions = 3;
        s.actionsTaken = 0;
        log(s, `Round ${s.round}. The mythos stirs.`, "story");
        front(
          s,
          eff("doom", { amount: 1 }),
          eff("encounter"),
          eff("investigation"),
        );
        break;
      case "investigation":
        s.phase = "investigation";
        log(s, "Investigation phase. You have 3 actions.");
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
        choice(
          s,
          "Detective's Intuition",
          "Gain 2 resources and choose a kind of healing.",
          [
            option("damage", "Heal 1 damage", [eff("heal", { damage: 1 })]),
            option("horror", "Heal 1 horror", [eff("heal", { horror: 1 })]),
          ],
        );
        break;
      case "victory":
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
  }
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
      if (a?.code === C(19)) a.uses--;
      testStart(
        s,
        "fight",
        "combat",
        card(en.code).enemy_fight || 0,
        `Fight ${card(en.code).name}`,
        en.id,
        source,
        a ? 1 : 0,
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
        en.location = s.player.location;
        if (enters) front(s, eff("gatherIntel"));
        log(s, `Engaged ${card(en.code).name}.`);
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
      s.flags.game_dormRest = true;
      s.player.damage = Math.max(0, s.player.damage - 1);
      s.player.horror = Math.max(0, s.player.horror - 1);
      log(s, "Rested in the dormitories: heal 1 damage and 1 horror.", "good");
      break;
    case "library":
      s.flags.game_library = true;
      draw(s, 3);
      break;
    case "removeThreat":
      front(s, eff("removeThreat", { code: target }));
      break;
    case "resign":
      finish(s, "resigned");
      break;
    case "clueDamage":
      s.player.clues--;
      enemyDamage(s, target!, 1);
      break;
    case "play": {
      const c = handCard(s, target);
      if (!c) break;
      const def = card(c.code);
      if (def.type_code === "asset") {
        equip(s, c.id);
        break;
      }
      removeHand(s, c.id);
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
  if (
    s.status !== "playing" ||
    s.phase !== "investigation" ||
    s.test ||
    s.decision ||
    s.queue.length
  )
    return "Finish the current resolution first.";
  const fast =
    kind === "clueDamage" ||
    (kind === "move" && s.player.location === C(116) && !s.flags.quad);
  const cost = kind === "library" || kind === "removeThreat" ? 2 : fast ? 0 : 1;
  if (s.actions < cost)
    return `You need ${cost} action${cost === 1 ? "" : "s"}.`;
  if (kind === "investigate") {
    const l = s.locations.find((l) => l.code === (target || s.player.location));
    if (!l?.active || !l.revealed || l.clues === 0)
      return "There are no clues to discover here.";
    if (l.code !== s.player.location) {
      const a = asset(s, source);
      if (a?.code !== C(33) || !availableConnections(s).includes(l.code))
        return "Investigate your location or use Local Map.";
    }
    if (source) {
      const a = asset(s, source);
      if (!a || ![C(31), C(33), C(88)].includes(a.code))
        return "This asset cannot investigate.";
      if (a.code === C(33) && !availableConnections(s).includes(l.code))
        return "Local Map requires a revealed connecting location.";
      if (a.code === C(31) && a.exhausted)
        return "Fingerprint Kit is exhausted.";
      if ([C(31), C(33)].includes(a.code) && a.uses <= 0)
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
    if (kind === "evade" && (!en.engaged || en.exhausted))
      return "You can only evade an enemy engaged with you.";
    if (kind === "engage" && en.engaged)
      return "That enemy is already engaged with you.";
    if (kind === "parley" && en.code !== C(123))
      return "Only Bystanders can be parleyed with here.";
    if (kind === "clueDamage" && (s.act !== 4 || s.player.clues < 1))
      return "Blaze of Glory requires 1 clue.";
    if (kind === "fight" && source) {
      const a = asset(s, source);
      if (!a || ![C(19), C(20)].includes(a.code)) return "Choose a weapon.";
      if (a.code === C(19) && a.uses <= 0)
        return "The M1911 is out of ammunition.";
    }
  }
  if (kind === "move" && !availableConnections(s).includes(target || ""))
    return "That location is not connected.";
  if (kind === "extinguish" && !location(s).fire)
    return "There is no fire here.";
  if (
    kind === "rest" &&
    (s.player.location !== C(117) || s.flags.game_dormRest)
  )
    return "Rest is only available once per game in the Dormitories.";
  if (
    kind === "library" &&
    (s.player.location !== C(120) || s.flags.game_library)
  )
    return "The library action is only available once per game.";
  if (kind === "removeThreat" && !s.player.threats.includes(target || ""))
    return "This threat is not in play.";
  if (kind === "resign" && s.act !== 4)
    return "Resigning becomes available during Act 4.";
  return null;
}
export function canPlay(s: GameState, id: string): string | null {
  const c = handCard(s, id);
  if (!c) return "Card is not in your hand.";
  const def = card(c.code);
  if (
    s.status !== "playing" ||
    s.phase !== "investigation" ||
    s.test ||
    s.decision
  )
    return "Finish the current resolution first.";
  if (def.type_code === "skill")
    return "Commit this card during a matching skill test.";
  if ([C(22), C(36)].includes(c.code))
    return "This event will be offered automatically at its reaction window.";
  if (!["asset", "event"].includes(def.type_code))
    return "This card cannot be played.";
  if (s.player.resources < (def.cost || 0)) return "Not enough resources.";
  const fast = def.text?.startsWith("Fast.");
  if (!fast && s.actions < 1) return "No actions remaining.";
  if (c.code === C(24) && s.actionsTaken > 0)
    return "Play only as your first action.";
  if ([C(24), C(38)].includes(c.code) && location(s).clues === 0)
    return "No clues at this location.";
  if (c.code === C(37) && !engaged(s).length)
    return "No engaged enemy to evade.";
  if (def.is_unique && s.player.assets.some((a) => a.code === c.code))
    return "A unique copy is already in play.";
  return null;
}
export function commitValue(s: GameState, id: string) {
  const c = handCard(s, id);
  if (!c || !s.test || card(c.code).subtype_code) return 0;
  return (
    (card(c.code)[`skill_${s.test.skill}`] || 0) +
    (card(c.code).skill_wild || 0)
  );
}
export function testValue(s: GameState) {
  const t = s.test;
  if (!t) return 0;
  return (
    t.base + t.bonus + t.committed.reduce((n, id) => n + commitValue(s, id), 0)
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
      mod += 1;
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
  log(
    s,
    `${t.title}: ${t.success ? "success" : "failure"} (${t.tokens.join(", ")}).`,
    t.success ? "good" : "bad",
  );
}
function resolve(s: GameState) {
  const t = s.test!;
  const success = t.success!;
  const committed = t.committed.map((id) => handCard(s, id)!).filter(Boolean);
  t.committed.forEach((id) => removeHand(s, id));
  s.test = null;
  const effects: Effect[] = [];
  if (success) {
    switch (t.kind) {
      case "investigate": {
        const a = asset(s, t.source);
        const extra =
          committed.filter((c) => c.code === C(39)).length +
          (a?.code === C(31) ? 1 : 0);
        effects.push(
          eff("discover", { amount: 1 + extra, target: t.target }),
          eff("joe"),
        );
        const dorothy = has(s, C(30));
        if (dorothy && (t.margin === 1 || t.margin === 3))
          effects.push(eff("dorothy", { id: dorothy.id }));
        if (a?.code === C(88))
          effects.push(eff("flashlight", { id: a.id, target: t.target }));
        if (a?.code === C(33))
          effects.push(eff("localMapMove", { id: a.id, target: t.target }));
        break;
      }
      case "fight": {
        const a = asset(s, t.source);
        let damage =
          1 +
          (a?.code === C(19) ? 1 : 0) +
          committed.filter((c) => c.code === C(25)).length;
        if (
          a?.code === C(20) &&
          !a.exhausted &&
          engaged(s).length === 1 &&
          engaged(s)[0].id === t.target
        ) {
          choice(s, "Machete", "Exhaust Machete to deal 1 additional damage.", [
            option("exhaust", `Exhaust · deal ${damage + 1} damage`, [
              eff("exhaust", { id: a.id }),
              eff("enemyDamage", { id: t.target, amount: damage + 1 }),
            ]),
            option("keep", `Keep ready · deal ${damage} damage`, [
              eff("enemyDamage", { id: t.target, amount: damage }),
            ]),
          ]);
        } else
          effects.push(eff("enemyDamage", { id: t.target, amount: damage }));
        break;
      }
      case "evade": {
        const en = activeEnemy(s, t.target);
        if (en) {
          en.engaged = false;
          en.exhausted = true;
          log(s, `${card(en.code).name} is evaded.`, "good");
        }
        if (t.source === "cracks") effects.push(eff("cracksMove"));
        break;
      }
      case "parley": {
        const en = activeEnemy(s, t.target);
        if (en) discardEnemy(s, en);
        break;
      }
      case "extinguish":
        s.locations.find((l) => l.code === t.target)!.fire = false;
        s.encounterDiscard.push(C(129));
        log(s, "The fire is extinguished.", "good");
        break;
    }
    for (const c of committed)
      if ([C(92), C(93)].includes(c.code)) effects.push(eff("draw"));
    if (t.tokens.includes("elder_sign"))
      effects.push(eff("draw"), eff("gain", { amount: 1 }));
  } else {
    if (t.kind === "fight") {
      const en = activeEnemy(s, t.target);
      if (en && !en.exhausted && card(en.code).text?.includes("Retaliate"))
        effects.push(eff("attack", { id: en.id, source: "retaliate" }));
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
    if (t.tokens.includes("tablet")) effects.push(eff("damage", { damage: 1 }));
    if (
      t.tokens.includes("elder_thing") &&
      (hardDifficulty(s) || margin >= 2)
    ) {
      const i = s.encounterDiscard.lastIndexOf(C(129));
      if (i >= 0) {
        s.encounterDiscard.splice(i, 1);
        effects.push(eff("fire"));
      }
    }
  }
  front(s, ...effects);
}
function hardDifficulty(s: GameState) {
  return s.difficulty === "hard" || s.difficulty === "expert";
}
function actionCost(s: GameState, n: number, safe: boolean) {
  const first = s.actionsTaken === 0;
  s.actions -= n;
  s.actionsTaken += n;
  if (!safe && !(has(s, C(115)) && first))
    s.queue.push(
      ...engaged(s).map((en) =>
        eff("attack", { id: en.id, source: "opportunity" }),
      ),
    );
}
export function reduceGame(state: GameState, action: Action): GameState {
  const s = structuredClone(state);
  s.error = null;
  if (action.type === "clearError") return s;
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
    s.status = "playing";
    log(s, "Opening hand ready. Begin your investigation.", "story");
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
    if (!s.test || s.test.stage !== "commit") return state;
    if (s.test.committed.includes(action.id)) {
      s.test.committed = s.test.committed.filter((id) => id !== action.id);
      return s;
    }
    if (commitValue(s, action.id) <= 0) return state;
    const c = handCard(s, action.id)!;
    if (
      card(c.code).text?.includes("Max 1 committed") &&
      s.test.committed.some((id) => handCard(s, id)?.code === c.code)
    ) {
      s.error = "Only one copy may be committed to this test.";
      return s;
    }
    s.test.committed.push(action.id);
    return s;
  }
  if (action.type === "boost") {
    if (!s.test || s.test.stage !== "commit" || s.player.resources < 1)
      return state;
    const a = asset(s, action.id);
    const valid =
      (a?.code === C(17) && ["combat", "agility"].includes(s.test.skill)) ||
      (a?.code === C(35) && ["intellect", "willpower"].includes(s.test.skill));
    if (!valid) return state;
    s.player.resources--;
    s.test.bonus +=
      (a?.code === C(17) && ["fight", "evade"].includes(s.test.kind)) ||
      (a?.code === C(35) && ["investigate", "parley"].includes(s.test.kind))
        ? 2
        : 1;
    return s;
  }
  if (action.type === "reveal") {
    if (s.test?.stage === "commit") reveal(s);
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
    s.player.resources -= d.cost || 0;
    actionCost(s, fast ? 0 : 1, fast || [C(24), C(37)].includes(c.code));
    s.queue.push(eff("perform", { title: "play", target: action.id }));
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
      ].includes(action.kind)
    )
      return state;
    const reason = canAct(s, action.kind, action.target, action.source);
    if (reason) {
      s.error = reason;
      return s;
    }
    const fast =
      action.kind === "clueDamage" ||
      (action.kind === "move" && s.player.location === C(116) && !s.flags.quad);
    if (action.kind === "move" && fast) s.flags.quad = true;
    const safe =
      fast ||
      ["fight", "evade", "parley", "resign"].includes(action.kind) ||
      (action.kind === "engage" && s.player.location === C(113));
    actionCost(
      s,
      fast ? 0 : ["library", "removeThreat"].includes(action.kind) ? 2 : 1,
      safe,
    );
    s.queue.push(
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
      s.phase !== "investigation" ||
      s.test ||
      s.decision
    )
      return state;
    s.actions = 0;
    const burn: Effect[] = [];
    if (location(s).fire) {
      burn.push(eff("damage", { damage: 1, direct: true }));
      for (const a of [...s.player.assets])
        if (card(a.code).health) {
          a.damage++;
          if (a.damage >= card(a.code).health!) discardAsset(s, a.id, true);
        }
    }
    for (const en of [...s.enemies])
      if (
        s.locations.find((l) => l.code === en.location)?.fire &&
        !card(en.code).traits?.includes("Elite")
      )
        enemyDamage(s, en.id, 1, false);
    s.queue.push(...burn, eff("enemyPhase"));
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
    actions: s.actions,
    act: s.act,
    agenda: s.agenda,
    doom: s.doom,
    player: {
      location: card(s.player.location).name,
      resources: s.player.resources,
      clues: s.player.clues,
      health: 7 - s.player.damage,
      sanity: 7 - s.player.horror,
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
    coordinateSystem:
      "DOM layout; map percentages measured from top-left, x right, y down",
  };
}
