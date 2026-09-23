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
import { exportSave, readSave, validSave, writeSave } from "./game/storage";
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
import { Home } from "./components/Home";
import { Game } from "./components/Game";
import { BAGS } from "./game/data";
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
            "Use intellect to test against your location’s shroud. Succeed to discover a clue. Acts explain your objective; in Spreading Flames, the first act requires 2 clues at the end of the round.",
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
            "The clock never stops.",
            "After your turn, hunters move and engaged enemies attack. Upkeep readies cards, draws a card, and grants a resource. The next mythos phase adds doom and draws an encounter. The first round skips mythos.",
          ],
          [
            "06",
            "Live with your choices.",
            "Defeat is part of the story. Scenario outcomes record experience and trauma in your campaign log. Your game saves locally after every choice—even in the middle of a skill test. Export it to keep a portable copy.",
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
            Solo Spreading Flames, using Joe Diamond’s 2026 investigator and
            official 33-card starter deck. The four acts, three agendas,
            encounter deck, card abilities, chaos tests, and scenario
            resolutions are scripted. Other investigators and later scenarios
            are available to explore in the archive; their gameplay is still to
            come.
          </p>
          <p>
            Damage and horror are assigned one point at a time, then applied
            simultaneously. The engine covers this fixed solo card pool;
            multiplayer, custom decks, a general timing-window system, and
            campaign upgrades are not implemented.
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
        <a
          href="https://images-cdn.fantasyflightgames.com/filer_public/f0/22/f022ac7c-9c30-4521-ac16-1f74f00e1d31/ahc100_campaign_guide-web.pdf"
          target="_blank"
          rel="noreferrer"
        >
          Campaign guide <ArrowUpRight size={15} />
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
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [scenario, setScenario] = useState<number | null>(null);
  const [settings, setSettings] = useState(false);
  const [sound, setSound] = useState(false);
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
              available: "Spreading Flames · Joe Diamond",
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
              {id === "archive" && <small>196</small>}
            </button>
          ))}
          {game && (
            <button
              className={
                page === "game" ? "active continue-nav" : "continue-nav"
              }
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
              <i /> ALL SYSTEMS LOCAL
            </span>
            <button
              onClick={() => navigate("guide")}
              className="help-button"
              aria-label="Open field guide"
            >
              ?
            </button>
            <div className="user-monogram">JD</div>
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
        {page === "archive" && <Archive inspect={setInspect} />}{" "}
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
          />
        )}
      </div>
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
              <div className="setup-investigator">
                <div className="portrait-small" />
                <div>
                  <span className="class-label">YOUR INVESTIGATOR</span>
                  <h3>Joe Diamond</h3>
                  <span>Official 2026 starter deck · 33 cards</span>
                </div>
              </div>
              <SkillStats />
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
                Solo · Scripted rules · Autosave enabled
              </span>
            </div>
          </div>
        </Modal>
      )}
      {scenario !== null && (
        <Modal title="Upcoming scenario" onClose={() => setScenario(null)}>
          <div className="modal-intro">
            <div className="eyebrow">
              Scenario 0{scenario + 1} · Coming later
            </div>
            <h2>{scenario === 1 ? "Smoke and Mirrors" : "Queen of Ash"}</h2>
            <p>
              {scenario === 1
                ? "The investigation continues through the streets of Arkham, following the trail of a dangerous cult."
                : "Beneath the city, a final confrontation awaits."}
            </p>
            <p>
              This chapter’s cards are in the archive. Its scenario script is
              planned for a later build.
            </p>
          </div>
          <Button
            onClick={() => {
              setScenario(null);
              navigate("archive");
            }}
            arrow
          >
            Explore the card archive
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
                if (!validSave(value)) throw new Error("invalid");
                setGame(value);
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
        <CardDetail code={inspect} onClose={() => setInspect(null)} />
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
