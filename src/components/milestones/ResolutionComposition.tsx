import { Easing, interpolate, useCurrentFrame } from "remotion";

export type ResolutionVariant = "victory" | "defeat" | "ended";

export interface ResolutionCompositionProps {
  variant: ResolutionVariant;
}

/** One finite, silent ornament. Accessible scenario text belongs to the host. */
export const RESOLUTION_COMPOSITION = {
  width: 480,
  height: 240,
  fps: 30,
  durationInFrames: 54,
} as const;

const settle = Easing.bezier(0.16, 1, 0.3, 1);
const clamped = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/**
 * The Remotion Player owns the clock: no CSS animation, timer, random particles,
 * sound, or gameplay reads. Keep x=80..400 / y=88..175 clear for the DOM title.
 * `ended` is an ordinary closed case seal and makes no claim about a victory.
 */
export function ResolutionComposition({ variant }: ResolutionCompositionProps) {
  const frame = useCurrentFrame();
  const accent = variant === "defeat" ? "#9d594e" : "#c7a36a";

  return (
    <svg
      viewBox="0 0 480 240"
      width="100%"
      height="100%"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{
        pointerEvents: "none",
        display: "block",
        width: "100%",
        height: "100%",
        overflow: "visible",
        opacity: interpolate(frame, [0, 9, 42, 53], [0, 1, 1, 0], clamped),
      }}
    >
      <rect
        x="33"
        y="27"
        width="414"
        height="186"
        rx="2"
        fill="#091211"
        fillOpacity="0.18"
      />

      {/* The two edges of the case file open, then land once. */}
      <g
        stroke="#c7a36a"
        strokeWidth="1"
        strokeOpacity="0.52"
        style={{
          translate: `${interpolate(frame, [0, 21], [-16, 0], {
            ...clamped,
            easing: settle,
          })}px 0`,
        }}
      >
        <path d="M155 31H38v48M38 161v48h117" />
        <path d="M38 39h8v8M38 201h8v-8" strokeOpacity="0.6" />
        <path
          d="M71 85h139M71 178h139"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={interpolate(frame, [6, 25], [1, 0], {
            ...clamped,
            easing: settle,
          })}
        />
      </g>
      <g
        stroke="#c7a36a"
        strokeWidth="1"
        strokeOpacity="0.52"
        style={{
          translate: `${interpolate(frame, [0, 21], [16, 0], {
            ...clamped,
            easing: settle,
          })}px 0`,
        }}
      >
        <path d="M325 31h117v48M442 161v48H325" />
        <path d="M442 39h-8v8M442 201h-8v-8" strokeOpacity="0.6" />
        <path
          d="M409 85H270M409 178H270"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={interpolate(frame, [6, 25], [1, 0], {
            ...clamped,
            easing: settle,
          })}
        />
      </g>

      {/* A printed seal, rather than a score or an inferred result. */}
      <g
        stroke={accent}
        strokeWidth="1.1"
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          scale: interpolate(frame, [3, 23], [0.88, 1], {
            ...clamped,
            easing: settle,
          }),
          rotate: `${interpolate(frame, [3, 23], [-7, 0], {
            ...clamped,
            easing: settle,
          })}deg`,
          opacity: interpolate(frame, [3, 15], [0, 0.88], clamped),
        }}
      >
        {variant === "defeat" ? (
          <>
            <path d="M233 39a20 20 0 0 0-12 25M226 72a20 20 0 0 0 29-1M259 64a20 20 0 0 0-15-25" />
            <path d="M231 47l9 8-6 6 14 9" strokeOpacity="0.8" />
          </>
        ) : (
          <circle cx="240" cy="59" r="20" />
        )}
        {variant === "victory" ? (
          <>
            <circle cx="240" cy="59" r="15" strokeOpacity="0.4" />
            <path d="M240 48l7 11-7 11-7-11Z" />
            <path
              d="M240 33v-5M240 85v5M214 59h-5M266 59h5"
              strokeOpacity="0.5"
            />
          </>
        ) : variant === "ended" ? (
          <>
            <path d="M231 59h18M240 50v18" strokeOpacity="0.55" />
            <circle cx="240" cy="59" r="3" fill="#091211" />
          </>
        ) : null}
      </g>

      {/* The ink settles into a short closing rule, without a glow or flash. */}
      <g
        stroke={accent}
        strokeWidth="1"
        strokeOpacity="0.6"
        style={{
          opacity: interpolate(frame, [16, 31], [0, 1], clamped),
          translate: `0 ${interpolate(frame, [16, 31], [4, 0], {
            ...clamped,
            easing: settle,
          })}px`,
        }}
      >
        <path
          d="M211 190h24M269 190h-24"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={interpolate(frame, [16, 32], [1, 0], {
            ...clamped,
            easing: settle,
          })}
        />
        <path d="M240 186l4 4-4 4-4-4Z" />
      </g>
    </svg>
  );
}
