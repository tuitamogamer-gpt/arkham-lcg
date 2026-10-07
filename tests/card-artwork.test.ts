import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeCardArtworkPath,
  reverseCardPrinting,
} from "../scripts/card-artwork.mjs";
import { cardArtSources } from "../src/game/data";
import type { Card } from "../src/game/types";

const catalogCard = (code: string, type_code: string): Card => ({
  code,
  name: "Printed card",
  type_code,
  faction_code: "neutral",
  position: 0,
  quantity: 1,
});

test("the Epic Tindalos location keeps its revealed printing and selects the verified opposite face", () => {
  const definition = { art: "87005b", cardType: "LocationType" };
  assert.equal(nativeCardArtworkPath(definition), "cards/87005b.avif");
  assert.equal(nativeCardArtworkPath(definition, true), "cards/87005.avif");
  const card = {
    ...catalogCard("87005b", "location"),
    imagesrc: "/bundles/cards/87005b.jpg",
    backimagesrc: `https://assets.arkhamhorror.app/img/arkham/${nativeCardArtworkPath(definition, true)}`,
  };
  assert.deepEqual(cardArtSources(card, true), [
    "https://assets.arkhamhorror.app/img/arkham/cards/87005.avif",
  ]);
  assert.ok(
    cardArtSources(card).includes(
      "https://arkhamdb.com/bundles/cards/87005b.jpg",
    ),
  );
  assert.ok(!cardArtSources(card, true).some((url) => url.includes("87005bb")));
});

test("letter-disambiguated acts retain their distinct reverse printing and suffixes are not globally stripped", () => {
  for (const [code, reverse] of [
    ["03276a", "03276ab"],
    ["03276b", "03276bb"],
    ["03279a", "03279ab"],
    ["03279b", "03279bb"],
  ]) {
    assert.equal(reverseCardPrinting(code, "ActType"), reverse);
    assert.equal(
      nativeCardArtworkPath({ art: code, cardType: "ActType" }, true),
      `cards/${reverse}.avif`,
    );
    assert.deepEqual(cardArtSources(catalogCard(code, "act"), true), [
      `https://assets.arkhamhorror.app/img/arkham/cards/${reverse}.avif`,
    ]);
  }
  assert.equal(reverseCardPrinting("87005b", "ActType"), "87005bb");
  assert.equal(reverseCardPrinting("87006b", "LocationType"), "87006bb");
  assert.equal(reverseCardPrinting("87005", "LocationType"), "87005b");
});

test("native custom backs use the pinned backs directory and preserve their filename while front art stays unchanged", () => {
  const definition = {
    art: "10643",
    cardType: "EnemyType",
    customBack: "back_the_longest_night.jpg",
  };
  assert.equal(
    nativeCardArtworkPath(definition, true),
    "backs/back_the_longest_night.jpg",
  );
  assert.equal(nativeCardArtworkPath(definition), "cards/10643.avif");
});
