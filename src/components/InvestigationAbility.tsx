import { useId, useState } from "react";
import { availableConnections, canAct } from "../game/engine";
import { card } from "../game/data";
import type { Action, Asset, GameState } from "../game/types";
import "../investigation-ability.css";

export const INVESTIGATION_ABILITIES: Record<
  string,
  {
    cost: string;
    effect: string;
    counter?: string;
  }
> = {
  "12031": {
    cost: "1 action · 1 supply · exhaust this card",
    effect: "+1 intellect. On success, discover 1 additional clue.",
    counter: "supplies",
  },
  "12033": {
    cost: "1 action · 1 secret",
    effect:
      "+1 intellect at a revealed connecting location. On success, you may exhaust this card to move there.",
    counter: "secrets",
  },
  "12049": {
    cost: "1 action · 1 supply",
    effect: "Choose intellect or agility. On success, gain 1 resource.",
    counter: "supplies",
  },
  "12088": {
    cost: "1 action",
    effect:
      "+1 intellect. On success, you may discard this card to lower this location’s shroud by 1 this round.",
  },
};

export function investigationAbilityStatus(asset: Asset) {
  const ability = INVESTIGATION_ABILITIES[asset.code];
  if (!ability) return "";
  return `${asset.exhausted ? "Exhausted" : "Ready"}${ability.counter ? ` · ${asset.uses} ${ability.counter} left` : ""}`;
}

/** The instance ID comes only from a card in the active investigator's play area. */
export function InvestigationAbility({
  game: s,
  assetId,
  onActivate,
  onDismiss,
}: {
  game: GameState;
  assetId: string;
  onActivate: (action: Action) => void;
  onDismiss: () => void;
}) {
  const [selectedTarget, setSelectedTarget] = useState("");
  const id = useId();
  const asset = s.player.assets.find((a) => a.id === assetId);
  const ability = asset && INVESTIGATION_ABILITIES[asset.code];
  if (!asset || !ability) return null;
  const targets = availableConnections(s).filter((code) =>
    s.locations.some((l) => l.code === code && l.active && l.revealed),
  );
  const target =
    asset.code === "12033"
      ? targets.includes(selectedTarget)
        ? selectedTarget
        : targets[0]
      : s.player.location;
  const reason =
    asset.code === "12033" && !target
      ? "No revealed connecting location is available."
      : canAct(s, "investigate", target, asset.id);
  return (
    <section
      className="investigation-ability"
      aria-label={`${card(asset.code).name} ability`}
    >
      <div className={`ability-status ${reason ? "unavailable" : "ready"}`}>
        <span className="ability-status-dot" aria-hidden="true" />
        {investigationAbilityStatus(asset)}
      </div>
      <strong className="ability-question">
        Use this ability to investigate?
      </strong>
      <p className="ability-cost">{ability.cost}</p>
      <p className="ability-effect">{ability.effect}</p>
      {asset.code === "12033" && targets.length > 0 && (
        <label className="ability-target">
          Investigate at
          <select
            value={target}
            onChange={(e) => setSelectedTarget(e.target.value)}
          >
            {targets.map((code) => (
              <option key={code} value={code}>
                {card(code).name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p id={id} className="ability-note">
        {reason || "Nothing is spent until you choose Use ability."}
      </p>
      <div className="ability-choices">
        <button
          className="ability-use"
          disabled={!!reason}
          aria-describedby={id}
          onClick={() =>
            onActivate({
              type: "act",
              kind: "investigate",
              target,
              source: asset.id,
            })
          }
        >
          Use ability · Investigate
        </button>
        <button className="ability-pass" onClick={onDismiss}>
          Don’t use now
        </button>
      </div>
    </section>
  );
}
