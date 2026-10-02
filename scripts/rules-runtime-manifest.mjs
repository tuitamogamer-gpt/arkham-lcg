import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async function sha256(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}
export async function extensionSourceHash(extension) {
  const entries = [];
  async function visit(directory, prefix = "") {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix + entry.name;
      if (entry.isDirectory())
        await visit(resolve(directory, entry.name), relative + "/");
      else if (entry.isFile())
        entries.push([relative, await sha256(resolve(directory, entry.name))]);
    }
  }
  await visit(extension);
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

/** A staged directory never qualifies as an executable extension build. */
export async function verifyDerivedRuntime(runtime, extension) {
  let raw;
  try {
    raw = await readFile(resolve(runtime, "chronicle-runtime.json"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const manifest = JSON.parse(raw);
  if (
    manifest.schema !== 1 ||
    manifest.kind !== "chronicle-derived" ||
    manifest.upstreamRevision !== "03a7f1e74925744f021f6e8fe0e39945d2c3a833" ||
    !manifest.extensions?.includes("barkham")
  )
    throw new Error(
      "The derived rules runtime manifest is not recognized. Rebuild the extension.",
    );
  const extensionIds = [...manifest.extensions].sort();
  if (new Set(extensionIds).size !== extensionIds.length || extensionIds.some(id => !["barkham", "epic-labyrinth", "epic-machinations"].includes(id)))
    throw new Error("The derived runtime declares an unknown original extension.");
  if (manifest.extensionSourceHashes) {
    if (Object.keys(manifest.extensionSourceHashes).length !== extensionIds.length
      || extensionIds.some(id => !/^[a-f0-9]{64}$/.test(manifest.extensionSourceHashes[id] || "")))
      throw new Error("The derived extension source manifest is incomplete.");
    const expected = extensionIds.length === 1 ? manifest.extensionSourceHashes[extensionIds[0]]
      : createHash("sha256").update(JSON.stringify(extensionIds.map(id => [id, manifest.extensionSourceHashes[id]]))).digest("hex");
    if (manifest.extensionSourceSha256 !== expected) throw new Error("The derived extension source aggregate does not match its manifest.");
  } else if (extensionIds.length !== 1) throw new Error("The derived extension source manifest is incomplete.");
  if (
    (await sha256(resolve(runtime, "bin/arkham-api"))) !== manifest.binarySha256
  )
    throw new Error(
      "The derived engine binary does not match its build manifest. Rebuild the extension.",
    );
  if (
    (
      await readFile(resolve(runtime, "frontend/dist/source_hash"), "utf8")
    ).trim() !== manifest.frontendSourceHash
  )
    throw new Error(
      "The derived frontend does not match its build manifest. Rebuild the extension.",
    );
  if (manifest.presentationSha256 !== undefined &&
      (!/^[a-f0-9]{64}$/.test(manifest.presentationSha256) ||
       await sha256(resolve(runtime, "chronicle-presentation.json")) !== manifest.presentationSha256))
    throw new Error("The Chronicle presentation does not match its build manifest. Rebuild the extension.");
  if (extension) {
    for (const id of extensionIds) {
      const path = id === "barkham" ? extension : resolve(dirname(extension), id);
      const expected = manifest.extensionSourceHashes?.[id] || manifest.extensionSourceSha256;
      if ((await extensionSourceHash(path)) !== expected)
        throw new Error("Original extension source changed since the runtime was built. Rebuild the extension.");
    }
  }
  return manifest;
}
