import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowCounterClockwise,
  ArrowRight,
  BookOpen,
  CheckCircle,
  MapPin,
  Stack,
  StarFour,
} from "@phosphor-icons/react";
import {
  CARD_ART,
  CARD_BACKS,
  LOCATION_ART,
  cardArt,
  plain,
  thumbArt,
} from "../game/data";
import type { Card } from "../game/types";
import { kindLabel, productsForCard } from "../game/catalog";
import {
  companionCatalogCode,
  companionEntities,
  companionQuestion,
  companionSnapshot,
  companionText,
  companionTranslator,
  type CompanionAnswer,
  type CompanionContext,
  type CompanionSnapshot,
  type NativeGame,
  type NativeRecord,
} from "../game/companionProtocol";
import {
  answerCompanionGame,
  getCompanionCardDefinitions,
  getCompanionGame,
  getCompanionGameStep,
  getCompanionPlayOptions,
  getCompanionPresentation,
  RULES_SERVER_URL,
  sendCompanionVentNote,
  undoCompanionGame,
  upgradeCompanionDeck,
  type CompanionPlayOptions,
  type CompanionPresentation,
  type CompanionSession,
  type CompanionCardDefinition,
} from "../game/rulesServer";
import {
  Button,
  CardFace,
  HoverPreview,
  Modal,
  SkillStats,
  Token,
} from "./Common";
import { TableToken } from "./Tabletop";
import { CompanionDecision } from "./CompanionDecision";
import { useCatalog } from "./useCatalog";
import "../companion-table.css";

const obj = (v: unknown): NativeRecord =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as NativeRecord)
    : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
function tokenMap(value: unknown): NativeRecord {
  return Array.isArray(value)
    ? Object.fromEntries(
        value.flatMap((pair) => {
          const [key, amount] = list(pair),
            kind = str(key) || str(obj(key).tag);
          return kind && typeof amount === "number" ? [[kind, amount]] : [];
        }),
      )
    : obj(value);
}
const words = (v: string) =>
  v.replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
const name = (v: unknown) =>
  typeof v === "string"
    ? v
    : [str(obj(v).title), str(obj(v).subtitle)].filter(Boolean).join(" · ");
function contents(v: unknown): NativeRecord {
  let value = obj(v);
  for (
    let n = 0;
    n < 6 &&
    value.contents &&
    !Array.isArray(value.contents) &&
    typeof value.contents === "object";
    n++
  )
    value = obj(value.contents);
  return value;
}
function codeOf(entity: NativeRecord): string {
  const code =
    str(entity.cardCode ?? entity.art ?? entity.code) ||
    (/^c?(?:\d{5}|:barkham:\d{3})[ab]?$/.test(str(entity.id))
      ? str(entity.id)
      : "");
  return companionCatalogCode(code);
}
const idOf = (entity: NativeRecord) => str(entity.id ?? entity.cardId);
const placement = (entity: NativeRecord) => obj(entity.placement);
const faceIsBack = (entity: NativeRecord) =>
  entity.flipped === true ||
  entity.isFlipped === true ||
  list(entity.sequence)[1] === "B" ||
  obj(entity.sequence).agendaSequenceSide === "B";
function at(entity: NativeRecord, id: string): boolean {
  const p = placement(entity);
  return (
    ([
      "AtLocation",
      "AttachedToLocation",
      "InThreatArea",
      "FacedownInThreatArea",
      "InPlayArea",
    ].includes(str(p.tag)) &&
      p.contents === id) ||
    (!p.tag && entity.location === id)
  );
}
function visible(entity: NativeRecord): boolean {
  return ![
    "OutOfPlay",
    "Limbo",
    "StillInHand",
    "StillInDiscard",
    "OnTopOfDeck",
    "HiddenInHand",
  ].includes(str(placement(entity).tag));
}
function chaosFace(value: unknown): string {
  const face =
    typeof value === "string"
      ? value
      : str(obj(value).chaosTokenFace ?? obj(value).face ?? obj(value).tag);
  const numeric: Record<string, string> = {
    PlusOne: "+1",
    Zero: "0",
    MinusOne: "-1",
    MinusTwo: "-2",
    MinusThree: "-3",
    MinusFour: "-4",
    MinusFive: "-5",
    MinusSix: "-6",
    MinusSeven: "-7",
    MinusEight: "-8",
  };
  return (
    numeric[face] || face.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()
  );
}
function printedValue(value: unknown, players: number): string {
  if (typeof value === "number") return String(value);
  const v = obj(value);
  if (v.tag === "Fixed" || v.tag === "Static") return String(num(v.contents));
  if (v.tag === "PerPlayer") return String(num(v.contents) * players);
  if (v.tag === "GameValueCalculation")
    return printedValue(v.contents, players);
  return v.tag === "ValueX" ? "X" : "—";
}
function definition(
  entity: NativeRecord,
  cards: ReadonlyMap<string, Card>,
  fallbackType = "asset",
): Card {
  const code = codeOf(entity);
  return (
    cards.get(code) || {
      code,
      name: name(entity.name) || words(str(entity.label)) || "Card",
      type_code: fallbackType,
      faction_code: "neutral",
      position: 0,
      quantity: 1,
    }
  );
}
const nativeArt = (
  definition: CompanionCardDefinition,
  reverse = false,
): string => {
  const barkham = /^:barkham:(\d{3})$/.exec(definition.art);
  if (barkham)
    return `${RULES_SERVER_URL}/chronicle/barkham/card/${barkham[1]}${reverse ? "b" : ""}.svg`;
  const file =
    reverse && definition.customBack
      ? definition.customBack
      : `${definition.art}${reverse ? "b" : ""}.avif`;
  return `https://assets.arkhamhorror.app/img/arkham/cards/${file}`;
};

