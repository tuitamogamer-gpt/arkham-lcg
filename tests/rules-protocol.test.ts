import test from "node:test";
import assert from "node:assert/strict";
import {
  engineCardCode,
  catalogCardCode,
  engineDeckList,
} from "../scripts/rules-protocol.mjs";

test("extension names stay distinct from numeric printings and round-trip through the bridge", () => {
  for (const code of ["barkham-001", "barkham-057", "12020", "01020", "13093b"])
    assert.equal(catalogCardCode(engineCardCode(code)), code);
  assert.equal(catalogCardCode("c12020"), "12020");
  assert.equal(catalogCardCode("c:barkham:022"), "barkham-022");
  assert.equal(engineCardCode("barkham-001-mini"), "barkham-001-mini");
  assert.equal(catalogCardCode(":different:001"), ":different:001");
});

test("deck choices reach the engine as ArkhamDB metadata JSON while slots retain exact quantities", () => {
  const input = {
    investigator_code: "barkham-001",
    slots: { "barkham-002": 1, "01020": 2, "12020": 1 },
    sideSlots: { "barkham-003": 1 },
    meta: {
      alternate_front: "barkham-001",
      faction: "guardian",
      chronicle_barkham_judgments: '{"eligibleOffClassCards":[]}',
    },
  };
  const converted = engineDeckList(input);
  assert.equal(converted.investigator_code, ":barkham:001");
  assert.deepEqual(converted.slots, {
    ":barkham:002": 1,
    "01020": 2,
    "12020": 1,
  });
  assert.deepEqual(converted.sideSlots, { ":barkham:003": 1 });
  assert.equal(JSON.parse(converted.meta!).alternate_front, ":barkham:001");
  assert.equal(
    JSON.parse(converted.meta!).chronicle_barkham_judgments,
    input.meta.chronicle_barkham_judgments,
  );
  assert.deepEqual(
    engineDeckList({ ...input, meta: JSON.stringify(input.meta) }),
    converted,
  );
  assert.equal(input.investigator_code, "barkham-001");
});
