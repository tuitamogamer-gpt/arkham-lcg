const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

// Investigation starts with phase-begin/fast windows, before PlayerWindow.
// Those windows must remain unanswered until the shared start timer begins.
export function nativeEpicSetupComplete(snapshot) {
  const game = record(record(snapshot).game ?? snapshot), mode = record(game.mode);
  const scenario = record(game.scenario ?? mode.That ?? (Array.isArray(mode.These) ? mode.These[1] : undefined));
  return record(game.gameState).tag === "IsActive" && scenario.started === true
    && game.phase === "InvestigationPhase" && game.inSetup === false;
}

export function requireEpicReadySeat(seat, gameId) {
  if (!seat || seat.gameId !== gameId || typeof seat.eventId !== "string"
    || !Number.isInteger(seat.ordinal) || seat.ordinal < 0 || seat.ordinal > 2) {
    throw Object.assign(new Error("This Epic seat belongs to another investigation."), { status: 403 });
  }
  return seat;
}

export function epicReadyStatus(event, seat) {
  const groups = Array.isArray(event?.groups) ? event.groups : [];
  if (event?.id !== seat.eventId || groups.length !== 3
    || !groups.some((group) => group.ordinal === seat.ordinal && group.gameId === seat.gameId)) {
    throw Object.assign(new Error("This seat is not a member of the three-group Epic event."), { status: 403 });
  }
  const counters = record(record(event.sharedState).sharedCounters);
  const readyMask = Number(counters["groups-ready-mask"] || 0);
  const timerStartedAt = Number(counters["timer-started-at"] || 0);
  const requiredMask = 7;
  return {
    eventId: event.id,
    readyMask,
    requiredMask,
    timerStartedAt,
    groupReady: (readyMask & (1 << seat.ordinal)) !== 0,
    ready: (readyMask & requiredMask) === requiredMask && timerStartedAt > 0,
  };
}

// The caller supplies an engine function already authenticated for this exact
// persisted seat. The client never supplies an event id or native credentials.
export async function companionEpicReady(seat, gameId, method, engine) {
  requireEpicReadySeat(seat, gameId);
  if (!["GET", "POST"].includes(method)) {
    throw Object.assign(new Error("Use the Epic readiness read or mark operation."), { status: 405 });
  }
  let event = await engine(`arkham/events/${seat.eventId}`, undefined, "GET");
  let status = epicReadyStatus(event, seat);
  if (method === "POST" && !status.groupReady) {
    const snapshot = await engine(`arkham/games/${gameId}`, undefined, "GET");
    if (!nativeEpicSetupComplete(snapshot)) {
      throw Object.assign(new Error("Finish this group's native setup before marking it ready."), { status: 409 });
    }
    await engine(`arkham/events/${seat.eventId}/ready`, {}, "POST");
    event = await engine(`arkham/events/${seat.eventId}`, undefined, "GET");
    status = epicReadyStatus(event, seat);
  }
  return status;
}
