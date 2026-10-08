import type { Card } from "./types";
import type { StarterDeck } from "./catalog";
import type { DeckOptions, BarkhamJudgments } from "./decks";

/** The companion binds to loopback; tokens stay inside its own origin. */
const configuredUrl =
  import.meta.env?.VITE_ARKHAM_RULES_URL || "http://127.0.0.1:5194";
const configuredOrigin = new URL(configuredUrl);
if (
  configuredOrigin.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(configuredOrigin.hostname) ||
  configuredOrigin.username ||
  configuredOrigin.password ||
  configuredOrigin.pathname !== "/" ||
  configuredOrigin.search ||
  configuredOrigin.hash
)
  throw new Error("VITE_ARKHAM_RULES_URL must be a loopback HTTP origin.");
export const RULES_SERVER_URL = configuredOrigin.origin;

export interface RulesServerStatus {
  ready: boolean;
  version: string;
  sourceUrl: string;
  supportedCardCodes: string[];
  limitations: string[];
  extensions?: string[];
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${RULES_SERVER_URL}/chronicle/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      let message = "The rules server could not complete this request.";
      try {
        const error = await response.json();
        if (typeof error.error === "string") message = error.error;
      } catch {
        /* The server may be starting or unavailable. */
      }
      throw new Error(message);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const getRulesServerStatus = async (): Promise<RulesServerStatus> => {
  const status = await request<RulesServerStatus>("status");
  if (!status.ready || !Array.isArray(status.supportedCardCodes))
    throw new Error(
      "The rules server is still starting. Try connecting again.",
    );
  return status;
};

export interface ServerDeck {
  name: string;
  investigator_code: string;
  slots: Record<string, number>;
  sideSlots?: Record<string, number>;
  meta?: Record<string, string>;
  taboo_id?: number | null;
}

export function starterServerDeck(deck: StarterDeck): ServerDeck {
  const slots: Record<string, number> = {};
  for (const slot of deck.slots)
    slots[slot.code] = (slots[slot.code] || 0) + slot.quantity;
  return { name: deck.name, investigator_code: deck.investigatorCode, slots };
}

/** Shape validation only. Printed deckbuilding rules are checked separately. */
export function parseServerDeck(value: unknown): ServerDeck {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Choose an ArkhamDB deck JSON file.");
  const deck = value as Record<string, unknown>;
  if (
    typeof deck.investigator_code !== "string" ||
    !deck.slots ||
    typeof deck.slots !== "object" ||
    Array.isArray(deck.slots)
  )
    throw new Error("The deck needs an investigator_code and slots.");
  const slots = deck.slots as Record<string, unknown>;
  if (
    !Object.keys(slots).length ||
    Object.entries(slots).some(
      ([code, quantity]) =>
        !/^[A-Za-z0-9-]+$/.test(code) ||
        typeof quantity !== "number" ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 100,
    )
  )
    throw new Error(
      "Each deck slot needs a card code and a positive whole-number quantity.",
    );
  // arkhamdb.com exports "" for a deck without choices and [] for an empty
  // side deck; both mean "none" rather than malformed data.
  let meta = deck.meta === null || deck.meta === "" ? undefined : deck.meta;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      throw new Error("Deck meta contains invalid JSON.");
    }
  }
  if (
    meta !== undefined &&
    (!meta ||
      typeof meta !== "object" ||
      Array.isArray(meta) ||
      Object.values(meta).some((v) => typeof v !== "string"))
  )
    throw new Error("Deck choices in meta must be strings.");
  if (
    deck.taboo_id !== undefined &&
    deck.taboo_id !== null &&
    (!Number.isSafeInteger(deck.taboo_id) || (deck.taboo_id as number) < 0)
  )
    throw new Error("Invalid taboo list identifier.");
  const sideSlots =
    deck.sideSlots === null ||
    (Array.isArray(deck.sideSlots) && deck.sideSlots.length === 0)
      ? undefined
      : deck.sideSlots;
  if (
    sideSlots !== undefined &&
    (!sideSlots ||
      typeof sideSlots !== "object" ||
      Array.isArray(sideSlots) ||
      Object.entries(sideSlots).some(
        ([code, quantity]) =>
          !/^[A-Za-z0-9-]+$/.test(code) ||
          typeof quantity !== "number" ||
          !Number.isSafeInteger(quantity) ||
          quantity < 1 ||
          quantity > 100,
      ))
  )
    throw new Error(
      "Side-deck slots need card codes and positive whole-number quantities.",
    );
  return {
    name:
      typeof deck.name === "string" && deck.name.trim()
        ? deck.name.trim().slice(0, 150)
        : "Imported deck",
    investigator_code: deck.investigator_code,
    slots: slots as Record<string, number>,
    ...(sideSlots === undefined
      ? {}
      : { sideSlots: sideSlots as Record<string, number> }),
    ...(meta === undefined ? {} : { meta: meta as Record<string, string> }),
    ...(deck.taboo_id === undefined
      ? {}
      : { taboo_id: deck.taboo_id as number | null }),
  };
}

