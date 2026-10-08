import type { GameState } from "./types";
import {
  companionEntities,
  type CompanionSnapshot,
  type NativeGame,
  type NativeRecord,
} from "./companionProtocol";

export type MilestoneKind = "act" | "agenda" | "victory" | "defeat" | "ended";
export interface MilestoneCue {
  key: string;
  kind: MilestoneKind;
  title: string;
  detail?: string;
}

const record = (value: unknown): NativeRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as NativeRecord)
    : {};
const text = (value: unknown): string =>
  typeof value === "string" ? value : "";
const stateTag = (value: unknown): string =>
  typeof value === "string" ? value : text(record(value).tag);
const positiveStep = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** Public resolved transitions only. Loading, undo and replay suppression belong
 * to the caller, which knows whether an incoming state follows a live action.
 */
export function selectCoreMilestone(
  before: GameState,
  after: GameState,
): MilestoneCue | undefined {
  if (
    !before.id ||
    before.id !== after.id ||
    after.eventSerial < before.eventSerial
  )
    return undefined;
  if (before.status === "playing" && after.status === "resolution") {
    const result = after.campaign.result;
    if (result === "saved" || result === "pursuer")
      return {
        key: `core:${after.id}:ending`,
        kind: "victory",
        title: "Objective complete",
        detail:
          result === "saved"
            ? "Miskatonic University is saved."
            : "The masked pursuer is defeated.",
      };
    if (result === "defeat" || result === "overrun")
      return {
        key: `core:${after.id}:ending`,
        kind: "defeat",
        title: "Investigation lost",
        detail:
          result === "overrun"
            ? "The final agenda advanced."
            : "The investigators were defeated.",
      };
    return {
      key: `core:${after.id}:ending`,
      kind: "ended",
      title: "Investigation ended",
      ...(result === "resigned"
        ? { detail: "The investigators resigned." }
        : {}),
    };
  }
  if (before.status !== "playing" || after.status !== "playing")
    return undefined;
  // One accent per transition, with an agenda taking precedence over an act.
  for (const kind of ["agenda", "act"] as const) {
    if (
      positiveStep(before[kind]) &&
      positiveStep(after[kind]) &&
      after[kind] > before[kind]
    )
      return {
        key: `core:${after.id}:${kind}:${after[kind]}`,
        kind,
        title: `${kind === "act" ? "Act" : "Agenda"} ${after[kind]}`,
        detail:
          kind === "act" ? "The investigation advances." : "An omen unfolds.",
      };
  }
  return undefined;
}

function scenario(game: NativeGame): NativeRecord {
  const mode = record(game.mode);
  const combined = Array.isArray(mode.These) ? mode.These[1] : undefined;
  return record(game.scenario ?? mode.That ?? combined);
}

function scenarioId(game: NativeGame): string {
  return text(scenario(game).id);
}

function sameNativeContext(
  before: CompanionSnapshot,
  after: CompanionSnapshot,
): boolean {
  return (
    !!before.gameId &&
    before.gameId === after.gameId &&
    !!before.playerId &&
    before.playerId === after.playerId &&
    (!before.game.id || before.game.id === before.gameId) &&
    (!after.game.id || after.game.id === after.gameId) &&
    Number.isSafeInteger(before.step) &&
    Number.isSafeInteger(after.step) &&
    before.step >= 0 &&
    after.step > before.step &&
    scenarioId(before.game) === scenarioId(after.game)
  );
}

/** Only currently exposed physical acts/agendas are read. Scenario stacks,
 * cards underneath, metadata, messages and concealed faces are never consulted.
 */
function deckSteps(
  game: NativeGame,
  kind: "act" | "agenda",
): Map<number, number> {
  const result = new Map<number, number>();
  const seen = new Set<number>();
  for (const entity of companionEntities(
    game,
    kind === "act" ? "acts" : "agendas",
  )) {
    const deck = entity.deckId;
    if (typeof deck !== "number" || !Number.isSafeInteger(deck) || deck < 0)
      continue;
    if (seen.has(deck)) {
      result.delete(deck);
      continue;
    }
    seen.add(deck);
    const sequence = entity.sequence;
    const step =
      kind === "act"
        ? Array.isArray(sequence) && sequence.length === 2
          ? sequence[0]
          : undefined
        : record(sequence).agendaSequenceStep;
    const side =
      kind === "act"
        ? Array.isArray(sequence) && sequence.length === 2
          ? sequence[1]
          : undefined
        : record(sequence).agendaSequenceSide;
    if (
      !positiveStep(step) ||
      typeof side !== "string" ||
      !(kind === "act" ? /^[A-H]$/ : /^[A-D]$/).test(side) ||
      !text(entity.id) ||
      !text(entity.cardId)
    )
      continue;
    result.set(deck, step);
  }
  return result;
}

export function selectCompanionMilestone(
  before: CompanionSnapshot,
  after: CompanionSnapshot,
): MilestoneCue | undefined {
  if (!sameNativeContext(before, after)) return undefined;
  if (
    before.game.inSetup !== false ||
    after.game.inSetup !== false ||
    !scenarioId(before.game)
  )
    return undefined;
  if (
    stateTag(before.game.gameState) === "IsActive" &&
    stateTag(after.game.gameState) === "IsOver"
  )
    return {
      key: `native:${after.gameId}:${scenarioId(after.game)}:ending`,
      kind: "ended",
      title: "Investigation ended",
    };
  if (
    stateTag(before.game.gameState) !== "IsActive" ||
    stateTag(after.game.gameState) !== "IsActive"
  )
    return undefined;
  for (const kind of ["agenda", "act"] as const) {
    const previous = deckSteps(before.game, kind);
    const current = deckSteps(after.game, kind);
    for (const [deck, step] of [...current].sort(([a], [b]) => a - b)) {
      const prior = previous.get(deck);
      if (prior !== undefined && step > prior)
        return {
          key: `native:${after.gameId}:${scenarioId(after.game)}:${kind}:${deck}:${step}`,
          kind,
          title: `${kind === "act" ? "Act" : "Agenda"} ${step}`,
          detail:
            kind === "act" ? "The investigation advances." : "An omen unfolds.",
        };
    }
  }
  return undefined;
}
