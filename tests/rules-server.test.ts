import test from "node:test";
import assert from "node:assert/strict";
import { catalog } from "../src/game/catalog";
import {
  parseServerDeck,
  starterServerDeck,
  unsupportedDeckCards,
  rulesFrameUrl,
  serverDeckOptions,
} from "../src/game/rulesServer";

test("official starter import keeps exact signatures and weaknesses, without adding upgrade cards", () => {
  for (const starter of catalog.starterDecks) {
    const deck = starterServerDeck(starter);
    assert.equal(deck.investigator_code, starter.investigatorCode);
    assert.equal(
      Object.values(deck.slots).reduce((a, b) => a + b, 0),
      starter.slots.reduce((a, b) => a + b.quantity, 0),
    );
    assert.deepEqual(parseServerDeck(deck), deck);
    assert.deepEqual(
      unsupportedDeckCards(
        deck,
        new Set([
          starter.investigatorCode,
          ...starter.slots.map((s) => s.code),
        ]),
      ),
      [],
    );
    assert.deepEqual(
      unsupportedDeckCards(deck, new Set(Object.keys(deck.slots))),
      [starter.investigatorCode],
    );
  }
});

test("ArkhamDB meta strings and side decks retain choices and physical cards", () => {
  const deck = parseServerDeck({
    investigator_code: "09004",
    slots: { "09020": 1 },
    sideSlots: { "09014": 2 },
    meta: JSON.stringify({
      faction: "rogue",
      deck_size: "40",
      option: "blessed",
    }),
  });
  assert.deepEqual(deck.sideSlots, { "09014": 2 });
  assert.deepEqual(serverDeckOptions(deck), {
    selections: {
      faction: "rogue",
      deck_size: "40",
      option: "blessed",
      "Secondary Class": "rogue",
      "Deck Size": "40",
      "Trait Choice": "blessed",
    },
    sideDeck: [{ code: "09014", quantity: 2 }],
  });
  assert.deepEqual(unsupportedDeckCards(deck, new Set(["09004", "09020"])), [
    "09014",
  ]);
  assert.throws(
    () => parseServerDeck({ ...deck, sideSlots: { "09014": -1 } }),
    /Side-deck/,
  );
});

test("real arkhamdb.com exports with empty meta and side deck import with their choices", () => {
  // arkhamdb.com writes meta: "" and sideSlots: [] when a deck has neither.
  const plain = parseServerDeck({
    name: "Roland",
    investigator_code: "01001",
    slots: { "01088": 2 },
    sideSlots: [],
    meta: "",
    taboo_id: null,
  });
  assert.equal(plain.sideSlots, undefined);
  assert.equal(plain.meta, undefined);
  assert.deepEqual(serverDeckOptions(plain), { selections: {} });
  assert.equal(
    parseServerDeck({ investigator_code: "01001", slots: { "01088": 2 }, meta: null, sideSlots: null }).meta,
    undefined,
  );
  const chosen = parseServerDeck({
    investigator_code: "06002",
    slots: { "01088": 2 },
    meta: JSON.stringify({
      faction_selected: "mystic",
      deck_size_selected: "40",
      option_selected: "blessed",
    }),
  });
  assert.deepEqual(serverDeckOptions(chosen).selections, {
    faction_selected: "mystic",
    deck_size_selected: "40",
    option_selected: "blessed",
    "Secondary Class": "mystic",
    "Deck Size": "40",
    "Trait Choice": "blessed",
  });
});

test("JSON import rejects malformed quantities and keeps explicit deckbuilding choices", () => {
  const valid = {
    name: "My deck",
    investigator_code: "01001",
    slots: { "01088": 2 },
    meta: { faction_1: "seeker" },
    taboo_id: 3,
  };
  assert.deepEqual(parseServerDeck(valid), valid);
  for (const quantity of [0, -1, 1.5, "2", 101, NaN])
    assert.throws(
      () => parseServerDeck({ ...valid, slots: { "01088": quantity } }),
      /whole-number/,
    );
  assert.throws(() => parseServerDeck({ ...valid, slots: [] }), /slots/);
  assert.throws(
    () => parseServerDeck({ ...valid, meta: { faction_1: 2 } }),
    /strings/,
  );
  assert.throws(() => parseServerDeck({ ...valid, taboo_id: "3" }), /taboo/);
});

test("embedded table navigation stays inside known game routes", () => {
  assert.ok(
    rulesFrameUrl("/campaigns/new").includes("path=%2Fcampaigns%2Fnew"),
  );
  assert.ok(rulesFrameUrl("/games/17a2-992b"));
  for (const path of [
    "//evil.example",
    "/api/v1/account",
    "/sign-in?next=evil",
    "/games/x<script>",
    "https://example.com",
  ])
    assert.throws(() => rulesFrameUrl(path), /Invalid/);
});

test("ArkhamDB customization sheets reach printed deck checks without rewriting engine metadata", () => {
  const deck = parseServerDeck({ investigator_code: "01001", slots: { "09021": 2 }, meta: { cus_09021: "0|1,2|2" } });
  assert.deepEqual(serverDeckOptions(deck).customizations, { "09021": "0|1,2|2" });
  assert.deepEqual(deck.meta, { cus_09021: "0|1,2|2" });
});
