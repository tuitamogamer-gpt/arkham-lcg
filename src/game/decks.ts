import type { Card } from "./types";
import type { DeckSlot, StarterDeck } from "./catalog";
import { parseCustomizationSheet, type CustomizationSheet } from "./customizations";

/** The imported catalogue retains several ArkhamDB fields beyond the core cards. */
interface DeckCard extends Card {
  alternate_of?: string;
  restrictions?: string | { investigator?: Record<string, number> };
  tags?: string;
  exceptional?: boolean;
  myriad?: boolean;
  bonded_to?: string;
  bonded_count?: number;
  customization_options?: unknown[];
  side_deck_options?: unknown[];
  side_deck_requirements?: string;
  deckbuilding_notes?: string;
}
export type DeckCards = readonly Card[] | ReadonlyMap<string, Card>;
export interface DeckIssue {
  code: string;
  message: string;
  cardCode?: string;
  /** Unsupported rules block certification just as an illegal deck does. */
  severity: "error" | "unsupported";
}
export interface DeckOptions {
  /** Keys are the printed option id/name, e.g. "Secondary Class" or "faction_1". */
  selections?: Record<string, string>;
  /** Individual ArkhamDB cus_CARD sheets; XP is shared by all card copies. */
  customizations?: Record<string, string>;
  playerCount?: number;
  extraBasicWeaknesses?: number;
  /** Campaign awards bypass normal class/level access but never copy limits. */
  storyCards?: string[];
  earnedRewards?: string[];
  /** Subject 5U-21's latest devoured class, recorded by the campaign. */
  devouredClass?: string;
  totalEarnedXp?: number;
  availableXp?: number;
  standalone?: boolean;
  physicalTrauma?: number;
  mentalTrauma?: number;
  /** Parallel Skids/Agnes may retain these lower-level copies after upgrading. */
  retainedCards?: DeckSlot[];
  sideDeck?: DeckSlot[];
  /** Explicit setup selections; no decision is made on the player's behalf. */
  hunchDeck?: DeckSlot[];
  marketDeck?: DeckSlot[];
  ancestralSkills?: DeckSlot[];
  startingCard?: string;
  barkham?: boolean;
  /** Barkham deliberately asks players to judge illustrations and humour. */
  barkhamJudgments?: BarkhamJudgments;
}
export interface BarkhamJudgments {
  eligibleOffClassCards: string[];
  catCards: string[];
  artworkReviewed: boolean;
}
const barkhamArtInvestigators = new Set([
  "barkham-004",
  "barkham-007",
  "barkham-010",
  "barkham-013",
]);
const printedCatTitles = new Set([
  "Stray Cat",
  "The Black Cat",
  "Miss Doyle",
  "Hope",
  "Augur",
  "Zeal",
]);
export interface RequiredDeckCard {
  alternatives: string[];
  quantity: number;
}
export interface DeckValidation {
  valid: boolean;
  issues: DeckIssue[];
  slots: DeckSlot[];
  deckSize: number;
  countedSize: number;
  totalCards: number;
  basicWeaknessCount: number;
  requiredBasicWeaknesses: number;
  requiredCards: RequiredDeckCard[];
  xp: number;
  bonusXp: number;
}
export interface PreparedDeck {
  validation: DeckValidation;
  /** Unshuffled cards. The game owns RNG and opening-hand/mulligan procedures. */
  deck: string[];
  permanents: string[];
  setAside: string[];
  startingHand: string[];
  startingChoices: string[];
  hunchDeck: string[];
  marketDeck: string[];
  ancestralSkills: string[];
  sideDeck: string[];
}
interface DeckRule {
  faction?: string[];
  trait?: string[];
  type?: string[];
  tag?: string[];
  uses?: string[];
  text?: string[];
  slot?: string[];
  level?: { min: number; max: number };
  base_level?: { min: number; max: number };
  limit?: number;
  atleast?: { factions: number; min: number };
  not?: boolean;
  permanent?: boolean;
  ignore_match?: boolean;
  name?: string;
  id?: string;
  size?: number;
  error?: string;
  faction_select?: string[];
  option_select?: DeckRule[];
  deck_size_select?: string[];
}
const classes = ["guardian", "seeker", "rogue", "mystic", "survivor"];
const knownRuleKeys = new Set([
  "faction",
  "trait",
  "type",
  "tag",
  "uses",
  "text",
  "slot",
  "level",
  "base_level",
  "limit",
  "atleast",
  "not",
  "permanent",
  "ignore_match",
  "name",
  "id",
  "size",
  "error",
  "faction_select",
  "option_select",
  "deck_size_select",
]);
const playerTypes = new Set(["asset", "event", "skill"]);
const asMap = (cards: DeckCards): ReadonlyMap<string, DeckCard> =>
  Array.isArray(cards)
    ? new Map(cards.map((c) => [c.code, c as DeckCard]))
    : (cards as ReadonlyMap<string, DeckCard>);
const plain = (text = "") =>
  text.replace(/<[^>]*>/g, "").replace(/\[\[|\]\]/g, "");
const words = (text = "") =>
  text
    .toLowerCase()
    .split(".")
    .map((x) => x.trim())
    .filter(Boolean);
const traits = (c: Card) => words(c.traits);
const factions = (c: Card) =>
  [c.faction_code, c.faction2_code, c.faction3_code].filter(
    (x): x is string => !!x,
  );
const keyword = (c: Card, word: string) =>
  new RegExp(`(?:^|[.\\n])\\s*${word}\\.`, "i").test(plain(c.text));
const isPermanent = (c: Card) => c.permanent || keyword(c, "Permanent");
const isMyriad = (c: DeckCard) => c.myriad || keyword(c, "Myriad");
const isExceptional = (c: DeckCard) =>
  c.exceptional || keyword(c, "Exceptional");
const isWeakness = (c: Card) =>
  c.subtype_code === "weakness" || c.subtype_code === "basicweakness";
const quantityOf = (slots: DeckSlot[], code: string) =>
  slots.find((s) => s.code === code)?.quantity || 0;
const expand = (slots: DeckSlot[]) =>
  slots.flatMap((s) => Array(s.quantity).fill(s.code) as string[]);
