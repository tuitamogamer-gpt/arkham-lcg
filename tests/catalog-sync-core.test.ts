import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
// @ts-expect-error The import boundary is the plain-JavaScript CLI exercised below.
import { sync } from "../scripts/sync-cards.mjs";

const originalCore = await readFile("public/data/core-2026.json");
const originalSource = await readFile("public/data/source.json");
const digest = (body: Uint8Array) =>
  createHash("sha256").update(body).digest("hex");
const json = (path: string) => readFile(path, "utf8").then(JSON.parse);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "arkham-catalog-core-"));
  const source = join(directory, "source"),
    dest = join(directory, "catalog");
  await mkdir(join(source, "pack"), { recursive: true });
  await mkdir(dest);
  const core = JSON.parse(originalCore.toString());
  core.find((card: any) => card.code === "12138").text =
    "Updated reference-only printed rules.";
  const files: Record<string, unknown> = {
    "packs.json": [
      {
        code: "core_2026",
        name: "Core Set (2026)",
        cycle_code: "core_ch2",
        date_release: "2026-03-20",
        position: 1,
      },
      {
        code: "ancestors",
        name: "Unreleased ancestor fixture",
        cycle_code: "core_ch2",
        date_release: "2099-01-01",
        position: 2,
      },
    ],
    "cycles.json": [{ code: "core_ch2", name: "Core Set" }],
    "encounters.json": [],
    "factions.json": [],
    "types.json": [],
    "subtypes.json": [],
    "taboos.json": [],
    "pack/core.json": core,
    "pack/ancestors.json": [
      ...new Set(core.map((card: any) => card.duplicate_of).filter(Boolean)),
    ].map((code) => ({ code, pack_code: "ancestors" })),
  };
  for (const [name, value] of Object.entries(files))
    await writeFile(join(source, name), JSON.stringify(value));
  execFileSync("git", ["init", "--quiet", source]);
  execFileSync("git", ["-C", source, "add", "."]);
  execFileSync("git", [
    "-C",
    source,
    "-c",
    "user.name=Catalog test",
    "-c",
    "user.email=catalog-test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "catalog fixture",
  ]);
  return {
    directory,
    source,
    dest,
    options: {
      "source-dir": source,
      dest,
      "as-of": "2026-10-22",
      offline: true,
    },
  };
}

async function existingSnapshot(dest: string) {
  await writeFile(join(dest, "core-2026.json"), originalCore);
  await writeFile(join(dest, "source.json"), originalSource);
}

test("reference import updates catalog text while preserving both existing Core files byte-for-byte", async () => {
  const f = await fixture();
  try {
    await existingSnapshot(f.dest);
    await sync(f.options);
    assert.deepEqual(
      await readFile(join(f.dest, "core-2026.json")),
      originalCore,
    );
    assert.deepEqual(
      await readFile(join(f.dest, "source.json")),
      originalSource,
    );
    const source = await json(join(f.dest, "catalog-source.json"));
    assert.equal(source.asOf, "2026-10-22");
    assert.equal(source.coreSnapshot.policy, "preserved-runtime");
    assert.equal(source.coreSnapshot.sha256, digest(originalCore));
    assert.equal(source.coreSnapshot.sourceSha256, digest(originalSource));
    assert.deepEqual(source.coreSnapshot.catalogDifferenceCodes, ["12138"]);
    const catalog = await json(join(f.dest, "catalog.json"));
    const cards = (
      await Promise.all(
        catalog.cardFiles.map((path: string) =>
          json(join(f.dest, path.split("/").at(-1)!)),
        ),
      )
    ).flat();
    assert.equal(
      cards.find((card: any) => card.code === "12138").text,
      "Updated reference-only printed rules.",
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("missing, corrupt or inconsistent existing Core pairs stop before any catalog file is replaced", async () => {
  const f = await fixture();
  try {
    const sentinel = "catalog must remain byte-identical";
    for (const kind of [
      "missing-core",
      "missing-source",
      "corrupt-core",
      "corrupt-source",
      "mismatched-source",
      "orphan-catalog",
    ]) {
      for (const name of await readdir(f.dest)) await rm(join(f.dest, name));
      await existingSnapshot(f.dest);
      await writeFile(join(f.dest, "catalog.json"), sentinel);
      if (kind === "missing-core" || kind === "orphan-catalog")
        await rm(join(f.dest, "core-2026.json"));
      if (kind === "missing-source" || kind === "orphan-catalog")
        await rm(join(f.dest, "source.json"));
      if (kind === "corrupt-core")
        await writeFile(join(f.dest, "core-2026.json"), "{broken");
      if (kind === "corrupt-source")
        await writeFile(join(f.dest, "source.json"), "{broken");
      if (kind === "mismatched-source")
        await writeFile(
          join(f.dest, "source.json"),
          JSON.stringify({
            ...JSON.parse(originalSource.toString()),
            count: 1,
          }),
        );
      const before = new Map(
        await Promise.all(
          (await readdir(f.dest)).map(
            async (name) => [name, await readFile(join(f.dest, name))] as const,
          ),
        ),
      );
      await assert.rejects(sync(f.options), /existing Core snapshot/);
      assert.deepEqual(
        (await readdir(f.dest)).sort(),
        [...before.keys()].sort(),
        kind,
      );
      for (const [name, bytes] of before)
        assert.deepEqual(
          await readFile(join(f.dest, name)),
          bytes,
          `${kind}: ${name}`,
        );
    }
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("an empty destination initializes a separately hash-bound Core snapshot", async () => {
  const f = await fixture();
  try {
    await sync(f.options);
    const core = await readFile(join(f.dest, "core-2026.json"));
    const coreSource = await readFile(join(f.dest, "source.json"));
    const source = await json(join(f.dest, "catalog-source.json"));
    assert.equal(source.coreSnapshot.policy, "initialized-runtime");
    assert.equal(source.coreSnapshot.sha256, digest(core));
    assert.equal(source.coreSnapshot.sourceSha256, digest(coreSource));
    assert.deepEqual(source.coreSnapshot.catalogDifferenceCodes, []);
    assert.equal(
      JSON.parse(core.toString()).find((card: any) => card.code === "12138")
        .text,
      "Updated reference-only printed rules.",
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("an explicit runtime-data refresh updates Core and its provenance together", async () => {
  const f = await fixture();
  try {
    await existingSnapshot(f.dest);
    await sync({ ...f.options, "refresh-core": true });
    const core = await readFile(join(f.dest, "core-2026.json"));
    const coreSource = await readFile(join(f.dest, "source.json"));
    assert.notDeepEqual(core, originalCore);
    assert.notDeepEqual(coreSource, originalSource);
    const source = await json(join(f.dest, "catalog-source.json"));
    assert.equal(source.coreSnapshot.policy, "initialized-runtime");
    assert.equal(source.coreSnapshot.sha256, digest(core));
    assert.equal(source.coreSnapshot.sourceSha256, digest(coreSource));
    assert.equal(JSON.parse(coreSource.toString()).revision, source.revision);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
