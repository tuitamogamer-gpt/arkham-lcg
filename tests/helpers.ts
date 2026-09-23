import { reduceGame as step } from "../src/game/engine";
import type { GameState, Action } from "../src/game/types";

// Rules regressions explicitly acknowledge presentation only. They still stop at
// every real decision and skill test. Pacing tests use the unwrapped reducer.
export function reduceGame(s: GameState, a: Action): GameState {
  s = step(s, a);
  let n = 0;
  while (s.event) {
    if (++n > 1000) throw Error("Presentation checkpoints failed to terminate");
    s = step(s, { type: "continue", eventId: s.event.id });
  }
  return s;
}
