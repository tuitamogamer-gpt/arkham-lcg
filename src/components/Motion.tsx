import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { GameState } from "../game/types";
import { tableMotion, type MotionKind } from "../game/motion";

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
    const preference =
      document.documentElement.dataset.motion || readMotionPreference();
    if (
      preference === "full" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      for (const cue of tableMotion(previous.current, s)) {
        const el = elements.get(cue.target);
        if (!el) continue;
        const now = currentPositions.get(cue.target)!;
        const old = cue.from ? positions.current.get(cue.from) : undefined;
        const inViewport =
          now.top + now.height > window.scrollY &&
          now.top < window.scrollY + window.innerHeight;
        if (!inViewport) continue;
        let keyframes = frames[cue.kind];
        if (old && ["move", "play", "draw"].includes(cue.kind)) {
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
        animations.push(
          el.animate(keyframes, {
            duration: cue.kind === "move" ? 720 : 620,
            easing: "cubic-bezier(.2,.75,.25,1)",
          }),
        );
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
    return () => {
      animations.forEach((a) => a.cancel());
      overlays.forEach((el) => el.remove());
    };
  }, [s]);
}
