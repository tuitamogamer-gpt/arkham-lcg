import test from 'node:test';
import assert from 'node:assert/strict';
import { companionVentNoteAnswer } from '../scripts/companion-note.mjs';
const input = {playerId:'player',questionVersion:17,storyId:'vent',investigatorId:'investigator',text:'A private note\nwith "quotes"'};
const snapshot = {playerId:'player',game:{scenarioSteps:17,question:{player:{tag:'QuestionWithSource',question:{tag:'PickScenarioSpecific',contents:['epicLabyrinth.note',{story:'vent',investigator:'investigator'}]}}},investigators:{investigator:{playerId:'player'}},stories:{vent:{tag:'Story',contents:{cardCode:'c70035'}}}}};
test('a Vent note reaches the typed native checkpoint with its exact text', () => {
  assert.deepEqual(companionVentNoteAnswer(snapshot,input),{tag:'ScenarioSpecificAnswer',contents:['epicLabyrinth.note',['vent','investigator',input.text]]});
});
test('stale, foreign and unrelated decisions cannot write a Vent note', () => {
  for(const mutation of [{playerId:'other'},{questionVersion:16},{storyId:'other'},{investigatorId:'other'},{text:'x'.repeat(4001)}]) assert.throws(()=>companionVentNoteAnswer(snapshot,{...input,...mutation}));
  assert.throws(()=>companionVentNoteAnswer({...snapshot,game:{...snapshot.game,stories:{vent:{cardCode:'70036'}}}},input));
  assert.throws(()=>companionVentNoteAnswer({...snapshot,game:{...snapshot.game,investigators:{investigator:{playerId:'other'}}}},input));
});
