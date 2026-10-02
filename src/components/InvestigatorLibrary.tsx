import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Books,
  CheckCircle,
  FileText,
  MagnifyingGlass,
  Package,
  X,
} from "@phosphor-icons/react";
import {
  CARD_ART,
  PLAYABLE_INVESTIGATORS,
  STARTER_DECKS,
  card,
  cardArt,
  investigators as coreInvestigators,
  plain,
} from "../game/data";
import {
  catalog,
  kindLabel,
  productForCard,
  productsForCard,
  starterDeckForInvestigator,
} from "../game/catalog";
import type { Card } from "../game/types";
import { isPlayerCard } from "../game/knowledge";
import { Button, SkillStats } from "./Common";
import { useCatalog } from "./useCatalog";
import "../catalog.css";

interface InvestigatorLibraryProps {
  inspect: (code: string) => void;
  selectedInvestigators?: string[];
  onToggleInvestigator?: (code: string) => void;
  maxSelected?: number;
  onStart?: (code?: string) => void;
  onExpandedPlay?: (code: string) => void;
  compact?: boolean;
}

const classNames = [
  "guardian",
  "seeker",
  "rogue",
  "mystic",
  "survivor",
  "neutral",
];
const playableOrder = new Map(
  PLAYABLE_INVESTIGATORS.map((code, i) => [code, i]),
);
const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);
const playable = (code: string) => playableOrder.has(code);
const separatelySoldStarter = (code: string) => {
  const deck = starterDeckForInvestigator(code);
  return (
    deck &&
    catalog.products.find((product) => product.code === deck.productCode)
      ?.kind === "starter-deck"
  );
};

function InvestigatorArt({ investigator }: { investigator: Card }) {
  const cached = CARD_ART[investigator.code];
  const external = investigator.imagesrc?.startsWith("/")
    ? `https://arkhamdb.com${investigator.imagesrc}`
    : investigator.imagesrc;
  const primarySource = cardArt(investigator);
  const [source, setSource] = useState(primarySource);
  const [loaded, setLoaded] = useState(false);
  const frame = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    setSource(primarySource);
    setLoaded(false);
  }, [primarySource, investigator.code]);
  useEffect(() => {
    if (!source?.startsWith("https:") || loaded || !frame.current) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        timeout = setTimeout(() => setSource(undefined), 8000);
        observer.disconnect();
      }
    });
    observer.observe(frame.current);
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [source, loaded]);
  return (
    <span ref={frame} className={`library-art-frame ${loaded ? "loaded" : ""}`}>
      <span className="library-art-fallback" aria-hidden="true">
        {investigator.name
          .split(" ")
          .map((word) => word[0])
          .join("")}
        <small>{investigator.subname || "Investigator file"}</small>
      </span>
      {source && (
        <img
          className="library-investigator-art"
          src={source}
          alt={investigator.name}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setSource(
              source === cached && external !== cached ? external : undefined,
            );
          }}
        />
      )}
    </span>
  );
}

function deckSummary(investigator: Card) {
  if (STARTER_DECKS[investigator.code])
    return "Core set · suggested starter deck";
  if (starterDeckForInvestigator(investigator.code))
    return "Starter deck · sold separately";
  return `${kindLabel(productForCard(investigator)?.kind || "")} · build your own deck`;
}

