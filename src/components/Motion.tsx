import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { GameState } from "../game/types";
import { tableMotion, type MotionKind } from "../game/motion";
import { audio } from "../audio";

export type MotionPreference = "full" | "subtle" | "off";
export function readMotionPreference(): MotionPreference {
  try {
    const value = localStorage.getItem("arkham-chronicle:motion");
    if (value === "subtle" || value === "off") return value;
  } catch {
    /* Storage is optional. */
  }
  return "full";
}

export function Embers() {
  return (
    <div className="atmosphere-embers" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <i
          key={i}
          style={
            {
              "--drift": `${((i % 3) - 1) * 55}px`,
              left: `${6 + i * 8}%`,
              animationDelay: `${-i * 1.7}s`,
              animationDuration: `${13 + (i % 4) * 3}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

const frames: Record<MotionKind, Keyframe[]> = {
  gain: [
    { scale: "1", filter: "brightness(1)" },
    { scale: "1.16", filter: "brightness(1.7)", offset: 0.3 },
    { scale: "1", filter: "brightness(1)" },
  ],
  spend: [
    { scale: "1" },
    { scale: ".86", filter: "brightness(.7)", offset: 0.35 },
    { scale: "1", filter: "brightness(1)" },
  ],
  damage: [
    { translate: "0" },
    { translate: "-5px 0", filter: "sepia(.4) saturate(2)", offset: 0.2 },
    { translate: "5px 0", offset: 0.4 },
    { translate: "-2px 0", offset: 0.65 },
    { translate: "0", filter: "none" },
  ],
  horror: [
    { filter: "none" },
    {
      filter: "sepia(.5) hue-rotate(210deg) saturate(2)",
      scale: ".97",
      offset: 0.45,
    },
    { filter: "none", scale: "1" },
  ],
  heal: [
    { filter: "brightness(1)" },
    { filter: "brightness(1.6) sepia(.3)", offset: 0.4 },
    { filter: "brightness(1)" },
  ],
  draw: [
    { opacity: 0, translate: "0 35px", rotate: "-7deg" },
    { opacity: 1, translate: "0", rotate: "0deg" },
  ],
  play: [
    { scale: ".88", filter: "brightness(1.5)" },
    { scale: "1", filter: "brightness(1)" },
  ],
  move: [{ scale: ".8" }, { scale: "1.12", offset: 0.6 }, { scale: "1" }],
  reveal: [
    { opacity: 0.3, rotate: "y -65deg", scale: ".94" },
    { opacity: 1, rotate: "y 0deg", scale: "1" },
  ],
  attack: [
    { translate: "0" },
    { translate: "18px 0", rotate: "-3deg", offset: 0.35 },
    { translate: "0", rotate: "0deg" },
  ],
  exhaust: [{ filter: "brightness(1.35)" }, { filter: "brightness(1)" }],
  ready: [
    { filter: "brightness(1)" },
    { filter: "brightness(1.6)", offset: 0.4 },
    { filter: "brightness(1)" },
  ],
  story: [
    { rotate: "y -75deg", filter: "brightness(.6)" },
    { rotate: "y 0deg", filter: "brightness(1)" },
  ],
  investigate: [
    { filter: "brightness(1)" },
    { filter: "brightness(1.7) drop-shadow(0 0 12px #adc88d)", offset: 0.45 },
    { filter: "brightness(1)" },
  ],
  evade: [
    { translate: "0", opacity: 1 },
    { translate: "24px -8px", opacity: 0.3, offset: 0.45 },
    { translate: "0", opacity: 1 },
  ],
  engage: [
    { scale: "1" },
    { scale: "1.1", filter: "drop-shadow(0 0 12px #db795b)", offset: 0.45 },
    { scale: "1", filter: "none" },
  ],
  parley: [
    { rotate: "0deg" },
    { rotate: "-3deg", offset: 0.3 },
    { rotate: "3deg", offset: 0.65 },
    { rotate: "0deg" },
  ],
  fire: [
    { filter: "none" },
    {
      filter: "sepia(1) saturate(4) drop-shadow(0 0 18px #df6c26)",
      offset: 0.4,
    },
    { filter: "none" },
  ],
  extinguish: [
    { filter: "none" },
    { filter: "brightness(1.7) saturate(.2)", offset: 0.5 },
    { filter: "none" },
  ],
  defeat: [
    { opacity: 1, scale: "1" },
    { opacity: 0.5, rotate: "8deg", scale: ".92", offset: 0.5 },
    { opacity: 0, scale: ".6", translate: "0 30px" },
  ],
  discard: [
    { opacity: 1, scale: "1" },
    { opacity: 0, scale: ".55", translate: "0 30px", rotate: "12deg" },
  ],
  commit: [
    { translate: "0", filter: "none" },
    { translate: "0 -8px", filter: "brightness(1.6)", offset: 0.45 },
    { translate: "0", filter: "none" },
  ],
  boost: [
    { scale: "1" },
    { scale: "1.05", filter: "brightness(1.5)", offset: 0.5 },
    { scale: "1", filter: "none" },
  ],
  resign: [
    { opacity: 1 },
    { opacity: 0.3, filter: "grayscale(1)", offset: 0.5 },
    { opacity: 1 },
  ],
};
type Position = { left: number; top: number; width: number; height: number };
function position(el: HTMLElement): Position {
  const box = el.getBoundingClientRect();
  return {
    left: box.left + window.scrollX,
    top: box.top + window.scrollY,
    width: box.width,
    height: box.height,
  };
}

export function useTableMotion(s: GameState) {
  const previous = useRef(s);
  const positions = useRef(new Map<string, Position>());
  const snapshots = useRef(new Map<string, HTMLElement>());
  useLayoutEffect(() => {
    const elements = new Map<string, HTMLElement>();
    document
      .querySelectorAll<HTMLElement>("[data-motion-target]")
      .forEach((el) => {
        elements.set(el.dataset.motionTarget!, el);
      });
    const animations: Animation[] = [];
    const overlays: HTMLElement[] = [];
    const currentPositions = new Map(
      [...elements].map(([id, el]) => [id, position(el)]),
    );
    const cues = tableMotion(previous.current, s);
    // Sound follows the same public cues and, like motion, never advances play.
    audio.cues(cues.map((cue) => cue.kind));
    const preference =
      document.documentElement.dataset.motion || readMotionPreference();
    if (
      preference === "full" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      for (const cue of cues) {
        let el = elements.get(cue.target);
        const removed = !el;
        if (!el && ["defeat", "discard", "commit"].includes(cue.kind)) {
          const snapshot = snapshots.current.get(cue.target);
          const old = positions.current.get(cue.target);
          if (snapshot && old) {
            el = snapshot.cloneNode(true) as HTMLElement;
            el.classList.add("motion-ghost");
            el.removeAttribute("data-motion-target");
            el.removeAttribute("id");
            el.setAttribute("aria-hidden", "true");
            el.inert = true;
            Object.assign(el.style, {
              position: "absolute",
              left: `${old.left}px`,
              top: `${old.top}px`,
              width: `${old.width}px`,
              height: `${old.height}px`,
              margin: "0",
              transform: "none",
            });
            document.body.append(el);
            overlays.push(el);
          }
        }
        if (!el) continue;
        const now =
          currentPositions.get(cue.target) ||
          positions.current.get(cue.target)!;
        const old = cue.from ? positions.current.get(cue.from) : undefined;
        const inViewport =
          now.top + now.height > window.scrollY &&
          now.top < window.scrollY + window.innerHeight;
        if (!inViewport) continue;
        let keyframes = frames[cue.kind];
        if (old && ["move", "play", "draw", "reveal"].includes(cue.kind)) {
          // Animate the visible card/marker between its real table positions.
          // Individual transforms preserve existing card exhaustion/map transforms.
          keyframes = [
            {
              translate: `${old.left - now.left}px ${old.top - now.top}px`,
              scale: `${Math.min(1.2, old.width / now.width)}`,
              opacity: 0.45,
            },
            { translate: "0 0", scale: "1", opacity: 1 },
          ];
        }
        const destination = cue.to && currentPositions.get(cue.to);
        if (destination && removed)
          keyframes = [
            { translate: "0", scale: "1", opacity: 1 },
            {
              translate: `${destination.left - now.left}px ${destination.top - now.top}px`,
              scale: ".2",
              opacity: 0,
              rotate: "14deg",
            },
          ];
        const animation = el.animate(keyframes, {
          duration: cue.kind === "move" ? 720 : 620,
          easing: "cubic-bezier(.2,.75,.25,1)",
        });
        if (removed) {
          const ghost = el;
          animation.onfinish = () => ghost.remove();
        }
        animations.push(animation);
        if (cue.delta) {
          const float = document.createElement("span");
          float.className = `motion-delta ${cue.kind}`;
          float.setAttribute("aria-hidden", "true");
          float.textContent = `${cue.delta > 0 ? "+" : "−"}${Math.abs(cue.delta)}`;
          Object.assign(float.style, {
            left: `${now.left + now.width / 2}px`,
            top: `${now.top}px`,
          });
          document.body.append(float);
          overlays.push(float);
          const animation = float.animate(
            [
              { opacity: 0, translate: "-50% 4px" },
              { opacity: 1, translate: "-50% -12px", offset: 0.25 },
              { opacity: 0, translate: "-50% -38px" },
            ],
            { duration: 1100, easing: "ease-out" },
          );
          animation.onfinish = () => float.remove();
          animations.push(animation);
        }
      }
    }
    previous.current = s;
    positions.current = currentPositions;
    snapshots.current = new Map(
      [...elements].map(([id, el]) => [id, el.cloneNode(true) as HTMLElement]),
    );
    const stop = () => {
      animations.forEach((a) => a.cancel());
      overlays.forEach((el) => el.remove());
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => {
      if (document.documentElement.dataset.motion !== "full" || reduced.matches)
        stop();
    };
    const observer = new MutationObserver(changed);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
    reduced.addEventListener("change", changed);
    return () => {
      stop();
      observer.disconnect();
      reduced.removeEventListener("change", changed);
    };
  }, [s]);
}
