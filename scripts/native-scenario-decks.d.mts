import type { DeckCards, DeckOptions, DeckValidation } from "../src/game/decks.ts";
import type { ServerDeck } from "../src/game/rulesServer.ts";

export type NativeScenarioDeckKind = "roland" | "kate";
export interface CoreBasicWeakness {
  code: string;
  name: string;
  type: "treachery" | "enemy";
}
export interface NativeScenarioDeck {
  deck: ServerDeck;
  validation: DeckValidation;
  weaknessDraw: {
    schema: 1;
    method: "node:crypto.randomInt";
    collection: "Core Set printed basic weaknesses only";
    playerCardPacks: string[];
    pool: CoreBasicWeakness[];
    poolSize: number;
    index: number;
    code: string;
    name: string;
    probability: number;
    draws: 1;
    drawnAt: string;
    nativeRngChanged: false;
  };
}
export function buildSlots(kind: NativeScenarioDeckKind, weaknessCode: string): Record<string, number>;
export function nativeScenarioDeckOptions(kind: NativeScenarioDeckKind): DeckOptions;
export function coreBasicWeaknessPool(cards: DeckCards): CoreBasicWeakness[];
export function createNativeScenarioDeck(kind: NativeScenarioDeckKind, cards: DeckCards, name?: string): NativeScenarioDeck;