export function serverDeckOptions(deck: ServerDeck): DeckOptions {
  const selections = { ...deck.meta };
  const customizations = Object.fromEntries(
    Object.entries(deck.meta || {})
      .filter(([key]) => key.startsWith("cus_"))
      .map(([key, value]) => [key.slice(4), value]),
  );
  // ArkhamDB stores these choices as faction_selected, deck_size_selected and
  // option_selected; the shorter names remain accepted from earlier imports.
  const secondary = deck.meta?.faction_selected || deck.meta?.faction;
  const deckSize = deck.meta?.deck_size_selected || deck.meta?.deck_size;
  const trait = deck.meta?.option_selected || deck.meta?.option;
  if (secondary) selections["Secondary Class"] = secondary;
  if (deckSize) selections["Deck Size"] = deckSize;
  if (trait) selections["Trait Choice"] = trait;
  let barkhamJudgments: BarkhamJudgments | undefined;
  if (deck.meta?.chronicle_barkham_judgments) {
    try {
      const value = JSON.parse(deck.meta.chronicle_barkham_judgments);
      if (
        value &&
        typeof value === "object" &&
        Array.isArray(value.eligibleOffClassCards) &&
        value.eligibleOffClassCards.every(
          (x: unknown) => typeof x === "string",
        ) &&
        Array.isArray(value.catCards) &&
        value.catCards.every((x: unknown) => typeof x === "string") &&
        typeof value.artworkReviewed === "boolean"
      )
        barkhamJudgments = value;
    } catch {
      /* Missing judgments remain explicit validation issues. */
    }
  }
  return {
    selections,
    ...(Object.keys(customizations).length ? { customizations } : {}),
    ...(deck.investigator_code.startsWith("barkham-")
      ? { barkham: true, ...(barkhamJudgments ? { barkhamJudgments } : {}) }
      : {}),
    ...(deck.sideSlots
      ? {
          sideDeck: Object.entries(deck.sideSlots).map(([code, quantity]) => ({
            code,
            quantity,
          })),
        }
      : {}),
  };
}

export function unsupportedDeckCards(
  deck: ServerDeck,
  supported: ReadonlySet<string>,
): string[] {
  return [
    ...new Set([
      deck.investigator_code,
      ...Object.keys(deck.slots),
      ...Object.keys(deck.sideSlots || {}),
      ...[deck.meta?.alternate_front, deck.meta?.alternate_back].filter(
        (code): code is string => !!code,
      ),
    ]),
  ].filter((code) => !supported.has(code));
}

export function serverProductCoverage(
  codes: readonly string[],
  supported: ReadonlySet<string>,
  cards: ReadonlyMap<string, Card>,
) {
  // Minis and promotional alternate-art placeholders are not executable definitions.
  const playable = codes.filter((code) => {
    const c = cards.get(code);
    return c && !c.miniature && !c.hidden && c.type_code !== "key";
  });
  return {
    total: playable.length,
    registered: playable.filter((code) => supported.has(code)).length,
  };
}

export const importServerDeck = (deck: ServerDeck) =>
  request<{ id: string }>("decks", { deckName: deck.name, deckList: deck });

export function rulesFrameUrl(path: string) {
  if (!/^\/(?:campaigns\/new|decks|games\/[A-Za-z0-9-]+)?$/.test(path))
    throw new Error("Invalid rules table route.");
  return `${RULES_SERVER_URL}/chronicle/open?path=${encodeURIComponent(path)}`;
}

export interface EpicSeat {
  id: string;
  gameId: string;
  ordinal: number;
  seatIndex: number;
  name: string;
  deckId?: string;
}
export interface EpicEvent {
  id: string;
  name: string;
  totalInvestigators: number;
  groups: {
    ordinal: number;
    name: string;
    gameId: string;
    investigatorCount: number;
    seatCount: number;
  }[];
  localSeats: EpicSeat[];
}
export const listEpicEvents = () =>
  request<{ id: string; name: string }[]>("epic/events");