/** Imported files are browsable; only investigators with implemented decks can enter play. */
export function InvestigatorLibrary({
  inspect,
  selectedInvestigators = [],
  onToggleInvestigator,
  maxSelected = 3,
  onStart,
  onExpandedPlay,
  compact = false,
}: InvestigatorLibraryProps) {
  const { cards, loading, error, retry } = useCatalog();
  const [query, setQuery] = useState("");
  const [faction, setFaction] = useState("all");
  const [product, setProduct] = useState("all");
  const [availability, setAvailability] = useState(
    compact ? "playable" : "all",
  );
  const [openCode, setOpenCode] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openCode)
      detailRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [openCode]);
  const investigators = useMemo(
    () =>
      (cards.length ? cards : coreInvestigators)
        .filter(
          (c) => c.type_code === "investigator" && !c.hidden && isPlayerCard(c),
        )
        .sort((a, b) => {
          const order =
            (playableOrder.get(a.code) ?? 99) -
            (playableOrder.get(b.code) ?? 99);
          return (
            order ||
            a.name.localeCompare(b.name) ||
            a.code.localeCompare(b.code)
          );
        }),
    [cards],
  );
  const products = useMemo(() => {
    const publicCodes = new Set(investigators.map((c) => c.code));
    return catalog.products
      .filter((p) => p.investigatorCodes.some((code) => publicCodes.has(code)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [investigators]);
  const list = investigators.filter((c) => {
    const sources = productsForCard(c);
    return (
      (faction === "all" ||
        c.faction_code === faction ||
        c.faction2_code === faction ||
        c.faction3_code === faction) &&
      (product === "all" ||
        sources.some((source) => source.code === product)) &&
      (availability === "all" ||
        (availability === "playable"
          ? playable(c.code)
          : separatelySoldStarter(c.code))) &&
      `${c.name} ${c.subname || ""} ${c.traits || ""} ${c.code} ${sources.map((source) => source.name).join(" ")}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );
  });
  const opened = openCode ? card(openCode) : undefined;
  const clearFilters = () => {
    setQuery("");
    setFaction("all");
    setProduct("all");
    setAvailability("all");
  };
  const details = opened && (
    <div ref={detailRef} className="library-detail-slot">
      <InvestigatorDeck
        investigator={opened}
        inspect={inspect}
        onClose={() => setOpenCode(null)}
        onStart={onStart}
        onExpandedPlay={onExpandedPlay}
      />
    </div>
  );

  return (
    <section
      className={`investigator-library ${compact ? "compact" : "page-content"}`}
      aria-label="Investigator and deck library"
    >
      {!compact && (
        <>
          <div className="eyebrow">People of Arkham</div>
          <div className="page-heading">
            <div>
              <h1>The investigator files</h1>
              <p>
                Find an investigator, trace their set, and open their official
                deck.
              </p>
            </div>
            <span className="edition-tag">
              THE COMPLETE CATALOG{" "}
              <span>{investigators.length} investigator printings</span>
            </span>
          </div>
        </>
      )}
      <div className="library-filters">
        <label className="library-search">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <input
            aria-label="Search investigators and sets"
            placeholder="Investigator, set, or card number…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Filter investigators by class"
          value={faction}
          onChange={(event) => setFaction(event.target.value)}
        >
          <option value="all">All classes</option>
          {classNames.map((name) => (
            <option key={name} value={name}>
              {titleCase(name)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter investigators by product"
          value={product}
          onChange={(event) => setProduct(event.target.value)}
        >
          <option value="all">All products</option>
          {products.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter investigators by deck availability"
          value={availability}
          onChange={(event) => setAvailability(event.target.value)}
        >
          <option value="all">All investigators</option>
          <option value="playable">Playable here</option>
          <option value="starter">Separate starter decks</option>
        </select>
      </div>
      <div className="library-results" role="status">
        <span>
          {loading
            ? "Importing investigator files…"
            : `${list.length} investigator printings`}
        </span>
        <span>
          <CheckCircle size={13} aria-hidden="true" />{" "}
          {PLAYABLE_INVESTIGATORS.length} playable here
        </span>
      </div>
      {error && (
        <div className="library-load-error" role="alert">
          <p>{error}</p>
          <Button secondary onClick={retry}>
            Retry catalog loading
          </Button>
        </div>
      )}
      {!compact && details}
      <div
        className={`library-roster ${compact ? "party-choices" : "library-grid"}`}
      >
        {list.map((investigator) => {
          const selected = selectedInvestigators.includes(investigator.code);
          const canPlay = playable(investigator.code);
          const source = productForCard(investigator);
          const atLimit =
            !selected && selectedInvestigators.length >= maxSelected;
          return (
            <article
              className={`library-file ${investigator.faction_code} ${openCode === investigator.code ? "open" : ""}`}
              key={investigator.code}
            >
              <button
                className={`investigator-choice ${investigator.faction_code} ${selected ? "selected" : ""} ${canPlay ? "" : "catalog-choice"}`}
                data-preview-code={investigator.code}
                aria-label={
                  onToggleInvestigator && canPlay
                    ? `Select ${investigator.name}`
                    : `View ${investigator.name} deck and source`
                }
                aria-pressed={
                  onToggleInvestigator && canPlay ? selected : undefined
                }
                disabled={!!onToggleInvestigator && canPlay && atLimit}
                onClick={() => {
                  if (onToggleInvestigator && canPlay)
                    onToggleInvestigator(investigator.code);
                  setOpenCode(investigator.code);
                }}
              >
                <InvestigatorArt investigator={investigator} />
                {onToggleInvestigator && canPlay && (
                  <span className="choice-check">
                    {selected ? (
                      <CheckCircle size={19} weight="fill" />
                    ) : (
                      <span />
                    )}
                  </span>
                )}
                <span className="choice-details">
                  <small>
                    {titleCase(investigator.faction_code)} · #
                    {investigator.code}
                  </small>
                  <strong>{investigator.name}</strong>
                  {investigator.subname && (
                    <span className="library-subname">
                      {investigator.subname}
                    </span>
                  )}
                  <span className="library-source">
                    <Package size={12} aria-hidden="true" />
                    {source?.name || "Source set unavailable"}
                  </span>
                  <span
                    className={`library-status ${canPlay ? "playable" : ""}`}
                  >
                    {canPlay ? (
                      <CheckCircle size={12} aria-hidden="true" />
                    ) : (
                      <Books size={12} aria-hidden="true" />
                    )}
                    {selected && selectedInvestigators[0] === investigator.code
                      ? "Lead investigator · "
                      : ""}
                    {canPlay ? "Playable" : "Catalog only"}
                  </span>
                </span>
              </button>
              <button
                className="library-deck-link"
                aria-expanded={openCode === investigator.code}
                onClick={() =>
                  setOpenCode(
                    openCode === investigator.code ? null : investigator.code,
                  )
                }
              >
                <span>{deckSummary(investigator)}</span>
                <FileText size={16} aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
      {!list.length && !loading && (
        <div className="library-empty">
          <MagnifyingGlass size={27} />
          <p>No investigator files match these filters.</p>
          <Button secondary onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}
      {compact && details}
      <p className="library-scope-note">
        Public investigator printings are available to browse. The built-in
        table supports the five 2026 core investigators in Spreading Flames.
        Expanded play uses the connected companion engine's available content.
      </p>
    </section>
  );
}

function InvestigatorDeck({
  investigator,
  inspect,
  onClose,
  onStart,
  onExpandedPlay,
}: {
  investigator: Card;
  inspect: (code: string) => void;
  onClose: () => void;
  onStart?: (code?: string) => void;
  onExpandedPlay?: (code: string) => void;
}) {
  const coreDeck = STARTER_DECKS[investigator.code];
  const starter = starterDeckForInvestigator(investigator.code);
  const product = productForCard(investigator);
  const sources = productsForCard(investigator);
  const slots = coreDeck
    ? Object.entries(
        coreDeck.reduce<Record<string, number>>((counts, code) => {
          counts[code] = (counts[code] || 0) + 1;
          return counts;
        }, {}),
      ).map(([code, quantity]) => ({ code, quantity }))
    : starter?.slots || [];
  const cardCount = slots.reduce((count, slot) => count + slot.quantity, 0);
  const sortedSlots = [...slots].sort(
    (a, b) =>
      (card(a.code)?.type_code || "").localeCompare(
        card(b.code)?.type_code || "",
      ) ||
      (card(a.code)?.name || a.code).localeCompare(
        card(b.code)?.name || b.code,
      ),
  );
  return (
    <div
      className={`library-deck-panel ${investigator.faction_code}`}
      aria-label={`${investigator.name} deck and source`}
    >
      <div className="library-detail-heading">
        <div>
          <div className="eyebrow">
            Investigator dossier / {investigator.code}
          </div>
          <h2>{investigator.name}</h2>
          <p>{investigator.subname}</p>
        </div>
        <button
          className="library-close"
          aria-label="Close investigator deck details"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <div className="library-detail-summary">
        <div className="library-detail-identity">
          <InvestigatorArt investigator={investigator} />
          <SkillStats
            values={[
              investigator.skill_willpower || 0,
              investigator.skill_intellect || 0,
              investigator.skill_combat || 0,
              investigator.skill_agility || 0,
            ]}
          />
        </div>
        <div className="library-product-copy">
          <div className="library-product-kind">
            <Package size={16} />
            {coreDeck
              ? "Included in the 2026 core set"
              : starter
                ? "Preconstructed starter deck · sold separately"
                : kindLabel(product?.kind || "")}
          </div>
          <h3>
            {starter
              ? catalog.products.find((p) => p.code === starter.productCode)
                  ?.name || starter.name
              : product?.name || "Investigator source"}
          </h3>
          <p>
            {coreDeck
              ? `A ${cardCount}-card suggested deck from the core rulebook. Assemble it from the cards in the box; it is included with the core set.`
              : starter
                ? `A ready-to-play ${cardCount}-card deck sold as its own investigator pack. The pack also includes upgrade cards for later in a campaign.`
                : "This investigator is part of this product. Build a deck using the restrictions on their investigator card; an official preconstructed deck is not included in this catalog."}
          </p>
          {sources.length > 1 && (
            <p className="library-other-sources">
              This printing is also included in:{" "}
              {sources
                .filter((p) => p.code !== product?.code)
                .map((p) => p.name)
                .join(" · ")}
              .
            </p>
          )}
          <span className="library-play-status">
            {playable(investigator.code) ? (
              <>
                <CheckCircle size={15} /> Scripted for play in Spreading Flames
              </>
            ) : (
              <>
                <Books size={15} /> Available in the collection · check the
                companion engine for play support
              </>
            )}
          </span>
          {investigator.content_restriction === "barkham_only" && (
            <p className="library-other-sources">
              Barkham Horror investigator. These canine investigators are
              restricted to the Barkham Horror scenario.
            </p>
          )}
          <div className="library-detail-actions">
            <Button secondary onClick={() => inspect(investigator.code)}>
              Read investigator card <ArrowUpRight size={15} />
            </Button>
            {onStart && playable(investigator.code) && (
              <Button onClick={() => onStart(investigator.code)}>
                Choose party & play
              </Button>
            )}
            {onExpandedPlay && (
              <Button secondary onClick={() => onExpandedPlay(investigator.code)}>
                Play with expansions
              </Button>
            )}
          </div>
        </div>
      </div>
      {slots.length > 0 && (
        <details className="library-deck-contents">
          <summary>
            <span>{coreDeck ? "Suggested starter deck" : starter?.name}</span>
            <span className="library-deck-count">{cardCount} cards</span>
          </summary>
          <p className="library-contents-help">
            Includes signatures and required weaknesses. Open any card to see
            its rules.
          </p>
          <div className="library-deck-list">
            {sortedSlots.map((slot) => (
              <DeckCard key={slot.code} slot={slot} inspect={inspect} />
            ))}
          </div>
        </details>
      )}
      {!!starter?.upgrades.length && (
        <details className="library-upgrades">
          <summary>
            Upgrade cards included in the pack{" "}
            <span>
              {starter.upgrades.reduce(
                (count, slot) => count + slot.quantity,
                0,
              )}{" "}
              cards
            </span>
          </summary>
          <div className="library-deck-list">
            {starter.upgrades.map((slot) => (
              <DeckCard key={slot.code} slot={slot} inspect={inspect} />
            ))}
          </div>
        </details>
      )}
      {!coreDeck && !starter && (
        <div className="library-deckbuilding">
          <h3>Deckbuilding</h3>
          <p>
            {plain(investigator.back_text) ||
              "Read the back of the investigator card for deck size, options and requirements."}
          </p>
        </div>
      )}
      {starter?.sourceUrl && (
        <a
          className="library-source-link"
          href={starter.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Starter deck reference <ArrowUpRight size={13} />
        </a>
      )}
    </div>
  );
}

function DeckCard({
  slot,
  inspect,
}: {
  slot: { code: string; quantity: number };
  inspect: (code: string) => void;
}) {
  const c = card(slot.code);
  const source = c && productForCard(c);
  return (
    <button
      className="library-deck-card"
      disabled={!c}
      data-preview-code={slot.code}
      onClick={() => inspect(slot.code)}
    >
      <b>{slot.quantity}×</b>
      <span>
        <strong>
          {c?.name || slot.code}
          {c?.xp ? ` (${c.xp})` : ""}
        </strong>
        <small>
          {source?.name || "Card source unavailable"}
          {c ? ` · ${titleCase(c.type_code)}` : ""}
        </small>
      </span>
      <ArrowUpRight size={13} />
    </button>
  );
}
