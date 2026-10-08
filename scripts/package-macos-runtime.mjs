#!/usr/bin/env node
// Export an actually tested Apple Silicon candidate without installing it.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, open, readFile, readdir, realpath, rm, stat, utimes, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";
import { verifyDerivedRuntime } from "./rules-runtime-manifest.mjs";

const execute = promisify(execFile);
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const baseArchiveSha256 = "29061cbdb683cc7b98f56fc45cb64fbc3762e5a21796406c429a936033bacf39";
const upstreamRevision = "03a7f1e74925744f021f6e8fe0e39945d2c3a833";
const aggregateExtensions = ["barkham", "epic-labyrinth", "epic-machinations"];
const hashPattern = /^[a-f0-9]{64}$/;

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function assertNativePackageProof(manifest, proof, driverSha256) {
  const complete = value => Array.isArray(value) && value.length === aggregateExtensions.length &&
    aggregateExtensions.every(id => value.includes(id)) && new Set(value).size === value.length;
  if (!manifest || manifest.kind !== "chronicle-derived" || manifest.upstreamRevision !== upstreamRevision ||
      manifest.baseReleaseSha256 !== baseArchiveSha256 || !complete(manifest.extensions) ||
      !hashPattern.test(manifest.nativeEngineSha256 || ""))
    throw new Error("Export requires the complete original derived macOS aggregate, not a private QA identity.");
  if (!proof || proof.schema !== 1 || proof.status !== "passed" || proof.suite !== "arkham-api:test:barkham-spec" || !complete(proof.extensions) ||
      proof.upstreamRevision !== manifest.upstreamRevision || !Number.isSafeInteger(proof.examples) ||
      proof.examples < 1 || proof.failures !== 0 || proof.environmentSanitized !== true ||
      JSON.stringify(proof.hspecOptions) !== JSON.stringify(["--ignore-dot-hspec"]) ||
      JSON.stringify(proof.runtimeOptions) !== JSON.stringify(["+RTS", "-N1", "-A16m", "-RTS"]) ||
      !hashPattern.test(proof.testBinarySha256 || "") || proof.testDriverSha256 !== driverSha256 ||
      proof.binarySha256 !== manifest.binarySha256 || proof.frontendSourceHash !== manifest.frontendSourceHash ||
      proof.extensionSourceSha256 !== manifest.extensionSourceSha256)
    throw new Error("Export requires the matching, unfiltered passing full native driver and exact candidate identity.");
}

function inside(root, path) {
  const local = relative(root, path);
  return local === "" || (!local.startsWith(`..${sep}`) && local !== ".." && !isAbsolute(local));
}

/** Validate each selected input before it becomes an approved immutable root. */
export async function immutablePackageInput(root, selectedPath, kind) {
  if (posix.normalize(selectedPath) !== selectedPath || selectedPath.startsWith("/") || selectedPath.startsWith("../"))
    throw new Error("A selected package input must have a bounded relative path.");
  if (!(await lstat(root)).isDirectory())
    throw new Error("The package input root must be an actual directory, not a symlink.");
  const actualRoot = await realpath(root);
  let input = actualRoot;
  const parts = selectedPath.split("/");
  for (let index = 0; index < parts.length; index++) {
    input = resolve(input, parts[index]);
    const info = await lstat(input);
    if (info.isSymbolicLink())
      throw new Error("A selected immutable package input or its parent must not be a symlink.");
    if (index < parts.length - 1 ? !info.isDirectory() : kind === "directory" ? !info.isDirectory() : !info.isFile())
      throw new Error("A selected immutable package input has an unexpected file type.");
  }
  return input;
}

