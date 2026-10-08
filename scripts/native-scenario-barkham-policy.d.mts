import type { CompanionChoice, CompanionQuestion } from "../src/game/companionProtocol.ts";
import type { DeckCards } from "../src/game/decks.ts";

export interface BarkhamPolicyOptions {
  snapshot: Record<string, any>;
  question: CompanionQuestion | undefined;
  cards: DeckCards;
  memory: Record<string, any>;
}
export function selectBarkhamChoice(options: BarkhamPolicyOptions): {
  choice: CompanionChoice;
  reason: string;
} | undefined;
