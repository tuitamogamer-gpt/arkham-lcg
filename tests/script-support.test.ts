import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NATIVE_INVESTIGATOR_CODES,
  NATIVE_SCRIPT_CODES,
  NATIVE_SUPPORT_COUNT,
  isNativeInvestigator,
  nativeScriptCode,
  nativeSupport,
} from "../src/game/scriptSupport";
import { card, STARTER_DECKS } from "../src/game/data";
import type { Card } from "../src/game/types";

const read = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../public/data/${name}`, import.meta.url), "utf8"),
  );
const manifest = read("catalog.json");
const imported: Card[] = manifest.cardFiles.flatMap((path: string) =>
  read(path.split("/").at(-1)!),
);
const byCode = new Map(imported.map((c) => [c.code, c]));

test("native coverage includes the reachable starter/scenario pool, not all imported Core content", () => {
  assert.equal(NATIVE_SUPPORT_COUNT, 107);
  assert.equal(new Set(NATIVE_SCRIPT_CODES).size, 107);
  assert.equal(NATIVE_INVESTIGATOR_CODES.length, 5);
  for (const code of NATIVE_SCRIPT_CODES) {
    assert.equal(nativeScriptCode(card(code)), code);
    assert.equal(nativeScriptCode(byCode.get(code)!), code);
    assert.deepEqual(nativeSupport(card(code)), {
      supported: true,
      scriptCode: code,
    });
  }
  for (const [investigator, deck] of Object.entries(STARTER_DECKS)) {
    assert.ok(isNativeInvestigator(card(investigator)));
    assert.ok(deck.every((code) => nativeScriptCode(card(code)) === code));
  }
  assert.equal(nativeScriptCode(card("12133")), null);
  assert.equal(nativeScriptCode(card("12168")), null);
  assert.equal(nativeScriptCode(card("12028")), null);
  assert.equal(isNativeInvestigator(byCode.get("01001")!), false);
});

test("identical Emergency Cache printings resolve to the scripted behavior without losing identity", () => {
  for (const code of ["01088", "01588", "12089"]) {
    const printing = byCode.get(code)!;
    const before = JSON.stringify(printing);
    assert.equal(nativeScriptCode(printing), "12089");
    assert.equal(nativeSupport(printing).supported, true);
    assert.equal(JSON.stringify(printing), before);
    assert.equal(printing.code, code);
  }
});

test("duplicate_of cannot alias the older Machete rules to the changed 2026 script", () => {
  assert.equal(byCode.get("12020")!.duplicate_of, "01020");
  assert.equal(nativeScriptCode(byCode.get("12020")!), "12020");
  assert.equal(nativeScriptCode(byCode.get("01020")!), null);
  assert.equal(nativeScriptCode(byCode.get("01520")!), null);
  assert.equal(nativeSupport(byCode.get("01020")!).supported, false);
});

test("rule equality permits printing metadata and whitespace changes but rejects mechanical changes", () => {
  const native = card("12089");
  const reprint: Card = {
    ...native,
    code: "hypothetical-cache",
    pack_code: "another-product",
    position: 999,
    quantity: 1,
    text: " \nGain  3\tresources.  ",
    illustrator: "Another illustrator",
    flavor: "New flavor text",
    imagesrc: "/another-scan.jpg",
    duplicate_of: "unrelated-parent",
  };
  assert.equal(nativeScriptCode(reprint), "12089");
  assert.equal(
    nativeScriptCode({ ...reprint, text: "Gain 4 resources." }),
    null,
  );
  assert.equal(nativeScriptCode({ ...reprint, cost: 1 }), null);
  assert.equal(nativeScriptCode({ ...reprint, xp: 1 }), null);
  assert.equal(nativeScriptCode({ ...reprint, skill_wild: 1 }), null);
  assert.equal(nativeScriptCode({ ...reprint, traits: "Spell." }), null);
  assert.equal(
    nativeScriptCode({ ...reprint, back_text: "Forced: Take 1 horror." }),
    null,
  );
  assert.equal(nativeScriptCode({ ...reprint, name: "Different Card" }), null);
  assert.equal(
    nativeScriptCode({ ...reprint, hypotheticalMechanic: true } as Card),
    null,
  );
});

test("a known code with amended rules and an imported unsupported card both fail closed", () => {
  const amended = { ...card("12089"), text: "Gain 4 resources." };
  assert.equal(nativeScriptCode(amended), null);
  assert.equal(nativeSupport(amended).supported, false);
  assert.match(nativeSupport(amended).reason!, /differs/);
  assert.equal(nativeScriptCode({ ...card("12038"), code: "12089" }), null);
  const importedUnsupported = byCode.get("60101")!;
  assert.equal(nativeScriptCode(importedUnsupported), null);
  assert.equal(isNativeInvestigator(importedUnsupported), false);
  assert.match(nativeSupport(importedUnsupported).reason!, /no verified/);
});