/** Materialize links only within explicitly approved immutable roots. */
export async function materializePackageTree(source, target, approvedRoot = source, ancestors = new Set()) {
  const approved = Array.isArray(approvedRoot) ? approvedRoot : [approvedRoot];
  const roots = [];
  for (const root of approved) {
    if ((await lstat(root)).isSymbolicLink())
      throw new Error("An approved immutable package root must not be a symlink.");
    roots.push(await realpath(root));
  }
  const actual = await realpath(source);
  if (!roots.some(root => inside(root, actual))) throw new Error("A package input symlink escapes its approved immutable trees.");
  const info = await stat(actual);
  if (info.isDirectory()) {
    if (ancestors.has(actual)) throw new Error("A package input contains a recursive directory symlink.");
    const next = new Set([...ancestors, actual]);
    await mkdir(target, { recursive: true, mode: 0o755 });
    for (const entry of (await readdir(actual)).sort())
      if (!entry.startsWith("._") && entry !== ".DS_Store")
        await materializePackageTree(resolve(actual, entry), resolve(target, entry), roots, next);
  } else if (info.isFile()) {
    await mkdir(dirname(target), { recursive: true, mode: 0o755 });
    await copyFile(actual, target);
    await chmod(target, info.mode & 0o111 ? 0o755 : 0o644);
  } else throw new Error("A package input is neither a regular file nor a directory.");
}

export function machoKind(header) {
  if (header.length >= 8 && header.readUInt32LE(0) === 0xfeedfacf) {
    if (header.readUInt32LE(4) !== 0x0100000c)
      throw new Error("Runtime export requires arm64 Mach-O files.");
    return "arm64";
  }
  if (header.length >= 4 && [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca].includes(header.readUInt32BE(0)))
    throw new Error("Runtime export requires thin arm64 Mach-O files; another or universal architecture was found.");
  return null;
}