function Counters({ entity, code }: { entity: NativeRecord; code?: string }) {
  const tokens = tokenMap(entity.tokens);
  return (
    <div className="companion-counters" aria-label="Tokens on this card">
      {Object.entries(tokens)
        .filter(([, value]) => typeof value === "number" && value > 0)
        .map(([kind, value]) => {
          const basic: Record<
            string,
            "clue" | "doom" | "resource" | "damage" | "horror"
          > = {
            Clue: "clue",
            Doom: "doom",
            Resource: "resource",
            Damage: "damage",
            Horror: "horror",
          };
          return basic[kind] ? (
            <TableToken key={kind} kind={basic[kind]} value={num(value)} />
          ) : (
            <span className="uses-counter" key={kind}>
              {value as number}{" "}
              {code === "barkham-014" && kind === "Supply"
                ? "Treats"
                : words(kind)}
            </span>
          );
        })}
      {entity.exhausted === true && (
        <span className="companion-state-tag">Exhausted</span>
      )}
      {list(entity.keys).map((key, i) => (
        <span className="companion-state-tag" key={`key-${i}`}>
          {words(str(obj(key).tag) || str(key))} key
        </span>
      ))}
      {typeof entity.breaches === "number" && entity.breaches > 0 && (
        <span className="companion-state-tag">{entity.breaches} breaches</span>
      )}
      {entity.brazier != null && (
        <span className="companion-state-tag">
          {words(str(entity.brazier) || str(obj(entity.brazier).tag))} brazier
        </span>
      )}
      {entity.floodLevel != null && (
        <span className="companion-state-tag">
          {words(str(entity.floodLevel) || str(obj(entity.floodLevel).tag))}
        </span>
      )}
      {list(entity.seals).map((seal, i) => (
        <span className="companion-state-tag" key={`seal-${i}`}>
          {words(str(seal) || str(obj(seal).tag))} seal
        </span>
      ))}
      {list(entity.sealedChaosTokens).map((token, i) => (
        <span className="companion-state-tag" key={`sealed-${i}`}>
          Sealed <Token token={chaosFace(token)} size={19} />
        </span>
      ))}
    </div>
  );
}

function NativeCard({
  entity,
  cards,
  inspect,
  type,
  concealed = false,
  reverse = false,
  children,
}: {
  entity: NativeRecord;
  cards: ReadonlyMap<string, Card>;
  inspect: (code: string, reverse?: boolean) => void;
  type?: string;
  concealed?: boolean;
  reverse?: boolean;
  children?: ReactNode;
}) {
  const c = definition(entity, cards, type);
  const hidden =
    concealed ||
    entity.facedown === true ||
    entity.hidden === true ||
    str(placement(entity).tag) === "FacedownInThreatArea";
  const back = reverse || faceIsBack(entity);
  const source =
    reverse && LOCATION_ART[c.code]
      ? CARD_ART[LOCATION_ART[c.code].unrevealed]
      : back
        ? cardArt(c, true)
        : undefined;
  const src = thumbArt(source);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <figure
      className={`companion-card ${entity.exhausted === true ? "exhausted" : ""} ${["act", "agenda", "investigator"].includes(c.type_code) ? "landscape" : ""}`}
      data-entity-id={idOf(entity)}
      data-card-id={str(entity.cardId)}
    >
      {hidden ? (
        <div className="companion-facedown" aria-label="Facedown card">
          <img
            src={
              c.type_code === "treachery" || c.type_code === "enemy"
                ? CARD_BACKS.encounter
                : CARD_BACKS.player
            }
            alt="Facedown card"
          />
        </div>
      ) : back ? (
        <HoverPreview
          code={reverse ? undefined : c.code}
          title={reverse ? "Unrevealed location" : c.back_name || c.name}
        >
          <button
            className="card-face official-scan companion-reverse"
            aria-label={
              reverse
                ? "Unrevealed location"
                : `Inspect ${c.name}, reverse face`
            }
            data-preview-face="back"
            onClick={() => !reverse && inspect(c.code, true)}
            disabled={reverse}
          >
            {src && !failed ? (
              <img
                src={src}
                alt={
                  reverse ? "Unrevealed location" : `${c.name}, reverse face`
                }
                onError={() => setFailed(true)}
              />
            ) : (
              <span className="table-card-fallback">
                <StarFour size={30} />
                <strong>
                  {reverse ? "Unrevealed location" : c.back_name || c.name}
                </strong>
              </span>
            )}
          </button>
        </HoverPreview>
      ) : (
        <HoverPreview code={c.code} title={c.name}>
          <CardFace c={c} compact onClick={() => inspect(c.code)} />
        </HoverPreview>
      )}
      <figcaption>
        {hidden ? "Facedown" : reverse ? "Unrevealed location" : c.name}
      </figcaption>
      <Counters entity={entity} code={c.code} />
      {!hidden &&
        c.type_code === "enemy" &&
        [entity.currentFight, entity.currentHealth, entity.currentEvade].some(
          (value) => typeof value === "number",
        ) && (
          <div
            className="companion-enemy-stats"
            aria-label="Current enemy statistics"
          >
            {typeof entity.currentFight === "number" && (
              <span>Fight {entity.currentFight}</span>
            )}
            {typeof entity.currentHealth === "number" && (
              <span>
                Health{" "}
                {Math.max(
                  0,
                  entity.currentHealth - num(tokenMap(entity.tokens).Damage),
                )}{" "}
                / {entity.currentHealth}
              </span>
            )}
            {typeof entity.currentEvade === "number" && (
              <span>Evade {entity.currentEvade}</span>
            )}
          </div>
        )}
      {children}
    </figure>
  );
}

