import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import {
  nativeQaKind,
  verifyNativeQaManifest,
} from "../scripts/rules-qa-runtime-identity.mjs";
import { verifyDerivedRuntime } from "../scripts/rules-runtime-manifest.mjs";

const manifest = {
  schema: 1,
  kind: nativeQaKind,
  scope: "native-acceptance",
  platform: "linux",
  architecture: "x64",
  upstreamRevision: "03a7f1e74925744f021f6e8fe0e39945d2c3a833",
  packaged: false,
  installed: false,
  capabilityCertified: false,
  extensions: ["barkham", "epic-labyrinth", "epic-machinations"],
};

test("a coordinator-only proof cannot qualify for full aggregate API acceptance", async () => {
  const output = resolve(import.meta.dirname, "../output");
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(join(output, "qa-identity-negative-"));
  try {
    // Rejection evidence only: no simulated passing binary or API is created.
    const proofBytes = JSON.stringify({
      scope: "coordinator-only",
      examples: 51,
      failures: 0,
      fullAggregate: false,
    });
    const proofPath = join(directory, "coordinator-only.json");
    const path = join(directory, "manifest.json");
    await writeFile(proofPath, proofBytes);
    await writeFile(
      path,
      JSON.stringify({
        ...manifest,
        nativeProof: {
          path: proofPath,
          sha256: createHash("sha256").update(proofBytes).digest("hex"),
        },
      }),
    );
    await assert.rejects(
      verifyNativeQaManifest(path),
      /Only a full aggregate build qualifies/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("private Linux QA cannot claim packaging, installation, or certified capabilities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-identity-negative-"));
  try {
    const path = join(directory, "manifest.json");
    for (const key of ["packaged", "installed", "capabilityCertified"]) {
      await writeFile(path, JSON.stringify({ ...manifest, [key]: true }));
      await assert.rejects(
        verifyNativeQaManifest(path),
        new RegExp(`Private QA cannot claim ${key}`),
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the ordinary runtime validator rejects a private Linux QA manifest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-production-boundary-"));
  try {
    await writeFile(
      join(directory, "chronicle-runtime.json"),
      JSON.stringify(manifest),
    );
    await assert.rejects(
      verifyDerivedRuntime(directory),
      /manifest is not recognized/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
