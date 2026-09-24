import { useEffect, useState } from "react";
import {
  ArrowRight,
  ClockCounterClockwise,
  Eye,
  PauseCircle,
  CheckCircle,
} from "@phosphor-icons/react";
import { card, plain } from "../game/data";
import type { Action, GameState, VisibleEvent } from "../game/types";
import { CardFace, Modal, RulesText } from "./Common";
import { TableCard } from "./Tabletop";

const phaseName = (p: string) =>
  p === "roundEnd" ? "End of round" : p[0].toUpperCase() + p.slice(1);
function Changes({ event }: { event: VisibleEvent }) {
  return (
    event.changes.length > 0 && (
      <div className="event-changes" aria-label="What changed">
        <span className="eyebrow">WHAT CHANGED</span>
        {event.changes.map((c, i) => (
          <div className="event-change" key={i}>
            <span>{c.label}</span>
            <span>
              <del>{c.before}</del>
              <ArrowRight size={12} />
              <strong>{c.after}</strong>
            </span>
          </div>
        ))}
      </div>
    )
  );
}
export function EventController({
  game: s,
  dispatch,
  inspect,
  obscured = false,
}: {
  game: GameState;
  dispatch: (a: Action) => void;
  inspect: (c: string) => void;
  obscured?: boolean;
}) {
  const [minimized, setMinimized] = useState(false);
  useEffect(() => setMinimized(false), [s.event?.id]);
  const e = s.event;
  if (!e || obscured) return null;
  const source = e.card ? card(e.card) : undefined;
  const previousStory = e.story ? card(e.story.previous) : undefined;
  const nextStory = e.story?.current ? card(e.story.current) : undefined;
  const advance = (
    <button
      className="button event-continue"
      aria-label="Continue game"
      onClick={(ev) => {
        if (ev.detail > 1) return;
        dispatch({ type: "continue", eventId: e.id });
      }}
    >
      {e.continueLabel}
      <ArrowRight size={18} />
    </button>
  );
  if (minimized)
    return (
      <section className="pause-dock" aria-label="Game paused">
        <PauseCircle size={28} />
        <div>
          <span>
            PAUSED ·{" "}
            {e.actor === "scenario" ? "All investigators" : card(e.actor).name}
          </span>
          <strong>{e.title}</strong>
        </div>
        <button
          className="event-table-button"
          onClick={() => setMinimized(false)}
        >
          <Eye size={17} />
          Read event
        </button>
        {advance}
      </section>
    );
  return (
    <Modal
      key={e.id}
      title="Game paused"
      wide
      onClose={() => setMinimized(true)}
    >
      <div
        className={`event-window ${e.tone} ${e.story ? "story-reveal" : ""}`}
      >
        <header className="event-header">
          <div className="event-meta">
            <span>
              <PauseCircle size={15} />{" "}
              {e.story
                ? "A NEW CHAPTER"
                : e.encounter
                  ? "ENCOUNTER"
                  : "GAME PAUSED"}
            </span>
            <span>ROUND {String(e.round).padStart(2, "0")}</span>
            <span>{phaseName(e.phase)}</span>
          </div>
          <h2>{e.story ? previousStory?.back_name || e.title : e.title}</h2>
          <p>
            {e.actor === "scenario" ? "All investigators" : card(e.actor).name}
          </p>
        </header>
        <div className={`event-body ${source ? "has-card" : ""}`}>
          {source && (
            <aside className="event-source">
              {previousStory && (
                <div className="story-reverse-art">
                  <TableCard code={previousStory.code} back />
                  <small>{previousStory.back_name || "The story so far"}</small>
                </div>
              )}
              <CardFace
                c={source}
                compact
                onClick={() => inspect(source.code)}
              />
              <button onClick={() => inspect(source.code)}>
                Inspect full card <Eye size={14} />
              </button>
            </aside>
          )}
          <div className="event-story">
            {e.encounter && (
              <div className="encounter-route" aria-label="Encounter progress">
                <ol>
                  {["revealed", "resolving", "resolved"].map((step, i) => (
                    <li
                      key={step}
                      className={e.encounter!.stage === step ? "current" : ""}
                    >
                      {i + 1}. {step === "resolved" ? "Destination" : step}
                    </li>
                  ))}
                </ol>
                <p>
                  <strong>
                    {e.encounter.stage === "revealed"
                      ? "Where it goes"
                      : "Card destination"}
                  </strong>
                  {e.encounter.destination}
                </p>
              </div>
            )}
            {previousStory && (
              <section className="story-passage" aria-label="Story transition">
                <span className="eyebrow">
                  {e.story?.kind} · turning the card
                </span>
                <blockquote>
                  {plain(previousStory.back_flavor || "")}
                </blockquote>
                <details className="event-rules">
                  <summary>Resolve the reverse side</summary>
                  <p>
                    <RulesText text={previousStory.back_text} />
                  </p>
                </details>
                {nextStory && (
                  <div className="next-chapter">
                    <span className="eyebrow">
                      {e.story?.kind === "act"
                        ? "Your next objective"
                        : "The next threat"}
                    </span>
                    <h3>{nextStory.name}</h3>
                    <blockquote>{plain(nextStory.flavor || "")}</blockquote>
                    <p className="rules-text">
                      <RulesText text={nextStory.text} />
                    </p>
                  </div>
                )}
              </section>
            )}
            <p className="event-description">{e.description}</p>
            {source?.text && !e.story && (
              <details
                className="event-rules"
                open={e.title === "Encounter revealed"}
              >
                <summary>Card text · {source.name}</summary>
                <p>
                  <RulesText text={source.text} />
                </p>
              </details>
            )}
            <Changes event={e} />
            {!e.changes.length && !e.encounter && !e.story && (
              <div className="event-awaiting">
                <PauseCircle size={17} />
                <p>
                  The table is waiting for you. Read this event before
                  continuing.
                </p>
              </div>
            )}
          </div>
        </div>
        <footer className="event-footer">
          <div>
            <span>Continue when you are ready.</span>
            <button
              className="event-table-button"
              onClick={() => setMinimized(true)}
            >
              <Eye size={16} />
              View table · keep paused
            </button>
          </div>
          {advance}
        </footer>
      </div>
    </Modal>
  );
}
export function EventJournal({
  game: s,
  onClose,
}: {
  game: GameState;
  onClose: () => void;
}) {
  return (
    <Modal title="Event history" wide onClose={onClose}>
      <div className="event-journal">
        <div className="eyebrow">
          <ClockCounterClockwise size={15} /> THE CHRONICLE
        </div>
        <h2>Every step of the investigation.</h2>
        <p>
          Recent events, card effects, and changes to the table. Opening this
          history never advances the game.
        </p>
        {!s.eventHistory.length && (
          <p>Your events will appear here as the investigation unfolds.</p>
        )}
        {[...s.eventHistory].reverse().map((e) => (
          <details
            className={`journal-entry ${e.tone}`}
            key={e.id}
            open={e.id === s.event?.id}
          >
            <summary>
              <span className="journal-number">
                {String(e.id).padStart(2, "0")}
              </span>
              <span>
                <strong>{e.title}</strong>
                <small>
                  Round {e.round} · {phaseName(e.phase)} ·{" "}
                  {e.actor === "scenario"
                    ? "All investigators"
                    : card(e.actor).name}
                </small>
              </span>
              {e.id === s.event?.id ? (
                <PauseCircle size={17} />
              ) : (
                <CheckCircle size={17} />
              )}
            </summary>
            <p>{e.description}</p>
            <Changes event={e} />
          </details>
        ))}
      </div>
    </Modal>
  );
}
