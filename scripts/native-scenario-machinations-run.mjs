/** Genuine fresh three-era Machinations play, through owned native questions.
 * No debug/native/coordinator messages, scenario edits or RNG/clock writes.
 * Partial/unsupported/loss runs remain false, with every owned seat retained. */
import assert from "node:assert/strict";
import { epicReadResolution } from "./native-scenario-playthrough-policy.mjs";
import {
  selectMachinationsChoice,
  observeMachinationsChoice,
} from "./native-scenario-machinations-policy.mjs";

const groups = ["Past", "Present", "Future"];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const stateOf = (current) =>
  current.game.scenario ||
  current.game.mode?.That ||
  current.game.mode?.These?.[1];
const rows = (value) =>
  Array.isArray(value)
    ? value.map((row) => (Array.isArray(row) ? row[1] : row))
    : Object.values(value || {});
const setupComplete = (current) =>
  current.game.gameState?.tag === "IsActive" &&
  current.game.phase === "InvestigationPhase" &&
  current.game.inSetup === false &&
  stateOf(current)?.started === true;
const onlyWaiting = (question) =>
  question?.choices?.length === 1 &&
  /Waiting (for|to)|Waiting.*group/i.test(question.choices[0].label);

/** Read only the actual offered Read payload. Exact native resolution keys
 * distinguish winning R1 from rewarded losses and unrelated prose. */
export function machinationsReadResolution(question) {
  return epicReadResolution(question, "machinations");
}

function ownedQuestion(current, question) {
  if (!question) return;
  assert.equal(
    question.playerId,
    current.playerId,
    "A Machinations answer must belong to the requesting native seat.",
  );
  // During ChooseDeck the investigator has not yet been created.
  if (question.kind !== "deck")
    assert.ok(
      rows(current.game.investigators).some(
        (i) => i.playerId === current.playerId,
      ),
      "A real local investigator is required for this offered native question.",
    );
}

function selectionFor(io, participant, current, question, setup) {
  ownedQuestion(current, question);
  const selected = selectMachinationsChoice({
    snapshot: current,
    question,
    cards: io.cards,
    memory: io.memories.get(participant.gameId),
  });
  if (selected) return selected;
  // Shared conventional encounter ordering/penalties remain available. Do not
  // let its sole-choice fallback manufacture an unknown scenario ability,
  // scientist rescue, skill selection or arbitrary physical target.
  const choices = question?.choices || [];
  if (
    choices.some((c) =>
      [
        "AbilityLabel",
        "SkillLabel",
        "SkillLabelWithLabel",
        "CardLabel",
      ].includes(c.tag),
    )
  )
    return undefined;
  if (!setup && ["ChooseSome", "ChooseSome1"].includes(question?.tag))
    return undefined;
  return io.conventionalChoice?.(current, question, setup);
}

