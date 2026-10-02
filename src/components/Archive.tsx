import { useEffect, useState } from "react";
import {
  MagnifyingGlass,
  ArrowUpRight,
  LockKey,
  Books,
  ArrowLeft,
  ArrowRight,
} from "@phosphor-icons/react";
import { cards as coreCards, plain } from "../game/data";
import { catalog, kindLabel, productForCard } from "../game/catalog";
import { CardFace, Button } from "./Common";
import { availableCards, isPlayerCard } from "../game/knowledge";
import type { GameState } from "../game/types";
import { useCatalog } from "./useCatalog";

const PAGE_SIZE = 48;
export function Archive({
  game,
  inspect,
}: {
  game: GameState | null;
  inspect: (code: string, allowSpoilers?: boolean) => void;
}) {
  const { cards, loading, error, retry } = useCatalog();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [faction, setFaction] = useState("all");
  const [productCode, setProductCode] = useState("all");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<"cards" | "products">("cards");
  const [includeStories, setIncludeStories] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(
    () => setPage(0),
    [query, type, faction, productCode, includeStories],
  );
  const pool = cards.length ? cards : coreCards;
  const known = new Set(availableCards(game).map((c) => c.code));
  const available = pool.filter(
    (c) =>
      includeStories || (!c.hidden && isPlayerCard(c)) || known.has(c.code),
  );
  const product = catalog.products.find((p) => p.code === productCode);
  const productCards = product ? new Set(product.cardCodes) : undefined;
  const search = query.trim().toLowerCase();
  const list = available
    .filter(
      (c) =>
        (type === "all" || c.type_code === type) &&
        (faction === "all" ||
          c.faction_code === faction ||
          c.faction2_code === faction ||
          c.faction3_code === faction) &&
        (!productCards || productCards.has(c.code)) &&
        `${c.name} ${c.traits || ""} ${c.code} ${plain(c.text)} ${productForCard(c)?.name || ""}`
          .toLowerCase()
          .includes(search),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        (a.xp || 0) - (b.xp || 0) ||
        a.code.localeCompare(b.code),
    );
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const products = catalog.products.filter(
    (p) =>
      (category === "all" || p.kind === category) &&
      `${p.name} ${p.cycleName} ${kindLabel(p.kind)}`
        .toLowerCase()
        .includes(search),
  );
  return (
    <div className="page-content archive-page collection-page">
      <div className="eyebrow">The collection</div>
      <div className="page-heading">
        <div>
          <h1>The card archive</h1>
          <p>
            Explore cards, expansions and investigator decks, with their
            original product details.
          </p>
        </div>
        <span className="edition-tag">
          PUBLISHED COLLECTION{" "}
          <span>
            {catalog.counts.cardCount.toLocaleString()} card definitions ·{" "}
            {catalog.counts.productCount} products
          </span>
        </span>
      </div>
      <div className="collection-tabs" aria-label="Collection view">
        <button
          aria-pressed={view === "cards"}
          onClick={() => setView("cards")}
        >
          Cards
        </button>
        <button
          aria-pressed={view === "products"}
          onClick={() => setView("products")}
        >
          <Books size={17} /> Products & expansions
        </button>
      </div>
      <div className="archive-filters collection-filters">
        <label className="search">
          <MagnifyingGlass size={19} />
          <input
            aria-label="Search cards"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              view === "cards"
                ? "Card, trait, rules or product…"
                : "Search expansions, decks and packs…"
            }
          />
        </label>
        {view === "cards" ? (
          <>
            <select
              aria-label="Filter by card type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="all">All card types</option>
              {[...new Set(available.map((c) => c.type_code))]
                .sort()
                .map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
            </select>
            <select
              aria-label="Filter by class"
              value={faction}
              onChange={(e) => setFaction(e.target.value)}
            >
              <option value="all">All classes</option>
              {[
                "guardian",
                "seeker",
                "rogue",
                "mystic",
                "survivor",
                "neutral",
                ...(includeStories ? ["mythos"] : []),
              ].map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by product"
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
            >
              <option value="all">All products</option>
              {catalog.products.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} · {kindLabel(p.kind)}
                </option>
              ))}
            </select>
          </>
        ) : (
          <select
            aria-label="Filter by product category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All product categories</option>
            {[...new Set(catalog.products.map((p) => p.kind))]
              .sort()
              .map((kind) => (
                <option key={kind} value={kind}>
                  {kindLabel(kind)}
                </option>
              ))}
          </select>
        )}
      </div>
      {error && (
        <div className="collection-load-state" role="alert">
          <p>{error}</p>
          <Button secondary onClick={retry}>
            Retry collection
          </Button>
        </div>
      )}
      {loading && (
        <p className="collection-load-state" role="status">
          Opening the collection…
        </p>
      )}
      {view === "cards" ? (
        <>
          <div className="archive-count">
            <span>
              {list.length.toLocaleString()} cards found · printings and
              variants retained
            </span>
            <span>
              <LockKey size={13} /> Unseen story cards stay sealed
            </span>
          </div>
          <label className="collection-spoiler-toggle">
            <input
              type="checkbox"
              checked={includeStories}
              onChange={(e) => setIncludeStories(e.target.checked)}
            />{" "}
            Show encounter and story cards{" "}
            <span>
              Contains campaign spoilers. Browsing does not unlock your
              investigation.
            </span>
          </label>
          <div className="archive-grid">
            {list
              .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
              .map((c) => (
                <div className="collection-card" key={c.code}>
                  <CardFace
                    c={c}
                    compact
                    onClick={() => inspect(c.code, includeStories)}
                  />
                  <span>{productForCard(c)?.name || c.pack_code}</span>
                  <small>
                    {c.xp ? `${c.xp} XP · ` : ""}#{c.code}
                  </small>
                </div>
              ))}
          </div>
          {!!list.length && (
            <div className="collection-pagination">
              <Button
                secondary
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                <ArrowLeft size={16} /> Previous
              </Button>
              <span>
                Page {currentPage + 1} of {pages}
              </span>
              <Button
                secondary
                disabled={currentPage + 1 >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next <ArrowRight size={16} />
              </Button>
            </div>
          )}
          {!list.length && !loading && (
            <div className="empty-state">
              <MagnifyingGlass size={36} />
              <h2>No leads here.</h2>
              <p>
                {product && !includeStories
                  ? "This product may contain encounter cards. Enable story cards to browse them."
                  : "Try another card name or clear your filters."}
              </p>
              <Button
                secondary
                onClick={() => {
                  setQuery("");
                  setType("all");
                  setFaction("all");
                  setProductCode("all");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="archive-count">
            {products.length} products found{" "}
            <span>Catalogued content · game scripting varies by product</span>
          </div>
          <div className="collection-products">
            {products.map((p) => (
              <article key={p.code}>
                <span className="eyebrow">{kindLabel(p.kind)}</span>
                <h2>{p.name}</h2>
                <p>{p.cycleName}</p>
                {p.description && (
                  <p className="collection-product-note">{p.description}</p>
                )}
                <dl>
                  <div>
                    <dt>
                      {p.releaseDateBasis?.startsWith("official")
                        ? "Released"
                        : "Catalog date"}
                    </dt>
                    <dd>{p.releaseDate || "Date unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Card definitions</dt>
                    <dd>{p.cardCodes.length}</dd>
                  </div>
                  {p.investigatorCodes.length > 0 && (
                    <div>
                      <dt>Investigator versions</dt>
                      <dd>{p.investigatorCodes.length}</dd>
                    </div>
                  )}
                </dl>
                {p.kind === "starter-deck" && (
                  <p className="collection-product-note">
                    A ready-to-play investigator deck, sold separately from
                    campaign expansions.
                  </p>
                )}
                {p.reprintOf?.length ? (
                  <p className="collection-product-note">
                    Repackaged content from earlier releases.
                  </p>
                ) : null}
                <div className="collection-product-actions">
                  <Button
                    secondary
                    onClick={() => {
                      setProductCode(p.code);
                      setQuery("");
                      setType("all");
                      setFaction("all");
                      setView("cards");
                    }}
                  >
                    Explore cards
                  </Button>
                  <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                    Product source <ArrowUpRight size={15} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <p className="collection-snapshot">
        Collection snapshot: {catalog.asOf}. Original products, reprints and
        parallel versions are identified separately. Artwork loads as cards are
        viewed; unavailable scans show a readable card.
      </p>
    </div>
  );
}
