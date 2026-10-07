/** Original Chronicle adapter for the pinned engine's Question/UI/Answer JSON.
 * It projects decisions for our components; the engine retains rules and choice
 * indices. No decision is submitted while building this model.
 */
export type NativeRecord = Readonly<Record<string, unknown>>;
export type NativeGame = NativeRecord;
export interface CompanionContext {
  card?: (
    code: string,
  ) =>
    | { name: string; back_name?: string; text?: string; back_text?: string }
    | undefined;
  translate?: (
    key: string,
    variables: Readonly<Record<string, unknown>>,
  ) => string | undefined;
  scenarioSettings?: (id: string) => readonly unknown[] | undefined;
  campaignSettings?: (id: string) => readonly unknown[] | undefined;
  sideStories?: readonly NativeRecord[];
}
export interface CompanionChoice {
  answerIndex: number;
  tag: string;
  label: string;
  detail?: string;
  cardCode?: string;
  entityId?: string;
  skill?: string;
  token?: string;
  tokens?: string[];
  group?: number;
  disabled: boolean;
  source?: unknown;
  cost?: unknown;
  flavor?: CompanionFlavor;
  raw: unknown;
}
export interface CompanionFlavorEntry {
  tag: string;
  text?: string;
  cardCode?: string;
  token?: string;
  level?: number;
  modifiers?: string[];
  children?: CompanionFlavorEntry[];
  raw: unknown;
}
export interface CompanionFlavor {
  title?: string;
  entries: CompanionFlavorEntry[];
}
export interface CompanionAmount {
  id: string;
  label: string;
  min: number;
  max: number;
  investigatorId?: string;
  raw: unknown;
}
export type CompanionQuestionKind =
  | "choices"
  | "amounts"
  | "exchange"
  | "deck"
  | "upgrade"
  | "settings"
  | "specific"
  | "destiny"
  | "continue"
  | "unsupported";
export interface CompanionQuestion {
  playerId: string;
  questionVersion: number;
  tag: string;
  kind: CompanionQuestionKind;
  title: string;
  labels: string[];
  cardCode?: string;
  source?: unknown;
  tooltip?: string;
  costs: unknown[];
  choices: CompanionChoice[];
  flavor?: CompanionFlavor;
  readCards: string[];
  amount?: number;
  amountChoices: CompanionAmount[];
  amountTarget?: unknown;
  usedInvestigators: string[];
  pointsRemaining?: number;
  chosenSupplies: string[];
  resupply?: boolean;
  drawings: unknown[];
  specific?: { scope: "scenario" | "campaign"; key: string; payload: unknown };
  settings: unknown;
  continuation: unknown;
  /** Native roster and scenario restrictions for this continuation only. */
  continuationLead?: {
    eligibleIds: string[];
    requiredId?: string;
    existingId?: string;
  };
  exchange?: {
    source: unknown;
    from: string;
    to: string;
    fromAmount: number;
    toAmount: number;
    token: unknown;
  };
  canOrder: boolean;
  /** Engine messages run each selected card onto the top, hence bottom first. */
  orderDirection?: "bottom-first";
  isPlayerWindow: boolean;
  isWindow: boolean;
  raw: unknown;
  question: NativeRecord;
}
export type CompanionAnswer = Record<string, unknown>;
export interface CompanionSnapshot {
  game: NativeGame;
  playerId: string;
  investigatorIds: string[];
  gameId: string;
  step: number;
}
export type CompanionEntityKind =
  | "investigators"
  | "assets"
  | "enemies"
  | "locations"
  | "acts"
  | "agendas"
  | "stories"
  | "events"
  | "treacheries"
  | "skills"
  | "effects"
  | "cards";
const object = (value: unknown): NativeRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as NativeRecord)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const string = (value: unknown): string =>
  typeof value === "string" ? value : "";
const number = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const tag = (value: unknown): string =>
  typeof value === "string" ? value : string(object(value).tag);
const words = (value: string): string =>
  value
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\bToken\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
const prettyName = (value: unknown): string =>
  typeof value === "string"
    ? value
    : [string(object(value).title), string(object(value).subtitle)]
        .filter(Boolean)
        .join(" — ");