function NativeInspection({
  card,
  reverse,
  sealed,
}: {
  card: Card;
  reverse: boolean;
  sealed: boolean;
}) {
  const source = cardArt(card, reverse);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return (
    <figure className="companion-native-detail">
      {source && !failed ? (
        <img
          src={source}
          alt={sealed ? "Unrevealed location" : `${card.name}, visible face`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="companion-native-art-missing">
          <StarFour size={34} />
          <strong>{sealed ? "Unrevealed location" : card.name}</strong>
          <span>Artwork unavailable</span>
        </div>
      )}
      <figcaption>
        {sealed
          ? "Unrevealed location"
          : reverse
            ? card.back_name || card.name
            : card.name}
      </figcaption>
      {!sealed &&
        productsForCard(card).map((product) => (
          <p className="companion-native-source" key={product.code}>
            {product.name} · {kindLabel(product.kind)}
          </p>
        ))}
    </figure>
  );
}

export function CompanionTable({
  session,
  inspect,
  onHome,
}: {
  session: CompanionSession;
  inspect: (catalogCode: string) => void;
  onHome: () => void;
}) {
  const { cards, error: catalogError, retry: retryCatalog } = useCatalog();
  const catalogCodes = useMemo(
    () => new Set(cards.map((card) => card.code)),
    [cards],
  );
  const [nativeInspection, setNativeInspection] = useState<{
    card: Card;
    reverse: boolean;
    sealed: boolean;
  } | null>(null);
  const [nativeDefinitions, setNativeDefinitions] = useState<
    CompanionCardDefinition[]
  >([]);
  const cardMap = useMemo(() => {
    const catalog = new Map(cards.map((c) => [c.code, c]));
    for (const native of nativeDefinitions) {
      for (const rawCode of [
        native.cardCode,
        ...(native.alternateCardCodes || []),
      ]) {
        const code = companionCatalogCode(rawCode),
          original = catalog.get(code);
        catalog.set(code, {
          ...(original || {
            code,
            name: native.name.title,
            subname: native.name.subtitle || undefined,
            type_code: native.cardType
              .replace(/Type$/, "")
              .replace(/^Player/, "")
              .toLowerCase(),
            faction_code: "neutral",
            position: 0,
            quantity: 1,
          }),
          imagesrc: original?.imagesrc || nativeArt(native),
          backimagesrc: original?.backimagesrc || nativeArt(native, true),
          double_sided: original?.double_sided ?? native.doubleSided,
        });
      }
    }
    return catalog;
  }, [cards, nativeDefinitions]);
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [options, setOptions] = useState<CompanionPlayOptions>();
  const [presentation, setPresentation] = useState<CompanionPresentation>();
  const [solo, setSolo] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [view, setView] = useState<
    "bag" | "discard" | "victory" | "hand" | "log" | null
  >(null);
  const generation = useRef(0),
    mounted = useRef(false),
    inFlight = useRef(false),
    step = useRef(-1);
  const sessionKey = `${session.gameId}:${session.seatId || ""}`;
  const load = useCallback(async () => {
    const version = ++generation.current;
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await getCompanionGameStep(session);
      const raw = await getCompanionGame(session);
      const after = await getCompanionGameStep(session);
      if (!mounted.current || version !== generation.current) return;
      if (before.step !== after.step && attempt < 2) continue;
      // Keep the earlier revision when another seat changed the game during
      // the final read. The next poll must still detect that newer revision.
      step.current = before.step;
      setSnapshot(companionSnapshot(raw));
      setSolo(obj(raw).multiplayerMode === "Solo");
      setError("");
      return;
    }
  }, [session.gameId, session.seatId]);
  useEffect(() => {
    mounted.current = true;
    step.current = -1;
    setSnapshot(null);
    setSelected("");
    setNativeInspection(null);
    void load().catch(
      (cause) =>
        mounted.current &&
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load this investigation.",
        ),
    );
    void getCompanionPlayOptions()
      .then((value) => mounted.current && setOptions(value))
      .catch(() => {});
    void getCompanionPresentation()
      .then((value) => mounted.current && setPresentation(value))
      .catch(() => {});
    void getCompanionCardDefinitions()
      .then((value) => mounted.current && setNativeDefinitions(value))
      .catch(() => {});
    const poll = async () => {
      if (document.hidden || inFlight.current) return;
      try {
        const current = await getCompanionGameStep(session);
        if (!inFlight.current && current.step !== step.current) await load();
      } catch (cause) {
        if (mounted.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Connection interrupted. Your game is saved.",
          );
      }
    };
    const timer = window.setInterval(() => {
      void poll();
    }, 2500);
    const resume = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      mounted.current = false;
      generation.current++;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [sessionKey, load]);
  const perform = useCallback(
    async (action: () => Promise<unknown>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      generation.current++;
      setBusy(true);
      setError("");
      try {
        await action();
        await load();
      } catch (cause) {
        if (mounted.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not complete this choice.",
          );
        throw cause;
      } finally {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [load],
  );
  const submit = (reply: CompanionAnswer) =>
    perform(() => answerCompanionGame(session, reply));
  const upgrade = (reply: CompanionAnswer) =>
    perform(() => upgradeCompanionDeck(session, reply));
  const note = (reply: CompanionAnswer) =>
    perform(() => sendCompanionVentNote(session, reply));
  const context: CompanionContext = useMemo(
    () => ({
      card: (code) => cardMap.get(companionCatalogCode(code)),
      ...(presentation
        ? {
            translate: companionTranslator(presentation.strings),
            scenarioSettings: (id: string) => presentation.scenarioSettings[id],
            campaignSettings: (id: string) => presentation.campaignSettings[id],
            sideStories: list(obj(presentation).sideStories).map(obj),
          }
        : {}),
    }),
    [cardMap, presentation],
  );
  const game: NativeGame = useMemo(() => {
    const raw = snapshot?.game || {};
    return {
      ...raw,
      scenario: raw.scenario ?? obj(raw.mode).That,
      campaign: raw.campaign ?? obj(raw.mode).This,
    };
  }, [snapshot]);
  const investigators = companionEntities(game, "investigators");
  const locations = companionEntities(game, "locations");
  const enemies = companionEntities(game, "enemies").filter(visible);
  const assets = companionEntities(game, "assets").filter(visible);
  const treacheries = companionEntities(game, "treacheries").filter(visible);
  const stories = companionEntities(game, "stories").filter(visible);
  const events = companionEntities(game, "events").filter(visible);
  const actor =
    investigators.find((i) => idOf(i) === selected) ||
    investigators.find((i) => idOf(i) === str(game.activeInvestigatorId)) ||
    investigators[0];
  const actorId = actor ? idOf(actor) : "";
  const scenario = obj(game.scenario ?? obj(game.mode).That);
  const phase = str(game.phase);
  const model = snapshot?.playerId
    ? companionQuestion(game, snapshot.playerId, context)
    : undefined;
  const handVisible =
    !!actor &&
    !!snapshot?.playerId &&
    (actor.playerId === snapshot.playerId || (!session.seatId && solo));
  const hand = handVisible ? list(actor?.hand).map(contents) : [];
  const personalAssets = actor
    ? assets.filter(
        (asset) =>
          (asset.controller === actorId || at(asset, actorId)) &&
          !str(placement(asset).tag).startsWith("AttachedTo"),
      )
    : [];
  const threats = actor
    ? [...treacheries, ...enemies].filter((entity) => at(entity, actorId))
    : [];
  const rail = [
    ...companionEntities(game, "agendas").map((entity) => ({
      entity,
      type: "agenda",
    })),
    ...companionEntities(game, "acts").map((entity) => ({
      entity,
      type: "act",
    })),
  ];
  const bag = list(obj(scenario.chaosBag).chaosTokens);
  const revealed = list(game.focusedChaosTokens).length
    ? list(game.focusedChaosTokens)
    : list(game.skillTestChaosTokens).length
      ? list(game.skillTestChaosTokens)
      : list(obj(game.skillTest).revealedChaosTokens);
  const activeTest = obj(game.skillTest);
  const encounterDiscard = list(scenario.discard).map(contents);
  const victory = list(scenario.victoryDisplay).map(contents);
  const inspectCard = useCallback(
    (rawCode: string, reverse = false) => {
      const code = companionCatalogCode(rawCode),
        card = cardMap.get(code);
      if (!card) return;
      if (
        catalogCodes.has(code) &&
        ["investigator", "asset", "event", "skill"].includes(card.type_code) &&
        !card.encounter_code
      ) {
        inspect(code);
        return;
      }
      const entity = [
        ...locations,
        ...enemies,
        ...assets,
        ...treacheries,
        ...stories,
        ...events,
        ...rail.map((entry) => entry.entity),
      ].find((candidate) => codeOf(candidate) === code);
      if (
        entity &&
        (entity.hidden === true ||
          entity.facedown === true ||
          str(placement(entity).tag) === "FacedownInThreatArea")
      )
        return;
      const sealed = card.type_code === "location" && entity?.revealed !== true;
      setNativeInspection({
        card,
        reverse: sealed || reverse || (!!entity && faceIsBack(entity)),
        sealed,
      });
    },
    [
      cardMap,
      catalogCodes,
      inspect,
      locations,
      enemies,
      assets,
      treacheries,
      stories,
      events,
      rail,
    ],
  );
  const title = name(scenario.name) || str(game.name) || "Your investigation";
  const layout = list(scenario.locationLayout).map((row) =>
    str(row).split(/\s+/).filter(Boolean),
  );
  const columns = Math.max(1, ...layout.map((row) => row.length));
  const layoutPosition = (
    location: NativeRecord,
  ): CSSProperties | undefined => {
    const row = layout.findIndex((entries) =>
      entries.includes(str(location.label)),
    );
    return row < 0
      ? undefined
      : {
          gridArea: `${row + 1} / ${layout[row].indexOf(str(location.label)) + 1}`,
        };
  };
  const attachments = (entity: NativeRecord) =>
    [...assets, ...events, ...treacheries, ...enemies].filter((child) => {
      const p = placement(child),
        parent = Array.isArray(p.contents) ? p.contents[0] : p.contents;
      return str(p.tag).startsWith("AttachedTo") && parent === idOf(entity);
    });
  const renderCard = (
    entity: NativeRecord,
    type?: string,
    key = idOf(entity),
  ) => (
    <NativeCard
      key={key}
      entity={entity}
      cards={cardMap}
      inspect={inspectCard}
      type={type}
    >
      {attachments(entity).length > 0 && (
        <details className="companion-attachments">
          <summary>{attachments(entity).length} attached card(s)</summary>
          <div className="companion-card-row">
            {attachments(entity).map((child) => (
              <NativeCard
                key={idOf(child)}
                entity={child}
                cards={cardMap}
                inspect={inspectCard}
              />
            ))}
          </div>
        </details>
      )}
      {list(entity.cardsUnderneath).length > 0 && (
        <details className="companion-attachments">
          <summary>
            {list(entity.cardsUnderneath).length} card(s) underneath
          </summary>
          <div className="companion-card-row">
            {list(entity.cardsUnderneath).map((raw, index) => {
              const child = contents(raw);
              return (
                <NativeCard
                  key={`${str(child.id)}-${index}`}
                  entity={child}
                  cards={cardMap}
                  inspect={inspectCard}
                  concealed={
                    codeOf(entity) === "barkham-010" &&
                    entity.playerId !== snapshot?.playerId &&
                    !solo
                  }
                />
              );
            })}
          </div>
        </details>
      )}
    </NativeCard>
  );

  useEffect(() => {
    const browser = window as Window & { render_game_to_text?: () => string };
    const previous = browser.render_game_to_text;
    const render = () =>
      JSON.stringify({
        phase,
        investigator: actor
          ? definition(actor, cardMap, "investigator").name
          : null,
        investigators: investigators.map((investigator) => ({
          name: definition(investigator, cardMap, "investigator").name,
          resources: num(tokenMap(investigator.tokens).Resource),
          clues: num(tokenMap(investigator.tokens).Clue),
          actions: num(investigator.remainingActions),
        })),
        locations: locations
          .filter((location) => location.revealed === true)
          .map((location) => ({
            name: definition(location, cardMap, "location").name,
            clues: num(tokenMap(location.tokens).Clue),
            enemies: enemies
              .filter((enemy) => at(enemy, idOf(location)))
              .map((enemy) =>
                enemy.facedown === true ||
                enemy.hidden === true ||
                str(placement(enemy).tag) === "FacedownInThreatArea"
                  ? "Facedown card"
                  : definition(enemy, cardMap, "enemy").name,
              ),
          })),
        decision: model
          ? {
              tag: model.tag,
              title: model.title,
              options: model.choices.map((choice) => ({
                index: choice.answerIndex,
                text: choice.label,
                disabled: choice.disabled,
              })),
              count: model.choices.length,
            }
          : null,
      });
    browser.render_game_to_text = render;
    return () => {
      if (browser.render_game_to_text === render) {
        if (previous) browser.render_game_to_text = previous;
        else Reflect.deleteProperty(browser, "render_game_to_text");
      }
    };
  }, [actor, cardMap, enemies, investigators, locations, model, phase]);

  return (
    <div className="in-game chronicle-companion-shell">
      <section
        className="game-page chronicle-companion-table"
        aria-label="Arkham Chronicle game table"
      >
        <header className="game-title">
          <div>
            <span className="eyebrow">
              ARKHAM CHRONICLE ·{" "}
              {words(str(scenario.difficulty)) || "INVESTIGATION"}
            </span>
            <h1>{title}</h1>
          </div>
          <div className="game-header-actions">
            <span className="autosaved">
              <CheckCircle size={15} />{" "}
              {busy ? "Saving…" : "Saved investigation"}
            </span>
            <button
              className="icon-button"
              onClick={() => setView("log")}
              aria-label="Read investigation log"
            >
              <BookOpen size={18} />
            </button>
            <button
              className="icon-button"
              disabled={busy || game.undoActionStep == null}
              onClick={() => {
                void perform(() => undoCompanionGame(session)).catch(() => {});
              }}
              aria-label="Undo last action"
            >
              <ArrowCounterClockwise size={18} />
            </button>
            <Button secondary onClick={onHome}>
              Close table
            </Button>
          </div>
        </header>
        {(error || catalogError) && (
          <div className="companion-error" role="alert">
            <p>{error || catalogError}</p>
            <Button
              secondary
              onClick={() => {
                if (catalogError) retryCatalog();
                void load().catch((cause) => setError(String(cause)));
              }}
            >
              Reconnect
            </Button>
          </div>
        )}
        {!snapshot ? (
          <p className="companion-loading" role="status">
            Opening your saved table…
          </p>
        ) : (
          <>
            <nav className="party-bar" aria-label="Investigator play areas">
              <div className="party-seats">
                {investigators.map((investigator, index) => {
                  const c = definition(investigator, cardMap, "investigator");
                  return (
                    <button
                      key={idOf(investigator)}
                      className={`seat ${actorId === idOf(investigator) ? "active" : ""}`}
                      onClick={() => setSelected(idOf(investigator))}
                      aria-pressed={actorId === idOf(investigator)}
                    >
                      <span className="seat-portrait">
                        {cardArt(c) ? (
                          <img src={thumbArt(cardArt(c))} alt="" />
                        ) : (
                          <StarFour />
                        )}
                      </span>
                      <span className="seat-copy">
                        <small>
                          {idOf(investigator) === str(game.activeInvestigatorId)
                            ? "TAKING A TURN"
                            : investigator.defeated
                              ? "DEFEATED"
                              : investigator.resigned
                                ? "RESIGNED"
                                : "INVESTIGATOR"}
                        </small>
                        <strong>{c.name}</strong>
                        <span>
                          {num(investigator.remainingActions)} actions ·{" "}
                          {num(tokenMap(investigator.tokens).Clue)} clues
                        </span>
                      </span>
                      <span className="seat-number">{index + 1}</span>
                    </button>
                  );
                })}
              </div>
            </nav>
            <div className="phase-track" aria-label="Current phase">
              {[
                "MythosPhase",
                "InvestigationPhase",
                "EnemyPhase",
                "UpkeepPhase",
              ].map((p, i) => (
                <div
                  key={p}
                  className={phase === p ? "active" : ""}
                  aria-current={phase === p ? "step" : undefined}
                >
                  <span>{i + 1}</span>
                  {p.replace("Phase", "")}
                </div>
              ))}
            </div>
            {obj(game.gameState).tag === "IsOver" && (
              <p className="companion-ended">
                This investigation has ended. Its story and final state are
                saved.
              </p>
            )}
            <div className="table-main">
              <div className="table-surface companion-surface">
                <aside
                  className="scenario-tray companion-story-rail"
                  aria-label="Agenda, act and story cards"
                >
                  <div className="table-zone-label">
                    <BookOpen size={13} /> THE STORY
                  </div>
                  {rail.map(({ entity, type }) => (
                    <div className="story-pile" key={`${type}-${idOf(entity)}`}>
                      <div className="pile-heading">
                        <span>{type.toUpperCase()}</span>
                        <span>
                          {printedValue(
                            entity.doomThreshold,
                            num(game.playerCount, 1),
                          ) !== "—" && type === "agenda"
                            ? `Threshold ${printedValue(entity.doomThreshold, num(game.playerCount, 1))}`
                            : ""}
                        </span>
                      </div>
                      {renderCard(entity, type)}
                    </div>
                  ))}
                  <div className="story-progress">
                    <TableToken kind="doom" value={num(game.totalDoom)} />
                    <span>Total doom</span>
                  </div>
                  <div className="story-progress">
                    <TableToken kind="clue" value={num(game.totalClues)} />
                    <span>Group clues</span>
                  </div>
                  {stories
                    .filter(
                      (story) =>
                        !["AtLocation", "AttachedToLocation"].includes(
                          str(placement(story).tag),
                        ),
                    )
                    .map((story) => renderCard(story, "story"))}
                </aside>
                <section className="companion-world" aria-label="Location map">
                  <div className="table-zone-label">
                    <MapPin size={13} /> THE INVESTIGATION
                  </div>
                  {!locations.length && (
                    <div className="companion-empty">
                      {game.inSetup === true
                        ? "Prepare your investigation using the choices below."
                        : "The story continues below."}
                    </div>
                  )}
                  <div
                    className={`companion-location-map ${layout.length ? "with-native-layout" : ""}`}
                    style={
                      layout.length
                        ? ({ "--companion-columns": columns } as CSSProperties)
                        : undefined
                    }
                  >
                    {locations.map((location) => {
                      const lid = idOf(location),
                        inhabitants = investigators.filter((i) => at(i, lid));
                      const nearby = [
                        ...enemies,
                        ...assets,
                        ...events,
                        ...treacheries,
                        ...stories,
                      ].filter((entity) => at(entity, lid));
                      const here = !!actor && at(actor, lid);
                      const sniffed = investigators.some(
                        (i) =>
                          codeOf(i) === "barkham-004" &&
                          list(obj(i.meta).sniffedLocations).includes(lid),
                      );
                      return (
                        <article
                          className={`companion-location ${here ? "current" : ""}`}
                          key={lid}
                          style={layoutPosition(location)}
                          aria-label={
                            location.revealed
                              ? definition(location, cardMap, "location").name
                              : "Unrevealed location"
                          }
                        >
                          <div className="companion-location-heading">
                            <span>{here ? "YOUR LOCATION" : "LOCATION"}</span>
                            {location.revealed === true && (
                              <span>
                                Shroud{" "}
                                {printedValue(
                                  location.currentShroud ?? location.shroud,
                                  num(game.playerCount, 1),
                                )}
                              </span>
                            )}
                          </div>
                          <NativeCard
                            entity={location}
                            cards={cardMap}
                            inspect={inspectCard}
                            type="location"
                            reverse={location.revealed !== true}
                          />
                          {sniffed && (
                            <span
                              className="companion-state-tag companion-sniffed"
                              title="Kate has used her ability at this location"
                            >
                              Sniffed
                            </span>
                          )}
                          {inhabitants.length > 0 && (
                            <div className="companion-inhabitants">
                              {inhabitants.map((i) => (
                                <button
                                  key={idOf(i)}
                                  onClick={() => setSelected(idOf(i))}
                                >
                                  <MapPin size={11} />{" "}
                                  {definition(i, cardMap, "investigator").name}
                                </button>
                              ))}
                            </div>
                          )}
                          {list(location.connectedLocations).length > 0 && (
                            <div className="companion-connections">
                              <HoverPreview
                                title="Connected locations"
                                text={list(location.connectedLocations)
                                  .map((id) => {
                                    const linked = locations.find(
                                      (l) => idOf(l) === id,
                                    );
                                    return linked?.revealed === true
                                      ? definition(linked, cardMap, "location")
                                          .name
                                      : "Unrevealed location";
                                  })
                                  .join(" · ")}
                              >
                                <details>
                                  <summary>
                                    <ArrowRight size={12} />
                                    {
                                      list(location.connectedLocations).length
                                    }{" "}
                                    connections
                                  </summary>
                                  <span>
                                    {list(location.connectedLocations)
                                      .map((id) => {
                                        const linked = locations.find(
                                          (l) => idOf(l) === id,
                                        );
                                        return linked?.revealed === true
                                          ? definition(
                                              linked,
                                              cardMap,
                                              "location",
                                            ).name
                                          : "Unrevealed location";
                                      })
                                      .join(" · ")}
                                  </span>
                                </details>
                              </HoverPreview>
                            </div>
                          )}
                          {nearby.length > 0 && (
                            <div className="companion-location-cards">
                              {nearby.map((entity) => renderCard(entity))}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  {enemies.filter(
                    (enemy) =>
                      !locations.some((loc) => at(enemy, idOf(loc))) &&
                      !investigators.some((i) => at(enemy, idOf(i))) &&
                      !str(placement(enemy).tag).startsWith("AttachedTo"),
                  ).length > 0 && (
                    <section className="companion-other-zone">
                      <h3>Enemies in play</h3>
                      <div className="companion-card-row">
                        {enemies
                          .filter(
                            (enemy) =>
                              !locations.some((loc) => at(enemy, idOf(loc))) &&
                              !investigators.some((i) => at(enemy, idOf(i))) &&
                              !str(placement(enemy).tag).startsWith(
                                "AttachedTo",
                              ),
                          )
                          .map((enemy) => renderCard(enemy, "enemy"))}
                      </div>
                    </section>
                  )}
                </section>
                <aside
                  className="supply-tray companion-supply"
                  aria-label="Encounter deck and chaos bag"
                >
                  <div className="table-zone-label">
                    <Stack size={13} /> THE MYTHOS
                  </div>
                  <div className="deck-pile companion-encounter-deck">
                    <img
                      src={CARD_BACKS.encounter}
                      alt="Encounter deck, facedown"
                    />
                    <span className="pile-count">
                      {num(
                        game.encounterDeckSize,
                        list(scenario.encounterDeck).length,
                      )}
                    </span>
                    <span className="deck-caption">Encounter deck</span>
                  </div>
                  <button
                    className="discard-pile"
                    onClick={() => setView("discard")}
                  >
                    <Stack size={22} />
                    <span className="deck-caption">
                      Discard · {encounterDiscard.length}
                    </span>
                  </button>
                  <button
                    className="chaos-bag-button"
                    aria-label="Inspect chaos bag"
                    onClick={() => setView("bag")}
                  >
                    <img src="/art/chaos-bag.webp" alt="" />
                    <span>
                      <strong>Chaos bag</strong>
                      <small>{bag.length} tokens</small>
                    </span>
                  </button>
                  <button
                    className="victory-button"
                    onClick={() => setView("victory")}
                  >
                    <StarFour size={15} /> Victory display{" "}
                    <b>{victory.length}</b>
                  </button>
                  {revealed.length > 0 && (
                    <div
                      className="companion-drawn-tokens"
                      aria-label="Revealed chaos tokens"
                    >
                      {revealed.map((token, index) => (
                        <Token key={index} token={chaosFace(token)} large />
                      ))}
                    </div>
                  )}
                </aside>
              </div>
              {actor && (
                <section
                  className="investigator-panel investigator-mat companion-investigator"
                  aria-label={`${definition(actor, cardMap, "investigator").name}'s play area`}
                >
                  <div className="investigator-identity">
                    <div className="mat-heading">
                      <span className="table-zone-label">
                        YOUR INVESTIGATOR
                      </span>
                      <span>{words(str(actor.class))}</span>
                    </div>
                    {renderCard(actor, "investigator")}
                    <SkillStats
                      values={[
                        "willpower",
                        "intellect",
                        "combat",
                        "agility",
                      ].map((skill) =>
                        num(
                          actor[
                            `current${skill[0].toUpperCase()}${skill.slice(1)}`
                          ] ?? actor[skill],
                        ),
                      )}
                    />
                    <small className="companion-stat-basis">
                      {["willpower", "intellect", "combat", "agility"].every(
                        (skill) =>
                          typeof actor[
                            `current${skill[0].toUpperCase()}${skill.slice(1)}`
                          ] === "number",
                      )
                        ? "Current skill values"
                        : "Printed skill values"}
                    </small>
                    <div className="companion-vitals">
                      <span>
                        Health{" "}
                        {Math.max(
                          0,
                          num(actor.currentHealth ?? actor.health) -
                            num(tokenMap(actor.tokens).Damage),
                        )}{" "}
                        / {num(actor.currentHealth ?? actor.health)}
                      </span>
                      <span>
                        Sanity{" "}
                        {Math.max(
                          0,
                          num(actor.currentSanity ?? actor.sanity) -
                            num(tokenMap(actor.tokens).Horror),
                        )}{" "}
                        / {num(actor.currentSanity ?? actor.sanity)}
                      </span>
                    </div>
                    {(actor.currentHealth == null ||
                      actor.currentSanity == null) &&
                      list(actor.modifiers).length > 0 && (
                        <small className="companion-stat-basis">
                          Printed limits · card effects apply
                        </small>
                      )}
                    <div
                      className="companion-action-pips"
                      aria-label={`${num(actor.remainingActions)} actions remaining`}
                    >
                      {Array.from(
                        { length: Math.max(3, num(actor.remainingActions)) },
                        (_, i) => (
                          <i
                            key={i}
                            className={
                              i < num(actor.remainingActions) ? "filled" : ""
                            }
                          />
                        ),
                      )}
                      <span>{num(actor.remainingActions)} actions</span>
                    </div>
                    {list(actor.modifiers).length > 0 && (
                      <details className="companion-modifiers">
                        <summary>Active card effects</summary>
                        {list(actor.modifiers).map((mod, i) => (
                          <span key={i}>
                            {words(str(obj(obj(mod).type).tag))}
                          </span>
                        ))}
                      </details>
                    )}
                  </div>
                  <div className="mat-assets">
                    <section className="assets-section">
                      <div className="zone-heading">
                        <h3>
                          Assets in play <span>{personalAssets.length}</span>
                        </h3>
                        <small className="exhaustion-note">
                          Turned sideways when exhausted
                        </small>
                      </div>
                      <div className="companion-card-row">
                        {personalAssets.map((asset) =>
                          renderCard(asset, "asset"),
                        )}
                      </div>
                    </section>
                    {threats.length > 0 && (
                      <section className="companion-threats">
                        <div className="zone-heading">
                          <h3>Your threat area</h3>
                        </div>
                        <div className="companion-card-row">
                          {threats.map((entity) =>
                            renderCard(entity, "treachery"),
                          )}
                        </div>
                      </section>
                    )}
                    {list(actor.events).length > 0 && (
                      <section className="companion-other-zone">
                        <h3>Events in play</h3>
                        <div className="companion-card-row">
                          {events
                            .filter((event) =>
                              list(actor.events).includes(idOf(event)),
                            )
                            .map((event) => renderCard(event, "event"))}
                        </div>
                      </section>
                    )}
                    <section className="companion-hand">
                      <div className="zone-heading">
                        <h3>
                          {handVisible ? "Your hand" : "Hand"}{" "}
                          <span>
                            {handVisible
                              ? hand.length
                              : num(actor.handSize, list(actor.hand).length)}
                          </span>
                        </h3>
                        <button
                          className="text-button"
                          onClick={() => setView("hand")}
                        >
                          Discard · {list(actor.discard).length}
                        </button>
                        <small>
                          Deck · {num(actor.deckSize, list(actor.deck).length)}
                        </small>
                      </div>
                      <div className="companion-hand-row">
                        {handVisible ? (
                          hand.map((card, index) =>
                            renderCard(card, "asset", `${idOf(card)}-${index}`),
                          )
                        ) : (
                          <p>
                            Only this investigator's player can view their hand.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                </section>
              )}
            </div>
            {game.skillTest && (
              <section
                className="companion-test"
                aria-label="Current skill test"
              >
                <h3>{words(str(activeTest.action)) || "Skill test"}</h3>
                <span>
                  Skill {num(activeTest.modifiedSkillValue)} vs difficulty{" "}
                  {num(activeTest.modifiedDifficulty)}
                </span>
                <span>{words(str(activeTest.step))}</span>
                <div>
                  {list(activeTest.committedCards).map((card, i) =>
                    renderCard(contents(card), "skill", String(i)),
                  )}
                </div>
              </section>
            )}
            <section
              className="companion-checkpoint"
              aria-label="Current decision"
              aria-busy={busy}
            >
              {model && snapshot ? (
                <CompanionDecision
                  key={`${model.playerId}:${model.questionVersion}:${model.tag}`}
                  game={game}
                  model={model}
                  context={context}
                  cards={cardMap}
                  busy={busy}
                  inspect={inspectCard}
                  submit={submit}
                  upgrade={upgrade}
                  note={note}
                  session={session}
                  options={options}
                />
              ) : (
                <p className="companion-waiting">
                  {Object.keys(obj(game.question)).length
                    ? "Waiting for the other investigator's choice."
                    : obj(game.gameState).tag === "IsOver"
                      ? "The investigation is complete."
                      : "Resolving the next step of your investigation…"}
                </p>
              )}
            </section>
          </>
        )}
        {view && (
          <Modal
            title={
              view === "bag"
                ? "The chaos bag"
                : view === "log"
                  ? "Investigation log"
                  : view === "victory"
                    ? "Victory display"
                    : view === "hand"
                      ? "Your discard pile"
                      : "Encounter discard"
            }
            onClose={() => setView(null)}
          >
            <div className="companion-modal-content">
              {view === "bag" ? (
                <div className="companion-bag-contents">
                  {bag.map((token, index) => (
                    <Token key={index} token={chaosFace(token)} large />
                  ))}
                </div>
              ) : view === "log" ? (
                <ol className="companion-log">
                  {list(game.log).map((entry, i) => (
                    <li key={i}>{plain(companionText(entry, context))}</li>
                  ))}
                </ol>
              ) : (
                <div className="companion-card-row">
                  {(view === "victory"
                    ? victory
                    : view === "discard"
                      ? encounterDiscard
                      : handVisible
                        ? list(actor?.discard).map(contents)
                        : []
                  ).map((entity, i) =>
                    renderCard(entity, undefined, `${idOf(entity)}-${i}`),
                  )}
                </div>
              )}
            </div>
          </Modal>
        )}
        {nativeInspection && (
          <Modal
            title={
              nativeInspection.sealed
                ? "Unrevealed location"
                : nativeInspection.card.name
            }
            onClose={() => setNativeInspection(null)}
          >
            <NativeInspection
              card={nativeInspection.card}
              reverse={nativeInspection.reverse}
              sealed={nativeInspection.sealed}
            />
          </Modal>
        )}
      </section>
    </div>
  );
}
