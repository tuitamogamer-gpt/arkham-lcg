import { useEffect, useMemo, useRef, useState } from "react";
import {
  MagnifyingGlass,
  ArrowUpRight,
  LockKey,
  Books,
  ArrowLeft,
  ArrowRight,
  Eye,
} from "@phosphor-icons/react";
import { cards as coreCards, plain } from "../game/data";
import {
  catalog,
  kindLabel,
  productForCard,
  productsForCard,
} from "../game/catalog";
import { CardFace, Button } from "./Common";
import { availableCards, isPlayerCard } from "../game/knowledge";
import type { GameState } from "../game/types";
import { useCatalog } from "./useCatalog";

import { matchesSearch } from "../game/search";

const PAGE_SIZE = 48;
export function Archive({
  game,
  inspect,
  initialProductCode,
}: {
  game: GameState | null;
  initialProductCode?: string;
  inspect: (code: string, allowSpoilers?: boolean) => void;
}) {
  const { cards, loading, error, retry } = useCatalog();
  const [query, setQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [type, setType] = useState("all");
  const [faction, setFaction] = useState("all");
  const [productCode, setProductCode] = useState(initialProductCode || "all");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<"cards" | "products">("cards");
  const [includeStories, setIncludeStories] = useState(false);
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLSpanElement>(null);
  useEffect(
    () => setPage(0),
    [query, type, faction, productCode, includeStories, sort],
  );
  const pool = cards.length ? cards : coreCards;
  const available = useMemo(() => {
    const known = new Set(availableCards(game).map((c) => c.code));
    return pool.filter(
      (c) =>
        includeStories || (!c.hidden && isPlayerCard(c)) || known.has(c.code),
    );
  }, [pool, game, includeStories]);
  const searchable = useMemo(
    () =>
      available.map((c) => ({
        card: c,
        text: `${c.name} ${c.subname || ""} ${c.traits || ""} ${c.code} ${plain(c.text)} ${productsForCard(
          c,
        )
          .map((p) => p.name)
          .join(" ")}`.toLowerCase(),
      })),
    [available],
  );
  // Sealing story cards again removes encounter types and the Mythos class
  // from the menus; a filter that is no longer offered must not keep applying.
  const typeOffered =
    type === "all" || available.some((c) => c.type_code === type);
  const factionOffered = faction !== "mythos" || includeStories;
  useEffect(() => {
    if (!typeOffered) setType("all");
    if (!factionOffered) setFaction("all");
  }, [typeOffered, factionOffered]);
  const product = catalog.products.find((p) => p.code === productCode);
  const productCards = useMemo(
    () => (product ? new Set(product.cardCodes) : undefined),
    [product],
  );
  const search = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      searchable
        .filter(
          ({ card: c, text }) =>
            (type === "all" || c.type_code === type) &&
            (faction === "all" ||
              c.faction_code === faction ||
              c.faction2_code === faction ||
              c.faction3_code === faction) &&
            (!productCards || productCards.has(c.code)) &&
            matchesSearch(text, search),
        )
        .map(({ card }) => card)
        .sort((a, b) => {
          const byName =
            a.name.localeCompare(b.name) ||
            (a.xp || 0) - (b.xp || 0) ||
            a.code.localeCompare(b.code);
          if (sort === "xp") return (a.xp ?? 0) - (b.xp ?? 0) || byName;
          if (sort === "code")
            return (
              a.code.localeCompare(b.code, undefined, { numeric: true }) ||
              byName
            );
          return byName;
        }),
    [searchable, type, faction, productCards, search, sort],
  );
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const productSearch = productQuery.trim().toLowerCase();
  const products = catalog.products.filter(
    (p) =>
      (category === "all" || p.kind === category) &&
      matchesSearch(
        `${p.name} ${p.cycleName} ${p.code} ${kindLabel(p.kind)}`,
        productSearch,
      ),
  );
  const hasFilters =
    view === "cards"
      ? !!query ||
        type !== "all" ||
        faction !== "all" ||
        productCode !== "all" ||
        sort !== "name" ||
        includeStories
      : !!productQuery || category !== "all";
  function resetFilters() {
    searchRef.current?.focus();
    if (view === "products") {
      setProductQuery("");
      setCategory("all");
      return;
    }
    setQuery("");
    setType("all");
    setFaction("all");
    setProductCode("all");
    setSort("name");
    setIncludeStories(false);
  }
  function changePage(next: number) {
    setPage(next);
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ block: "start" });
      resultsRef.current?.focus({ preventScroll: true });
    });
  }
  function pagination(position: "top" | "bottom") {
    return (
      <nav
        className={`collection-pagination ${position}`}
        aria-label={`Card pages (${position})`}
      >
        <Button
          secondary
          disabled={currentPage === 0}
          onClick={() => changePage(currentPage - 1)}
        >
          <ArrowLeft size={16} /> Previous
        </Button>
        <label className="collection-page-select">
          Page
          <select
            aria-label={`Go to card page (${position})`}
            value={currentPage}
            onChange={(e) => changePage(Number(e.target.value))}
          >
            {Array.from({ length: pages }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
          of {pages}
        </label>
        <Button
          secondary
          disabled={currentPage + 1 >= pages}
          onClick={() => changePage(currentPage + 1)}
        >
          Next <ArrowRight size={16} />
        </Button>
      </nav>
    );
  }
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
      <div
        className="collection-tabs"
        role="group"
        aria-label="Collection view"
      >
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
            ref={searchRef}
            type="search"
            aria-label={view === "cards" ? "Search cards" : "Search products"}
            value={view === "cards" ? query : productQuery}
            onChange={(e) =>
              view === "cards"
                ? setQuery(e.target.value)
                : setProductQuery(e.target.value)
            }
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
              className="collection-product-filter"
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
            <select
              aria-label="Sort cards"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">Name · A–Z</option>
              <option value="xp">Experience · low to high</option>
              <option value="code">Card number</option>
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
        {hasFilters && (
          <Button secondary className="collection-reset" onClick={resetFilters}>
            Clear filters
          </Button>
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
            <span
              ref={resultsRef}
              tabIndex={-1}
              className="collection-result-count"
              role="status"
              aria-atomic="true"
            >
              {list.length.toLocaleString()} cards found
              {!!list.length &&
                ` · Showing ${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, list.length)}`}
            </span>
            <span>
              {includeStories ? <Eye size={13} /> : <LockKey size={13} />}
              {includeStories
                ? "Story spoilers are visible"
                : "Unseen story cards stay sealed"}
            </span>
          </div>
          {product && (
            <div className="collection-product-context">
              <span>
                Browsing <strong>{product.name}</strong>
              </span>
              <button type="button" onClick={() => setView("products")}>
                <ArrowLeft size={15} /> Back to products
              </button>
            </div>
          )}
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
          {pages > 1 && pagination("top")}
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
          {pages > 1 && pagination("bottom")}
          {!list.length && !loading && (
            <div className="empty-state">
              <MagnifyingGlass size={36} />
              <h2>No leads here.</h2>
              <p>
                {product && !includeStories
                  ? "This product may contain encounter cards. Enable story cards to browse them."
                  : "Try another card name or clear your filters."}
              </p>
              <Button secondary onClick={resetFilters}>
                Clear filters
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="archive-count">
            <span role="status" aria-atomic="true">
              {products.length} products found
            </span>
            <span>Catalogued content · game scripting varies by product</span>
          </div>
          {!products.length && (
            <div className="empty-state">
              <MagnifyingGlass size={36} />
              <h2>No products found.</h2>
              <p>
                Try another expansion name or clear your search and category.
              </p>
              <Button secondary onClick={resetFilters}>
                Clear filters
              </Button>
            </div>
          )}
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
