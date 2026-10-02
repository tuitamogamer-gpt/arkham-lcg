import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalog } from "../src/game/catalog";
import { registerCatalogCards } from "../src/game/data";
import { canPlay } from "../src/game/engine";
import { validSave } from "../src/game/storage";
import { createGame, reduceGame } from "./helpers";
import type { Card } from "../src/game/types";

test("registering the catalog cannot make an unscripted native event silently spend and discard", () => {
  const cards: Card[] = catalog.cardFiles.flatMap((file) =>
    JSON.parse(readFileSync(`public${file}`, "utf8")),
  );
  registerCatalogCards(cards);
  const game = reduceGame(createGame("standard", 123), {
    type: "mulligan",
    ids: [],
  });
  game.player.hand = [{ id: "catalog-event", code: "01088" }];
  assert.match(canPlay(game, "catalog-event")!, /companion rules engine/);
  const next = reduceGame(game, { type: "play", id: "catalog-event" });
  assert.equal(next.player.resources, game.player.resources);
  assert.deepEqual(next.player.hand, game.player.hand);
  assert.equal(validSave(game), false);
});
