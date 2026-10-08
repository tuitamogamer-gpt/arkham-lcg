import { useEffect, useState } from "react";
import { Button } from "./Common";
import {
  createCompanionGame, getCompanionPlayOptions, listCompanionGames,
  type CompanionPlayOptions, type CompanionSession,
} from "../game/rulesServer";

type SavedInvestigation = { id: string; name: string; updatedAt?: string };
export function CompanionSetup({ mode, onOpen }: {
  mode: "new" | "saved";
  onOpen: (session: CompanionSession) => void;
}) {
  const [options, setOptions] = useState<CompanionPlayOptions | null>(null);
  const [saved, setSaved] = useState<SavedInvestigation[]>([]);
  const [kind, setKind] = useState("campaign");
  const [selected, setSelected] = useState("01");
  const [difficulty, setDifficulty] = useState("Standard");
  const [count, setCount] = useState(1);
  const [variant, setVariant] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true); setError("");
    (mode === "new" ? getCompanionPlayOptions() : listCompanionGames()).then(result => {
      if (!active) return;
      if (mode === "new") setOptions(result as CompanionPlayOptions);
      else setSaved((result as unknown[]).flatMap(item => {
        if (!item || typeof item !== "object") return [];
        const game = item as Record<string, unknown>;
        return typeof game.id === "string" && typeof game.name === "string"
          ? [{ id: game.id, name: game.name, ...(typeof game.updatedAt === "string" ? { updatedAt: game.updatedAt } : {}) }] : [];
      }));
    }).catch(e => active && setError(e.message)).finally(() => active && setBusy(false));
    return () => { active = false; };
  }, [mode]);
  const campaigns = options?.campaigns.flatMap(c => [c, ...(c.returnTo ? [{ id: c.returnTo.id, name: `Return to ${c.name.replace(/^The /, "the ")}`, ...(c.returnTo.beta ? {beta: true as const} : {}), ...(c.returnTo.alpha ? {alpha: true as const} : {}) }] : [])]) || [];
  const entries = kind === "campaign" ? campaigns : options?.scenarios || [];
  const optionKey = (entry: {id:string;variant?:string}) => entry.variant ? `${entry.id}:${entry.variant}` : entry.id;
  const developmentLabel = (entry: {beta?: true; alpha?: true}) => entry.alpha ? "Alpha" : entry.beta ? "Beta" : "";
  const chosen = entries.find(entry => optionKey(entry) === selected);
  const scenario = kind === "scenario" ? options?.scenarios.find(entry => optionKey(entry) === selected) : undefined;
  const campaign = kind === "campaign" ? campaigns.find(entry => entry.id === selected) : undefined;
  const levels = kind === "scenario" ? scenario?.standaloneDifficulties || ["Easy", "Standard", "Hard", "Expert"] : ["Easy", "Standard", "Hard", "Expert"];
  const create = async () => {
    setBusy(true); setError("");
    try {
      const game = await createCompanionGame({
        name: name.trim() || chosen?.name || "New investigation",
        ...(kind === "campaign" ? { campaignId: chosen!.id, ...(campaign?.variants ? {variant: variant || campaign.variants[0].key} : {}) } : { scenarioId: chosen!.id, ...(scenario?.variant ? {variant:scenario.variant} : {}) }),
        difficulty, playerCount: count,
      });
      onOpen({ gameId: game.id });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start the investigation."); }
    finally { setBusy(false); }
  };
  return <section className="chronicle-companion-setup">
    <div className="eyebrow">Your investigations</div>
    <h2>{mode === "new" ? "Begin an investigation" : "Saved investigations"}</h2>
    {error && <p className="rules-error" role="alert">{error}</p>}
    {busy && <p role="status">Loading…</p>}
    {mode === "saved" ? <div className="chronicle-saved-investigations">
      {!busy && !saved.length && <p>No saved investigations yet.</p>}
      {saved.map(game => <article key={game.id}>
        <h3>{game.name}</h3>
        {game.updatedAt && <p>Last played {new Date(game.updatedAt).toLocaleDateString()}</p>}
        <Button onClick={() => onOpen({ gameId: game.id })}>Resume investigation</Button>
      </article>)}
    </div> : options && <div className="rules-form">
      <label>Play mode<select value={kind} onChange={e => {
        const value = e.target.value; setKind(value); setName(""); setVariant("");
        setSelected(value === "campaign" ? campaigns[0].id : optionKey(options.scenarios[0]));
        setDifficulty("Standard");
      }}><option value="campaign">Campaign</option><option value="scenario">Standalone scenario</option></select></label>
      <label>{kind === "campaign" ? "Campaign" : "Scenario"}<select aria-label={kind === "campaign" ? "Campaign" : "Scenario"} value={selected} onChange={e => {
        const id = e.target.value; setSelected(id); setName(""); setVariant("");
        const permitted = options.scenarios.find(s => optionKey(s) === id)?.standaloneDifficulties;
        if (kind === "scenario" && permitted && !permitted.includes(difficulty)) setDifficulty(permitted[0]);
      }}>{entries.map(entry => <option key={optionKey(entry)} value={optionKey(entry)}>{entry.name}{developmentLabel(entry) ? ` · ${developmentLabel(entry)}` : ""}</option>)}</select></label>
      {chosen && developmentLabel(chosen) && <p className="rules-note">{developmentLabel(chosen)}: this {kind === "campaign" ? "campaign" : "scenario"} is experimental in the rules engine. Some rules and interactions remain unfinished.</p>}
      {campaign?.variants && <label>Campaign path<select value={variant || campaign.variants[0].key} onChange={e => setVariant(e.target.value)}>{campaign.variants.map(v=><option key={v.key} value={v.key}>{({theDreamEaters:"The Dream-Eaters · both campaigns",theDreamQuest:"The Dream-Quest",theWebOfDreams:"The Web of Dreams"} as Record<string,string>)[v.key] || v.key}</option>)}</select></label>}
      <label>Difficulty<select value={difficulty} onChange={e => setDifficulty(e.target.value)}>{levels.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Investigators<select value={count} onChange={e => setCount(Number(e.target.value))}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Investigation name<input value={name} maxLength={120} placeholder={chosen?.name} onChange={e => setName(e.target.value)} /></label>
      <p className="rules-note">Choose each investigator's deck at the next checkpoint. Campaign progress and decisions are saved automatically.</p>
      <Button disabled={busy || !chosen} onClick={() => void create()}>Begin investigation</Button>
    </div>}
  </section>;
}