async function packageFiles(root, prefix = "") {
  const paths = [];
  for (const entry of (await readdir(resolve(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const local = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) paths.push(...await packageFiles(root, local));
    else if (entry.isFile()) paths.push(local);
    else throw new Error("An exported runtime must contain only materialized directories and regular files.");
  }
  return paths;
}

async function capture(command, args) {
  const result = await execute(command, args, { maxBuffer: 8 * 1024 * 1024, timeout: 120_000,
    env: { ...process.env, COPYFILE_DISABLE: "1" } });
  return result.stdout + result.stderr;
}

async function inspectMachO(path) {
  const handle = await open(path, "r");
  const header = Buffer.alloc(8);
  try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
  return machoKind(header);
}

export function machoLoadCommands(output) {
  const result = { dependencies: [], rpaths: [], installId: null };
  const imports = new Set(["LC_LOAD_DYLIB", "LC_LOAD_WEAK_DYLIB", "LC_REEXPORT_DYLIB", "LC_LOAD_UPWARD_DYLIB", "LC_LAZY_LOAD_DYLIB"]);
  for (const block of output.split(/(?:^|\n)Load command \d+\r?\n/)) {
    const command = block.match(/^\s*cmd (LC_[A-Z_]+)\s*$/m)?.[1];
    const name = block.match(/^\s*name (.+?) \(offset \d+\)\s*$/m)?.[1];
    if (imports.has(command) && name) result.dependencies.push(name);
    else if (command === "LC_ID_DYLIB" && name) result.installId = name;
    else if (command === "LC_RPATH") {
      const path = block.match(/^\s*path (.+?) \(offset \d+\)\s*$/m)?.[1];
      if (path) result.rpaths.push(path);
    }
  }
  return result;
}

/** Only these exact public, checksum-pinned base build paths can be relocated. */
export function baseDependencyReplacement(binaryPath, dependency) {
  if (posix.normalize(binaryPath) !== binaryPath || binaryPath.startsWith("/") || binaryPath.startsWith("../"))
    throw new Error("A native package file must have a bounded relative path.");
  const prefixes = [
    ["/Users/runner/work/ArkhamHorror/ArkhamHorror/offline/_deps/postgres/lib/", "pgsql/lib"],
    ["/opt/homebrew/opt/pcre/lib/", "lib"],
    ["/opt/homebrew/opt/pcre2/lib/", "lib"],
  ];
  for (const [prefix, directory] of prefixes) {
    if (!dependency.startsWith(prefix)) continue;
    const filename = dependency.slice(prefix.length);
    if (!/^[A-Za-z0-9_.-]+\.dylib$/.test(filename))
      throw new Error("A pinned base library reference is not a plain dylib filename.");
    const target = `${directory}/${filename}`;
    return { target, replacement: `@loader_path/${posix.relative(posix.dirname(binaryPath), target)}` };
  }
  return null;
}

export function baseInstallIdReplacement(binaryPath, installId, originalHashes) {
  const change = baseDependencyReplacement(binaryPath, installId);
  if (!change) return null;
  const canonical = posix.join(posix.dirname(binaryPath), posix.basename(change.target));
  if (!originalHashes.has(binaryPath) || !originalHashes.has(canonical))
    throw new Error("A pinned library install name has no exported ARM64 canonical file.");
  return { canonical, replacement: `@loader_path/${posix.basename(change.target)}`,
    originalSha256: originalHashes.get(binaryPath), canonicalOriginalSha256: originalHashes.get(canonical) };
}

async function relocateBaseLibraries(game, paths) {
  const edits = [];
  const originals = new Map();
  for (const path of paths)
    if (await inspectMachO(resolve(game, path))) originals.set(path, await sha256(resolve(game, path)));
  for (const path of paths) {
    const full = resolve(game, path);
    if (path === "bin/arkham-api" || !await inspectMachO(full)) continue;
    const commands = machoLoadCommands(await capture("otool", ["-l", full]));
    for (const dependency of commands.dependencies) {
      const change = baseDependencyReplacement(path, dependency);
      if (!change) continue;
      if (!(await lstat(resolve(game, change.target)).catch(() => null))?.isFile())
        throw new Error("A pinned base dependency is absent from the materialized runtime.");
      await capture("install_name_tool", ["-change", dependency, change.replacement, full]);
      edits.push({ path, kind: "import", from: dependency, to: change.replacement });
    }
    if (commands.installId) {
      const change = baseInstallIdReplacement(path, commands.installId, originals);
      if (change) {
        // The pinned archive also contains separately signed unversioned
        // copies. Their signature containers differ from versioned files.
        // Both sources are bound to the verified archive, and the canonical
        // same-directory target must exist as another actual ARM64 Mach-O.
        await capture("install_name_tool", ["-id", change.replacement, full]);
        edits.push({ path, kind: "install-id", from: commands.installId, to: change.replacement,
          originalSha256: change.originalSha256, canonicalOriginalSha256: change.canonicalOriginalSha256 });
      }
    }
  }
  return edits;
}

async function verifyRelocatableLoads(game, paths) {
  const binaries = [];
  for (const path of paths) {
    const full = resolve(game, path);
    if (await inspectMachO(full)) binaries.push({ path, full, ...machoLoadCommands(await capture("otool", ["-l", full])) });
  }
  const executableDirectories = [resolve(game, "bin"), resolve(game, "pgsql/bin")];
  for (const binary of binaries) {
    const expand = (path, executable, loader = dirname(binary.full)) => path === "@loader_path" ? loader
      : path === "@executable_path" ? executable
      : path.startsWith("@loader_path/") ? resolve(loader, path.slice(13))
      : path.startsWith("@executable_path/") ? resolve(executable, path.slice(17)) : path;
    for (const rpath of binary.rpaths)
      if (rpath !== "@loader_path" && rpath !== "@executable_path" && !rpath.startsWith("@loader_path/") && !rpath.startsWith("@executable_path/"))
        throw new Error(`A packaged Mach-O file has a nonrelocatable search path: ${binary.path}.`);
    for (const dependency of binary.dependencies) {
      if (dependency.startsWith("/usr/lib/") || dependency.startsWith("/System/Library/")) continue;
      const candidates = [];
      for (const executable of executableDirectories) {
        if (dependency.startsWith("@loader_path/") || dependency.startsWith("@executable_path/")) candidates.push(expand(dependency, executable));
        else if (dependency.startsWith("@rpath/")) {
          // The distribution's executable load context also supplies its RPATHs.
          for (const rpath of binary.rpaths) candidates.push(resolve(expand(rpath, executable), dependency.slice(7)));
          for (const item of binaries.filter(item => dirname(item.full) === executable))
            for (const rpath of item.rpaths) candidates.push(resolve(expand(rpath, executable, dirname(item.full)), dependency.slice(7)));
        }
      }
      let resolved = false;
      for (const candidate of candidates) {
        if (!inside(game, candidate)) continue;
        if ((await lstat(candidate).catch(() => null))?.isFile()) { resolved = true; break; }
      }
      if (!resolved) throw new Error(`A packaged dependency cannot resolve inside the runtime: ${binary.path}: ${dependency}.`);
    }
  }
  return binaries;
}

function options(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!["--candidate", "--proof", "--base-archive", "--output", "--source-epoch"].includes(argv[i]) || !argv[i + 1])
      throw new Error("Use --candidate PATH --proof PATH --base-archive PATH --output NEW_DIRECTORY --source-epoch UNIX_SECONDS.");
    if (result[argv[i]]) throw new Error("Duplicate package argument.");
    result[argv[i]] = argv[i + 1];
  }
  for (const name of ["--candidate", "--proof", "--base-archive", "--output", "--source-epoch"])
    if (!result[name]) throw new Error(`Missing package argument: ${name}.`);
  if (!/^[0-9]+$/.test(result["--source-epoch"]) || !Number.isSafeInteger(Number(result["--source-epoch"])) || Number(result["--source-epoch"]) > 253402300799)
    throw new Error("The package source epoch must be a valid UNIX time.");
  return result;
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === "--help") {
    console.log("Export a full passing Apple Silicon candidate with ad-hoc installation signatures.\nnode scripts/package-macos-runtime.mjs --candidate PATH --proof PATH --base-archive PATH --output NEW_DIRECTORY --source-epoch UNIX_SECONDS\nNo installation, Developer ID signing, notarization, game saves or gameplay certification.");
    return;
  }
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("Runtime export requires actual macOS Apple Silicon; Linux proofs cannot produce a signed Mac package.");
  const args = options(argv);
  const candidate = resolve(args["--candidate"]);
  const proofPath = resolve(args["--proof"]);
  const archive = resolve(args["--base-archive"]);
  const output = resolve(args["--output"]);
  const epoch = Number(args["--source-epoch"]);
  const manifest = await verifyDerivedRuntime(candidate, resolve(project, "rules/extensions/barkham"));
  const proof = JSON.parse(await readFile(proofPath, "utf8"));
  assertNativePackageProof(manifest, proof, await sha256(resolve(project, "rules/tests/ChronicleFullSpec.hs")));
  if (await sha256(archive) !== baseArchiveSha256) throw new Error("The base archive does not match the pinned release checksum.");
  const originalSignature = await capture("codesign", ["-dv", "--verbose=4", resolve(candidate, "bin/arkham-api")]);
  if (!/^Signature=adhoc$/m.test(originalSignature)) throw new Error("This export route preserves the existing ad-hoc candidate; another signing identity needs a separate verified release route.");
  await capture("codesign", ["--verify", "--strict", resolve(candidate, "bin/arkham-api")]);
  await mkdir(output, { mode: 0o700 }); // Refuse overwriting any previous artifact.
  const base = resolve(output, ".base");
  const payload = resolve(output, ".payload");
  const game = resolve(payload, "game");
  try {
    await mkdir(base);
    await mkdir(game, { recursive: true, mode: 0o755 });
    await capture("tar", ["-xzf", archive, "-C", base]);
    const baseGame = resolve(base, "game");
    // Approve only selected immutable base roots, permitting cross-library
    // links without authorizing the archive's config/backup/data directories.
    const baseSelections = ["lib", "pgsql/bin", "pgsql/lib", "pgsql/share", "data/setup.sql"];
    const baseRoots = [];
    for (const path of baseSelections)
      baseRoots.push(await immutablePackageInput(baseGame, path, path === "data/setup.sql" ? "file" : "directory"));
    for (let index = 0; index < baseSelections.length; index++)
      await materializePackageTree(baseRoots[index], resolve(game, baseSelections[index]), baseRoots);
    // A candidate can contain private config/saves outside these inputs.
    // Each selected path must be real, and nested links stay in its own tree.
    for (const path of ["bin/arkham-api", "frontend/dist", "chronicle-runtime.json", "chronicle-presentation.json"]) {
      const input = await immutablePackageInput(candidate, path, path === "frontend/dist" ? "directory" : "file");
      await materializePackageTree(input, resolve(game, path), input);
    }
    await mkdir(resolve(game, "config"), { mode: 0o700 });
    const files = await packageFiles(game);
    const baseRelocations = await relocateBaseLibraries(game, files);
    const binaries = await verifyRelocatableLoads(game, files);
    if (!binaries.some(binary => binary.path === "bin/arkham-api"))
      throw new Error("The exported native API is not an actual arm64 Mach-O executable.");
    for (const binary of binaries) {
      if (binary.path !== "bin/arkham-api")
        await capture("codesign", ["--force", "--sign", "-", binary.full]);
      await capture("codesign", ["--verify", "--strict", binary.full]);
      if (!/^Signature=adhoc$/m.test(await capture("codesign", ["-dv", "--verbose=4", binary.full])))
        throw new Error("An exported Mach-O dependency is missing its ad-hoc installation signature.");
    }
    await verifyDerivedRuntime(game, resolve(project, "rules/extensions/barkham"));
    const inventory = [];
    for (const path of files) inventory.push({ path, sha256: await sha256(resolve(game, path)), bytes: (await stat(resolve(game, path))).size });
    await copyFile(proofPath, resolve(payload, "rules-behavior-tests.json"));
    const metadata = {
      schema: 1, kind: "chronicle-macos-runtime-archive", platform: "darwin", architecture: "arm64",
      upstreamRevision, extensions: manifest.extensions, sourceEpoch: epoch,
      binarySha256: manifest.binarySha256, extensionSourceSha256: manifest.extensionSourceSha256,
      nativeEngineSha256: manifest.nativeEngineSha256,
      testDriverSha256: proof.testDriverSha256, testBinarySha256: proof.testBinarySha256,
      inputManifestSha256: await sha256(resolve(candidate, "chronicle-runtime.json")),
      nativeBehaviorProofSha256: await sha256(proofPath), nativeExamples: proof.examples,
      signature: "ad-hoc installation signing", strictSignatureVerified: true, signedMachOCount: binaries.length,
      baseRelocations,
      developerIdSigned: false, notarized: false, installed: false, gameplayCertified: false,
      savesIncluded: false, sessionKeysIncluded: false, inventory,
    };
    await writeFile(resolve(payload, "chronicle-package.json"), JSON.stringify(metadata, null, 2) + "\n");
    async function normalize(path) {
      const info = await lstat(path);
      if (info.isDirectory()) for (const name of (await readdir(path)).sort()) await normalize(resolve(path, name));
      await utimes(path, epoch, epoch);
    }
    await normalize(payload);
    const tarPath = resolve(output, ".runtime.tar");
    await capture("tar", ["-cf", tarPath, "--uid", "0", "--gid", "0", "--uname", "root", "--gname", "wheel", "-C", payload, "game", "rules-behavior-tests.json", "chronicle-package.json"]);
    const archiveName = "Chronicle-rules-macos-arm64.tar.gz";
    await pipeline(createReadStream(tarPath), createGzip({ level: 9 }), createWriteStream(resolve(output, archiveName), { mode: 0o600 }));
    await writeFile(resolve(output, "SHA256SUMS"), `${await sha256(resolve(output, archiveName))}  ${archiveName}\n`);
    await copyFile(resolve(payload, "chronicle-package.json"), resolve(output, "chronicle-package.json"));
    await copyFile(proofPath, resolve(output, "rules-behavior-tests.json"));
    await rm(tarPath);
    console.log(`Verified ad-hoc Apple Silicon archive: ${resolve(output, archiveName)}\nNative examples: ${proof.examples}. Installation and gameplay certification remain separate.`);
  } catch (error) {
    for (const name of ["Chronicle-rules-macos-arm64.tar.gz", "SHA256SUMS", "chronicle-package.json", "rules-behavior-tests.json"])
      await rm(resolve(output, name), { force: true });
    await writeFile(resolve(output, "package-failure.json"), JSON.stringify({ schema: 1, passed: false, message: error.message }, null, 2) + "\n");
    throw error;
  } finally {
    await rm(base, { recursive: true, force: true });
    await rm(payload, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