function canonicalCode(
  c: DeckCard,
  cards: ReadonlyMap<string, DeckCard>,
): string {
  const seen = new Set<string>();
  while (c.duplicate_of && !seen.has(c.code) && cards.has(c.duplicate_of)) {
    seen.add(c.code);
    c = cards.get(c.duplicate_of)!;
  }
  return c.code;
}
function investigatorBase(
  c: DeckCard,
  cards: ReadonlyMap<string, DeckCard>,
): DeckCard {
  return cards.get(c.alternate_of || c.duplicate_of || "") || c;
}
function normalizeSlots(
  slots: readonly DeckSlot[],
  issues: DeckIssue[],
): DeckSlot[] {
  const quantities = new Map<string, number>();
  for (const s of slots) {
    if (!s.code || !Number.isSafeInteger(s.quantity) || s.quantity <= 0) {
      issues.push({
        code: "quantity",
        severity: "error",
        cardCode: s.code,
        message: "Each deck entry needs a positive whole-number quantity.",
      });
      continue;
    }
    quantities.set(s.code, (quantities.get(s.code) || 0) + s.quantity);
  }
  return [...quantities].map(([code, quantity]) => ({ code, quantity }));
}
function resolveRules(
  raw: unknown[] | undefined,
  options: DeckOptions,
  issues: DeckIssue[],
): { rules: DeckRule[]; size: number; chosenSize?: number } {
  const rules: DeckRule[] = [];
  let size = 0;
  let chosenSize: number | undefined;
  for (let index = 0; index < (raw?.length || 0); index++) {
    const value = raw![index];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      issues.push({
        code: "unsupported-option",
        severity: "unsupported",
        message:
          "An investigator deckbuilding option has an unrecognized format.",
      });
      continue;
    }
    let rule = value as DeckRule;
    for (const key of Object.keys(rule))
      if (!knownRuleKeys.has(key))
        issues.push({
          code: "unsupported-option",
          severity: "unsupported",
          message: `Deckbuilding restriction '${key}' has not been implemented.`,
        });
    const arrays = [
      "faction",
      "trait",
      "type",
      "tag",
      "uses",
      "text",
      "slot",
      "faction_select",
      "deck_size_select",
    ] as const;
    const malformedArray = arrays.some(
      (key) =>
        rule[key] !== undefined &&
        (!Array.isArray(rule[key]) ||
          !rule[key]!.every((entry) => typeof entry === "string")),
    );
    const malformedLevel = [rule.level, rule.base_level].some(
      (range) =>
        range !== undefined &&
        (!range ||
          !Number.isSafeInteger(range.min) ||
          !Number.isSafeInteger(range.max) ||
          range.min < 0 ||
          range.max < range.min ||
          Object.keys(range).some((key) => key !== "min" && key !== "max")),
    );
    const malformedCount = [rule.limit, rule.size].some(
      (n) => n !== undefined && (!Number.isSafeInteger(n) || n < 0),
    );
    const malformedMinimum =
      rule.atleast !== undefined &&
      (!rule.atleast ||
        !Number.isSafeInteger(rule.atleast.min) ||
        !Number.isSafeInteger(rule.atleast.factions) ||
        rule.atleast.min < 0 ||
        rule.atleast.factions < 1 ||
        rule.atleast.factions > 5 ||
        Object.keys(rule.atleast).some(
          (key) => key !== "min" && key !== "factions",
        ));
    const malformedSelection =
      rule.option_select !== undefined &&
      (!Array.isArray(rule.option_select) ||
        rule.option_select.some(
          (entry) =>
            !entry || typeof entry !== "object" || typeof entry.id !== "string",
        ));
    const malformedBoolean = [rule.not, rule.permanent, rule.ignore_match].some(
      (value) => value !== undefined && typeof value !== "boolean",
    );
    if (
      malformedArray ||
      malformedLevel ||
      malformedCount ||
      malformedMinimum ||
      malformedSelection ||
      malformedBoolean
    ) {
      issues.push({
        code: "unsupported-option",
        severity: "unsupported",
        message: "A deckbuilding restriction contains invalid filter values.",
      });
      continue;
    }
    const key = rule.id || rule.name || `option:${index}`;
    const selected = options.selections?.[key];
    if (rule.faction_select || rule.option_select || rule.deck_size_select) {
      const allowed =
        rule.faction_select ||
        rule.deck_size_select ||
        rule.option_select!.map((x) => x.id!);
      if (!selected || !allowed.includes(selected)) {
        issues.push({
          code: "choice-required",
          severity: "error",
          message: `Choose ${rule.name || key}: ${allowed.join(", ")}.`,
        });
        continue;
      }
      if (rule.deck_size_select) {
        chosenSize = Number(selected);
        continue;
      }
      if (rule.option_select) {
        const chosen = rule.option_select.find((x) => x.id === selected)!;
        const resolved = resolveRules(
          [chosen],
          { ...options, selections: {} },
          issues,
        );
        rules.push(...resolved.rules);
        size += resolved.size;
        continue;
      }
      rule = { ...rule, faction: [selected] };
    }
    if (rule.text)
      for (const text of rule.text) {
        try {
          new RegExp(text, "i");
        } catch {
          issues.push({
            code: "unsupported-option",
            severity: "unsupported",
            message: `A deckbuilding text filter cannot be interpreted: ${text}.`,
          });
        }
      }
    size += rule.size || 0;
    rules.push(rule);
  }
  const classChoices = rules
    .filter((r) => r.id?.startsWith("faction_"))
    .map((r) => r.faction?.[0]);
  if (new Set(classChoices).size < classChoices.length)
    issues.push({
      code: "duplicate-choice",
      severity: "error",
      message: "Choose two different investigator classes.",
    });
  return { rules, size, chosenSize };
}
/** Filters within one option are AND; values inside each filter are OR. Tags and
 * text are alternate representations of the same printed ability restriction. */
