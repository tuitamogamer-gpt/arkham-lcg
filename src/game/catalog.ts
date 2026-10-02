import manifest from "../../public/data/catalog.json";
import { registerCatalogCards } from "./data";
import type { Card } from "./types";

export type ProductKind =
  | "core"
  | "deluxe"
  | "mythos"
  | "investigator-expansion"
  | "campaign-expansion"
  | "starter-deck"
  | "standalone"
  | "return-to"
  | "novella"
  | "promo"
  | "parallel"
  | "small-campaign";
export interface CatalogProduct {
  code: string;
  name: string;
  cycleCode: string;
  cycleName: string;
  releaseDate: string;
  releaseDateBasis?: "official-announcement" | "official-year" | "repository";
  description?: string;
  artworkVariant?: boolean;
  importStatus?: string;
  kind: ProductKind;
  cardCodes: string[];
  investigatorCodes: string[];
  reprintOf?: string[];
  legacy: boolean;
  sourceUrl: string;
}
export type Product = CatalogProduct;
export interface DeckSlot {
  code: string;
  quantity: number;
}
export interface StarterDeck {
  id: string;
  name: string;
  investigatorCode: string;
  productCode: string;
  slots: DeckSlot[];
  upgrades: DeckSlot[];
  kind: "preconstructed" | "core-suggested";
  sourceUrl: string;
  notes?: string;
}
export interface CatalogManifest {
  schemaVersion: number;
  asOf: string;
  revision: string;
  cardFiles: string[];
  products: CatalogProduct[];
  starterDecks: StarterDeck[];
  counts: {
    cardCount: number;
    investigatorCount: number;
    packCount: number;
    productCount: number;
    encounterSetCount: number;
    starterDeckCount: number;
    hiddenFaceCount: number;
  };
}
export const catalog = manifest as CatalogManifest;
const productMap = new Map(catalog.products.map((p) => [p.code, p]));
const cardProducts = new Map<string, CatalogProduct[]>();
for (const product of catalog.products)
  for (const code of product.cardCodes) {
    const products = cardProducts.get(code) || [];
    products.push(product);
    cardProducts.set(code, products);
  }
export const productsForCard = (c: Card | string) =>
  cardProducts.get(typeof c === "string" ? c : c.code) || [];
export const productForCard = (c: Card | string) =>
  typeof c === "string"
    ? productsForCard(c)[0]
    : productMap.get(c.pack_code || "") || productsForCard(c)[0];
export const starterDeckForInvestigator = (code: string) =>
  catalog.starterDecks.find(
    (d) =>
      d.investigatorCode === code &&
      productMap.get(d.productCode)?.kind === "starter-deck",
  );
export const kindLabel = (kind: string) =>
  ({
    core: "Core set",
    deluxe: "Deluxe expansion",
    mythos: "Mythos pack",
    "investigator-expansion": "Investigator expansion",
    "campaign-expansion": "Campaign expansion",
    "starter-deck": "Separately sold investigator deck",
    standalone: "Standalone scenario",
    "return-to": "Return to expansion",
    novella: "Novella companion",
    promo: "Promotional cards",
    parallel: "Parallel investigator",
    "small-campaign": "Small campaign",
  })[kind] || kind;

let loadedCards: Card[] | undefined;
let pending: Promise<Card[]> | undefined;
export const cachedCatalogCards = () => loadedCards;
export function loadCatalogCards(): Promise<Card[]> {
  if (loadedCards) return Promise.resolve(loadedCards);
  if (pending) return pending;
  pending = Promise.all(
    catalog.cardFiles.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok)
        throw new Error(
          "The collection could not be loaded. Please try again.",
        );
      const cards = (await response.json()) as Card[];
      if (
        !Array.isArray(cards) ||
        cards.some((c) => !c.code || !c.name || !c.type_code)
      )
        throw new Error(
          "The collection data could not be read. Please try again.",
        );
      return cards;
    }),
  )
    .then((shards) => {
      const cards = shards.flat();
      if (
        cards.length !== catalog.counts.cardCount ||
        new Set(cards.map((c) => c.code)).size !== cards.length
      )
        throw new Error("The collection is incomplete. Please try again.");
      registerCatalogCards(cards);
      loadedCards = cards;
      return cards;
    })
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
