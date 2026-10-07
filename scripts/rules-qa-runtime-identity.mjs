// Acceptance evidence for a privately compiled Linux aggregate. This is not a
// distribution/capability manifest and is never read by the production launcher.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { extensionSourceHash } from "./rules-runtime-manifest.mjs";

export const nativeQaKind = "chronicle-linux-native-qa";
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const revision = "03a7f1e74925744f021f6e8fe0e39945d2c3a833";
const extensions = ["barkham", "epic-labyrinth", "epic-machinations"];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function qaFileSha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

/** Validate a full native proof, never coordinator-only evidence or a fixture. */
export async function verifyNativeQaManifest(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.kind, nativeQaKind);
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.scope, "native-acceptance");
  assert.equal(manifest.platform, "linux");
  assert.equal(manifest.architecture, "x64");
  assert.equal(manifest.upstreamRevision, revision);
  for (const key of ["packaged", "installed", "capabilityCertified"])
    assert.equal(manifest[key], false, `Private QA cannot claim ${key}.`);
  assert.deepEqual([...manifest.extensions].sort(), extensions);
  const proofPath = await realpath(manifest.nativeProof.path);
  assert.ok(
    proofPath.startsWith((await realpath(resolve(project, "output"))) + sep),
  );
  const proofBytes = await readFile(proofPath);
  assert.equal(sha(proofBytes), manifest.nativeProof.sha256);
  const proof = JSON.parse(proofBytes);
  assert.equal(
    proof.scope,
    "native-aggregate",
    "Only a full aggregate build qualifies for real API QA.",
  );
  assert.equal(proof.fullAggregate, true);
  assert.equal(proof.fullAggregateBehaviorTested, true);
  const objectsPath = resolve(
    dirname(dirname(dirname(proof.binary))),
    "chronicle-native-plan/native-objects.json",
  );
  assert.equal(await qaFileSha256(objectsPath), proof.nativeObjectsProofSha256);
  const objects = JSON.parse(await readFile(objectsPath, "utf8"));
  assert.equal(
    objects.modules.length + objects.others.length,
    proof.nativeModuleCount,
  );
  assert.ok(
    proof.nativeModuleCount > 1000,
    "Real aggregate evidence must contain the full engine module graph.",
  );
  const input = JSON.parse(
    await readFile(
      resolve(project, "output/rules-server/rules-build-input.json"),
      "utf8",
    ),
  );
  assert.equal(input.upstreamRevision, revision);
  assert.deepEqual([...input.extensions].sort(), extensions);
  assert.equal(input.extensionSourceSha256, proof.extensionSourceSha256);
  assert.ok(
    (await realpath(proof.binary)).startsWith(
      (await realpath(resolve(input.source, "backend/arkham-api"))) + sep,
    ),
  );
  assert.equal(
    await extensionSourceHash(
      resolve(input.source, "backend/arkham-api/library"),
    ),
    objects.nativeLibrarySourceHash,
    "The actual staged native module sources must still match the full compiled graph.",
  );
  assert.equal(proof.upstreamRevision, revision);
  assert.equal(proof.platform, "linux");
  assert.equal(proof.architecture, "x64");
  assert.deepEqual([...proof.extensions].sort(), extensions);
  assert.equal(proof.packaged, false);
  assert.equal(proof.installed, false);
  assert.equal(await realpath(proof.binary), await realpath(manifest.binary));
  assert.equal(await qaFileSha256(manifest.binary), proof.nativeEngineSha256);
  assert.equal(manifest.binarySha256, proof.nativeEngineSha256);
  const runtimeBinary = resolve(dirname(manifestPath), "bin/arkham-api");
  assert.equal(
    await realpath(runtimeBinary),
    await realpath(proof.binary),
    "The private API launcher must execute this exact aggregate, not a different runtime file.",
  );
  assert.equal(await qaFileSha256(runtimeBinary), proof.nativeEngineSha256);
  assert.equal(proof.behavior?.failures, 0);
  assert.ok(
    proof.behavior.examples > 51,
    "Run full entity/transport/driver suites as well as coordinator suites.",
  );
  assert.equal(proof.behavior.environmentSanitized, true);
  assert.deepEqual(proof.behavior.hspecOptions, ["--ignore-dot-hspec"]);
  assert.equal(
    await qaFileSha256(resolve(project, "rules/tests/ChronicleFullSpec.hs")),
    proof.behavior.testDriverSha256,
  );
  assert.equal(
    await qaFileSha256(
      resolve(dirname(dirname(proof.binary)), "barkham-spec/barkham-spec"),
    ),
    proof.behavior.testBinarySha256,
  );
  const hashes = {};
  for (const id of extensions)
    hashes[id] = await extensionSourceHash(
      resolve(project, "rules/extensions", id),
    );
  assert.deepEqual(
    proof.extensionSourceHashes,
    hashes,
    "The current original sources must match the compiled aggregate.",
  );
  assert.deepEqual(manifest.extensionSourceHashes, hashes);
  const aggregate = sha(
    JSON.stringify(extensions.map((id) => [id, hashes[id]])),
  );
  assert.equal(proof.extensionSourceSha256, aggregate);
  assert.equal(manifest.extensionSourceSha256, aggregate);
  return manifest;
}

/** Existing packaged candidates retain their existing acceptance path. */
export async function acceptanceManifest(path) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (manifest.kind === nativeQaKind) return verifyNativeQaManifest(path);
  assert.equal(manifest.kind, "chronicle-derived");
  return manifest;
}