function matchesRule(
  card: DeckCard,
  rule: DeckRule,
  options: DeckOptions,
): boolean {
  const xp = card.xp ?? 0;
  if (rule.level && (xp < rule.level.min || xp > rule.level.max)) return false;
  if (
    rule.base_level &&
    (xp < rule.base_level.min || xp > rule.base_level.max) &&
    !factions(card).includes(options.devouredClass || "")
  )
    return false;
  if (
    rule.faction?.length &&
    !rule.faction.some((f) => factions(card).includes(f))
  )
    return false;
  if (
    rule.trait &&
    !rule.trait.some((t) => traits(card).includes(t.toLowerCase()))
  )
    return false;
  if (rule.type && !rule.type.includes(card.type_code)) return false;
  if (
    rule.slot &&
    !rule.slot.some((s) => words(card.slot).includes(s.toLowerCase()))
  )
    return false;
  if (rule.permanent !== undefined && !!isPermanent(card) !== rule.permanent)
    return false;
  if (rule.uses) {
    const match = plain(card.text).match(/Uses\s*\([^)]*\b([a-z]+)\)/i);
    if (!match || !rule.uses.includes(match[1].toLowerCase())) return false;
  }
  if (rule.tag || rule.text) {
    const tagMatch = rule.tag?.some((t) => words(card.tags).includes(t));
    const textMatch = rule.text?.some((pattern) => {
      try {
        return new RegExp(pattern, "i").test(card.text || "");
      } catch {
        return false;
      }
    });
    if (!tagMatch && !textMatch) return false;
  }
  return true;
}
function requirementQuantity(
  card: DeckCard | undefined,
  investigator: DeckCard,
  deckSize: number,
  options: DeckOptions,
): number {
  if (!card) return 1;
  if (card.code === "06008") return Math.max(1, (deckSize - 20) / 10);
  if (card.code === "09006") return options.playerCount || 1;
  if (card.code === "08015") return 1; // Replaced below by the chosen discipline count.
  if (investigator.code === "90087" && card.name === "Improvisation") return 2;
  return card.deck_limit || 1;
}
function readRequirements(
  investigator: DeckCard,
  cards: ReadonlyMap<string, DeckCard>,
  deckSize: number,
  options: DeckOptions,
  issues: DeckIssue[],
): { required: RequiredDeckCard[]; weaknesses: number } {
  const required: RequiredDeckCard[] = [];
  let weaknesses = 0;
  for (const part of (investigator.deck_requirements || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)) {
    if (/^size:\d+$/.test(part)) continue;
    if (part === "random:subtype:basicweakness") {
      weaknesses++;
      continue;
    }
    if (part.startsWith("card:")) {
      const alternatives = part.slice(5).split(":");
      if (alternatives.some((code) => !cards.has(code)))
        issues.push({
          code: "missing-definition",
          severity: "error",
          message: `A required signature alternative is missing from the collection: ${alternatives.filter((code) => !cards.has(code)).join(", ")}.`,
        });
      // Parallel Lola's five alternative Improvisations form one choice group.
      const previous = required.find(
        (r) => r.alternatives[0] === alternatives[0],
      );
      if (previous) {
        previous.alternatives = [
          ...new Set([...previous.alternatives, ...alternatives]),
        ];
        continue;
      }
      const found = alternatives.map((code) => cards.get(code)).find(Boolean);
      if (!found)
        issues.push({
          code: "missing-definition",
          severity: "error",
          message: `Required card definitions are unavailable: ${alternatives.join(", ")}.`,
        });
      required.push({
        alternatives,
        quantity: requirementQuantity(found, investigator, deckSize, options),
      });
      continue;
    }
    issues.push({
      code: "unsupported-requirement",
      severity: "unsupported",
      message: `Deck requirement '${part}' has not been implemented.`,
    });
  }
  return { required, weaknesses };
}
function cardRestriction(
  card: DeckCard,
  investigator: DeckCard,
  cards: ReadonlyMap<string, DeckCard>,
): boolean | undefined {
  if (!card.restrictions) return true;
  const base = investigatorBase(investigator, cards);
  const permittedIds = new Set([
    investigator.code,
    base.code,
    investigator.duplicate_of,
  ]);
  if (typeof card.restrictions === "object") {
    if (Object.keys(card.restrictions).some((k) => k !== "investigator"))
      return undefined;
    return Object.keys(card.restrictions.investigator || {}).some((code) =>
      permittedIds.has(code),
    );
  }
  const parts = card.restrictions.split(",").map((x) => x.trim().split(":"));
  if (
    parts.some(([key]) => !["investigator", "trait", "faction"].includes(key))
  )
    return undefined;
  return parts.some(([key, value]) =>
    key === "investigator"
      ? permittedIds.has(value)
      : key === "trait"
        ? traits(investigator).includes(value.toLowerCase())
        : factions(investigator).includes(value),
  );
}
const cardSizeChanges: Record<string, number> = {
  "Forced Learning": 15,
  "Underworld Support": -5,
  "Ancestral Knowledge": 5,
  Versatile: 5,
  "Underworld Market": 10,
  Collector: 5,
};
const upgradeRules = new Set([
  "Adaptable",
  "Shrewd Analysis",
  "Arcane Research",
  "Down the Rabbit Hole",
  "In the Thick of It",
  "Chained",
  "Offer You Cannot Refuse",
]);

/** Validate against the investigator's imported rules without downloading data or
 * mutating the slots. Certification is deliberately blocked by unknown rules. */
