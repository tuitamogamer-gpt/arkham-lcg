import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { GameState } from "../game/types";
import type { CompanionSnapshot } from "../game/companionProtocol";
import {
  selectCoreMilestone,
  selectCompanionMilestone,
  type MilestoneCue,
} from "../game/milestones";
import { readMotionPreference, type MotionPreference } from "./Motion";
import "../milestones.css";

const ResolutionPlayer = lazy(() => import("./milestones/ResolutionPlayer"));

// A failed decorative chunk must never take the table or its controls down.
class MilestoneArtBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useMilestonePreference() {
  const read = () => ({
    motion: (document.documentElement.dataset.motion ||
      readMotionPreference()) as MotionPreference,
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  const [preference, setPreference] = useState(read);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPreference(read());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
    query.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      query.removeEventListener("change", update);
    };
  }, []);
  return preference;
}

function MilestoneNotice({
  cue,
  onDone,
}: {
  cue: MilestoneCue;
  onDone: () => void;
}) {
  const { motion, reduced } = useMilestonePreference();
  const full = motion === "full" && !reduced;
  useEffect(() => {
    if (motion === "off") {
      onDone();
      return;
    }
    const timer = window.setTimeout(onDone, full ? 2200 : 1800);
    return () => window.clearTimeout(timer);
  }, [cue.key, full, motion, onDone]);
  if (motion === "off") return null;
  const video =
    cue.kind === "agenda"
      ? "agenda-omen"
      : cue.kind === "act"
        ? "act-reveal"
        : undefined;
  return createPortal(
    <>
      {full && (
        <div
          className={`milestone-art-layer cinematic milestone-${cue.kind}`}
          data-milestone-key={cue.key}
          aria-hidden="true"
        >
          <div
            className={`milestone-art ${cue.kind === "agenda" ? "omen-art" : ""}`}
            aria-hidden="true"
          >
            {video ? (
              <video
                autoPlay
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
                tabIndex={-1}
              >
                <source src={`/motion/${video}.webm`} type="video/webm" />
                <source src={`/motion/${video}.mp4`} type="video/mp4" />
              </video>
            ) : (
              <MilestoneArtBoundary>
                <Suspense fallback={null}>
                  <ResolutionPlayer
                    variant={
                      cue.kind === "victory"
                        ? "victory"
                        : cue.kind === "defeat"
                          ? "defeat"
                          : "ended"
                    }
                  />
                </Suspense>
              </MilestoneArtBoundary>
            )}
          </div>
        </div>
      )}
      <div
        className={`milestone-notice ${full ? "cinematic" : "quiet"} milestone-${cue.kind}`}
        data-milestone={cue.kind}
        data-milestone-key={cue.key}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="milestone-copy">
          <span className="milestone-rule" aria-hidden="true" />
          <strong>{cue.title}</strong>
          {cue.detail && <span>{cue.detail}</span>}
          <span className="milestone-rule" aria-hidden="true" />
        </div>
      </div>
    </>,
    document.body,
  );
}

function useMilestones<T>(
  current: T | null,
  scope: string,
  select: (before: T, after: T) => MilestoneCue | undefined,
) {
  const previous = useRef<{ scope: string; value: T } | null>(null);
  const seen = useRef(new Set<string>());
  const [cue, setCue] = useState<MilestoneCue>();
  const dismiss = useCallback(() => setCue(undefined), []);
  useEffect(() => {
    if (!current) {
      previous.current = null;
      setCue(undefined);
      return;
    }
    const before = previous.current;
    previous.current = { scope, value: current };
    if (!before || before.scope !== scope) {
      seen.current.clear();
      setCue(undefined);
      return;
    }
    const next = select(before.value, current);
    if (!next || seen.current.has(next.key)) return;
    seen.current.add(next.key);
    if (seen.current.size > 128)
      seen.current.delete(seen.current.values().next().value!);
    // Observe a milestone once even when motion is off. Turning it on later
    // never replays a saved result or changes a native question.
    if (
      (document.documentElement.dataset.motion || readMotionPreference()) !==
      "off"
    )
      setCue(next);
  }, [current, scope, select]);
  return cue ? (
    <MilestoneNotice key={cue.key} cue={cue} onDone={dismiss} />
  ) : null;
}

export function useCoreMilestones(game: GameState) {
  return useMilestones(game, game.id, selectCoreMilestone);
}

export function useCompanionMilestones(
  snapshot: CompanionSnapshot | null,
  sessionKey: string,
) {
  return useMilestones(snapshot, sessionKey, selectCompanionMilestone);
}