export const getEpicEvent = (id: string) =>
  request<EpicEvent>(`epic/events/${id}`);
export const createEpicEvent = (input: {
  name: string;
  scenarioId: "70001" | "87001";
  difficulty: "Easy" | "Standard" | "Hard" | "Expert";
  groups: { name: string; playerCount: number; groupDifficulty?: string }[];
}) => request<EpicEvent>("epic/events", input);
export const prepareEpicSeat = (seatId: string, deck: ServerDeck) =>
  request<{ gameId: string; seatId: string; deckId: string }>(
    `epic/seats/${seatId}`,
    { deckName: deck.name, deckList: deck },
  );
export function epicSeatFrameUrl(seat: EpicSeat) {
  return `${rulesFrameUrl(`/games/${seat.gameId}`)}&seat=${encodeURIComponent(seat.id)}`;
}

export interface CompanionSession {
  gameId: string;
  seatId?: string;
}
const companionQuery = (session: CompanionSession) => session.seatId
  ? `?seat=${encodeURIComponent(session.seatId)}` : "";
export const listCompanionGames = () => request<unknown[]>("play/games");
export const getCompanionGame = (session: CompanionSession) =>
  request<unknown>(`play/games/${session.gameId}${companionQuery(session)}`);
export const getCompanionDecks = (session?: CompanionSession) =>
  request<unknown[]>(`play/decks${session ? companionQuery(session) : ""}`);
export const answerCompanionGame = (session: CompanionSession, reply: unknown) =>
  request<unknown>(`play/games/${session.gameId}/answer${companionQuery(session)}`, reply);
export const undoCompanionGame = (session: CompanionSession) =>
  request<unknown>(`play/games/${session.gameId}/undo${companionQuery(session)}`, {});
export const getCompanionGameStep = (session: CompanionSession) =>
  request<{ step: number }>(`play/games/${session.gameId}/step${companionQuery(session)}`);
export const getCompanionEpicReady = (session: CompanionSession) =>
  request<import("../../scripts/companion-epic-ready.mjs").EpicReadyStatus>(
    `play/games/${session.gameId}/ready${companionQuery(session)}`,
  );
export const markCompanionEpicReady = (session: CompanionSession) =>
  request<import("../../scripts/companion-epic-ready.mjs").EpicReadyStatus>(
    `play/games/${session.gameId}/ready${companionQuery(session)}`, {},
  );
export const upgradeCompanionDeck = (session: CompanionSession, upgrade: unknown) =>
  request<unknown>(`play/games/${session.gameId}/upgrade-deck${companionQuery(session)}`, upgrade);
export const sendCompanionVentNote = (session: CompanionSession, note: unknown) =>
  request<unknown>(`play/games/${session.gameId}/vent-note${companionQuery(session)}`, note);
export interface CompanionPlayOptions {
  sourceRevision: string;
  campaigns: { id: string; name: string; beta?: true; alpha?: true; returnTo?: { id: string; beta?: true; alpha?: true }; variants?: {key:string}[] }[];
  scenarios: { id: string; name: string; beta?: true; alpha?: true; campaign?: string; variant?: "blobElse" | "mini"; standaloneDifficulties?: string[] }[];
}
export const getCompanionPlayOptions = () => request<CompanionPlayOptions>("play/options");
export interface CompanionPresentation {
  sourceRevision: string;
  strings: Record<string, string>;
  scenarioSettings: Record<string, unknown[]>;
  campaignSettings: Record<string, unknown[]>;
  sideStories: unknown[];
}
export const getCompanionPresentation = () => request<CompanionPresentation>("play/presentation");
export interface CompanionCardDefinition {
  cardCode: string;
  art: string;
  name: {title: string; subtitle?: string | null};
  revealedName?: {title: string; subtitle?: string | null};
  cardType: string;
  doubleSided?: boolean;
  otherSide?: string;
  alternateCardCodes?: string[];
  customBack?: string;
}
export const getCompanionCardDefinitions = () => request<CompanionCardDefinition[]>("play/card-definitions");
export const createCompanionGame = (input: {
  name: string;
  campaignId?: string;
  scenarioId?: string;
  difficulty: string;
  playerCount: number;
  variant?: string;
}) => request<{ id: string }>("play/games", input);
