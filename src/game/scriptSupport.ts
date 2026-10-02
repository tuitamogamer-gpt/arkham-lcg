import { cards, code, STARTER_DECKS } from "./data";
import { SPREADING_FLAMES } from "./scenario";
import type { Card } from "./types";

/** The existing engine implements these five fixed starter lists. */
export const NATIVE_INVESTIGATOR_CODES = Object.freeze(
  Object.keys(STARTER_DECKS),
);

/**
 * Reachable definitions in the verified native setup, not the entire Core JSON.
 * Dr. Henry Armitage is awarded by the Spreading Flames act script.
 */
export const NATIVE_SCRIPT_CODES = Object.freeze([
  ...new Set([
    ...NATIVE_INVESTIGATOR_CODES,
    ...Object.values(STARTER_DECKS).flat(),
    SPREADING_FLAMES.reference,
    ...SPREADING_FLAMES.locations,
    ...SPREADING_FLAMES.agendas,
    ...SPREADING_FLAMES.acts,
    ...SPREADING_FLAMES.encounterDeck,
    SPREADING_FLAMES.boss,
    SPREADING_FLAMES.fire,
    code(115),
  ]),
]);
export const NATIVE_SUPPORT_COUNT = NATIVE_SCRIPT_CODES.length;

// Only printing/provenance/display fields may differ. Unknown fields stay in the
// signature: a future rules field must not silently inherit an existing script.
const PRINTING_FIELDS = new Set([
  "code",
  "pack_code",
  "position",
  "quantity",
  "encounter_position",
  "illustrator",
  "back_illustrator",
  "flavor",
  "back_flavor",
  "imagesrc",
  "backimagesrc",
  "url",
  "duplicate_of",
  "reprint_of",
  "source_card_id",
  "errata_date",
]);
const RULE_TEXT_FIELDS = new Set([
  "text",
  "back_text",
  "traits",
  "back_traits",
]);
const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  return value;
}

function rulesSignature(c: Card): string {
  return JSON.stringify(
    stableValue(
      Object.fromEntries(
        Object.entries(c)
          .filter(([key]) => !PRINTING_FIELDS.has(key))
          .map(([key, value]) => [
            key,
            RULE_TEXT_FIELDS.has(key) && typeof value === "string"
              ? normalizeWhitespace(value)
              : value,
          ]),
      ),
    ),
  );
}

const nativeCodes = new Set(NATIVE_SCRIPT_CODES);
const investigatorCodes = new Set(NATIVE_INVESTIGATOR_CODES);
const nativeDefinitions = cards.filter((c) => nativeCodes.has(c.code));
if (nativeDefinitions.length !== NATIVE_SUPPORT_COUNT)
  throw new Error("The native scripted card pool is incomplete.");

const signatureByNativeCode = new Map(
  nativeDefinitions.map((c) => [c.code, rulesSignature(c)]),
);
const nativeCodeBySignature = new Map<string, string>();
for (const c of nativeDefinitions) {
  const signature = signatureByNativeCode.get(c.code)!;
  if (!nativeCodeBySignature.has(signature))
    nativeCodeBySignature.set(signature, c.code);
}

/**
 * Resolve behavior without changing the physical printing's code or artwork.
 * A declared duplicate is insufficient; every rules-bearing field must match.
 */
export function nativeScriptCode(c: Card): string | null {
  const signature = rulesSignature(c);
  if (nativeCodes.has(c.code))
    return signatureByNativeCode.get(c.code) === signature ? c.code : null;
  return nativeCodeBySignature.get(signature) || null;
}

export interface NativeSupport {
  supported: boolean;
  scriptCode?: string;
  reason?: string;
}
export function nativeSupport(c: Card): NativeSupport {
  const scriptCode = nativeScriptCode(c);
  if (scriptCode) return { supported: true, scriptCode };
  return {
    supported: false,
    reason: nativeCodes.has(c.code)
      ? "This definition differs from its verified native rules script."
      : "This card has no verified native rules script.",
  };
}

export function isNativeInvestigator(c: Card): boolean {
  if (c.type_code !== "investigator") return false;
  const scriptCode = nativeScriptCode(c);
  return scriptCode !== null && investigatorCodes.has(scriptCode);
}