export async function playFreshMachinations(io) {
  const {
    proof,
    participants,
    memories,
    protocol,
    request,
    snapshot,
    questionFor,
    respond,
    saveSnapshot,
    checkpoint,
    pathFor,
    createNativeScenarioDeck,
    cards,
    maxAnswers,
    maxMinutes,
    setupOnly,
  } = io;
  proof.wholeScenarioCompleted = false;
  if (!io.resuming) {
    const name = `Legal Machinations ${new Date().toISOString()}`;
    const event = await request("/chronicle/epic/events", {
      name,
      scenarioId: "87001",
      difficulty: "Standard",
      groups: groups.map((group) => ({
        name: `${name} ${group}`,
        playerCount: 1,
      })),
    });
    assert.match(event.id, uuid);
    const seats = [...event.localSeats].sort((a, b) => a.ordinal - b.ordinal);
    assert.deepEqual(
      seats.map((seat) => seat.ordinal),
      [0, 1, 2],
    );
    assert.equal(new Set(seats.map((seat) => seat.gameId)).size, 3);
    assert.equal(new Set(seats.map((seat) => seat.id)).size, 3);
    proof.events = [
      { id: event.id, scenarioId: "87001", difficulty: "Standard" },
    ];
    for (const seat of seats) {
      assert.match(seat.id, uuid);
      assert.match(seat.gameId, uuid);
      assert.equal(seat.seatIndex, 0);
      const participant = {
        ...seat,
        eventId: event.id,
        investigatorCode: "01001",
        group: groups[seat.ordinal],
      };
      participants.push(participant);
      proof.games.push(participant);
      memories.set(seat.gameId, {
        group: participant.group,
        gameId: seat.gameId,
      });
      const built = createNativeScenarioDeck(
        "roland",
        cards,
        `${name} ${participant.group}`,
      );
      proof.decks.push(built);
      const prepared = await request(`/chronicle/epic/seats/${seat.id}`, {
        deckName: built.deck.name,
        deckList: built.deck,
      });
      assert.match(prepared.deckId, uuid);
      participant.deckId = prepared.deckId;
    }
    await checkpoint();
  }
  assert.deepEqual(
    participants.map((p) => p.group),
    groups,
  );
  assert.deepEqual(
    participants.map((p) => p.ordinal),
    [0, 1, 2],
  );
  for (const p of participants)
    assert.equal(memories.get(p.gameId)?.group, p.group);

  const ready = new Set(
    participants.filter((p) => p.setupCompleted).map((p) => p.gameId),
  );
  for (let pass = 0; pass < 180 && ready.size < 3; pass++) {
    let answered = false;
    for (const participant of participants) {
      if (ready.has(participant.gameId)) continue;
      const current = await snapshot(participant),
        question = questionFor(current);
      ownedQuestion(current, question);
      if (setupComplete(current)) {
        participant.setupCompleted = true;
        await request(pathFor(participant, "ready"), {});
        const after = await snapshot(participant);
        assert.deepEqual(
          after.game.question,
          current.game.question,
          "Native Ready must preserve the actual open question.",
        );
        proof.milestones.push({
          name: "native-setup-ready-question-preserved",
          group: participant.group,
          snapshot: await saveSnapshot(participant, after, "setup-ready"),
        });
        ready.add(participant.gameId);
        answered = true;
        continue;
      }
      assert.ok(
        question,
        "Unfinished Machinations setup must offer a real native question.",
      );
      if (onlyWaiting(question)) continue;
      let reply, selected;
      if (question.kind === "deck")
        reply = protocol.buildDeckAnswer(question, participant.deckId);
      else if (question.kind === "settings")
        reply = protocol.buildSettingsAnswer(
          question,
          protocol.standaloneSettingsForAnswer(
            question.settings,
            protocol.standaloneSettingsState(question.settings),
          ),
        );
      else {
        selected = selectionFor(io, participant, current, question, true);
        if (!selected?.choice)
          return stop(
            io,
            participant,
            current,
            question,
            "Unsupported actual Machinations setup decision.",
          );
        reply = protocol.buildChoiceAnswer(
          question,
          selected.choice.answerIndex,
        );
      }
      await respond(
        participant,
        current,
        question,
        reply,
        selected?.reason ||
          "Use the newly validated legal deck and actual default printed standalone settings.",
        selected?.choice,
      );
      if (selected)
        memories.set(
          participant.gameId,
          observeMachinationsChoice({
            snapshot: current,
            question,
            selection: selected,
            memory: memories.get(participant.gameId),
          }),
        );
      answered = true;
      await checkpoint();
    }
    if (!answered)
      for (const participant of participants)
        if (!ready.has(participant.gameId)) {
          const current = await snapshot(participant),
            question = questionFor(current);
          ownedQuestion(current, question);
          if (onlyWaiting(question)) {
            await respond(
              participant,
              current,
              question,
              protocol.buildChoiceAnswer(
                question,
                question.choices[0].answerIndex,
              ),
              "Poll only the actual offered setup waiting question after other native eras progressed.",
              question.choices[0],
            );
            answered = true;
          }
        }
    assert.ok(
      answered,
      "All unfinished native eras are waiting without an audited continuation.",
    );
  }
  assert.equal(ready.size, 3);
  const readyStatus = await request(pathFor(participants[0], "ready"));
  assert.equal(readyStatus.readyMask, 7);
  assert.ok(readyStatus.timerStartedAt > 0);
  proof.milestones.push({ name: "all-three-native-Ready", ready: readyStatus });
  if (setupOnly) {
    proof.prepared = true;
    proof.acceptance =
      "Fresh three-era legal setup only; whole playthrough not run.";
    return;
  }

  const deadline = Date.now() + maxMinutes * 60000;
  const winningReads = new Set(proof.validatedWinningReadGameIds || []),
    ended = new Set(),
    waitHashes = new Map();
  assert.ok(
    [...winningReads].every((id) => participants.some((p) => p.gameId === id)),
  );
  let actionEpoch = 0,
    answers = 0;
  for (
    let pass = 0;
    answers < maxAnswers && pass < maxAnswers && Date.now() < deadline;
    pass++
  ) {
    let advanced = false;
    // Eras have independent rounds. No artificial common-stage/round barrier
    // is inserted; each owned decision is read again after cross-era effects.
    for (const participant of participants) {
      const current = await snapshot(participant),
        question = questionFor(current);
      ownedQuestion(current, question);
      const resolution = machinationsReadResolution(question);
      if (resolution !== undefined) {
        if (
          !proof.milestones.some(
            (m) =>
              m.name === "native-printed-Machinations-resolution" &&
              m.group === participant.group,
          )
        )
          proof.milestones.push({
            name: "native-printed-Machinations-resolution",
            group: participant.group,
            resolution,
            snapshot: await saveSnapshot(
              participant,
              current,
              "printed-resolution",
            ),
          });
        if (resolution === 1 && !winningReads.has(participant.gameId)) {
          proof.milestones.push({
            name: "native-printed-Machinations-R1",
            group: participant.group,
            snapshot: await saveSnapshot(
              participant,
              current,
              "winning-resolution",
            ),
          });
          winningReads.add(participant.gameId);
        }
      }
      if (current.game.gameState?.tag === "IsOver") {
        if (!ended.has(participant.gameId))
          proof.milestones.push({
            name: "native-IsOver",
            group: participant.group,
            winningRead: winningReads.has(participant.gameId),
            snapshot: await saveSnapshot(participant, current, "over"),
          });
        assert.ok(
          winningReads.has(participant.gameId),
          "Only a genuine printed native Machinations R1 followed by IsOver qualifies; rewarded R2/R4 are losses.",
        );
        ended.add(participant.gameId);
        continue;
      }
      if (!question) continue;
      const hash = JSON.stringify([
        current.game.question,
        question.questionVersion,
        actionEpoch,
      ]);
      if (onlyWaiting(question) && waitHashes.get(participant.gameId) === hash)
        continue;
      const selected = selectionFor(io, participant, current, question, false);
      if (!selected?.choice)
        return stop(
          io,
          participant,
          current,
          question,
          "Unsupported actual legal Machinations decision.",
        );
      if (answers >= maxAnswers)
        throw new Error(
          "Legal Machinations play reached its finite offered-answer bound.",
        );
      await respond(
        participant,
        current,
        question,
        protocol.buildChoiceAnswer(question, selected.choice.answerIndex),
        selected.reason,
        selected.choice,
      );
      memories.set(
        participant.gameId,
        observeMachinationsChoice({
          snapshot: current,
          question,
          selection: selected,
          memory: memories.get(participant.gameId),
        }),
      );
      if (onlyWaiting(question)) waitHashes.set(participant.gameId, hash);
      else {
        waitHashes.delete(participant.gameId);
        actionEpoch++;
      }
      answers++;
      advanced = true;
      await checkpoint();
    }
    if (ended.size === 3) {
      assert.equal(winningReads.size, 3);
      proof.wholeScenarioCompleted = true;
      proof.winningResolution = 1;
      proof.milestones.push({ name: "all-three-native-IsOver-R1" });
      return;
    }
    assert.ok(
      advanced,
      "All actual Machinations eras are waiting without an audited native continuation.",
    );
  }
  throw new Error(
    "Legal Machinations play reached its finite action/wall-time bound; no whole-scenario claim.",
  );
}

async function stop(io, participant, current, question, message) {
  io.proof.unsupportedDecision = {
    gameId: participant.gameId,
    group: participant.group,
    tag: question?.tag,
    labels: question?.choices?.map((c) => c.label),
    snapshot: await io.saveSnapshot(participant, current, "unsupported-policy"),
  };
  await io.checkpoint();
  throw new Error(
    `${message} ${question?.tag}: ${question?.choices?.map((c) => c.label).join(" | ")}`,
  );
}