export function validateDeck(
  investigatorCode: string,
  input: readonly DeckSlot[],
  source: DeckCards,
  options: DeckOptions = {},
): DeckValidation {
  const cards = new Map(asMap(source));
  const issues: DeckIssue[] = [];
  const slots = normalizeSlots(input, issues);
  const customizationSheets = new Map<string, CustomizationSheet>();
  for (const slot of slots) {
    const card = cards.get(slot.code);
    if (!card) continue;
    const raw = options.customizations?.[slot.code];
    if (!card.customization_options && raw === undefined) continue;
    const sheet = parseCustomizationSheet(card, raw, source);
    issues.push(...sheet.issues);
    if (card.customization_options) {
      customizationSheets.set(slot.code, sheet);
      cards.set(slot.code, sheet.effectiveCard);
    }
  }
  const investigator = cards.get(investigatorCode);
  const result: DeckValidation = {
    valid: false,
    issues,
    slots,
    deckSize: 0,
    countedSize: 0,
    totalCards: slots.reduce((n, s) => n + s.quantity, 0),
    basicWeaknessCount: 0,
    requiredBasicWeaknesses: 0,
    requiredCards: [],
    xp: 0,
    bonusXp: 0,
  };
  const error = (
    code: string,
    message: string,
    cardCode?: string,
    severity: DeckIssue["severity"] = "error",
  ) => issues.push({ code, message, cardCode, severity });
  if (
    !investigator ||
    investigator.type_code !== "investigator" ||
    !investigator.deck_requirements ||
    !Array.isArray(investigator.deck_options)
  ) {
    error(
      "investigator",
      "This card is not a deckbuilding investigator with complete requirements.",
      investigatorCode,
    );
    return result;
  }
  if (investigator.miniature || investigator.bonded_to || investigator.hidden)
    error(
      "investigator",
      "Select the investigator's normal front, rather than a mini-card, bonded form or hidden face.",
      investigatorCode,
    );
  if (investigator.content_restriction === "barkham_only" && !options.barkham)
    error(
      "content-restriction",
      "This investigator is only permitted in Barkham Horror.",
      investigatorCode,
    );
  if (
    investigator.deckbuilding_notes &&
    !(
      options.barkham &&
      barkhamArtInvestigators.has(investigator.code) &&
      options.barkhamJudgments
    )
  )
    error(
      "unsupported-rule",
      investigator.deckbuilding_notes,
      investigatorCode,
      "unsupported",
    );
  const resolved = resolveRules(investigator.deck_options, options, issues);
  const sizeMatch =
    investigator.deck_requirements.match(/(?:^|,)\s*size:(\d+)/);
  if (!sizeMatch)
    error(
      "unsupported-requirement",
      "The investigator's deck size is unavailable.",
      investigatorCode,
      "unsupported",
    );
  result.deckSize =
    (resolved.chosenSize ?? Number(sizeMatch?.[1] || 0)) + resolved.size;
  const included = slots.flatMap((s) => {
    const card = cards.get(s.code);
    if (!card) {
      error(
        "unknown-card",
        `Card ${s.code} is missing from the collection.`,
        s.code,
      );
      return [];
    }
    return [{ card, quantity: s.quantity }];
  });
  for (const { card, quantity } of included)
    result.deckSize += (cardSizeChanges[card.name] || 0) * quantity;
  const req = readRequirements(
    investigator,
    cards,
    resolved.chosenSize ?? Number(sizeMatch?.[1] || 0),
    options,
    issues,
  );
  result.requiredCards = req.required;
  const signatureCodes = new Set(req.required.flatMap((r) => r.alternatives));
  const storyCodes = new Set(options.storyCards || []);
  if (
    /Additional Requirements/i.test(investigator.back_text || "") &&
    !["89001", "90087", "08010", "03006", "05002"].includes(investigator.code)
  )
    error(
      "unsupported-rule",
      "This investigator has additional printed deckbuilding requirements that need a native implementation.",
      investigatorCode,
      "unsupported",
    );
  if (
    /(?:Additional|Deckbuilding) Restrictions/i.test(
      investigator.back_text || "",
    ) &&
    !resolved.rules.some((r) => r.not) &&
    !investigator.code.startsWith("barkham")
  )
    error(
      "unsupported-rule",
      "The investigator's printed restriction is missing its structured deckbuilding rule.",
      investigatorCode,
      "unsupported",
    );
  const disciplines = included.filter(
    ({ card }) =>
      card.name === "Discipline" && card.restrictions === "investigator:08010",
  );
  if (investigatorBase(investigator, cards).code === "08010") {
    const count = disciplines.reduce((n, s) => n + s.quantity, 0);
    if (
      count < 1 ||
      count > Math.min(4, 1 + Math.floor((options.totalEarnedXp || 0) / 15))
    )
      error(
        "discipline",
        "Lily needs one chosen Discipline, plus at most one additional Discipline per 15 earned experience.",
      );
    const burden = req.required.find((r) => r.alternatives.includes("08015"));
    if (burden) burden.quantity = Math.max(1, count);
    disciplines.forEach(({ card }) => signatureCodes.add(card.code));
  }
  const signatureMode = (card: DeckCard) =>
    /\bAdvanced\./.test(plain(card.text))
      ? "advanced"
      : /\bReplacement\./.test(plain(card.text))
        ? "replacement"
        : "standard";
  const variantGroups = req.required.filter((r) =>
    r.alternatives.some(
      (code) =>
        cards.get(code) && signatureMode(cards.get(code)!) !== "standard",
    ),
  );
  const bundleModes = new Set(
    included
      .filter(({ card }) =>
        variantGroups.some(
          (r) =>
            r.alternatives.includes(card.code) ||
            r.alternatives.includes(canonicalCode(card, cards)),
        ),
      )
      .map(({ card }) => signatureMode(card)),
  );
  if (bundleModes.has("advanced") && bundleModes.has("standard"))
    error(
      "signature-bundle",
      "Advanced signature cards and their advanced weakness must replace the standard signature bundle together.",
    );
  for (const r of req.required) {
    const found = included.filter(({ card }) =>
      r.alternatives.some(
        (code) => code === card.code || canonicalCode(card, cards) === code,
      ),
    );
    const modes =
      variantGroups.includes(r) && bundleModes.size
        ? [...bundleModes]
        : ["standard"];
    for (const mode of modes) {
      const matching = found.filter(({ card }) => signatureMode(card) === mode);
      const quantity = matching.reduce((n, x) => n + x.quantity, 0);
      const wanted =
        mode === "replacement" && matching.length
          ? investigator.code === "90087" &&
            cards.get(r.alternatives[0])?.name === "Improvisation"
            ? 2
            : requirementQuantity(
                matching[0].card,
                investigator,
                resolved.chosenSize ?? Number(sizeMatch?.[1] || 0),
                options,
              )
          : r.quantity;
      if (quantity !== wanted)
        error(
          "required-card",
          `Include exactly ${wanted} of the ${mode} requirement: ${r.alternatives
            .map((code) => cards.get(code)?.name || code)
            .filter((n, i, a) => a.indexOf(n) === i)
            .join(" or ")}.`,
          r.alternatives[0],
        );
    }
    for (const { card, quantity } of found)
      if (quantity > (card.deck_limit || r.quantity))
        error(
          "copy-limit",
          `${card.name} exceeds its signature-card limit of ${card.deck_limit || r.quantity}.`,
          card.code,
        );
  }
  const retained = normalizeSlots(options.retainedCards || [], issues);
  if (retained.length) {
    const allowedTraits =
      investigator.code === "90008"
        ? ["fortune", "gambit"]
        : investigator.code === "90017"
          ? ["spell"]
          : [];
    for (const s of retained) {
      const card = cards.get(s.code);
      const higher =
        card &&
        included.find(
          ({ card: other }) =>
            other.name === card.name && (other.xp || 0) > (card.xp || 0),
        );
      if (
        !card ||
        !allowedTraits.some((t) => traits(card).includes(t)) ||
        !higher ||
        higher.quantity < s.quantity ||
        quantityOf(slots, s.code) < s.quantity
      )
        error(
          "retained-card",
          "Only the lower-level eligible card retained through this parallel investigator's upgrade ability can be excluded from deck size/copy limits.",
          s.code,
        );
    }
  }
  const unlimited = resolved.rules.filter(
    (r) =>
      !r.not && r.limit === undefined && !r.ignore_match && !r.deck_size_select,
  );
  const limits = resolved.rules.filter((r) => !r.not && r.limit !== undefined);
  const limitCounts = limits.map(() => 0);
  const exclusions = resolved.rules.filter((r) => r.not);
  const otherLimit = /up to[^.\n]*\bother\b/i.test(
    plain(investigator.back_text),
  );
  const titleCounts = new Map<
    string,
    { quantity: number; limit: number; cardCode: string }
  >();
  const variantCounts = new Map<string, number>();
  const myriadXp = new Map<string, number>();
  const paidCustomizationSheets = new Map<string, string>();
  const underworldSupport = included.some(
    ({ card }) => card.name === "Underworld Support",
  );
  const onYourOwn = included.some(
    ({ card }) => card.name === "On Your Own" && isPermanent(card),
  );
  let versatile = included
    .filter(({ card }) => card.name === "Versatile")
    .reduce((n, x) => n + x.quantity, 0);
  let collector = included
    .filter(({ card }) => card.name === "Collector")
    .reduce((n, x) => n + x.quantity, 0);
  let barkhamOffClass = 0;
  if (
    investigator.code === "barkham-013" &&
    !options.barkhamJudgments?.artworkReviewed
  )
    error(
      "barkham-artwork",
      "Review the entire deck for cats in its artwork before playing Duke.",
      investigator.code,
      "unsupported",
    );
  for (const { card, quantity } of included) {
    const signature =
      signatureCodes.has(card.code) ||
      signatureCodes.has(canonicalCode(card, cards));
    const story = storyCodes.has(card.code);
    const weakness = isWeakness(card);
    if (
      investigator.code === "barkham-013" &&
      (traits(card).includes("cat") ||
        printedCatTitles.has(card.name) ||
        options.barkhamJudgments?.catCards.includes(card.code))
    )
      error(
        "barkham-cat",
        "Duke's deck cannot contain cats under any circumstances.",
        card.code,
      );
    const retainedQuantity = quantityOf(retained, card.code);
    if (card.subtype_code === "basicweakness")
      result.basicWeaknessCount += quantity;
    if (!signature && !weakness && !isPermanent(card) && !story)
      result.countedSize += quantity - retainedQuantity;
    const restriction = cardRestriction(card, investigator, cards);
    if (restriction === undefined)
      error(
        "unsupported-restriction",
        "This card's deck restriction has not been implemented.",
        card.code,
        "unsupported",
      );
    else if (!restriction && !signature)
      error(
        "card-restriction",
        `${card.name} is restricted to other investigators.`,
        card.code,
      );
    if (card.content_restriction === "barkham_only" && !options.barkham)
      error(
        "content-restriction",
        `${card.name} can only be used in Barkham Horror.`,
        card.code,
      );
    if (card.bonded_to || card.deck_limit === 0)
      error(
        "bonded-card",
        `${card.name} is a bonded/set-aside card and cannot be purchased into the main deck.`,
        card.code,
      );
    if (card.type_code === "investigator" || card.hidden || card.miniature)
      error(
        "card-type",
        `${card.name} cannot be included as a main-deck card.`,
        card.code,
      );
    if (!signature && !story && !weakness) {
      if (
        !playerTypes.has(card.type_code) ||
        card.xp === undefined ||
        card.encounter_code
      )
        error(
          "card-type",
          `${card.name} is not a purchasable player card; a campaign award must be recorded explicitly.`,
          card.code,
        );
      if (exclusions.some((r) => matchesRule(card, r, options))) {
        // Cursed cards override parallel Rex's Fortune/Blessed prohibition.
        if (!(investigator.code === "90078" && traits(card).includes("cursed")))
          error(
            "forbidden-card",
            `${card.name} is forbidden by this investigator's deckbuilding restrictions.`,
            card.code,
          );
      }
      if (onYourOwn && words(card.slot).includes("ally"))
        error(
          "ally-slot",
          "On Your Own forbids assets occupying an ally slot.",
          card.code,
        );
      let legal = unlimited.some((r) => matchesRule(card, r, options));
      limits.forEach((r, index) => {
        if (matchesRule(card, r, options)) {
          if (!legal || !otherLimit)
            limitCounts[index] += quantity - retainedQuantity;
          legal = true;
        }
      });
      if (
        !legal &&
        options.barkham &&
        barkhamArtInvestigators.has(investigator.code) &&
        options.barkhamJudgments?.eligibleOffClassCards.includes(card.code) &&
        card.xp === 0 &&
        (investigator.code !== "barkham-013" ||
          (card.type_code === "asset" && words(card.slot).includes("ally")))
      ) {
        barkhamOffClass += quantity;
        legal = true;
      }
      if (
        !legal &&
        versatile > 0 &&
        card.xp === 0 &&
        factions(card).some((f) => classes.includes(f))
      ) {
        versatile -= quantity;
        legal = versatile >= 0;
      }
      if (
        !legal &&
        collector > 0 &&
        (card.xp || 0) <= 3 &&
        card.type_code === "asset" &&
        traits(card).some((t) => ["relic", "charm"].includes(t))
      ) {
        collector -= quantity;
        legal = collector >= 0;
      }
      if (!legal)
        error(
          "illegal-card",
          `${card.name} does not meet ${investigator.name}'s class, trait, type or level options.`,
          card.code,
        );
      if (
        keyword(card, "Reward") &&
        !(options.earnedRewards || []).some(
          (code) => code === card.code || cards.get(code)?.name === card.name,
        )
      )
        error(
          "reward",
          `${card.name} must be earned before it can be purchased.`,
          card.code,
        );
    }
    if (!signature) {
      const explicitLimit = plain(card.text).match(
        /Limit (\d+) (?:per deck|[^.]* per deck)/i,
      );
      let limit = isExceptional(card)
        ? 1
        : isMyriad(card)
          ? 3
          : Math.max(0, card.deck_limit ?? 2);
      // Empower Self has a per-subtitle limit as well as the Myriad title limit.
      const subtitleLimit =
        explicitLimit &&
        card.subname &&
        plain(card.text).includes(`(${card.subname})`);
      if (explicitLimit && !subtitleLimit)
        limit = Math.min(limit, Number(explicitLimit[1]));
      if (underworldSupport && !weakness) limit = Math.min(limit, 1);
      const previous = titleCounts.get(card.name);
      titleCounts.set(card.name, {
        quantity: (previous?.quantity || 0) + quantity - retainedQuantity,
        limit: Math.min(previous?.limit ?? limit, limit),
        cardCode: card.code,
      });
      if (subtitleLimit) {
        const key = `${card.name}:${card.subname}`;
        variantCounts.set(key, (variantCounts.get(key) || 0) + quantity);
        if (variantCounts.get(key)! > Number(explicitLimit![1]))
          error(
            "copy-limit",
            `${card.name} (${card.subname}) exceeds its printed per-deck limit.`,
            card.code,
          );
      }
    }
    const sheet = customizationSheets.get(card.code);
    const cost = (card.xp || 0) * (isExceptional(card) ? 2 : 1);
    if (sheet) {
      const previous = paidCustomizationSheets.get(card.name);
      if (previous !== undefined && previous !== sheet.canonicalSheet)
        error("customization-sheet", `${card.name} must use the same customization sheet for every copy.`, card.code);
      if (previous === undefined) result.xp += sheet.totalXp;
      paidCustomizationSheets.set(card.name, sheet.canonicalSheet);
    } else if (isMyriad(card))
      myriadXp.set(card.name, Math.max(myriadXp.get(card.name) || 0, cost));
    else result.xp += cost * quantity;
    if (
      /deck size|Deckbuilding (?:Options|Restrictions)/i.test(
        card.text || "",
      ) &&
      !signature &&
      !cardSizeChanges[card.name] &&
      card.name !== "On Your Own" &&
      !upgradeRules.has(card.name)
    )
      error(
        "unsupported-rule",
        `${card.name} changes deckbuilding in a way that has not been implemented.`,
        card.code,
        "unsupported",
      );
  }
  result.xp += [...myriadXp.values()].reduce((n, x) => n + x, 0);
  if (barkhamOffClass > 5)
    error(
      "barkham-option-limit",
      `The Barkham off-class limit is five cards; the deck uses ${barkhamOffClass}.`,
    );
  for (const [name, count] of titleCounts)
    if (count.quantity > count.limit)
      error(
        "copy-limit",
        `${name}: ${count.quantity} copies exceeds the limit of ${count.limit} by title.`,
        count.cardCode,
      );
  limits.forEach((rule, index) => {
    if (limitCounts[index] > rule.limit!)
      error(
        "option-limit",
        rule.error ||
          `The ${rule.name || "off-class"} limit is ${rule.limit}; the deck uses ${limitCounts[index]}.`,
      );
  });
  for (const rule of resolved.rules.filter((r) => r.atleast)) {
    const counted = (rule.faction || classes).filter(
      (f) =>
        included.reduce(
          (n, { card, quantity }) =>
            n +
            (!signatureCodes.has(card.code) &&
            !isWeakness(card) &&
            factions(card).includes(f)
              ? quantity
              : 0),
          0,
        ) >= rule.atleast!.min,
    ).length;
    if (counted < rule.atleast!.factions)
      error(
        "faction-minimum",
        rule.error ||
          `Include at least ${rule.atleast!.min} cards from ${rule.atleast!.factions} classes.`,
      );
  }
  const skillCount = included.reduce(
    (n, { card, quantity }) => n + (card.type_code === "skill" ? quantity : 0),
    0,
  );
  if (
    included.some(({ card }) => card.name === "Ancestral Knowledge") &&
    skillCount < 10
  )
    error("skill-minimum", "Ancestral Knowledge requires at least 10 skills.");
  if (
    included.some(({ card }) => card.name === "Underworld Market") &&
    included.reduce(
      (n, { card, quantity }) =>
        n + (traits(card).includes("illicit") ? quantity : 0),
      0,
    ) < 10
  )
    error(
      "illicit-minimum",
      "Underworld Market requires 10 Illicit cards for its market deck.",
    );
  if (
    investigator.code === "05002" &&
    included.reduce(
      (n, { card, quantity }) =>
        n +
        (card.type_code === "event" && traits(card).includes("insight")
          ? quantity
          : 0),
      0,
    ) < 11
  )
    error(
      "insight-minimum",
      "Joe Diamond requires at least 11 Insight events, including Unsolved Case.",
    );
  result.bonusXp = /Bonus Experience/i.test(investigator.back_text || "")
    ? 5
    : 0;
  if (included.some(({ card }) => card.name === "In the Thick of It")) {
    result.bonusXp += 3;
    if ((options.physicalTrauma || 0) + (options.mentalTrauma || 0) < 2)
      error(
        "trauma",
        "In the Thick of It requires a recorded choice of two physical and/or mental trauma.",
      );
  }
  const researchTrauma = included
    .filter(({ card }) => card.name === "Arcane Research")
    .reduce((n, s) => n + s.quantity, 0);
  if ((options.mentalTrauma || 0) < researchTrauma)
    error(
      "trauma",
      "Each Arcane Research adds one mental trauma at deck creation.",
    );
  if (investigator.side_deck_requirements)
    result.xp += validateSpiritDeck(investigator, cards, options, issues);
  else if (options.sideDeck?.length)
    error(
      "side-deck",
      "This investigator has no separate spirit-deck requirement.",
    );
  const extra = options.extraBasicWeaknesses || 0;
  if (!Number.isSafeInteger(extra) || extra < 0)
    error(
      "basic-weakness",
      "Additional basic weakness count must be a nonnegative whole number.",
    );
  const standaloneXp = Math.max(
    0,
    result.xp -
      (/Bonus Experience/i.test(investigator.back_text || "") ? 5 : 0),
  );
  result.requiredBasicWeaknesses =
    req.weaknesses +
    extra +
    (options.standalone ? Math.floor(standaloneXp / 10) : 0);
  if (options.standalone && standaloneXp > 49)
    error(
      "xp-budget",
      "A standalone deck can spend at most 49 experience, excluding the investigator's bonus experience.",
    );
  if (result.basicWeaknessCount !== result.requiredBasicWeaknesses)
    error(
      "basic-weakness",
      `Include exactly ${result.requiredBasicWeaknesses} basic weakness${result.requiredBasicWeaknesses === 1 ? "" : "es"}; the deck has ${result.basicWeaknessCount}.`,
    );
  if (result.countedSize !== result.deckSize)
    error(
      "deck-size",
      `Deck size must be ${result.deckSize}; it contains ${result.countedSize} cards after excluding signatures, weaknesses, permanents and campaign awards.`,
    );
  if (
    options.availableXp !== undefined &&
    (!Number.isFinite(options.availableXp) ||
      result.xp > options.availableXp + result.bonusXp)
  )
    error(
      "xp-budget",
      `The deck requires ${result.xp} experience, exceeding the available ${options.availableXp + result.bonusXp}.`,
    );
  for (const [trauma, capacity, label] of [
    [options.physicalTrauma || 0, investigator.health || 0, "physical"],
    [options.mentalTrauma || 0, investigator.sanity || 0, "mental"],
  ] as const)
    if (!Number.isSafeInteger(trauma) || trauma < 0 || trauma >= capacity)
      error(
        "trauma",
        `The investigator cannot begin with ${trauma} ${label} trauma.`,
      );
  if (
    options.playerCount !== undefined &&
    (!Number.isSafeInteger(options.playerCount) ||
      options.playerCount < 1 ||
      options.playerCount > 4)
  )
    error("player-count", "Investigator count must be between 1 and 4.");
  result.valid = issues.length === 0;
  return result;
}

