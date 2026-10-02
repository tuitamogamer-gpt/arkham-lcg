import { useEffect, useState } from "react";
import { catalog } from "../game/catalog";
import {
  createEpicEvent,
  getEpicEvent,
  listEpicEvents,
  prepareEpicSeat,
  starterServerDeck,
  type EpicEvent,
  type EpicSeat,
  type RulesServerStatus,
  type ServerDeck,
  type CompanionSession,
} from "../game/rulesServer";
import { Button } from "./Common";

export function EpicLobby({
  status,
  deck,
  deckValid,
  onOpen,
}: {
  status: RulesServerStatus;
  deck: ServerDeck;
  deckValid: boolean;
  onOpen: (session: CompanionSession) => void;
}) {
  const [scenarioId, setScenarioId] = useState<"70001" | "87001">("70001");
  const [difficulty, setDifficulty] = useState<
    "Easy" | "Standard" | "Hard" | "Expert"
  >("Standard");
  const [name, setName] = useState("The Labyrinths of Lunacy");
  const [counts, setCounts] = useState([1, 1, 1]);
  const [eraDifficulties, setEraDifficulties] = useState([
    "Standard", "Standard", "Standard",
  ]);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [event, setEvent] = useState<EpicEvent | null>(null);
  const [selectedDecks, setSelectedDecks] = useState<Record<string, string>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const labels =
    scenarioId === "70001"
      ? ["Group A", "Group B", "Group C"]
      : ["Past", "Present", "Future"];
  const implemented = status.extensions?.includes(
    scenarioId === "70001" ? "epic-labyrinth" : "epic-machinations",
  );
  useEffect(() => {
    void listEpicEvents()
      .then(setEvents)
      .catch((e) => setError(e.message));
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not open the Epic event.",
      );
    } finally {
      setBusy(false);
    }
  };
  const openSeat = (seat: EpicSeat) =>
    void run(async () => {
      if (!seat.deckId) {
        const choice = selectedDecks[seat.id] || catalog.starterDecks[0].id;
        const selected =
          choice === "current"
            ? deck
            : starterServerDeck(
                catalog.starterDecks.find((d) => d.id === choice)!,
              );
        if (choice === "current" && !deckValid)
          throw new Error("Fix the selected deck before adding it to a group.");
        await prepareEpicSeat(seat.id, selected);
        setEvent(await getEpicEvent(event!.id));
      }
      onOpen({ gameId: seat.gameId, seatId: seat.id });
    });
  return (
    <section className="epic-lobby" aria-label="Epic multiplayer groups">
      <div className="eyebrow">One event · three tables</div>
      <h2>Epic multiplayer</h2>
      <p>
        Each group has its own hand, chaos bag and decisions. Shared rules
        connect the three tables. Choose a seat to play it; its progress is
        saved with the event.
      </p>
      <div className="epic-event-selector">
        <label>
          Saved Epic event
          <select
            value={event?.id || ""}
            disabled={busy}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) setEvent(null);
              else void run(async () => setEvent(await getEpicEvent(id)));
            }}
          >
            <option value="">Create a new event</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!event ? (
        <div className="epic-create">
          <label>
            Scenario
            <select
              value={scenarioId}
              onChange={(e) => {
                const id = e.target.value as "70001" | "87001";
                setScenarioId(id);
                setDifficulty("Standard");
                setEraDifficulties(["Standard", "Standard", "Standard"]);
                setName(
                  id === "70001"
                    ? "The Labyrinths of Lunacy"
                    : "Machinations Through Time",
                );
              }}
            >
              <option value="70001">The Labyrinths of Lunacy</option>
              <option value="87001">Machinations Through Time</option>
            </select>
          </label>
          <label>
            Event name
            <input
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Difficulty
            <select
              value={difficulty}
              onChange={(e) =>
                setDifficulty(e.target.value as typeof difficulty)
              }
            >
              {(scenarioId === "70001"
                ? ["Standard", "Hard"]
                : ["Easy", "Standard", "Hard", "Expert"]
              ).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <div className="epic-group-counts">
            {labels.map((label, index) => (
              <label key={label}>
                {label}
                <select
                  aria-label={`${label} investigators`}
                  value={counts[index]}
                  onChange={(e) =>
                    setCounts((old) =>
                      old.map((count, i) =>
                        i === index ? Number(e.target.value) : count,
                      ),
                    )
                  }
                >
                  {[1, 2, 3, 4].map((count) => (
                    <option key={count} value={count}>
                      {count} investigator{count === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
                {scenarioId === "87001" && (
                  <select
                    aria-label={`${label} difficulty`}
                    value={eraDifficulties[index]}
                    onChange={(e) => setEraDifficulties((old) => old.map(
                      (value, i) => i === index ? e.target.value : value,
                    ))}
                  >
                    {["Easy", "Standard", "Hard", "Expert"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                )}
              </label>
            ))}
          </div>
          <p className="rules-note">
            {scenarioId === "70001"
              ? "Groups finish rounds together. Each act has a 60-minute limit."
              : "The three eras advance independently. The event has a 180-minute limit."}
          </p>
          {!implemented && (
            <p className="rules-error">
              The connected engine does not implement this Epic scenario yet.
            </p>
          )}
          <Button
            disabled={busy || !implemented || !name.trim()}
            onClick={() =>
              void run(async () => {
                const created = await createEpicEvent({
                  name,
                  scenarioId,
                  difficulty,
                  groups: labels.map((label, i) => ({
                    name: label,
                    playerCount: counts[i],
                    ...(scenarioId === "87001" ? { groupDifficulty: eraDifficulties[i] } : {}),
                  })),
                });
                setEvent(created);
                setEvents(await listEpicEvents());
              })
            }
          >
            {busy ? "Creating tables…" : "Create three group tables"}
          </Button>
        </div>
      ) : (
        <div className="epic-groups">
          <h3>{event.name}</h3>
          <p>{event.totalInvestigators} investigators across three groups</p>
          {event.groups.map((group) => (
            <article key={group.ordinal}>
              <h3>{group.name}</h3>
              <p>
                {group.investigatorCount} / {group.seatCount} investigators
                ready
              </p>
              {event.localSeats
                .filter((seat) => seat.ordinal === group.ordinal)
                .map((seat) => (
                  <div className="epic-seat" key={seat.id}>
                    {!seat.deckId && (
                      <label>
                        Seat {seat.seatIndex + 1} deck
                        <select
                          value={
                            selectedDecks[seat.id] || catalog.starterDecks[0].id
                          }
                          onChange={(e) =>
                            setSelectedDecks((old) => ({
                              ...old,
                              [seat.id]: e.target.value,
                            }))
                          }
                        >
                          {deckValid &&
                            !deck.investigator_code.startsWith("barkham-") && (
                              <option value="current">
                                Selected deck: {deck.name}
                              </option>
                            )}
                          {catalog.starterDecks.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <Button
                      secondary
                      disabled={busy}
                      onClick={() => openSeat(seat)}
                    >
                      {seat.deckId
                        ? `Resume seat ${seat.seatIndex + 1}`
                        : `Prepare seat ${seat.seatIndex + 1}`}
                    </Button>
                  </div>
                ))}
            </article>
          ))}
          <Button
            secondary
            disabled={busy}
            onClick={() =>
              void run(async () => setEvent(await getEpicEvent(event.id)))
            }
          >
            Refresh group progress
          </Button>
        </div>
      )}
      {error && (
        <p className="rules-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
