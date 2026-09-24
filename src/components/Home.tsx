import {
  ArrowUpRight,
  ArrowRight,
  BookOpenText,
  LockKey,
  StarFour,
  UsersThree,
  FloppyDisk,
} from "@phosphor-icons/react";
import type { GameState } from "../game/types";
import { card, CARD_ART, PLAYABLE_INVESTIGATORS } from "../game/data";
import { party } from "../game/engine";
import { Button, HoverPreview } from "./Common";
import { Embers } from "./Motion";
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
    <div className="night-home">
      <section className="night-hero">
        <div className="night-hero-art" />
        <div className="night-vignette" />
        <Embers />
        <div className="night-hero-copy">
          <div className="occult-rule">
            <StarFour size={14} />
            <span>ARKHAM, MASSACHUSETTS · 1926</span>
            <StarFour size={14} />
          </div>
          <h1>
            ARKHAM<span>HORROR</span>
          </h1>
          <div className="chronicle-wordmark">The Chronicle</div>
          <p>
            There are things in this city that should stay buried. <br />
            Tonight, you’re going to dig them up.
          </p>
          <div className="night-hero-actions">
            <Button onClick={game ? onResume : onStart} arrow>
              {game?.status === "resolution"
                ? "Open campaign record"
                : game
                  ? "Continue investigation"
                  : "Begin your investigation"}
            </Button>
            <button className="night-text-link" onClick={onGuide}>
              Learn to survive <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="night-meta">
            <span>
              <UsersThree size={17} />
              1–3 investigators. One mind behind them.
            </span>
            <span>THE 2026 CORE SET</span>
          </div>
        </div>
        <HoverPreview
          title="Brethren of Ash"
          text={
            game
              ? `Spreading Flames · Round ${game.round}\nAct ${game.act} · Agenda ${game.agenda}\n\n${game.campaign.notes.join("\n") || "Your campaign discoveries will be recorded here."}`
              : "Your friend has vanished from Miskatonic University. Start Spreading Flames to follow the first clues.\n\n1–3 investigators · Three actions each turn.\nCampaign discoveries are saved as the story unfolds."
          }
        >
          <aside className="campaign-case" tabIndex={0}>
            <div className="case-topline">
              <span>MISKATONIC UNIVERSITY</span>
              <span>CONFIDENTIAL</span>
            </div>
            <div className="case-number">
              CASE
              <br />
              <b>001</b>
            </div>
            <span className="case-eyebrow">THE CURRENT CAMPAIGN</span>
            <h2>
              Brethren <br />
              of <em>Ash</em>
            </h2>
            <p>
              A missing friend. A room in disarray.
              <br />
              And the unmistakable scent of smoke.
            </p>
            <div className="case-divider">
              <StarFour size={16} />
            </div>
            <div className="case-status">
              <span>CHAPTER I</span>
              <strong>Spreading Flames</strong>
              <span className="case-ready">
                {game
                  ? `SAVED · ROUND ${String(game.round).padStart(2, "0")}`
                  : "READY TO INVESTIGATE"}
              </span>
            </div>
            <button className="case-open" onClick={game ? onResume : onStart}>
              Open the case file <ArrowRight size={18} />
            </button>
          </aside>
        </HoverPreview>
        <div className="night-hero-footer">
          <span>THE UNKNOWN AWAITS</span>
          <span>✦</span>
          <span>A COOPERATIVE INVESTIGATION, PLAYED SOLO</span>
        </div>
      </section>
      <section className="night-desk">
        <div className="night-section-title">
          <div>
            <span className="eyebrow">FOLLOW THE THREAD</span>
            <h2>A trail of smoke & secrets.</h2>
          </div>
          <span>BRETHREN OF ASH / THREE CHAPTERS</span>
        </div>
        <div className="night-chapters">
          {[
            {
              name: "Spreading Flames",
              place: "Miskatonic University",
              copy: "The first spark of something terrible.",
              ready: true,
            },
            {
              name: "Sealed chapter II",
              place: "Undiscovered",
              copy: "The next case stays sealed.",
              ready: false,
            },
            {
              name: "Sealed chapter III",
              place: "Undiscovered",
              copy: "Continue the story to uncover more.",
              ready: false,
            },
          ].map((c, i) => (
            <button
              key={c.name}
              className={`night-chapter chapter-${i + 1} ${c.ready ? "ready" : "locked"}`}
              onClick={() => onScenario(i)}
            >
              <div className="night-chapter-art" />
              <span className="chapter-index">0{i + 1}</span>
              <div>
                <span>{c.place}</span>
                <h3>{c.name}</h3>
                <p>{c.copy}</p>
              </div>
              <span className="chapter-state">
                {c.ready ? (
                  <>
                    <span className="ember-dot" /> PLAYABLE{" "}
                    <ArrowUpRight size={17} />
                  </>
                ) : (
                  <>
                    <LockKey size={13} />
                    SEALED · COMING LATER
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="night-investigators">
          <div className="night-party-intro">
            <span className="eyebrow">YOU DON’T HAVE TO GO ALONE</span>
            <h2>
              Three lives. <br />
              One investigation.
            </h2>
            <p>
              Lead a lone investigator or control a party of two or three.
              Switch seats, combine strengths, and face the darkness together.
            </p>
            <Button secondary onClick={onStart} arrow>
              {game ? "Start a new investigation" : "Assemble your party"}
            </Button>
            <button className="night-text-link" onClick={onFiles}>
              Read investigator dossiers <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="night-dossiers">
            {PLAYABLE_INVESTIGATORS.map((c, i) => (
              <button
                className={`night-dossier ${card(c).faction_code}`}
                key={c}
                onClick={onStart}
              >
                <div
                  className="dossier-photo"
                  style={{ backgroundImage: `url(${CARD_ART[c]})` }}
                />
                <span className="dossier-tab">{card(c).faction_code}</span>
                <div className="dossier-note">
                  <span>INVESTIGATOR 0{i + 1}</span>
                  <h3>{card(c).name}</h3>
                  <p>{card(c).subname}</p>
                  <ArrowUpRight size={17} />
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="night-help">
          <BookOpenText size={24} />
          <div>
            <strong>Your first night in Arkham?</strong>
            <span>
              Read the field guide. The table takes care of the rules.
            </span>
          </div>
          <button onClick={onGuide}>
            Open field guide <ArrowRight size={17} />
          </button>
        </div>
        {game && (
          <div className="night-saved">
            <FloppyDisk size={14} />
            Saved locally ·{" "}
            {party(game)
              .map((p) => card(p.code).name)
              .join(" / ")}{" "}
            · Round {game.round}
          </div>
        )}
        <footer className="night-footer">
          <span>ARKHAM CHRONICLE</span>
          <span>An independent fan-made experience · Core Set 2026</span>
          <StarFour size={16} />
        </footer>
      </section>
    </div>
  );
}
