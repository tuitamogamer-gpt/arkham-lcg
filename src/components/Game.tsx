import { useEffect, useState } from "react";
import {
  ArrowCounterClockwise,
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
  Moon,
  PersonSimpleRun,
  Plus,
  Skull,
  Stack,
  StarFour,
  SunHorizon,
  X,
} from "@phosphor-icons/react";
import { card, CARD_ART, plain } from "../game/data";
import { useTableMotion } from "./Motion";
import { useCoreMilestones } from "./Milestones";
import { ChaosDraw } from "./ChaosDraw";
import { INVESTIGATION_ABILITIES } from "./InvestigationAbility";
import { Introduction, PursuerStory, ResolutionPassage } from "./Story";
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
  successChance,
  totalDoom,
} from "../game/engine";
import type { Action, GameState } from "../game/types";
import {
  BOOSTS,
  REMOVABLE_THREATS,
  WEAPONS,
  isTool,
  isWeapon,
} from "../game/cards";
import { SPREADING_FLAMES as SCENARIO } from "../game/scenario";
import {
  Button,
  CardFace,
  Modal,
  SkillIcon,
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
  canUndo = false,
  onUndo,
  saved = true,
}: {
  game: GameState;
  dispatch: (a: Action) => void;
  inspect: (c: string, assetId?: string) => void;
  onHome: () => void;
  onExport: () => void;
  onHistory: () => void;
  canUndo?: boolean;
  onUndo?: () => void;
  saved?: boolean;
}) {
  useTableMotion(s);
  const milestone = useCoreMilestones(s);
  const roster = party(s),
    member = card(s.player.code);
  const actText = [1, 2, 3, 4].map((act) =>
    SCENARIO.actObjective(act, partySize(s)),
  );
  const [mulligan, setMulligan] = useState<string[]>([]);
  const [chaosDrawRequested, setChaosDrawRequested] = useState(false);
  const [investigateSource, setInvestigateSource] = useState("");
  const [investigateTarget, setInvestigateTarget] = useState("");

  const [deck, setDeck] = useState(false);
  const [replayIntro, setReplayIntro] = useState<
    "campaign" | "scenario" | null
  >(null);
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
  const tools = s.player.assets.filter((a) => isTool(a.code));
  const weapons = s.player.assets.filter((a) => isWeapon(a.code));
  const source = tools.some((a) => a.id === investigateSource)
    ? investigateSource
    : "";
  const testWeapon =
    s.test?.kind === "fight"
      ? s.player.assets.find((a) => a.id === s.test?.source)
      : undefined;
  const testTool =
    s.test?.kind === "investigate"
      ? s.player.assets.find((a) => a.id === s.test?.source)
      : undefined;
  const target =
    tools.find((a) => a.id === source)?.code === "12033"
      ? investigateTarget || s.player.location
      : s.player.location;

  if (s.introduction && s.introduction !== "complete")
    return (
      <Introduction
        page={s.introduction}
        onContinue={() =>
          dispatch({
            type: "continueIntroduction",
            page: s.introduction as "campaign" | "scenario",
          })
        }
      />
    );
  if (s.status === "resolution")
    return (
      <div className="resolution-page page-content">
        {milestone}
        <div className="resolution-art" />
        <div className="resolution-content">
          <div className="eyebrow">Spreading Flames · Case closed</div>
          <StarFour size={40} weight="light" />
          <ResolutionPassage game={s} />
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
                  {p.status === "active"
                    ? "Survived"
                    : p.status === "resigned"
                      ? "Resigned"
                      : "Defeated"}{" "}
                  · {p.xp} XP · {p.physicalTrauma} physical / {p.mentalTrauma}{" "}
                  mental trauma
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
            <h3>A sealed case file</h3>
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
    <div className="game-page" data-motion-target="table">
      {milestone}
      <div className="game-title">
        <div>
          <div className="eyebrow">Brethren of Ash / Scenario I</div>
          <HoverPreview
            title="Brethren of Ash · Spreading Flames"
            text={`Act ${s.act} · ${actText[s.act - 1]}\nAgenda ${s.agenda} · ${totalDoom(s)} doom in play\n\nCampaign record\n${s.campaign.notes.length ? s.campaign.notes.join("\n") : "Your discoveries will be recorded here."}`}
          >
            <h1 tabIndex={0}>Spreading Flames</h1>
          </HoverPreview>
        </div>
        <div className="game-header-actions">
          <button
            className="history-trigger"
            aria-label="Read introduction"
            onClick={() => setReplayIntro("campaign")}
          >
            <BookOpen size={17} />
            Read introduction
          </button>
          <button
            className="history-trigger"
            onClick={onHistory}
            aria-label="Event history"
          >
            <ClockCounterClockwise size={17} />
            Event history
          </button>
          <span className="autosaved">
            <CheckCircle size={14} />{" "}
            {saved ? "Autosaved" : "Save needs attention"}
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
              data-motion-target={`investigator-${p.code}`}
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
                  {!!p.doom && (
                    <>
                      <Skull size={11} />
                      {p.doom}
                    </>
                  )}
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
            <Info size={14} aria-hidden="true" />
            {s.phase !== "investigation"
              ? "Resolve each investigator’s encounter or choice. Their seat changes automatically."
              : s.player.turnStarted
                ? `Finish ${member.name}’s turn to pass control.`
                : "Choose any ready investigator to take this turn. Press 1–3 to switch seats."}
          </p>
        )}
      </section>
      <div
        className="phase-track"
        data-motion-target="phase"
        aria-label="Round phases"
      >
        {["mythos", "investigation", "enemy", "upkeep"].map((p, i) => {
          const PhaseIcon = [Moon, MagnifyingGlass, Skull, SunHorizon][i];
          return (
            <div
              className={s.phase === p ? "active" : ""}
              key={p}
              aria-current={s.phase === p ? "step" : undefined}
            >
              <span>0{i + 1}</span>
              <PhaseIcon
                className="phase-symbol"
                size={16}
                weight="thin"
                aria-hidden="true"
              />
              {p}
              <CaretRight size={13} />
            </div>
          );
        })}
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
            <span className="objective-seal" aria-hidden="true">
              <BookOpen size={23} weight="thin" />
            </span>
            <span className="objective-copy">
              <small>
                Current objective <i>ACT {s.act}</i>
              </small>
              <strong>{actText[s.act - 1]}</strong>
            </span>
            <StarFour
              className="objective-ornament"
              size={22}
              weight="thin"
              aria-hidden="true"
            />
          </div>
          <div className="action-bar">
            <div
              className="action-count"
              data-motion-target={`actions-${s.player.code}`}
            >
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
              aria-label="Investigate"
              onClick={() => a("investigate", target, source || undefined)}
              disabled={!!canAct(s, "investigate", target, source || undefined)}
              title={
                canAct(s, "investigate", target, source || undefined) ||
                "Investigate for 1 action"
              }
            >
              <span className="action-emblem">
                <MagnifyingGlass size={22} weight="thin" />
              </span>
              <span className="action-copy">
                <strong>Investigate</strong>
                <small>
                  {source
                    ? `Use ${card(tools.find((tool) => tool.id === source)!.code).name}`
                    : "Basic investigation"}
                </small>
              </span>
              <span className="action-price" title="1 action">
                1<span aria-hidden="true">◆</span>
              </span>
            </button>
            <button
              className="action-button"
              aria-label="Resource"
              onClick={() => a("resource")}
              disabled={!!canAct(s, "resource")}
            >
              <span className="action-emblem">
                <Coins size={22} weight="thin" />
              </span>
              <span className="action-copy">
                <strong>Resource</strong>
                <small>Gain 1 resource</small>
              </span>
            </button>
            <button
              className="action-button"
              aria-label="Draw card"
              onClick={() => a("draw")}
              disabled={!!canAct(s, "draw")}
            >
              <span className="action-emblem">
                <Stack size={22} weight="thin" />
              </span>
              <span className="action-copy">
                <strong>Draw card</strong>
                <small>Draw from your deck</small>
              </span>
            </button>
            <button
              className="action-button fast-action"
              disabled={locked || s.player.turnEnded}
              onClick={() => dispatch({ type: "openWindow" })}
              aria-label="Fast abilities · all investigators"
              title="Fast abilities · all investigators"
            >
              <span className="action-emblem">
                <StarFour size={22} weight="thin" />
              </span>
              <span className="action-copy">
                <strong>Fast abilities</strong>
                <small>Open player window</small>
              </span>
            </button>
            <button
              className="undo-button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo last action"
              title={
                canUndo
                  ? "Take back the last action of this turn (Ctrl+Z or ⌘Z)"
                  : "Nothing to undo in this turn"
              }
            >
              <ArrowCounterClockwise size={16} /> Undo
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
              End turn{" "}
              <span className="end-turn-arrow">
                <ArrowRight size={17} />
              </span>
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
            {loc.code === SCENARIO.dormitories && (
              <Button
                secondary
                disabled={!!canAct(s, "rest")}
                onClick={() => a("rest")}
              >
                Rest · heal 1 damage & 1 horror
              </Button>
            )}
            {loc.code === SCENARIO.library && (
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
            {s.player.threats.includes("12012") && (
              <Button
                secondary
                disabled={!!canAct(s, "necronomicon")}
                onClick={() => a("necronomicon")}
              >
                The Necronomicon · test willpower (5) · 1 action
              </Button>
            )}
            {s.player.assets.some((x) => x.code === "12061") &&
              (["damage", "horror"] as const).map((type) => (
                <Button
                  secondary
                  key={`charm-${type}`}
                  disabled={!!canAct(s, "charm", type)}
                  onClick={() => a("charm", type)}
                >
                  Lucky Charm · move 1 {type} · 1 charge
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
                  .filter((c) => REMOVABLE_THREATS.has(c))
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
                  <div
                    className="enemy-row"
                    key={e.id}
                    data-motion-target={`enemy-${e.id}`}
                  >
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
                              skill={
                                (w.code && WEAPONS[w.code]?.skill) || "combat"
                              }
                              size={16}
                            />
                            <span>
                              <b>{w.code ? card(w.code).name : "Bare hands"}</b>
                              <small>
                                {reason && !locked
                                  ? reason
                                  : w.code && WEAPONS[w.code]?.uses === "ammo"
                                    ? `1 action + 1 ammo · ${w.uses} left · ${WEAPONS[w.code].bonus ? `+${WEAPONS[w.code].bonus} ${WEAPONS[w.code].skill}, ` : ""}${
                                        WEAPONS[w.code].damage === "always" ||
                                        (WEAPONS[w.code].damage ===
                                          "targetExhausted" &&
                                          e.exhausted)
                                          ? 2
                                          : 1
                                      } damage`
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
              {s.player.hand.map((c, i) => (
                <div
                  className="hand-card-wrap"
                  key={c.id}
                  data-motion-target={`card-${c.id}`}
                  style={{ animationDelay: `${Math.min(i, 7) * 45}ms` }}
                >
                  <CardFace
                    c={card(c.code)}
                    compact
                    onClick={() => inspect(c.code)}
                  />
                  <button
                    className="play-card"
                    aria-label={
                      card(c.code).type_code === "skill"
                        ? "Commit during a test"
                        : canPlay(s, c.id)?.includes("reaction")
                          ? "Reaction window"
                          : `Play · ${card(c.code).cost || 0} resources`
                    }
                    disabled={!!canPlay(s, c.id)}
                    title={canPlay(s, c.id) || `Play ${card(c.code).name}`}
                    onClick={() => dispatch({ type: "play", id: c.id })}
                  >
                    {card(c.code).type_code === "skill" ? (
                      <>
                        <StarFour size={14} /> Commit during a test
                      </>
                    ) : canPlay(s, c.id)?.includes("reaction") ? (
                      <>
                        <ClockCounterClockwise size={14} /> Reaction window
                      </>
                    ) : (
                      <>
                        <span className="play-label">
                          Play <ArrowRight size={13} />
                        </span>
                        <span className="play-cost">
                          <Coins size={13} aria-hidden="true" />
                          {card(c.code).cost || 0}
                        </span>
                      </>
                    )}
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
      {replayIntro && (
        <Modal
          title="Read introduction"
          wide
          onClose={() => setReplayIntro(null)}
        >
          <Introduction
            replay
            page={replayIntro}
            onContinue={() =>
              setReplayIntro(replayIntro === "campaign" ? "scenario" : null)
            }
          />
        </Modal>
      )}
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
          {s.test.kind === "investigate" && (
            <p className="investigation-source-summary">
              {testTool && INVESTIGATION_ABILITIES[testTool.code]
                ? `Using ${card(testTool.code).name}. ${INVESTIGATION_ABILITIES[testTool.code].cost} — already paid. ${INVESTIGATION_ABILITIES[testTool.code].effect}`
                : s.test.source
                  ? "Resolving the chosen investigation effect."
                  : "Basic investigation. No asset ability used or supplies spent."}
            </p>
          )}
          <div className="test-values" data-motion-target="test-scene">
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
          {s.test.stage === "commit" && (
            <p className="test-chance" aria-live="polite">
              <span>Chance of success</span>
              <strong>
                {Math.round(
                  successChance(s, testValue(s), s.test.difficulty) * 100,
                )}
                %
              </strong>
              <small>from the {s.bag.length} tokens in the bag</small>
            </p>
          )}
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
                      data-preview-code={c.code}
                      data-motion-target={`commit-${c.id}`}
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
                  .filter((a) => BOOSTS[a.code]?.skills.includes(s.test!.skill))
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
                className="full chaos-draw-trigger"
                onClick={() => {
                  setChaosDrawRequested(true);
                  dispatch({ type: "reveal" });
                }}
              >
                Draw from the chaos bag <StarFour size={18} />
              </Button>
              <p className="test-footnote">
                A tie succeeds. The auto-fail token always fails.
              </p>
            </>
          ) : (
            <ChaosDraw
              test={s.test}
              value={testValue(s)}
              animate={chaosDrawRequested}
              onPresented={setChaosDrawRequested}
            >
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
            </ChaosDraw>
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
          {s.decision.title === "The masked pursuer falls" && <PursuerStory />}
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
                <button
                  key={c}
                  data-preview-code={c}
                  onClick={() => inspect(c)}
                >
                  <span>{card(c).name}</span>
                  <b>×{n}</b>
                </button>
              ))}
          </div>
          <h3>Discard pile · {s.player.discard.length}</h3>
          <div className="deck-list">
            {s.player.discard.map((c) => (
              <button
                key={c.id}
                data-preview-code={c.code}
                onClick={() => inspect(c.code)}
              >
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
