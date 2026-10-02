import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { barkhamCardFace } from "../scripts/barkham-card-face.mjs";
import type { Card } from "../src/game/types";
const definitions: Card[] = JSON.parse(
  readFileSync(
    new URL("../scripts/data/barkham.json", import.meta.url),
    "utf8",
  ),
);

test("unrevealed Barkham location faces do not expose revealed abilities or statistics", () => {
  const asylum = definitions.find((card) => card.code === "barkham-031")!;
  const hidden = barkhamCardFace(asylum, true);
  assert.match(hidden, /UNREVEALED/);
  for (const spoiler of [
    "Shroud 4",
    "Heal 3 horror",
    "outer gods",
    "Test [willpower]",
  ])
    assert.equal(hidden.includes(spoiler), false);
  const revealed = barkhamCardFace(asylum);
  assert.match(revealed, /Shroud 4/);
  assert.match(revealed, /Heal 3 horror/);
});

test("Barkham acts preserve the selected physical face and escape SVG text", () => {
  const act = definitions.find((card) => card.code === "barkham-025")!;
  assert.equal(barkhamCardFace(act).includes("Spawn the set-aside"), false);
  assert.match(barkhamCardFace(act, true), /Spawn the set-aside/);
  const special = barkhamCardFace({
    ...act,
    name: "<script>unsafe</script>",
    text: 'A&B <foreignObject onclick="bad">value</foreignObject>',
  });
  assert.equal(special.includes("<script>"), false);
  assert.equal(special.includes("<foreignObject"), false);
  assert.match(special, /A&amp;B/);
});
