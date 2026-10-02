// A private note is sent only for the current native Vent checkpoint.
const record = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
function attrs(value) {
  let result = record(value);
  for (let n = 0; n < 5 && result.contents && !Array.isArray(result.contents); n++) result = record(result.contents);
  return result;
}
export function companionVentNoteAnswer(snapshot, input) {
  const game = record(snapshot.game);
  if (typeof input?.text !== 'string' || input.text.length > 4000 || typeof input.playerId !== 'string') throw new Error('Write a note of up to 4000 characters.');
  if (input.playerId !== snapshot.playerId || input.questionVersion !== game.scenarioSteps) throw new Error('The investigator decision has changed. Refresh the table.');
  let question = record(record(game.question)[input.playerId]);
  for (let n = 0; n < 8 && ['QuestionLabel', 'PayCostQuestion', 'QuestionWithSource'].includes(question.tag); n++) question = record(question.question);
  const parts = Array.isArray(question.contents) ? question.contents : [];
  const payload = record(parts[1]);
  if (question.tag !== 'PickScenarioSpecific' || parts[0] !== 'epicLabyrinth.note' || payload.story !== input.storyId || payload.investigator !== input.investigatorId) throw new Error('This investigator is not being asked to write that Vent note.');
  const entities = record(game.entities);
  const investigator = attrs(record(game.investigators ?? entities.investigators)[input.investigatorId]);
  const story = attrs(record(game.stories ?? entities.stories)[input.storyId]);
  if (investigator.playerId !== input.playerId || String(story.cardCode || '').replace(/^c/, '') !== '70035') throw new Error('Choose the Vent and investigator belonging to this table.');
  return { tag: 'ScenarioSpecificAnswer', contents: ['epicLabyrinth.note', [input.storyId, input.investigatorId, input.text]] };
}
