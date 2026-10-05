import type { Action, GameState } from "./types";

/** Undo may correct a public choice, but cannot reveal then hide new information. */
export function isUndoBarrier(
  before: GameState,
  after: GameState,
  action: Action,
) {
  if (
    after.id !== before.id ||
    ["reveal", "mulligan", "continueIntroduction"].includes(action.type) ||
    after.status !== "playing" ||
    after.phase !== "investigation" ||
    after.round !== before.round ||
    after.turnInvestigator !== before.turnInvestigator ||
    after.player.code !== before.player.code ||
    after.seed !== before.seed ||
    after.act !== before.act ||
    after.agenda !== before.agenda
  )
    return true;

  const previousParty = [before.player, ...before.companions];
  const hiddenIds = new Set(
    previousParty.flatMap((p) => p.deck.map((c) => c.id)),
  );
  for (const p of [after.player, ...after.companions]) {
    const previous = previousParty.find((old) => old.code === p.code);
    if (
      !previous ||
      p.deck.some((c, i) => c.id !== previous.deck[i]?.id) ||
      p.deck.length !== previous.deck.length
    )
      return true;
  }
  if (after.decision?.choices.some((c) => hiddenIds.has(c.id))) return true;
  // A search of the encounter deck (Paint the Town Red) offers its cards by
  // code before anything else changes; seeing them is new information too.
  if (
    after.decision?.choices.some((c) => before.encounterDeck.includes(c.id))
  )
    return true;
  if (
    after.locations.some(
      (l) =>
        l.revealed &&
        !before.locations.find((old) => old.code === l.code)?.revealed,
    )
  )
    return true;
  if (
    after.discoveries?.cards.some(
      (c) => !before.discoveries?.cards.includes(c),
    ) ||
    after.discoveries?.storyBacks.some(
      (c) => !before.discoveries?.storyBacks.includes(c),
    )
  )
    return true;
  return after.eventHistory.some(
    (e) => e.id > before.eventSerial && e.encounter?.stage === "revealed",
  );
}
