import { catalogCardCode } from "./rules-protocol.mjs";

const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const investigators = new Set(["barkham-001", "barkham-004", "barkham-007", "barkham-010", "barkham-013"]);
const keys = (value) => Array.isArray(value) ? value.map((entry) => entry[0]) : Object.keys(record(value));
const barkhamCard = (code) => {
  const normalized = catalogCardCode(code);
  return typeof normalized === "string" && (/^barkham-\d{3}$/.test(normalized) || normalized.startsWith(":barkham:"));
};

// Mirror the native barkhamDeckRejection membership rule on the actual saved
// playList. All deck legality and all other answer behavior remain native.
export function barkhamDeckRejection(snapshot, savedDeck) {
  const game = record(snapshot?.game ?? snapshot), mode = record(game.mode);
  const scenario = record(mode.That ?? (Array.isArray(mode.These) ? mode.These[1] : undefined) ?? game.scenario);
  const deck = record(savedDeck?.playList ?? savedDeck?.list ?? savedDeck);
  const inBarkham = catalogCardCode(scenario.id) === "barkham-022";
  const barkhamInvestigator = investigators.has(catalogCardCode(deck.investigator_code));
  const barkhamCards = [...keys(deck.slots), ...keys(deck.sideSlots)].some(barkhamCard);
  if (inBarkham && !barkhamInvestigator) return "This scenario requires a Barkham investigator.";
  if (!inBarkham && (barkhamInvestigator || barkhamCards)) return "Barkham characters and cards can only be used in The Meddling of Meowlathotep.";
  return null;
}
