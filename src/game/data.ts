import scans from "../../public/data/art-manifest.json";
import raw from "../../public/data/core-2026.json";
import type { Card, Difficulty } from "./types";
export const cards = raw as Card[];
export const cardMap = Object.fromEntries(cards.map((c) => [c.code, c]));
export const card = (code: string) => cardMap[code];
export const code = (n: number) => String(12000 + n);
export const investigators = cards.filter(
  (c) => c.type_code === "investigator",
);
export const JOE_DECK = [
  30, 31, 32, 33, 34, 35, 16, 17, 18, 19, 20, 21, 87, 87, 88, 88, 5, 36, 37, 38,
  22, 23, 24, 89, 89, 39, 25, 93, 93, 92, 92, 6, 100,
].map(code);
export const BAGS: Record<Difficulty, string[]> = {
  easy: [
    "+1",
    "+1",
    "0",
    "0",
    "0",
    "-1",
    "-1",
    "-1",
    "-2",
    "-2",
    "skull",
    "skull",
    "tablet",
    "elder_thing",
    "auto_fail",
    "elder_sign",
  ],
  standard: [
    "+1",
    "0",
    "0",
    "-1",
    "-1",
    "-1",
    "-2",
    "-2",
    "-3",
    "-4",
    "skull",
    "skull",
    "tablet",
    "elder_thing",
    "auto_fail",
    "elder_sign",
  ],
  hard: [
    "0",
    "0",
    "0",
    "-1",
    "-1",
    "-2",
    "-2",
    "-3",
    "-3",
    "-4",
    "-5",
    "skull",
    "skull",
    "tablet",
    "elder_thing",
    "auto_fail",
    "elder_sign",
  ],
  expert: [
    "0",
    "-1",
    "-1",
    "-2",
    "-2",
    "-3",
    "-3",
    "-4",
    "-4",
    "-5",
    "-6",
    "-8",
    "skull",
    "skull",
    "tablet",
    "elder_thing",
    "auto_fail",
    "elder_sign",
  ],
};
export const CONNECTIONS: Record<string, string[]> = {
  "12113": ["12117"],
  "12117": ["12113", "12116"],
  "12116": ["12117", "12118", "12119", "12120"],
  "12118": ["12116"],
  "12119": ["12116"],
  "12120": ["12116"],
};
export const MAP_POS: Record<string, [number, number]> = {
  "12113": [10, 50],
  "12117": [29, 50],
  "12116": [50, 50],
  "12118": [71, 18],
  "12119": [71, 82],
  "12120": [91, 50],
};
export const plain = (s = "") =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[action\]/g, "→")
    .replace(/\[fast\]/g, "◇")
    .replace(/\[reaction\]/g, "↳")
    .replace(/\[per_investigator\]/g, "per investigator")
    .replace(/\[([^\]]+)\]/g, "$1");
export const CARD_ART: Record<string, string> = {
  ...scans,
  "12004": "/art/joe-card.png",
  "12005": "/art/intuition.png",
  "12031": "/art/fingerprint.png",
  "12034": "/art/magnifying.png",
};
