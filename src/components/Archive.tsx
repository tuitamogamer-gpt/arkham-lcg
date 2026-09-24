import { useState } from "react";
import {
  MagnifyingGlass,
  ArrowUpRight,
  LockKey,
  CheckCircle,
} from "@phosphor-icons/react";
import {
  investigators,
  plain,
  CARD_ART,
  PLAYABLE_INVESTIGATORS,
} from "../game/data";
import { CardFace, SkillStats, Button } from "./Common";
import { availableCards } from "../game/knowledge";
import type { GameState } from "../game/types";
export function Archive({
  game,
  inspect,
}: {
  game: GameState | null;
  inspect: (c: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [faction, setFaction] = useState("all");
  const known = availableCards(game);
  const list = known.filter(
    (c) =>
      (type === "all" || c.type_code === type) &&
      (faction === "all" || c.faction_code === faction) &&
      `${c.name} ${c.traits || ""} ${c.code} ${plain(c.text)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="page-content archive-page">
      <div className="eyebrow">The collection</div>
      <div className="page-heading">
        <div>
          <h1>The card archive</h1>
          <p>Your player cards and the discoveries from this investigation.</p>
        </div>
        <span className="edition-tag">
          CORE SET 2026 <span>{known.length} available cards</span>
        </span>
      </div>
      <div className="archive-filters">
        <label className="search">
          <MagnifyingGlass size={19} />
          <input
            aria-label="Search cards"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, trait, or card text…"
          />
        </label>
        <select
          aria-label="Filter by card type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">All card types</option>
          {[...new Set(known.map((c) => c.type_code))].map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by class"
          value={faction}
          onChange={(e) => setFaction(e.target.value)}
        >
          <option value="all">All classes</option>
          {[...new Set(known.map((c) => c.faction_code))].map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="archive-count">
        {list.length} cards found{" "}
        <span>
          <LockKey size={13} /> Unseen story cards stay sealed
        </span>
      </div>
      <div className="archive-grid">
        {list.map((c) => (
          <CardFace key={c.code} c={c} onClick={() => inspect(c.code)} />
        ))}
      </div>
      {!list.length && (
        <div className="empty-state">
          <MagnifyingGlass size={36} />
          <h2>No leads here.</h2>
          <p>Try another card name or clear your filters.</p>
          <Button
            secondary
            onClick={() => {
              setQuery("");
              setType("all");
              setFaction("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
      <p className="quiet-note">
        Story cards appear as you discover them. Unexplored locations and future
        story faces stay hidden. Available cards are not all scripted for play.
      </p>
    </div>
  );
}
export function Investigators({
  inspect,
  onStart,
}: {
  inspect: (c: string) => void;
  onStart: () => void;
}) {
  return (
    <div className="page-content">
      <div className="eyebrow">People of Arkham</div>
      <div className="page-heading">
        <div>
          <h1>The investigator files</h1>
          <p>Ordinary people. Extraordinary circumstances.</p>
        </div>
        <span className="edition-tag">CHAPTER TWO</span>
      </div>
      <div className="investigator-grid">
        {[...investigators]
          .sort(
            (a, b) => Number(b.code === "12004") - Number(a.code === "12004"),
          )
          .map((c) => (
            <article
              className={`investigator-file ${c.faction_code}`}
              key={c.code}
            >
              <div className="file-number">
                DOSSIER / {c.position.toString().padStart(2, "0")}{" "}
                <span>{c.faction_code}</span>
              </div>
              {PLAYABLE_INVESTIGATORS.includes(c.code) ? (
                <div
                  className="dossier-portrait"
                  style={{ backgroundImage: `url(${CARD_ART[c.code]})` }}
                />
              ) : (
                <div className="dossier-initials">
                  {c.name
                    .split(" ")
                    .map((s) => s[0])
                    .join("")}
                  <span>{c.subname}</span>
                </div>
              )}
              <div className="file-copy">
                <h2>{c.name}</h2>
                <div className="subname">{c.subname}</div>
                <SkillStats
                  values={[
                    c.skill_willpower!,
                    c.skill_intellect!,
                    c.skill_combat!,
                    c.skill_agility!,
                  ]}
                />
                <p>
                  {plain(c.text).split("elder_sign")[0].split("effect:")[0]}
                </p>
                <div className="file-status">
                  {PLAYABLE_INVESTIGATORS.includes(c.code) ? (
                    <>
                      <CheckCircle size={15} /> Playable · official starter deck
                    </>
                  ) : (
                    <>
                      <LockKey size={15} /> Dossier available · scripting
                      planned
                    </>
                  )}
                </div>
                <div className="file-buttons">
                  <Button secondary onClick={() => inspect(c.code)}>
                    Open dossier <ArrowUpRight size={16} />
                  </Button>
                  {PLAYABLE_INVESTIGATORS.includes(c.code) && (
                    <Button onClick={onStart}>Play</Button>
                  )}
                </div>
              </div>
            </article>
          ))}
      </div>
    </div>
  );
}
