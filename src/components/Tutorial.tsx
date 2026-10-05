import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, GraduationCap, X } from "@phosphor-icons/react";
import type { GameState } from "../game/types";

export const TUTORIAL_KEY = "arkham-chronicle:tutorial";
export function tutorialPending() {
  // Automated browsers drive the table directly; the coach marks would only
  // cover the controls they click.
  if (typeof navigator !== "undefined" && navigator.webdriver) return false;
  try {
    return localStorage.getItem(TUTORIAL_KEY) !== "done";
  } catch {
    return true;
  }
}
export function resetTutorial() {
  try {
    localStorage.removeItem(TUTORIAL_KEY);
  } catch {
    /* Optional preference. */
  }
}
type Step = {
  title: string;
  text: string;
  anchor?: string;
  hint?: string;
  done?: (s: GameState) => boolean;
};
const STEPS: Step[] = [
  {
    title: "Your investigator",
    text: "This is your play area: the investigator card with the four skills, damage and horror taken, resources and clues. When damage reaches health or horror reaches sanity, the investigator is defeated.",
    anchor: ".investigator-mat",
  },
  {
    title: "The objective",
    text: "The act card tells you what to do next. The agenda card counts doom: when it fills, the story turns against you. Both cards sit at the left of the table.",
    anchor: ".objective-ribbon",
  },
  {
    title: "The map",
    text: "Locations connect along the dotted lines. Each revealed location shows its shroud (the difficulty to investigate) and the clues left on it. Click a connected location to move there; use the eye to read it.",
    anchor: ".location-board",
  },
  {
    title: "Take an action",
    text: "You have three actions each turn. Investigate tests your intellect against the shroud of your location. Try it now.",
    anchor: ".primary-action",
    hint: "Click Investigate to continue.",
    done: (s) => !!s.test || s.player.actionsTaken > 0,
  },
  {
    title: "How skill tests work",
    text: "A test lets you commit cards with matching icons, check the chance of success, and draw a chaos token. Your modified skill must equal or beat the difficulty. The result stays visible until you choose Resolve. Keep this sequence in mind for your next action.",
  },
  {
    title: "Your hand",
    text: "Assets stay in play and cost resources. Events resolve once. Skill cards are only committed to tests. The buttons under each card say what it can do right now.",
    anchor: ".hand-section",
  },
  {
    title: "Events and pauses",
    text: "The game pauses at events so you can read what happened and what changed. Continue when you are ready, or press Enter. Undo takes back the last action within your turn. Pause on fewer events with the tempo setting.",
    anchor: ".phase-track",
  },
  {
    title: "End your turn",
    text: "When your actions are spent, end your turn. Enemies move and attack, then upkeep readies cards, draws a card and adds a resource. Each new round starts with a doom and one encounter card per investigator.",
    anchor: ".end-turn",
    hint: "End your turn to finish the tutorial.",
    done: (s) => s.player.turnEnded || s.phase !== "investigation",
  },
];
export function Tutorial({
  game: s,
  hidden = false,
  onFinish,
}: {
  game: GameState;
  hidden?: boolean;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  // Back must be able to show a step the player already completed; the
  // automatic advance resumes with the player's next action.
  const wentBack = useRef(false);
  useEffect(() => {
    if (wentBack.current) {
      wentBack.current = false;
      return;
    }
    if (step.done?.(s) && !last) setIndex((i) => i + 1);
  }, [s, step, last]);
  useLayoutEffect(() => {
    const measure = () => {
      if (hidden) return;
      const el = step.anchor
        ? document.querySelector<HTMLElement>(step.anchor)
        : null;
      setBox(el ? el.getBoundingClientRect() : null);
    };
    const el = step.anchor
      ? document.querySelector<HTMLElement>(step.anchor)
      : null;
    if (!hidden && el && !document.querySelector('.modal[aria-modal="true"]'))
      el.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    measure();
    const timer = window.setTimeout(measure, 450);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [index, step, hidden]);
  const finish = () => {
    try {
      localStorage.setItem(TUTORIAL_KEY, "done");
    } catch {
      /* Optional preference. */
    }
    onFinish();
  };
  if (hidden) return null;
  return (
    <>
      {box && (
        <div
          className="tutorial-highlight"
          aria-hidden="true"
          style={{
            left: box.left - 6,
            top: box.top - 6,
            width: box.width + 12,
            height: box.height + 12,
          }}
        />
      )}
      <aside className="tutorial-card" aria-label="Tutorial">
        <header>
          <GraduationCap size={17} />
          <span>
            Tutorial · {index + 1} / {STEPS.length}
          </span>
          <button aria-label="Close tutorial" onClick={finish}>
            <X size={15} />
          </button>
        </header>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        {step.hint && !step.done?.(s) && (
          <p className="tutorial-hint">{step.hint}</p>
        )}
        <footer>
          <button
            disabled={index === 0}
            onClick={() => {
              wentBack.current = true;
              setIndex((i) => i - 1);
            }}
          >
            <ArrowLeft size={14} /> Back
          </button>
          {last ? (
            <button className="tutorial-next" onClick={finish}>
              Finish
            </button>
          ) : (
            <button
              className="tutorial-next"
              onClick={() => setIndex((i) => i + 1)}
            >
              Next <ArrowRight size={14} />
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}
