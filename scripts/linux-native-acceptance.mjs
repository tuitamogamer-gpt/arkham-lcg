#!/usr/bin/env node
// Reproducible private Linux API acceptance against the real full aggregate.
// The ordinary launcher and its distribution/capability gates stay unchanged.
import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdir,
  symlink,
  copyFile,
  cp,
  access,
  realpath,
} from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  verifyNativeQaManifest,
  qaFileSha256,
} from "./rules-qa-runtime-identity.mjs";
import { buildCompanionPresentation } from "./build-companion-presentation.mjs";

if (process.argv.includes("--help")) {
  console.log(`Private real Linux aggregate API QA; no distribution/capability installation.
ARKHAM_RULES_QA_PG_PREFIX=<full PostgreSQL 14.15 prefix> node scripts/linux-native-acceptance.mjs --prepare
node scripts/linux-native-acceptance.mjs --start
Required before preparation: passing --compile-only --with-epic-machinations --test aggregate proof and retained full test executable/objects/source. Build the private client with VITE_ARKHAM_RULES_URL=http://127.0.0.1:5494 npm run build (match any overridden private bridge port) before --prepare copies dist.
Optional: ARKHAM_RULES_QA_DIR=<isolated directory under project output>, ARKHAM_RULES_QA_NATIVE_PROOF, ARKHAM_RULES_SOURCE. Ports default to 5494/5495/5496; override ARKHAM_RULES_PORT, ARKHAM_RULES_API_PORT, ARKHAM_RULES_PG_PORT. Data stays in <QA_DIR>/data; terminate the launcher to stop its managed API/database, then --start again for persistence QA. Use <QA_DIR>/runtime/chronicle-native-qa.json as ARKHAM_RULES_QA_MANIFEST in acceptance scripts. PostgreSQL must be run as a non-root user.`);
  process.exit(0);
}
assert.equal(process.platform, "linux");
assert.equal(process.arch, "x64");
assert.ok(
  process.getuid?.() !== 0,
  "Private PostgreSQL QA requires a non-root user.",
);
assert.ok(
  process.argv.length === 3 &&
    ["--prepare", "--start"].includes(process.argv[2]),
  "Choose exactly --prepare or --start.",
);
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(project, "output");
const qa = resolve(
  process.env.ARKHAM_RULES_QA_DIR ||
    resolve(outputRoot, "native-api-acceptance"),
);
assert.ok(
  qa.startsWith(outputRoot + sep) && qa !== resolve(outputRoot, "rules-server"),
  "Use an isolated QA directory under this project's output.",
);
await mkdir(qa, { recursive: true, mode: 0o700 });
assert.ok(
  (await realpath(qa)).startsWith((await realpath(outputRoot)) + sep),
  "Private QA cannot link outside project output.",
);
const runtime = resolve(qa, "runtime");
const manifestPath = resolve(runtime, "chronicle-native-qa.json");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const runFile = promisify(execFile);

