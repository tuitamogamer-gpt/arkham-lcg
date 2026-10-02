import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  X,
  Brain,
  BookOpen,
  HandFist,
  PersonSimpleRun,
  StarFour,
  Skull,
  Diamond,
  Eye,
  Flame,
  MagnifyingGlass,
  Backpack,
  Lightning,
  User,
  Heart,
  Shield,
} from "@phosphor-icons/react";
import {
  card,
  cardArt,
  cardArtSources,
  CARD_ART,
  CARD_BACKS,
  LOCATION_ART,
  plain,
  thumbArt,
} from "../game/data";
import scans from "../../public/data/art-manifest.json";
import type { Card, GameState, Skill } from "../game/types";
import { canInspectCard, canReadReverse } from "../game/knowledge";
import { kindLabel, productForCard, productsForCard } from "../game/catalog";
const dialogStack: HTMLElement[] = [];
let originalOverflow = "";
export function Sigil({ small = false }: { small?: boolean }) {
  return (
    <img
      src="/sigil.svg"
      className={small ? "sigil small" : "sigil"}
      alt="Arkham Chronicle emblem"
    />
  );
}
export function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  arrow = false,
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  secondary?: boolean;
  disabled?: boolean;
  arrow?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`button ${secondary ? "secondary" : ""} ${className}`}
    >
      {children}
      {arrow && (
        <span className="button-arrow">
          <ArrowUpRight size={17} />
        </span>
      )}
    </button>
  );
}
export function Modal({
  children,
  title,
  onClose,
  wide = false,
  compact = false,
}: {
  children: ReactNode;
  title: string;
  onClose?: () => void;
  wide?: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    if (!dialogStack.length) originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = ref.current;
    dialogStack.forEach((d) => {
      d.inert = true;
      d.setAttribute("aria-hidden", "true");
    });
    if (el) dialogStack.push(el);
    el?.focus({ preventScroll: true });
    const handler = (e: KeyboardEvent) => {
      if (dialogStack.at(-1) !== el) return;
      if (e.key === "Escape" && closeRef.current) {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const elements = el?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a, select, input, [tabindex="0"]',
        );
        if (!elements?.length) {
          e.preventDefault();
          return;
        }
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el?.addEventListener("keydown", handler);
    return () => {
      const index = dialogStack.indexOf(el!);
      if (index >= 0) dialogStack.splice(index, 1);
      const top = dialogStack.at(-1);
      if (top) {
        top.inert = false;
        top.removeAttribute("aria-hidden");
      } else document.body.style.overflow = originalOverflow;
      el?.removeEventListener("keydown", handler);
      before?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""} ${compact ? "compact" : ""}`}
        ref={ref}
        tabIndex={-1}
      >
        {onClose && (
          <button
            className="icon-button close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function SkillIcon({
  skill,
  size = 17,
}: {
  skill: Skill;
  size?: number;
}) {
  return <GameSymbol symbol={skill} size={size} />;
}
export function SkillStats({ values = [2, 4, 4, 2] }: { values?: number[] }) {
  return (
    <div className="skill-stats">
      {(["willpower", "intellect", "combat", "agility"] as Skill[]).map(
        (s, i) => (
          <span className={s} title={s} key={s}>
            <SkillIcon skill={s} />
            <b>{values[i]}</b>
          </span>
        ),
      )}
    </div>
  );
}
export function TypeIcon({ type, size = 28 }: { type: string; size?: number }) {
  const Icon =
    (
      {
        asset: Backpack,
        event: Lightning,
        skill: StarFour,
        enemy: Skull,
        treachery: Eye,
        location: MagnifyingGlass,
        investigator: User,
        act: BookOpen,
        agenda: Flame,
        scenario: Diamond,
      } as Record<string, typeof StarFour>
    )[type] || StarFour;
  return <Icon size={size} weight="light" />;
}
export function Token({
  token,
  large = false,
  size,
}: {
  token: string;
  large?: boolean;
  size?: number;
}) {
  return (
    <span
      className={`chaos-token ${large ? "large" : ""} ${token === "auto_fail" ? "fail" : token === "elder_sign" ? "bless" : ""}`}
      title={token.replaceAll("_", " ")}
      style={
        size ? { width: size, height: size, fontSize: size * 0.5 } : undefined
      }
    >
      {token in GAME_SYMBOLS ? (
        <GameSymbol
          symbol={token}
          size={size ? size * 0.58 : large ? 38 : 18}
        />
      ) : (
        token
      )}
    </span>
  );
}
export function CardFace({
  c,
  onClick,
  compact = false,
  selected = false,
}: {
  c: Card;
  onClick?: () => void;
  compact?: boolean;
  selected?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const artRef = useRef<HTMLImageElement>(null);
  const [visibleArt, setVisibleArt] = useState(false);
  const sources = cardArtSources(c);
  const sourceKey = sources.join("|");
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setSourceIndex(0);
  }, [c.code, sourceKey]);
  const art = sources[sourceIndex];
  const nextSource = () => {
    setLoaded(false);
    if (sourceIndex + 1 < sources.length) setSourceIndex(sourceIndex + 1);
    else setFailed(true);
  };
  useEffect(() => {
    const image = artRef.current;
    if (!image || !art || failed) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisibleArt(true);
        observer.disconnect();
      }
    }, {rootMargin: "200px"});
    observer.observe(image);
    return () => observer.disconnect();
  }, [art, failed]);
  useEffect(() => {
    if (!visibleArt || !art || art.startsWith("/") || loaded || failed) return;
    const timer = setTimeout(nextSource, 8000);
    return () => clearTimeout(timer);
  }, [visibleArt, art, loaded, failed, sourceIndex, sourceKey]);
  const product = productForCard(c);
  if (art && !failed)
    return (
      <button
        className={`card-face official-scan ${["act", "agenda", "investigator"].includes(c.type_code) ? "landscape-scan" : ""} ${compact ? "compact" : ""} ${c.faction_code} ${selected ? "selected" : ""}`}
        aria-label={`Inspect ${c.name}`}
        data-preview-code={c.code}
        onClick={onClick}
      >
        <img
          ref={artRef}
          src={compact ? thumbArt(art) : art}
          alt={`${c.name} card`}
          loading="lazy"
          decoding="async"
          style={loaded ? undefined : { opacity: 0 }}
          onLoad={() => setLoaded(true)}
          onError={nextSource}
        />
        {!loaded && (
          <span className="collection-scan-placeholder">
            <strong>{c.name}</strong>
            <span>
              {c.type_code} · {c.faction_code}
            </span>
            <span>{plain(c.text).slice(0, compact ? 100 : 240)}</span>
          </span>
        )}
        <span className="scan-caption">{c.name}</span>
      </button>
    );
  return (
    <button
      onClick={onClick}
      className={`card-face ${c.faction_code} ${compact ? "compact" : ""} ${selected ? "selected" : ""}`}
      aria-label={`Inspect ${c.name}`}
      data-preview-code={c.code}
    >
      <div className="card-inner">
        <div className="card-top">
          <span className="card-cost">
            {c.cost ?? <TypeIcon type={c.type_code} size={14} />}
          </span>
          <span>{c.type_code}</span>
          <span className="card-number">
            {c.position.toString().padStart(3, "0")}
          </span>
        </div>
        <div className="card-illustration">
          <div className="card-ornament" />
          <TypeIcon type={c.type_code} size={compact ? 32 : 42} />
        </div>
        <div className="card-copy">
          <h3>{c.name}</h3>
          <p>{c.subname || c.traits || c.faction_code}</p>
          {!compact && (
            <div className="card-text">
              {plain(c.text).slice(0, 190)}
              {plain(c.text).length > 190 ? "…" : ""}
            </div>
          )}
        </div>
        <div className="card-foot">
          {c.xp
            ? `${c.xp} XP`
            : c.subtype_code
              ? "WEAKNESS"
              : product?.name || "Player card"}
          <span>✧</span>
        </div>
      </div>
    </button>
  );
}
export function CardDetail({
  code,
  game,
  onClose,
  actions,
  allowSpoilers = false,
}: {
  code: string;
  game: GameState | null;
  onClose: () => void;
  actions?: ReactNode;
  allowSpoilers?: boolean;
}) {
  const c = card(code);
  const [flipped, setFlipped] = useState(false);
  const [backFailed, setBackFailed] = useState(false);
  useEffect(() => {
    setFlipped(false);
    setBackFailed(false);
  }, [code]);
  const mayInspect = canInspectCard(game, code) || (allowSpoilers && !!c);
  const mayReadReverse = canReadReverse(game, code) || (allowSpoilers && !!c);
  const product = c && productForCard(c);
  const editions = c ? productsForCard(c) : [];
  const genericBack =
    !["investigator", "act", "agenda", "location", "scenario"].includes(
      c?.type_code,
    ) && !c?.back_text;
  const backKind =
    c?.encounter_code && !["asset", "event", "skill"].includes(c.type_code)
      ? "encounter"
      : "player";
  const backSrc = genericBack
    ? CARD_BACKS[backKind]
    : (scans as Record<string, string>)[
        LOCATION_ART[code]?.unrevealed || `${code}b`
      ] ||
      (c && cardArt(c, true));
  const mayFlip =
    (!!backSrc || !!c?.back_text) && (genericBack || mayReadReverse);
  if (!mayInspect)
    return (
      <Modal title="Undiscovered card" onClose={onClose}>
        <div className="modal-intro">
          <h2>This discovery is still sealed.</h2>
          <p>Keep investigating to reveal this card.</p>
        </div>
      </Modal>
    );
  return (
    <Modal title={c.name} onClose={onClose} wide>
      <div className="card-detail">
        <div className="detail-art">
          {flipped && mayFlip && backSrc && !backFailed ? (
            <img
              className="detail-card-back"
              tabIndex={0}
              src={backSrc}
              alt={`${c.name} · reverse face`}
              data-preview-code={genericBack ? undefined : code}
              data-preview-face="back"
              data-preview-back={genericBack ? backKind : undefined}
              onError={() => setBackFailed(true)}
            />
          ) : flipped && mayFlip ? (
            <div className="collection-reverse-text">
              <h3>{c.back_name || c.name}</h3>
              <RulesText
                text={c.back_text || "Reverse artwork is unavailable."}
              />
            </div>
          ) : (
            <CardFace c={c} />
          )}
          {mayFlip && (
            <button
              className="turn-card-button"
              onClick={() => setFlipped((value) => !value)}
            >
              {flipped ? "Show card front" : "Turn card over"}
            </button>
          )}
        </div>
        <div className="detail-copy">
          <div className="eyebrow">
            {c.faction_code} / {c.type_code} / #{c.code}
          </div>
          <h2>{c.name}</h2>
          {c.subname && <p className="subname">{c.subname}</p>}
          {product && (
            <div className="collection-card-source">
              <span className="eyebrow">FROM YOUR COLLECTION</span>
              <strong>{product.name}</strong>
              <span>
                {kindLabel(product.kind)}
                {product.releaseDate
                  ? ` · ${product.releaseDateBasis?.startsWith("official") ? "Released" : "Catalog date"} ${product.releaseDate}`
                  : ""}
              </span>
              {editions.length > 1 && (
                <span>
                  Also included in:{" "}
                  {editions
                    .filter((p) => p.code !== product.code)
                    .map((p) => p.name)
                    .join(" · ")}
                </span>
              )}
            </div>
          )}
          <p className="traits">{c.traits}</p>
          <div className="detail-pills">
            {c.cost != null && <span>Cost {c.cost}</span>}
            {c.slot && <span>{c.slot}</span>}
            {c.health && (
              <span>
                <Heart size={15} /> {c.health}
              </span>
            )}
            {c.sanity && (
              <span>
                <Brain size={15} /> {c.sanity}
              </span>
            )}
            {c.shroud != null && <span>Shroud {c.shroud}</span>}
            {c.doom && <span>Doom {c.doom}</span>}
            {c.enemy_fight && (
              <span>
                <Shield size={15} /> Fight {c.enemy_fight}
              </span>
            )}
          </div>
          <p className="rules-text">
            <RulesText
              text={
                c.text ||
                "This asset provides the health and sanity shown on the card."
              }
            />
          </p>
          {actions}
          {c.flavor && <blockquote>{plain(c.flavor)}</blockquote>}
          {c.back_text && mayReadReverse && (
            <details>
              <summary>Reverse side</summary>
              {c.back_name && <h3>{c.back_name}</h3>}
              {c.back_flavor && <blockquote>{plain(c.back_flavor)}</blockquote>}
              <p className="rules-text">
                <RulesText text={c.back_text} />
              </p>
            </details>
          )}
          {c.back_text && !mayReadReverse && (
            <p className="sealed-note">
              The reverse side opens when the story advances.
            </p>
          )}
          <div className="detail-credit">
            {c.errata_date && (
              <p>
                Rules text includes the {c.errata_date} source update. The scan
                may show earlier printed wording.
              </p>
            )}
            {c.illustrator && (
              <>
                Illustration: {c.illustrator}
                <br />
              </>
            )}
            Card data from{" "}
            {c.encounter_code && !mayReadReverse ? (
              "ArkhamDB"
            ) : (
              <a
                href={c.url || `https://arkhamdb.com/card/${c.code}`}
                target="_blank"
                rel="noreferrer"
              >
                {c.url && !c.url.includes("arkhamdb.com")
                  ? "Card source"
                  : "ArkhamDB"}{" "}
                <ArrowUpRight size={12} />
              </a>
            )}{" "}
            · Fantasy Flight Games
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Metadata consumed by the one shared pointer/keyboard preview layer. */
export function HoverPreview({
  code,
  title,
  text,
  children,
}: {
  code?: string;
  title?: string;
  text?: string;
  children: ReactNode;
}) {
  return (
    <span
      className="hover-trigger"
      data-preview-code={code}
      data-preview-title={title}
      data-preview-text={text}
    >
      {children}
    </span>
  );
}

export function RulesText({ text = "" }: { text?: string }) {
  return (
    <>
      {text
        .replace(/<[^>]*>/g, "")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .split(/(\[[a-z_]+\])/g)
        .map((part, i) => {
          const symbol = /^\[([a-z_]+)\]$/.exec(part)?.[1];
          return symbol && symbol in GAME_SYMBOLS ? (
            <GameSymbol key={i} symbol={symbol} />
          ) : (
            <span key={i}>{plain(part)}</span>
          );
        })}
    </>
  );
}

const GAME_SYMBOLS: Record<string, string> = {
  tarot_inverted: "A",
  tarot: "B",
  accessory_inverted: "C",
  accessory: "D",
  ally_inverted: "E",
  ally: "F",
  arcane_inverted: "G",
  arcane_x2_inverted: "H",
  arcane_x2: "I",
  arcane: "J",
  body_inverted: "K",
  body: "L",
  hand_x2_inverted: "N",
  hand_x2: "O",
  hand_inverted: "M",
  hand: "P",
  head_inverted: "_",
  head: "`",
  health: "Q",
  sanity: "R",
  sanity_inverted: "S",
  health_inverted: "T",
  "star-fill": "U",
  "star-outline": "V",
  star: "W",
  "x-fill": "X",
  "x-outline": "Y",
  x: "Z",
  "num0-fill": "[",
  "num0-outline": "]",
  num0: "{",
  "num1-fill": "}",
  "num1-outline": ";",
  num1: ":",
  "num2-fill": "'",
  "num2-outline": '"',
  num2: ",",
  "num3-fill": "<",
  "num3-outline": ".",
  num3: ">",
  "num4-fill": "/",
  num4: "1",
  "num5-fill": "!",
  "num5-outline": "2",
  num5: "@",
  "num6-fill": "3",
  "num6-outline": "#",
  num6: "4",
  "num7-fill": "$",
  "num7-outline": "5",
  num7: "%",
  "num8-fill": "6",
  "num8-outline": "^",
  num8: "7",
  "num9-fill": "&",
  "num9-outline": "8",
  num9: "*",
  "numNull-fill": "9",
  "numNull-outline": "(",
  numNull: "0",
  guardian: ")",
  seeker: "b",
  mystic: "c",
  rogue: "d",
  survivor: "e",
  willpower: "f",
  intellect: "g",
  combat: "h",
  agility: "i",
  wild: "j",
  elder_sign: "k",
  neutral: "l",
  skull: "m",
  cultist: "n",
  tablet: "o",
  elder_thing: "p",
  auto_fail: "q",
  per_investigator: "r",
  weakness: "s",
  action: "t",
  reaction: "u",
  free: "v",
  bullet: "w",
  guide_bullet: "x",
  curse: "y",
  bless: "z",
  fast: "v",
};
export function GameSymbol({
  symbol,
  size = 17,
}: {
  symbol: string;
  size?: number;
}) {
  return (
    <span
      className={`game-symbol symbol-${symbol}`}
      style={{ fontSize: size }}
      role="img"
      aria-label={symbol.replaceAll("_", " ")}
      title={symbol.replaceAll("_", " ")}
    >
      {GAME_SYMBOLS[symbol] || symbol}
    </span>
  );
}
