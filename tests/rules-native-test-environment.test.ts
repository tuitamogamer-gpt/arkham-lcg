import test from "node:test";
import assert from "node:assert/strict";
import { nativeTestEnvironment } from "../scripts/rules-native-test-environment.mjs";

test("native acceptance ignores inherited Hspec dry runs, filters and dotfiles while preserving runtime settings", () => {
  const inherited = {
    HSPEC_OPTIONS: "--dry-run --match=nonexistent",
    HSPEC_MATCH: "another subset",
    HSPEC_SKIP: "all cases",
    HSPEC_FAIL_FAST: "yes",
    IGNORE_DOT_HSPEC: "0",
    PATH: "/private/compiler/bin",
    LD_LIBRARY_PATH: "/private/runtime/lib",
    ARKHAM_RULES_SOURCE: "/private/source",
  };
  const before = { ...inherited };
  assert.deepEqual(nativeTestEnvironment(inherited), {
    IGNORE_DOT_HSPEC: "1",
    PATH: inherited.PATH,
    LD_LIBRARY_PATH: inherited.LD_LIBRARY_PATH,
    ARKHAM_RULES_SOURCE: inherited.ARKHAM_RULES_SOURCE,
  });
  assert.deepEqual(
    inherited,
    before,
    "test options must not modify the build process environment",
  );
});
