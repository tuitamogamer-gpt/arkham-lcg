import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { Card } from "../game/types";
import { Button, CardFace, RulesText, Token } from "./Common";
import {
  getCompanionDecks,
  parseServerDeck,
  type CompanionSession,
  type CompanionPlayOptions,
} from "../game/rulesServer";
import {
  buildAmountsAnswer,
  buildContinueAnswer,
  buildUpgradeStepAnswer,
  buildSideStoryAnswer,
  companionContinuation,
  buildChoiceAnswer,
  buildDeckAnswer,
  buildDeckListAnswer,
  buildDestinyAnswer,
  buildExchangeAnswer,
  buildOrderedAnswer,
  buildSettingsAnswer,
  buildSpiritDeckAnswer,
  buildTravelAnswer,
  buildUpgradeDeckRequest,
  buildVentNoteRequest,
  campaignSettingsForAnswer,
  companionCatalogCode,
  companionEntities,
  companionText,
  describeCompanionCost,
  initialCampaignSettings,
  normalizeCampaignSettings,
  relevantCampaignSettings,
  settingsActive,
  settingsCondition,
  standaloneSettingsForAnswer,
  standaloneSettingsState,
  validateCompanionAmounts,
  type CompanionAnswer,
  type CompanionChoice,
  type CompanionContext,
  type CompanionFlavor,
  type CompanionFlavorEntry,
  type CompanionQuestion,
  type CompanionSettingsState,
  type NativeGame,
  type NativeRecord,
} from "../game/companionProtocol";

const record = (v: unknown): NativeRecord =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as NativeRecord)
    : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const integer = (v: unknown, fallback = 0): number =>
  typeof v === "number" ? v : fallback;
const human = (v: unknown): string =>
  text(v)
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ");
const entityName = (v: NativeRecord): string =>
  text(record(v.name).title) || text(v.name) || text(v.id);
export interface CompanionDecisionProps {
  game: NativeGame;
  model: CompanionQuestion;
  context: CompanionContext;
  cards: ReadonlyMap<string, Card>;
  busy: boolean;
  inspect: (code: string) => void;
  submit: (reply: CompanionAnswer) => Promise<void>;
  upgrade: (request: CompanionAnswer) => Promise<void>;
  session: CompanionSession;
  /** Owner-scoped endpoint validates the current native Vent prompt. */
  note?: (request: CompanionAnswer) => Promise<void>;
  options?: CompanionPlayOptions;
}
/** A changed native question clears its old forms without answering anything. */
export function CompanionDecision(props: CompanionDecisionProps) {
  return (
    <DecisionForm
      key={`${props.model.playerId}:${props.model.questionVersion}:${JSON.stringify(props.model.raw)}`}
      {...props}
    />
  );
}
function Flavor({
  flavor,
  inspect,
}: {
  flavor?: CompanionFlavor;
  inspect: (code: string) => void;
}) {
  if (!flavor) return null;
  const entry = (e: CompanionFlavorEntry, index: number): ReactNode => {
    if (e.tag === "EntrySplit") return <hr key={index} />;
    if (e.tag === "HeaderEntry")
      return (
        <h4 key={index}>
          <RulesText text={e.text} />
        </h4>
      );
    if (e.tag === "CardEntry")
      return (
        <Button
          key={index}
          secondary
          onClick={() =>
            e.cardCode && inspect(companionCatalogCode(e.cardCode))
          }
        >
          {e.text || "Inspect card"}
        </Button>
      );
    if (e.tag === "ListEntry")
      return <ul key={index}>{e.children?.map(entry)}</ul>;
    if (e.tag === "ListItem")
      return <li key={index}>{e.children?.map(entry)}</li>;
    if (e.children)
      return (
        <div
          key={index}
          className={`companion-flavor-${e.tag.toLowerCase()} ${(e.modifiers ?? []).map((v) => `flavor-${v.toLowerCase()}`).join(" ")}`}
        >
          {e.modifiers?.includes("InvalidEntry") ? (
            <s>{e.children.map(entry)}</s>
          ) : (
            e.children.map(entry)
          )}
        </div>
      );
    if (e.token)
      return (
        <p key={index}>
          <Token token={tokenKey(e.token)} /> {e.text}
        </p>
      );
    return (
      <p key={index} className={e.tag === "InvalidEntry" ? "muted" : undefined}>
        <RulesText text={e.text} />
      </p>
    );
  };
  return (
    <div className="companion-narrative">
      {flavor.title && (
        <h3>
          <RulesText text={flavor.title} />
        </h3>
      )}
      {flavor.entries.map(entry)}
    </div>
  );
}
const tokenKey = (value: string) =>
  (
    ({
      AutoFail: "auto_fail",
      ElderSign: "elder_sign",
      ElderThing: "elder_thing",
      MinusOne: "−1",
      MinusTwo: "−2",
      MinusThree: "−3",
      MinusFour: "−4",
      MinusFive: "−5",
      MinusSix: "−6",
      MinusSeven: "−7",
      MinusEight: "−8",
      Zero: "0",
      PlusOne: "+1",
    }) as Record<string, string>
  )[value] ?? value.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
