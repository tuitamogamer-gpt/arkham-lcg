import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle,
  PlugsConnected,
  Stack,
  UploadSimple,
} from "@phosphor-icons/react";
import { catalog, kindLabel, productsForCard } from "../game/catalog";
import { card } from "../game/data";
import { validateDeck, type BarkhamJudgments } from "../game/decks";
import {
  parseCustomizationSheet,
  type CustomizableCard,
} from "../game/customizations";
import {
  getRulesServerStatus,
  importServerDeck,
  parseServerDeck,
  rulesFrameUrl,
  serverProductCoverage,
  starterServerDeck,
  unsupportedDeckCards,
  serverDeckOptions,
  type RulesServerStatus,
  type ServerDeck,
  type CompanionSession,
} from "../game/rulesServer";
import { Button } from "./Common";
import { useCatalog } from "./useCatalog";
import { EpicLobby } from "./EpicLobby";
import { CompanionSetup } from "./CompanionSetup";
import { CompanionTable } from "./CompanionTable";

export function ExpandedPlay({
  investigatorCode,
  inspect,
  onTableOpen,
}: {
  investigatorCode?: string;
  inspect: (code: string) => void;
  onTableOpen?: (open: boolean) => void;
}) {
  const {
    cards,
    loading,
    error: catalogError,
    retry: retryCatalog,
  } = useCatalog();
  const [status, setStatus] = useState<RulesServerStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState<string | null>(null);
  const [frameVersion, setFrameVersion] = useState(0);
  const [coverage, setCoverage] = useState(false);
  const [epic, setEpic] = useState(false);
  const [setupView, setSetupView] = useState<"new" | "saved" | null>(null);
  const [companionSession, setCompanionSession] = useState<CompanionSession | null>(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const gameId = params.get("investigation");
    const seatId = params.get("seat");
    const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    return gameId && uuid.test(gameId) && (!seatId || uuid.test(seatId)) ? { gameId, ...(seatId ? { seatId } : {}) } : null;
  });
  useEffect(() => {
    onTableOpen?.(!!companionSession);
    return () => onTableOpen?.(false);
  }, [companionSession, onTableOpen]);
  const [deckId, setDeckId] = useState(
    () =>
      catalog.starterDecks.find((d) => d.investigatorCode === investigatorCode)
        ?.id || catalog.starterDecks[0].id,
  );
  const [customDeck, setCustomDeck] = useState<ServerDeck | null>(null);
  const [barkhamJudgments, setBarkhamJudgments] =
    useState<BarkhamJudgments | null>(null);
  const [needsCustomDeck, setNeedsCustomDeck] = useState(
    () =>
      !!investigatorCode &&
      !catalog.starterDecks.some(
        (d) => d.investigatorCode === investigatorCode,
      ),
  );
  const [productQuery, setProductQuery] = useState("");
  const supported = useMemo(
    () => new Set(status?.supportedCardCodes || []),
    [status],
  );
  const cardMap = useMemo(
    () => new Map(cards.map((c) => [c.code, c])),
    [cards],
  );
  const starter = catalog.starterDecks.find((d) => d.id === deckId)!;
  const baseDeck = customDeck || starterServerDeck(starter);
  const deck =
    barkhamJudgments && baseDeck.investigator_code.startsWith("barkham-")
      ? {
          ...baseDeck,
          meta: {
            ...baseDeck.meta,
            chronicle_barkham_judgments: JSON.stringify(barkhamJudgments),
          },
        }
      : baseDeck;
  const barkhamArtRule = [
    "barkham-004",
    "barkham-007",
    "barkham-010",
    "barkham-013",
  ].includes(deck.investigator_code);
  const updateJudgment = (
    code: string,
    field: "eligibleOffClassCards" | "catCards",
    checked: boolean,
  ) => {
    setBarkhamJudgments((old) => {
      const value = old || {
        eligibleOffClassCards: [],
        catCards: [],
        artworkReviewed: false,
      };
      return {
        ...value,
        [field]: checked
          ? [...new Set([...value[field], code])]
          : value[field].filter((c) => c !== code),
      };
    });
  };
  const slots = Object.entries(deck.slots).map(([code, quantity]) => ({
    code,
    quantity,
  }));
  const validation = cards.length
    ? validateDeck(
        deck.meta?.alternate_back || deck.investigator_code,
        slots,
        cards,
        serverDeckOptions(deck),
      )
    : null;
  const unavailable = unsupportedDeckCards(deck, supported);
  const customizedCards = slots.flatMap(({ code, quantity }) => {
    const definition = cardMap.get(code) as CustomizableCard | undefined;
    if (!definition?.customization_options) return [];
    return [
      {
        definition,
        quantity,
        sheet: parseCustomizationSheet(
          definition,
          deck.meta?.[`cus_${code}`],
          cardMap,
        ),
      },
    ];
  });
  const deckProduct = catalog.products.find(
    (p) => p.code === starter.productCode,
  );
  const connect = async () => {
    setConnecting(true);
    setError("");
    try {
      setStatus(await getRulesServerStatus());
    } catch {
      setStatus(null);
      setError(
        "The local rules server is unavailable. Start it with the command below, then connect again.",
      );
    } finally {
      setConnecting(false);
    }
  };
  useEffect(() => {
    void connect();
  }, []);
  useEffect(() => {
    if (!investigatorCode) return;
    const selected = catalog.starterDecks.find(
      (d) => d.investigatorCode === investigatorCode,
    );
    setNeedsCustomDeck(!selected);
    setCustomDeck(null);
    setBarkhamJudgments(null);
    if (selected) setDeckId(selected.id);
  }, [investigatorCode]);
  const openTable = (path: string) => {
    setCoverage(false);
    setEpic(false);
    setSetupView(null);
    setFrame(rulesFrameUrl(path));
    setFrameVersion((version) => version + 1);
  };
  const showSetup = (mode: "new" | "saved") => {
    setFrame(null); setEpic(false); setCoverage(false); setSetupView(mode);
  };
  const openInvestigation = (session: CompanionSession) => {
    setCompanionSession(session);
    const hash = new URLSearchParams({ investigation: session.gameId, ...(session.seatId ? { seat: session.seatId } : {}) });
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${hash}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const importDeck = async () => {
    if (needsCustomDeck || !validation?.valid || unavailable.length || !status)
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await importServerDeck(deck);
      setNotice(`${deck.name} is ready. Choose it when assembling your party.`);
      showSetup("new");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The deck could not be imported.",
      );
    } finally {
      setBusy(false);
    }
  };
  const loadDeck = async (file?: File) => {
    if (!file) return;
    setError("");
    setNotice("");
    try {
      if (file.size > 1024 * 1024)
        throw new Error("Choose a deck JSON file smaller than 1 MB.");
      const imported = parseServerDeck(JSON.parse(await file.text()));
      setCustomDeck(imported);
      setBarkhamJudgments(serverDeckOptions(imported).barkhamJudgments || null);
      setNeedsCustomDeck(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The deck file could not be read.",
      );
    }
  };
  if (companionSession) return <CompanionTable
    session={companionSession}
    inspect={inspect}
    onHome={() => {
      setCompanionSession(null);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      showSetup("saved");
    }}
  />;
  return (
    <section
      className={`expanded-play ${frame && !coverage ? "table-open" : "page-content"}`}
      aria-label="Expanded campaigns and rules"
    >
      <div className="expanded-heading">
        <div>
          <div className="eyebrow">The wider investigation</div>
          <h1>Expansions & campaigns</h1>
          <p className="page-subtitle">
            Continue your investigation through every expansion, with saved
            campaign decisions, card abilities and deck upgrades.
          </p>
        </div>
        <span className={`rules-connection ${status ? "ready" : ""}`}>
          <PlugsConnected size={18} />
          {status ? "Rules server connected" : "Rules server offline"}
        </span>
      </div>
      {!status ? (
        <article className="rules-connect-panel">
          <h2>Connect the local rules server</h2>
          <p>
            Run this once from the Arkham Chronicle project, keep the terminal
            open, then connect. Games and campaign progress are saved by the
            companion server.
          </p>
          <pre>
            <code>npm run rules:server</code>
          </pre>
          <Button onClick={() => void connect()} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect rules server"}
          </Button>
          {error && (
            <p role="status" className="rules-error">
              {error}
            </p>
          )}
          <p className="rules-note">
            The built-in Spreading Flames game remains available from Campaigns.
            This companion currently requires macOS with Apple silicon.
          </p>
        </article>
      ) : (
        <>
          <nav className="rules-table-tools" aria-label="Expanded play tools">
            <Button onClick={() => showSetup("new")}>
              New campaign or scenario
            </Button>
            <Button secondary onClick={() => showSetup("saved")}>
              Saved investigations
            </Button>
            <Button secondary onClick={() => openTable("/decks")}>
              Build & upgrade decks
            </Button>
            <Button
              secondary
              onClick={() => {
                setEpic((v) => !v);
                setCoverage(false);
                setFrame(null);
                setSetupView(null);
              }}
            >
              Epic group tables
            </Button>
            <Button
              secondary
              onClick={() => {
                setEpic(false);
                setSetupView(null);
                setCoverage((v) => !v);
              }}
            >
              <Stack size={17} />
              {coverage ? "Close availability" : "Product availability"}
            </Button>
            {(frame || setupView || epic) && (
              <Button
                secondary
                onClick={() => {
                  setFrame(null);
                  setEpic(false);
                  setSetupView(null);
                }}
              >
                Starter decks
              </Button>
            )}
          </nav>
          {status.limitations.length > 0 && (
            <p className="rules-note">
              {status.limitations
                .filter((text) =>
                  /Barkham|beta content|alpha content/.test(text),
                )
                .join(" ")}
            </p>
          )}
          {coverage ? (
            <div className="rules-coverage">
              <h2>Cards declared by the connected engine</h2>
              <p>
                Registration shows which definitions the server provides. It
                does not certify every card interaction or guarantee that every
                scenario in a product is implemented.
              </p>
              <label>
                Find a product
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  type="search"
                  placeholder="Expansion or pack name"
                />
              </label>
              <ul>
                {catalog.products
                  .filter((p) =>
                    p.name.toLowerCase().includes(productQuery.toLowerCase()),
                  )
                  .map((p) => {
                    const count = serverProductCoverage(
                      p.cardCodes,
                      supported,
                      cardMap,
                    );
                    return (
                      <li key={p.code}>
                        <span>
                          <b>{p.name}</b>
                          <small>{kindLabel(p.kind)}</small>
                        </span>
                        <span>
                          {count.registered} / {count.total} cards declared
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : setupView ? <CompanionSetup mode={setupView} onOpen={openInvestigation} /> : epic ? (
              <EpicLobby
                status={status}
                deck={deck}
                deckValid={!!validation?.valid && unavailable.length === 0}
                onOpen={openInvestigation}
              />
          ) : frame ? (
            <iframe
              key={`${frame}:${frameVersion}`}
              className="rules-table-frame"
              title="Arkham companion game table"
              src={frame}
              allow="fullscreen"
            />
          ) : (
            <div className="rules-deck-panel">
              <div>
                <div className="eyebrow">Start with an official deck</div>
                <h2>Choose your investigator deck</h2>
                <p>
                  Import a complete official starter, or bring an ArkhamDB JSON
                  deck. You can build custom decks and choose the rest of your
                  party at the rules table.
                </p>
                <label>
                  Official starter deck
                  <select
                    value={needsCustomDeck ? "" : deckId}
                    onChange={(e) => {
                      setDeckId(e.target.value);
                      setCustomDeck(null);
                      setBarkhamJudgments(null);
                      setNeedsCustomDeck(false);
                      setNotice("");
                    }}
                  >
                    <option value="" disabled>
                      Choose an official starter deck
                    </option>
                    {catalog.starterDecks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="rules-upload">
                  <UploadSimple size={17} /> Import an ArkhamDB JSON deck
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      void loadDeck(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {needsCustomDeck ? (
                <article>
                  <h3>
                    {card(investigatorCode || "")?.name || investigatorCode}
                  </h3>
                  {supported.has(investigatorCode || "") ? (
                    <>
                      <p>
                        This investigator has no preconstructed deck in the
                        collection. Import your deck JSON, or build a deck at
                        the companion table.
                      </p>
                      <Button onClick={() => openTable("/decks")}>
                        Build a deck for this investigator
                      </Button>
                    </>
                  ) : (
                    <p className="rules-error">
                      This investigator is not declared by the connected engine
                      and cannot enter play here. You can still read their cards
                      in the collection.
                    </p>
                  )}
                </article>
              ) : (
                <article>
                  <button
                    className="rules-investigator-name"
                    disabled={!card(deck.investigator_code)}
                    onClick={() => inspect(deck.investigator_code)}
                  >
                    {card(deck.investigator_code)?.name ||
                      deck.investigator_code}{" "}
                    <ArrowUpRight size={16} />
                  </button>
                  <h3>{deck.name}</h3>
                  <p>
                    {customDeck
                      ? productsForCard(deck.investigator_code)
                          .map((p) => p.name)
                          .join(" · ")
                      : `${deckProduct?.name} · ${starter.kind === "preconstructed" ? "Sold separately as a complete deck" : "Suggested deck from the core set"}`}
                  </p>
                  {barkhamArtRule && (
                    <details className="barkham-deck-review" open>
                      <summary>Barkham deckbuilding choices</summary>
                      <p>
                        {
                          card(deck.investigator_code)?.back_text?.match(
                            /Deckbuilding Options: ([\s\S]*?)\nDeckbuilding Requirements/,
                          )?.[1]
                        }
                      </p>
                      <p>
                        Check a card's printed rules and illustration, then mark
                        the cards that qualify for the additional five-card
                        option. Cards in your normal classes do not use that
                        allowance.
                      </p>
                      <label className="barkham-review-check">
                        <input
                          type="checkbox"
                          checked={!!barkhamJudgments?.artworkReviewed}
                          onChange={(e) =>
                            setBarkhamJudgments((old) => ({
                              eligibleOffClassCards:
                                old?.eligibleOffClassCards || [],
                              catCards: old?.catCards || [],
                              artworkReviewed: e.target.checked,
                            }))
                          }
                        />
                        {deck.investigator_code === "barkham-013"
                          ? "I reviewed every card for cats, including its illustration."
                          : "I reviewed the deck against these printed Barkham options."}
                      </label>
                      <ul>
                        {Object.keys(deck.slots).map((code) => {
                          const definition = cardMap.get(code);
                          if (!definition || code.startsWith("barkham-"))
                            return null;
                          const playerCard =
                            ["asset", "event", "skill"].includes(
                              definition.type_code,
                            ) &&
                            definition.subtype_code !== "basicweakness" &&
                            definition.subtype_code !== "weakness";
                          return (
                            <li key={code}>
                              <button
                                className="rules-investigator-name"
                                onClick={() => inspect(code)}
                              >
                                {definition.name} ×{deck.slots[code]}{" "}
                                <ArrowUpRight size={14} />
                              </button>
                              {playerCard && (
                                <label className="barkham-review-check">
                                  <input
                                    type="checkbox"
                                    checked={
                                      !!barkhamJudgments?.eligibleOffClassCards.includes(
                                        code,
                                      )
                                    }
                                    onChange={(e) =>
                                      updateJudgment(
                                        code,
                                        "eligibleOffClassCards",
                                        e.target.checked,
                                      )
                                    }
                                  />
                                  Qualifies for the additional option
                                </label>
                              )}
                              {deck.investigator_code === "barkham-013" && (
                                <label className="barkham-review-check">
                                  <input
                                    type="checkbox"
                                    checked={
                                      !!barkhamJudgments?.catCards.includes(
                                        code,
                                      )
                                    }
                                    onChange={(e) =>
                                      updateJudgment(
                                        code,
                                        "catCards",
                                        e.target.checked,
                                      )
                                    }
                                  />
                                  Contains a cat
                                </label>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {deck.investigator_code === "barkham-013" && (
                        <p>
                          Duke's deck cannot contain cats under any
                          circumstances.
                        </p>
                      )}
                    </details>
                  )}
                  {loading ? (
                    <p>Loading deck rules…</p>
                  ) : catalogError ? (
                    <p>
                      {catalogError}{" "}
                      <button onClick={retryCatalog}>Retry collection</button>
                    </p>
                  ) : (
                    <>
                      <p>
                        {validation?.countedSize} / {validation?.deckSize} cards
                        toward deck size · {validation?.totalCards} cards
                        including signatures & weaknesses · {validation?.xp} XP
                      </p>
                      {customizedCards.length > 0 && (
                        <details className="rules-customizations" open>
                          <summary>Customization sheets</summary>
                          <ul>
                            {customizedCards.map(
                              ({ definition, quantity, sheet }) => (
                                <li key={definition.code}>
                                  <button
                                    className="rules-investigator-name"
                                    onClick={() => inspect(definition.code)}
                                  >
                                    {definition.name} ×{quantity}{" "}
                                    <ArrowUpRight size={14} />
                                  </button>
                                  <p>
                                    Level {sheet.level} · {sheet.totalXp} XP on
                                    one sheet, shared by all copies
                                  </p>
                                  <ul>
                                    {sheet.entries.map((entry) => (
                                      <li key={entry.index}>
                                        {definition.customization_text
                                          ?.split("\n")
                                          [entry.index]?.match(
                                            /<b>(.*?)<\/b>/,
                                          )?.[1]
                                          ?.replace(/\.$/, "") ||
                                          (entry.index === 0
                                            ? "Starting choice"
                                            : `Upgrade ${entry.index + 1}`)}
                                        {" · "}
                                        {entry.count}/
                                        {
                                          definition.customization_options![
                                            entry.index
                                          ].xp
                                        }{" "}
                                        boxes
                                        {entry.choices.length > 0 &&
                                          ` · ${entry.choices.map((choice) => cardMap.get(choice)?.name || choice).join(", ")}`}
                                      </li>
                                    ))}
                                  </ul>
                                </li>
                              ),
                            )}
                          </ul>
                        </details>
                      )}
                      {validation?.valid ? (
                        <p className="rules-deck-valid">
                          <CheckCircle size={16} /> Deckbuilding checks passed
                        </p>
                      ) : (
                        <ul className="rules-deck-issues">
                          {validation?.issues.map((issue, i) => (
                            <li key={i}>{issue.message}</li>
                          ))}
                        </ul>
                      )}
                      {unavailable.length > 0 && (
                        <p className="rules-error">
                          The connected engine does not declare:{" "}
                          {unavailable
                            .map((code) => card(code)?.name || code)
                            .join(", ")}
                          . This deck cannot enter play.
                        </p>
                      )}
                      <Button
                        onClick={() => void importDeck()}
                        disabled={
                          busy || !validation?.valid || unavailable.length > 0
                        }
                      >
                        {busy
                          ? "Importing deck…"
                          : "Use this deck & choose campaign"}
                      </Button>
                    </>
                  )}
                </article>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="rules-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rules-success">
              {notice}
            </p>
          )}
          <footer className="rules-attribution">
            Companion engine:{" "}
            <a href={status.sourceUrl} target="_blank" rel="noreferrer">
              Arkham Horror by halogenandtoast <ArrowUpRight size={13} />
            </a>{" "}
            · {status.version}. Availability follows the installed engine.
          </footer>
        </>
      )}
    </section>
  );
}