function validateSpiritDeck(
  investigator: DeckCard,
  cards: ReadonlyMap<string, DeckCard>,
  options: DeckOptions,
  issues: DeckIssue[],
): number {
  if (investigator.code !== "90049") {
    issues.push({
      code: "unsupported-side-deck",
      severity: "unsupported",
      message: "This investigator's side deck has not been implemented.",
    });
    return 0;
  }
  const slots = normalizeSlots(options.sideDeck || [], issues);
  const allies = slots.filter((s) => s.code !== "90053");
  const names = new Set<string>();
  let xp = 0;
  if (
    quantityOf(slots, "90053") !== 1 ||
    allies.reduce((n, s) => n + s.quantity, 0) !== 9
  )
    issues.push({
      code: "side-deck",
      severity: "error",
      message:
        "Jim's spirit deck must contain nine different Ally assets and one Vengeful Shade.",
    });
  for (const s of allies) {
    const card = cards.get(s.code);
    if (
      !card ||
      card.type_code !== "asset" ||
      !traits(card).includes("ally") ||
      (card.xp ?? 99) > 2 ||
      card.bonded_to ||
      isWeakness(card) ||
      isPermanent(card) ||
      s.quantity !== 1 ||
      names.has(card.name) ||
      !cardRestriction(card, investigator, cards)
    )
      issues.push({
        code: "side-deck",
        severity: "error",
        cardCode: s.code,
        message:
          "Spirit-deck allies must be nine different permitted Ally assets of level 0–2.",
      });
    if (card) names.add(card.name);
    if (card) xp += (card.xp || 0) * (isExceptional(card) ? 2 : 1) * s.quantity;
  }
  return xp;
}

