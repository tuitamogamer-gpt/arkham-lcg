import type { GameState } from "./types";

// Concise adaptations of the campaign guide, pp. 2–4. No later chapters.
// Source and artwork provenance: docs/story-and-card-backs.md.
export const INTRODUCTION = [
  {
    chapter: "Brethren of Ash · Campaign prologue",
    title: "A Glorious Rebirth",
    text: "Arkham rebuilds after the flood, but new money cannot wash away its disappearances and violence. You and others who have glimpsed the impossible suspect something darker beneath the city’s recovery.",
  },
  {
    chapter: "Scenario I · Spreading Flames",
    title: "Your friend is missing.",
    text: "Fires and suspicious accidents trouble Arkham. Your friend suspects the robed figures seen nearby. You arrange to meet at Miskatonic University, but find an empty room and an unnervingly silent dormitory.",
  },
] as const;

export const PURSUER_RESOLUTION = {
  chapter: "Resolution 1 · The masked pursuer falls",
  title: "A choice in the smoke",
  text: "The pursuer is defeated. Armitage urges you to follow the trail of your missing friend. Students battle the blaze nearby; helping them will cost precious time.",
};

export function scenarioResolution(s: GameState) {
  if (s.status !== "resolution") return null;
  const saved = s.campaign.result === "saved";
  const pursued = saved || s.campaign.result === "pursuer";
  return {
    number: saved ? 2 : pursued ? 3 : 0,
    chapter: saved
      ? "Resolution 2"
      : pursued
        ? "Resolution 3"
        : "No resolution reached",
    title: saved ? "Miskatonic still stands." : "Miskatonic University burned.",
    text: saved
      ? "You join the firefighting effort, holding back the flames until help arrives. Burned and exhausted, you return to Armitage."
      : pursued
        ? "You leave with Armitage. Sirens accompany your retreat as the university burns behind you."
        : "At the campus edge, you watch the university succumb to fire. Armitage stands before the ruined library. Your friend’s disappearance and the attackers remain a mystery.",
    reason: saved
      ? "You defeated the masked pursuer and chose to fight the fire."
      : pursued
        ? "You defeated the masked pursuer and chose to leave."
        : s.campaign.result === "overrun"
          ? "The final agenda advanced before you completed the objective."
          : [s.player, ...s.companions].every((p) => p.status === "resigned")
            ? "Every investigator resigned."
            : "Every investigator was defeated or resigned.",
    bonusXp: saved ? 4 : pursued ? 3 : 2,
    trauma: saved ? "physical" : "mental",
    pursued,
  };
}
