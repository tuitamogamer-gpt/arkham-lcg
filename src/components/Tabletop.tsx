import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Coins,
  Eye,
  Fire,
  HandFist,
  Heart,
  MagnifyingGlass,
  MapPin,
  Skull,
  Stack,
  StarFour,
} from "@phosphor-icons/react";
import scans from "../../public/data/art-manifest.json";
import { card, CARD_ART, CONNECTIONS, LOCATION_ART, plain } from "../game/data";
import {
  availableConnections,
  health,
  party,
  partySize,
  sanity,
  stats,
} from "../game/engine";
import type { GameState } from "../game/types";
import { CardFace, Modal, SkillStats, Token, HoverPreview } from "./Common";
import {
  INVESTIGATION_ABILITIES,
  investigationAbilityStatus,
} from "./InvestigationAbility";

const nativeArt: Record<string, string> = scans;

export function TableCard({
  code,
  back = false,
}: {
  code: string;
  back?: boolean;
}) {
  const c = card(code);
  const faces = LOCATION_ART[code];
  const src = faces
    ? nativeArt[back ? faces.unrevealed : faces.revealed]
    : back
      ? nativeArt[`${code}b`]
      : nativeArt[code] || CARD_ART[code];
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      onError={() => setFailed(true)}
      className="table-card-image"
      data-preview-code={code}
      data-preview-face={back ? "back" : "front"}
      src={src}
      alt={`${c.name}${faces ? (back ? " · unrevealed" : " · revealed") : back ? " · reverse face" : ""}`}
    />
  ) : (
    <span
      data-preview-code={code}
      data-preview-face={back ? "back" : "front"}
      className={`table-card-fallback ${back ? "unrevealed-face" : ""}`}
    >
      <span>{back ? "UNEXPLORED LOCATION" : c.type_code}</span>
      <StarFour size={32} weight="thin" />
      <strong>{c.name}</strong>
      <small>Hover or inspect to read the card</small>
    </span>
  );
}

export function TableToken({
  kind,
  value,
  label,
  motionTarget,
}: {
  kind: "clue" | "doom" | "resource" | "damage" | "horror";
  value: number;
  label?: string;
  motionTarget?: string;
}) {
  const Icon = {
    clue: MagnifyingGlass,
    doom: Skull,
    resource: Coins,
    damage: Heart,
    horror: Brain,
  }[kind];
  return (
    <span
      className={`table-token token-${kind}`}
      data-motion-target={motionTarget}
      title={label || `${value} ${kind}`}
      aria-label={label || `${value} ${kind}`}
    >
      <Icon size={14} weight="fill" aria-hidden="true" />
      <b key={value} className="token-value">
        {value}
      </b>
    </span>
  );
}

