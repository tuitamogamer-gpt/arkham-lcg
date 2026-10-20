import test from "node:test";
import assert from "node:assert/strict";
import { matchesSearch } from "../src/game/search";

test("catalog search matches accents, punctuation and words in any order", () => {
  assert.equal(
    matchesSearch("André Patel · The Film Star", "patel andre"),
    true,
  );
  assert.equal(
    matchesSearch("Return to the Night of the Zealot", "zealot return"),
    true,
  );
  assert.equal(matchesSearch("The Dunwich Legacy", "dunwich   legacy"), true);
  assert.equal(
    matchesSearch("Jenny Barnes (Parallel)", "jenny parallel"),
    true,
  );
  assert.equal(matchesSearch("Zoë Samaras", "zoe\u0308"), true);
  assert.equal(matchesSearch("Arkham · core_2026", "core 2026"), true);
  assert.equal(matchesSearch("The Dunwich Legacy", "dunwich carcosa"), false);
  assert.equal(matchesSearch("Any product", "  "), true);
});