function takeSelection(
  selection: DeckSlot[] | undefined,
  remaining: string[],
  cards: ReadonlyMap<string, DeckCard>,
  count: number,
  predicate: (c: DeckCard) => boolean,
  label: string,
  issues: DeckIssue[],
): string[] {
  const chosen = expand(normalizeSlots(selection || [], issues));
  if (chosen.length !== count)
    issues.push({
      code: "setup-choice",
      severity: "error",
      message: `Choose exactly ${count} cards for ${label}.`,
    });
  for (const code of chosen) {
    const index = remaining.indexOf(code);
    const card = cards.get(code);
    if (index === -1 || !card || !predicate(card))
      issues.push({
        code: "setup-choice",
        severity: "error",
        cardCode: code,
        message: `${code} is not eligible for ${label}.`,
      });
    else remaining.splice(index, 1);
  }
  return chosen;
}

export function prepareDeck(
  investigatorCode: string,
  slots: readonly DeckSlot[],
  source: DeckCards,
  options: DeckOptions = {},
): PreparedDeck {
  const cards = asMap(source);
  const validation = validateDeck(investigatorCode, slots, cards, options);
  const prepared: PreparedDeck = {
    validation,
    deck: [],
    permanents: [],
    setAside: [],
    startingHand: [],
    startingChoices: [],
    hunchDeck: [],
    marketDeck: [],
    ancestralSkills: [],
    sideDeck: expand(normalizeSlots(options.sideDeck || [], [])),
  };
  if (!validation.valid) return prepared;
  const investigator = cards.get(investigatorCode)!;
  for (const slot of validation.slots) {
    const card = cards.get(slot.code)!;
    const copies = expand([slot]);
    if (isPermanent(card)) prepared.permanents.push(...copies);
    else if (slot.code === "09006" && investigator.code === "09004")
      prepared.setAside.push(...copies);
    else if (slot.code === "05014" && investigator.code === "05004")
      prepared.startingHand.push(...copies);
    else prepared.deck.push(...copies);
    if (keyword(card, "Starting")) prepared.startingChoices.push(card.code);
  }
  // Bonded cards belong to the collection outside the main deck. Reprinted
  // definitions do not create extra copies of the same bonded card.
  const parents = new Set([
    ...validation.slots.map((s) => cards.get(s.code)!.name),
    investigator.name,
  ]);
  const bonded = new Map<string, DeckCard>();
  for (const card of cards.values())
    if (card.bonded_to && parents.has(card.bonded_to)) {
      const key = canonicalCode(card, cards);
      if (!bonded.has(key)) bonded.set(key, card);
    }
  for (const card of bonded.values())
    prepared.setAside.push(
      ...Array(card.bonded_count || card.quantity || 1).fill(card.code),
    );
  if (investigator.code === "05002") {
    prepared.hunchDeck = takeSelection(
      options.hunchDeck,
      prepared.deck,
      cards,
      11,
      (c) => c.type_code === "event" && traits(c).includes("insight"),
      "Joe's hunch deck",
      validation.issues,
    );
    if (!prepared.hunchDeck.includes("05010"))
      validation.issues.push({
        code: "setup-choice",
        severity: "error",
        message: "Joe's hunch deck must include Unsolved Case.",
      });
  }
  if (
    prepared.permanents.some(
      (code) => cards.get(code)?.name === "Underworld Market",
    )
  )
    prepared.marketDeck = takeSelection(
      options.marketDeck,
      prepared.deck,
      cards,
      10,
      (c) => traits(c).includes("illicit"),
      "Underworld Market",
      validation.issues,
    );
  if (
    prepared.permanents.some(
      (code) => cards.get(code)?.name === "Ancestral Knowledge",
    )
  )
    prepared.ancestralSkills = takeSelection(
      options.ancestralSkills,
      prepared.deck,
      cards,
      5,
      (c) => c.type_code === "skill" && !isWeakness(c),
      "Ancestral Knowledge's random skills",
      validation.issues,
    );
  if (options.startingCard) {
    const index = prepared.deck.indexOf(options.startingCard);
    if (!prepared.startingChoices.includes(options.startingCard) || index < 0)
      validation.issues.push({
        code: "setup-choice",
        severity: "error",
        message:
          "The chosen opening-hand card must have the Starting keyword and be included in the deck.",
      });
    else prepared.startingHand.push(...prepared.deck.splice(index, 1));
  }
  validation.valid = validation.issues.length === 0;
  if (!validation.valid) {
    prepared.deck = [];
    prepared.permanents = [];
    prepared.setAside = [];
    prepared.startingHand = [];
  }
  return prepared;
}

