import type {
  CompanionChoice,
  CompanionQuestion,
} from "../src/game/companionProtocol.ts";

export type MachinationsGroup = "Past" | "Present" | "Future";
export interface MachinationsMemory {
  group?: MachinationsGroup;
  gameId?: string;
  actorId?: string;
  playerId?: string;
  lastAbility?: {
    cardCode?: string;
    index: number;
    source: any;
    witness: Record<string, any>;
  };
  lastCardPlayed?: string;
  locationVisits?: Record<string, number>;
}
export interface MachinationsSelection {
  choice: CompanionChoice;
  reason: string;
}
export interface MachinationsPolicyInput {
  snapshot: any;
  question: CompanionQuestion;
  cards: any[] | Map<string, any> | Record<string, any>;
  memory?: MachinationsMemory;
}
export function selectMachinationsChoice(
  input: MachinationsPolicyInput,
): MachinationsSelection | undefined;
/** Commit the returned copy only after the selected actual native answer succeeds. */
export function observeMachinationsChoice(input: {
  snapshot: any;
  question: CompanionQuestion;
  selection?: MachinationsSelection;
  memory?: MachinationsMemory;
}): MachinationsMemory;
