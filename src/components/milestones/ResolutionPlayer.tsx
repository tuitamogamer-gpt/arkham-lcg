import { Player } from "@remotion/player";
import {
  ResolutionComposition,
  RESOLUTION_COMPOSITION,
  type ResolutionVariant,
} from "./ResolutionComposition";

export default function ResolutionPlayer({
  variant,
}: {
  variant: ResolutionVariant;
}) {
  return (
    <Player
      component={ResolutionComposition}
      inputProps={{ variant }}
      compositionWidth={RESOLUTION_COMPOSITION.width}
      compositionHeight={RESOLUTION_COMPOSITION.height}
      durationInFrames={RESOLUTION_COMPOSITION.durationInFrames}
      fps={RESOLUTION_COMPOSITION.fps}
      autoPlay
      controls={false}
      loop={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      moveToBeginningWhenEnded={false}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}
