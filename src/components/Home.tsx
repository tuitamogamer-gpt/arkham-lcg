import {
  ArrowUpRight,
  Clock,
  CheckCircle,
  LockKey,
  MapTrifold,
  BookOpenText,
  FloppyDisk,
  ArrowRight,
  Sparkle,
} from "@phosphor-icons/react";
import type { GameState } from "../game/types";
import { Button, SkillStats } from "./Common";
export function Home({
  game,
  onStart,
  onResume,
  onFiles,
  onGuide,
  onScenario,
}: {
  game: GameState | null;
  onStart: () => void;
  onResume: () => void;
  onFiles: () => void;
  onGuide: () => void;
  onScenario: (n: number) => void;
}) {
  return (
    <div className="page-content home-page">
      <div className="welcome-row">
        <div>
          <div className="eyebrow">Arkham, Massachusetts · 1926</div>
          <h1>Some doors are better left closed.</h1>
        </div>
        <div className="chapter-stamp">
          CHAPTER<span>II</span>
        </div>
      </div>
      <section className="campaign-hero">
        <div className="hero-image" />
        <div className="hero-grain" />
        <div className="hero-content">
          <div className="hero-tag">
            <span /> THE 2026 CORE SET
          </div>
          <h2>
            Brethren
            <br />
            of <em>Ash.</em>
          </h2>
          <p>
            A missing friend. A city veiled in smoke.
            <br />
            Follow the clues into the heart of a growing darkness.
          </p>
          <div className="hero-actions">
            <Button onClick={game ? onResume : onStart} arrow>
              {game?.status === "resolution"
                ? "Open campaign record"
                : game
                  ? "Continue investigation"
                  : "Begin your investigation"}
            </Button>
            <button className="text-button light" onClick={onGuide}>
              How to play <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="hero-meta">
            <span>
              <MapTrifold size={15} /> 3 chapters · 1 playable
            </span>
            <i />
            <span>
              <Clock size={15} /> Solo investigation
            </span>
          </div>
        </div>
        <div className="hero-caption">
          <span>CASE FILE NO. 001</span>
          <strong>Miskatonic University</strong>
          <small>Something is stirring on campus.</small>
        </div>
        <div className="hero-corner">✧</div>
      </section>
      <div className="home-bottom">
        <section className="chapters-section">
          <div className="section-title">
            <h2>The investigation</h2>
            <span>
              BRETHREN OF ASH <ArrowRight size={14} />
            </span>
          </div>
          <div className="scenario-list">
            {[
              {
                name: "Spreading Flames",
                place: "Miskatonic University",
                available: true,
              },
              {
                name: "Smoke and Mirrors",
                place: "The streets of Arkham",
                available: false,
              },
              {
                name: "Queen of Ash",
                place: "Beneath the city",
                available: false,
              },
            ].map((c, i) => (
              <button
                className={`scenario-tile scenario-${i + 1}`}
                key={c.name}
                onClick={() => onScenario(i)}
              >
                <div className="scenario-art">
                  <span className="scenario-number">0{i + 1}</span>
                  <span
                    className={`scenario-status ${c.available ? "ready" : ""}`}
                  >
                    {c.available ? (
                      <CheckCircle size={12} />
                    ) : (
                      <LockKey size={11} />
                    )}{" "}
                    {c.available ? "PLAYABLE" : "COMING LATER"}
                  </span>
                </div>
                <div className="scenario-caption">
                  <span>SCENARIO 0{i + 1}</span>
                  <h3>{c.name}</h3>
                  <p>{c.place}</p>
                  <ArrowUpRight size={17} />
                </div>
              </button>
            ))}
          </div>
          <div className="field-guide-callout">
            <div className="guide-icon">
              <BookOpenText size={24} weight="light" />
            </div>
            <div>
              <h3>Your first night in Arkham?</h3>
              <p>
                Learn the essentials. We’ll take care of the rules as you play.
              </p>
            </div>
            <button onClick={onGuide}>
              Open field guide <ArrowRight size={16} />
            </button>
          </div>
        </section>
        <aside className="home-investigator">
          <div className="section-title">
            <h2>Your investigator</h2>
            <button
              className="icon-button"
              aria-label="View investigators"
              onClick={onFiles}
            >
              <ArrowUpRight size={17} />
            </button>
          </div>
          <button className="investigator-summary" onClick={onFiles}>
            <div className="portrait-small" />
            <div>
              <span className="class-label">SEEKER</span>
              <h3>Joe Diamond</h3>
              <p>The Private Investigator</p>
            </div>
          </button>
          <SkillStats />
          <div className="prepared-row">
            <CheckCircle size={15} />
            <div>
              <strong>Ready for the unknown</strong>
              <span>Official 33-card starter deck</span>
            </div>
          </div>
          <div className="save-note">
            <FloppyDisk size={15} />
            <span>
              {game
                ? `Saved · Round ${game.round} · ${game.status === "resolution" ? "Resolved" : game.phase}`
                : "Your progress saves automatically."}
            </span>
          </div>
          {game && (
            <button className="text-button" onClick={onStart}>
              Start a new investigation <ArrowRight size={14} />
            </button>
          )}
        </aside>
      </div>
      <footer className="page-footer">
        <span>
          <Sparkle size={13} /> An independent fan-made experience
        </span>
        <span>Arkham Horror: The Card Game · Core Set 2026</span>
        <span>
          LOCAL PLAY <i />
        </span>
      </footer>
    </div>
  );
}