export function ScenarioTray({
  game: s,
  objective,
  inspect,
}: {
  game: GameState;
  objective: string;
  inspect: (code: string) => void;
}) {
  const clues = party(s)
    .filter((p) => p.status === "active")
    .reduce((n, p) => n + p.clues, 0);
  const target =
    s.act === 1 ? 2 * partySize(s) : s.act === 3 ? 3 * partySize(s) : null;
  return (
    <section
      className="story-track scenario-tray"
      aria-label="Agenda and act decks"
    >
      <div className="table-zone-label">
        <BookOpen size={13} /> THE STORY
      </div>
      <div className="story-pile">
        <div className="pile-heading">
          <span>AGENDA {s.agenda} / 3</span>
          <span>THE THREAT</span>
        </div>
        <HoverPreview code={String(12105 + s.agenda)}>
          <button
            className="story-card agenda-card physical-card landscape-card"
            data-motion-target="agenda"
            onClick={() => inspect(String(12105 + s.agenda))}
            aria-label={`Inspect agenda: ${card(String(12105 + s.agenda)).name}`}
          >
            <TableCard code={String(12105 + s.agenda)} />
          </button>
        </HoverPreview>
        <div className="story-progress doom-progress">
          <TableToken
            kind="doom"
            motionTarget="doom"
            value={s.doom}
            label={`${s.doom} doom on the agenda`}
          />
          <span className="story-progress-copy">
            <strong>
              {s.doom} / {[3, 5, 10][s.agenda - 1]}
            </strong>{" "}
            <small>doom</small>
          </span>
          <div className="doom-pips" aria-hidden="true">
            {Array.from({ length: [3, 5, 10][s.agenda - 1] }, (_, i) => (
              <i key={i} className={i < s.doom ? "filled" : ""} />
            ))}
          </div>
        </div>
      </div>
      <div className="story-pile">
        <div className="pile-heading">
          <span>ACT {s.act} / 4</span>
          <span>YOUR OBJECTIVE</span>
        </div>
        <HoverPreview code={String(12108 + s.act)}>
          <button
            className="story-card act-card physical-card landscape-card"
            data-motion-target="act"
            onClick={() => inspect(String(12108 + s.act))}
            aria-label={`Inspect act: ${card(String(12108 + s.act)).name}`}
            title={objective}
          >
            <TableCard code={String(12108 + s.act)} />
          </button>
        </HoverPreview>
        <div className="story-progress">
          <TableToken
            kind="clue"
            value={clues}
            label={`${clues} group clues`}
          />
          <span className="story-progress-copy">
            <strong>
              {clues}
              {target !== null ? ` / ${target}` : ""}
            </strong>{" "}
            <small>group clues</small>
          </span>
          {target !== null && (
            <div
              className="clue-meter"
              role="meter"
              aria-label="Group clues toward the objective"
              aria-valuenow={Math.min(clues, target)}
              aria-valuemin={0}
              aria-valuemax={target}
            >
              <span
                style={{ width: `${Math.min(100, (clues / target) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function LocationTable({
  game: s,
  locked,
  inspect,
  move,
}: {
  game: GameState;
  locked: boolean;
  inspect: (code: string) => void;
  move: (code: string) => void;
}) {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const near = availableConnections(s);
  const roster = party(s);
  const active = s.locations.filter((l) => l.active);
  const positions: Record<string, [number, number]> =
    s.act <= 2
      ? { "12113": [18, 50], "12117": [50, 50], "12116": [82, 50] }
      : {
          "12117": [12, 50],
          "12116": [39, 50],
          "12118": [65, 24],
          "12119": [65, 76],
          "12120": [89, 50],
        };
  const pos = (code: string): [number, number] => {
    if (active.length === 1) return [50, 50];
    if (narrow && s.act === 2)
      return [
        50,
        ({ "12113": 17, "12117": 50, "12116": 83 } as Record<string, number>)[
          code
        ] || 50,
      ];
    if (narrow && s.act >= 3)
      return (
        (
          {
            "12117": [24, 17],
            "12116": [50, 50],
            "12118": [76, 17],
            "12119": [24, 83],
            "12120": [76, 83],
          } as Record<string, [number, number]>
        )[code] || [50, 50]
      );
    return positions[code] || [50, 50];
  };
  return (
    <section
      className={`location-board act-${s.act}`}
      aria-label="Location map"
    >
      <div className="board-header">
        <span>
          <MapPin size={13} /> MISKATONIC UNIVERSITY
        </span>
        <span>
          {active.filter((l) => l.revealed).length} / {active.length} explored
        </span>
      </div>
      <div className="map-stage">
        <svg
          className="map-lines"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {active.flatMap((l) =>
            (CONNECTIONS[l.code] || [])
              .filter(
                (code) => code > l.code && active.some((x) => x.code === code),
              )
              .map((code) => (
                <line
                  key={l.code + code}
                  x1={pos(l.code)[0]}
                  y1={pos(l.code)[1]}
                  x2={pos(code)[0]}
                  y2={pos(code)[1]}
                />
              )),
          )}
        </svg>
        <div className="table-watermark" aria-hidden="true">
          <StarFour weight="thin" />
          <span>
            MISKATONIC
            <br />
            UNIVERSITY
          </span>
          <small>ARKHAM, MASSACHUSETTS</small>
        </div>
        {active.map((l) => {
          const here = roster.filter(
            (p) => p.status === "active" && p.location === l.code,
          );
          const enemies = s.enemies.filter((e) => e.location === l.code);
          const canMove = near.includes(l.code) && !locked;
          return (
            <div
              key={l.code}
              data-motion-target={`location-${l.code}`}
              aria-label={card(l.code).name}
              className={`map-location ${l.code === s.player.location ? "current" : ""} ${l.revealed ? "revealed" : "unrevealed"} ${l.fire ? "burning" : ""} ${near.includes(l.code) ? "connected" : ""}`}
              style={{ left: `${pos(l.code)[0]}%`, top: `${pos(l.code)[1]}%` }}
            >
              {l.code === s.player.location && (
                <span className="you-marker">
                  <MapPin size={10} weight="fill" /> YOUR LOCATION
                </span>
              )}
              <button
                className="location-card physical-card"
                onClick={() =>
                  canMove ? move(l.code) : l.revealed && inspect(l.code)
                }
                disabled={!canMove && !l.revealed}
                aria-label={`${canMove ? "Move to" : "Inspect"} ${card(l.code).name}`}
                title={
                  canMove
                    ? `Move to ${card(l.code).name} · ${partySize(s) <= 2 && s.player.location === "12116" && !s.flags.quad ? "free" : "1 action"}`
                    : card(l.code).name
                }
              >
                <TableCard code={l.code} back={!l.revealed} />
              </button>
              <div className="location-counters">
                {l.revealed && (
                  <TableToken
                    kind="clue"
                    value={l.clues}
                    label={`${l.clues} clues at ${card(l.code).name}`}
                  />
                )}
                {l.fire && (
                  <span
                    className="table-fire"
                    title="On fire"
                    aria-label="On fire"
                  >
                    <Fire size={19} weight="fill" />
                  </span>
                )}
              </div>
              <div className="location-pawns">
                {here.map((p) => (
                  <span
                    key={p.code}
                    data-preview-code={p.code}
                    tabIndex={0}
                    data-motion-target={`pawn-${p.code}`}
                    className={`mini-investigator ${card(p.code).faction_code} ${p.turnEnded ? "spent" : ""}`}
                    title={`${card(p.code).name}${p.turnEnded ? " · turn complete" : ""}`}
                    aria-label={`${card(p.code).name} at ${card(l.code).name}`}
                    style={{ backgroundImage: `url(${CARD_ART[p.code]})` }}
                  >
                    <small>
                      {card(p.code)
                        .name.split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </small>
                  </span>
                ))}
              </div>
              <div
                className="location-enemies"
                aria-label={`Enemies at ${card(l.code).name}`}
              >
                {enemies.map((enemy) => (
                  <button
                    key={enemy.id}
                    className={`enemy-miniature ${enemy.exhausted ? "exhausted" : ""} ${enemy.engaged ? "engaged" : ""}`}
                    data-motion-target={`enemy-token-${enemy.id}`}
                    data-preview-code={enemy.code}
                    onClick={() => inspect(enemy.code)}
                    aria-label={`Inspect ${card(enemy.code).name} at ${card(l.code).name}`}
                  >
                    <img src={CARD_ART[enemy.code]} alt="" />
                    <span>
                      {enemy.exhausted
                        ? "Z"
                        : enemy.damage
                          ? `−${enemy.damage}`
                          : "!"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="location-caption">
                <h3>{card(l.code).name}</h3>
                {l.revealed && (
                  <button
                    className="location-inspect"
                    onClick={() => inspect(l.code)}
                    title={`Read ${card(l.code).name}`}
                    aria-label={`Read ${card(l.code).name}`}
                  >
                    <Eye size={12} />
                  </button>
                )}
              </div>
              <div className="location-meta">
                <span>
                  {l.revealed
                    ? `Shroud ${Math.max(0, (card(l.code).shroud || 0) - l.reduction)}`
                    : "Unexplored"}
                </span>
                {enemies.length > 0 && (
                  <span className="map-enemy-count">
                    <Skull size={11} />
                    {enemies.length}
                  </span>
                )}
                {canMove && (
                  <span className="move-hint">
                    Move <ArrowRight size={10} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="board-legend">
        <span>
          <i /> Connected location
        </span>
        <span>
          Click to move · <Eye size={12} /> to read
        </span>
      </div>
    </section>
  );
}

function CardBack({ encounter = false }: { encounter?: boolean }) {
  const [failed, setFailed] = useState(false);
  const kind = encounter ? "encounter" : "player";
  return (
    <span className={`table-card-back ${kind}-back`} data-preview-back={kind}>
      {!failed ? (
        <img
          src={`/art/backs/${kind}.png`}
          alt={`${encounter ? "Encounter" : "Player"} card back`}
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <StarFour size={40} weight="thin" />
          <span className="back-wordmark">ARKHAM HORROR</span>
        </>
      )}
    </span>
  );
}

export function SupplyTray({
  game: s,
  inspect,
}: {
  game: GameState;
  inspect: (code: string) => void;
}) {
  const [view, setView] = useState<"encounter" | "bag" | "victory" | null>(
    null,
  );
  const top = s.encounterDiscard.at(-1);
  const hard = s.difficulty === "hard" || s.difficulty === "expert";
  return (
    <aside className="supply-tray" aria-label="Encounter deck and chaos bag">
      <div className="table-zone-label">
        <Stack size={13} /> THE MYTHOS
      </div>
      <div className="encounter-piles">
        <button
          className="deck-pile"
          data-motion-target="encounter-deck"
          onClick={() => setView("encounter")}
          aria-label="Encounter deck and discard"
        >
          <CardBack encounter />
          <span className="pile-count">{s.encounterDeck.length}</span>
          <span className="deck-caption">Encounter deck</span>
        </button>
        <button
          className={`discard-pile ${top ? "has-cards" : ""}`}
          onClick={() => setView("encounter")}
          aria-label={`Encounter discard · ${s.encounterDiscard.length} cards`}
          data-motion-target="encounter-discard"
        >
          <span className="discard-face">
            {top ? (
              <TableCard code={top} />
            ) : (
              <>
                <Stack size={24} weight="thin" />
                <small>DISCARD</small>
              </>
            )}
          </span>
          <span className="deck-caption">
            Discard · {s.encounterDiscard.length}
          </span>
        </button>
      </div>
      <button
        className="chaos-bag-button"
        onClick={() => setView("bag")}
        aria-label="Inspect chaos bag"
      >
        <span className="bag-illustration">
          <StarFour size={27} weight="thin" />
        </span>
        <span>
          <strong>Chaos bag</strong>
          <small>
            {s.bag.length} tokens · {s.difficulty}
          </small>
        </span>
      </button>
      <button
        className="victory-button"
        data-motion-target="victory-display"
        onClick={() => setView("victory")}
      >
        <StarFour size={13} /> Victory display <b>{s.victory.length}</b>
      </button>
      {view && (
        <Modal
          title={
            view === "bag"
              ? "Chaos bag"
              : view === "victory"
                ? "Victory display"
                : "Encounter deck and discard"
          }
          onClose={() => setView(null)}
          compact
        >
          <div className="modal-intro">
            <div className="eyebrow">Spreading Flames · {s.difficulty}</div>
            <h2>
              {view === "bag"
                ? "The chaos bag"
                : view === "victory"
                  ? "Victory display"
                  : "The encounter deck"}
            </h2>
            <p>
              {view === "bag"
                ? "The bag is public. Draw a token when a skill test asks you to."
                : view === "victory"
                  ? "Cards earned during this scenario."
                  : `${s.encounterDeck.length} cards remain facedown. The discard pile is public.`}
            </p>
          </div>
          {view === "bag" ? (
            <>
              <div className="bag-token-list">
                {s.bag.map((token, i) => (
                  <Token token={token} key={`${token}-${i}`} />
                ))}
              </div>
              <div className="bag-reference">
                <TableCard code="12105" back={hard} />
                <p>
                  {plain(hard ? card("12105").back_text : card("12105").text)}
                </p>
              </div>
            </>
          ) : (
            <div className="public-pile-list">
              {(view === "victory"
                ? s.victory
                : [...s.encounterDiscard].reverse()
              ).map((code, i) => (
                <CardFace
                  key={`${code}-${i}`}
                  c={card(code)}
                  compact
                  onClick={() => inspect(code)}
                />
              ))}
              {(view === "victory"
                ? !s.victory.length
                : !s.encounterDiscard.length) && (
                <p className="empty-pile-note">No cards here yet.</p>
              )}
            </div>
          )}
        </Modal>
      )}
    </aside>
  );
}

export function InvestigatorMat({
  game: s,
  inspect,
  openDeck,
  children,
}: {
  game: GameState;
  inspect: (code: string, assetId?: string) => void;
  openDeck: () => void;
  children?: ReactNode;
}) {
  const p = s.player;
  const top = p.discard.at(-1);
  return (
    <section
      className={`investigator-panel investigator-mat ${card(p.code).faction_code}`}
      aria-label={`${card(p.code).name}'s play area`}
    >
      <div className="investigator-identity">
        <div className="mat-heading">
          <span className="table-zone-label">YOUR INVESTIGATOR</span>
          <span>{card(p.code).faction_code}</span>
        </div>
        <HoverPreview code={p.code}>
          <button
            className="investigator-card physical-card landscape-card"
            onClick={() => inspect(p.code)}
            aria-label={`Inspect ${card(p.code).name}`}
          >
            <TableCard code={p.code} />
          </button>
        </HoverPreview>
        <SkillStats
          values={(
            ["willpower", "intellect", "combat", "agility"] as const
          ).map((k) => stats(s, k))}
        />
        <div className="investigator-token-pool">
          <div>
            <TableToken
              kind="damage"
              motionTarget={`damage-${p.code}`}
              value={p.damage}
              label={`${p.damage} damage; ${Math.max(0, health(s) - p.damage)} of ${health(s)} health remaining`}
            />
            <small>
              Damage{" "}
              <b>
                {p.damage}/{health(s)}
              </b>
            </small>
          </div>
          <div>
            <TableToken
              kind="horror"
              motionTarget={`horror-${p.code}`}
              value={p.horror}
              label={`${p.horror} horror; ${Math.max(0, sanity(s) - p.horror)} of ${sanity(s)} sanity remaining`}
            />
            <small>
              Horror{" "}
              <b>
                {p.horror}/{sanity(s)}
              </b>
            </small>
          </div>
          <div>
            <TableToken
              kind="resource"
              motionTarget={`resource-${p.code}`}
              value={p.resources}
              label={`${p.resources} resources`}
            />
            <small>Resources</small>
          </div>
          <div>
            <TableToken
              kind="clue"
              motionTarget={`clue-${p.code}`}
              value={p.clues}
              label={`${p.clues} clues`}
            />
            <small>Clues</small>
          </div>
        </div>
      </div>
      <div className="mat-assets">
        <section className="assets-section">
          <div className="zone-heading">
            <h3>
              Assets in play <span>{p.assets.length}</span>
            </h3>
            <small className="exhaustion-note">
              <ArrowRight size={13} aria-hidden="true" /> Turn sideways when
              exhausted
            </small>
          </div>
          <div className="asset-row">
            {p.assets.map((asset) => (
              <div
                key={asset.id}
                data-motion-target={`card-${asset.id}`}
                data-preview-asset-id={asset.id}
                className={`table-asset ${asset.exhausted ? "exhausted" : ""}`}
              >
                <HoverPreview code={asset.code}>
                  <CardFace
                    c={card(asset.code)}
                    compact
                    onClick={() => inspect(asset.code, asset.id)}
                  />
                </HoverPreview>
                <div className="asset-counters">
                  {(asset.uses > 0 ||
                    ["12019", "12045"].includes(asset.code)) && (
                    <span
                      className="uses-counter"
                      data-motion-target={`uses-${asset.id}`}
                      title={`${asset.uses} ${["12019", "12045"].includes(asset.code) ? "ammo" : "uses"}`}
                    >
                      <Coins size={10} />
                      {asset.uses}{" "}
                      {["12019", "12045"].includes(asset.code)
                        ? "ammo"
                        : "uses"}
                    </span>
                  )}
                  {asset.damage > 0 && (
                    <TableToken kind="damage" value={asset.damage} />
                  )}
                  {asset.horror > 0 && (
                    <TableToken kind="horror" value={asset.horror} />
                  )}
                </div>
                <span className="asset-name">{card(asset.code).name}</span>
                {INVESTIGATION_ABILITIES[asset.code] && (
                  <button
                    className="asset-ability-trigger"
                    aria-label={`Choose ${card(asset.code).name} ability`}
                    onClick={() => inspect(asset.code, asset.id)}
                  >
                    Investigate · choose ability
                    <small>{investigationAbilityStatus(asset)}</small>
                  </button>
                )}
                {asset.exhausted && (
                  <span className="asset-exhausted-label">EXHAUSTED</span>
                )}
              </div>
            ))}
            {!p.assets.length && (
              <div className="empty-assets">
                <div className="equipment-etching" aria-hidden="true">
                  <span>
                    <StarFour size={23} weight="thin" />
                  </span>
                  <span>
                    <HandFist size={29} weight="thin" />
                  </span>
                  <span>
                    <MagnifyingGlass size={23} weight="thin" />
                  </span>
                </div>
                <div className="equipment-caption">
                  <strong>Ready your equipment</strong>
                  <small>Play an asset from your hand</small>
                </div>
              </div>
            )}
          </div>
        </section>
        {p.threats.length > 0 && (
          <section className="personal-threats" aria-label="Threat area">
            <div className="table-zone-label">
              <Skull size={12} /> IN YOUR THREAT AREA
            </div>
            <div>
              {p.threats.map((code, i) => (
                <HoverPreview key={`${code}-${i}`} code={code}>
                  <button onClick={() => inspect(code)}>
                    <Skull size={13} />
                    {card(code).name}
                    <Eye size={12} />
                  </button>
                </HoverPreview>
              ))}
            </div>
          </section>
        )}
        {children}
      </div>
      <div className="player-piles">
        <div className="table-zone-label">YOUR CARDS</div>
        <div className="player-pile-row">
          <button
            className="deck-pile"
            onClick={openDeck}
            data-motion-target={`player-deck-${p.code}`}
            aria-label="Inspect your deck and discard"
          >
            <CardBack />
            <span className="pile-count">{p.deck.length}</span>
            <span className="deck-caption">Draw pile</span>
          </button>
          <button
            className={`discard-pile ${top ? "has-cards" : ""}`}
            onClick={openDeck}
            aria-label={`Your discard · ${p.discard.length} cards`}
            data-motion-target={`player-discard-${p.code}`}
          >
            <span className="discard-face">
              {top ? (
                <TableCard code={top.code} />
              ) : (
                <>
                  <Stack size={21} weight="thin" />
                  <small>DISCARD</small>
                </>
              )}
            </span>
            <span className="deck-caption">Discard · {p.discard.length}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
