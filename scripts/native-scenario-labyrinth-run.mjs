/** Fresh, actual three-seat Labyrinth play. The runner supplies only owned
 * authenticated HTTP callbacks; this module never submits native messages. */
import assert from "node:assert/strict";
import {
  selectLabyrinthChoice,
  observeLabyrinthChoice,
  labyrinthProgress,
  labyrinthRiftKnowledge,
} from "./native-scenario-labyrinth-policy.mjs";

const groups = ["GroupA", "GroupB", "GroupC"];
const uuid = /^[a-f0-9-]{36}$/;
const stateOf = (current) => current.game.scenario || current.game.mode?.That || current.game.mode?.These?.[1];
const completedSetup = (current) => current.game.gameState?.tag === "IsActive"
  && current.game.phase === "InvestigationPhase" && current.game.inSetup === false
  && stateOf(current)?.started === true;
const onlyWaiting = (question) => question?.choices?.length === 1
  && /Waiting (for|to)|Waiting.*group/i.test(question.choices[0].label);

export async function playFreshLabyrinth(io) {
  const {
    proof, participants, memories, cards, protocol, request, snapshot,
    questionFor, respond, saveSnapshot, checkpoint, pathFor,
    createNativeScenarioDeck, maxAnswers, maxMinutes, setupOnly,
  } = io;
  if (!io.resuming) {
  const name = `Legal Labyrinth ${new Date().toISOString()}`;
  const event = await request("/chronicle/epic/events", {
    name, scenarioId: "70001", difficulty: "Standard",
    groups: groups.map((group) => ({name: `${name} ${group}`, playerCount: 1})),
  });
  assert.match(event.id, uuid);
  const seats = event.localSeats.sort((a, b) => a.ordinal - b.ordinal);
  assert.deepEqual(seats.map((s) => s.ordinal), [0, 1, 2]);
  proof.events = [{id: event.id, scenarioId: "70001", difficulty: "Standard"}];
  for (const seat of seats) {
    assert.match(seat.id, uuid);
    assert.match(seat.gameId, uuid);
    const participant = {...seat, eventId: event.id, investigatorCode: "01001", group: groups[seat.ordinal]};
    participants.push(participant);
    proof.games.push(participant);
    memories.set(seat.gameId, {group: participant.group});
    const built = createNativeScenarioDeck("roland", cards, `${name} ${participant.group}`);
    proof.decks.push(built);
    const prepared = await request(`/chronicle/epic/seats/${seat.id}`, {
      deckName: built.deck.name, deckList: built.deck,
    });
    participant.deckId = prepared.deckId;
  }
  await checkpoint();
  }

  // A completed first-Investigation checkpoint is ready even when its real
  // optional fast window remains open. Preserve it until all three are ready.
  const ready = new Set(participants.filter((p) => p.setupCompleted).map((p) => p.gameId));
  for (let round = 0; round < 180 && ready.size < 3; round++) {
    let answered = false;
    for (const participant of participants) {
      if (ready.has(participant.gameId)) continue;
      const current = await snapshot(participant), question = questionFor(current);
      if (completedSetup(current)) {
        participant.setupCompleted = true;
        await request(pathFor(participant, "ready"), {});
        const after = await snapshot(participant);
        assert.deepEqual(after.game.question, current.game.question);
        proof.milestones.push({name: "native-setup-ready-question-preserved", group: participant.group,
          snapshot: await saveSnapshot(participant, after, "setup-ready")});
        ready.add(participant.gameId);
        answered = true;
        continue;
      }
      assert.ok(question, "An unfinished native setup must offer a real question.");
      if (onlyWaiting(question)) continue;
      let reply, selected;
      if (question.kind === "deck") reply = protocol.buildDeckAnswer(question, participant.deckId);
      else if (question.kind === "settings") reply = protocol.buildSettingsAnswer(question,
        protocol.standaloneSettingsForAnswer(question.settings, protocol.standaloneSettingsState(question.settings)));
      else {
        selected = selectLabyrinthChoice({snapshot: current, question, cards,
          memory: memories.get(participant.gameId)}) || io.conventionalChoice(current, question, true);
        if (!selected?.choice) return stop(io, participant, current, question, "Unsupported actual Labyrinth setup choice.");
        reply = protocol.buildChoiceAnswer(question, selected.choice.answerIndex);
      }
      await respond(participant, current, question, reply,
        selected?.reason || "Use the newly validated deck and actual default standalone settings.", selected?.choice);
      if (selected) memories.set(participant.gameId, observeLabyrinthChoice({snapshot: current, question,
        selection: selected, memory: memories.get(participant.gameId)}));
      answered = true;
      await checkpoint();
    }
    if (!answered) {
      // This is the actual offered native wait response, once per setup pass,
      // to receive another group's queued setup receipt; never force its state.
      for (const participant of participants) if (!ready.has(participant.gameId)) {
        const current = await snapshot(participant), question = questionFor(current);
        if (onlyWaiting(question)) {
          await respond(participant, current, question,
            protocol.buildChoiceAnswer(question, question.choices[0].answerIndex),
            "Poll the actual native setup waiting question after the other seats progressed.", question.choices[0]);
          answered = true;
        }
      }
    }
    assert.ok(answered, "Native setup cannot progress through an audited offered question.");
  }
  assert.equal(ready.size, 3, "All three real setup paths must complete.");
  const readyStatus = await request(pathFor(participants[0], "ready"));
  assert.equal(readyStatus.readyMask, 7);
  assert.ok(readyStatus.timerStartedAt > 0);
  proof.milestones.push({name: "all-three-native-Ready", ready: readyStatus});
  if (setupOnly) {
    proof.prepared = true;
    proof.acceptance = "Fresh three-seat legal setup only; whole playthrough not run.";
    return;
  }

  const deadline = Date.now() + maxMinutes * 60000;
  const winningReads = new Set(proof.validatedWinningReadGameIds || []), ended = new Set(), waitHashes = new Map();
  let actionEpoch = 0, playAnswers = 0;
  for (let n = 0; n < maxAnswers && Date.now() < deadline; n++) {
    const frames = await Promise.all(participants.map(async (participant) => {
      const current = await snapshot(participant);
      return {participant, current, question: questionFor(current)};
    }));
    const progress = frames.map(({participant, current}) =>
      labyrinthProgress(current, memories.get(participant.gameId)));
    const commonStage = progress[0].stage;
    const allPrerequisites = commonStage !== undefined
      && progress.every((p) => p.stage === commonStage && p.ready === true);
    const a = frames[0], c = frames[2];
    const conversation = labyrinthRiftKnowledge({aSnapshot: a.current, aQuestion: a.question,
      cSnapshot: c.current, cQuestion: c.question});
    if (conversation) {
      const memory = memories.get(c.participant.gameId);
      if (!memory.secretChamber) {
        memory.secretChamber = conversation;
        proof.milestones.push({name: "printed-Rift-private-conversation", knowledge: conversation,
          participants: [a.participant.gameId, c.participant.gameId]});
      }
    }
    let advanced = false;
    for (const {participant} of frames) {
      // A preceding seat can deliver a real receipt to this table. Read its
      // current question/version immediately before responding.
      const current = await snapshot(participant), question = questionFor(current);
      const memory = memories.get(participant.gameId);
      memory.allowStageAdvance = allPrerequisites;
      if (question?.tag === "Read" && /resolution4|resolution 4/i.test(JSON.stringify(question.raw))) {
        if (!winningReads.has(participant.gameId)) proof.milestones.push({name: "native-printed-Labyrinth-R4",
          group: participant.group, snapshot: await saveSnapshot(participant, current, "winning-resolution")});
        winningReads.add(participant.gameId);
      }
      if (current.game.gameState?.tag === "IsOver") {
        const nativeResolution = stateOf(current)?.meta?.epicLabyrinthResolution;
        if (!ended.has(participant.gameId)) proof.milestones.push({name: "native-IsOver", group: participant.group,
          resolution: nativeResolution, snapshot: await saveSnapshot(participant, current, "over")});
        assert.equal(stateOf(current)?.meta?.epicLabyrinthResolution, 4,
          "Only the actual all-survivor native R4 ending qualifies.");
        if (!ended.has(participant.gameId)) proof.milestones.push({name: "native-IsOver-R4", group: participant.group,
          snapshot: await saveSnapshot(participant, current, "over")});
        ended.add(participant.gameId);
        continue;
      }
      if (!question) continue;
      const hash = JSON.stringify([current.game.question, question.questionVersion, actionEpoch]);
      if (onlyWaiting(question) && waitHashes.get(participant.gameId) === hash) continue;
      const selection = selectLabyrinthChoice({snapshot: current, question, cards, memory})
        || io.conventionalChoice(current, question, false);
      if (!selection) return stop(io, participant, current, question, "Unsupported actual legal Labyrinth decision.");
      if (playAnswers >= maxAnswers) throw new Error("Legal Labyrinth play reached its finite offered-answer bound.");
      if (selection.note !== undefined) {
        await io.respondVentNote(participant, current, question, selection.note, selection.reason);
      } else {
        await respond(participant, current, question,
          protocol.buildChoiceAnswer(question, selection.choice.answerIndex), selection.reason, selection.choice);
      }
      const next = observeLabyrinthChoice({snapshot: current, question, selection, memory});
      memories.set(participant.gameId, next);
      if (next.lastVentSend && next.lastVentSend !== memory.lastVentSend) {
        const recipient = participants.find((p) => p.group === next.lastVentSend.destination);
        assert.ok(recipient, "A real Vent send must name one of the three actual recipients.");
        memories.get(recipient.gameId).expectVentDelivery = true;
      }
      if (onlyWaiting(question)) waitHashes.set(participant.gameId, hash);
      else { waitHashes.delete(participant.gameId); actionEpoch++; }
      playAnswers++;
      advanced = true;
      await checkpoint();
    }
    if (ended.size === 3) {
      assert.equal(winningReads.size, 3);
      proof.wholeScenarioCompleted = true;
      proof.winningResolution = 4;
      proof.milestones.push({name: "all-three-native-IsOver-R4"});
      return;
    }
    assert.ok(advanced, "All actual seats are waiting without an audited native continuation.");
  }
  throw new Error("Legal Labyrinth play reached its finite action/wall-time bound; no whole-scenario claim.");
}

async function stop(io, participant, current, question, message) {
  io.proof.unsupportedDecision = {gameId: participant.gameId, group: participant.group,
    tag: question?.tag, labels: question?.choices?.map((c) => c.label),
    snapshot: await io.saveSnapshot(participant, current, "unsupported-policy")};
  throw new Error(`${message} ${question?.tag}: ${question?.choices?.map((c) => c.label).join(" | ")}`);
}
