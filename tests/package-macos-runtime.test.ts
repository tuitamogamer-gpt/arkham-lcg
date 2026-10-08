import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { assertNativePackageProof, baseArchiveSha256, baseDependencyReplacement, baseInstallIdReplacement, immutablePackageInput, materializePackageTree, machoKind, machoLoadCommands } from "../scripts/package-macos-runtime.mjs";

const execute = promisify(execFile);
const digest = "a".repeat(64);
const manifest = {
  kind: "chronicle-derived", upstreamRevision: "03a7f1e74925744f021f6e8fe0e39945d2c3a833",
  baseReleaseSha256: baseArchiveSha256,
  extensions: ["barkham", "epic-labyrinth", "epic-machinations"],
  binarySha256: digest, nativeEngineSha256: "d".repeat(64), frontendSourceHash: "current-front", extensionSourceSha256: "b".repeat(64),
};
const proof = {
  schema: 1, status: "passed", suite: "arkham-api:test:barkham-spec", upstreamRevision: manifest.upstreamRevision,
  extensions: [...manifest.extensions], examples: 207, failures: 0,
  environmentSanitized: true, hspecOptions: ["--ignore-dot-hspec"],
  runtimeOptions: ["+RTS", "-N1", "-A16m", "-RTS"],
  testDriverSha256: digest, testBinarySha256: "c".repeat(64),
  binarySha256: manifest.binarySha256, frontendSourceHash: manifest.frontendSourceHash,
  extensionSourceSha256: manifest.extensionSourceSha256,
};

test("Mac archive export binds the full actual current native proof instead of a fixed example count", () => {
  assert.doesNotThrow(() => assertNativePackageProof(manifest, proof, digest));
  assert.doesNotThrow(() => assertNativePackageProof(manifest, { ...proof, examples: 208 }, digest));
  for (const changed of [
    { ...proof, binarySha256: "changed" }, { ...proof, frontendSourceHash: "changed" },
    { ...proof, extensionSourceSha256: "changed" }, { ...proof, testDriverSha256: "changed" },
    { ...proof, extensions: ["barkham"] }, { ...proof, extensions: [...manifest.extensions, "barkham"] },
    { ...proof, examples: 0 }, { ...proof, failures: 1 }, { ...proof, environmentSanitized: false },
    { ...proof, hspecOptions: ["--ignore-dot-hspec", "--match", "Coordinator"] },
    { ...proof, runtimeOptions: [] }, { ...proof, status: "prepared" },
    { ...proof, testBinarySha256: "not-a-real-sha256" },
    { ...proof, suite: "coordinator-only" },
  ]) assert.throws(() => assertNativePackageProof(manifest, changed, digest), /matching, unfiltered passing full native driver/);
  for (const changed of [
    { ...manifest, kind: "chronicle-native-qa" }, { ...manifest, extensions: ["barkham"] },
    { ...manifest, baseReleaseSha256: "changed" }, { ...manifest, upstreamRevision: "changed" },
    { ...manifest, nativeEngineSha256: "missing-native-provenance" },
  ]) assert.throws(() => assertNativePackageProof(changed, proof, digest), /complete original derived macOS aggregate/);
});

