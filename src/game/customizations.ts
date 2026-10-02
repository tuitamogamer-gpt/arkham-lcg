import type { Card } from "./types";

export interface CustomizationOption {
  xp: number;
  choice?: "choose_card" | "choose_trait" | "choose_skill" | "remove_slot";
  quantity?: number;
  card?: { type?: string[]; trait?: string[] };
  real_traits?: string;
  real_slot?: string;
  deck_limit?: number;
  cost?: number;
  health?: number;
  sanity?: number;
  tags?: string;
  real_text?: string;
}
export interface CustomizableCard extends Card {
  customization_options?: CustomizationOption[];
  customization_text?: string;
  tags?: string;
  alternate_of?: string;
}
export interface CustomizationIssue {
  code: string;
  message: string;
  cardCode: string;
  severity: "error" | "unsupported";
}
export interface CustomizationEntry {
  index: number;
  count: number;
  choices: string[];
  active: boolean;
}
export interface CustomizationSheet {
  /** All marked boxes count toward level, including unfinished upgrades. */
  level: number;
  /** XP invested in one shared sheet; do not multiply by the number of copies. */
  totalXp: number;
  effectiveCard: CustomizableCard;
  entries: CustomizationEntry[];
  issues: CustomizationIssue[];
  /** The strict, native-compatible value for the ArkhamDB cus_CARD meta key. */
  canonicalSheet: string;
}
export type CustomizationCards = readonly Card[] | ReadonlyMap<string, Card>;

const supportedOptions: Readonly<Record<string, number>> = {
  "09021": 7,
  "09022": 8,
  "09023": 6,
  "09040": 7,
  "09041": 8,
  "09042": 8,
  "09059": 6,
  "09060": 8,
  "09061": 8,
  "09079": 8,
  "09080": 8,
  "09081": 8,
  "09099": 7,
  "09100": 7,
  "09101": 6,
  "09119": 7,
};
export const CUSTOMIZABLE_CARD_CODES = Object.freeze(
  Object.keys(supportedOptions),
);
const skills = new Set(["willpower", "intellect", "combat", "agility"]);
const splitTraits = (traits: string | undefined) =>
  (traits || "")
    .split(".")
    .map((trait) => trait.trim())
    .filter(Boolean);
const normalizeTrait = (trait: string) =>
  trait.replace(/\.$/, "").replace(/\s/g, "").toLocaleLowerCase();
const normalizeName = (name: string) => name.trim().toLocaleLowerCase();
const listCards = (cards: CustomizationCards): readonly Card[] =>
  Array.isArray(cards)
    ? cards
    : [...(cards as ReadonlyMap<string, Card>).values()];
const addTags = (existing: string | undefined, added: string | undefined) => {
  const tags = new Set([...splitTraits(existing), ...splitTraits(added)]);
  return tags.size ? [...tags].join(".") + "." : undefined;
};

/**
 * Parse one cus_CARD value, not the enclosing meta JSON. The native parser is
 * permissive and can drop malformed upgrades, so certification consumes the
 * complete string and validates every recorded choice before passing it on.
 */
