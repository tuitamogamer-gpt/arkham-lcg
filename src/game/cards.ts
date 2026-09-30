import { card, code as C } from "./data";
import type { Asset, Skill, Test } from "./types";

// Declarative card knowledge shared by the engine and the interface. Unique
// card effects still live in the engine; these tables describe the common
// archetypes so that a new weapon, tool, boost or ally is data, not code.

export type UsesKind = "ammo" | "charges" | "supplies" | "secrets";

export interface WeaponScript {
  skill: Skill;
  /** Printed skill bonus for the attack. */
  bonus: number;
  /** Counter on the weapon; ammo is an attack cost, charges are card-specific. */
  uses?: UsesKind;
  /** When the printed +1 damage applies. */
  damage?: "always" | "attackedThisTurn" | "targetExhausted";
  /** Card-specific follow-up handled by the engine. */
  ability?: "machete" | "bottle" | "cleaver" | "cosmicFlame" | "twin45";
}
export const WEAPONS: Record<string, WeaponScript> = {
  [C(2)]: { skill: "combat", bonus: 2, damage: "attackedThisTurn" },
  [C(19)]: { skill: "combat", bonus: 1, uses: "ammo", damage: "always" },
  [C(20)]: { skill: "combat", bonus: 1, ability: "machete" },
  [C(45)]: {
    skill: "agility",
    bonus: 0,
    uses: "ammo",
    damage: "targetExhausted",
  },
  [C(77)]: { skill: "combat", bonus: 1, ability: "cleaver" },
  [C(86)]: { skill: "combat", bonus: 1, ability: "bottle" },
  [C(14)]: {
    skill: "combat",
    bonus: 1,
    uses: "ammo",
    damage: "always",
    ability: "twin45",
  },
  [C(59)]: {
    skill: "willpower",
    bonus: 0,
    uses: "charges",
    ability: "cosmicFlame",
  },
};
export const isWeapon = (code: string) => code in WEAPONS;

export interface ToolScript {
  skill: Skill | "choice";
  bonus: number;
  uses?: UsesKind;
  /** One use is spent when the action is taken. */
  spendOnUse?: boolean;
  exhausts?: boolean;
  /** Investigate a revealed connecting location instead of your own. */
  remote?: boolean;
  /** Engine follow-up on success. */
  ability?:
    "fingerprint" | "localMap" | "thievesKit" | "flashlight" | "secondSight";
  cost: string;
  effect: string;
  counter?: string;
}
export const TOOLS: Record<string, ToolScript> = {
  [C(31)]: {
    skill: "intellect",
    bonus: 1,
    uses: "supplies",
    spendOnUse: true,
    exhausts: true,
    ability: "fingerprint",
    cost: "1 action · 1 supply · exhaust this card",
    effect: "+1 intellect. On success, discover 1 additional clue.",
    counter: "supplies",
  },
  [C(33)]: {
    skill: "intellect",
    bonus: 1,
    uses: "secrets",
    spendOnUse: true,
    remote: true,
    ability: "localMap",
    cost: "1 action · 1 secret",
    effect:
      "+1 intellect at a revealed connecting location. On success, you may exhaust this card to move there.",
    counter: "secrets",
  },
  [C(49)]: {
    skill: "choice",
    bonus: 0,
    uses: "supplies",
    spendOnUse: true,
    ability: "thievesKit",
    cost: "1 action · 1 supply",
    effect: "Choose intellect or agility. On success, gain 1 resource.",
    counter: "supplies",
  },
  [C(88)]: {
    skill: "intellect",
    bonus: 1,
    ability: "flashlight",
    cost: "1 action",
    effect:
      "+1 intellect. On success, you may discard this card to lower this location’s shroud by 1 this round.",
  },
  [C(62)]: {
    skill: "willpower",
    bonus: 0,
    uses: "charges",
    ability: "secondSight",
    cost: "1 action",
    effect:
      "Investigate with willpower. On success, you may spend 1 charge to discover 1 additional clue.",
    counter: "charges",
  },
};
export const isTool = (code: string) => code in TOOLS;

export interface BoostScript {
  skills: Skill[];
  /** +2 instead of +1 when the test matches. */
  doubled: (test: Test, sourceCode?: string) => boolean;
}
const spellTest = (_test: Test, sourceCode?: string) =>
  /Spell|Ritual/.test((sourceCode && card(sourceCode)?.traits) || "");
export const BOOSTS: Record<string, BoostScript> = {
  [C(17)]: {
    skills: ["combat", "agility"],
    doubled: (t) => ["fight", "evade"].includes(t.kind),
  },
  [C(35)]: {
    skills: ["intellect", "willpower"],
    doubled: (t) => ["investigate", "parley"].includes(t.kind),
  },
  [C(47)]: {
    skills: ["intellect", "agility"],
    doubled: (t) => ["evade", "parley"].includes(t.kind),
  },
  [C(76)]: {
    skills: ["willpower", "agility"],
    doubled: (t) => ["treachery", "extinguish", "parley"].includes(t.kind),
  },
  [C(63)]: { skills: ["willpower", "combat"], doubled: spellTest },
};
export function boostAmount(a: Asset, t: Test, sourceCode?: string): number {
  const boost = BOOSTS[a.code];
  if (!boost || !boost.skills.includes(t.skill)) return 0;
  return boost.doubled(t, sourceCode) ? 2 : 1;
}

/** Constant skill bonuses while the asset is in play. */
export const STATIC_BONUSES: Record<
  string,
  Partial<Record<Skill, number>> & { onlyWhile?: string }
> = {
  [C(30)]: { intellect: 1 },
  [C(34)]: { intellect: 1, onlyWhile: "investigate" },
  [C(115)]: { intellect: 1, willpower: 1 },
  [C(18)]: { combat: 1 },
  [C(46)]: { agility: 1 },
  [C(60)]: { willpower: 1 },
};

/** Skill cards that draw a card when their test succeeds. */
export const SKILL_DRAW_ON_SUCCESS = new Set([C(90), C(91), C(92), C(93)]);
/** Threats that the printed double action discards. */
export const REMOVABLE_THREATS = new Set([C(125), C(103), C(104), C(102)]);
/** Supply assets discarded when their last supply is spent. */
export const DISCARD_WHEN_EMPTY = new Set([C(73), C(74)]);
export const HAND_SIZE_BONUS: Record<string, number> = { [C(32)]: 2 };
export const usesKind = (code: string): UsesKind | undefined =>
  WEAPONS[code]?.uses ||
  TOOLS[code]?.uses ||
  (/Uses \(\d+ (ammo|charges|supplies|secrets)\)/.exec(
    card(code)?.text || "",
  )?.[1] as UsesKind | undefined);
export const printedUses = (code: string) =>
  Number(/Uses \((\d+)/.exec(card(code)?.text || "")?.[1] || 0);
/** Events offered automatically at their reaction window, never by hand. */
export const REACTION_EVENTS = new Set([C(22), C(36), C(78), C(65)]);
/** Fast cards that may be played in any window, even outside your turn. */
export const ANY_WINDOW_EVENTS = new Set([C(64)]);
