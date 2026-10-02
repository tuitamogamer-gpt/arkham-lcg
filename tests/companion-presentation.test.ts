import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { readLocaleTree } from "../scripts/build-companion-presentation.mjs";

test("pinned locale extraction resolves nested factual data without executing modules", async () => {
  const root = await mkdtemp("/private/tmp/chronicle-locale-");
  const locale = join(root, "src/locales");
  try {
    await mkdir(join(locale, "en"), { recursive: true });
    await writeFile(join(locale, "en/common.json"), JSON.stringify({ action: { draw: "Draw {count} cards" }, done: "Done" }));
    await writeFile(join(locale, "en/story.ts"), "import common from './common.json'\nexport default { choices: common.action, ...common };");
    await writeFile(join(locale, "en.ts"), "import story from './en/story'\nexport default { story, ...story['choices'] };");
    assert.deepEqual(await readLocaleTree(root), {
      story: { choices: { draw: "Draw {count} cards" }, action: { draw: "Draw {count} cards" }, done: "Done" },
      draw: "Draw {count} cards",
    });
    await writeFile(join(locale, "en.ts"), "export default process.exit(1);");
    await assert.rejects(readLocaleTree(root), /Unknown locale binding|Unsupported locale data syntax/);
    await writeFile(join(locale, "en.ts"), "export default { ok: 'Safe' }; process.exit();");
    await assert.rejects(readLocaleTree(root), /Trailing locale code/);
    await writeFile(join(root, "src/foreign.json"), '{}');
    await writeFile(join(locale, "en.ts"), "import foreign from '../foreign.json'\nexport default foreign;");
    await assert.rejects(readLocaleTree(root), /Only pinned English/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
