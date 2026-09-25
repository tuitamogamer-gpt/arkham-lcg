import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ArrowRight, Check, Eye, StarFour, X } from "@phosphor-icons/react";
import type { Test } from "../game/types";
import { Token } from "./Common";
import { readMotionPreference } from "./Motion";

type DrawPhase = "stirring" | "drawing" | "revealing" | "settled";

function cinematicMotion() {
  return (
    readMotionPreference() === "full" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function useCinematicMotion() {
  const [cinematic, setCinematic] = useState(cinematicMotion);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setCinematic(cinematicMotion());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
    query.addEventListener("change", update);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", update);
    };
  }, []);
  return cinematic;
}

/** A drawn illustration: separate cloth, mouth and cords can move independently. */
function ChaosPouch() {
  const id = useId().replaceAll(":", "");
  return (
    <svg
      className="chaos-pouch"
      viewBox="0 0 240 220"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${id}-cloth`}
          x1="50"
          y1="90"
          x2="196"
          y2="170"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#162e30" />
          <stop offset=".3" stopColor="#46605b" />
          <stop offset=".55" stopColor="#213e3d" />
          <stop offset=".83" stopColor="#102a2b" />
          <stop offset="1" stopColor="#091a1d" />
        </linearGradient>
        <linearGradient
          id={`${id}-gold`}
          x1="65"
          y1="50"
          x2="165"
          y2="180"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#e0c28b" />
          <stop offset=".5" stopColor="#9b7b47" />
          <stop offset="1" stopColor="#614e31" />
        </linearGradient>
        <radialGradient id={`${id}-inside`}>
          <stop stopColor="#030a0c" />
          <stop offset=".7" stopColor="#071518" />
          <stop offset="1" stopColor="#57746a" />
        </radialGradient>
      </defs>
      <ellipse cx="121" cy="202" rx="81" ry="10" fill="#000" opacity=".3" />
      <g className="chaos-pouch-cloth">
        <path
          d="M82 70C72 102 32 133 40 170C47 205 92 208 122 208C157 208 196 199 201 169C208 133 170 103 160 70Z"
          fill={`url(#${id}-cloth)`}
          stroke="#698074"
          strokeWidth="1.3"
        />
        <path
          d="M84 81C84 118 53 151 62 184M99 86C102 126 78 164 87 199M145 85C141 123 174 163 161 198M160 82C161 115 194 150 184 180"
          stroke="#9cab8b"
          strokeOpacity=".16"
          strokeWidth="3"
        />
        <path
          d="M79 91C88 119 69 157 76 189M153 90C143 128 169 155 174 189"
          stroke="#021416"
          strokeOpacity=".5"
          strokeWidth="6"
        />
        <path
          d="M56 167C75 209 164 213 187 169"
          stroke="#af9868"
          strokeOpacity=".35"
          strokeDasharray="2 4"
        />
        <g stroke={`url(#${id}-gold)`} strokeWidth="1.2">
          <circle cx="121" cy="155" r="27" />
          <circle cx="121" cy="155" r="23" strokeOpacity=".45" />
          <path d="m121 129 6 19 19 7-19 6-6 20-6-20-19-6 19-7Z" />
          <path d="m103 137 36 36m0-36-36 36" strokeOpacity=".4" />
          <ellipse cx="121" cy="155" rx="9" ry="5" />
          <circle cx="121" cy="155" r="2" fill="#c6ab75" />
        </g>
      </g>
      <g className="chaos-pouch-mouth">
        <path
          d="m79 77-8-28 17 6 14-11 14 9 14-9 16 11 20-7-6 29Z"
          fill={`url(#${id}-cloth)`}
          stroke="#64776a"
        />
        <ellipse
          cx="119"
          cy="55"
          rx="44"
          ry="12"
          fill={`url(#${id}-inside)`}
          stroke="#8a936f"
        />
        <path
          d="M78 77Q120 89 164 76M78 81Q120 93 164 80"
          stroke={`url(#${id}-gold)`}
          strokeWidth="2.5"
        />
      </g>
      <g
        className="chaos-pouch-cords"
        stroke={`url(#${id}-gold)`}
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <path d="M164 79c35-8 39 26 11 17-19-7-4-21 9-8 14 14-1 44 10 54M79 80c-33-6-41 20-18 18 22-2 6-23-5-7-12 16 1 32-10 48" />
        <path d="m190 139 5 10m-151-13-2 10" strokeWidth="5" />
      </g>
    </svg>
  );
}

export function ChaosDraw({
  test,
  value,
  animate,
  onPresented,
  children,
}: {
  test: Test;
  value: number;
  animate: boolean;
  onPresented: (requested: boolean) => void;
  children: ReactNode;
}) {
  const cinematic = useCinematicMotion();
  const [playEntrance] = useState(() => animate && cinematic);
  const [phase, setPhase] = useState<DrawPhase>(
    playEntrance ? "stirring" : "settled",
  );
  const [skipped, setSkipped] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const instant = !playEntrance || !cinematic || skipped;
  const ready = instant || phase === "settled";
  const visiblePhase = instant ? "settled" : phase;
  const stagger = Math.min(180, 1000 / Math.max(1, test.tokens.length - 1));
  const tail = Math.max(0, test.tokens.length - 1) * stagger;

  useEffect(() => {
    onPresented(false);
  }, [onPresented]);
  useEffect(() => {
    // The clicked draw/skip button has just unmounted. Keep keyboard focus in
    // the dialog, without moving it away from another control the user chose.
    if (document.activeElement === document.body) {
      actionsRef.current
        ?.querySelector("button")
        ?.focus({ preventScroll: true });
    }
  }, [ready]);
  useEffect(() => {
    if (!playEntrance || !cinematic || skipped) return;
    // These timers change presentation only. The engine has already drawn once;
    // only the player's Resolve button is allowed to apply the test's effects.
    const timers = [
      window.setTimeout(() => setPhase("drawing"), 900),
      window.setTimeout(() => setPhase("revealing"), 1700),
      window.setTimeout(() => setPhase("settled"), 2850 + tail),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [playEntrance, cinematic, skipped, tail]);

  const autoFail = test.tokens.includes("auto_fail");
  const outcome = test.success ? "passed" : "failed";
  const names = test.tokens.map((t) => t.replaceAll("_", " ")).join(", ");
  const caption = ready
    ? test.tokens.length > 1
      ? `${test.tokens.length} tokens drawn`
      : "The token is revealed"
    : visiblePhase === "stirring"
      ? "Something stirs in the dark…"
      : visiblePhase === "drawing"
        ? "Fate is in your hands…"
        : "The darkness gives its answer…";

  return (
    <section
      className={`chaos-draw ${instant ? "is-instant" : "is-cinematic"} ${ready ? `is-ready ${outcome}` : ""}`}
      data-phase={visiblePhase}
      aria-label="Chaos bag draw"
      style={{ "--draw-tail": `${tail}ms` } as CSSProperties}
    >
      <div className="chaos-draw-heading">
        <span>
          <StarFour size={13} weight="thin" /> THE CHAOS BAG
        </span>
        <div className="chaos-draw-steps" aria-hidden="true">
          {["Stir", "Draw", "Reveal"].map((label, i) => (
            <span
              key={label}
              className={
                i <=
                (ready
                  ? 2
                  : visiblePhase === "stirring"
                    ? 0
                    : visiblePhase === "drawing"
                      ? 1
                      : 2)
                  ? "active"
                  : ""
              }
            >
              <i />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div
        className={`chaos-stage ${test.tokens.length > 3 ? "many-tokens" : ""} ${test.tokens.length > 12 ? "crowded-tokens" : ""}`}
      >
        <div className="chaos-atmosphere" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="chaos-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>✦</span>
          <span>✦</span>
        </div>
        <div className="chaos-dust" aria-hidden="true">
          {Array.from({ length: 22 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  "--angle": `${i * 137.5}deg`,
                  "--distance": `${76 + (i % 5) * 22}px`,
                  "--delay": `${(i % 8) * 90}ms`,
                  "--drift": `${(i % 2 ? -1 : 1) * (10 + i * 2)}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div className="chaos-mixing-tokens" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <i key={i} style={{ "--mix-index": i } as CSSProperties}>
              <StarFour weight="thin" />
            </i>
          ))}
        </div>
        <div className="chaos-bag-wrap">
          <ChaosPouch />
        </div>
        <div className="chaos-impact" aria-hidden="true">
          <i />
          <i />
        </div>
        <div className="chaos-token-cast" aria-hidden={!ready}>
          {test.tokens.map((token, i) => (
            <div
              className="chaos-coin-flight revealed-token"
              key={`${i}-${token}`}
              style={
                {
                  "--coin-delay": `${i * stagger}ms`,
                  "--coin-tilt": `${i % 2 ? 8 : -8}deg`,
                } as CSSProperties
              }
            >
              <div className="chaos-coin-shadow" />
              <div className="chaos-coin-rotor">
                <div className="chaos-coin-face chaos-coin-front">
                  <Token token={token} large />
                  <i className="chaos-coin-glint" />
                </div>
                <div
                  className="chaos-coin-face chaos-coin-back"
                  aria-hidden="true"
                >
                  <span>
                    <Eye size={42} weight="thin" />
                  </span>
                  <i className="chaos-coin-glint" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="chaos-stage-caption" role="status">
          <span key={caption}>{caption}</span>
        </div>
      </div>
      <div className="chaos-verdict-slot">
        {ready ? (
          <div
            className={`test-outcome chaos-verdict ${outcome}`}
            aria-live="polite"
          >
            <div className="chaos-verdict-label">
              {test.success ? <Check size={14} /> : <X size={14} />}
              {test.success
                ? "TEST SUCCESSFUL"
                : autoFail
                  ? "AUTOMATIC FAILURE"
                  : "TEST FAILED"}
            </div>
            <h2>{test.success ? "A steady hand." : "The darkness answers."}</h2>
            <p
              className="chaos-equation"
              aria-label={`Tokens: ${names}. ${autoFail ? "Automatic failure" : `${value} ${test.modifier >= 0 ? "plus" : "minus"} ${Math.abs(test.modifier)} equals ${Math.max(0, value + test.modifier)}. Difficulty ${test.difficulty}. ${test.success ? "Success" : "Failure"}`}`}
            >
              {autoFail ? (
                <span>No skill can overcome this token.</span>
              ) : (
                <>
                  <span>{value}</span>
                  <i>{test.modifier >= 0 ? "+" : "−"}</i>
                  <span>{Math.abs(test.modifier)}</span>
                  <i>=</i>
                  <strong>{Math.max(0, value + test.modifier)}</strong>
                  <span className="chaos-equation-target">
                    vs {test.difficulty}
                  </span>
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="chaos-suspense" aria-hidden="true">
            <span />
            <StarFour size={18} weight="thin" />
            <span />
          </div>
        )}
      </div>
      <div className="chaos-draw-actions" ref={actionsRef}>
        {ready ? (
          children
        ) : (
          <button className="chaos-skip" onClick={() => setSkipped(true)}>
            Reveal now <ArrowRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