export function parseCustomizationSheet(
  card: Card,
  rawSheet: string | undefined,
  cards: CustomizationCards,
): CustomizationSheet {
  const original = card as CustomizableCard;
  const effectiveCard = { ...original };
  const entries: CustomizationEntry[] = [];
  const issues: CustomizationIssue[] = [];
  const issue = (
    code: string,
    message: string,
    severity: CustomizationIssue["severity"] = "error",
  ) =>
    issues.push({
      code,
      message: `${card.name}: ${message}`,
      cardCode: card.code,
      severity,
    });
  const options = original.customization_options;
  let totalXp = 0;
  const result = (): CustomizationSheet => ({
    level: Math.ceil(totalXp / 2),
    totalXp,
    effectiveCard: { ...effectiveCard, xp: Math.ceil(totalXp / 2) },
    entries,
    issues,
    canonicalSheet: entries
      .map(
        ({ index, count, choices }) =>
          `${index}|${count}${choices.length ? `|${choices.join("^")}` : ""}`,
      )
      .join(","),
  });

  if (!options) {
    if (rawSheet !== undefined && rawSheet !== "")
      issue(
        "customization-card",
        "this card does not have a customization sheet.",
      );
    return { ...result(), level: card.xp || 0, effectiveCard: original };
  }
  const canonicalCode =
    original.duplicate_of || original.alternate_of || card.code;
  if (
    supportedOptions[canonicalCode] !== options.length ||
    options.some(
      (option) =>
        !Number.isSafeInteger(option.xp) || option.xp < 0 || option.xp > 10,
    )
  ) {
    issue(
      "unsupported-customization",
      "the imported customization sheet is not supported.",
      "unsupported",
    );
    return result();
  }
  if (rawSheet !== undefined && typeof rawSheet !== "string") {
    issue("customization-format", "the sheet must be a cus_CARD string.");
    return result();
  }
  const byCode = new Map(
    listCards(cards).map((candidate) => [candidate.code, candidate]),
  );
  const knownTraits = new Map<string, string>();
  for (const candidate of byCode.values())
    for (const trait of splitTraits(candidate.traits))
      knownTraits.set(normalizeTrait(trait), trait);
  const seenIndexes = new Set<number>();
  const chosenNames = new Set<string>();
  const chosenTraits = new Set<string>();
  const chosenSkills = new Set<string>();

  if (rawSheet)
    for (const rawEntry of rawSheet.split(",")) {
      const match = /^(\d+)\|(\d+)(?:\|([^|,]+))?$/.exec(rawEntry);
      if (!match) {
        issue(
          "customization-format",
          `invalid sheet entry ${JSON.stringify(rawEntry)}.`,
        );
        continue;
      }
      const index = Number(match[1]);
      const count = Number(match[2]);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= options.length
      ) {
        issue(
          "customization-option",
          `upgrade index ${match[1]} is outside this sheet.`,
        );
        continue;
      }
      if (seenIndexes.has(index)) {
        issue(
          "customization-duplicate",
          `upgrade ${index} is recorded more than once.`,
        );
        continue;
      }
      seenIndexes.add(index);
      const option = options[index];
      if (!Number.isSafeInteger(count) || count < 0 || count > option.xp) {
        issue(
          "customization-count",
          `upgrade ${index} allows 0–${option.xp} marked boxes.`,
        );
        continue;
      }
      totalXp += count;
      const choices = match[3] === undefined ? [] : match[3].split("^");
      const active = count === option.xp;
      const entry: CustomizationEntry = {
        index,
        count,
        choices: [...choices],
        active,
      };
      entries.push(entry);
      if (!active && choices.length) {
        issue(
          "customization-incomplete-choice",
          `complete upgrade ${index} before recording its choices.`,
        );
        continue;
      }
      if (!option.choice) {
        if (choices.length)
          issue(
            "customization-choice",
            `upgrade ${index} does not take a choice.`,
          );
      } else if (active) {
        const quantity = option.quantity || 1;
        if (choices.length !== quantity)
          issue(
            "customization-choice-count",
            `upgrade ${index} requires ${quantity} chosen ${option.choice === "choose_card" ? "card name(s)" : option.choice === "choose_trait" ? "trait(s)" : option.choice === "choose_skill" ? "skill(s)" : "slot"}.`,
          );
        for (let choiceIndex = 0; choiceIndex < choices.length; choiceIndex++) {
          const choice = choices[choiceIndex];
          if (option.choice === "choose_card") {
            const named = byCode.get(choice);
            if (!named || !/^[a-zA-Z0-9]+$/.test(choice)) {
              issue(
                "customization-card-choice",
                `upgrade ${index} requires a known card code.`,
              );
              continue;
            }
            const filter = option.card;
            const traits = splitTraits(named.traits).map(normalizeTrait);
            if (
              (filter?.type && !filter.type.includes(named.type_code)) ||
              (filter?.trait &&
                !filter.trait.some((trait) =>
                  traits.includes(normalizeTrait(trait)),
                ))
            )
              issue(
                "customization-card-choice",
                `${named.name} does not meet upgrade ${index}'s printed card filter.`,
              );
            const name = normalizeName(named.name);
            if (chosenNames.has(name))
              issue(
                "customization-choice-duplicate",
                `${named.name} is already named on this sheet.`,
              );
            chosenNames.add(name);
          } else if (option.choice === "choose_trait") {
            const trait = knownTraits.get(normalizeTrait(choice));
            if (!trait || !/^[\p{L}\p{N} ]+\.?$/u.test(choice)) {
              issue(
                "customization-trait",
                `upgrade ${index} requires a printed trait supported by the card catalogue.`,
              );
              continue;
            }
            entry.choices[choiceIndex] = trait;
            const normalized = normalizeTrait(trait);
            if (chosenTraits.has(normalized))
              issue(
                "customization-choice-duplicate",
                `${trait} is already chosen on this sheet.`,
              );
            chosenTraits.add(normalized);
          } else if (option.choice === "choose_skill") {
            if (!skills.has(choice))
              issue(
                "customization-skill",
                `upgrade ${index} requires willpower, intellect, combat or agility.`,
              );
            if (chosenSkills.has(choice))
              issue(
                "customization-choice-duplicate",
                `${choice} is already chosen on this sheet.`,
              );
            chosenSkills.add(choice);
          } else if (option.choice === "remove_slot") {
            if (choice !== "0" && choice !== "1")
              issue(
                "customization-slot",
                `upgrade ${index} requires 0 (arcane) or 1 (ally).`,
              );
          } else {
            issue(
              "unsupported-customization",
              `upgrade ${index} has an unsupported choice.`,
              "unsupported",
            );
          }
        }
      }
    }
  if (totalXp > 10)
    issue(
      "customization-xp",
      "an upgrade sheet cannot have more than 10 marked boxes.",
    );
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (option.xp === 0 && option.choice && !seenIndexes.has(index))
      issue(
        "customization-required-choice",
        `record the starting choice for upgrade ${index}, even on a level-0 card.`,
      );
  }
  entries.sort((left, right) => left.index - right.index);
  // Invalid sheets never grant traits, slots or a larger copy limit.
  if (issues.length === 0)
    for (const entry of entries.filter((entry) => entry.active)) {
      const option = options[entry.index];
      if (option.real_traits !== undefined)
        effectiveCard.traits = option.real_traits;
      if (option.real_slot !== undefined) effectiveCard.slot = option.real_slot;
      if (option.deck_limit !== undefined)
        effectiveCard.deck_limit = option.deck_limit;
      if (option.cost !== undefined && typeof effectiveCard.cost === "number")
        effectiveCard.cost = Math.max(0, effectiveCard.cost + option.cost);
      if (option.health !== undefined)
        effectiveCard.health = (effectiveCard.health || 0) + option.health;
      if (option.sanity !== undefined)
        effectiveCard.sanity = (effectiveCard.sanity || 0) + option.sanity;
      if (option.tags !== undefined)
        effectiveCard.tags = addTags(effectiveCard.tags, option.tags);
      if (option.real_text !== undefined)
        effectiveCard.text = `${effectiveCard.text || ""}\n${option.real_text}`;
      if (option.choice === "remove_slot") {
        const remove = entry.choices[0] === "0" ? "arcane" : "ally";
        effectiveCard.slot = (effectiveCard.slot || "")
          .split(".")
          .map((slot) => slot.trim())
          .filter((slot) => slot.toLocaleLowerCase() !== remove)
          .join(". ");
      }
    }
  return result();
}
