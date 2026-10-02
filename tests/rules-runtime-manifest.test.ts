import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  extensionSourceHash,
  verifyDerivedRuntime,
} from "../scripts/rules-runtime-manifest.mjs";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

test("staging never unlocks a derived runtime, and changed binaries or extension source require rebuilding", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chronicle-runtime-proof-"));
  try {
    const runtime = join(directory, "game");
    const extension = join(directory, "extension");
    await mkdir(join(runtime, "bin"), { recursive: true });
    await mkdir(join(runtime, "frontend/dist"), { recursive: true });
    await mkdir(extension);
    await writeFile(join(runtime, "bin/arkham-api"), "compiled-fixture");
    await writeFile(
      join(runtime, "frontend/dist/source_hash"),
      "frontend-fixture\n",
    );
    await writeFile(join(extension, "rules.hs"), "original-extension");
    assert.equal(await verifyDerivedRuntime(runtime, extension), null);
    const manifest = {
      schema: 1,
      kind: "chronicle-derived",
      upstreamRevision: "03a7f1e74925744f021f6e8fe0e39945d2c3a833",
      extensions: ["barkham"],
      binarySha256: hash("compiled-fixture"),
      frontendSourceHash: "frontend-fixture",
      extensionSourceSha256: await extensionSourceHash(extension),
    };
    await writeFile(
      join(runtime, "chronicle-runtime.json"),
      JSON.stringify(manifest),
    );
    assert.deepEqual(await verifyDerivedRuntime(runtime, extension), manifest);
    await writeFile(join(extension, "rules.hs"), "changed-extension");
    await assert.rejects(
      verifyDerivedRuntime(runtime, extension),
      /source changed/,
    );
    await writeFile(join(runtime, "bin/arkham-api"), "changed-binary");
    await assert.rejects(
      verifyDerivedRuntime(runtime),
      /binary does not match/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
