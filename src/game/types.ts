export type Skill = "willpower" | "intellect" | "combat" | "agility";
export type Difficulty = "easy" | "standard" | "hard" | "expert";
export interface Card {
  code: string;
  name: string;
  subname?: string;
  type_code: string;
  faction_code: string;
  text?: string;
  back_text?: string;
  flavor?: string;
  back_flavor?: string;
  traits?: string;
  position: number;
  quantity: number;
  cost?: number | null;
  xp?: number;
  slot?: string;
  health?: number;
  health_per_investigator?: boolean;
  clues_per_investigator?: boolean;
  sanity?: number;
  skill_willpower?: number;
  skill_intellect?: number;
  skill_combat?: number;
  skill_agility?: number;
  skill_wild?: number;
  enemy_damage?: number;
  enemy_horror?: number;
  enemy_fight?: number;
  enemy_evade?: number;
  shroud?: number;
  clues?: number | null;
  doom?: number;
  stage?: number;
  victory?: number;
  encounter_code?: string;
  subtype_code?: string;
  is_unique?: boolean;
  illustrator?: string;
  errata_date?: string;
}
export interface Instance {
  id: string;
  code: string;
}
export interface Asset extends Instance {
  exhausted: boolean;
  uses: number;
  damage: number;
  horror: number;
}
export interface Enemy extends Instance {
  location: string;
  damage: number;
  exhausted: boolean;
  engaged: boolean;
  engagedWith?: string;
  skipReady?: boolean;
  owner?: string;
}
export interface Location {
  code: string;
  revealed: boolean;
  active: boolean;
  clues: number;
  fire: boolean;
  reduction: number;
}
// Effects are serializable commands so pending windows survive save/reload.
export interface Effect {
  kind: string;
  actor?: string;
  code?: string;
  id?: string;
  target?: string;
  amount?: number;
  damage?: number;
  horror?: number;
  direct?: boolean;
  skill?: Skill;
  difficulty?: number;
  title?: string;
  source?: string;
  data?: Record<string, unknown>;
}
export interface Choice {
  id: string;
  label: string;
  detail?: string;
  effects: Effect[];
}
export interface Decision {
  title: string;
  description: string;
  choices: Choice[];
}
export interface Test {
  kind: string;
  skill: Skill;
  difficulty: number;
  base: number;
  bonus: number;
  title: string;
  target?: string;
  source?: string;
  committed: string[];
  stage: "commit" | "revealed";
  tokens: string[];
  modifier: number;
  success?: boolean;
  margin?: number;
  extraDamage?: number;
}
export interface Investigator {
  code: string;
  location: string;
  resources: number;
  clues: number;
  damage: number;
  horror: number;
  hand: Instance[];
  deck: Instance[];
  discard: Instance[];
  assets: Asset[];
  threats: string[];
  actions: number;
  actionsTaken: number;
  turnEnded: boolean;
  turnStarted: boolean;
  mulliganDone: boolean;
  status: "active" | "defeated" | "resigned";
  flags: Record<string, boolean | number>;
  xp: number;
  physicalTrauma: number;
  mentalTrauma: number;
}
export interface LogEntry {
  id: number;
  round: number;
  text: string;
  tone: "neutral" | "good" | "bad" | "story";
}
export interface EventChange {
  label: string;
  before: string;
  after: string;
}
export interface VisibleEvent {
  id: number;
  round: number;
  phase: GameState["phase"];
  actor: string;
  title: string;
  description: string;
  card?: string;
  tone: "neutral" | "good" | "bad" | "story";
  changes: EventChange[];
  continueLabel: string;
}
export interface GameState {
  version: 3;
  id: string;
  seed: number;
  nextId: number;
  difficulty: Difficulty;
  status: "mulligan" | "playing" | "resolution";
  phase: "investigation" | "enemy" | "upkeep" | "mythos" | "roundEnd";
  round: number;
  act: number;
  agenda: number;
  doom: number;
  player: Investigator;
  companions: Investigator[];
  partyOrder: string[];
  leadInvestigator: string;
  turnInvestigator: string;
  locations: Location[];
  enemies: Enemy[];
  encounterDeck: string[];
  encounterDiscard: string[];
  fireSetAside: number;
  flags: Record<string, boolean | number>;
  bag: string[];
  queue: Effect[];
  event: VisibleEvent | null;
  eventHistory: VisibleEvent[];
  eventSerial: number;
  decision: Decision | null;
  test: Test | null;
  log: LogEntry[];
  error: string | null;
  victory: string[];
  campaign: {
    notes: string[];
    xp: number;
    physicalTrauma: number;
    mentalTrauma: number;
    result: string | null;
  };
}
export type Action =
  | { type: "continue"; eventId: number }
  | { type: "switchInvestigator"; code: string }
  | { type: "mulligan"; ids: string[] }
  | { type: "act"; kind: string; target?: string; source?: string }
  | { type: "play"; id: string }
  | { type: "commit"; id: string }
  | { type: "boost"; id: string }
  | { type: "reveal" }
  | { type: "resolve" }
  | { type: "choose"; id: string }
  | { type: "endTurn" }
  | { type: "clearError" };
