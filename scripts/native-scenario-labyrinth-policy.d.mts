import type { CompanionChoice, CompanionQuestion } from "../src/game/companionProtocol.ts";

export type LabyrinthGroup = "GroupA" | "GroupB" | "GroupC";
export type LabyrinthSecretChamber = "70016" | "70017" | "70018";
export interface LabyrinthKnowledge {
  code: LabyrinthSecretChamber;
  method: "arcane-runes-card-label" | "vent-note-read" | "rift-private-exchange";
  recipientGroup: "GroupC";
  recipientGameId: string;
  witness: Record<string, any>;
  communication?: string;
}
export interface LabyrinthMemory {
  group?: LabyrinthGroup;
  /** Runner scheduling control: enable only after all three local prerequisites. */
  allowStageAdvance?: boolean;
  /** Set after an actual sender transfer witness, never by reading hidden cargo. */
  expectVentDelivery?: boolean;
  secretChamber?: LabyrinthKnowledge;
  lastAbility?: {cardCode?: string; index: number; source: unknown; witness: Record<string, any>};
  lastCardPlayed?: string;
  runeRewardRequested?: boolean;
  noteWritten?: boolean;
  pendingNoteRead?: {storyCode: string; witness: Record<string, any>};
  ventPayload?: {destination?: LabyrinthGroup; note?: string; assetCode?: string; clues?: number};
  ventSent?: boolean;
  lastVentSend?: {destination?: LabyrinthGroup; witness: Record<string, any>};
  clueGiftSent?: boolean;
  paradoxExchange?: {destination: LabyrinthGroup; recipientId: string; exchangeId: string; witness: Record<string, any>};
  injected?: boolean;
  valveTurned?: boolean;
  leverPulled?: boolean;
  locationVisits?: Record<string, number>;
  [key: string]: unknown;
}
export type LabyrinthSelection = {choice: CompanionChoice; reason: string} | {note: string; reason: string};
export interface LabyrinthPolicyInput {
  snapshot: any;
  question: CompanionQuestion;
  cards: any[] | Map<string, any> | Record<string, any>;
  memory?: LabyrinthMemory;
  teamKnowledge?: {secretChamber?: LabyrinthKnowledge};
}
export function selectLabyrinthChoice(input: LabyrinthPolicyInput): LabyrinthSelection | undefined;
/** Commit returned memory only after the selected actual answer succeeds. */
export function observeLabyrinthChoice(input: {snapshot: any; question: CompanionQuestion; selection?: LabyrinthSelection; memory?: LabyrinthMemory}): LabyrinthMemory;
export function labyrinthProgress(snapshot: any, memory?: LabyrinthMemory): {
  stage?: number; group?: LabyrinthGroup; ready: boolean; conditions?: Record<string, any>;
};
/** Record an explicitly documented private conversation while both actual
 * native Rift participant prompts for the same exchange are still open. */
export function labyrinthRiftKnowledge(input: {aSnapshot: any; aQuestion: CompanionQuestion; cSnapshot: any; cQuestion: CompanionQuestion}): LabyrinthKnowledge | undefined;