/** Validate the exact published list; upgrade supply never enters the deck. */
export const prepareStarterDeck = (
  starter: StarterDeck,
  cards: DeckCards,
  options: DeckOptions = {},
) => prepareDeck(starter.investigatorCode, starter.slots, cards, options);

export interface DeckUpgrade {
  remove: DeckSlot[];
  add: DeckSlot[];
  /** Replacement sheets after marking new boxes; current sheets live in options. */
  customizations?: Record<string, string>;
}
export interface DeckUpgradeResult {
  valid: boolean;
  cost: number;
  remainingXp: number;
  slots: DeckSlot[];
  validation: DeckValidation;
}
/** Normal purchases and upgrades. Cards that alter XP spending are blocked
 * until their separate campaign decisions have a native implementation. */
export function upgradeDeck(
  investigatorCode: string,
  slots: readonly DeckSlot[],
  change: DeckUpgrade,
  source: DeckCards,
  availableXp: number,
  options: DeckOptions = {},
): DeckUpgradeResult {
  const cards = asMap(source);
  const issues: DeckIssue[] = [];
  const current = normalizeSlots(slots, issues);
  const removed = normalizeSlots(change.remove, issues);
  const added = normalizeSlots(change.add, issues);
  const next = new Map(current.map((s) => [s.code, s.quantity]));
  for (const s of removed) {
    if (cards.get(s.code) && isPermanent(cards.get(s.code)!))
      issues.push({
        code: "permanent-remove",
        severity: "error",
        cardCode: s.code,
        message: "Permanent cards cannot be removed from a campaign deck.",
      });
    if ((next.get(s.code) || 0) < s.quantity)
      issues.push({
        code: "upgrade-remove",
        severity: "error",
        cardCode: s.code,
        message: "The removed cards must be in the current deck.",
      });
    else next.set(s.code, next.get(s.code)! - s.quantity);
  }
  for (const s of added) next.set(s.code, (next.get(s.code) || 0) + s.quantity);
  const nextSlots = [...next]
    .filter(([, quantity]) => quantity > 0)
    .map(([code, quantity]) => ({ code, quantity }));
  const nextOptions = {
    ...options,
    customizations: { ...options.customizations, ...change.customizations },
  };
  const oldValidation = validateDeck(investigatorCode, current, cards, {
    ...options,
    availableXp: undefined,
  });
  const validation = validateDeck(investigatorCode, nextSlots, cards, {
    ...nextOptions,
    availableXp: undefined,
  });
  if (!oldValidation.valid)
    issues.push(
      ...oldValidation.issues.map((issue) => ({
        ...issue,
        message: `Current deck: ${issue.message}`,
      })),
    );
  const discountCards = current.filter((s) =>
    upgradeRules.has(cards.get(s.code)?.name || ""),
  );
  for (const s of discountCards)
    issues.push({
      code: "unsupported-upgrade",
      severity: "unsupported",
      cardCode: s.code,
      message: `${cards.get(s.code)!.name} changes campaign upgrades and requires its own recorded resolution.`,
    });
  if (options.retainedCards?.length || investigatorCode === "89001")
    issues.push({
      code: "unsupported-upgrade",
      severity: "unsupported",
      message:
        "This investigator's special upgrade procedure requires its own recorded campaign resolution.",
    });
  const removable = removed.map((s) => ({ ...s }));
  const paidMyriad = new Set<string>();
  let cost = 0;
  const customizationDeltas = new Map<string, number>();
  for (const slot of nextSlots) {
    const card = cards.get(slot.code);
    if (!card?.customization_options || customizationDeltas.has(card.name)) continue;
    const before = parseCustomizationSheet(card, options.customizations?.[card.code], cards);
    const after = parseCustomizationSheet(card, nextOptions.customizations[card.code], cards);
    for (const entry of before.entries) {
      const updated = after.entries.find(e => e.index === entry.index);
      if (!updated || updated.count < entry.count)
        issues.push({ code: "customization-permanent", severity: "error", cardCode: card.code,
          message: `${card.name}'s purchased customization boxes cannot be removed or refunded.` });
      if (entry.active && entry.choices.length && updated && JSON.stringify(updated.choices) !== JSON.stringify(entry.choices))
        issues.push({ code: "customization-choice-change", severity: "unsupported", cardCode: card.code,
          message: `${card.name}'s recorded customization choices need their separate campaign resolution before changing.` });
    }
    const delta = Math.max(0, after.totalXp - before.totalXp);
    customizationDeltas.set(card.name, delta);
    cost += delta;
  }
  for (const s of added) {
    const card = cards.get(s.code);
    if (
      !card ||
      card.xp === undefined ||
      isWeakness(card) ||
      card.restrictions?.toString().startsWith("investigator:")
    ) {
      issues.push({
        code: "upgrade-card",
        severity: "error",
        cardCode: s.code,
        message: "Only purchasable player cards can be added with experience.",
      });
      continue;
    }
    if (card.customization_options) {
      // Spending on this shared sheet satisfies the minimum purchase cost for
      // one, two, or a newly unlocked third copy. Unupgraded purchases cost 1 each.
      if ((customizationDeltas.get(card.name) || 0) === 0) cost += s.quantity;
      continue;
    }
    if (/Purchase (?:only )?at deck creation/i.test(plain(card.text)))
      issues.push({
        code: "purchase-timing",
        severity: "error",
        cardCode: s.code,
        message: `${card.name} can only be purchased when creating the deck.`,
      });
    const priorSameLevelMyriad = current.some(
      (old) =>
        cards.get(old.code)?.name === card.name &&
        cards.get(old.code)?.xp === card.xp &&
        isMyriad(card),
    );
    for (let copy = 0; copy < s.quantity; copy++) {
      if (isMyriad(card) && (paidMyriad.has(card.name) || priorSameLevelMyriad))
        continue;
      let price = Math.max(1, card.xp) * (isExceptional(card) ? 2 : 1);
      const lower = removable
        .filter((old) => {
          const oldCard = cards.get(old.code);
          return (
            old.quantity > 0 &&
            oldCard?.name === card.name &&
            oldCard.xp !== undefined &&
            oldCard.xp * (isExceptional(oldCard) ? 2 : 1) <
              card.xp! * (isExceptional(card) ? 2 : 1)
          );
        })
        .sort(
          (a, b) => (cards.get(b.code)?.xp || 0) - (cards.get(a.code)?.xp || 0),
        )[0];
      if (lower) {
        const oldCard = cards.get(lower.code)!;
        price = Math.max(
          1,
          card.xp * (isExceptional(card) ? 2 : 1) -
            (oldCard.xp || 0) * (isExceptional(oldCard) ? 2 : 1),
        );
        lower.quantity--;
      }
      cost += price;
      if (isMyriad(card)) paidMyriad.add(card.name);
    }
  }
  if (!Number.isSafeInteger(availableXp) || availableXp < cost)
    issues.push({
      code: "xp-budget",
      severity: "error",
      message: `The upgrade costs ${cost} experience; ${availableXp} is available.`,
    });
  validation.issues.push(...issues);
  validation.valid = validation.issues.length === 0;
  return {
    valid: validation.valid,
    cost,
    remainingXp: availableXp - cost,
    slots: nextSlots,
    validation,
  };
}
