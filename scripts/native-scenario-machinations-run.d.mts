import type { CompanionQuestion } from "../src/game/companionProtocol.ts";
import type { MachinationsMemory } from "./native-scenario-machinations-policy.mjs";

/** Actual canonical native printed Read title, never translated prose or metadata. */
export function machinationsReadResolution(
  question: CompanionQuestion,
): 1 | 2 | 3 | 4 | undefined;
export interface MachinationsRunnerIo {
  proof: any;
  participants: any[];
  memories: Map<string, MachinationsMemory>;
  cards: any[];
  protocol: any;
  request: (...args: any[]) => Promise<any>;
  snapshot: (participant: any) => Promise<any>;
  questionFor: (current: any) => CompanionQuestion | undefined;
  respond: (...args: any[]) => Promise<any>;
  saveSnapshot: (...args: any[]) => Promise<any>;
  checkpoint: () => Promise<any>;
  pathFor: (participant: any, operation?: string) => string;
  createNativeScenarioDeck: (...args: any[]) => any;
  conventionalChoice?: (...args: any[]) => any;
  maxAnswers: number;
  maxMinutes: number;
  setupOnly: boolean;
  resuming?: boolean;
}
export function playFreshMachinations(io: MachinationsRunnerIo): Promise<void>;
