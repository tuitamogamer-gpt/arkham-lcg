import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  CheckCircle,
  Compass,
  FolderOpen,
  Gear,
  House,
  MoonStars,
  SpeakerHigh,
  SpeakerSlash,
  Stack,
  UploadSimple,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { createGame, gameSummary, reduceGame } from "./game/engine";
import { exportSave, readSave, decodeSave, writeSave } from "./game/storage";
import type { Action, Difficulty, GameState } from "./game/types";
import { Archive, Investigators } from "./components/Archive";
import {
  Button,
  CardDetail,
  Modal,
  Sigil,
  SkillStats,
  Token,
} from "./components/Common";
import { CardPreviewLayer } from "./components/Previews";
import { Home } from "./components/Home";
import { Game } from "./components/Game";
import { EventController, EventJournal } from "./components/Events";
import { BAGS, card, CARD_ART, PLAYABLE_INVESTIGATORS } from "./game/data";
import { availableCards } from "./game/knowledge";
import {
  readMotionPreference,
  type MotionPreference,
} from "./components/Motion";
type Page = "home" | "investigators" | "archive" | "guide" | "game";
declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => Promise<void>;
  }
}
function Guide() {
  return (
    <div className="page-content guide-page">
      <div className="eyebrow">A field guide to the unknown</div>
      <h1>Every clue is a way forward.</h1>
      <p className="page-subtitle">
        The essentials for your first investigation.
      </p>
      <div className="guide-grid">
        {[
          [
            "01",
            "Three actions. Make them count.",
            "During your turn, take up to three actions: investigate, move, fight, evade, play a card, draw a card, or gain a resource. Fast abilities do not spend an action. You may end your turn early.",
          ],
          [
            "02",
            "Investigate. Follow the story.",
            "Use intellect to test against your location’s shroud. Succeed to discover a clue. Acts explain your objective; in Spreading Flames, the first act requires 2 clues per investigator, paid as a group at the end of the round.",
          ],
          [
            "03",
            "Trust your skills. Fear the bag.",
            "Commit cards with matching skill or wild icons, then reveal a chaos token. Your modified skill must equal or exceed the difficulty. Committed cards are discarded whether you succeed or fail.",
          ],
          [
            "04",
            "The city fights back.",
            "Fight with combat or evade with agility. Evading exhausts and disengages an enemy, giving you a chance to escape. Other actions while engaged usually provoke an enemy attack. Parley with Bystanders to avoid their Doomed penalty.",
          ],
          [
            "05",
            "The round unfolds in phases.",
            "After every investigator has finished their turn, hunters move and engaged enemies attack their targets. Upkeep readies cards, draws a card, and grants a resource for each investigator. The next mythos phase adds one doom and draws one encounter per investigator. The first round skips mythos.",
          ],
          [
            "06",
            "You control the pace.",
            "Read each event, its card, and the before-and-after changes, then choose Continue when you are ready. Attacks and encounters wait for confirmation before resolving. View table keeps the game paused; Event history lets you revisit recent events. Your save preserves the exact pause, test, or choice. Scenario outcomes record experience and trauma in your campaign log.",
          ],
        ].map(([n, title, text]) => (
          <article key={n}>
            <span>{n}</span>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <section className="coverage-note">
        <CheckCircle size={21} />
        <div>
          <h3>What you can play in this first build</h3>
          <p>
            Spreading Flames with 1–3 investigators, all controlled by you.
            Choose Joe Diamond, Daniela Reyes, and Trish Scarborough with their
            official 2026 starter decks. Each investigator has a separate hand,
            deck, resources, clues, health, sanity, and three-action turn. Trish
            also has her extra evade action.
          </p>
          <p>
            Finish an investigator’s turn before changing seats. You may choose
            a different ready investigator before taking your first action. At
            the same location, teammates can each commit one card to your test.
            The shared scenario scales with the original party size, even after
            an investigator is eliminated. Dexter, Isabelle, later scenarios,
            custom decks, campaign upgrades, and general timing windows remain
            in development.
          </p>
        </div>
      </section>
      <div className="source-links">
        <a href="https://arkhamdb.com/api/doc" target="_blank" rel="noreferrer">
          ArkhamDB API <ArrowUpRight size={15} />
        </a>
        <a
          href="https://github.com/zzorba/arkhamdb-json-data"
          target="_blank"
          rel="noreferrer"
        >
          Card data repository <ArrowUpRight size={15} />
        </a>
        <a
          href="https://images-cdn.fantasyflightgames.com/filer_public/0e/d0/0ed09507-1705-47ed-a630-cd15885cabb0/ahc100_rulebook-web.pdf"
          target="_blank"
          rel="noreferrer"
        >
          2026 rulebook <ArrowUpRight size={15} />
        </a>
      </div>
    </div>
  );
}
export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [game, setGame] = useState<GameState | null>(readSave);
  const [inspect, setInspect] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [selectedInvestigators, setSelectedInvestigators] = useState<string[]>([
    "12004",
  ]);
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [scenario, setScenario] = useState<number | null>(null);
  const [settings, setSettings] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const [motion, setMotion] = useState<MotionPreference>(readMotionPreference);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (query.matches) document.getAnimations().forEach((a) => a.cancel());
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = motion;
    try {
      localStorage.setItem("arkham-chronicle:motion", motion);
    } catch {
      /* Optional preference. */
    }
    // Changing the setting also stops effects already in flight.
    if (motion !== "full") document.getAnimations().forEach((a) => a.cancel());
  }, [motion]);
  const [notice, setNotice] = useState("");
  const soundRef = useRef<AudioContext | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const navigate = (p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const dispatch = useCallback(
    (a: Action) => setGame((s) => (s ? reduceGame(s, a) : null)),
    [],
  );
  useEffect(() => {
    if (game) {
      try {
        writeSave(game);
      } catch {
        setNotice(
          "Your browser could not save this game. Use Export save in settings to keep a copy.",
        );
      }
    }
  }, [game]);
  useEffect(() => {
    window.render_game_to_text = () =>
      JSON.stringify({
        page,
        ...(game
          ? gameSummary(game)
          : {
              status: "campaign selection",
              available:
                "Spreading Flames · 1–3 investigators · Joe, Daniela, Trish",
            }),
      });
    window.advanceTime = async () => {};
  }, [game, page]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "f" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        if (document.fullscreenElement) void document.exitFullscreen();
        else
          void document.documentElement
            .requestFullscreen()
            .catch(() =>
              setNotice("Fullscreen is unavailable in this browser."),
            );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(
    () => () => {
      void soundRef.current?.close();
    },
    [],
  );
  const toggleSound = () => {
    if (sound) {
      void soundRef.current?.close();
      soundRef.current = null;
      setSound(false);
      return;
    }
    try {
      const ctx = new AudioContext();
      soundRef.current = ctx;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + Math.random() * 0.025 - 0.0125) * 0.998;
        data[i] = last;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 250;
      const gain = ctx.createGain();
      gain.gain.value = 0.16;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
      setSound(true);
    } catch {
      setNotice("Ambient sound is unavailable in this browser.");
    }
  };
  const start = () => {
    setGame(
      createGame(
        difficulty,
        crypto.getRandomValues(new Uint32Array(1))[0] || 1,
        selectedInvestigators,
      ),
    );
    setSetup(false);
    navigate("game");
  };
  const onStart = () => setSetup(true);
  const navItems: [Page, string, typeof Compass][] = [
    ["home", "Campaigns", Compass],
    ["investigators", "Investigator files", UsersThree],
    ["archive", "Card archive", Stack],
    ["guide", "Field guide", BookOpenText],
  ];
  return (
    <div className={`app ${page === "game" ? "in-game" : ""}`}>
      <CardPreviewLayer game={game} page={page} />
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate("home")}
          aria-label="Arkham Chronicle home"
        >
          <Sigil />
          <span>
            ARKHAM<small>CHRONICLE</small>
          </span>
        </button>
        <div className="sidebar-rule">
          <span>THE CARD GAME</span>
        </div>
        <nav>
          {navItems.map(([id, label, Icon]) => (
            <button
              className={page === id ? "active" : ""}
              key={id}
              aria-label={label}
              onClick={() => navigate(id)}
            >
              <Icon size={20} weight="light" />
              <span>{label}</span>
              {id === "archive" && <small>{availableCards(game).length}</small>}
            </button>
          ))}
          {game && (
            <button
              className={
                page === "game" ? "active continue-nav" : "continue-nav"
              }
              aria-label="Current investigation"
              onClick={() => navigate("game")}
            >
              <FolderOpen size={20} weight="light" />
              <span>Current investigation</span>
              <i />
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="edition-plaque">
            <MoonStars size={24} weight="thin" />
            <span>
              A NEW CHAPTER
              <br />
              <b>Core Set 2026</b>
            </span>
          </div>
          <button
            className="sidebar-control"
            aria-label="Toggle ambient sound"
            onClick={toggleSound}
          >
            {sound ? (
              <SpeakerHigh size={18} weight="light" />
            ) : (
              <SpeakerSlash size={18} weight="light" />
            )}
            <span>Ambience</span>
            <i className={sound ? "on" : ""} />
          </button>
          <button
            className="sidebar-control"
            aria-label="Settings & saves"
            onClick={() => setSettings(true)}
          >
            <Gear size={18} weight="light" />
            <span>Settings & saves</span>
          </button>
          <div className="sidebar-foot">
            THE UNKNOWN AWAITS <span>✧</span>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <House size={15} weight="light" />
            <span>/</span>
            <span>
              {page === "home"
                ? "Campaigns"
                : page === "game"
                  ? "Your investigation"
                  : page === "archive"
                    ? "Card archive"
                    : page === "guide"
                      ? "Field guide"
                      : "Investigator files"}
            </span>
          </div>
          <div className="topbar-right">
            <span className="local-indicator">
              <i /> THE NIGHT IS YOURS
            </span>
            <button
              onClick={() => navigate("guide")}
              className="help-button"
              aria-label="Open field guide"
            >
              ?
            </button>
            <div className="user-monogram">
              {game
                ? card(game.player.code)
                    .name.split(" ")
                    .map((n) => n[0])
                    .join("")
                : "AH"}
            </div>
          </div>
        </header>
        {page === "home" && (
          <Home
            game={game}
            onStart={onStart}
            onResume={() => navigate("game")}
            onFiles={() => navigate("investigators")}
            onGuide={() => navigate("guide")}
            onScenario={(n) =>
              n === 0 ? (game ? navigate("game") : onStart()) : setScenario(n)
            }
          />
        )}{" "}
        {page === "archive" && <Archive game={game} inspect={setInspect} />}{" "}
        {page === "investigators" && (
          <Investigators inspect={setInspect} onStart={onStart} />
        )}{" "}
        {page === "guide" && <Guide />}{" "}
        {page === "game" && game && (
          <Game
            game={game}
            dispatch={dispatch}
            inspect={setInspect}
            onHome={() => navigate("home")}
            onExport={() => exportSave(game)}
            onHistory={() => setHistoryOpen(true)}
          />
        )}
      </div>
      {page === "game" && game && (
        <EventController
          game={game}
          dispatch={dispatch}
          inspect={setInspect}
          obscured={!!inspect || settings || setup || historyOpen}
        />
      )}
      {page === "game" && game && historyOpen && (
        <EventJournal game={game} onClose={() => setHistoryOpen(false)} />
      )}
      {setup && (
        <Modal
          title="Begin your investigation"
          onClose={() => setSetup(false)}
          wide
        >
          <div className="setup-modal">
            <div className="setup-art">
              <span>
                CASE FILE
                <br />
                <b>001</b>
              </span>
            </div>
            <div className="setup-content">
              <div className="eyebrow">Brethren of Ash / Scenario I</div>
              <h2>Spreading Flames</h2>
              <p>
                A friend has gone missing from their dormitory. Their room is
                empty, and a strange quiet has fallen over Miskatonic
                University.
              </p>
              <div className="party-setup-heading">
                <span className="eyebrow">Assemble your investigators</span>
                <span>{selectedInvestigators.length} / 3 selected</span>
              </div>
              <p className="party-setup-help">
                Control every investigator yourself. Choose one for true solo,
                or two or three for a shared hot-seat investigation.
              </p>
              <div className="party-choices">
                {PLAYABLE_INVESTIGATORS.map((c) => {
                  const investigator = card(c),
                    selected = selectedInvestigators.includes(c);
                  return (
                    <button
                      key={c}
                      data-preview-code={c}
                      className={`investigator-choice ${investigator.faction_code} ${selected ? "selected" : ""}`}
                      aria-pressed={selected}
                      aria-label={`Select ${investigator.name}`}
                      onClick={() =>
                        setSelectedInvestigators((current) =>
                          current.includes(c)
                            ? current.length > 1
                              ? current.filter((x) => x !== c)
                              : current
                            : [...current, c],
                        )
                      }
                    >
                      <img src={CARD_ART[c]} alt={investigator.name} />
                      <span className="choice-check">
                        {selected ? (
                          <CheckCircle size={19} weight="fill" />
                        ) : (
                          <span />
                        )}
                      </span>
                      <span className="choice-details">
                        <small>
                          {investigator.faction_code} ·{" "}
                          {c === "12004"
                            ? "Clues & combat"
                            : c === "12001"
                              ? "Protection & combat"
                              : "Evasion & clues"}
                        </small>
                        <strong>{investigator.name}</strong>
                        <span>
                          {selected && selectedInvestigators[0] === c
                            ? "Lead investigator · "
                            : ""}
                          33-card official starter
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedInvestigators.length > 1 && (
                <label className="lead-picker">
                  Lead investigator{" "}
                  <select
                    aria-label="Lead investigator"
                    value={selectedInvestigators[0]}
                    onChange={(e) =>
                      setSelectedInvestigators((list) => [
                        e.target.value,
                        ...list.filter((c) => c !== e.target.value),
                      ])
                    }
                  >
                    {selectedInvestigators.map((c) => (
                      <option value={c} key={c}>
                        {card(c).name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="difficulty-label" htmlFor="difficulty">
                Choose your difficulty
              </label>
              <div className="difficulty-options">
                {(["easy", "standard", "hard", "expert"] as Difficulty[]).map(
                  (d) => (
                    <button
                      key={d}
                      className={d === difficulty ? "selected" : ""}
                      onClick={() => setDifficulty(d)}
                    >
                      {d}
                    </button>
                  ),
                )}
              </div>
              <p className="difficulty-description">
                {
                  {
                    easy: "For the story. A more forgiving chaos bag.",
                    standard: "A fair challenge. Arkham rarely plays fair.",
                    hard: "For experienced investigators. The odds turn against you.",
                    expert: "For those who know what waits in the darkness.",
                  }[difficulty]
                }
              </p>
              <div className="bag-preview">
                {BAGS[difficulty].map((t, i) => (
                  <Token token={t} key={i} />
                ))}
              </div>
              {game && (
                <p className="replace-note">
                  Starting a new case replaces your current local save.{" "}
                  <button onClick={() => exportSave(game)}>
                    Export current save
                  </button>
                </p>
              )}
              <Button onClick={start} className="full" arrow>
                Enter Miskatonic University
              </Button>
              <span className="setup-footnote">
                {selectedInvestigators.length} investigator
                {selectedInvestigators.length === 1 ? "" : "s"} · One controller
                · Autosave enabled
              </span>
            </div>
          </div>
        </Modal>
      )}
      {scenario !== null && (
        <Modal title="Sealed chapter" onClose={() => setScenario(null)}>
          <div className="modal-intro">
            <div className="eyebrow">
              Scenario 0{scenario + 1} · Coming later
            </div>
            <h2>This case file is sealed.</h2>
            <p>
              Follow the current investigation. Later titles, locations and
              discoveries stay sealed until their story begins.
            </p>
            <p>
              This chapter is not playable yet. Your current campaign record
              stays saved for a future continuation.
            </p>
          </div>
          <Button
            onClick={() => {
              setScenario(null);
              game ? navigate("game") : onStart();
            }}
            arrow
          >
            Return to your investigation
          </Button>
        </Modal>
      )}
      {settings && (
        <Modal title="Settings and saves" onClose={() => setSettings(false)}>
          <div className="modal-intro">
            <div className="eyebrow">Your investigator’s desk</div>
            <h2>Settings & saves</h2>
            <p>
              Your game is saved in this browser. Export a copy to back it up or
              continue on another device.
            </p>
          </div>
          <div className="settings-actions">
            <label className="motion-setting">
              <span>Table animations</span>
              <select
                aria-label="Table animations"
                value={motion}
                onChange={(e) => setMotion(e.target.value as MotionPreference)}
              >
                <option value="full">Cinematic</option>
                <option value="subtle">Subtle</option>
                <option value="off">Off</option>
              </select>
              <small>
                Effects follow your actions. Continue always stays in your
                control. Your device’s reduced motion preference is respected.
              </small>
            </label>
            <Button
              secondary
              disabled={!game}
              onClick={() => game && exportSave(game)}
            >
              <FolderOpen size={18} /> Export saved game
            </Button>
            <Button secondary onClick={() => input.current?.click()}>
              <UploadSimple size={18} /> Import saved game
            </Button>
            <Button secondary onClick={toggleSound}>
              {sound ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} />}{" "}
              Ambient sound: {sound ? "on" : "off"}
            </Button>
          </div>
          <input
            type="file"
            accept="application/json,.json"
            ref={input}
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 2000000) throw new Error("too large");
                const value: unknown = JSON.parse(await file.text());
                const decoded = decodeSave(value);
                if (!decoded) throw new Error("invalid");
                setGame(decoded);
                navigate("game");
                setSettings(false);
                setNotice("Saved investigation restored.");
              } catch {
                setNotice(
                  "This is not a valid Arkham Chronicle save. Your current game is unchanged.",
                );
              }
              e.target.value = "";
            }}
          />
          <p className="quiet-note">
            Press F for fullscreen. Sound starts only when you enable it.
          </p>
          <div className="build-info">
            <span>FIRST PLAYABLE BUILD · 0.1.0</span>
            <p>
              Spreading Flames / Joe Diamond
              <br />
              Card data snapshot · 23 September 2026
            </p>
          </div>
        </Modal>
      )}
      {inspect && (
        <CardDetail
          code={inspect}
          game={game}
          onClose={() => setInspect(null)}
        />
      )}{" "}
      {notice && (
        <div role="status" className="toast">
          <CheckCircle size={18} />
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