test("portable runtime materialization expands approved links and rejects escaped private files and cycles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chronicle-mac-package-"));
  try {
    const source = join(directory, "distribution");
    await mkdir(join(source, "lib"), { recursive: true });
    await writeFile(join(source, "lib/library.1.dylib"), "actual library bytes");
    await writeFile(join(source, "lib/._library.1.dylib"), "AppleDouble metadata excluded");
    await symlink("library.1.dylib", join(source, "lib/library.dylib"));
    const target = join(directory, "export");
    await materializePackageTree(join(source, "lib"), target, source);
    assert.equal(await readFile(join(target, "library.dylib"), "utf8"), "actual library bytes");
    assert.equal((await stat(join(target, "library.dylib"))).isFile(), true);
    assert.deepEqual(await readdir(target), ["library.1.dylib", "library.dylib"]);
    await writeFile(join(directory, "private-session.key"), "must stay private");
    await symlink("../../private-session.key", join(source, "lib/escaped.key"));
    await assert.rejects(materializePackageTree(join(source, "lib"), join(directory, "escaped"), source), /escapes its approved/);
    await assert.rejects(readFile(join(directory, "escaped/escaped.key")), /ENOENT/);
    await rm(join(source, "lib/escaped.key"));
    await symlink(".", join(source, "lib/loop"));
    await assert.rejects(materializePackageTree(join(source, "lib"), join(directory, "recursive"), source), /recursive directory symlink/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("selected frontend links cannot export sibling session keys or PostgreSQL saves", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chronicle-private-package-input-"));
  try {
    const candidate = join(directory, "candidate");
    await mkdir(join(candidate, "frontend/dist"), { recursive: true });
    await mkdir(join(candidate, "config"));
    await mkdir(join(candidate, "data/pgdata"), { recursive: true });
    await writeFile(join(candidate, "frontend/dist/index.html"), "public frontend");
    await writeFile(join(candidate, "config/private-session.key"), "private key must stay private");
    await writeFile(join(candidate, "data/pgdata/saved-game.json"), "private save must stay private");
    const input = await immutablePackageInput(candidate, "frontend/dist", "directory");
    for (const [name, secret] of [
      ["a-key.js", "../../config/private-session.key"],
      ["a-save.js", "../../data/pgdata/saved-game.json"],
    ]) {
      const link = join(input, name);
      await symlink(secret, link);
      const output = join(directory, name + "-export");
      await assert.rejects(materializePackageTree(input, output, input), /escapes its approved immutable trees/);
      await assert.rejects(readFile(join(output, name)), /ENOENT/);
      await rm(link);
    }
    await materializePackageTree(input, join(directory, "safe-frontend"), input);
    assert.equal(await readFile(join(directory, "safe-frontend/index.html"), "utf8"), "public frontend");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a selected immutable root and its parents cannot alias excluded candidate directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chronicle-root-package-escape-"));
  try {
    const candidate = join(directory, "candidate");
    await mkdir(join(candidate, "config/dist"), { recursive: true });
    await mkdir(join(candidate, "data/pgdata"), { recursive: true });
    await mkdir(join(candidate, "frontend"));
    await writeFile(join(candidate, "config/dist/private-session.key"), "private key");
    for (const excluded of ["../config/dist", "../data/pgdata"]) {
      await symlink(excluded, join(candidate, "frontend/dist"));
      await assert.rejects(immutablePackageInput(candidate, "frontend/dist", "directory"), /must not be a symlink/);
      await assert.rejects(materializePackageTree(join(candidate, "frontend/dist"), join(directory, "export")), /approved immutable package root must not be a symlink/);
      await rm(join(candidate, "frontend/dist"));
    }
    await rm(join(candidate, "frontend"), { recursive: true });
    await symlink("config", join(candidate, "frontend"));
    await assert.rejects(immutablePackageInput(candidate, "frontend/dist", "directory"), /parent must not be a symlink/);
    await assert.rejects(readFile(join(directory, "export/private-session.key")), /ENOENT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("explicit immutable base roots allow cross-library links while excluding the base config tree", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chronicle-base-package-roots-"));
  try {
    const base = join(directory, "base");
    await mkdir(join(base, "lib"), { recursive: true });
    await mkdir(join(base, "pgsql/lib"), { recursive: true });
    await mkdir(join(base, "config"));
    await writeFile(join(base, "pgsql/lib/libpq.5.dylib"), "pinned library");
    await writeFile(join(base, "config/private.key"), "excluded key");
    await symlink("../pgsql/lib/libpq.5.dylib", join(base, "lib/libpq.5.dylib"));
    const roots = [await immutablePackageInput(base, "lib", "directory"), await immutablePackageInput(base, "pgsql/lib", "directory")];
    await materializePackageTree(roots[0], join(directory, "export/lib"), roots);
    assert.equal(await readFile(join(directory, "export/lib/libpq.5.dylib"), "utf8"), "pinned library");
    await symlink("../config/private.key", join(base, "lib/a-private.key"));
    await assert.rejects(materializePackageTree(roots[0], join(directory, "unsafe/lib"), roots), /escapes its approved immutable trees/);
    await assert.rejects(readFile(join(directory, "unsafe/lib/a-private.key")), /ENOENT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Mach-O import audit excludes a dylib's own install identity and separates RPATH from imports", () => {
  const commands = machoLoadCommands(`library.dylib:
Load command 0
          cmd LC_ID_DYLIB
      cmdsize 128
         name /original/builder/library.dylib (offset 24)
Load command 1
          cmd LC_LOAD_DYLIB
      cmdsize 80
         name @loader_path/libpq.5.dylib (offset 24)
Load command 2
          cmd LC_LOAD_WEAK_DYLIB
      cmdsize 80
         name /usr/lib/libSystem.B.dylib (offset 24)
Load command 3
          cmd LC_RPATH
      cmdsize 48
         path @loader_path/../lib (offset 12)
Load command 4
          cmd LC_CODE_SIGNATURE
      cmdsize 16
      dataoff 8000
     datasize 128
`);
  assert.deepEqual(commands, {
    installId: "/original/builder/library.dylib",
    dependencies: ["@loader_path/libpq.5.dylib", "/usr/lib/libSystem.B.dylib"],
    rpaths: ["@loader_path/../lib"],
  });
});

test("only the exact pinned base import roots can be rewritten to bounded relative libraries", () => {
  const pg = "/Users/runner/work/ArkhamHorror/ArkhamHorror/offline/_deps/postgres/lib/";
  assert.deepEqual(baseDependencyReplacement("pgsql/bin/psql", pg + "libpq.5.dylib"), {
    target: "pgsql/lib/libpq.5.dylib", replacement: "@loader_path/../lib/libpq.5.dylib",
  });
  assert.deepEqual(baseDependencyReplacement("pgsql/lib/libecpg.6.dylib", pg + "libpgtypes.3.dylib"), {
    target: "pgsql/lib/libpgtypes.3.dylib", replacement: "@loader_path/libpgtypes.3.dylib",
  });
  assert.deepEqual(baseDependencyReplacement("lib/libpcre.1.dylib", "/opt/homebrew/opt/pcre/lib/libpcre.1.dylib"), {
    target: "lib/libpcre.1.dylib", replacement: "@loader_path/libpcre.1.dylib",
  });
  for (const unknown of ["/other/work/libpq.5.dylib", "/opt/homebrew/opt/gmp/lib/libgmp.10.dylib", "@rpath/libpq.5.dylib", "/usr/lib/libSystem.B.dylib"])
    assert.equal(baseDependencyReplacement("pgsql/bin/psql", unknown), null);
  assert.throws(() => baseDependencyReplacement("pgsql/bin/psql", pg + "../../private.dylib"), /plain dylib filename/);
  assert.throws(() => baseDependencyReplacement("../outside", pg + "libpq.5.dylib"), /bounded relative path/);
});

test("pinned separately signed PG aliases retain both source hashes and require a same-directory ARM64 canonical file", () => {
  const pg = "/Users/runner/work/ArkhamHorror/ArkhamHorror/offline/_deps/postgres/lib/";
  const originals = new Map([
    ["pgsql/lib/libpq.dylib", "a".repeat(64)],
    ["pgsql/lib/libpq.5.dylib", "b".repeat(64)],
    ["lib/libpq.5.dylib", "c".repeat(64)],
  ]);
  assert.deepEqual(baseInstallIdReplacement("pgsql/lib/libpq.dylib", pg + "libpq.5.dylib", originals), {
    canonical: "pgsql/lib/libpq.5.dylib", replacement: "@loader_path/libpq.5.dylib",
    originalSha256: "a".repeat(64), canonicalOriginalSha256: "b".repeat(64),
  });
  assert.deepEqual(baseInstallIdReplacement("lib/libpq.5.dylib", pg + "libpq.5.dylib", originals), {
    canonical: "lib/libpq.5.dylib", replacement: "@loader_path/libpq.5.dylib",
    originalSha256: "c".repeat(64), canonicalOriginalSha256: "c".repeat(64),
  });
  assert.throws(() => baseInstallIdReplacement("pgsql/lib/libpq.dylib", pg + "libpq.5.dylib", new Map([["lib/libpq.5.dylib", digest]])), /no exported ARM64 canonical file/);
  assert.equal(baseInstallIdReplacement("lib/libpq.5.dylib", "/another/build/libpq.5.dylib", originals), null);
});

test("runtime architecture checks accept actual thin ARM64 headers and reject Intel and fat Mach-O", () => {
  const arm = Buffer.alloc(8);
  arm.writeUInt32LE(0xfeedfacf, 0);
  arm.writeUInt32LE(0x0100000c, 4);
  assert.equal(machoKind(arm), "arm64");
  const intel = Buffer.from(arm);
  intel.writeUInt32LE(0x01000007, 4);
  assert.throws(() => machoKind(intel), /arm64 Mach-O/);
  for (const magic of [0xcafebabe, 0xcafebabf, 0xcefaedfe, 0xfeedface, 0xfeedfacf]) {
    const other = Buffer.alloc(8);
    other.writeUInt32BE(magic, 0);
    assert.throws(() => machoKind(other), /thin arm64/);
  }
  assert.equal(machoKind(Buffer.from("SQL file")), null);
  assert.equal(machoKind(Buffer.alloc(0)), null);
});

test("Linux export rejects before it creates output or attempts signing", { skip: process.platform !== "linux" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "chronicle-mac-rejection-"));
  try {
    await assert.rejects(execute(process.execPath, [resolve("scripts/package-macos-runtime.mjs"), "--output", join(directory, "artifact")], { timeout: 5000 }),
      (error: unknown) => { assert.match((error as Error & { stderr: string }).stderr, /actual macOS Apple Silicon/); return true; });
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
