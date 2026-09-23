import { useState } from "react";
import {
  MagnifyingGlass,
  ArrowUpRight,
  LockKey,
  CheckCircle,
} from "@phosphor-icons/react";
import { cards, investigators, plain } from "../game/data";
import { CardFace, SkillStats, Button } from "./Common";
export function Archive({ inspect }: { inspect: (c: string) => void }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [faction, setFaction] = useState("all");
  const list = cards.filter(
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
          <p>Every lead, every ally, every unspeakable thing.</p>
        </div>
        <span className="edition-tag">
          CORE SET 2026 <span>196 cards</span>
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
          {[...new Set(cards.map((c) => c.type_code))].map((t) => (
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
          {[...new Set(cards.map((c) => c.faction_code))].map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="archive-count">
        {list.length} cards found{" "}
        <span>ArkhamDB data · includes encounter cards and 2026 errata</span>
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
        The archive contains the complete set. Inclusion in the archive does not
        mean a card’s effects are scripted for play.
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
              {c.code === "12004" ? (
                <div className="dossier-portrait" />
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
                  {c.code === "12004" ? (
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
                  {c.code === "12004" && (
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