function DecisionForm({
  game,
  model,
  context,
  cards,
  busy,
  inspect,
  submit,
  upgrade,
  session,
  note,
}: CompanionDecisionProps) {
  const formId = useId(),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [amounts, setAmounts] = useState<Record<string, number>>(
    Object.fromEntries(model.amountChoices.map((v) => [v.id, v.min])),
  );
  const [exchange, setExchange] = useState(0),
    [preview, setPreview] = useState<number | null>(null);
  const [ordered, setOrdered] = useState<number[]>([]),
    [orderOpen, setOrderOpen] = useState(false);
  const [decks, setDecks] = useState<NativeRecord[]>([]),
    [deckId, setDeckId] = useState("");
  const [deck, setDeck] = useState<NativeRecord | undefined>(),
    [deckUrl, setDeckUrl] = useState("");
  const investigators = companionEntities(game, "investigators");
  const playerInvestigators = investigators.filter(
    (v) => v.playerId === model.playerId,
  );
  const [investigator, setInvestigator] = useState(
    text(playerInvestigators.length === 1 ? playerInvestigators[0].id : ""),
  );
  const [noteText, setNoteText] = useState("");
  const [spirit, setSpirit] = useState<string[]>([]);
  const [drawings, setDrawings] = useState<unknown[]>(
    structuredClone(model.drawings),
  );
  const sourceSchema = useMemo(
    () =>
      model.settings ??
      (model.tag === "PickScenarioSettings"
        ? context.scenarioSettings?.(
            text(record(game.scenario).id).replace(/^c/, ""),
          )
        : context.campaignSettings?.(text(record(game.campaign).id))),
    [model.settings, model.tag, context, game.scenario, game.campaign],
  );
  const [standalone, setStandalone] = useState<unknown[]>(
    structuredClone(list(sourceSchema)),
  );
  const campaignStepKey = JSON.stringify(record(game.campaign).step);
  const sections = useMemo(
    () => relevantCampaignSettings(list(sourceSchema), game),
    [sourceSchema, campaignStepKey],
  );
  const [campaign, setCampaign] = useState<CompanionSettingsState>(() =>
    initialCampaignSettings(sections),
  );
  useEffect(() => {
    setStandalone(structuredClone(list(sourceSchema)));
    setCampaign(initialCampaignSettings(sections));
  }, [sourceSchema, sections]);
  useEffect(() => {
    if (model.kind !== "deck") return;
    let active = true;
    getCompanionDecks(session)
      .then((v) => {
        if (active) setDecks(v.map(record));
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Saved decks could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [model.kind, session.gameId, session.seatId]);
  const locked = busy || pending;
  const perform = async (build: () => CompanionAnswer, route = submit) => {
    if (locked) return;
    setError("");
    setPending(true);
    try {
      await route(build());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "That decision could not be completed.",
      );
    } finally {
      setPending(false);
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setError("");
    try {
      if (file.size > 2_000_000)
        throw new Error("Choose a deck JSON file smaller than 2 MB.");
      setDeck(
        parseServerDeck(
          JSON.parse(await file.text()),
        ) as unknown as NativeRecord,
      );
    } catch (e) {
      setDeck(undefined);
      setError(e instanceof Error ? e.message : "The deck file is invalid.");
    }
  };
  const label = (v: unknown) =>
    text(v).startsWith("$") ? companionText(v, context) : human(v);
  const inspectCard = (code: string) => inspect(companionCatalogCode(code));
  const amountProblem = validateCompanionAmounts(model, amounts);
  const choiceButton = (choice: CompanionChoice) => (
    <div className="companion-choice" key={choice.answerIndex}>
      <Button
        disabled={locked || choice.disabled}
        title={choice.detail}
        onClick={() =>
          model.tag === "ChooseOneWizard"
            ? setPreview(choice.answerIndex)
            : void perform(() => buildChoiceAnswer(model, choice.answerIndex))
        }
      >
        {choice.token &&
          !["ComponentLabel", "AuxiliaryComponentLabel"].includes(
            choice.tag,
          ) && <Token token={tokenKey(choice.token)} />}
        {choice.tokens?.map((v, i) => (
          <Token key={i} token={tokenKey(v)} />
        ))}
        <span>
          <RulesText text={choice.label} />
          {choice.detail && (
            <small>
              <RulesText text={choice.detail} />
            </small>
          )}
        </span>
      </Button>
      {!!choice.cost && (
        <span className="companion-cost">
          {describeCompanionCost(choice.cost, game, context)}
        </span>
      )}
      {choice.cardCode && (
        <Button
          secondary
          disabled={locked}
          onClick={() => inspectCard(choice.cardCode!)}
        >
          Inspect
        </Button>
      )}
      <Flavor
        flavor={
          choice.flavor && model.tag !== "ChooseOneWizard"
            ? choice.flavor
            : undefined
        }
        inspect={inspect}
      />
    </div>
  );
  let controls: ReactNode;
  if (model.kind === "choices") {
    const instructions: Record<string, string> = {
      ChooseN: `Choose ${model.amount ?? "the required number of"} options.`,
      ChooseUpToN: `Choose up to ${model.amount ?? "the allowed number of"} options.`,
      ChooseSome: "Choose any available options, then finish.",
      ChooseSome1: "Choose at least one option, then finish.",
      ChooseOneFromEach: "Choose one option from each group.",
      ChooseOneAtATime: "Choose each card in order.",
      ChooseOneAtATimeWithAuto:
        "Choose each card in order, or use the automatic order.",
    };
    const readKind = text(record(model.question.readChoices).tag);
    const groups = [...new Set(model.choices.map((c) => c.group))];
    controls = (
      <>
        {instructions[model.tag] && (
          <p>
            {instructions[model.tag]}
            {model.orderDirection === "bottom-first" &&
              " Select the bottom card first; the last card ends on top."}
          </p>
        )}
        {model.tag === "Read" && model.amount !== undefined && (
          <p>
            {readKind === "BasicReadChoicesUpToN" ? "Choose up to" : "Choose"}{" "}
            {model.amount} options.
          </p>
        )}
        {model.tag === "PickSupplies" && (
          <p>
            <strong>{model.pointsRemaining} supply points remaining</strong>
            {model.chosenSupplies.length > 0 &&
              ` · Taken: ${model.chosenSupplies.map(human).join(", ")}`}
            {model.resupply && " · Resupply"}
          </p>
        )}
        {model.tag === "ChooseOneWizard" && preview !== null ? (
          <>
            <Flavor
              flavor={
                model.choices.find((c) => c.answerIndex === preview)?.flavor
              }
              inspect={inspect}
            />
            <div className="companion-actions">
              <Button
                disabled={locked}
                onClick={() =>
                  void perform(() => buildChoiceAnswer(model, preview))
                }
              >
                {companionText(model.question.confirmLabel, context) ||
                  "Confirm this path"}
              </Button>
              <Button
                secondary
                disabled={locked}
                onClick={() => setPreview(null)}
              >
                {companionText(model.question.backLabel, context) ||
                  "Back to choices"}
              </Button>
            </div>
          </>
        ) : (
          <>
            {groups.length > 1 ? (
              groups.map((g) => (
                <fieldset key={g ?? "ungrouped"}>
                  <legend>Group {g === undefined ? "" : g + 1}</legend>
                  {model.choices.filter((c) => c.group === g).map(choiceButton)}
                </fieldset>
              ))
            ) : (
              <div className="companion-choices">
                {model.choices.map(choiceButton)}
              </div>
            )}
            {model.canOrder && (
              <>
                <Button
                  secondary
                  disabled={locked}
                  onClick={() => {
                    setOrderOpen((v) => !v);
                    setOrdered([]);
                  }}
                >
                  Arrange the complete order
                </Button>
                {orderOpen && (
                  <fieldset>
                    <legend>
                      {model.orderDirection === "bottom-first"
                        ? "Bottom to top"
                        : "Resolution order"}
                    </legend>
                    <ol>
                      {ordered.map((n, i) => (
                        <li key={n}>
                          {
                            model.choices[
                              n +
                                (model.tag === "ChooseOneAtATimeWithAuto"
                                  ? 1
                                  : 0)
                            ]?.label
                          }
                          <Button
                            secondary
                            disabled={locked}
                            onClick={() =>
                              setOrdered((v) => v.filter((x) => x !== n))
                            }
                          >
                            Remove position {i + 1}
                          </Button>
                        </li>
                      ))}
                    </ol>
                    {model.choices
                      .filter(
                        (c) =>
                          !(
                            model.tag === "ChooseOneAtATimeWithAuto" &&
                            c.answerIndex === 0
                          ),
                      )
                      .map((c) => {
                        const i =
                          c.answerIndex -
                          (model.tag === "ChooseOneAtATimeWithAuto" ? 1 : 0);
                        return (
                          <Button
                            secondary
                            key={i}
                            disabled={
                              locked || ordered.includes(i) || c.disabled
                            }
                            onClick={() => setOrdered((v) => [...v, i])}
                          >
                            {c.label}
                          </Button>
                        );
                      })}
                    <Button
                      disabled={
                        locked ||
                        ordered.length !==
                          model.choices.length -
                            (model.tag === "ChooseOneAtATimeWithAuto" ? 1 : 0)
                      }
                      onClick={() =>
                        void perform(() => buildOrderedAnswer(model, ordered))
                      }
                    >
                      Confirm complete order
                    </Button>
                  </fieldset>
                )}
              </>
            )}
          </>
        )}
      </>
    );
  } else if (model.kind === "amounts")
    controls = (
      <>
        {model.amountChoices.map((row) => (
          <label className="companion-field" key={row.id}>
            {row.label}
            <input
              type="number"
              inputMode="numeric"
              disabled={locked}
              min={row.min}
              max={row.max}
              step={1}
              value={amounts[row.id] ?? 0}
              onChange={(e) =>
                setAmounts((v) => ({ ...v, [row.id]: e.target.valueAsNumber }))
              }
            />
            <small>
              {row.min}–{row.max}
            </small>
          </label>
        ))}
        <p role="status">
          {amountProblem ||
            `Total: ${Object.values(amounts).reduce((a, b) => a + b, 0)}`}
        </p>
        <Button
          disabled={locked || !!amountProblem}
          onClick={() => void perform(() => buildAmountsAnswer(model, amounts))}
        >
          Confirm amounts
        </Button>
      </>
    );
  else if (model.kind === "exchange" && model.exchange) {
    const x = model.exchange,
      from = entityName(
        investigators.find((v) => v.id === x.from) ?? { id: x.from },
      ),
      to = entityName(investigators.find((v) => v.id === x.to) ?? { id: x.to });
    controls = (
      <>
        <p>
          {from}: {x.fromAmount} {human(x.token)} · {to}: {x.toAmount}{" "}
          {human(x.token)}
        </p>
        <label className="companion-field">
          Transfer amount
          <input
            disabled={locked}
            type="number"
            step={1}
            min={-x.toAmount}
            max={x.fromAmount}
            value={exchange}
            onChange={(e) => setExchange(e.target.valueAsNumber)}
          />
        </label>
        <p>
          {exchange >= 0
            ? `${from} gives ${exchange} to ${to}`
            : `${to} gives ${-exchange} to ${from}`}
        </p>
        <Button
          disabled={
            locked ||
            !Number.isSafeInteger(exchange) ||
            exchange > x.fromAmount ||
            -exchange > x.toAmount
          }
          onClick={() =>
            void perform(() => buildExchangeAnswer(model, exchange))
          }
        >
          Confirm exchange
        </Button>
      </>
    );
  } else if (model.kind === "deck" || model.kind === "upgrade")
    controls = (
      <>
        {model.kind === "deck" && (
          <>
            <label className="companion-field">
              Saved deck
              <select
                aria-label="Saved deck"
                value={deckId}
                disabled={locked}
                onChange={(e) => setDeckId(e.target.value)}
              >
                <option value="">Choose a deck…</option>
                {decks.map((d) => {
                  const code = text(
                      record(d.playList ?? d.list).investigator_code,
                    ),
                    used = model.usedInvestigators.includes(
                      code.replace(/^c/, ""),
                    );
                  return (
                    <option value={text(d.id)} key={text(d.id)} disabled={used}>
                      {text(d.name)}
                      {used ? " — investigator already in use" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <Button
              disabled={locked || !deckId}
              onClick={() => void perform(() => buildDeckAnswer(model, deckId))}
            >
              Use saved deck
            </Button>
          </>
        )}
        {model.kind === "upgrade" && (
          <label className="companion-field">
            Investigator
            <select
              aria-label="Investigator"
              disabled={locked}
              value={investigator}
              onChange={(e) => setInvestigator(e.target.value)}
            >
              <option value="">Choose investigator…</option>
              {playerInvestigators.map((v) => (
                <option key={text(v.id)} value={text(v.id)}>
                  {entityName(v)} · {integer(v.xp)} XP
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="companion-field">
          Import an ArkhamDB deck JSON file
          <input
            type="file"
            accept="application/json,.json"
            disabled={locked}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
        {deck && (
          <p>
            <strong>{text(deck.name)}</strong> ·{" "}
            {context.card?.(companionCatalogCode(text(deck.investigator_code)))
              ?.name || text(deck.investigator_code)}{" "}
            ·{" "}
            {Object.values(record(deck.slots)).reduce<number>(
              (a, b) => a + integer(b),
              0,
            )}{" "}
            cards
          </p>
        )}
        <Button
          disabled={
            locked || !deck || (model.kind === "upgrade" && !investigator)
          }
          onClick={() =>
            void perform(
              () =>
                model.kind === "deck"
                  ? buildDeckListAnswer(model, deck!)
                  : buildUpgradeDeckRequest(model, investigator, deck),
              model.kind === "upgrade" ? upgrade : submit,
            )
          }
        >
          Use imported deck
        </Button>
        {model.kind === "upgrade" && (
          <>
            <label className="companion-field">
              ArkhamDB deck URL
              <input
                disabled={locked}
                type="url"
                value={deckUrl}
                onChange={(e) => setDeckUrl(e.target.value)}
                placeholder="https://arkhamdb.com/deck/view/…"
              />
            </label>
            <Button
              disabled={
                locked ||
                !investigator ||
                !/^https:\/\/arkhamdb\.com\/deck(?:list)?\/view\/\d+/.test(
                  deckUrl,
                )
              }
              onClick={() =>
                void perform(
                  () =>
                    buildUpgradeDeckRequest(
                      model,
                      investigator,
                      undefined,
                      deckUrl,
                    ),
                  upgrade,
                )
              }
            >
              Load upgraded deck
            </Button>
            <Button
              secondary
              disabled={locked || !investigator}
              onClick={() =>
                void perform(
                  () => buildUpgradeDeckRequest(model, investigator),
                  upgrade,
                )
              }
            >
              Keep this investigator’s current deck
            </Button>
          </>
        )}
      </>
    );
  else if (model.kind === "specific") {
    const payload = record(model.specific?.payload);
    if (model.specific?.key === "epicLabyrinth.note")
      controls = (
        <>
          <label className="companion-field">
            Private note through the Vent
            <textarea
              maxLength={4000}
              rows={5}
              disabled={locked}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
          </label>
          <small>{noteText.length}/4000 characters</small>
          <Button
            disabled={locked || !note}
            onClick={() =>
              note &&
              void perform(() => buildVentNoteRequest(model, noteText), note)
            }
          >
            Place the note in the Vent
          </Button>
          {!note && <p>The note connection is still loading.</p>}
        </>
      );
    else if (model.specific?.key === "laidToRest.buildSpiritDeck")
      controls = (
        <>
          <p>
            Choose exactly {integer(payload.count)} different spirit cards.
            Selected: {spirit.length}.
          </p>
          <div className="companion-spirit-grid">
            {list(payload.cardCodes).map((v) => {
              const code = text(v),
                c = cards.get(companionCatalogCode(code));
              return (
                <div key={code}>
                  {c && (
                    <CardFace c={c} compact onClick={() => inspectCard(code)} />
                  )}
                  <label>
                    <input
                      type="checkbox"
                      disabled={
                        locked ||
                        (!spirit.includes(code) &&
                          spirit.length >= integer(payload.count))
                      }
                      checked={spirit.includes(code)}
                      onChange={() =>
                        setSpirit((v) =>
                          v.includes(code)
                            ? v.filter((x) => x !== code)
                            : [...v, code],
                        )
                      }
                    />
                    {c?.name || code}
                  </label>
                </div>
              );
            })}
          </div>
          {list(payload.fixed).length > 0 && (
            <p>
              Always included:{" "}
              {list(payload.fixed)
                .map(
                  (v) =>
                    context.card?.(companionCatalogCode(text(v)))?.name ||
                    text(v),
                )
                .join(", ")}
            </p>
          )}
          <Button
            disabled={locked || spirit.length !== payload.count}
            onClick={() =>
              void perform(() => buildSpiritDeckAnswer(model, spirit))
            }
          >
            Build spirit deck
          </Button>
        </>
      );
    else if (model.specific?.key === "embark")
      controls = (
        <div className="companion-travel">
          <p>Current destination: {label(payload.current)}</p>
          {list(payload.locations).map((v) => {
            const pair = list(v),
              destination = text(pair[0]),
              data = record(pair[1]),
              green = [
                "Arkham",
                "Cairo",
                "NewOrleans",
                "Venice",
                "MonteCarlo",
              ].includes(destination),
              days = integer(data.travel) + (green ? 1 : 0),
              available = list(payload.available).includes(destination),
              current = destination === payload.current;
            return (
              <fieldset key={destination}>
                <legend>
                  {companionText(
                    `$theScarletKeys.locations.${destination}.name`,
                    context,
                  ).startsWith("[")
                    ? label(destination)
                    : companionText(
                        `$theScarletKeys.locations.${destination}.name`,
                        context,
                      )}
                </legend>
                <p>
                  {current
                    ? "You are here"
                    : `${days} travel time${available ? "" : " · stop locked"}`}
                </p>
                {!current && (
                  <div className="companion-actions">
                    <Button
                      disabled={locked || !available}
                      onClick={() =>
                        void perform(() =>
                          buildTravelAnswer(model, destination, "travel"),
                        )
                      }
                    >
                      Travel here
                    </Button>
                    <Button
                      secondary
                      disabled={locked}
                      onClick={() =>
                        void perform(() =>
                          buildTravelAnswer(model, destination, "travelVia"),
                        )
                      }
                    >
                      Travel without stopping
                    </Button>
                    {payload.hasTicket === true && days > 1 && (
                      <Button
                        secondary
                        disabled={locked || !available}
                        onClick={() =>
                          void perform(() =>
                            buildTravelAnswer(
                              model,
                              destination,
                              "travelWithTicket",
                            ),
                          )
                        }
                      >
                        Use expedited ticket
                      </Button>
                    )}
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>
      );
    else
      controls = (
        <p role="alert">
          This scenario requests an unrecognized decision ({model.specific?.key}
          ). Its question is preserved.
        </p>
      );
  } else if (model.kind === "destiny")
    controls = (
      <>
        <p>Turn exactly {Math.ceil(drawings.length / 2)} cards upside down.</p>
        {drawings.map((v, i) => {
          const d = record(v),
            tarot = record(d.tarot);
          return (
            <label className="companion-field" key={i}>
              {label(d.scenario)} · {label(tarot.arcana)}
              <select
                aria-label={`${label(d.scenario)} · ${label(tarot.arcana)}`}
                disabled={locked}
                value={text(tarot.facing)}
                onChange={(e) =>
                  setDrawings((prev) =>
                    prev.map((x, j) =>
                      i === j
                        ? {
                            ...record(x),
                            tarot: {
                              ...record(record(x).tarot),
                              facing: e.target.value,
                            },
                          }
                        : x,
                    ),
                  )
                }
              >
                <option value="Upright">Upright</option>
                <option value="Reversed">Reversed</option>
              </select>
            </label>
          );
        })}
        <Button
          disabled={
            locked ||
            drawings.filter(
              (v) => record(record(v).tarot).facing === "Reversed",
            ).length !== Math.ceil(drawings.length / 2)
          }
          onClick={() =>
            void perform(() => buildDestinyAnswer(model, drawings))
          }
        >
          Confirm destiny
        </Button>
      </>
    );
  else if (model.kind === "settings") {
    const activeState =
      model.tag === "PickScenarioSettings"
        ? standaloneSettingsState(standalone)
        : normalizeCampaignSettings(sections, campaign);
    const renderStandalone = (
      values: readonly unknown[],
      path: number[] = [],
    ): ReactNode =>
      values.map((v, i) => {
        const s = record(v),
          p = [...path, i],
          type = text(s.type),
          key = p.join("."),
          title = label(s.label ?? s.key);
        if (!settingsActive(s, activeState, standalone)) return null;
        const update = (change: NativeRecord) =>
          setStandalone((prev) => changeSetting(prev, p, change));
        if (type === "Group")
          return (
            <fieldset key={key}>
              <legend>{title}</legend>
              {renderStandalone(list(s.content), p)}
            </fieldset>
          );
        if (type === "ToggleKey" || type === "ToggleOption")
          return (
            <label key={key}>
              <input
                disabled={locked}
                type="checkbox"
                checked={s.content === true}
                onChange={(e) => update({ content: e.target.checked })}
              />
              {title}
            </label>
          );
        if (type === "ChooseNum")
          return (
            <label className="companion-field" key={key}>
              {title}
              <input
                disabled={locked}
                type="number"
                min={integer(s.min)}
                max={integer(s.max)}
                step={1}
                value={integer(s.content)}
                onChange={(e) => update({ content: e.target.valueAsNumber })}
              />
            </label>
          );
        if (
          type === "PickKey" ||
          type === "ChooseRecord" ||
          type === "SetPartnerKilled"
        ) {
          const options =
            type === "PickKey"
              ? list(s.keys)
              : type === "ChooseRecord"
                ? list(s.content).map((v) => record(v).key)
                : [
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
          const current = type === "ChooseRecord" ? s.selected : s.content;
          return (
            <label className="companion-field" key={key}>
              {title}
              <select
                aria-label={title}
                disabled={locked}
                value={text(current)}
                onChange={(e) =>
                  update(
                    type === "ChooseRecord"
                      ? { selected: e.target.value || null }
                      : { content: e.target.value || null },
                  )
                }
              >
                <option value="">None selected</option>
                {options.map((v) => (
                  <option value={text(v)} key={text(v)}>
                    {context.card?.(companionCatalogCode(text(v)))?.name ||
                      label(v)}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        if (type === "ToggleRecords" || type === "ToggleCrossedOut")
          return (
            <fieldset key={key}>
              <legend>
                {title}
                {type === "ToggleCrossedOut" ? " · crossed out" : ""}
              </legend>
              {list(s.content).map((v, j) => {
                const row = record(v);
                if (!settingsActive(row, activeState, standalone)) return null;
                return (
                  <label key={j}>
                    <input
                      disabled={locked}
                      type="checkbox"
                      checked={row.content === true}
                      onChange={(e) =>
                        update({
                          content: list(s.content).map((x, k) =>
                            j === k
                              ? { ...record(x), content: e.target.checked }
                              : x,
                          ),
                        })
                      }
                    />
                    {label(row.label ?? row.key)}
                  </label>
                );
              })}
            </fieldset>
          );
        if (type === "SetPartnerDetails")
          return (
            <fieldset key={key}>
              <legend>{title}</legend>
              {(["damage", "horror"] as const).map((token) => (
                <label className="companion-field" key={token}>
                  {human(token)}
                  <input
                    disabled={locked}
                    type="number"
                    min={0}
                    max={integer(
                      token === "damage" ? s.maxDamage : s.maxHorror,
                    )}
                    step={1}
                    value={integer(record(s.content)[token])}
                    onChange={(e) =>
                      update({
                        content: {
                          ...record(s.content),
                          [token]: e.target.valueAsNumber,
                        },
                      })
                    }
                  />
                </label>
              ))}
              <label className="companion-field">
                Status
                <select
                  aria-label={`${title}: Status`}
                  disabled={locked}
                  value={text(record(s.content).status)}
                  onChange={(e) =>
                    update({
                      content: { ...record(s.content), status: e.target.value },
                    })
                  }
                >
                  {[
                    "Safe",
                    "Resolute",
                    "Eliminated",
                    "Mia",
                    "Victim",
                    "CannotTake",
                    "TheEntity",
                  ].map((v) => (
                    <option value={v} key={v}>
                      {human(v)}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          );
        return (
          <p role="alert" key={key}>
            Unrecognized setting: {type}
          </p>
        );
      });
    const renderCampaign = (section: NativeRecord): ReactNode => {
      if (!settingsActive(section, activeState)) return null;
      const scope = text(section.key);
      const change = (s: NativeRecord, value: unknown, selected = true) =>
        setCampaign((prev) => changeCampaign(prev, s, scope, value, selected));
      return (
        <fieldset key={scope}>
          <legend>{label(scope)}</legend>
          {list(section.settings).map((v, i) => {
            const s = record(v),
              type = text(s.type),
              key = text(s.ckey ?? s.key),
              title = label(s.key);
            if (!settingsActive(s, activeState)) return null;
            if (type === "ForceKey" || type === "ForceRecorded")
              return (
                <label key={i}>
                  <input type="checkbox" checked disabled />
                  {title} · required
                </label>
              );
            if (type === "ChooseNum")
              return (
                <label className="companion-field" key={i}>
                  {title}
                  <input
                    disabled={locked}
                    type="number"
                    step={1}
                    min={integer(s.min)}
                    max={typeof s.max === "number" ? s.max : undefined}
                    value={activeState.counts[key] ?? 0}
                    onChange={(e) => change(s, e.target.valueAsNumber)}
                  />
                </label>
              );
            if (
              type === "SetKey" ||
              type === "Option" ||
              type === "SetRecordable"
            ) {
              const selected =
                type === "SetKey"
                  ? activeState.keys.some(
                      (v) => v.key === key && v.scope === scope,
                    )
                  : type === "Option"
                    ? activeState.options.some((v) => v.key === s.key)
                    : (activeState.sets[key]?.entries.some(
                        (v) => v.value === s.content,
                      ) ?? false);
              return (
                <label key={i}>
                  <input
                    disabled={locked}
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => change(s, s.content, e.target.checked)}
                  />
                  {title}
                </label>
              );
            }
            const options = list(s.content).map(record),
              forced =
                type === "ChooseKey"
                  ? options.filter(
                      (v) =>
                        v.forceWhen &&
                        settingsCondition(v.forceWhen, activeState),
                    )
                  : [];
            return (
              <fieldset key={i}>
                <legend>
                  {title}
                  {type === "CrossOut" ? " · crossed out" : ""}
                </legend>
                {options
                  .filter((v) => settingsActive(v, activeState))
                  .map((v, j) => {
                    const value =
                      type === "ChooseKey" || type === "ChooseOption"
                        ? v.key
                        : v.content;
                    const selected =
                      type === "ChooseKey"
                        ? activeState.keys.some(
                            (k) => k.key === value && k.scope === scope,
                          )
                        : type === "ChooseOption"
                          ? activeState.options.some((k) => k.key === value)
                          : (activeState.sets[key]?.entries.some(
                              (k) =>
                                k.value === value &&
                                (type !== "CrossOut" || k.tag === "CrossedOut"),
                            ) ?? false);
                    return (
                      <label key={j}>
                        <input
                          type={
                            [
                              "ChooseKey",
                              "ChooseOption",
                              "ChooseRecordable",
                            ].includes(type)
                              ? "radio"
                              : "checkbox"
                          }
                          name={`${formId}-${scope}-${i}`}
                          disabled={
                            locked || (forced.length > 0 && !forced.includes(v))
                          }
                          checked={selected}
                          onChange={(e) => change(s, value, e.target.checked)}
                        />
                        {label(v.key)}
                      </label>
                    );
                  })}
              </fieldset>
            );
          })}
        </fieldset>
      );
    };
    controls =
      sourceSchema === undefined ? (
        <p>Loading printed campaign settings…</p>
      ) : (
        <>
          {model.tag === "PickScenarioSettings"
            ? renderStandalone(standalone)
            : sections.map(renderCampaign)}
          <Button
            disabled={locked}
            onClick={() =>
              void perform(() =>
                buildSettingsAnswer(
                  model,
                  model.tag === "PickScenarioSettings"
                    ? standaloneSettingsForAnswer(standalone)
                    : campaignSettingsForAnswer(sections, campaign),
                ),
              )
            }
          >
            Begin with these settings
          </Button>
        </>
      );
  } else if (model.kind === "continue") {
    const continuation = companionContinuation(model);
    const next = record(continuation.nextStep),
      completed = list(record(game.campaign).completedSteps);
    const sideStories = (context.sideStories ?? []).flatMap((s) =>
      eligibleSideStory(s, game),
    );
    const nextLabel = label(next.tag).replace(/ Step$/, ""),
      scenarioCode = text(
        next.tag === "ScenarioStep" ? next.contents : list(next.contents)[0],
      ).replace(/^c/, "");
    controls = (
      <>
        <p>
          Next:{" "}
          {scenarioCode
            ? context.card?.(companionCatalogCode(scenarioCode))?.name ||
              scenarioCode
            : nextLabel}
        </p>
        {scenarioCode && investigators.length > 1 && (
          <label className="companion-field">
            Lead investigator
            <select
              aria-label="Lead investigator"
              value={investigator}
              disabled={locked}
              onChange={(e) => setInvestigator(e.target.value)}
            >
              <option value="">Choose lead investigator…</option>
              {investigators
                .filter((v) => !v.killed && !v.drivenInsane)
                .map((v) => (
                  <option key={text(v.id)} value={text(v.id)}>
                    {entityName(v)}
                  </option>
                ))}
            </select>
          </label>
        )}
        {!continuation.chooseSideStory && (
          <Button
            disabled={
              locked ||
              !next.tag ||
              (!!scenarioCode && investigators.length > 1 && !investigator)
            }
            onClick={() =>
              void perform(() =>
                buildContinueAnswer(model, investigator || undefined),
              )
            }
          >
            Continue
          </Button>
        )}
        {continuation.canUpgradeDecks && completed.length > 0 && (
          <Button
            secondary
            disabled={locked}
            onClick={() => void perform(() => buildUpgradeStepAnswer(model))}
          >
            Upgrade decks first
          </Button>
        )}
        {continuation.canChooseSideStory && sideStories.length > 0 && (
          <fieldset>
            <legend>Add a side story</legend>
            {sideStories.map((s) => (
              <Button
                secondary
                disabled={locked}
                key={text(s.id)}
                onClick={() =>
                  void perform(() => buildSideStoryAnswer(model, text(s.id)))
                }
              >
                {text(s.name)} · {integer(s.xp)} {s.usesTime ? "time" : "XP"}
                {!!s.requiredInvestigator && (
                  <small>
                    {text(s.requiredInvestigator)} pays {integer(s.xp)} XP; each
                    other investigator pays 1 XP.
                  </small>
                )}
                {list(s.deckRequirements).map((v, i) => (
                  <small key={i}>
                    <RulesText text={text(v)} />
                  </small>
                ))}
              </Button>
            ))}
          </fieldset>
        )}
      </>
    );
  } else
    controls = (
      <p role="alert">
        The engine requests a decision this client cannot yet display (
        {model.tag}). The pending question is preserved.
      </p>
    );
  return (
    <section
      className="companion-decision"
      aria-labelledby={`${formId}-title`}
      aria-busy={locked}
    >
      <header>
        <span className="eyebrow">YOUR DECISION</span>
        <h3 id={`${formId}-title`}>
          <RulesText text={model.title} />
        </h3>
        {model.tooltip && (
          <p>
            <RulesText text={model.tooltip} />
          </p>
        )}
      </header>
      {model.cardCode && (
        <Button secondary onClick={() => inspectCard(model.cardCode!)}>
          Inspect source card
        </Button>
      )}
      {model.costs.length > 0 && (
        <div className="companion-costs">
          <strong>Payment required:</strong>
          {model.costs.map((v, i) => (
            <span key={i}>{describeCompanionCost(v, game, context)}</span>
          ))}
        </div>
      )}
      <Flavor flavor={model.flavor} inspect={inspect} />
      {model.readCards.length > 0 && (
        <div className="companion-read-cards">
          {model.readCards.map((code) => (
            <Button secondary key={code} onClick={() => inspectCard(code)}>
              {context.card?.(companionCatalogCode(code))?.name || code}
            </Button>
          ))}
        </div>
      )}
      <div className="companion-decision-controls">{controls}</div>
      {error && (
        <p role="alert" className="companion-error">
          {error}
        </p>
      )}
    </section>
  );
}
function changeSetting(
  values: readonly unknown[],
  path: number[],
  change: NativeRecord,
): unknown[] {
  return values.map((v, i) =>
    i === path[0]
      ? path.length === 1
        ? { ...record(v), ...change }
        : {
            ...record(v),
            content: changeSetting(
              list(record(v).content),
              path.slice(1),
              change,
            ),
          }
      : v,
  );
}
function changeCampaign(
  input: CompanionSettingsState,
  s: NativeRecord,
  scope: string,
  value: unknown,
  selected: boolean,
): CompanionSettingsState {
  const state = structuredClone(input),
    type = text(s.type),
    key = text(s.ckey ?? s.key);
  if (type === "ChooseNum") state.counts[key] = integer(value, NaN);
  if (type === "ChooseKey")
    state.keys = [
      ...state.keys.filter(
        (v) =>
          !(
            v.scope === scope &&
            list(s.content).some((o) => record(o).key === v.key)
          ),
      ),
      { key: text(value), scope },
    ];
  if (type === "SetKey")
    state.keys = [
      ...state.keys.filter((v) => !(v.key === key && v.scope === scope)),
      ...(selected ? [{ key, scope }] : []),
    ];
  if (type === "Option")
    state.options = [
      ...state.options.filter((v) => v.key !== s.key),
      ...(selected ? [{ key: text(s.key), ckey: text(s.ckey) }] : []),
    ];
  if (type === "ChooseOption")
    state.options = [
      ...state.options.filter(
        (v) => !list(s.content).some((o) => record(o).key === v.key),
      ),
      { key: text(value), ckey: text(value) },
    ];
  if (
    [
      "CrossOut",
      "Record",
      "SetRecordable",
      "ChooseRecordable",
      "ChooseRecordables",
    ].includes(type)
  ) {
    const entries = state.sets[key]?.entries ?? [],
      candidate = type === "SetRecordable" ? s.content : value;
    state.sets[key] = {
      recordable: text(s.recordable),
      entries:
        type === "CrossOut"
          ? entries.map((v) =>
              v.value === candidate
                ? { ...v, tag: selected ? "CrossedOut" : "Recorded" }
                : v,
            )
          : [
              ...(type === "ChooseRecordable"
                ? entries.filter(
                    (v) =>
                      !list(s.content).some(
                        (o) => record(o).content === v.value,
                      ),
                  )
                : entries.filter((v) => v.value !== candidate)),
              ...(selected
                ? [{ tag: "Recorded" as const, value: candidate }]
                : []),
            ],
    };
  }
  return state;
}
/** XP/time, challenge investigator and completed-part gates from printed metadata. */
function eligibleSideStory(s: NativeRecord, game: NativeGame): NativeRecord[] {
  if (!s.xp) return [];
  const campaign = record(game.campaign),
    investigators = companionEntities(game, "investigators").filter(
      (v) => !v.killed && !v.drivenInsane,
    ),
    log = record(campaign.log);
  const time = list(log.recordedCounts).find(
    (v) =>
      record(list(v)[0]).tag === "TheScarletKeysKey" &&
      record(list(v)[0]).contents === "Time",
  );
  const completed = list(campaign.completedSteps).flatMap((v) => {
    const step = record(v);
    return [
      "StandaloneScenarioStep",
      "StandaloneScenarioStepWithOptions",
    ].includes(text(step.tag))
      ? [text(list(step.contents)[0]).replace(/^c/, "")]
      : [];
  });
  const overlay = list(campaign.overlays)
    .map(record)
    .find((v) => v.available && text(v.scenario).replace(/^c/, "") === s.id);
  const xp = integer(overlay?.xpCost ?? s.xp),
    usesTime = !!time,
    available = usesTime
      ? 35 - integer(list(time)[1])
      : Math.min(...investigators.map((v) => integer(v.xp)));
  const required = s.requiredInvestigator
    ? investigators.find((v) => entityName(v) === s.requiredInvestigator)
    : undefined;
  if (s.requiredInvestigator && !required) return [];
  if (
    usesTime
      ? xp > available
      : required
        ? integer(required.xp) < xp ||
          investigators.some((v) => v.id !== required.id && integer(v.xp) < 1)
        : xp > available
  )
    return [];
  if (
    s.id === "90094" &&
    !investigators.some((v) => /^(90|c90)/.test(text(v.cardCode)))
  )
    return [];
  return (s.scenarios ? list(s.scenarios) : [s])
    .map(record)
    .filter(
      (part) =>
        !completed.includes(text(part.id)) &&
        !list(part.notAfter).some((v) => completed.includes(text(v))),
    )
    .map((part) => ({ ...s, ...part, xp, usesTime }));
}
export default CompanionDecision;
