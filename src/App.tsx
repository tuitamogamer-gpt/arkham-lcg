import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { applyUpdate, getUpdateAvailable, subscribeUpdate } from "./pwa";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  CheckCircle,
  Compass,
  FolderOpen,
  Gear,
  GraduationCap,
  House,
  Info,
  MoonStars,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  Stack,
  Trash,
  UploadSimple,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { createGame, gameSummary, reduceGame } from "./game/engine";
import { isUndoBarrier } from "./game/undo";
import type { Tempo } from "./game/presentation";
import {
  MAX_SLOTS,
  exportSave,
  listSaves,
  loadSave,
  decodeSave,
} from "./game/storage";
import {
  createSaveDeletion,
  createSaveSession,
  loadSaveSnapshot,
  SaveConflictError,
  type SaveSnapshot,
} from "./game/saveSession";
import { useInvestigationSave } from "./useInvestigationSave";
import type { Action, Difficulty, GameState } from "./game/types";
import { audio, readAudioPreference, readAudioVolume } from "./audio";
import {
  Tutorial,
  resetTutorial,
  tutorialPending,
} from "./components/Tutorial";
import { InvestigatorLibrary } from "./components/InvestigatorLibrary";
// The collection browser and optional native tools are only needed on their own
// pages, so they load as separate chunks and keep the game shell small.
const Archive = lazy(() =>
  import("./components/Archive").then((m) => ({ default: m.Archive })),
);
const localRulesEnabled = import.meta.env.VITE_ENABLE_LOCAL_RULES === "true";
const CampaignLibrary = lazy(() =>
  import("./components/CampaignLibrary").then((m) => ({
    default: m.CampaignLibrary,
  })),
);
const ExpandedPlay = localRulesEnabled
  ? lazy(() =>
      import("./components/ExpandedPlay").then((m) => ({
        default: m.ExpandedPlay,
      })),
    )
  : null;
import { catalog } from "./game/catalog";
import {
  Button,
  CardDetail,
  Modal,
  Sigil,
  topDialog,
} from "./components/Common";
import { PageBoundary } from "./components/PageBoundary";
import "./app-refinements.css";
import { ChaosBagPreview } from "./components/ChaosBagPreview";
import { CardPreviewLayer } from "./components/Previews";
import { InvestigationAbility } from "./components/InvestigationAbility";
import { Home } from "./components/Home";
import { Game } from "./components/Game";
import { EventController, EventJournal } from "./components/Events";
import { card } from "./game/data";
import {
  readMotionPreference,
  type MotionPreference,
} from "./components/Motion";
type Page =
  "home" | "investigators" | "archive" | "guide" | "game" | "expanded";
function readTempoPreference(): Tempo {
  try {
    const value = localStorage.getItem("arkham-chronicle:tempo");
    if (value === "smart" || value === "fast") return value;
  } catch {
    /* Optional preference. */
  }
  return "detailed";
}
const resultLabel = (result: string | null) =>
  result === "saved"
    ? "Miskatonic saved"
    : result === "pursuer"
      ? "Pursuer defeated, campus burned"
      : result === "overrun"
        ? "The campus was overrun"
        : result === "resigned"
          ? "Resigned"
          : result === "defeat"
            ? "Defeated"
            : "In progress";
declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => Promise<void>;
  }
}
function PageLoading() {
  return (
    <div className="page-content" role="status" aria-live="polite">
      <p className="page-subtitle">Opening…</p>
    </div>
  );
}
function Guide({ onExpanded }: { onExpanded: () => void }) {
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
          <h3>Your first case — and what comes next</h3>
          <p>
            Spreading Flames with 1–3 investigators, all controlled by you.
            Choose from Joe Diamond, Daniela Reyes, Trish Scarborough, Dexter
            Drake and Isabelle Barnes with their official 2026 starter decks.
            Each investigator has a separate hand, deck, resources, clues,
            health, sanity, and three-action turn. Trish also has her extra
            evade action.
          </p>
          <p>
            Finish an investigator’s turn before changing seats. You may choose
            a different ready investigator before taking your first action. At
            the same location, teammates can each commit one card to your test.
            The shared scenario scales with the original party size, even after
            an investigator is eliminated.
          </p>
          <p>
            Expansions & campaigns lets you explore the imported collection.
            Spreading Flames is playable directly in your browser, including
            offline once the app is cached. Other scenarios are available to
            browse. No desktop installation or account is needed.
          </p>
          <Button secondary onClick={onExpanded}>
            Explore expansions & campaigns <ArrowRight size={17} />
          </Button>
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
  const updateAvailable = useSyncExternalStore(
    subscribeUpdate,
    getUpdateAvailable,
    () => false,
  );
  const [page, setPage] = useState<Page>(() =>
    window.location.hash.startsWith("#investigation=") ? "expanded" : "home",
  );
  const mainContent = useRef<HTMLElement>(null);
  const previousPage = useRef(page);
  useEffect(() => {
    const names: Record<Page, string> = {
      home: "Campaigns",
      game: "Your investigation",
      archive: "Card archive",
      investigators: "Investigator files",
      guide: "Field guide",
      expanded: "Expansions & campaigns",
    };
    document.title = `${names[page]} · Arkham Chronicle`;
    if (previousPage.current !== page) {
      previousPage.current = page;
      const frame = requestAnimationFrame(() => {
        if (!topDialog()) mainContent.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [page]);
  const [companionTableOpen, setCompanionTableOpen] = useState(false);
  const [expandedInvestigator, setExpandedInvestigator] = useState<string>();
  const [archiveProduct, setArchiveProduct] = useState<string>();
  const {
    game,
    gameRef,
    sessionRef,
    commitGame,
    restoreGame,
    persist,
    status: saveStatus,
    error: saveError,
    saves,
    setSaves,
  } = useInvestigationSave();
  const saveFailed = saveStatus === "failed" || saveStatus === "conflict";
  const transitionPending = useRef(false);
  // Re-prime presentation hooks even when restoring a newer save of this case.
  const [restorationSerial, setRestorationSerial] = useState(0);
  const undoStack = useRef<GameState[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const [tempo, setTempo] = useState<Tempo>(readTempoPreference);
  const tempoRef = useRef(tempo);
  tempoRef.current = tempo;
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const deleteSession = useRef<ReturnType<typeof createSaveDeletion> | null>(
    null,
  );
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloadCandidate, setReloadCandidate] = useState<SaveSnapshot | null>(
    null,
  );
  const [ambience, setAmbience] = useState(() =>
    readAudioPreference("ambience"),
  );
  const [effects, setEffects] = useState(() => readAudioPreference("effects"));
  const [audioMuted, setAudioMuted] = useState(() =>
    readAudioPreference("muted"),
  );
  const [audioVolume, setAudioVolume] = useState(readAudioVolume);
  const [tutorial, setTutorial] = useState(tutorialPending);
  useEffect(() => {
    try {
      localStorage.setItem("arkham-chronicle:tempo", tempo);
    } catch {
      /* Optional preference. */
    }
  }, [tempo]);
  useEffect(() => {
    audio.setEffects(effects);
  }, [effects]);
  useEffect(() => {
    // A saved "on" preference starts the ambience itself; the context resumes
    // on the first gesture, so the controls and the sound agree after a reload.
    if (ambience && !audio.setAmbience(true)) setAmbience(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [inspect, setInspect] = useState<string | null>(null);
  const [inspectCatalog, setInspectCatalog] = useState(false);
  const [inspectAssetId, setInspectAssetId] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [selectedInvestigators, setSelectedInvestigators] = useState<string[]>([
    "12004",
  ]);
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [scenario, setScenario] = useState<number | null>(null);
  const [settings, setSettings] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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
  useEffect(() => {
    if (!saveError) return;
    setNotice(
      saveError instanceof SaveConflictError
        ? "This investigation changed in another tab. Your open version is kept here; choose which version to continue in Settings & saves."
        : saveError instanceof Error && saveError.message === "slots"
          ? `You already keep ${MAX_SLOTS} investigations. Delete one in Settings & saves so this one can be saved.`
          : "Your browser could not save this game. Use Export save in settings to keep a copy.",
    );
  }, [saveError]);
  const input = useRef<HTMLInputElement>(null);
  const navigate = (p: Page) => {
    if (p !== "expanded" && window.location.hash.startsWith("#investigation="))
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    setPage(p);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const dispatch = useCallback(
    (a: Action) => {
      const s = gameRef.current;
      if (!s || transitionPending.current) return;
      const next = reduceGame(s, a, { tempo: tempoRef.current });
      if (next === s) return;
      const barrier = isUndoBarrier(s, next, a);
      if (barrier) undoStack.current = [];
      else if (!["continue", "clearError"].includes(a.type))
        undoStack.current = [...undoStack.current.slice(-29), s];
      setUndoDepth(undoStack.current.length);
      commitGame(next);
    },
    [commitGame],
  );
  const undo = useCallback(() => {
    if (transitionPending.current) return;
    const previous = undoStack.current.pop();
    if (!previous) return;
    setUndoDepth(undoStack.current.length);
    commitGame(previous);
  }, [commitGame]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z" &&
        page === "game" &&
        !inspect &&
        !settings &&
        !setup &&
        !historyOpen &&
        !(e.target as HTMLElement | null)?.closest(
          "input, textarea, select, [contenteditable=true]",
        )
      ) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [page, undo, inspect, settings, setup, historyOpen]);
  useEffect(() => {
    window.render_game_to_text = () =>
      JSON.stringify({
        page,
        collection: {
          cards: catalog.counts.cardCount,
          products: catalog.counts.productCount,
          investigatorVersions: catalog.counts.investigatorCount,
        },
        ...(page === "expanded"
          ? {
              status: localRulesEnabled
                ? "companion rules table"
                : "campaign and expansion library",
              available: localRulesEnabled
                ? "Content availability follows the connected rules engine"
                : "Spreading Flames playable in browser; imported products available to browse",
            }
          : game
            ? gameSummary(game)
            : {
                status: "campaign selection",
                available:
                  "Spreading Flames · 1–3 investigators · Joe, Daniela, Trish, Dexter, Isabelle",
              }),
      });
    window.advanceTime = async () => {};
  }, [game, page]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "f" &&
        // Ctrl/⌘+F is the browser's find; Alt+F and held keys are not requests.
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.repeat &&
        !(e.target as HTMLElement | null)?.closest(
          "input, textarea, select, [contenteditable=true]",
        )
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
  const toggleSound = () => {
    const next = !ambience;
    setAmbience(next);
    if (!audio.setAmbience(next))
      setNotice("Ambient sound is unavailable in this browser.");
  };
  const toggleEffects = () => {
    audio.setEffects(!effects);
    setEffects(!effects);
  };
  const transition = async (work: () => Promise<void>) => {
    if (transitionPending.current) return;
    transitionPending.current = true;
    try {
      await work();
    } finally {
      transitionPending.current = false;
    }
  };
  const preserveBeforeSwitch = async () => {
    if (await persist()) return true;
    setSetup(false);
    setSettings(true);
    return false;
  };
  const openSnapshot = (snapshot: SaveSnapshot) => {
    undoStack.current = [];
    setUndoDepth(0);
    setRestorationSerial((serial) => serial + 1);
    restoreGame(snapshot);
    setSettings(false);
    navigate("game");
  };
  const openSave = (id: string) =>
    transition(async () => {
      if (!(await preserveBeforeSwitch())) return;
      const snapshot = loadSaveSnapshot(id);
      if (!snapshot) {
        setNotice("This saved investigation could not be read.");
        return;
      }
      openSnapshot(snapshot);
    });
  const prepareDelete = (id: string) => {
    try {
      deleteSession.current = createSaveDeletion(id);
      setConfirmDelete(id);
    } catch {
      setNotice(
        "Your browser could not read this investigation. Its stored data has been kept.",
      );
    }
  };
  const removeSave = (id: string) =>
    transition(async () => {
      try {
        if (id === gameRef.current?.id) {
          if (!(await preserveBeforeSwitch())) return;
          await sessionRef.current?.delete();
        } else {
          if (!deleteSession.current || confirmDelete !== id) return;
          await deleteSession.current.delete();
        }
      } catch (error) {
        setNotice(
          error instanceof SaveConflictError
            ? "This investigation changed after you selected it. Its saved copy has been kept; review it before deleting."
            : "This investigation could not be deleted. Your saved copy has been kept; please try again.",
        );
        setConfirmDelete(null);
        return;
      }
      setConfirmDelete(null);
      setSaves(listSaves());
      if (game?.id === id) {
        undoStack.current = [];
        setUndoDepth(0);
        commitGame(null);
        navigate("home");
      }
      setNotice("Saved investigation deleted.");
    });
  const saveSeparateCopy = () =>
    transition(async () => {
      const current = gameRef.current;
      if (!current) return;
      const copy = { ...structuredClone(current), id: crypto.randomUUID() };
      try {
        await createSaveSession({ game: copy, revision: null }).save(copy);
        const snapshot = loadSaveSnapshot(copy.id);
        if (!snapshot) throw new Error("unreadable copy");
        openSnapshot(snapshot);
        setNotice(
          "Your version is saved as a separate investigation. The other saved version is unchanged.",
        );
      } catch (error) {
        setNotice(
          error instanceof Error && error.message === "slots"
            ? `All ${MAX_SLOTS} save slots are full. Export your version or delete another investigation first.`
            : "The separate copy could not be saved. Your version is still open; export it to keep a copy.",
        );
      }
    });
  const start = () =>
    transition(async () => {
      if (!(await preserveBeforeSwitch())) return;
      if (listSaves().length >= MAX_SLOTS) {
        setNotice(
          `You already keep ${MAX_SLOTS} investigations. Delete one in Settings & saves first.`,
        );
        return;
      }
      undoStack.current = [];
      setUndoDepth(0);
      const next = createGame(
        difficulty,
        crypto.getRandomValues(new Uint32Array(1))[0] || 1,
        selectedInvestigators,
      );
      // The shuffle seed is not an investigation identity across devices.
      next.id = crypto.randomUUID();
      commitGame(next);
      setSetup(false);
      navigate("game");
    });
  const onStart = () => setSetup(true);
  const navItems: [Page, string, typeof Compass][] = [
    ["home", "Campaigns", Compass],
    ["expanded", "Expansions & campaigns", GraduationCap],
    ["investigators", "Investigator files", UsersThree],
    ["archive", "Card archive", Stack],
    ["guide", "Field guide", BookOpenText],
  ];
  return (
    <div
      className={`app ${page === "game" || (page === "expanded" && companionTableOpen) ? "in-game" : ""}`}
    >
      <a
        className="skip-navigation"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainContent.current?.focus();
        }}
      >
        Skip to content
      </a>
      <CardPreviewLayer game={game} page={page} dispatch={dispatch} />
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
        <nav aria-label="Main navigation">
          {navItems.map(([id, label, Icon]) => (
            <button
              className={page === id ? "active" : ""}
              key={id}
              aria-label={label}
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={20} weight="light" />
              <span>{label}</span>
              {id === "archive" && (
                <small>{catalog.counts.cardCount.toLocaleString()}</small>
              )}
            </button>
          ))}
          {game && (
            <button
              className={
                page === "game" ? "active continue-nav" : "continue-nav"
              }
              aria-label="Current investigation"
              aria-current={page === "game" ? "page" : undefined}
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
            aria-pressed={ambience}
            onClick={toggleSound}
          >
            {ambience ? (
              <SpeakerHigh size={18} weight="light" />
            ) : (
              <SpeakerSlash size={18} weight="light" />
            )}
            <span>Ambience</span>
            <i className={ambience ? "on" : ""} />
          </button>
          <button
            className={`sidebar-control ${updateAvailable ? "has-update" : ""}`}
            aria-label="Settings & saves"
            title={
              updateAvailable
                ? "An app update is ready in Settings & saves"
                : "Settings & saves"
            }
            onClick={() => setSettings(true)}
          >
            <Gear size={18} weight="light" />
            <span>Settings & saves</span>
            {updateAvailable && <i className="update-dot" aria-hidden="true" />}
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
                      : page === "expanded"
                        ? "Expansions & campaigns"
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
        <main
          id="main-content"
          className="page-content-root"
          ref={mainContent}
          tabIndex={-1}
        >
          {game && saveFailed && (
            <section
              className="save-integrity-banner"
              aria-label="Investigation save status"
            >
              <span>
                {saveStatus === "conflict"
                  ? "Another tab changed this investigation. Your version is still open here."
                  : "Your latest changes are not saved. Keep this tab open until you save or export them."}
              </span>
              <button onClick={() => setSettings(true)}>
                Review save options
              </button>
            </section>
          )}
          {page === "home" && (
            <Home
              game={game}
              onStart={onStart}
              onChooseInvestigator={(code) => {
                setSelectedInvestigators([code]);
                onStart();
              }}
              onResume={() => navigate("game")}
              onFiles={() => navigate("investigators")}
              onGuide={() => navigate("guide")}
              onExpanded={() => navigate("expanded")}
              onSaves={() => setSettings(true)}
              savedCount={saves.length}
              onScenario={(n) =>
                n === 0 ? (game ? navigate("game") : onStart()) : setScenario(n)
              }
            />
          )}{" "}
          {page === "archive" && (
            <PageBoundary
              title="The card archive"
              onHome={() => navigate("home")}
            >
              <Suspense fallback={<PageLoading />}>
                <Archive
                  key={archiveProduct || "all"}
                  initialProductCode={archiveProduct}
                  game={game}
                  inspect={(code, spoilers = false) => {
                    setInspectCatalog(spoilers);
                    setInspect(code);
                  }}
                />
              </Suspense>
            </PageBoundary>
          )}{" "}
          {page === "investigators" && (
            <InvestigatorLibrary
              inspect={setInspect}
              onExpandedPlay={
                localRulesEnabled
                  ? (code) => {
                      setExpandedInvestigator(code);
                      navigate("expanded");
                    }
                  : undefined
              }
              onStart={(code) => {
                if (code) setSelectedInvestigators([code]);
                onStart();
              }}
            />
          )}{" "}
          {page === "expanded" && (
            <PageBoundary
              title="Expansions & campaigns"
              onHome={() => navigate("home")}
            >
              <Suspense fallback={<PageLoading />}>
                {ExpandedPlay ? (
                  <ExpandedPlay
                    investigatorCode={expandedInvestigator}
                    inspect={setInspect}
                    onTableOpen={setCompanionTableOpen}
                  />
                ) : (
                  <CampaignLibrary
                    hasGame={!!game}
                    onPlay={() => (game ? navigate("game") : onStart())}
                    onCards={(code) => {
                      setArchiveProduct(code);
                      navigate("archive");
                    }}
                  />
                )}
              </Suspense>
            </PageBoundary>
          )}
          {page === "guide" && (
            <Guide onExpanded={() => navigate("expanded")} />
          )}{" "}
          {page === "game" && game && (
            <Game
              key={`${game.id}:${restorationSerial}`}
              game={game}
              dispatch={dispatch}
              inspect={(code, assetId) => {
                setInspect(code);
                setInspectAssetId(assetId || null);
              }}
              onHome={() => navigate("home")}
              onExport={() => exportSave(game)}
              onHistory={() => setHistoryOpen(true)}
              canUndo={undoDepth > 0}
              onUndo={undo}
              saved={saveStatus === "saved"}
              saving={saveStatus === "saving"}
            />
          )}
        </main>
      </div>
      {page === "game" && game && (
        <EventController
          game={game}
          dispatch={dispatch}
          inspect={setInspect}
          obscured={!!inspect || settings || setup || historyOpen}
          tempo={tempo}
          onTempo={setTempo}
          canUndo={undoDepth > 0}
          onUndo={undo}
        />
      )}
      {page === "game" && game && tutorial && game.status === "playing" && (
        <Tutorial
          game={game}
          hidden={
            !!game.event ||
            !!game.test ||
            !!game.decision ||
            !!game.window ||
            settings ||
            setup ||
            !!inspect ||
            historyOpen
          }
          onFinish={() => setTutorial(false)}
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
              <p className="party-setup-help">
                Play the complete first scenario here with ready-made starter
                decks. Later chapters are not yet playable in this browser
                campaign. Your progress stays on this device; export a save to
                keep a backup or move to another device.
              </p>
              <div className="party-setup-heading">
                <span className="eyebrow">Assemble your investigators</span>
                <span>{selectedInvestigators.length} / 3 selected</span>
              </div>
              <p className="party-setup-help">
                Control every investigator yourself. Choose one for true solo,
                or two or three for a shared hot-seat investigation.
              </p>
              <InvestigatorLibrary
                compact
                selectedInvestigators={selectedInvestigators}
                maxSelected={3}
                inspect={setInspect}
                onToggleInvestigator={(code) =>
                  setSelectedInvestigators((current) =>
                    current.includes(code)
                      ? current.length > 1
                        ? current.filter((c) => c !== code)
                        : current
                      : current.length < 3
                        ? [...current, code]
                        : current,
                  )
                }
              />
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
              <div className="difficulty-label" id="difficulty-label">
                Choose your difficulty
              </div>
              <div
                className="difficulty-options"
                role="group"
                aria-labelledby="difficulty-label"
              >
                {(["easy", "standard", "hard", "expert"] as Difficulty[]).map(
                  (d) => (
                    <button
                      key={d}
                      className={d === difficulty ? "selected" : ""}
                      aria-pressed={d === difficulty}
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
              <div className="difficulty-label" id="tempo-label">
                Choose your tempo
              </div>
              <div
                className="difficulty-options tempo-options"
                role="group"
                aria-labelledby="tempo-label"
              >
                {(["detailed", "smart", "fast"] as Tempo[]).map((t) => (
                  <button
                    key={t}
                    className={t === tempo ? "selected" : ""}
                    aria-pressed={t === tempo}
                    onClick={() => setTempo(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="difficulty-description">
                {
                  {
                    detailed:
                      "Pause on every event. Best while learning the rules.",
                    smart:
                      "Pause on important events only: attacks, encounters, injuries and story. Recommended.",
                    fast: "Pause on story and attacks only. For experienced investigators.",
                  }[tempo]
                }
              </p>
              <ChaosBagPreview
                difficulty={difficulty}
                investigators={selectedInvestigators}
              />
              {game && (
                <p className="replace-note">
                  {saveFailed
                    ? "Save your latest changes before starting another investigation. You can also export a backup."
                    : "Your current investigation stays in its own slot and can be reopened from Settings & saves."}{" "}
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
              This browser campaign currently includes Spreading Flames.
              Completing it does not unlock this chapter.
            </p>
            <p>
              This chapter is not playable yet. Export your campaign record to
              keep your choices and experience. A transfer to later chapters is
              not available yet.
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
        <Modal
          title="Settings and saves"
          onClose={() => {
            setSettings(false);
            setConfirmDelete(null);
          }}
        >
          <div className="modal-intro">
            <div className="eyebrow">Your investigator’s desk</div>
            <h2>Settings & saves</h2>
            <p>
              Each investigation is saved in this browser in its own slot.
              Export a copy to back it up or continue on another device.
            </p>
          </div>
          <div className="settings-actions">
            {saveFailed && game && (
              <section className="save-health" role="alert">
                <strong>
                  {saveStatus === "conflict"
                    ? "Another version of this investigation was saved."
                    : "Your investigation or case history could not be fully saved."}
                </strong>
                <p>
                  {saveStatus === "conflict"
                    ? "Your version is still open in this tab. Save it separately, export it, or review the version now stored on this device."
                    : "Export this investigation to keep a copy, or retry after freeing browser storage. Switching investigations is paused until your progress is saved."}
                </p>
                <div className="save-health-actions">
                  <Button secondary onClick={() => exportSave(game)}>
                    Export current investigation
                  </Button>
                  <Button
                    onClick={() =>
                      transition(async () => {
                        if (await persist()) {
                          setNotice("Investigation saved successfully.");
                        }
                      })
                    }
                  >
                    Retry saving
                  </Button>
                  {saveStatus === "conflict" && (
                    <>
                      <Button secondary onClick={saveSeparateCopy}>
                        Save as separate investigation
                      </Button>
                      <Button
                        secondary
                        onClick={() => {
                          setReloadCandidate(loadSaveSnapshot(game.id));
                          setConfirmReload(true);
                        }}
                      >
                        Review saved version
                      </Button>
                    </>
                  )}
                </div>
              </section>
            )}
            {updateAvailable && (
              <section className="app-update" aria-label="App update">
                <strong>A new edition is ready.</strong>
                <p>
                  Save your current pause and reload to use the latest
                  improvements.
                </p>
                <Button
                  secondary
                  onClick={async () => {
                    try {
                      await applyUpdate(async () => {
                        // A waiting worker may activate long after this click.
                        // Save the latest turn again at the actual reload boundary.
                        if (transitionPending.current) return false;
                        transitionPending.current = true;
                        const saved = await persist();
                        if (!saved) transitionPending.current = false;
                        return saved;
                      });
                    } catch {
                      transitionPending.current = false;
                      setNotice(
                        "Your browser could not save this investigation. Export a copy before reloading for the update.",
                      );
                    }
                  }}
                >
                  Save & update
                </Button>
              </section>
            )}
            <label className="motion-setting">
              <span>Game tempo</span>
              <select
                aria-label="Game tempo"
                value={tempo}
                onChange={(e) => setTempo(e.target.value as Tempo)}
              >
                <option value="detailed">
                  Detailed · pause on every event
                </option>
                <option value="smart">Smart · pause on important events</option>
                <option value="fast">
                  Fast · pause on story and attacks only
                </option>
              </select>
              <small>
                Every event is still recorded in the history. Smart skips
                routine bookkeeping such as resources gained and cards drawn.
              </small>
            </label>
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
            <div className="sound-toggles">
              <button
                type="button"
                className="button secondary"
                aria-label="Mute all audio"
                aria-pressed={audioMuted}
                onClick={() => {
                  audio.setMuted(!audioMuted);
                  setAudioMuted(!audioMuted);
                }}
              >
                {audioMuted ? (
                  <SpeakerSlash size={18} />
                ) : (
                  <SpeakerHigh size={18} />
                )}{" "}
                Audio: {audioMuted ? "muted" : "on"}
              </button>
              <Button secondary onClick={toggleSound}>
                {ambience ? (
                  <SpeakerHigh size={18} />
                ) : (
                  <SpeakerSlash size={18} />
                )}{" "}
                Ambience: {ambience ? "on" : "off"}
              </Button>
              <Button secondary onClick={toggleEffects}>
                {effects ? (
                  <SpeakerHigh size={18} />
                ) : (
                  <SpeakerSlash size={18} />
                )}{" "}
                Sound effects: {effects ? "on" : "off"}
              </Button>
              <Button
                secondary
                onClick={() => {
                  resetTutorial();
                  setTutorial(true);
                  setSettings(false);
                  if (game) navigate("game");
                }}
              >
                <GraduationCap size={18} /> Show the tutorial again
              </Button>
            </div>
            <label className="motion-setting">
              <span>Sound volume · {Math.round(audioVolume * 100)}%</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                aria-label="Sound volume"
                aria-valuetext={`${Math.round(audioVolume * 100)} percent`}
                value={Math.round(audioVolume * 100)}
                onChange={(event) => {
                  const volume = Number(event.target.value) / 100;
                  audio.setVolume(volume);
                  setAudioVolume(volume);
                }}
              />
              <small>
                Sound effects include brief voice cues for resolved acts,
                agendas and scenario endings. Audio never advances the game.
              </small>
            </label>
            <section className="save-slots" aria-label="Saved investigations">
              <div className="save-slots-heading">
                <span className="eyebrow">Saved investigations</span>
                <small>
                  {saves.length} / {MAX_SLOTS}
                </small>
              </div>
              {saves.length === 0 && (
                <p className="quiet-note">No saved investigation yet.</p>
              )}
              <ul>
                {saves.map((v) => (
                  <li key={v.id} className={v.id === game?.id ? "active" : ""}>
                    <div className="save-slot-copy">
                      <strong>
                        {v.party.map((c) => card(c).name).join(" · ")}
                      </strong>
                      <small>
                        {v.status === "resolution"
                          ? `Case closed · ${resultLabel(v.result)}`
                          : v.status === "mulligan"
                            ? "Opening hands"
                            : `Round ${v.round} · Act ${v.act}`}{" "}
                        · {v.difficulty} ·{" "}
                        {Date.parse(v.updatedAt) === 0
                          ? "Recovered save · date unknown"
                          : new Date(v.updatedAt).toLocaleDateString()}
                      </small>
                    </div>
                    <div className="save-slot-actions">
                      {v.id === game?.id ? (
                        <span className="save-current">Open now</span>
                      ) : (
                        <button onClick={() => openSave(v.id)}>
                          <Play size={14} /> Open
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const loaded =
                            v.id === game?.id ? game : loadSave(v.id);
                          if (loaded) exportSave(loaded);
                        }}
                      >
                        <FolderOpen size={14} /> Export
                      </button>
                      {confirmDelete === v.id ? (
                        <>
                          <button
                            className="danger"
                            onClick={() => removeSave(v.id)}
                          >
                            <Trash size={14} /> Confirm delete
                          </button>
                          <button onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button onClick={() => prepareDelete(v.id)}>
                          <Trash size={14} /> Delete
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <div className="save-io">
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
            </div>
          </div>
          <input
            type="file"
            accept="application/json,.json"
            ref={input}
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fileInput = e.target;
              await transition(async () => {
                try {
                  if (!(await preserveBeforeSwitch())) return;
                  if (file.size > 2000000) throw new Error("too large");
                  const value: unknown = JSON.parse(await file.text());
                  const decoded = decodeSave(value);
                  if (!decoded) throw new Error("invalid");
                  // A backup is a separate investigation, never an overwrite of
                  // later progress from this browser or another open tab.
                  const imported = { ...decoded, id: crypto.randomUUID() };
                  await createSaveSession({
                    game: imported,
                    revision: null,
                  }).save(imported);
                  const snapshot = loadSaveSnapshot(imported.id);
                  if (!snapshot) throw new Error("unreadable import");
                  openSnapshot(snapshot);
                  setNotice("Saved investigation imported as a separate copy.");
                } catch (error) {
                  setNotice(
                    error instanceof Error && error.message === "slots"
                      ? `All ${MAX_SLOTS} save slots are full. Delete a saved investigation before importing a new one.`
                      : (error instanceof Error &&
                            ["invalid", "too large"].includes(error.message)) ||
                          error instanceof SyntaxError
                        ? "This is not a valid Arkham Chronicle save. Your current game is unchanged."
                        : "Your browser could not save the imported investigation. Your current game is unchanged; keep the import file and free storage before retrying.",
                  );
                }
              });
              fileInput.value = "";
            }}
          />
          <p className="quiet-note">
            Press F for fullscreen, Enter to continue an event, Ctrl+Z or ⌘Z to
            undo. Sound starts only when you enable it.
          </p>
          <div className="build-info">
            <span>BUILD 0.2.0</span>
            <p>
              Spreading Flames · Joe, Daniela, Trish, Dexter and Isabelle
              <br />
              Collection snapshot ·{" "}
              {new Date(`${catalog.asOf}T00:00:00Z`).toLocaleDateString(
                "en-GB",
                {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                },
              )}
            </p>
          </div>
        </Modal>
      )}
      {confirmReload && game && (
        <Modal
          title="Choose the version to continue"
          onClose={() => setConfirmReload(false)}
        >
          <div className="modal-intro">
            <h2>Keep your progress safe</h2>
            <p>
              Your open version: round {game.round}, act {game.act},{" "}
              {game.player.actionsTaken} actions taken by{" "}
              {card(game.player.code).name}.
            </p>
            <p>
              {reloadCandidate
                ? `Saved version: round ${reloadCandidate.game.round}, act ${reloadCandidate.game.act}, ${reloadCandidate.game.player.actionsTaken} actions taken by ${card(reloadCandidate.game.player.code).name}.`
                : "There is no readable saved version now. Your version remains open in this tab."}
            </p>
            <p>
              Using the saved version discards this tab’s unsaved changes.
              Export them first if you want to keep both.
            </p>
          </div>
          <div className="save-health-actions">
            <Button secondary onClick={() => exportSave(game)}>
              Export this tab’s version
            </Button>
            <Button secondary onClick={() => setConfirmReload(false)}>
              Keep this tab’s version
            </Button>
            {reloadCandidate && (
              <Button
                onClick={() =>
                  transition(async () => {
                    const latest = loadSaveSnapshot(game.id);
                    if (
                      !latest ||
                      latest.revision !== reloadCandidate.revision
                    ) {
                      setReloadCandidate(latest);
                      setNotice(
                        "The saved version changed again. Review its latest progress before continuing.",
                      );
                      return;
                    }
                    setConfirmReload(false);
                    openSnapshot(latest);
                    setNotice("The saved version is now open.");
                  })
                }
              >
                Use saved version
              </Button>
            )}
          </div>
        </Modal>
      )}
      {inspect && (
        <CardDetail
          code={inspect}
          reference={page === "archive"}
          allowSpoilers={page === "archive" && inspectCatalog}
          game={game}
          onClose={() => {
            setInspect(null);
            setInspectAssetId(null);
          }}
          actions={
            game &&
            page === "game" &&
            inspectAssetId &&
            game.player.assets.some(
              (a) => a.id === inspectAssetId && a.code === inspect,
            ) ? (
              <InvestigationAbility
                game={game}
                assetId={inspectAssetId}
                onDismiss={() => {
                  setInspect(null);
                  setInspectAssetId(null);
                }}
                onActivate={(action) => {
                  setInspect(null);
                  setInspectAssetId(null);
                  dispatch(action);
                }}
              />
            ) : undefined
          }
        />
      )}{" "}
      {notice && (
        <div role="status" className="toast">
          <Info size={18} aria-hidden="true" />
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