if (process.argv[2] === "--prepare") {
  const proofPath = resolve(
    process.env.ARKHAM_RULES_QA_NATIVE_PROOF ||
      resolve(project, "output/rules-server/rules-native-check.json"),
  );
  const proofBytes = await readFile(proofPath);
  const proof = JSON.parse(proofBytes);
  assert.equal(proof.scope, "native-aggregate");
  assert.equal(proof.fullAggregateBehaviorTested, true);
  const manifest = {
    schema: 1,
    kind: "chronicle-linux-native-qa",
    scope: "native-acceptance",
    platform: "linux",
    architecture: "x64",
    packaged: false,
    installed: false,
    capabilityCertified: false,
    upstreamRevision: proof.upstreamRevision,
    extensions: proof.extensions,
    binary: proof.binary,
    binarySha256: proof.nativeEngineSha256,
    extensionSourceSha256: proof.extensionSourceSha256,
    extensionSourceHashes: proof.extensionSourceHashes,
    nativeProof: { path: proofPath, sha256: sha(proofBytes) },
    note: "Private real Linux aggregate acceptance only; no signed macOS distribution, installation or production capability claim.",
  };
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", {
    mode: 0o600,
  });
  await mkdir(resolve(runtime, "bin"), { recursive: true, mode: 0o700 });
  try {
    await symlink(proof.binary, resolve(runtime, "bin/arkham-api"));
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  await verifyNativeQaManifest(manifestPath);
  assert.ok(
    process.env.ARKHAM_RULES_QA_PG_PREFIX,
    "Provide ARKHAM_RULES_QA_PG_PREFIX containing real PostgreSQL 14.15 server/client tools.",
  );
  const pg = await realpath(resolve(process.env.ARKHAM_RULES_QA_PG_PREFIX));
  for (const tool of ["postgres", "initdb", "pg_ctl", "psql", "pg_dump"])
    await access(resolve(pg, "bin", tool));
  assert.match(
    (await runFile(resolve(pg, "bin/postgres"), ["--version"])).stdout,
    /PostgreSQL\) 14\.15/,
  );
  for (const directory of ["bin", "config", "data", "lib", "frontend/dist"])
    await mkdir(resolve(runtime, directory), { recursive: true, mode: 0o700 });
  async function link(target, path) {
    try {
      await symlink(target, path);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      assert.equal(
        await realpath(path),
        await realpath(target),
        "Retained QA symlink must match this exact candidate.",
      );
    }
  }
  await link(proof.binary, resolve(runtime, "bin/arkham-api"));
  await link(pg, resolve(runtime, "pgsql"));
  await access(resolve(project, "dist/index.html"));
  await cp(resolve(project, "dist"), resolve(runtime, "frontend/dist"), {
    recursive: true,
  });
  await writeFile(
    resolve(runtime, "frontend/dist/source_hash"),
    `private-linux-native-qa:${proof.upstreamRevision}\n`,
    { mode: 0o600 },
  );
  const input = JSON.parse(
    await readFile(
      resolve(project, "output/rules-server/rules-build-input.json"),
      "utf8",
    ),
  );
  const source = resolve(process.env.ARKHAM_RULES_SOURCE || input.source);
  assert.equal(await realpath(source), await realpath(input.source));
  const baseMigrations = [
    [
      "arkham_epic",
      "6dbb6db4470a576739d26723bf7fd3cfb0fbf060af0a1995db9cdcd80c2ac016",
    ],
    [
      "arkham_game_undo_floors",
      "06f7ead20709a810a236fd32b2d1d1e570952df44b9e9fcac6f6698710655668",
    ],
    [
      "arkham_achievements",
      "c745fa471206e18c18587f0d72484c279fb8acd8a21f567775949833144d87b7",
    ],
  ];
  let setup = await readFile(resolve(source, "setup.sql"), "utf8");
  for (const [name, expected] of baseMigrations) {
    const sql = await readFile(
      resolve(source, "migrations/deploy", name + ".sql"),
    );
    assert.equal(
      sha(sql),
      expected,
      `Private QA requires the exact pinned ${name} migration.`,
    );
    // pg_dump's setup leaves search_path empty; standalone migration files
    // normally run in fresh psql sessions with the public schema selected.
    setup += "\nSET search_path = public;\n" + sql.toString("utf8");
  }
  await writeFile(resolve(runtime, "data/setup.sql"), setup, { mode: 0o600 });
  const migrationDir = resolve(
    qa,
    "data/migrations",
    proof.upstreamRevision.slice(0, 7),
  );
  await mkdir(migrationDir, { recursive: true, mode: 0o700 });
  for (const name of [
    "arkham_custom_cards",
    "arkham_custom_card_sets",
    "arkham_published_card_sets",
    "arkham_published_card_set_likes",
    "arkham_api_keys",
    "arkham_deck_overlay",
    "add_last_used_at_to_decks",
    "add_phase_transition_notifications_to_users",
  ])
    await copyFile(
      resolve(source, "migrations/deploy", name + ".sql"),
      resolve(migrationDir, name + ".sql"),
    );
  await buildCompanionPresentation(
    source,
    resolve(runtime, "chronicle-presentation.json"),
  );
  await writeFile(
    resolve(qa, "private-runtime-verifier.mjs"),
    `import {verifyNativeQaManifest} from ${JSON.stringify(pathToFileURL(resolve(project, "scripts/rules-qa-runtime-identity.mjs")).href)};\nimport {resolve} from 'node:path';\nexport async function verifyPrivateLinuxQaRuntime(runtime) { return verifyNativeQaManifest(resolve(runtime, 'chronicle-native-qa.json')); }\n`,
    { mode: 0o600 },
  );
  let bridge = await readFile(
    resolve(project, "scripts/rules-server.mjs"),
    "utf8",
  );
  const sourceSha256 = sha(bridge);
  const replaceOne = (before, after) => {
    assert.equal(
      bridge.split(before).length,
      2,
      "Expected one exact private bridge bootstrap seam.",
    );
    bridge = bridge.replace(before, after);
  };
  replaceOne(
    "import { verifyDerivedRuntime } from './rules-runtime-manifest.mjs';",
    "import { verifyPrivateLinuxQaRuntime as verifyDerivedRuntime } from './private-runtime-verifier.mjs';",
  );
  bridge = bridge.replace(/from '(\.\/[a-z0-9-]+\.mjs)'/g, (match, path) =>
    path === "./private-runtime-verifier.mjs"
      ? match
      : `from ${JSON.stringify(pathToFileURL(resolve(project, "scripts", path)).href)}`,
  );
  replaceOne(
    "const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');",
    `const project = ${JSON.stringify(project)};`,
  );
  replaceOne(
    "json(res, 200, { ready: (await fetch(`${apiUrl}/health`)).ok, extensions:",
    "json(res, 200, { runtimeScope: 'native-acceptance', platform: 'linux', capabilityCertified: false, privateQa: true, ready: (await fetch(`${apiUrl}/health`)).ok, extensions:",
  );
  replaceOne(
    "`Chronicle + Barkham (${derivedManifest.upstreamRevision.slice(0, 7)})`",
    "`Private Linux native acceptance (${derivedManifest.upstreamRevision.slice(0, 7)})`",
  );
  await writeFile(resolve(qa, "bridge.mjs"), bridge, { mode: 0o600 });
  await writeFile(
    resolve(qa, "bridge-adaptation.json"),
    JSON.stringify(
      {
        scope: "private-linux-native-acceptance",
        originalSource: "scripts/rules-server.mjs",
        sourceSha256,
        privateBridgeSha256: sha(bridge),
        nativeManifest: manifestPath,
        modifications: [
          "Private full aggregate verifier; never a normal distribution manifest",
          "Absolute original module imports/project path",
          "Explicit private Linux QA status label",
        ],
        upstreamFrontendBuilt: false,
        apiStubbed: false,
        databaseStubbed: false,
        setupSqlSha256: sha(setup),
        presentationSha256: await qaFileSha256(
          resolve(runtime, "chronicle-presentation.json"),
        ),
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(`Private full aggregate API runtime prepared: ${manifestPath}`);
} else {
  await verifyNativeQaManifest(manifestPath);
  const adaptation = JSON.parse(
    await readFile(resolve(qa, "bridge-adaptation.json"), "utf8"),
  );
  assert.equal(
    await qaFileSha256(resolve(project, "scripts/rules-server.mjs")),
    adaptation.sourceSha256,
    "Original bridge changed; prepare the private adapter again.",
  );
  assert.equal(
    await qaFileSha256(resolve(qa, "bridge.mjs")),
    adaptation.privateBridgeSha256,
  );
  const pgData = resolve(qa, "data/pgdata");
  const postmasterPath = resolve(pgData, "postmaster.pid");
  let previousPostmaster;
  try {
    previousPostmaster = await readFile(postmasterPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const child = spawn(process.execPath, [resolve(qa, "bridge.mjs")], {
    cwd: project,
    stdio: "inherit",
    env: {
      ...process.env,
      ARKHAM_RULES_RUNTIME: runtime,
      ARKHAM_RULES_DATA_DIR: resolve(qa, "data"),
      ARKHAM_RULES_PORT: process.env.ARKHAM_RULES_PORT || "5494",
      ARKHAM_RULES_API_PORT: process.env.ARKHAM_RULES_API_PORT || "5495",
      ARKHAM_RULES_PG_PORT: process.env.ARKHAM_RULES_PG_PORT || "5496",
      ARKHAM_RULES_API_URL: "",
    },
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", async (code) => {
    const exitCode = code ?? 1;
    // Startup may fail before the original bridge installs its signal
    // handlers. Stop only this private cluster if it was already launched.
    if (exitCode !== 0) {
      try {
        const currentPostmaster = await readFile(postmasterPath, "utf8");
        if (currentPostmaster === previousPostmaster) {
          // A duplicate start can fail its port check while an earlier launcher
          // still owns this cluster. Its unchanged identity is never ours.
          process.exitCode = exitCode;
          return;
        }
        await runFile(
          resolve(runtime, "pgsql/bin/pg_ctl"),
          ["-D", pgData, "-m", "fast", "-w", "stop"],
          { timeout: 15000 },
        );
      } catch (error) {
        if (error.code !== "ENOENT")
          console.error(`Private PostgreSQL cleanup: ${error.message}`);
      }
    }
    process.exitCode = exitCode;
  });
}
