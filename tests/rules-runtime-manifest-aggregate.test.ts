import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  extensionSourceHash,
  verifyDerivedRuntime,
} from "../scripts/rules-runtime-manifest.mjs";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function fixture() {
  const directory = await mkdtemp("/private/tmp/chronicle-aggregate-proof-");
  const runtime = join(directory, "game");
  const barkham = join(directory, "extensions/barkham");
  const labyrinth = join(directory, "extensions/epic-labyrinth");
  await mkdir(join(runtime, "bin"), { recursive: true });
  await mkdir(join(runtime, "frontend/dist"), { recursive: true });
  await mkdir(barkham, { recursive: true });
  await mkdir(labyrinth);
  await writeFile(join(runtime, "bin/arkham-api"), "aggregate-native-fixture");
  await writeFile(join(runtime, "frontend/dist/source_hash"), "aggregate-frontend\n");
  await writeFile(join(barkham, "Rules.hs"), "original barkham");
  await writeFile(join(labyrinth, "NativeAssets.hs-boot"), "original boot interface");
  await writeFile(join(labyrinth, "Api.hs"), "original coupled API adapter");
  await writeFile(join(labyrinth, "migrations.sql"), "original journal migration");
  const extensionSourceHashes: Record<string, string> = {
    barkham: await extensionSourceHash(barkham),
    "epic-labyrinth": await extensionSourceHash(labyrinth),
  };
  const manifest = {
    schema: 1,
    kind: "chronicle-derived",
    upstreamRevision: "03a7f1e74925744f021f6e8fe0e39945d2c3a833",
    // Declaration order does not change the canonical aggregate digest.
    extensions: ["epic-labyrinth", "barkham"],
    extensionSourceHashes,
    extensionSourceSha256: hash(JSON.stringify(
      Object.keys(extensionSourceHashes).sort().map(id => [id, extensionSourceHashes[id]]),
    )),
    binarySha256: hash("aggregate-native-fixture"),
    frontendSourceHash: "aggregate-frontend",
  };
  const save = (value: unknown) => writeFile(
    join(runtime, "chronicle-runtime.json"), JSON.stringify(value),
  );
  await save(manifest);
  return { directory, runtime, barkham, labyrinth, manifest, save };
}

test("aggregate runtime verifies every declared extension, including boot interfaces, API and SQL inputs", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await verifyDerivedRuntime(f.runtime, f.barkham), f.manifest);
    for (const [name, original] of [
      ["NativeAssets.hs-boot", "original boot interface"],
      ["Api.hs", "original coupled API adapter"],
      ["migrations.sql", "original journal migration"],
    ]) {
      await writeFile(join(f.labyrinth, name), "changed source after compilation");
      await assert.rejects(verifyDerivedRuntime(f.runtime, f.barkham), /source changed/);
      await writeFile(join(f.labyrinth, name), original);
    }
    assert.deepEqual(await verifyDerivedRuntime(f.runtime, f.barkham), f.manifest);
    await writeFile(join(f.runtime, "frontend/dist/source_hash"), "different frontend\n");
    await assert.rejects(verifyDerivedRuntime(f.runtime, f.barkham), /frontend does not match/);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("aggregate runtime rejects incomplete, ambiguous or altered extension declarations", async () => {
  const f = await fixture();
  try {
    const cases: [unknown, RegExp][] = [
      [{ ...f.manifest, extensionSourceHashes: undefined }, /incomplete/],
      [{ ...f.manifest, extensionSourceHashes: { barkham: f.manifest.extensionSourceHashes.barkham } }, /incomplete/],
      [{ ...f.manifest, extensionSourceHashes: { ...f.manifest.extensionSourceHashes, uncompiled: hash("unknown") } }, /incomplete/],
      [{ ...f.manifest, extensionSourceSha256: hash("different aggregate") }, /aggregate does not match/],
      [{ ...f.manifest, extensions: ["barkham", "epic-labyrinth", "epic-labyrinth"] }, /unknown original extension/],
      [{ ...f.manifest, extensions: ["barkham", "uncompiled-extension"] }, /unknown original extension/],
    ];
    for (const [manifest, pattern] of cases) {
      await f.save(manifest);
      await assert.rejects(verifyDerivedRuntime(f.runtime, f.barkham), pattern);
    }
    await f.save(f.manifest);
    assert.deepEqual(await verifyDerivedRuntime(f.runtime, f.barkham), f.manifest);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("a prepared runtime binds the exact client presentation to its verified binary", async () => {
  const f = await fixture();
  try {
    const presentation = JSON.stringify({sourceRevision: f.manifest.upstreamRevision, strings: {continue: "Continue"}});
    await writeFile(join(f.runtime, "chronicle-presentation.json"), presentation);
    const manifest = {...f.manifest, presentationSha256: hash(presentation)};
    await f.save(manifest);
    assert.deepEqual(await verifyDerivedRuntime(f.runtime, f.barkham), manifest);
    await writeFile(join(f.runtime, "chronicle-presentation.json"), presentation + " ");
    await assert.rejects(verifyDerivedRuntime(f.runtime, f.barkham), /presentation does not match/);
  } finally { await rm(f.directory, {recursive:true, force:true}); }
});
