import { card, cards } from "./data";
import type { Card, GameState } from "./types";

// Player cards are public. Campaign rewards and weaknesses with an encounter
// set belong to the story, even when they have a player-card faction.
export const isPlayerCard = (c: Card) =>
  !c.encounter_code && c.faction_code !== "mythos";

export function campaignKnowledge(s: GameState | null) {
  const fronts = new Set<string>(s?.discoveries?.cards || []);
  const backs = new Set<string>(s?.discoveries?.storyBacks || []);
  if (!s) return { fronts, backs };
  const reveal = (code?: string) => {
    if (!code || !card(code)) return;
    // A location may be mentioned by a public effect before it is explored.
    if (
      card(code).type_code === "location" &&
      !s.locations.some((l) => l.code === code && l.revealed)
    )
      return;
    fronts.add(code);
  };
  reveal("12105"); // The current scenario reference, including both difficulties.
  for (let n = 1; n <= s.act; n++) {
    reveal(String(12108 + n));
    if (n < s.act) backs.add(String(12108 + n));
  }
  for (let n = 1; n <= Math.min(3, s.agenda); n++) {
    reveal(String(12105 + n));
    if (n < s.agenda) backs.add(String(12105 + n));
  }
  s.locations.filter((l) => l.revealed).forEach((l) => reveal(l.code));
  s.enemies.forEach((e) => reveal(e.code));
  [...s.encounterDiscard, ...s.victory].forEach(reveal);
  if (s.locations.some((l) => l.active && l.fire)) reveal("12129");
  for (const p of [s.player, ...s.companions]) {
    [...p.hand, ...p.assets, ...p.discard].forEach((c) => reveal(c.code));
    p.threats.forEach(reveal);
  }
  s.limbo?.forEach((c) => reveal(c.code));
  for (const e of [...s.eventHistory, ...(s.event ? [s.event] : [])]) {
    reveal(e.card);
    if (e.story) {
      reveal(e.story.previous);
      reveal(e.story.current);
      backs.add(e.story.previous);
    }
  }
  // Never inspect the encounter deck, queued effects, or set-aside cards.
  return { fronts, backs };
}

export function recordDiscoveries(s: GameState) {
  const { fronts, backs } = campaignKnowledge(s);
  s.discoveries = {
    cards: [...fronts].filter((code) => !isPlayerCard(card(code))).sort(),
    storyBacks: [...backs].sort(),
  };
}

export function availableCards(s: GameState | null) {
  const { fronts } = campaignKnowledge(s);
  return cards.filter((c) => isPlayerCard(c) || fronts.has(c.code));
}

export function canInspectCard(s: GameState | null, code: string) {
  const c = card(code);
  return !!c && (isPlayerCard(c) || campaignKnowledge(s).fronts.has(code));
}

export function canReadReverse(s: GameState | null, code: string) {
  const c = card(code);
  if (!c || !canInspectCard(s, code)) return false;
  if (c.type_code === "act" || c.type_code === "agenda")
    return campaignKnowledge(s).backs.has(code);
  return isPlayerCard(c) || c.type_code === "location" || c.code === "12105";
}
