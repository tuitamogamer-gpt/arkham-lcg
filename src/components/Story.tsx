import { useEffect, useRef } from "react";
import { BookOpen, ArrowRight, Check } from "@phosphor-icons/react";
import {
  INTRODUCTION,
  PURSUER_RESOLUTION,
  scenarioResolution,
} from "../game/story";
import type { GameState } from "../game/types";
import { Button } from "./Common";
import { Embers } from "./Motion";

export function Introduction({
  page,
  onContinue,
  replay = false,
}: {
  page: "campaign" | "scenario";
  onContinue: () => void;
  replay?: boolean;
}) {
  const passage = INTRODUCTION[page === "campaign" ? 0 : 1];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [page]);
  return (
    <section
      className={`campaign-story intro-${page}`}
      aria-label="Campaign introduction"
    >
      <div className="story-atmosphere">
        <Embers />
      </div>
      <article className="story-paper" key={page}>
        <div className="story-folio">
          <BookOpen size={21} />
          <span>{page === "campaign" ? "I" : "II"}</span>
        </div>
        <div className="eyebrow">{passage.chapter}</div>
        <h1 ref={heading} tabIndex={-1}>
          {passage.title}
        </h1>
        <div className="narrative-passage">
          <p>{passage.text}</p>
        </div>
        {page === "scenario" && (
          <p className="story-start-note">
            Your investigation begins in Your Friend’s Room. Prepare your
            opening hand, then search for clues.
          </p>
        )}
        <footer>
          <span>
            {replay ? "The story so far" : "Read at your own pace"} ·{" "}
            {page === "campaign" ? "1" : "2"} / 2
          </span>
          <Button
            onClick={(event) => {
              if (event.detail < 2) onContinue();
            }}
            className="story-continue"
          >
            {page === "campaign"
              ? "Continue to scenario intro"
              : replay
                ? "Return to investigation"
                : "Prepare opening hands"}
            <ArrowRight size={17} />
          </Button>
        </footer>
      </article>
    </section>
  );
}

export function PursuerStory() {
  return (
    <section className="resolution-passage" aria-label="Resolution 1">
      <div className="eyebrow">{PURSUER_RESOLUTION.chapter}</div>
      <h3>{PURSUER_RESOLUTION.title}</h3>
      <p>{PURSUER_RESOLUTION.text}</p>
    </section>
  );
}

export function ResolutionPassage({ game }: { game: GameState }) {
  const result = scenarioResolution(game);
  if (!result) return null;
  return (
    <section className="resolution-passage" aria-label={result.chapter}>
      <div className="eyebrow">
        {result.pursued ? `Resolution 1 → ${result.number}` : result.chapter}
      </div>
      <h1>{result.title}</h1>
      <p className="narrative-passage">{result.text}</p>
      <p className="resolution-reason">
        <Check size={17} />
        {result.reason}
      </p>
      <div className="resolution-consequences">
        <span>
          Victory experience + {result.bonusXp} bonus XP per investigator,
          before personal penalties.
        </span>
        <span>
          Each investigator suffers 1 {result.trauma} trauma from this outcome.
          Prior trauma is retained.
        </span>
      </div>
    </section>
  );
}
