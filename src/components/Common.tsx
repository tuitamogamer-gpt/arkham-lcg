import { useEffect, useRef, type ReactNode } from "react";
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
import { card, CARD_ART, plain } from "../game/data";
import type { Card, Skill } from "../game/types";
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
  onClick?: () => void;
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
}: {
  children: ReactNode;
  title: string;
  onClose?: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = ref.current;
    el?.focus({ preventScroll: true });
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
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
      document.body.style.overflow = body;
      el?.removeEventListener("keydown", handler);
      before?.focus({ preventScroll: true });
    };
  }, [onClose]);
  return (
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
        className={`modal ${wide ? "wide" : ""}`}
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
    </div>
  );
}
const skillIcons = {
  willpower: Brain,
  intellect: BookOpen,
  combat: HandFist,
  agility: PersonSimpleRun,
};
export function SkillIcon({
  skill,
  size = 17,
}: {
  skill: Skill;
  size?: number;
}) {
  const Icon = skillIcons[skill];
  return <Icon size={size} weight="light" />;
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
}: {
  token: string;
  large?: boolean;
}) {
  const Icon = (
    {
      skull: Skull,
      tablet: Diamond,
      elder_thing: Eye,
      elder_sign: StarFour,
      auto_fail: X,
    } as Record<string, typeof Skull>
  )[token];
  return (
    <span
      className={`chaos-token ${large ? "large" : ""} ${token === "auto_fail" ? "fail" : token === "elder_sign" ? "bless" : ""}`}
      title={token.replaceAll("_", " ")}
    >
      {Icon ? <Icon size={large ? 40 : 17} weight="light" /> : token}
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
  if (CARD_ART[c.code] && !compact)
    return (
      <button
        className={`card-face official-scan ${c.faction_code} ${selected ? "selected" : ""}`}
        aria-label={`Inspect ${c.name}`}
        onClick={onClick}
      >
        <img src={CARD_ART[c.code]} alt={`${c.name} card`} loading="lazy" />
        <span className="scan-caption">{c.name}</span>
      </button>
    );
  return (
    <button
      onClick={onClick}
      className={`card-face ${c.faction_code} ${compact ? "compact" : ""} ${selected ? "selected" : ""}`}
      aria-label={`Inspect ${c.name}`}
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
        <div className={`card-illustration ${CARD_ART[c.code] ? "real" : ""}`}>
          {CARD_ART[c.code] ? (
            <img src={CARD_ART[c.code]} alt="" loading="lazy" />
          ) : (
            <>
              <div className="card-ornament" />
              <TypeIcon type={c.type_code} size={compact ? 32 : 42} />
            </>
          )}
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
              : "CORE SET · 2026"}
          <span>✧</span>
        </div>
      </div>
    </button>
  );
}
export function CardDetail({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  const c = card(code);
  return (
    <Modal title={c.name} onClose={onClose} wide>
      <div className="card-detail">
        <div className="detail-art">
          {CARD_ART[code] ? (
            <img src={CARD_ART[code]} alt={`${c.name} card`} />
          ) : (
            <CardFace c={c} />
          )}
        </div>
        <div className="detail-copy">
          <div className="eyebrow">
            {c.faction_code} / {c.type_code} / #{c.code}
          </div>
          <h2>{c.name}</h2>
          {c.subname && <p className="subname">{c.subname}</p>}
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
            {plain(c.text) ||
              "This asset provides the health and sanity shown on the card."}
          </p>
          {c.flavor && <blockquote>{plain(c.flavor)}</blockquote>}
          {c.back_text && (
            <details>
              <summary>Reverse side</summary>
              <p className="rules-text">{plain(c.back_text)}</p>
            </details>
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
            <a
              href={`https://arkhamdb.com/card/${c.code}`}
              target="_blank"
              rel="noreferrer"
            >
              ArkhamDB <ArrowUpRight size={12} />
            </a>{" "}
            · Fantasy Flight Games
          </div>
        </div>
      </div>
    </Modal>
  );
}
