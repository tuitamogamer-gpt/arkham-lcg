import {
  ArrowUpRight,
  ArrowRight,
  BookOpenText,
  Books,
  LockKey,
  StarFour,
  UsersThree,
  FloppyDisk,
} from "@phosphor-icons/react";
import type { GameState } from "../game/types";
import { card, CARD_ART, PLAYABLE_INVESTIGATORS, thumbArt } from "../game/data";
import { party } from "../game/engine";
import { readRecord } from "../game/storage";
import { Button, HoverPreview } from "./Common";
import { Embers } from "./Motion";
import "../home-refinements.css";

const phaseLabels: Record<GameState["phase"], string> = {
  investigation: "Investigation phase",
  enemy: "Enemy phase",
  upkeep: "Upkeep phase",
  mythos: "Mythos phase",
  roundEnd: "End of round",
};

function resumeContext(game: GameState): string {
  if (game.status === "resolution")
    return "Review the outcome, campaign notes, and experience your party earned.";
  if (game.introduction && game.introduction !== "complete")
    return "Continue the introduction, then prepare your investigators.";
  if (game.status === "mulligan")
    return "Choose your opening hands before the investigation begins.";
  if (game.event) return "A table event is waiting for you to continue.";
  if (game.decision) return "A decision is waiting for your party.";
  if (game.test)
    return game.test.stage === "revealed"
      ? "The chaos token has been drawn. Your skill test is ready to resolve."
      : "A skill test is in progress. Commit your cards and draw a chaos token.";
  if (game.window)
    return "A player window is open. Play an ability or continue.";
  const current = party(game).find(
    (member) => member.code === game.turnInvestigator,
  );
  if (game.phase === "investigation" && current?.status === "active")
    return `Return to ${card(current.code).name}’s turn.`;
  return `${phaseLabels[game.phase]}. Return to the table to continue.`;
}

