import assert from "node:assert/strict";
import test from "node:test";
import { chronicleSniffedLocation } from "../rules/extensions/barkham/frontend/chronicleBarkhamState.ts";

test("Kate's sniff marker survives serialized game state without leaking other metadata", () => {
  const investigators = JSON.parse(JSON.stringify({
    kate: { cardCode: "c:barkham:004", meta: { sniffedLocations: ["dock", "park"] } },
    roland: { cardCode: "c01001", meta: { sniffedLocations: ["hospital"] } },
  }));
  assert.equal(chronicleSniffedLocation(investigators, "park"), true);
  assert.equal(chronicleSniffedLocation(investigators, "hospital"), false);
  assert.equal(chronicleSniffedLocation(investigators, "unvisited"), false);
  investigators.kate.meta.sniffedLocations = [];
  assert.equal(chronicleSniffedLocation(investigators, "park"), false);
  investigators.kate.meta = null;
  assert.equal(chronicleSniffedLocation(investigators, "park"), false);
});
