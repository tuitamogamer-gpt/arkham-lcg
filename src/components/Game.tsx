import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CaretRight,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  Coins,
  Drop,
  Fire,
  FloppyDisk,
  HandFist,
  Heart,
  Info,
  MagnifyingGlass,
  PersonSimpleRun,
  Plus,
  Skull,
  Stack,
  StarFour,
  X,
} from "@phosphor-icons/react";
import { card, CARD_ART, plain } from "../game/data";
import {
  InvestigatorMat,
  LocationTable,
  ScenarioTray,
  SupplyTray,
  TableCard,
} from "./Tabletop";
import {
  availableConnections,
  canAct,
  canPlay,
  fastOptions,
  commitValue,
  location,
  testValue,
  party,
  partySize,
  health,
  sanity,
  enemyHealth,
  canSwitch,
  commitOwner,
  commitCards,
} from "../game/engine";
import type { Action, GameState } from "../game/types";
import {
  Button,
  CardFace,
  Modal,
  SkillIcon,
  Token,
  HoverPreview,
  RulesText,
} from "./Common";
export function Game({
  game: s,
  dispatch,
  inspect,
  onHome,
  onExport,
  onHistory,
}: {
  game: GameState;
  dispatch: (a: Action) => void;
  inspect: (c: string) => void;
  onHome: () => void;
  onExport: () => void;
  onHistory: () => void;
}) {
  const roster = party(s),
    member = card(s.player.code);
  const actText = [
    `Find ${2 * partySize(s)} clues as a group. Advance at the end of the round.`,
    "Get every surviving investigator to Miskatonic Quad.",
    `Bring ${3 * partySize(s)} group clues to Orne Library at the end of the round.`,
    "Defeat the Servant of Flame. Spend group clues to deal damage.",
  ];
  const [mulligan, setMulligan] = useState<string[]>([]);
  const [investigateSource, setInvestigateSource] = useState("");
  const [investigateTarget, setInvestigateTarget] = useState("");

  const [deck, setDeck] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  useEffect(() => {
    if (s.status === "playing")
      window.scrollTo({ top: 0, behavior: "instant" });
  }, [s.id, s.status]);

  useEffect(() => {
    setMulligan([]);
    setInvestigateSource("");
    setInvestigateTarget("");
    setDeck(false);
  }, [s.player.code]);
  useEffect(() => {
    const changeSeat = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat ||
        document.querySelector('[role="dialog"]') ||
        (event.target as HTMLElement)?.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return;
      const index = ["1", "2", "3"].indexOf(event.key);
      const next = index >= 0 ? party(s)[index] : undefined;
      if (next && next.code !== s.player.code && canSwitch(s, next.code)) {
        event.preventDefault();
        dispatch({ type: "switchInvestigator", code: next.code });
      }
    };
    window.addEventListener("keydown", changeSeat);
    return () => window.removeEventListener("keydown", changeSeat);
  }, [s, dispatch]);
  const a = (kind: string, target?: string, source?: string) =>
    dispatch({ type: "act", kind, target, source });
  const loc = location(s);
  const near = availableConnections(s);
  const locked =
    !!s.event ||
    !!s.test ||
    !!s.decision ||
    !!s.window ||
    s.status !== "playing" ||
    s.phase !== "investigation";
  const tools = s.player.assets.filter((a) =>
    ["12031", "12033", "12049", "12088"].includes(a.code),
  );
  const weapons = s.player.assets.filter((a) =>
    ["12002", "12019", "12020", "12045", "12077", "12086"].includes(a.code),
  );
  const source = tools.some((a) => a.id === investigateSource)
    ? investigateSource
    : "";
  const testWeapon =
    s.test?.kind === "fight"
      ? s.player.assets.find((a) => a.id === s.test?.source)
      : undefined;
  const target =
    tools.find((a) => a.id === source)?.code === "12033"
      ? investigateTarget || s.player.location
      : s.player.location;

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
          <div className="party-resolution">
            {roster.map((p) => (
              <div key={p.code}>
                <strong>{card(p.code).name}</strong>
                <span>
                  {p.status} · {p.xp} XP · {p.physicalTrauma} physical /{" "}
                  {p.mentalTrauma} mental trauma
                </span>
              </div>
            ))}
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
          <HoverPreview
            title="Brethren of Ash · Spreading Flames"
            text={`Act ${s.act} · ${actText[s.act - 1]}\nAgenda ${s.agenda} · ${s.doom} doom\n\nCampaign record\n${s.campaign.notes.length ? s.campaign.notes.join("\n") : "Your discoveries will be recorded here."}`}
          >
            <h1 tabIndex={0}>Spreading Flames</h1>
          </HoverPreview>
        </div>
        <div className="game-header-actions">
          <button className="history-trigger" onClick={onHistory}>
            <ClockCounterClockwise size={17} />
            Event history
          </button>
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
      <section className="party-bar" aria-label="Investigator seats">
        <div className="party-label">
          <span className="eyebrow">YOUR INVESTIGATION PARTY</span>
          <small>
            One controller · {partySize(s)} investigator
            {partySize(s) === 1 ? "" : "s"}
          </small>
        </div>
        <div className="party-seats">
          {roster.map((p, i) => (
            <button
              key={p.code}
              className={`seat ${card(p.code).faction_code} ${p.code === s.player.code ? "active" : ""} ${p.turnEnded ? "finished" : ""}`}
              aria-label={`Control ${card(p.code).name}`}
              title={`Control ${card(p.code).name} · press ${i + 1}`}
              aria-pressed={p.code === s.player.code}
              disabled={p.code !== s.player.code && !canSwitch(s, p.code)}
              onClick={() =>
                p.code !== s.player.code &&
                dispatch({ type: "switchInvestigator", code: p.code })
              }
            >
              <div
                className="seat-portrait"
                style={{ backgroundImage: `url(${CARD_ART[p.code]})` }}
              />
              <span className="seat-copy">
                <small>
                  {p.status !== "active"
                    ? p.status
                    : p.code === s.player.code
                      ? s.phase === "investigation"
                        ? "ACTIVE INVESTIGATOR"
                        : s.phase.toUpperCase()
                      : p.turnEnded
                        ? "TURN COMPLETE"
                        : "READY TO ACT"}
                </small>
                <strong>{card(p.code).name}</strong>
                <span>
                  <Heart size={11} />
                  {health(s, p) - p.damage} <Brain size={11} />
                  {sanity(s, p) - p.horror} <MagnifyingGlass size={11} />
                  {p.clues} <Coins size={11} />
                  {p.resources}
                </span>
              </span>
              <span className="seat-number">
                {String(i + 1).padStart(2, "0")}
              </span>
            </button>
          ))}
        </div>
        {roster.length > 1 && (
          <p className="seat-hint">
            {s.phase !== "investigation"
              ? "Resolve each investigator’s encounter or choice. Their seat changes automatically."
              : s.player.turnStarted
                ? `Finish ${member.name}’s turn to pass control.`
                : "Choose any ready investigator to take this turn. Press 1–3 to switch seats."}
          </p>
        )}
      </section>
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
          <div className={`table-surface scenario-act-${s.act}`}>
            <ScenarioTray
              game={s}
              objective={actText[s.act - 1]}
              inspect={inspect}
            />
            <LocationTable
              game={s}
              locked={locked}
              inspect={inspect}
              move={(code) => a("move", code)}
            />
            <SupplyTray game={s} inspect={inspect} />
          </div>
          <div className="objective-ribbon">
            <BookOpen size={13} />
            <span>{actText[s.act - 1]}</span>
          </div>
          <div className="action-bar">
            <div className="action-count">
              {[0, 1, 2].map((i) => (
                <span
                  className={i < s.player.actions ? "available" : ""}
                  key={i}
                />
              ))}
              <small>
                {s.player.actions} actions left
                {s.player.code === "12007" && !s.player.flags.extraEvade
                  ? " + evade"
                  : ""}
              </small>
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
              className="action-button fast-action"
              disabled={locked || s.player.turnEnded}
              onClick={() => dispatch({ type: "openWindow" })}
              aria-label="Fast abilities · all investigators"
              title="Fast abilities · all investigators"
            >
              <StarFour size={16} /> Fast abilities
            </button>
            <button
              className="end-turn"
              onClick={() =>
                s.player.actions > 0
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
            {s.player.assets.some((a) => a.code === "12046") &&
              near.map((c) => (
                <Button
                  secondary
                  key={`olivier-${c}`}
                  disabled={!!canAct(s, "olivier", c)}
                  onClick={() => a("olivier", c)}
                >
                  Olivier · move to {card(c).name}
                </Button>
              ))}
            {s.player.assets.some((a) => a.code === "12075") && (
              <Button
                secondary
                disabled={!!canAct(s, "jumpsuit")}
                onClick={() => a("jumpsuit")}
              >
                Jumpsuit · recover a Tool or Weapon
              </Button>
            )}
            {s.player.assets.some((a) => a.code === "12002") &&
              s.enemies
                .filter((e) => e.location === s.player.location)
                .map((e) => (
                  <Button
                    secondary
                    key={`wrench-${e.id}`}
                    disabled={!!canAct(s, "wrench", e.id)}
                    onClick={() => a("wrench", e.id)}
                  >
                    Wrench · provoke {card(e.code).name}
                  </Button>
                ))}
            {roster
              .filter(
                (p) =>
                  p.status === "active" && p.location === s.player.location,
              )
              .flatMap((p) =>
                p.threats
                  .filter((c) => ["12125", "12103", "12104"].includes(c))
                  .map((c) => (
                    <Button
                      secondary
                      key={`${p.code}-${c}`}
                      disabled={!!canAct(s, "removeThreat", c, p.code)}
                      onClick={() => a("removeThreat", c, p.code)}
                    >
                      Remove {card(c).name}
                      {p.code !== s.player.code
                        ? ` (${card(p.code).name})`
                        : ""}{" "}
                      · 2 actions
                    </Button>
                  )),
              )}
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
              </div>
              {s.enemies
                .filter(
                  (e) =>
                    e.location === s.player.location ||
                    (loc.code === "12113" && near.includes(e.location)),
                )
                .map((e) => (
                  <div className="enemy-row" key={e.id}>
                    <HoverPreview code={e.code}>
                      <button
                        className="enemy-info"
                        onClick={() => inspect(e.code)}
                      >
                        <span
                          className={`enemy-card-preview ${e.exhausted ? "exhausted" : ""}`}
                        >
                          <TableCard code={e.code} />
                        </span>
                        <span>
                          <b>{card(e.code).name}</b>
                          <small>
                            {e.exhausted
                              ? "Exhausted"
                              : e.engaged
                                ? `Engaged · ${card(e.engagedWith || s.player.code).name}`
                                : card(e.location).name}{" "}
                            · {Math.max(0, enemyHealth(s, e) - e.damage)} health
                          </small>
                        </span>
                      </button>
                    </HoverPreview>
                    <div className="enemy-actions">
                      {[
                        ...weapons.map((w) => ({
                          id: w.id,
                          code: w.code,
                          uses: w.uses,
                        })),
                        { id: "", code: "", uses: 0 },
                      ].map((w) => {
                        const reason = canAct(
                          s,
                          "fight",
                          e.id,
                          w.id || undefined,
                        );
                        return (
                          <button
                            key={w.id}
                            className="weapon-fight"
                            disabled={!!reason}
                            title={reason || "Fight · 1 action"}
                            aria-label={`Fight ${card(e.code).name} with ${w.code ? card(w.code).name : "bare hands"}`}
                            onClick={() => a("fight", e.id, w.id || undefined)}
                          >
                            <SkillIcon
                              skill={w.code === "12045" ? "agility" : "combat"}
                              size={16}
                            />
                            <span>
                              <b>{w.code ? card(w.code).name : "Bare hands"}</b>
                              <small>
                                {reason && !locked
                                  ? reason
                                  : w.code === "12019"
                                    ? `1 action + 1 ammo · ${w.uses} left · +1 combat, 2 damage`
                                    : w.code === "12045"
                                      ? `1 action + 1 ammo · ${w.uses} left · ${e.exhausted ? 2 : 1} damage`
                                      : w.code
                                        ? "1 action · use Fight ability"
                                        : "1 action · 1 damage"}
                              </small>
                            </span>
                          </button>
                        );
                      })}
                      <button
                        disabled={!!canAct(s, "evade", e.id)}
                        onClick={() => a("evade", e.id)}
                      >
                        <SkillIcon skill="agility" size={14} /> Evade{" "}
                        {card(e.code).enemy_evade}
                      </button>
                      {(!e.engaged ||
                        (e.engagedWith && e.engagedWith !== s.player.code)) && (
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
                          {partySize(s)} group clues → {partySize(s)} damage
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </section>
          )}
          <InvestigatorMat
            game={s}
            inspect={inspect}
            openDeck={() => setDeck(true)}
          />
          <section className="hand-section">
            <div className="zone-heading">
              <h3>
                {member.name.split(" ")[0]}’s hand{" "}
                <span>{s.player.hand.length}</span>
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
          <details className="table-chronicle">
            <summary>
              <ClockCounterClockwise size={14} />
              <strong>The chronicle</strong>
              <span>{s.log.at(-1)?.text}</span>
              <CaretRight size={13} />
            </summary>
            <div className="log-entries">
              {s.log
                .slice(-18)
                .reverse()
                .map((entry) => (
                  <div className={`log-entry ${entry.tone}`} key={entry.id}>
                    <span>{String(entry.round).padStart(2, "0")}</span>
                    <p>{entry.text}</p>
                  </div>
                ))}
            </div>
            <button className="history-trigger" onClick={onHistory}>
              Read full event history <ArrowRight size={13} />
            </button>
          </details>
        </div>
      </div>
      {s.status === "mulligan" && (
        <Modal title="Your opening hand" wide>
          <div className="modal-intro">
            <div className="eyebrow">
              Opening hand {s.partyOrder.indexOf(s.player.code) + 1} of{" "}
              {partySize(s)} · {member.name}
            </div>
            <h2>{member.name}, prepare for the unknown.</h2>
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
            <span>5 resources · 3 actions · {member.name}</span>
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
      {s.window && !s.event && (
        <Modal title="Player window" compact>
          <div className="modal-intro">
            <span className="eyebrow">Fast abilities · {s.phase} phase</span>
            <h2>{s.window.title}</h2>
            <p>
              {s.window.test
                ? `${card(s.window.actor).name} · ${s.window.test.title}. `
                : ""}
              Use an available ability, or pass for the group to continue.
            </p>
          </div>
          {s.window.test && (
            <p className="window-test-summary">
              <SkillIcon skill={s.window.test.skill} size={18} />
              <strong>
                {testValue({
                  ...s,
                  player: roster.find((p) => p.code === s.window!.actor)!,
                  test: s.window.test,
                })}
              </strong>
              <span>
                vs {s.window.test.difficulty} difficulty ·{" "}
                {s.window.test.committed.length} committed
              </span>
            </p>
          )}
          {s.peril && (
            <p className="test-instructions">
              Peril · only {card(s.peril).name} may use abilities.
            </p>
          )}
          <div className="decision-list player-window-list">
            {fastOptions(s).map((o) => (
              <button
                key={o.id}
                onClick={() => dispatch({ type: "fast", id: o.id })}
              >
                <span>
                  {o.label}
                  <small>{card(o.actor).name}</small>
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
          <div className="modal-footer">
            <Button onClick={() => dispatch({ type: "passWindow" })}>
              Pass Fast window <ArrowRight size={17} />
            </Button>
          </div>
        </Modal>
      )}
      {s.test && !s.event && (
        <Modal title={s.test.title} compact>
          <div className="modal-intro">
            <div className="eyebrow">
              {member.name} · {s.test.skill} test
            </div>
            <h2>{s.test.title}</h2>
          </div>
          {s.test.kind === "fight" && (
            <p className="test-source-summary">
              {testWeapon
                ? `Attacking with ${card(testWeapon.code).name}. ${["12019", "12045"].includes(testWeapon.code) ? "1 ammo already spent. " : ""}`
                : "Attacking with bare hands. "}
              Commit cards below for their skill icons; committing a weapon from
              hand does not use its attack ability.
            </p>
          )}
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
                {s.test.commitClosed
                  ? "Commitments are locked. You may use Fast abilities before revealing the token. "
                  : "Commit matching cards to improve your odds. Using a boost finishes commitment. Cards are discarded after the test. "}
                {s.peril === s.player.code
                  ? "Peril: teammates cannot play cards, trigger abilities, or help with this test."
                  : s.peril
                    ? `Peril: only ${card(s.peril).name} may trigger abilities while that encounter resolves.`
                    : "Each teammate at your location may contribute one card."}
              </p>
              <div className="commit-list">
                {roster
                  .filter(
                    (p) =>
                      p.status === "active" && p.location === s.player.location,
                  )
                  .flatMap((p) => commitCards(s, p))
                  .filter((c) => commitValue(s, c.id) > 0)
                  .map((c) => (
                    <button
                      key={c.id}
                      className={
                        s.test!.committed.includes(c.id) ? "selected" : ""
                      }
                      onClick={() => dispatch({ type: "commit", id: c.id })}
                      disabled={!!s.test?.commitClosed}
                    >
                      <span className="commit-check">
                        {s.test!.committed.includes(c.id) ? (
                          <Check size={14} />
                        ) : (
                          <Plus size={14} />
                        )}
                      </span>
                      <span>
                        {card(c.code).name}
                        <small className="commit-owner">
                          {card(commitOwner(s, c.id)!.code).name}
                        </small>
                      </span>
                      <b>+{commitValue(s, c.id)}</b>
                    </button>
                  ))}
              </div>
              {s.player.hand.every((c) => commitValue(s, c.id) === 0) && (
                <p className="muted centered">
                  {s.test.committed.length
                    ? "No more matching cards in your hand."
                    : "No matching cards in your hand."}
                </p>
              )}
              <div className="boost-list">
                {s.player.assets
                  .filter(
                    (a) =>
                      (a.code === "12017" &&
                        ["combat", "agility"].includes(s.test!.skill)) ||
                      (a.code === "12035" &&
                        ["willpower", "intellect"].includes(s.test!.skill)) ||
                      (a.code === "12047" &&
                        ["intellect", "agility"].includes(s.test!.skill)) ||
                      (a.code === "12076" &&
                        ["willpower", "agility"].includes(s.test!.skill)),
                  )
                  .map((a) => (
                    <Button
                      key={a.id}
                      secondary
                      disabled={
                        s.player.resources < 1 ||
                        (!!s.peril && s.peril !== s.player.code)
                      }
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
              {s.player.hand
                .filter(
                  (c) =>
                    c.code === "12081" &&
                    !s.test!.committed.includes(c.id) &&
                    commitValue(s, c.id) > 0,
                )
                .map((c) => (
                  <Button
                    secondary
                    key={c.id}
                    onClick={() => dispatch({ type: "commit", id: c.id })}
                  >
                    Commit Timely Intervention · +{commitValue(s, c.id)}
                  </Button>
                ))}
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
      {s.decision && !s.test && !s.event && (
        <Modal title={s.decision.title} compact>
          <div className="modal-intro">
            <div className="eyebrow">{member.name} · The choice is yours</div>
            <h2>{s.decision.title}</h2>
            <p>{s.decision.description}</p>
          </div>
          {s.decision.title === "Daniela strikes back" && (
            <div className="reaction-source">
              <HoverPreview code="12001">
                <button
                  onClick={() => inspect("12001")}
                  aria-label="Inspect Daniela’s counterattack ability"
                >
                  <TableCard code="12001" />
                </button>
              </HoverPreview>
              <p>
                <span className="eyebrow">
                  Investigator reaction · once per round
                </span>
                <RulesText text={card("12001").text?.split("\n")[0]} />
              </p>
            </div>
          )}
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
          compact
          onClose={() => setEndConfirm(false)}
        >
          <div className="modal-intro">
            <div className="eyebrow">Investigation phase</div>
            <h2>End your turn?</h2>
            <p>
              You have {s.player.actions} unused action
              {s.player.actions === 1 ? "" : "s"}.{" "}
              {roster.some(
                (p) =>
                  p.code !== s.player.code &&
                  p.status === "active" &&
                  !p.turnEnded,
              )
                ? "Control will pass to the next ready investigator."
                : "Everyone will have finished. Resolve fire, enemy attacks, upkeep, and the next mythos phase."}
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
            <div className="eyebrow">{member.name} · Official starter</div>
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