function CurrentInvestigation({
  game,
  onResume,
  onFiles,
  onGuide,
  onSaves,
  savedCount,
}: {
  game: GameState;
  onResume: () => void;
  onFiles: () => void;
  onGuide: () => void;
  onSaves?: () => void;
  savedCount: number;
}) {
  const closed = game.status === "resolution";
  const preparing = game.status === "mulligan";
  return (
    <section className="home-session" aria-labelledby="home-session-title">
      <div className="home-session-main">
        <div className="home-session-heading">
          <span className="eyebrow">
            {closed ? "YOUR LATEST CASE" : "PICK UP THE THREAD"}
          </span>
          <span className={`home-session-status ${closed ? "closed" : ""}`}>
            <span aria-hidden="true" />
            {closed
              ? "Case closed"
              : preparing
                ? "Preparing your party"
                : "In progress"}
          </span>
        </div>
        <h2 id="home-session-title">Spreading Flames</h2>
        <p className="home-session-context">{resumeContext(game)}</p>
        <dl className="home-session-progress">
          <div>
            <dt>Round</dt>
            <dd>{game.round}</dd>
          </div>
          <div>
            <dt>Difficulty</dt>
            <dd>{game.difficulty}</dd>
          </div>
          {closed ? (
            <div>
              <dt>Experience</dt>
              <dd>{game.campaign.xp} XP</dd>
            </div>
          ) : (
            <>
              <div>
                <dt>Act</dt>
                <dd>{game.act}</dd>
              </div>
              <div>
                <dt>Agenda</dt>
                <dd>{game.agenda}</dd>
              </div>
            </>
          )}
        </dl>
        <ul className="home-session-party" aria-label="Your investigator party">
          {party(game).map((member) => (
            <li key={member.code}>
              <img
                src={thumbArt(CARD_ART[member.code])}
                alt=""
                width={36}
                height={44}
                loading="lazy"
              />
              <span>
                <strong>{card(member.code).name}</strong>
                <small>
                  {member.status === "defeated"
                    ? "Defeated"
                    : member.status === "resigned"
                      ? "Resigned"
                      : closed
                        ? "Survived"
                        : member.code === game.leadInvestigator
                          ? "Lead investigator"
                          : "Investigator"}
                </small>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="home-session-actions">
        <Button onClick={onResume} arrow>
          {closed ? "Review the outcome" : "Return to the table"}
        </Button>
        <button className="night-text-link" onClick={onFiles}>
          Investigator dossiers <ArrowUpRight size={15} aria-hidden="true" />
        </button>
        <button className="night-text-link" onClick={onGuide}>
          Field guide <BookOpenText size={16} aria-hidden="true" />
        </button>
        {onSaves && savedCount > 0 && (
          <button className="night-text-link" onClick={onSaves}>
            Saved investigations ({savedCount}){" "}
            <FloppyDisk size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}

function Record() {
  const record = readRecord();
  if (!record.length) return null;
  const won = record.filter((r) => ["saved", "pursuer"].includes(r.result));
  const best = Math.max(...record.map((r) => r.xp));
  return (
    <section className="night-record" aria-label="Your record">
      <div className="night-section-title">
        <div>
          <span className="eyebrow">YOUR RECORD</span>
          <h2>What the chronicle remembers.</h2>
        </div>
        <span>
          {record.length} CASE{record.length === 1 ? "" : "S"} CLOSED
        </span>
      </div>
      <div className="record-stats">
        <span>
          <b>{won.length}</b> pursuer defeated
        </span>
        <span>
          <b>{won.filter((r) => r.result === "saved").length}</b> Miskatonic
          saved
        </span>
        <span>
          <b>{record.length - won.length}</b> lost
        </span>
        <span>
          <b>{best}</b> best experience
        </span>
      </div>
      <ul className="record-list">
        {[...record]
          .reverse()
          .slice(0, 5)
          .map((r) => (
            <li key={r.id}>
              <strong>{r.party.map((c) => card(c).name).join(" · ")}</strong>
              <span>
                {r.difficulty} · {r.rounds} rounds ·{" "}
                {r.result === "saved"
                  ? "Miskatonic saved"
                  : r.result === "pursuer"
                    ? "pursuer defeated"
                    : r.result === "overrun"
                      ? "campus overrun"
                      : r.result}{" "}
                · {r.xp} XP · {new Date(r.finishedAt).toLocaleDateString()}
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
}
export function Home({
  game,
  onStart,
  onResume,
  onFiles,
  onGuide,
  onScenario,
  onExpanded,
  onSaves,
  savedCount = 0,
}: {
  game: GameState | null;
  onStart: () => void;
  onResume: () => void;
  onFiles: () => void;
  onGuide: () => void;
  onScenario: (n: number) => void;
  onExpanded?: () => void;
  onSaves?: () => void;
  savedCount?: number;
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
                {game?.status === "resolution"
                  ? "CASE CLOSED · RECORD AVAILABLE"
                  : game?.status === "mulligan"
                    ? "PARTY ASSEMBLED · PREPARING"
                    : game
                      ? `IN PROGRESS · ROUND ${String(game.round).padStart(2, "0")}`
                      : "READY TO INVESTIGATE"}
              </span>
            </div>
            <button className="case-open" onClick={game ? onResume : onStart}>
              {game?.status === "resolution"
                ? "Review the case file"
                : "Open the case file"}{" "}
              <ArrowRight size={18} />
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
        {game && (
          <CurrentInvestigation
            game={game}
            onResume={onResume}
            onFiles={onFiles}
            onGuide={onGuide}
            onSaves={onSaves}
            savedCount={savedCount}
          />
        )}
        {!game && onSaves && savedCount > 0 && (
          <section className="home-saves" aria-labelledby="home-saves-title">
            <FloppyDisk size={26} aria-hidden="true" />
            <div>
              <span className="eyebrow">YOUR CASE FILES</span>
              <h2 id="home-saves-title">Pick up a saved investigation.</h2>
              <p>Your previous cases are ready to open on this device.</p>
            </div>
            <Button secondary onClick={onSaves} arrow>
              Saved investigations ({savedCount})
            </Button>
          </section>
        )}
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
              copy: "This chapter is not playable yet.",
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
        {onExpanded && (
          <section
            className="home-expansions"
            aria-labelledby="home-expansions-title"
          >
            <Books size={28} aria-hidden="true" />
            <div>
              <span className="eyebrow">BEYOND THE CORE SET</span>
              <h2 id="home-expansions-title">Expansions &amp; campaigns</h2>
              <p>
                Choose another campaign, bring an investigator deck, or return
                to a saved expansion game.
              </p>
            </div>
            <Button secondary onClick={onExpanded} arrow>
              Explore expansions
            </Button>
          </section>
        )}
        <div className="night-investigators">
          <div className="night-party-intro">
            <span className="eyebrow">YOU DON’T HAVE TO GO ALONE</span>
            <h2>
              Five investigators. <br />
              One investigation.
            </h2>
            <p>
              Lead a lone investigator or control a party of two or three from
              the five core-set investigators. Switch seats, combine strengths,
              and face the darkness together.
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
                data-preview-code={c}
                key={c}
                onClick={onStart}
              >
                <div
                  className="dossier-photo"
                  style={{ backgroundImage: `url(${thumbArt(CARD_ART[c])})` }}
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
        <Record />
        {game && (
          <div className="night-saved">
            <FloppyDisk size={14} />
            Current{" "}
            {game.status === "resolution"
              ? "case record"
              : "investigation"} ·{" "}
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