function unbox(value: unknown): NativeRecord {
  let current = object(value);
  for (
    let depth = 0;
    depth < 5 &&
    current.contents &&
    !Array.isArray(current.contents) &&
    typeof current.contents === "object";
    depth++
  )
    current = object(current.contents);
  return current;
}
/** Accept the native fetch wrapper {game}, or its already-unwrapped game. */
export function companionGame(value: unknown): NativeGame {
  const wrapper = object(value);
  const game = object(wrapper.game ?? value);
  if (!Object.keys(game).length)
    throw new Error("The companion returned an invalid game.");
  return game;
}
export function companionSnapshot(value: unknown): CompanionSnapshot {
  const wrapper = object(value),
    game = companionGame(value);
  return {
    game,
    playerId: string(wrapper.playerId),
    investigatorIds: array(wrapper.investigatorIds).map(string),
    gameId: string(wrapper.id ?? game.id),
    step: number(wrapper.step ?? game.scenarioSteps),
  };
}
export function decodeNativeQuestion(
  question: unknown,
  context: CompanionContext & {
    game?: NativeGame;
    playerId: string;
    questionVersion?: number;
  },
): CompanionQuestion {
  const game = context.game ?? {};
  const decoded = companionQuestion(
    {
      ...game,
      scenarioSteps: context.questionVersion ?? game.scenarioSteps,
      question: { [context.playerId]: question },
    },
    context.playerId,
    context,
  );
  if (!decoded)
    throw new Error("The companion returned no question for this player.");
  return decoded;
}
export function companionEntities(
  game: NativeGame,
  kind: CompanionEntityKind,
): NativeRecord[] {
  return Object.values(object(game[kind] ?? object(game.entities)[kind])).map(
    unbox,
  );
}
function entity(game: NativeGame, id: string): NativeRecord | undefined {
  for (const kind of [
    "investigators",
    "assets",
    "enemies",
    "locations",
    "acts",
    "agendas",
    "stories",
    "events",
    "treacheries",
    "skills",
    "effects",
    "cards",
  ] as const) {
    const found = object(game[kind] ?? object(game.entities)[kind])[id];
    if (found) return unbox(found);
  }
  const visibleCards = [
    game.focusedCards,
    ...Object.values(object(game.foundCards)),
    object(game.scenario).setAsideCards,
  ];
  for (const list of visibleCards)
    for (const card of array(list)) {
      const contents = unbox(card);
      if (contents.id === id || contents.cardId === id) return contents;
    }
  return undefined;
}
export function companionCatalogCode(code: string): string {
  return code
    .replace(/^c(?=:|\d)/, "")
    .replace(/^:barkham:(\d{3})$/, "barkham-$1");
}
/** Native translations carry typed i: integer and s: quoted string parameters. */
export function companionText(
  value: unknown,
  context: CompanionContext = {},
  variables: NativeRecord = {},
): string {
  const text = string(value);
  const resolve = (input: string): string => {
    const key = /^\$([A-Za-z0-9_.]+)/.exec(input)?.[1];
    if (!key) return input;
    const vars: Record<string, unknown> = { ...variables };
    const parameters = input.slice(key.length + 1);
    const pattern =
      /([A-Za-z0-9_]+)=(?:(i|s):)?("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/g;
    for (const match of parameters.matchAll(pattern)) {
      const raw = match[3];
      let parsed: unknown = raw;
      if (raw.startsWith('"')) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw.slice(1, -1);
        }
      } else if (raw.startsWith("'"))
        parsed = raw.slice(1, -1).replace(/\\(['\\])/g, "$1");
      if (match[2] === "i" || (!match[2] && /^-?\d+$/.test(raw)))
        parsed = Number(raw);
      vars[match[1]] = parsed;
    }
    for (const pair of [
      ["__name", "name"],
      ["__iname", "iname"],
    ]) {
      if (typeof vars[pair[0]] === "string" && vars[pair[1]])
        vars[pair[1]] =
          context.card?.(companionCatalogCode(vars[pair[0]] as string))?.name ??
          vars[pair[1]];
    }
    return context.translate?.(key, vars) ?? defaultLabels[key] ?? `[${key}]`;
  };
  if (
    /^\s*\$[A-Za-z0-9_.]+(?:\s+[A-Za-z0-9_]+=(?:(?:i|s):)?(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+))*\s*$/.test(
      text,
    )
  )
    return resolve(text.trim());
  return text.replace(/\$[A-Za-z0-9_.]+/g, resolve);
}
/** Interpolate the locale tree returned by the server without executing markup. */
export function companionTranslator(
  locales: NativeRecord,
): NonNullable<CompanionContext["translate"]> {
  const get = (key: string): unknown =>
    locales[key] ??
    key.split(".").reduce<unknown>((v, k) => object(v)[k], locales);
  const translate = (
    key: string,
    variables: NativeRecord,
    seen: Set<string>,
  ): string | undefined => {
    if (seen.has(key) || seen.size > 20) return undefined;
    const value = get(key);
    if (typeof value !== "string") return undefined;
    const next = new Set([...seen, key]);
    // Protect Vue's quoted literals before parameter replacement. This includes
    // printed brace tokens such as {'{'}curse{'}'}, without executing markup.
    const literals: string[] = [];
    let result = value.replace(
      /\{'((?:[^'\\]|\\.)*)'\}/g,
      (_all, inner: string) => {
        const i = literals.push(inner.replace(/\\(['\\])/g, "$1")) - 1;
        return `\u0001${i}\u0002`;
      },
    );
    const plural = variables.count ?? variables.n;
    if (typeof plural === "number" && result.includes("|")) {
      const variants = result.split("|").map((v) => v.trim()),
        n = Math.abs(plural);
      result =
        variants[
          variants.length === 2
            ? n === 1
              ? 0
              : 1
            : n === 0
              ? 0
              : n === 1
                ? 1
                : 2
        ] ?? variants.at(-1)!;
    }
    result = result.replace(
      /@(?:\.(lower|upper|capitalize))?:(?:\{([^{}]+)\}|([A-Za-z0-9_.]+))/g,
      (
        all,
        modifier: string | undefined,
        braced: string | undefined,
        plain: string | undefined,
      ) => {
        const linked = translate(braced ?? plain ?? "", variables, next);
        if (linked === undefined) return all;
        return modifier === "lower"
          ? linked.toLowerCase()
          : modifier === "upper"
            ? linked.toUpperCase()
            : modifier === "capitalize"
              ? linked.charAt(0).toUpperCase() + linked.slice(1)
              : linked;
      },
    );
    result = result.replace(/\{([^{}]+)\}/g, (all, name: string) =>
      variables[name] === undefined ? all : String(variables[name]),
    );
    return result.replace(
      /\u0001(\d+)\u0002/g,
      (_all, n: string) => literals[Number(n)],
    );
  };
  return (key, variables) => translate(key, variables, new Set());
}
const defaultLabels: Record<string, string> = {
  "label.done": "Done",
  "label.continue": "Continue",
  "label.proceed": "Proceed",
  "label.skip": "Skip",
  "label.no": "No",
  "label.yes": "Yes",
  "label.doneWithMulligan": "Done with mulligan",
  "label.startSkillTest": "Start skill test",
  "label.applyResults": "Apply test results",
  "label.endTurn": "End turn",
  "label.choosePlayerToTakeTurn": "Choose an investigator to take a turn",
  "label.skipTriggers": "Decline optional abilities",
};
function cardLabel(
  code: string,
  context: CompanionContext,
  reverse = false,
): string {
  const card =
    context.card?.(companionCatalogCode(code)) ?? context.card?.(code);
  return (
    (reverse ? card?.back_name : card?.name) ||
    card?.name ||
    (code ? `Card ${companionCatalogCode(code)}` : "Card")
  );
}
function identifyEntity(
  value: NativeRecord | undefined,
  id: string,
  context: CompanionContext,
): { label: string; cardCode?: string; entityId: string } {
  if (value?.facedown === true || value?.hidden === true)
    return { label: "Facedown card", entityId: id };
  const code = string(value?.cardCode ?? value?.code);
  return {
    label:
      prettyName(value?.name) ||
      (code
        ? cardLabel(code, context, value?.isFlipped === true)
        : words(id) || "Card"),
    cardCode: code || undefined,
    entityId: id,
  };
}
const sourceKinds: Record<string, CompanionEntityKind> = {
  Investigator: "investigators",
  Asset: "assets",
  Enemy: "enemies",
  Location: "locations",
  Act: "acts",
  Agenda: "agendas",
  Story: "stories",
  Event: "events",
  Treachery: "treacheries",
  Skill: "skills",
  Effect: "effects",
  CardId: "cards",
};
function describeReference(
  reference: unknown,
  game: NativeGame,
  context: CompanionContext,
  depth = 0,
): { label: string; cardCode?: string; entityId?: string } {
  if (depth > 12) return { label: "Card effect" };
  const ref = object(reference),
    type = tag(reference),
    contents = ref.contents;
  if (type === "ProxySource")
    return describeReference(ref.source, game, context, depth + 1);
  if (type === "AbilitySource")
    return describeReference(array(contents)[0], game, context, depth + 1);
  if (type === "UseAbilitySource" || type === "IndexedSource")
    return describeReference(array(contents)[1], game, context, depth + 1);
  if (type === "PaymentSource")
    return describeReference(contents, game, context, depth + 1);
  if (type === "BothSource")
    return {
      label: array(contents)
        .map((v) => describeReference(v, game, context, depth + 1).label)
        .join(" / "),
    };
  if (type === "CardCodeTarget" || type === "CardCodeSource")
    return {
      label: cardLabel(string(contents), context),
      cardCode: string(contents),
    };
  if (type === "CardTarget" || type === "CardSource") {
    const card = unbox(contents);
    return identifyEntity(card, string(card.id), context);
  }
  if (type === "ChaosTokenTarget" || type === "ChaosTokenSource")
    return { label: tokenLabel(object(contents).face ?? contents) };
  if (type === "TarotSource" || type === "TarotTarget")
    return {
      label: words(string(object(contents).arcana) || string(contents)),
    };
  const prefix = type.replace(/(Source|Target)$/, "");
  if (sourceKinds[prefix])
    return identifyEntity(
      entity(game, string(contents)),
      string(contents),
      context,
    );
  if (type === "InvestigatorDeckTarget")
    return {
      label: `${identifyEntity(entity(game, string(contents)), string(contents), context).label}'s deck`,
      entityId: string(contents),
    };
  if (type === "ScenarioSource" || type === "ScenarioTarget")
    return { label: prettyName(object(game.scenario).name) || "Scenario" };
  if (type === "CampaignSource" || type === "CampaignTarget")
    return { label: prettyName(object(game.campaign).name) || "Campaign" };
  return { label: words(type || string(reference)) || "Card effect" };
}
function tokenLabel(value: unknown): string {
  const face = tag(value);
  return (
    (
      {
        PlusOne: "+1",
        Zero: "0",
        MinusOne: "−1",
        MinusTwo: "−2",
        MinusThree: "−3",
        MinusFour: "−4",
        MinusFive: "−5",
        MinusSix: "−6",
        MinusSeven: "−7",
        MinusEight: "−8",
        AutoFail: "Auto fail",
        ElderSign: "Elder sign",
        ElderThing: "Elder thing",
        Cultist: "Cultist",
        Tablet: "Tablet",
        Skull: "Skull",
        Bless: "Bless",
        Curse: "Curse",
        Frost: "Frost",
      } as Record<string, string>
    )[face] ?? words(face)
  );
}
export function describeCompanionCost(
  value: unknown,
  game: NativeGame = {},
  context: CompanionContext = {},
  depth = 0,
): string {
  if (depth > 12) return "Cost";
  const cost = object(value),
    type = tag(value),
    parts = array(cost.contents),
    inner = (v: unknown) => describeCompanionCost(v, game, context, depth + 1);
  if (type === "Free") return "Free";
  if (type === "Costs" || type === "OrCost")
    return parts
      .map(inner)
      .filter(Boolean)
      .join(type === "Costs" ? ", " : " or ");
  if (
    [
      "OptionalCost",
      "XCost",
      "CostToEnterUnrevealed",
      "NonBlankedCost",
    ].includes(type)
  )
    return `${type === "OptionalCost" ? "Optional: " : type === "XCost" ? "X × " : ""}${inner(cost.contents)}`;
  const units: Record<string, string> = {
    ActionCost: "action",
    UnlessFastActionCost: "action unless fast",
    ResourceCost: "resource",
    ScenarioResourceCost: "scenario resource",
    DiscardTopOfDeckCost: "card from top of deck",
    DrawEncounterCardsCost: "encounter card",
    AddFrostTokenCost: "frost token",
  };
  if (units[type])
    return `${number(cost.contents)} ${units[type]}${cost.contents === 1 ? "" : "s"}`;
  if (
    type === "ClueCost" ||
    type === "PlaceClueOnLocationCost" ||
    type === "GroupClueCost" ||
    type === "SameLocationGroupClueCost" ||
    type === "GroupResourceCost"
  ) {
    const v = object(parts[0] ?? cost.contents),
      n = number(v.contents),
      count =
        v.tag === "PerPlayer"
          ? `${n} per investigator`
          : v.tag === "Static" || v.tag === "Fixed"
            ? String(n)
            : "X";
    return `${type.startsWith("Group") || type.startsWith("SameLocation") ? "Group: " : ""}${count} ${type === "GroupResourceCost" ? "resources" : "clues"}${type === "PlaceClueOnLocationCost" ? " placed on this location" : ""}`;
  }
  if (["ExhaustCost", "RemoveCost", "ExileCost", "RevealCost"].includes(type))
    return `${words(type.replace("Cost", ""))} ${describeReference(cost.contents, game, context).label}`;
  if (type === "UseCost" || type === "EventUseCost")
    return `Spend ${number(parts[2])} ${words(string(parts[1]))} uses`;
  if (/^(Direct)?(Damage|Horror)Cost$/.test(type))
    return `Take ${number(parts.at(-1))} ${words(type.replace("Cost", "")).toLowerCase()}`;
  if (type === "DoomCost") return `Place ${number(parts.at(-1))} doom`;
  if (type === "HandDiscardCost" || type === "DiscardFromCost")
    return `Discard ${number(parts[0])} card${parts[0] === 1 ? "" : "s"}`;
  if (type.startsWith("AdditionalAction")) return "Additional actions";
  // Keep every uncommon printed cost visible, including its structured data.
  return `${words(type.replace(/Cost$/, "")) || "Cost"}${cost.contents === undefined ? "" : ` (${JSON.stringify(cost.contents)})`}`;
}
export function companionFlavor(
  value: unknown,
  context: CompanionContext = {},
): CompanionFlavor {
  const flavor = object(value);
  const convert = (value: unknown, depth = 0): CompanionFlavorEntry => {
    const entry = object(value),
      kind = tag(value);
    if (depth > 20)
      return {
        tag: "InvalidEntry",
        text: "Nested narrative is too deep.",
        raw: value,
      };
    const next = (v: unknown) => convert(v, depth + 1);
    switch (kind) {
      case "BasicEntry":
      case "InvalidEntry":
      case "ValidEntry":
        return {
          tag: kind,
          text: companionText(entry.text, context),
          raw: value,
        };
      case "I18nEntry":
      case "HeaderEntry":
        return {
          tag: kind,
          text: companionText(
            `$${string(entry.key)}`,
            context,
            object(entry.variables),
          ),
          level: number(entry.level, 1),
          raw: value,
        };
      case "ModifyEntry":
        return {
          tag: kind,
          modifiers: array(entry.modifiers).map(string),
          children: [next(entry.entry)],
          raw: value,
        };
      case "CompositeEntry":
      case "ColumnEntry":
        return {
          tag: kind,
          children: array(entry.entries).map(next),
          raw: value,
        };
      case "ListEntry":
        return {
          tag: kind,
          children: array(entry.list).map((v) => ({
            tag: "ListItem",
            children: [
              next(object(v).entry),
              ...array(object(v).nested).map((n) =>
                next({ tag: "ListEntry", list: [n] }),
              ),
            ],
            raw: v,
          })),
          raw: value,
        };
      case "CardEntry":
        return {
          tag: kind,
          cardCode: string(entry.cardCode),
          text: cardLabel(string(entry.cardCode), context),
          modifiers: array(entry.imageModifiers).map(string),
          raw: value,
        };
      case "ChaosTokenEntry":
        return {
          tag: kind,
          token: tag(entry.chaosTokenFace),
          text: tokenLabel(entry.chaosTokenFace),
          raw: value,
        };
      case "ChaosTokenMorphEntry":
        return {
          tag: kind,
          text: `${tokenLabel(entry.morphFrom)} → ${tokenLabel(entry.morphTo)}`,
          raw: value,
        };
      case "TarotEntry":
        return {
          tag: kind,
          text:
            context.translate?.(`tarot.${tag(entry.tarot)}`, {}) ??
            words(tag(entry.tarot)),
          raw: value,
        };
      case "EntrySplit":
        return { tag: kind, raw: value };
      default:
        return {
          tag: kind || "UnknownEntry",
          text: string(entry.text) || "Unrecognized narrative entry",
          raw: value,
        };
    }
  };
  return {
    title: companionText(flavor.title, context) || undefined,
    entries: array(flavor.body).map((v) => convert(v)),
  };
}
function describeActions(value: unknown, depth = 0): string {
  if (depth > 12) return "";
  if (Array.isArray(value))
    return value
      .map((v) => describeActions(v, depth + 1))
      .filter(Boolean)
      .join(" + ");
  const action = object(value),
    type = tag(value);
  if (["SingleAction", "CardAction"].includes(type))
    return words(tag(action.contents));
  if (
    ["AndActions", "OrActions", "AndCardActions", "OrCardActions"].includes(
      type,
    )
  )
    return array(action.contents)
      .map((v) => describeActions(v, depth + 1))
      .filter(Boolean)
      .join(type.startsWith("Or") ? " or " : " + ");
  return words(type);
}
function referenceKind(value: unknown, depth = 0): string {
  if (depth > 12) return "";
  const ref = object(value),
    kind = tag(value);
  if (kind === "ProxySource") return referenceKind(ref.source, depth + 1);
  if (kind === "AbilitySource")
    return referenceKind(array(ref.contents)[0], depth + 1);
  if (kind === "UseAbilitySource" || kind === "IndexedSource")
    return referenceKind(array(ref.contents)[1], depth + 1);
  return kind;
}
function basicAbilityAction(ability: NativeRecord): string {
  if (ability.basic !== true) return "";
  const source = referenceKind(ability.source);
  if (source === "LocationSource")
    return ability.index === 103
      ? "Investigate"
      : ability.index === 104
        ? "Move"
        : "";
  if (source === "EnemySource")
    return (
      ({ 100: "Fight", 101: "Evade", 102: "Engage" } as Record<number, string>)[
        number(ability.index)
      ] ?? ""
    );
  return "";
}
function componentAction(
  messages: unknown,
  investigatorId: string,
): { label: string; action?: string } | undefined {
  const unwrap = (value: unknown, depth = 0): NativeRecord => {
    const message = object(value);
    return depth < 12 && ["Do", "Will"].includes(tag(value))
      ? unwrap(message.contents, depth + 1)
      : message;
  };
  for (const value of array(messages)) {
    const message = unwrap(value),
      contents = array(message.contents);
    if (string(contents[0]) !== investigatorId) continue;
    if (message.tag === "TakeResources" || message.tag === "SpendResources") {
      const amount = contents[1];
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0)
        continue;
      return {
        label: `${message.tag === "TakeResources" ? "Take" : "Spend"} ${amount} resource${amount === 1 ? "" : "s"}`,
        action:
          message.tag === "TakeResources" && contents[3] === true
            ? "Resource action"
            : undefined,
      };
    }
    if (message.tag === "DrawCards") {
      const draw = object(contents[1]),
        amount = draw.cardDrawAmount;
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0)
        continue;
      return {
        label: `Draw ${amount} card${amount === 1 ? "" : "s"}`,
        action: draw.cardDrawAction === true ? "Draw action" : undefined,
      };
    }
  }
  return undefined;
}
function chaosStepSummary(
  value: unknown,
  depth = 0,
): { label: string; tokens: string[] } {
  if (depth > 12) return { label: "Token group", tokens: [] };
  const step = object(value),
    type = tag(value);
  if (type === "Resolved") {
    const tokens = array(step.tokens).map((v) => tag(object(v).face));
    return {
      label: tokens.map(tokenLabel).join(" + ") || "Empty token group",
      tokens,
    };
  }
  if (["Decided", "Undecided", "Deciding"].includes(type))
    return chaosStepSummary(step.step, depth + 1);
  if (type === "Draw" || type === "DrawUntil")
    return {
      label: type === "Draw" ? "Draw a token" : "Draw until the required token",
      tokens: [],
    };
  const children = array(step.steps).map((v) => chaosStepSummary(v, depth + 1));
  const action =
    step.tokenStrategy === "CancelChoice"
      ? "cancel"
      : step.tokenStrategy === "IgnoreChoice"
        ? "ignore"
        : "resolve";
  return {
    label: `Choose ${number(step.amount, 1)} group${step.amount === 1 ? "" : "s"} to ${action}: ${children.map((v) => v.label).join(" / ")}`,
    tokens: children.flatMap((v) => v.tokens),
  };
}
export function describeCompanionChoice(
  value: unknown,
  game: NativeGame = {},
  context: CompanionContext = {},
): Omit<CompanionChoice, "answerIndex"> {
  const choice = object(value),
    kind = tag(value);
  const base = {
    tag: kind,
    label: "",
    disabled: kind === "InvalidLabel" || kind === "Info",
    raw: value,
  };
  switch (kind) {
    case "Label":
    case "Done":
    case "InvalidLabel":
    case "TooltipLabel":
    case "ScenarioLabel":
      return {
        ...base,
        label: companionText(choice.label, context),
        detail: companionText(choice.tooltip, context) || undefined,
      };
    case "CostLabel":
      return {
        ...base,
        label: describeCompanionCost(choice.cost, game, context),
        cost: choice.cost,
      };
    case "CardLabel":
      return {
        ...base,
        label: cardLabel(string(choice.cardCode), context),
        cardCode: string(choice.cardCode),
      };
    case "PortraitLabel":
      return {
        ...base,
        ...identifyEntity(
          entity(game, string(choice.investigatorId)),
          string(choice.investigatorId),
          context,
        ),
      };
    case "TargetLabel":
      return {
        ...base,
        ...describeReference(choice.target, game, context),
        source: choice.target,
      };
    case "ChaosTokenLabel":
      return {
        ...base,
        label: tokenLabel(choice.face),
        token: tag(choice.face),
      };
    case "KeyLabel":
      return { ...base, label: `${words(tag(choice.key))} key` };
    case "SkillLabel":
    case "SkillLabelWithLabel":
      return {
        ...base,
        label:
          companionText(choice.label, context) || words(tag(choice.skillType)),
        skill: tag(choice.skillType),
      };
    case "FightLabel":
    case "FightLabelWithSkill":
    case "EvadeLabel":
    case "EvadeLabelWithSkill":
    case "EngageLabel": {
      const enemy = identifyEntity(
        entity(game, string(choice.enemyId)),
        string(choice.enemyId),
        context,
      );
      return {
        ...base,
        ...enemy,
        label: `${kind.startsWith("Fight") ? "Fight" : kind.startsWith("Evade") ? "Evade" : "Engage"} ${enemy.label}`,
        skill: tag(choice.skillType) || undefined,
      };
    }
    case "GridLabel":
      return { ...base, label: string(choice.gridLabel) };
    case "ConnectionLabel":
      return { ...base, label: `Connection: ${words(tag(choice.connection))}` };
    case "TarotLabel":
      return {
        ...base,
        label: words(
          string(object(choice.tarotCard).arcana) || tag(choice.tarotCard),
        ),
      };
    case "AbilityLabel": {
      const ability = object(choice.ability);
      let type = object(ability.type);
      for (let n = 0; n < 10 && type.abilityType; n++)
        type = object(type.abilityType);
      const source = describeReference(ability.source, game, context),
        basicAction = basicAbilityAction(ability),
        actions = describeActions(type.actions ?? type.action) || basicAction;
      const timing =
        type.tag === "ReactionAbility" ||
        type.tag === "ConstantReaction" ||
        type.tag === "CustomizationReaction"
          ? "Reaction"
          : type.tag === "FastAbility'"
            ? "Fast ability"
            : type.tag === "ForcedAbility" ||
                type.tag === "ForcedAbilityWithCost"
              ? "Forced ability"
              : type.tag === "SilentForcedAbility"
                ? "Resolve effect"
                : type.tag === "Haunted"
                  ? "Haunted"
                  : type.tag === "Cosmos"
                    ? "Cosmos"
                    : "";
      const action =
        [timing, actions, companionText(type.label, context)]
          .filter(Boolean)
          .join(" · ") || "Ability";
      const tooltip = companionText(ability.tooltip, context);
      const costs = [
          ...(type.cost ? [type.cost] : []),
          ...array(ability.additionalCosts),
        ],
        cost =
          costs.length > 1
            ? { tag: "Costs", contents: costs.filter((v) => tag(v) !== "Free") }
            : costs[0];
      return {
        ...base,
        ...source,
        label:
          basicAction && actions === basicAction && !timing
            ? `${basicAction}${basicAction === "Move" ? " to" : ""} ${source.label}`
            : `${source.label}: ${action}`,
        detail:
          tooltip ||
          (basicAction
            ? source.label
            : `${cost ? describeCompanionCost(cost, game, context) : ""}${typeof ability.index === "number" ? ` · Ability ${ability.index}` : ""}`),
        source: ability.source,
        cost,
      };
    }
    case "ComponentLabel":
    case "AuxiliaryComponentLabel": {
      const component = object(choice.component),
        id = string(component.investigatorId ?? component.assetId);
      const owner = identifyEntity(entity(game, id), id, context);
      const action =
        component.tag !== "AssetComponent"
          ? componentAction(choice.messages, id)
          : undefined;
      return {
        ...base,
        ...owner,
        label:
          action?.label ??
          `${owner.label}: ${component.tag === "InvestigatorDeckComponent" ? "deck" : words(tag(component.tokenType)).toLowerCase()}`,
        detail: action
          ? [owner.label, action.action].filter(Boolean).join(" · ")
          : undefined,
        token: tag(component.tokenType),
      };
    }
    case "EndTurnButton":
      return {
        ...base,
        label: "End turn",
        entityId: string(choice.investigatorId),
      };
    case "StartSkillTestButton":
      return {
        ...base,
        label: "Start skill test",
        entityId: string(choice.investigatorId),
      };
    case "SkillTestApplyResultsButton":
      return { ...base, label: "Apply test results" };
    case "SkipTriggersButton":
      return {
        ...base,
        label: "Decline optional abilities",
        entityId: string(choice.investigatorId),
      };
    case "EffectActionButton":
      return {
        ...base,
        label: companionText(choice.tooltip, context) || "Resolve effect",
        entityId: string(choice.effectId),
      };
    case "ChaosTokenGroupChoice": {
      const summary = chaosStepSummary(choice.step);
      return { ...base, ...summary, source: choice.source };
    }
    case "CardPile":
      return {
        ...base,
        label:
          array(choice.pile)
            .map(
              (v) =>
                identifyEntity(
                  entity(game, string(object(v).cardId)),
                  string(object(v).cardId),
                  context,
                ).label,
            )
            .join(", ") || "Card pile",
      };
    case "Info":
      return {
        ...base,
        label: "Information",
        flavor: companionFlavor(choice.flavor, context),
      };
    default:
      return {
        ...base,
        label: words(kind) || "Unrecognized choice",
        disabled: true,
      };
  }
}

const choiceQuestions = new Set([
  "ChooseOne",
  "PlayerWindowChooseOne",
  "WindowChooseOne",
  "ChooseN",
  "ChooseSome",
  "ChooseSome1",
  "ChooseUpToN",
  "ChooseOneAtATime",
  "ChooseOneAtATimeWithAuto",
  "ChooseOneFromEach",
  "Read",
  "ChooseOneWizard",
  "PickSupplies",
  "DropDown",
]);
export function getCompanionQuestions(
  game: NativeGame,
  context: CompanionContext = {},
): CompanionQuestion[] {
  return Object.keys(object(game.question))
    .map((playerId) => companionQuestion(game, playerId, context))
    .filter((q): q is CompanionQuestion => q !== undefined);
}
export function companionQuestion(
  game: NativeGame,
  playerId: string,
  context: CompanionContext = {},
): CompanionQuestion | undefined {
  const raw = object(game.question)[playerId];
  if (!raw) return undefined;
  let question = object(raw);
  const labels: string[] = [],
    costs: unknown[] = [];
  let source: unknown,
    tooltip: string | undefined,
    cardCode: string | undefined;
  for (
    let depth = 0;
    ["QuestionLabel", "PayCostQuestion", "QuestionWithSource"].includes(
      tag(question),
    );
    depth++
  ) {
    if (depth > 30 || !question.question)
      throw new Error("The companion returned an invalid nested question.");
    if (question.tag === "QuestionLabel") {
      labels.push(companionText(question.label, context));
      cardCode ??= string(question.card) || undefined;
    } else if (question.tag === "PayCostQuestion") costs.push(question.cost);
    else {
      source = question.source;
      tooltip = companionText(question.tooltip, context) || undefined;
    }
    question = object(question.question);
  }
  const type = tag(question);
  let kind: CompanionQuestionKind = choiceQuestions.has(type)
    ? "choices"
    : "unsupported";
  if (type === "ChooseAmounts" || type === "ChoosePaymentAmounts")
    kind = "amounts";
  if (["ChooseDeck", "ChooseJoinDeck"].includes(type)) kind = "deck";
  if (type === "ChooseUpgradeDeck") kind = "upgrade";
  if (["PickScenarioSettings", "PickCampaignSettings"].includes(type))
    kind = "settings";
  if (["PickScenarioSpecific", "PickCampaignSpecific"].includes(type))
    kind = "specific";
  if (type === "PickDestiny") kind = "destiny";
  if (type === "ChooseExchangeAmounts") kind = "exchange";
  if (type === "ContinueCampaign") kind = "continue";
  const choices: CompanionChoice[] = [];
  const addChoice = (v: unknown, index: number, group?: number) =>
    choices.push({
      ...describeCompanionChoice(v, game, context),
      answerIndex: index,
      group,
    });
  let nativeChoices = array(question.choices),
    amount = typeof question.amount === "number" ? question.amount : undefined;
  let flavor: CompanionFlavor | undefined;
  if (type === "ChooseOneFromEach") {
    // Record selectors have `groups`; older saved questions used `choices`.
    let index = 0;
    array(question.groups ?? question.choices).forEach((group, g) =>
      array(group).forEach((v) => addChoice(v, index++, g)),
    );
  } else if (type === "DropDown") {
    array(question.options).forEach((v, i) =>
      addChoice({ tag: "Label", label: array(v)[0] ?? v }, i),
    );
  } else if (type === "Read") {
    flavor = companionFlavor(question.flavorText, context);
    const read = question.readChoices;
    if (Array.isArray(read)) nativeChoices = read;
    else {
      const contents = object(read).contents;
      if (["BasicReadChoicesN", "BasicReadChoicesUpToN"].includes(tag(read))) {
        amount = number(array(contents)[0]);
        nativeChoices = array(array(contents)[1]);
      } else nativeChoices = array(contents);
    }
    nativeChoices.forEach((v, i) => addChoice(v, i));
  } else if (type === "ChooseOneWizard") {
    flavor = companionFlavor(question.flavorText, context);
    array(question.wizardChoices).forEach((v, i) => {
      const wizard = object(v);
      choices.push({
        ...describeCompanionChoice(
          { tag: "Label", label: wizard.label },
          game,
          context,
        ),
        answerIndex: i,
        flavor: companionFlavor(wizard.flavorText, context),
        raw: v,
      });
    });
  } else {
    if (type === "ChooseOneAtATimeWithAuto")
      addChoice({ tag: "Label", label: question.label }, 0);
    nativeChoices.forEach((v, i) =>
      addChoice(v, i + (type === "ChooseOneAtATimeWithAuto" ? 1 : 0)),
    );
  }
  const amountChoices = array(
    question.paymentAmountChoices ?? question.amountChoices,
  ).map((v) => {
    const row = object(v);
    return {
      id: string(row.choiceId),
      label: companionText(row.label ?? row.title, context),
      min: number(row.minBound),
      max: number(row.maxBound),
      investigatorId: string(row.investigatorId) || undefined,
      raw: v,
    };
  });
  const specificContents = array(question.contents);
  const canOrder = ["ChooseOneAtATime", "ChooseOneAtATimeWithAuto"].includes(
    type,
  );
  const putsOnTop =
    canOrder &&
    nativeChoices.length > 0 &&
    nativeChoices.every((v) =>
      array(object(v).messages).some((m) => tag(m) === "AddFocusedToTopOfDeck"),
    );
  const simpleTitles: Record<string, string> = {
    ChooseDeck: "Choose your deck",
    ChooseJoinDeck: "Join with a deck",
    ChooseUpgradeDeck: "Upgrade your deck",
    ContinueCampaign: "Continue the campaign",
    PickScenarioSettings: "Scenario settings",
    PickCampaignSettings: "Campaign settings",
    ChoosePaymentAmounts: "Choose payment amounts",
    ChooseAmounts: "Choose amounts",
    ChooseExchangeAmounts: "Exchange tokens",
    PickDestiny: "Arrange your destiny",
    PickSupplies: "Choose supplies",
    Read: "Story",
    ChooseOneWizard: "Choose a path",
    PlayerWindowChooseOne: "Your action window",
    WindowChooseOne: "Abilities and reactions",
  };
  const ownLabel =
    type === "ChooseOneAtATimeWithAuto"
      ? ""
      : companionText(question.label, context);
  const title =
    labels.at(-1) ||
    ownLabel ||
    flavor?.title ||
    simpleTitles[type] ||
    (kind === "unsupported"
      ? `Unsupported question: ${type}`
      : "Make a choice");
  const continuation =
    kind === "continue"
      ? (object(game.scenario).campaignStep ?? object(game.campaign).step)
      : undefined;
  const nextStep = object(nativeContinuation(continuation).nextStep),
    scenarioId = companionScenarioStepId(nextStep),
    scenarioOptions = object(
      array(nextStep.contents)[
        nextStep.tag === "StandaloneScenarioStepWithOptions" ? 2 : 1
      ],
    );
  // Those scenarios handle ChooseLeadInvestigator with the expedition leader.
  // Passing a different option bypasses that native rule during LoadScenario.
  const requiredLead =
    scenarioId &&
    ["04043", "04054", "53016", "53017"].includes(
      companionCatalogCode(scenarioId),
    ) &&
    scenarioOptions.scenarioOptionsStandalone !== true
      ? string(object(object(game.campaign).meta).expeditionLeader) || undefined
      : undefined;
  return {
    playerId,
    questionVersion: number(game.scenarioSteps),
    tag: type,
    kind,
    title,
    labels,
    costs,
    source,
    tooltip,
    cardCode,
    choices,
    flavor,
    readCards: array(question.readCards).map(string),
    amount,
    amountChoices,
    amountTarget:
      question.paymentAmountTargetValue ?? question.amountTargetValue,
    usedInvestigators: array(question.usedInvestigators).map(string),
    pointsRemaining:
      typeof question.pointsRemaining === "number"
        ? question.pointsRemaining
        : undefined,
    chosenSupplies: array(question.chosenSupplies).map(string),
    resupply:
      typeof question.resupply === "boolean" ? question.resupply : undefined,
    drawings: array(question.drawings),
    specific:
      kind === "specific"
        ? {
            scope: type === "PickScenarioSpecific" ? "scenario" : "campaign",
            key: string(specificContents[0]),
            payload: specificContents[1],
          }
        : undefined,
    settings:
      type === "PickScenarioSettings"
        ? (object(game.scenario).standaloneSettings ??
          context.scenarioSettings?.(
            string(object(game.scenario).id).replace(/^c/, ""),
          ))
        : type === "PickCampaignSettings"
          ? (object(game.campaign).settings ??
            context.campaignSettings?.(string(object(game.campaign).id)))
          : undefined,
    continuation,
    continuationLead:
      kind === "continue" && scenarioId
        ? {
            eligibleIds: companionEntities(game, "investigators")
              .filter((v) => !v.killed && !v.drivenInsane)
              .map((v) => string(v.id))
              .filter(Boolean),
            requiredId: requiredLead,
            existingId:
              string(scenarioOptions.scenarioOptionsLeadInvestigator) ||
              undefined,
          }
        : undefined,
    exchange:
      type === "ChooseExchangeAmounts"
        ? {
            source: question.source,
            from: string(question.investigator1Id),
            to: string(question.investigator2Id),
            fromAmount: number(question.investigator1InitialAmount),
            toAmount: number(question.investigator2InitialAmount),
            token: question.token,
          }
        : undefined,
    canOrder,
    orderDirection: putsOnTop ? "bottom-first" : undefined,
    isPlayerWindow: type === "PlayerWindowChooseOne",
    isWindow: type === "WindowChooseOne",
    raw,
    question,
  };
}
function requireKind(
  model: CompanionQuestion,
  ...kinds: CompanionQuestionKind[]
): void {
  if (!kinds.includes(model.kind))
    throw new Error(
      `This ${model.tag} question does not accept that response.`,
    );
}
function answerContents(model: CompanionQuestion): {
  playerId: string;
  questionVersion: number;
} {
  if (
    !model.playerId ||
    !Number.isSafeInteger(model.questionVersion) ||
    model.questionVersion < 0
  )
    throw new Error("Missing native question identity.");
  return { playerId: model.playerId, questionVersion: model.questionVersion };
}
export function buildChoiceAnswer(
  model: CompanionQuestion,
  answerIndex: number,
): CompanionAnswer {
  requireKind(model, "choices");
  const choice = model.choices.find((v) => v.answerIndex === answerIndex);
  if (!Number.isSafeInteger(answerIndex) || !choice || choice.disabled)
    throw new Error("Choose an available option from this question.");
  return {
    tag: "Answer",
    contents: { choice: answerIndex, ...answerContents(model) },
  };
}
export function buildOrderedAnswer(
  model: CompanionQuestion,
  orderedChoiceIndices: number[],
): CompanionAnswer {
  if (!model.canOrder)
    throw new Error("This question cannot be answered with a complete order.");
  // OrderedResponse uses underlying choice indices: the auto button is absent.
  const count =
    model.choices.length - (model.tag === "ChooseOneAtATimeWithAuto" ? 1 : 0);
  if (
    orderedChoiceIndices.length !== count ||
    orderedChoiceIndices.some(
      (n) => !Number.isSafeInteger(n) || n < 0 || n >= count,
    ) ||
    new Set(orderedChoiceIndices).size !== count
  )
    throw new Error("Name every card exactly once in the requested order.");
  return {
    tag: "OrderedAnswer",
    contents: { choices: [...orderedChoiceIndices], ...answerContents(model) },
  };
}
export function validateCompanionAmounts(
  model: CompanionQuestion,
  amounts: Readonly<Record<string, number>>,
): string | undefined {
  if (model.kind !== "amounts")
    return "This question does not ask for amounts.";
  const keys = Object.keys(amounts),
    ids = model.amountChoices.map((v) => v.id);
  if (keys.some((id) => !ids.includes(id)))
    return "An amount belongs to another question.";
  for (const row of model.amountChoices) {
    const n = amounts[row.id] ?? 0;
    if (!Number.isSafeInteger(n) || n < row.min || n > row.max)
      return `${row.label || "Amount"} must be a whole number from ${row.min} to ${row.max}.`;
  }
  const total = model.amountChoices.reduce(
      (sum, row) => sum + (amounts[row.id] ?? 0),
      0,
    ),
    target = object(model.amountTarget);
  if (target.tag === "MinAmountTarget" && total < number(target.contents))
    return `Choose at least ${number(target.contents)} in total.`;
  if (target.tag === "MaxAmountTarget" && total > number(target.contents))
    return `Choose at most ${number(target.contents)} in total.`;
  if (target.tag === "TotalAmountTarget" && total !== number(target.contents))
    return `Choose exactly ${number(target.contents)} in total.`;
  if (target.tag === "AmountOneOf" && !array(target.contents).includes(total))
    return `Choose a total of ${array(target.contents).join(", ")}.`;
  return undefined;
}
export function buildAmountsAnswer(
  model: CompanionQuestion,
  amounts: Readonly<Record<string, number>>,
): CompanionAnswer {
  const problem = validateCompanionAmounts(model, amounts);
  if (problem) throw new Error(problem);
  // Include every row, including zero payments, without replacing UUIDs by names.
  const normalized = Object.fromEntries(
    model.amountChoices.map((row) => [row.id, amounts[row.id] ?? 0]),
  );
  return {
    tag:
      model.tag === "ChoosePaymentAmounts"
        ? "PaymentAmountsAnswer"
        : "AmountsAnswer",
    contents: { amounts: normalized, ...answerContents(model) },
  };
}
export function buildDeckAnswer(
  model: CompanionQuestion,
  deckId: string,
  overlay: unknown = null,
): CompanionAnswer {
  requireKind(model, "deck");
  if (!deckId) throw new Error("Choose a saved deck.");
  return { tag: "DeckAnswer", deckId, playerId: model.playerId, overlay };
}
export function buildDeckListAnswer(
  model: CompanionQuestion,
  deckList: NativeRecord,
): CompanionAnswer {
  requireKind(model, "deck");
  if (!deckList.investigator_code || !deckList.slots)
    throw new Error("The deck needs its investigator and card slots.");
  return { tag: "DeckListAnswer", deckList, playerId: model.playerId };
}
/** This body goes to the upgrade-deck endpoint, not the native Answer route. */
export function buildUpgradeDeckRequest(
  model: CompanionQuestion,
  investigatorId: string,
  deckList?: NativeRecord,
  deckUrl?: string,
): CompanionAnswer {
  requireKind(model, "upgrade");
  if (!investigatorId)
    throw new Error("Choose the investigator whose deck is being upgraded.");
  return {
    investigatorId,
    ...(deckList ? { deckList } : {}),
    ...(deckUrl ? { deckUrl } : {}),
  };
}
export function buildSettingsAnswer(
  model: CompanionQuestion,
  settings: unknown,
): CompanionAnswer {
  requireKind(model, "settings");
  if (model.tag === "PickScenarioSettings" && !Array.isArray(settings))
    throw new Error("Scenario settings must be the native settings entries.");
  if (model.tag === "PickCampaignSettings") {
    const value = object(settings);
    if (
      !Array.isArray(value.keys) ||
      (!Array.isArray(value.counts) &&
        (!value.counts || typeof value.counts !== "object")) ||
      (!Array.isArray(value.sets) &&
        (!value.sets || typeof value.sets !== "object")) ||
      !Array.isArray(value.options)
    )
      throw new Error("Campaign settings need keys, counts, sets and options.");
    settings = {
      ...value,
      keys: value.keys.map((v) =>
        typeof v === "string" ? v : (object(v).key ?? v),
      ),
      counts: Array.isArray(value.counts)
        ? value.counts
        : Object.entries(object(value.counts)),
      sets: Array.isArray(value.sets)
        ? value.sets
        : Object.entries(object(value.sets)),
      options: value.options.flatMap((v) =>
        typeof v === "string" || object(v).tag
          ? [v]
          : object(v).ckey
            ? [object(v).ckey]
            : [],
      ),
    };
  }
  return {
    tag:
      model.tag === "PickScenarioSettings"
        ? "StandaloneSettingsAnswer"
        : "CampaignSettingsAnswer",
    contents: settings,
  };
}
export function buildScenarioSpecificAnswer(
  model: CompanionQuestion,
  value: unknown,
): CompanionAnswer {
  requireKind(model, "specific");
  if (model.specific?.scope !== "scenario")
    throw new Error("This is a campaign-specific question.");
  return {
    tag: "ScenarioSpecificAnswer",
    contents: [model.specific.key, value],
  };
}
export function buildCampaignSpecificAnswer(
  model: CompanionQuestion,
  value: unknown,
): CompanionAnswer {
  requireKind(model, "specific");
  if (model.specific?.scope !== "campaign")
    throw new Error("This is a scenario-specific question.");
  return {
    tag: "CampaignSpecificAnswer",
    contents: [model.specific.key, value],
  };
}
export function buildExchangeAnswer(
  model: CompanionQuestion,
  amount: number,
): CompanionAnswer {
  requireKind(model, "exchange");
  const exchange = model.exchange;
  if (
    !exchange ||
    !Number.isSafeInteger(amount) ||
    amount > exchange.fromAmount ||
    -amount > exchange.toAmount
  )
    throw new Error("Choose an exchange amount the two investigators can pay.");
  return {
    tag: "ExchangeAmountsAnswer",
    source: exchange.source,
    fromInvestigator: exchange.from,
    toInvestigator: exchange.to,
    token: exchange.token,
    amount,
  };
}
export function buildDestinyAnswer(
  model: CompanionQuestion,
  drawings: readonly unknown[],
): CompanionAnswer {
  requireKind(model, "destiny");
  if (
    drawings.length !== model.drawings.length ||
    drawings.some((v) => !object(v).scenario || !object(v).tarot)
  )
    throw new Error("Arrange each destiny drawing before confirming.");
  const identity = (v: unknown) =>
    JSON.stringify({
      scenario: object(v).scenario,
      arcana: object(object(v).tarot).arcana,
      scope: object(object(v).tarot).scope,
    });
  const original = model.drawings.map(identity).sort(),
    proposed = drawings.map(identity).sort();
  if (JSON.stringify(original) !== JSON.stringify(proposed))
    throw new Error(
      "Keep the drawn tarot cards in their original scenario scopes.",
    );
  if (
    drawings.some(
      (v) =>
        !["Upright", "Reversed"].includes(
          string(object(object(v).tarot).facing),
        ),
    ) ||
    drawings.filter((v) => object(object(v).tarot).facing === "Reversed")
      .length !== Math.ceil(drawings.length / 2)
  )
    throw new Error(
      `Turn exactly ${Math.ceil(drawings.length / 2)} of the drawn tarot cards upside down.`,
    );
  return { tag: "PickDestinyAnswer", contents: [...drawings] };
}
export function buildCampaignStepAnswer(
  model: CompanionQuestion,
  step: unknown,
): CompanionAnswer {
  requireKind(model, "continue");
  if (!tag(step)) throw new Error("Choose the next campaign step.");
  return { tag: "CampaignStepAnswer", contents: step };
}
/** Body for the dedicated server route; arbitrary native messages are never accepted. */
export function buildVentNoteRequest(
  model: CompanionQuestion,
  text: string,
): CompanionAnswer {
  requireKind(model, "specific");
  if (
    model.specific?.scope !== "scenario" ||
    model.specific.key !== "epicLabyrinth.note"
  )
    throw new Error("This question does not request a Vent note.");
  const payload = object(model.specific.payload);
  if (
    typeof payload.story !== "string" ||
    typeof payload.investigator !== "string" ||
    text.length > 4000
  )
    throw new Error("The Vent note is invalid or too long.");
  return {
    ...answerContents(model),
    storyId: payload.story,
    investigatorId: payload.investigator,
    text,
  };
}
export function buildSpiritDeckAnswer(
  model: CompanionQuestion,
  selected: readonly string[],
): CompanionAnswer {
  if (model.specific?.key !== "laidToRest.buildSpiritDeck")
    throw new Error("This question does not request a spirit deck.");
  const prompt = object(model.specific.payload),
    allowed = array(prompt.cardCodes);
  if (
    selected.length !== prompt.count ||
    new Set(selected).size !== selected.length ||
    selected.some((code) => !allowed.includes(code))
  )
    throw new Error(
      `Choose exactly ${number(prompt.count)} different spirit cards.`,
    );
  return buildScenarioSpecificAnswer(model, { cardCodes: [...selected] });
}
export type CompanionTravelMode = "travel" | "travelVia" | "travelWithTicket";
export interface CompanionTravelLocation {
  destination: string;
  current: boolean;
  available: boolean;
  hidden: boolean;
  travelTime: number | null;
  canTravel: boolean;
  canTravelVia: boolean;
  canUseTicket: boolean;
}
export interface CompanionTravel {
  current: string;
  isFinale: boolean;
  locations: CompanionTravelLocation[];
}
/** Project only the destinations and routes supplied by the pending native ask.
 * The engine serializes its list of Aeson pairs as tuples; also accept an
 * equivalent record without changing the raw question.
 */
export function companionTravel(
  model: CompanionQuestion,
): CompanionTravel | undefined {
  if (model.specific?.key !== "embark" || model.specific.scope !== "campaign")
    return undefined;
  const prompt = object(model.specific.payload),
    current = string(prompt.current),
    available = array(prompt.available).map(string),
    // At the time limit the native engine moves the cell to Tunguska and asks
    // for the single remaining stop. There is no isFinale field on the wire.
    isFinale =
      current === "Tunguska" &&
      available.length === 1 &&
      available[0] === current,
    entries = Array.isArray(prompt.locations)
      ? prompt.locations.map((v) => array(v))
      : Object.entries(object(prompt.locations));
  return {
    current,
    isFinale,
    locations: entries.flatMap((pair) => {
      const destination = string(pair[0]);
      if (!destination) return [];
      const distance = object(pair[1]).travel,
        travelTime =
          typeof distance === "number" &&
          Number.isSafeInteger(distance) &&
          distance >= 0
            ? distance +
              ([
                "Arkham",
                "Cairo",
                "NewOrleans",
                "Venice",
                "MonteCarlo",
              ].includes(destination)
                ? 1
                : 0)
            : null,
        isCurrent = destination === current,
        unlocked = available.includes(destination),
        hidden = destination === "BermudaTriangle" && !unlocked,
        route = travelTime !== null && !hidden,
        canTravel = route && unlocked && (!isCurrent || isFinale),
        canTravelVia = route && !isCurrent;
      return [
        {
          destination,
          current: isCurrent,
          available: unlocked,
          hidden,
          travelTime,
          canTravel,
          canTravelVia,
          canUseTicket:
            canTravel &&
            !isCurrent &&
            prompt.hasTicket === true &&
            travelTime !== null &&
            travelTime > 1,
        },
      ];
    }),
  };
}
export function buildTravelAnswer(
  model: CompanionQuestion,
  destination: string,
  mode: CompanionTravelMode,
): CompanionAnswer {
  const travel = companionTravel(model);
  if (!travel) throw new Error("This question does not request travel.");
  const location = travel.locations.find((v) => v.destination === destination);
  if (!location || !["travel", "travelVia", "travelWithTicket"].includes(mode))
    throw new Error("Choose a destination on this map.");
  if (location.current && !travel.isFinale)
    throw new Error("You are already at that destination.");
  if (location.hidden || location.travelTime === null)
    throw new Error("There is no available route to that destination.");
  if (mode !== "travelVia" && !location.available)
    throw new Error("That destination is not unlocked.");
  if (mode === "travelWithTicket" && !location.canUseTicket)
    throw new Error("An expedited ticket cannot be used for this journey.");
  if (mode === "travelVia" && !location.canTravelVia)
    throw new Error(
      "Travel to the final destination to continue the campaign.",
    );
  return { tag: "CampaignSpecificAnswer", contents: [mode, destination] };
}

export interface CompanionSettingsState {
  keys: { key: string; scope?: string }[];
  counts: Record<string, number>;
  sets: Record<
    string,
    {
      recordable: string;
      entries: { tag: "Recorded" | "CrossedOut"; value: unknown }[];
    }
  >;
  options: { key: string; ckey?: string }[];
}
export const companionPartnerCodes: readonly string[] = [
  "08720",
  "08714",
  "08715",
  "08721",
  "08722",
  "08718",
  "08717",
  "08719",
  "08716",
];
export function settingsCondition(
  condition: unknown,
  state: CompanionSettingsState,
  standalone: readonly unknown[] = [],
): boolean {
  const c = object(condition),
    type = string(c.type),
    key = string(c.key);
  if (type === "key")
    return state.keys.some(
      (v) => v.key === key && (!c.scope || v.scope === c.scope),
    );
  if (type === "option") return state.options.some((v) => v.key === key);
  if (type === "inSet" || type === "crossedOut")
    return (
      state.sets[key]?.entries.some(
        (v) =>
          v.value === c.content &&
          v.tag === (type === "inSet" ? "Recorded" : "CrossedOut"),
      ) ?? false
    );
  if (type === "count") {
    const n = state.counts[key],
      p = object(c.predicate);
    return (
      n !== undefined &&
      (p.type === "lte"
        ? n <= number(p.value)
        : p.type === "gte"
          ? n >= number(p.value)
          : false)
    );
  }
  if (type === "survivedPlaneCrash") {
    const flatten = (
      list: readonly unknown[],
      parents: readonly NativeRecord[] = [],
    ): { setting: NativeRecord; parents: readonly NativeRecord[] }[] =>
      list.flatMap((v) =>
        object(v).type === "Group"
          ? flatten(array(object(v).content), [...parents, object(v)])
          : [{ setting: object(v), parents }],
      );
    const crash = flatten(standalone).find(
      ({ setting, parents }) =>
        setting.key === "KilledInPlaneCrash" &&
        [...parents, setting].every((v) =>
          settingsActive(v, state, standalone),
        ),
    );
    return crash?.setting.content !== key;
  }
  if (type === "always") return true;
  if (type === "not") return !settingsCondition(c.content, state, standalone);
  if (type === "and")
    return array(c.content).every((v) =>
      settingsCondition(v, state, standalone),
    );
  if (type === "or")
    return array(c.content).some((v) =>
      settingsCondition(v, state, standalone),
    );
  if (type === "nor")
    return !array(c.content).some((v) =>
      settingsCondition(v, state, standalone),
    );
  return false;
}
export function settingsActive(
  setting: unknown,
  state: CompanionSettingsState,
  standalone: readonly unknown[] = [],
): boolean {
  const s = object(setting);
  return (
    array(s.ifRecorded).every((v) => settingsCondition(v, state, standalone)) &&
    (s.anyRecorded === undefined ||
      array(s.anyRecorded).some((v) => settingsCondition(v, state, standalone)))
  );
}
export function standaloneSettingsState(
  settings: readonly unknown[],
): CompanionSettingsState {
  const project = (
    previous?: CompanionSettingsState,
  ): CompanionSettingsState => {
    const state: CompanionSettingsState = {
      keys: [],
      counts: {},
      sets: {},
      options: [],
    };
    const active = (s: unknown) =>
      !previous || settingsActive(s, previous, settings);
    const walk = (list: readonly unknown[]) =>
      list.forEach((v) => {
        const s = object(v),
          key = string(s.key),
          type = string(s.type);
        // An inactive group makes every child inactive, including the values
        // that would otherwise keep a dependent section visible.
        if (!active(s)) return;
        if (type === "Group") walk(array(s.content));
        if (type === "ToggleKey" && s.content === true)
          state.keys.push({ key });
        if (type === "PickKey" && s.content)
          state.keys.push({ key: string(s.content) });
        if (type === "ToggleOption" && s.content === true)
          state.options.push({ key, ckey: key });
        if (type === "ChooseNum") state.counts[key] = number(s.content);
        if (type === "ToggleRecords" || type === "ToggleCrossedOut")
          state.sets[key] = {
            recordable: string(s.recordable),
            entries: array(s.content)
              .filter(active)
              .map((v) => {
                const entry = object(v);
                return {
                  tag: (
                    type === "ToggleRecords"
                      ? entry.content === true
                      : entry.content !== true
                  )
                    ? "Recorded"
                    : "CrossedOut",
                  value: entry.key,
                };
              }),
          };
        if (type === "ChooseRecord" && typeof s.selected === "string")
          state.sets[key] = {
            recordable: string(s.recordable),
            entries: [{ tag: "Recorded", value: s.selected }],
          };
      });
    walk(settings);
    return state;
  };
  let state = project();
  for (let pass = 0; pass < 12; pass++) {
    const next = project(state);
    if (JSON.stringify(next) === JSON.stringify(state)) return next;
    state = next;
  }
  return state;
}
export function standaloneSettingsForAnswer(
  settings: readonly unknown[],
): unknown[] {
  const state = standaloneSettingsState(settings);
  const filter = (entries: readonly unknown[]): unknown[] =>
    entries
      .filter((v) => settingsActive(v, state, settings))
      .map((v) => {
        const s = object(v);
        if (s.type === "Group")
          return { ...s, content: filter(array(s.content)) };
        if (s.type === "ToggleRecords" || s.type === "ToggleCrossedOut")
          return {
            ...s,
            content: array(s.content).filter((v) =>
              settingsActive(v, state, settings),
            ),
          };
        if (
          s.type === "ChooseNum" &&
          (!Number.isSafeInteger(s.content) ||
            number(s.content) < number(s.min) ||
            number(s.content) > number(s.max))
        )
          throw new Error(
            `${words(string(s.key))} is outside its printed bounds.`,
          );
        if (s.type === "PickKey" && !array(s.keys).includes(s.content))
          throw new Error(`Choose ${words(string(s.key))}.`);
        if (
          s.type === "ChooseRecord" &&
          s.selected !== null &&
          !array(s.content).some((v) => object(v).key === s.selected)
        )
          throw new Error(
            `Choose an available ${words(string(s.label ?? s.key))}.`,
          );
        if (
          s.type === "SetPartnerKilled" &&
          !companionPartnerCodes.includes(string(s.content))
        )
          throw new Error("Choose the partner killed in the plane crash.");
        if (s.type === "SetPartnerDetails") {
          const details = object(s.content);
          if (
            !s.value ||
            !Number.isSafeInteger(details.damage) ||
            !Number.isSafeInteger(details.horror) ||
            number(details.damage) < 0 ||
            number(details.damage) > number(s.maxDamage) ||
            number(details.horror) < 0 ||
            number(details.horror) > number(s.maxHorror) ||
            ![
              "Safe",
              "Resolute",
              "Eliminated",
              "Mia",
              "Victim",
              "CannotTake",
              "TheEntity",
            ].includes(string(details.status))
          )
            throw new Error("Choose valid partner damage, horror and status.");
        }
        return s;
      });
  return filter(settings);
}
export function relevantCampaignSettings(
  schema: readonly unknown[],
  game: NativeGame,
): NativeRecord[] {
  const step = object(object(game.campaign).step),
    id = string(
      step.tag === "ScenarioStep" ? step.contents : array(step.contents)[0],
    ).replace(/^c/, "");
  const index = schema.findIndex((v) => object(v).scenarioId === id);
  return schema
    .map(object)
    .filter(
      (section, i) =>
        (index >= 0 && i < index) || object(section.force).scenarioId === id,
    );
}
export function initialCampaignSettings(
  schema: readonly unknown[],
): CompanionSettingsState {
  const state: CompanionSettingsState = {
    keys: [],
    counts: {},
    sets: {},
    options: [],
  };
  for (const section of schema)
    for (const setting of array(object(section).settings)) {
      const s = object(setting);
      if (s.type === "ChooseNum")
        state.counts[string(s.ckey ?? s.key)] = number(s.min);
      if (s.type === "CrossOut")
        state.sets[string(s.ckey ?? s.key)] = {
          recordable: string(s.recordable),
          entries: array(s.content).map((v) => ({
            tag: "Recorded",
            value: object(v).content,
          })),
        };
    }
  return state;
}
/** Normalize active/forced campaign records and exclude branches now inactive. */
export function normalizeCampaignSettings(
  schema: readonly unknown[],
  input: CompanionSettingsState,
): CompanionSettingsState {
  let state = structuredClone(input);
  for (let pass = 0; pass < 12; pass++) {
    const next: CompanionSettingsState = {
      keys: [],
      counts: {},
      sets: {},
      options: [],
    };
    const record = (
      key: string,
      recordable: string,
      entries: CompanionSettingsState["sets"][string]["entries"],
    ) => {
      const merged = [...(next.sets[key]?.entries ?? []), ...entries];
      next.sets[key] = {
        recordable,
        entries: merged.filter(
          (v, i) =>
            merged.findIndex(
              (x) => JSON.stringify(x.value) === JSON.stringify(v.value),
            ) === i,
        ),
      };
    };
    for (const section of schema) {
      const step = object(section),
        scope = string(step.key);
      if (!settingsActive(step, state)) continue;
      for (const value of array(step.settings)) {
        const s = object(value),
          type = string(s.type),
          key = string(s.ckey ?? s.key);
        if (!settingsActive(s, state)) continue;
        if (type === "ChooseKey") {
          const options = array(s.content).map(object),
            forced = options.filter(
              (v) => v.forceWhen && settingsCondition(v.forceWhen, state),
            );
          const selected = forced.length
            ? forced
            : options.filter((v) =>
                state.keys.some((k) => k.key === v.key && k.scope === scope),
              );
          next.keys.push(
            ...selected.map((v) => ({ key: string(v.key), scope })),
          );
        } else if (type === "ForceKey")
          next.keys.push({ key: string(s.key), scope });
        else if (type === "SetKey")
          next.keys.push(
            ...state.keys.filter((v) => v.key === key && v.scope === scope),
          );
        else if (type === "ChooseNum")
          next.counts[key] = state.counts[key] ?? number(s.min);
        else if (type === "Option")
          next.options.push(...state.options.filter((v) => v.key === s.key));
        else if (type === "ChooseOption")
          next.options.push(
            ...state.options.filter((v) =>
              array(s.content).some((o) => object(o).key === v.key),
            ),
          );
        else if (type === "ForceRecorded")
          record(key, string(s.recordable), [
            { tag: "Recorded", value: s.content },
          ]);
        else if (
          [
            "Record",
            "CrossOut",
            "SetRecordable",
            "ChooseRecordable",
            "ChooseRecordables",
          ].includes(type)
        ) {
          const candidates =
            type === "SetRecordable"
              ? [s.content]
              : array(s.content)
                  .filter((v) => settingsActive(v, state))
                  .map((v) => object(v).content);
          record(
            key,
            string(s.recordable),
            (state.sets[key]?.entries ?? []).filter((v) =>
              candidates.includes(v.value),
            ),
          );
        }
      }
    }
    if (JSON.stringify(next) === JSON.stringify(state)) return next;
    state = next;
  }
  return state;
}
export function campaignSettingsForAnswer(
  schema: readonly unknown[],
  input: CompanionSettingsState,
): NativeRecord {
  const state = normalizeCampaignSettings(schema, input);
  for (const section of schema) {
    const step = object(section);
    if (!settingsActive(step, state)) continue;
    for (const value of array(step.settings)) {
      const s = object(value);
      if (!settingsActive(s, state)) continue;
      if (
        s.type === "ChooseKey" &&
        !array(s.content).some((v) =>
          state.keys.some(
            (k) => k.key === object(v).key && k.scope === step.key,
          ),
        )
      )
        throw new Error(`Choose ${words(string(s.key))}.`);
      if (s.type === "ChooseNum") {
        const n = state.counts[string(s.ckey ?? s.key)];
        if (
          !Number.isSafeInteger(n) ||
          n < number(s.min) ||
          (s.max !== undefined && n > number(s.max))
        )
          throw new Error(
            `${words(string(s.key))} is outside its printed bounds.`,
          );
      }
    }
  }
  return {
    keys: [...new Set(state.keys.map((v) => v.key))],
    counts: Object.entries(state.counts),
    sets: Object.entries(state.sets),
    options: state.options.flatMap((v) => (v.ckey ? [v.ckey] : [])),
  };
}

/** Only these native step constructors name a scenario. Other tuples carry
 * interlude numbers or campaign keys, never an investigator-selection prompt.
 */
export function companionScenarioStepId(step: unknown): string | undefined {
  const value = object(step);
  if (value.tag === "ScenarioStep") return string(value.contents) || undefined;
  if (
    [
      "ScenarioStepWithOptions",
      "StandaloneScenarioStep",
      "StandaloneScenarioStepWithOptions",
    ].includes(string(value.tag))
  )
    return string(array(value.contents)[0]) || undefined;
  return undefined;
}
function nativeContinuation(value: unknown): NativeRecord {
  let step = object(value);
  if (
    (step.tag === "StandaloneScenarioStep" ||
      step.tag === "StandaloneScenarioStepWithOptions") &&
    tag(array(step.contents)[1]) === "ContinueCampaignStep"
  )
    step = object(array(step.contents)[1]);
  return step.tag === "ContinueCampaignStep"
    ? object(step.contents)
    : { nextStep: step, canUpgradeDecks: false, canChooseSideStory: false };
}
export function companionContinuation(model: CompanionQuestion): NativeRecord {
  return nativeContinuation(model.continuation);
}
/** Preserve existing scenario options and use the native mandatory defaults. */
export function buildContinueAnswer(
  model: CompanionQuestion,
  leadInvestigator?: string,
): CompanionAnswer {
  const step = object(companionContinuation(model).nextStep);
  const lead = model.continuationLead;
  if (leadInvestigator && !companionScenarioStepId(step))
    throw new Error("This campaign step does not choose a lead investigator.");
  if (lead?.requiredId) {
    if (leadInvestigator && leadInvestigator !== lead.requiredId)
      throw new Error("The expedition leader must lead this scenario.");
    leadInvestigator = lead.requiredId;
  }
  if (leadInvestigator && lead && !lead.eligibleIds.includes(leadInvestigator))
    throw new Error("Choose a living investigator in this campaign.");
  let next: unknown = step;
  if (leadInvestigator) {
    const defaults = {
      scenarioOptionsStandalone: false,
      scenarioOptionsPerformTarotReading: false,
      scenarioOptionsLeadInvestigator: leadInvestigator,
    };
    if (step.tag === "ScenarioStep")
      next = {
        tag: "ScenarioStepWithOptions",
        contents: [step.contents, defaults],
      };
    if (step.tag === "ScenarioStepWithOptions")
      next = {
        ...step,
        contents: [
          array(step.contents)[0],
          {
            ...defaults,
            ...object(array(step.contents)[1]),
            scenarioOptionsLeadInvestigator: leadInvestigator,
          },
        ],
      };
    if (step.tag === "StandaloneScenarioStep")
      next = {
        tag: "StandaloneScenarioStepWithOptions",
        contents: [...array(step.contents), defaults],
      };
    if (step.tag === "StandaloneScenarioStepWithOptions")
      next = {
        ...step,
        contents: [
          array(step.contents)[0],
          array(step.contents)[1],
          {
            ...defaults,
            ...object(array(step.contents)[2]),
            scenarioOptionsLeadInvestigator: leadInvestigator,
          },
        ],
      };
  }
  return buildCampaignStepAnswer(model, next);
}
export function buildUpgradeStepAnswer(
  model: CompanionQuestion,
): CompanionAnswer {
  const c = companionContinuation(model);
  if (!c.canUpgradeDecks)
    throw new Error("Deck upgrades are not offered at this campaign step.");
  return buildCampaignStepAnswer(model, {
    tag: "UpgradeDeckStep",
    contents: {
      tag: "ContinueCampaignStep",
      contents: { nextStep: c.nextStep, canUpgradeDecks: true },
    },
  });
}
export function buildSideStoryAnswer(
  model: CompanionQuestion,
  scenarioId: string,
): CompanionAnswer {
  const c = companionContinuation(model);
  if (!c.canChooseSideStory || !scenarioId)
    throw new Error("A side story is not offered at this campaign step.");
  return buildCampaignStepAnswer(model, {
    tag: "ContinueCampaignStep",
    contents: {
      canUpgradeDecks: true,
      canChooseSideStory: false,
      nextStep: {
        tag: "StandaloneScenarioStep",
        contents: [
          scenarioId,
          {
            tag: "ContinueCampaignStep",
            contents: {
              nextStep: c.nextStep,
              canUpgradeDecks: c.canUpgradeDecks,
              canChooseSideStory: false,
            },
          },
        ],
      },
    },
  });
}
