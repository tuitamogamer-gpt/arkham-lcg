import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CaretRight,
  Check,
  CheckCircle,
  Coins,
  Drop,
  Fire,
  FloppyDisk,
  HandFist,
  Heart,
  Info,
  MagnifyingGlass,
  MapPin,
  PersonSimpleRun,
  Plus,
  Skull,
  Stack,
  StarFour,
  X,
} from "@phosphor-icons/react";
import { card, CONNECTIONS, MAP_POS, plain } from "../game/data";
import {
  availableConnections,
  canAct,
  canPlay,
  commitValue,
  engaged,
  location,
  stats,
  testValue,
} from "../game/engine";
import type { Action, GameState } from "../game/types";
import {
  Button,
  CardFace,
  Modal,
  SkillIcon,
  SkillStats,
  Token,
} from "./Common";
const actText = [
  "Find 2 clues. Advance at the end of the round.",
  "Escape the dormitories. Reach Miskatonic Quad.",
  "Bring 3 clues to Orne Library at the end of the round.",
  "Defeat the Servant of Flame. Spend clues to deal damage.",
];
export function Game({
  game: s,
  dispatch,
  inspect,
  onHome,
  onExport,
}: {
  game: GameState;
  dispatch: (a: Action) => void;
  inspect: (c: string) => void;
  onHome: () => void;
  onExport: () => void;
}) {
  const [mulligan, setMulligan] = useState<string[]>([]);
  const [investigateSource, setInvestigateSource] = useState("");
  const [investigateTarget, setInvestigateTarget] = useState("");
  const [weapon, setWeapon] = useState("");
  const [deck, setDeck] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [mobileMap, setMobileMap] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const update = () => setMobileMap(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (s.status === "playing")
      window.scrollTo({ top: 0, behavior: "instant" });
  }, [s.id, s.status]);

  const a = (kind: string, target?: string, source?: string) =>
    dispatch({ type: "act", kind, target, source });
  const loc = location(s);
  const near = availableConnections(s);
  const locked =
    !!s.test ||
    !!s.decision ||
    s.status !== "playing" ||
    s.phase !== "investigation";
  const tools = s.player.assets.filter((a) =>
    ["12031", "12033", "12088"].includes(a.code),
  );
  const weapons = s.player.assets.filter((a) =>
    ["12019", "12020"].includes(a.code),
  );
  const source = tools.some((a) => a.id === investigateSource)
    ? investigateSource
    : "";
  const target =
    tools.find((a) => a.id === source)?.code === "12033"
      ? investigateTarget || s.player.location
      : s.player.location;
  const fightSource = weapons.some((a) => a.id === weapon) ? weapon : "";
  const pos = (c: string): [number, number] => {
    if (s.act === 1) return [50, 50];
    if (s.act === 2)
      return [
        { 12113: mobileMap ? 16 : 20, 12117: 50, 12116: mobileMap ? 84 : 80 }[
          Number(c) as 12113
        ] || 50,
        50,
      ];
    if (mobileMap)
      return (
        (
          {
            "12117": [17, 50],
            "12116": [50, 50],
            "12118": [58, 25],
            "12119": [58, 75],
            "12120": [84, 50],
          } as Record<string, [number, number]>
        )[c] || [50, 50]
      );
    const [x, y] = MAP_POS[c];
    return [x, y === 18 ? 28 : y === 82 ? 72 : y];
  };
  if (s.status === "resolution")
    return (
      <div className="resolution-page page-content">
        <div className="resolution-art" />
        <div className="resolution-content">
          <div className="eyebrow">Spreading Flames · Case closed</div>
          <StarFour size={40} weight="light" />
          <h1>
            {s.campaign.result === "saved"
              ? "A light in the darkness."
              : "The embers remain."}
          </h1>
          <p>
            {s.campaign.result === "saved"
              ? "The masked pursuer is defeated, and Miskatonic University still stands. Dr. Armitage may hold the answers to your friend’s disappearance."
              : "You have survived a night that Arkham will not forget. Dr. Armitage and the mystery of your missing friend await."}
          </p>
          <div className="resolution-stats">
            <span>
              <b>{s.campaign.xp}</b> EXPERIENCE
            </span>
            <span>
              <b>{s.campaign.physicalTrauma}</b> PHYSICAL TRAUMA
            </span>
            <span>
              <b>{s.campaign.mentalTrauma}</b> MENTAL TRAUMA
            </span>
          </div>
          <div className="campaign-record">
            <h3>Recorded in your campaign log</h3>
            {s.campaign.notes.map((n, i) => (
              <p key={i}>
                <Check size={16} />
                {n}
              </p>
            ))}
          </div>
          <div className="coming-note">
            <span>THE NEXT CHAPTER</span>
            <h3>Smoke and Mirrors</h3>
            <p>
              Your campaign record is saved. Scenario II is not yet scripted in
              this build.
            </p>
          </div>
          <div className="resolution-buttons">
            <Button onClick={onHome} arrow>
              Return to the archive
            </Button>
            <Button secondary onClick={onExport}>
              Export campaign record
            </Button>
          </div>
        </div>
      </div>
    );
  return (
    <div className="game-page">
      <div className="game-title">
        <div>
          <div className="eyebrow">Brethren of Ash / Scenario I</div>
          <h1>Spreading Flames</h1>
        </div>
        <div className="game-header-actions">
          <span className="autosaved">
            <CheckCircle size={14} /> Autosaved
          </span>
          <button
            className="icon-button"
            title="Export saved game"
            onClick={onExport}
          >
            <FloppyDisk size={19} />
          </button>
          <span className="round-label">
            ROUND <b>{s.round.toString().padStart(2, "0")}</b>
          </span>
        </div>
      </div>
      <div className="phase-track">
        {["mythos", "investigation", "enemy", "upkeep"].map((p, i) => (
          <div className={s.phase === p ? "active" : ""} key={p}>
            <span>0{i + 1}</span>
            {p}
            <CaretRight size={13} />
          </div>
        ))}
      </div>
      <div className="game-layout">
        <div className="table-main">
          <div className="story-track">
            <button
              className="story-card act-card"
              onClick={() => inspect(String(12108 + s.act))}
            >
              <div className="story-icon">
                <BookOpen size={23} weight="light" />
              </div>
              <div>
                <span>ACT {s.act} / 4</span>
                <h3>{card(String(12108 + s.act)).name}</h3>
                <p>{actText[s.act - 1]}</p>
              </div>
              <span className="story-number">
                {s.act === 1 ? "2" : s.act === 3 ? "3" : "✧"}
              </span>
            </button>
            <button
              className="story-card agenda-card"
              onClick={() => inspect(String(12105 + s.agenda))}
            >
              <div className="story-icon">
                <Fire size={24} weight="light" />
              </div>
              <div>
                <span>AGENDA {s.agenda} / 3</span>
                <h3>{card(String(12105 + s.agenda)).name}</h3>
                <p>The clock is always ticking.</p>
              </div>
              <div className="doom-counter">
                <strong>{s.doom}</strong>
                <span>/ {[3, 5, 10][s.agenda - 1]}</span>
                <small>DOOM</small>
              </div>
            </button>
          </div>
          <section className="location-board" aria-label="Location map">
            <div className="board-header">
              <span>
                <MapPin size={13} /> MISKATONIC UNIVERSITY
              </span>
              <span>
                {s.locations.filter((l) => l.active && l.revealed).length}{" "}
                locations explored
              </span>
            </div>
            <svg
              className="map-lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {s.locations
                .filter((l) => l.active)
                .flatMap((l) =>
                  (CONNECTIONS[l.code] || [])
                    .filter(
                      (c) =>
                        c > l.code &&
                        s.locations.find((x) => x.code === c)?.active,
                    )
                    .map((c) => (
                      <line
                        key={l.code + c}
                        x1={pos(l.code)[0]}
                        y1={pos(l.code)[1]}
                        x2={pos(c)[0]}
                        y2={pos(c)[1]}
                      />
                    )),
                )}
            </svg>
            <div className="compass-rose">
              <span>N</span>
              <StarFour weight="thin" size={74} />
            </div>
            {s.locations
              .filter((l) => l.active)
              .map((l) => (
                <button
                  key={l.code}
                  className={`map-location ${l.code === s.player.location ? "current" : ""} ${l.revealed ? "revealed" : "unrevealed"} ${l.fire ? "burning" : ""} ${near.includes(l.code) ? "connected" : ""}`}
                  style={{
                    left: `${pos(l.code)[0]}%`,
                    top: `${pos(l.code)[1]}%`,
                  }}
                  onClick={() =>
                    near.includes(l.code)
                      ? a("move", l.code)
                      : l.revealed && inspect(l.code)
                  }
                  disabled={locked}
                  aria-label={
                    near.includes(l.code)
                      ? `Move to ${card(l.code).name}`
                      : `Inspect ${card(l.code).name}`
                  }
                  title={
                    near.includes(l.code)
                      ? `Move · ${s.player.location === "12116" && !s.flags.quad ? "free" : "1 action"}`
                      : card(l.code).name
                  }
                >
                  {l.code === s.player.location && (
                    <span className="you-marker">
                      <MapPin size={11} weight="fill" /> YOU ARE HERE
                    </span>
                  )}
                  <div className={`location-art art-${l.code}`}>
                    <span className="loc-symbol">
                      {l.revealed ? (
                        <BookOpen size={21} weight="light" />
                      ) : (
                        <StarFour size={28} weight="thin" />
                      )}
                    </span>
                    {l.fire && (
                      <span className="fire-marker" aria-label="On fire">
                        <Fire size={16} weight="fill" />
                      </span>
                    )}
                    {s.enemies.some((e) => e.location === l.code) && (
                      <span className="enemy-marker">
                        <Skull size={12} />{" "}
                        {s.enemies.filter((e) => e.location === l.code).length}
                      </span>
                    )}
                  </div>
                  <h3>{card(l.code).name}</h3>
                  <div className="location-stats">
                    <span>
                      <Drop size={12} />{" "}
                      {l.revealed
                        ? Math.max(0, (card(l.code).shroud || 0) - l.reduction)
                        : "?"}
                    </span>
                    <i />
                    <span>
                      <MagnifyingGlass size={12} /> {l.revealed ? l.clues : "?"}
                    </span>
                  </div>
                  {near.includes(l.code) && (
                    <span className="move-hint">
                      MOVE HERE <ArrowRight size={10} />
                    </span>
                  )}
                </button>
              ))}
            <div className="board-legend">
              <span>
                <Drop size={12} /> Shroud
              </span>
              <span>
                <MagnifyingGlass size={12} /> Clues
              </span>
              <span>Click a connected location to move</span>
            </div>
          </section>
          <div className="action-bar">
            <div className="action-count">
              {[0, 1, 2].map((i) => (
                <span className={i < s.actions ? "available" : ""} key={i} />
              ))}
              <small>{s.actions} actions left</small>
            </div>
            <button
              className="action-button primary-action"
              onClick={() => a("investigate", target, source || undefined)}
              disabled={!!canAct(s, "investigate", target, source || undefined)}
              title={
                canAct(s, "investigate", target, source || undefined) ||
                "Investigate for 1 action"
              }
            >
              <MagnifyingGlass size={19} /> Investigate
            </button>
            <button
              className="action-button"
              onClick={() => a("resource")}
              disabled={!!canAct(s, "resource")}
            >
              <Coins size={18} /> Resource
            </button>
            <button
              className="action-button"
              onClick={() => a("draw")}
              disabled={!!canAct(s, "draw")}
            >
              <Stack size={18} /> Draw card
            </button>
            <button
              className="end-turn"
              onClick={() =>
                s.actions > 0
                  ? setEndConfirm(true)
                  : dispatch({ type: "endTurn" })
              }
              disabled={locked}
            >
              End turn <ArrowRight size={17} />
            </button>
          </div>
          {tools.length > 0 && (
            <div className="tool-selector">
              <label>
                Investigate with{" "}
                <select
                  aria-label="Investigate using"
                  value={source}
                  onChange={(e) => {
                    setInvestigateSource(e.target.value);
                    setInvestigateTarget("");
                  }}
                >
                  <option value="">Basic investigation</option>
                  {tools.map((t) => (
                    <option key={t.id} value={t.id}>
                      {card(t.code).name}
                      {t.uses ? ` (${t.uses} uses)` : ""}
                      {t.exhausted ? " · exhausted" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {tools.find((a) => a.id === source)?.code === "12033" && (
                <select
                  aria-label="Local Map target"
                  value={target}
                  onChange={(e) => setInvestigateTarget(e.target.value)}
                >
                  <option value="">Choose location</option>
                  {near
                    .filter(
                      (c) => s.locations.find((l) => l.code === c)?.revealed,
                    )
                    .map((c) => (
                      <option key={c} value={c}>
                        {card(c).name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}
          <div className="location-abilities">
            {loc.fire && (
              <Button
                secondary
                disabled={!!canAct(s, "extinguish")}
                onClick={() => a("extinguish")}
              >
                <Fire size={16} /> Extinguish fire · 1 action
              </Button>
            )}
            {loc.code === "12117" && (
              <Button
                secondary
                disabled={!!canAct(s, "rest")}
                onClick={() => a("rest")}
              >
                Rest · heal 1 damage & 1 horror
              </Button>
            )}
            {loc.code === "12120" && (
              <Button
                secondary
                disabled={!!canAct(s, "library")}
                onClick={() => a("library")}
              >
                Library · draw 3 cards · 2 actions
              </Button>
            )}
            {s.act === 4 && (
              <Button
                secondary
                disabled={!!canAct(s, "resign")}
                onClick={() => a("resign")}
              >
                Resign from the scenario
              </Button>
            )}
            {s.player.threats.map((c) => (
              <Button
                secondary
                key={c}
                disabled={!!canAct(s, "removeThreat", c)}
                onClick={() => a("removeThreat", c)}
              >
                Remove {card(c).name} · 2 actions
              </Button>
            ))}
          </div>
          {s.enemies.some(
            (e) =>
              e.location === s.player.location ||
              (loc.code === "12113" && near.includes(e.location)),
          ) && (
            <section className="enemy-zone">
              <div className="zone-heading">
                <h3>
                  <Skull size={16} /> Threats nearby
                </h3>
                {weapons.length > 0 && (
                  <select
                    value={fightSource}
                    aria-label="Fight using"
                    onChange={(e) => setWeapon(e.target.value)}
                  >
                    <option value="">Basic fight</option>
                    {weapons.map((w) => (
                      <option value={w.id} key={w.id}>
                        {card(w.code).name}
                        {w.code === "12019"
                          ? ` · ${w.uses} ammo`
                          : w.exhausted
                            ? " · exhausted"
                            : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {s.enemies
                .filter(
                  (e) =>
                    e.location === s.player.location ||
                    (loc.code === "12113" && near.includes(e.location)),
                )
                .map((e) => (
                  <div className="enemy-row" key={e.id}>
                    <button
                      className="enemy-info"
                      onClick={() => inspect(e.code)}
                    >
                      <Skull size={23} weight="light" />
                      <span>
                        <b>{card(e.code).name}</b>
                        <small>
                          {e.exhausted
                            ? "Exhausted"
                            : e.engaged
                              ? "Engaged with you"
                              : card(e.location).name}{" "}
                          · {Math.max(0, (card(e.code).health || 0) - e.damage)}{" "}
                          health
                        </small>
                      </span>
                    </button>
                    <div className="enemy-actions">
                      <button
                        disabled={
                          !!canAct(s, "fight", e.id, fightSource || undefined)
                        }
                        onClick={() =>
                          a("fight", e.id, fightSource || undefined)
                        }
                      >
                        <HandFist size={14} /> Fight {card(e.code).enemy_fight}
                      </button>
                      <button
                        disabled={!!canAct(s, "evade", e.id)}
                        onClick={() => a("evade", e.id)}
                      >
                        <PersonSimpleRun size={14} /> Evade{" "}
                        {card(e.code).enemy_evade}
                      </button>
                      {!e.engaged && (
                        <button
                          disabled={!!canAct(s, "engage", e.id)}
                          onClick={() => a("engage", e.id)}
                        >
                          Engage
                        </button>
                      )}
                      {e.code === "12123" && (
                        <button
                          disabled={!!canAct(s, "parley", e.id)}
                          onClick={() => a("parley", e.id)}
                        >
                          Parley 2
                        </button>
                      )}
                      {s.act === 4 && (
                        <button
                          disabled={!!canAct(s, "clueDamage", e.id)}
                          onClick={() => a("clueDamage", e.id)}
                        >
                          1 clue → 1 damage
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </section>
          )}
          <section className="hand-section">
            <div className="zone-heading">
              <h3>
                Your hand <span>{s.player.hand.length}</span>
              </h3>
              <button onClick={() => setDeck(true)}>
                <Stack size={14} />
                {s.player.deck.length} in deck · {s.player.discard.length}{" "}
                discarded
              </button>
            </div>
            <div className="hand-row">
              {s.player.hand.map((c) => (
                <div className="hand-card-wrap" key={c.id}>
                  <CardFace
                    c={card(c.code)}
                    compact
                    onClick={() => inspect(c.code)}
                  />
                  <button
                    className="play-card"
                    disabled={!!canPlay(s, c.id)}
                    title={canPlay(s, c.id) || `Play ${card(c.code).name}`}
                    onClick={() => dispatch({ type: "play", id: c.id })}
                  >
                    {card(c.code).type_code === "skill"
                      ? "Commit during a test"
                      : canPlay(s, c.id)?.includes("reaction")
                        ? "Reaction window"
                        : `Play · ${card(c.code).cost || 0} resources`}
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="assets-section">
            <div className="zone-heading">
              <h3>
                In play <span>{s.player.assets.length}</span>
              </h3>
              <small>2 hand · 1 ally · 1 head slot</small>
            </div>
            <div className="asset-row">
              {s.player.assets.map((as) => (
                <button
                  key={as.id}
                  onClick={() => inspect(as.code)}
                  className={`asset-chip ${as.exhausted ? "exhausted" : ""}`}
                >
                  <span className="asset-symbol">
                    <StarFour size={18} />
                  </span>
                  <span>
                    <b>{card(as.code).name}</b>
                    <small>
                      {card(as.code).slot || "No slot"}
                      {as.uses ? ` · ${as.uses} uses` : ""}
                      {as.damage ? ` · ${as.damage} damage` : ""}
                      {as.horror ? ` · ${as.horror} horror` : ""}
                      {as.exhausted ? " · exhausted" : ""}
                    </small>
                  </span>
                </button>
              ))}
              {!s.player.assets.length && (
                <div className="empty-assets">
                  <Plus size={20} weight="light" />
                  Play assets from your hand to prepare for what’s ahead.
                </div>
              )}
            </div>
          </section>
        </div>
        <aside className="investigator-panel">
          <div className="player-header">
            <div className="portrait-small" />
            <div>
              <span className="class-label">SEEKER</span>
              <h2>Joe Diamond</h2>
              <button onClick={() => inspect("12004")}>
                Investigator details <Info size={12} />
              </button>
            </div>
          </div>
          <SkillStats
            values={(
              ["willpower", "intellect", "combat", "agility"] as const
            ).map((k) => stats(s, k))}
          />
          <div className="vitals">
            <div>
              <span>
                <Heart size={15} /> Health
              </span>
              <b>
                {7 - s.player.damage}
                <small>/7</small>
              </b>
              <div className="vital-track health">
                <i style={{ width: `${((7 - s.player.damage) / 7) * 100}%` }} />
              </div>
            </div>
            <div>
              <span>
                <Brain size={15} /> Sanity
              </span>
              <b>
                {7 - s.player.horror}
                <small>/7</small>
              </b>
              <div className="vital-track sanity">
                <i style={{ width: `${((7 - s.player.horror) / 7) * 100}%` }} />
              </div>
            </div>
          </div>
          <div className="player-pools">
            <div>
              <Coins size={22} weight="light" />
              <b>{s.player.resources}</b>
              <span>RESOURCES</span>
            </div>
            <div>
              <MagnifyingGlass size={22} weight="light" />
              <b>{s.player.clues}</b>
              <span>CLUES</span>
            </div>
          </div>
          <div className="objective-tip">
            <span>YOUR NEXT LEAD</span>
            <p>
              {s.actions === 0
                ? "End your turn to resolve enemy attacks, upkeep, and the next mythos phase."
                : engaged(s).length
                  ? "An enemy is engaged with you. Fight, evade, or parley before taking other actions to avoid its attack."
                  : actText[s.act - 1]}
            </p>
          </div>
          <div className="game-log">
            <div className="zone-heading">
              <h3>The chronicle</h3>
              <span>LIVE</span>
            </div>
            <div className="log-entries" aria-live="polite">
              {s.log
                .slice(-18)
                .reverse()
                .map((l) => (
                  <div className={`log-entry ${l.tone}`} key={l.id}>
                    <span>{String(l.round).padStart(2, "0")}</span>
                    <p>{l.text}</p>
                  </div>
                ))}
            </div>
          </div>
        </aside>
      </div>
      {s.status === "mulligan" && (
        <Modal title="Your opening hand" wide>
          <div className="modal-intro">
            <div className="eyebrow">Before the first turn</div>
            <h2>A good detective comes prepared.</h2>
            <p>
              Keep your opening hand, or select cards to replace once.
              Replacements are drawn before these cards return to your deck.
            </p>
          </div>
          <div className="mulligan-hand">
            {s.player.hand.map((c) => (
              <CardFace
                key={c.id}
                c={card(c.code)}
                compact
                selected={mulligan.includes(c.id)}
                onClick={() =>
                  setMulligan((v) =>
                    v.includes(c.id)
                      ? v.filter((id) => id !== c.id)
                      : [...v, c.id],
                  )
                }
              />
            ))}
          </div>
          <div className="modal-footer">
            <span>5 resources · 3 actions · Joe Diamond</span>
            <Button
              onClick={() => dispatch({ type: "mulligan", ids: mulligan })}
              arrow
            >
              {mulligan.length
                ? `Replace ${mulligan.length} & begin`
                : "Keep hand & begin"}
            </Button>
          </div>
        </Modal>
      )}
      {s.test && (
        <Modal title={s.test.title}>
          <div className="modal-intro">
            <div className="eyebrow">Skill test · {s.test.skill}</div>
            <h2>{s.test.title}</h2>
          </div>
          <div className="test-values">
            <div>
              <SkillIcon skill={s.test.skill} size={23} />
              <strong>{testValue(s)}</strong>
              <span>YOUR SKILL</span>
            </div>
            <span className="versus">vs.</span>
            <div>
              <Drop size={22} />
              <strong>{s.test.difficulty}</strong>
              <span>DIFFICULTY</span>
            </div>
          </div>
          {s.test.stage === "commit" ? (
            <>
              <p className="test-instructions">
                Commit matching cards to improve your odds. Committed cards are
                discarded after the test.
              </p>
              <div className="commit-list">
                {s.player.hand
                  .filter((c) => commitValue(s, c.id) > 0)
                  .map((c) => (
                    <button
                      key={c.id}
                      className={
                        s.test!.committed.includes(c.id) ? "selected" : ""
                      }
                      onClick={() => dispatch({ type: "commit", id: c.id })}
                    >
                      <span className="commit-check">
                        {s.test!.committed.includes(c.id) ? (
                          <Check size={14} />
                        ) : (
                          <Plus size={14} />
                        )}
                      </span>
                      <span>{card(c.code).name}</span>
                      <b>+{commitValue(s, c.id)}</b>
                    </button>
                  ))}
              </div>
              {s.player.hand.every((c) => commitValue(s, c.id) === 0) && (
                <p className="muted centered">
                  No matching cards in your hand.
                </p>
              )}
              <div className="boost-list">
                {s.player.assets
                  .filter(
                    (a) =>
                      (a.code === "12017" &&
                        ["combat", "agility"].includes(s.test!.skill)) ||
                      (a.code === "12035" &&
                        ["willpower", "intellect"].includes(s.test!.skill)),
                  )
                  .map((a) => (
                    <Button
                      key={a.id}
                      secondary
                      disabled={s.player.resources < 1}
                      onClick={() => dispatch({ type: "boost", id: a.id })}
                    >
                      {card(a.code).name} · pay 1 resource
                    </Button>
                  ))}
              </div>
              <Button
                className="full"
                onClick={() => dispatch({ type: "reveal" })}
              >
                Draw from the chaos bag <StarFour size={18} />
              </Button>
              <p className="test-footnote">
                A tie succeeds. The auto-fail token always fails.
              </p>
            </>
          ) : (
            <>
              <div className="token-reveal">
                {s.test.tokens.map((t, i) => (
                  <Token key={i} token={t} large />
                ))}
              </div>
              <div
                className={`test-outcome ${s.test.success ? "passed" : "failed"}`}
              >
                <h2>
                  {s.test.success ? "A steady hand." : "The darkness answers."}
                </h2>
                <p>
                  {s.test.tokens.includes("auto_fail")
                    ? "Automatic failure"
                    : `${testValue(s)} ${s.test.modifier >= 0 ? "+" : "−"} ${Math.abs(s.test.modifier)} = ${Math.max(0, testValue(s) + s.test.modifier)} · ${s.test.success ? "Success" : "Failure"}`}
                </p>
              </div>
              <Button
                className="full"
                onClick={() => dispatch({ type: "resolve" })}
              >
                Resolve the test <ArrowRight size={17} />
              </Button>
            </>
          )}
        </Modal>
      )}
      {s.decision && !s.test && (
        <Modal title={s.decision.title}>
          <div className="modal-intro">
            <div className="eyebrow">The choice is yours</div>
            <h2>{s.decision.title}</h2>
            <p>{s.decision.description}</p>
          </div>
          <div className="decision-list">
            {s.decision.choices.map((c) => (
              <button
                key={c.id}
                onClick={() => dispatch({ type: "choose", id: c.id })}
              >
                <span>
                  <b>{c.label}</b>
                  {c.detail && <small>{c.detail}</small>}
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {endConfirm && (
        <Modal
          title="End investigation turn"
          onClose={() => setEndConfirm(false)}
        >
          <div className="modal-intro">
            <div className="eyebrow">Investigation phase</div>
            <h2>End your turn?</h2>
            <p>
              You have {s.actions} unused action{s.actions === 1 ? "" : "s"}.
              Enemies will act, then you’ll ready your cards and draw the next
              encounter.
            </p>
          </div>
          <div className="modal-footer">
            <Button secondary onClick={() => setEndConfirm(false)}>
              Keep investigating
            </Button>
            <Button
              onClick={() => {
                setEndConfirm(false);
                dispatch({ type: "endTurn" });
              }}
            >
              End turn
            </Button>
          </div>
        </Modal>
      )}
      {deck && (
        <Modal title="Deck and discard" onClose={() => setDeck(false)}>
          <div className="modal-intro">
            <div className="eyebrow">Joe Diamond · Official starter</div>
            <h2>Your deck</h2>
            <p>
              {s.player.deck.length} cards remaining. The draw order is hidden.
            </p>
          </div>
          <div className="deck-list">
            {Object.entries(
              s.player.deck.reduce<Record<string, number>>(
                (acc, c) => ({ ...acc, [c.code]: (acc[c.code] || 0) + 1 }),
                {},
              ),
            )
              .sort((a, b) => card(a[0]).name.localeCompare(card(b[0]).name))
              .map(([c, n]) => (
                <button key={c} onClick={() => inspect(c)}>
                  <span>{card(c).name}</span>
                  <b>×{n}</b>
                </button>
              ))}
          </div>
          <h3>Discard pile · {s.player.discard.length}</h3>
          <div className="deck-list">
            {s.player.discard.map((c) => (
              <button key={c.id} onClick={() => inspect(c.code)}>
                {card(c.code).name}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {s.error && (
        <div className="toast" role="alert">
          <Info size={17} />
          {s.error}
          <button
            aria-label="Dismiss message"
            onClick={() => dispatch({ type: "clearError" })}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
