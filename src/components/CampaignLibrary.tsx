import { useMemo, useState } from "react";
import { ArrowRight, Books, MagnifyingGlass } from "@phosphor-icons/react";
import { catalog, kindLabel } from "../game/catalog";
import { matchesSearch } from "../game/search";
import { Button } from "./Common";
import "../campaign-library.css";

export function CampaignLibrary({
  onPlay,
  onCards,
  hasGame,
}: {
  onPlay: () => void;
  onCards: (productCode?: string) => void;
  hasGame: boolean;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const products = useMemo(
    () =>
      catalog.products.filter(
        (product) =>
          (kind === "all" || product.kind === kind) &&
          matchesSearch(
            `${product.name} ${product.cycleName} ${product.code} ${kindLabel(product.kind)}`,
            query,
          ),
      ),
    [query, kind],
  );
  const legacyLink = new URLSearchParams(window.location.hash.slice(1)).has(
    "investigation",
  );
  return (
    <section
      className="page-content campaign-library"
      aria-label="Campaign and expansion library"
    >
      <div className="eyebrow">The wider investigation</div>
      <h1>Expansions &amp; campaigns</h1>
      <p className="page-subtitle">
        Play in your browser. Explore the collection at your own pace.
      </p>
      {legacyLink && (
        <p className="campaign-library-notice" role="status">
          This link belongs to a separate rules-engine investigation. It cannot
          be opened in the browser game. Its original save has not been changed.
        </p>
      )}
      <article className="campaign-browser-case">
        <div>
          <span className="eyebrow">PLAYABLE IN YOUR BROWSER</span>
          <h2>Spreading Flames</h2>
          <p>
            Lead 1–3 investigators with five official starter decks. Your
            progress saves on this device; export a backup from Settings &amp;
            saves to move it.
          </p>
          <p>
            No installation or account needed. Play offline once the app has
            been cached.
          </p>
        </div>
        <Button onClick={onPlay} arrow>
          {hasGame ? "Return to your investigation" : "Choose party & play"}
        </Button>
      </article>
      <div className="campaign-catalog-heading">
        <div>
          <h2>
            <Books size={24} aria-hidden="true" /> Explore the imported
            collection
          </h2>
          <p>
            {catalog.counts.cardCount.toLocaleString()} card definitions across{" "}
            {catalog.products.length} products. Other scenarios are available to
            browse; they are not playable in this browser version. Story cards
            stay sealed until you choose to reveal them.
          </p>
        </div>
        <Button secondary onClick={() => onCards()}>
          Open card archive <ArrowRight size={16} />
        </Button>
      </div>
      <div className="campaign-library-filters">
        <label>
          <span>Search products</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Campaign, expansion or product code…"
          />
        </label>
        <label>
          <span>Product category</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">All product categories</option>
            {[...new Set(catalog.products.map((product) => product.kind))]
              .sort()
              .map((value) => (
                <option key={value} value={value}>
                  {kindLabel(value)}
                </option>
              ))}
          </select>
        </label>
        {(query || kind !== "all") && (
          <Button
            secondary
            onClick={() => {
              setQuery("");
              setKind("all");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
      <p role="status" aria-atomic="true">
        {products.length} products found
      </p>
      {!products.length && (
        <div className="empty-state">
          <MagnifyingGlass size={32} aria-hidden="true" />
          <h2>No products found.</h2>
          <p>Try a different name or clear the filters.</p>
        </div>
      )}
      <div className="collection-products">
        {products.map((product) => (
          <article key={product.code}>
            <span className="eyebrow">{kindLabel(product.kind)}</span>
            <h2>{product.name}</h2>
            <p>{product.cycleName}</p>
            <p>
              {product.cardCodes.length} card definitions · Collection available
            </p>
            <Button
              secondary
              aria-label={`Browse cards: ${product.name}`}
              onClick={() => onCards(product.code)}
            >
              Browse cards <ArrowRight size={16} />
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
