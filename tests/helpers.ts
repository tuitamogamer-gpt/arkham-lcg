import { createGame as newGame, reduceGame as step } from "../src/game/engine";
import type { GameState, Action } from "../src/game/types";

// Legacy rules fixtures pass Fast opportunities without using an ability.
// Timing/pacing regressions use the raw reducer to exercise those opportunities.
export function reduceGame(s: GameState, a: Action): GameState {
  s = step(s, a);
  let n = 0;
  while (s.event || s.window) {
    if (++n > 1000) throw Error("Presentation checkpoints failed to terminate");
    s = step(
      s,
      s.event
        ? { type: "continue", eventId: s.event.id }
        : { type: "passWindow" },
    );
  }
  return s;
}

// Existing rules fixtures begin after the independently tested introduction.
export function createGame(...args: Parameters<typeof newGame>): GameState {
  let s = newGame(...args);
  s = step(s, { type: "continueIntroduction", page: "campaign" });
  return step(s, { type: "continueIntroduction", page: "scenario" });
}
