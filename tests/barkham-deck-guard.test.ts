import assert from "node:assert/strict";
import test from "node:test";
import { barkhamDeckRejection } from "../scripts/barkham-deck-guard.mjs";

const game = (id: string) => ({ game: { mode: { That: { id } } } });
const human = { investigator_code: "60101", slots: { "01020": 2 } };
const dog = { investigator_code: ":barkham:004", slots: { ":barkham:005": 1, ":barkham:006": 1 } };

test("human deck cannot load into Barkham at the namespaced native checkpoint", () => {
  assert.equal(barkhamDeckRejection(game("c:barkham:022"), { playList: human }), "This scenario requires a Barkham investigator.");
  assert.equal(barkhamDeckRejection(game(":barkham:022"), dog), null);
});

test("Barkham investigator cannot load into the ordinary Gathering", () => {
  assert.match(barkhamDeckRejection(game("c01104"), { playList: dog })!, /only be used in The Meddling of Meowlathotep/);
  assert.equal(barkhamDeckRejection(game("01104"), human), null);
});

test("Barkham cards in the main deck or side deck remain scenario restricted with a human investigator", () => {
  for (const contents of [
    { slots: { "c:barkham:019": 1 } },
    { sideSlots: { "barkham-019": 1 } },
    { sideSlots: [[":barkham:019", 1]] },
  ]) assert.match(barkhamDeckRejection(game("01104"), { ...human, ...contents })!, /Barkham characters and cards/);
});

test("the existing native playList is authoritative over the unmodified source list", () => {
  assert.equal(barkhamDeckRejection(game("01104"), { list: dog, playList: human }), null);
  assert.match(barkhamDeckRejection(game("01104"), { list: human, playList: dog })!, /only be used/);
});

test("campaign plus scenario uses its actual scenario, and ordinary custom card identities stay native", () => {
  const campaignGame = { game: { mode: { These: [{ id: "01" }, { id: "c:barkham:022" }] } } };
  assert.equal(barkhamDeckRejection(campaignGame, human), "This scenario requires a Barkham investigator.");
  assert.equal(barkhamDeckRejection(game("01104"), { ...human, slots: { "barkham-custom-card": 1, "01020": 2 } }), null);
});
