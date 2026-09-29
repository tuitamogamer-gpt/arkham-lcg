const C = (n: number) => String(12000 + n);

// Spreading Flames as data. Rules that are specific to this scenario's cards
// still resolve in the engine, but the board, decks, thresholds and texts
// are described here so that a second scenario can be added beside it.
export const SPREADING_FLAMES = {
  code: C(105),
  name: "Spreading Flames",
  campaign: "Brethren of Ash",
  start: C(113),
  locations: [C(113), C(117), C(116), C(118), C(119), C(120)],
  connections: {
    [C(113)]: [C(117)],
    [C(117)]: [C(113), C(116)],
    [C(116)]: [C(117), C(118), C(119), C(120)],
    [C(118)]: [C(116)],
    [C(119)]: [C(116)],
    [C(120)]: [C(116)],
  } as Record<string, string[]>,
  /** Map positions in percent per act, desktop and narrow screens. */
  map: {
    early: { [C(113)]: [18, 50], [C(117)]: [50, 50], [C(116)]: [82, 50] },
    late: {
      [C(117)]: [12, 50],
      [C(116)]: [39, 50],
      [C(118)]: [65, 24],
      [C(119)]: [65, 76],
      [C(120)]: [89, 50],
    },
    narrowEarly: { [C(113)]: [50, 17], [C(117)]: [50, 50], [C(116)]: [50, 83] },
    narrowLate: {
      [C(117)]: [24, 17],
      [C(116)]: [50, 50],
      [C(118)]: [76, 17],
      [C(119)]: [24, 83],
      [C(120)]: [76, 83],
    },
  } as Record<string, Record<string, [number, number]>>,
  agendas: [C(106), C(107), C(108)],
  agendaDoom: [3, 5, 10],
  acts: [C(109), C(110), C(111), C(112)],
  /** Group clue cost per investigator, and where it must be paid. */
  actClueCost: { 1: { perInvestigator: 2 }, 3: { perInvestigator: 3, at: C(120) } } as Record<
    number,
    { perInvestigator: number; at?: string }
  >,
  actObjective: (act: number, partySize: number) =>
    [
      `Find ${2 * partySize} clues as a group. Advance at the end of the round.`,
      "Get every surviving investigator to Miskatonic Quad.",
      `Bring ${3 * partySize} group clues to Orne Library at the end of the round.`,
      "Defeat the Servant of Flame. Spend group clues to deal damage.",
    ][act - 1],
  encounterDeck: [
    121, 121, 122, 122, 123, 123, 123, 124, 124, 124, 125, 125, 126, 126, 127,
    127, 128, 128, 130, 130, 131, 131, 132, 132,
  ].map(C),
  fireSetAside: 5,
  boss: C(114),
  quad: C(116),
  dormitories: C(117),
  library: C(120),
  fire: C(129),
  reference: C(105),
};
export const agendaDoomLimit = (agenda: number) =>
  SPREADING_FLAMES.agendaDoom[Math.min(agenda, 3) - 1];
