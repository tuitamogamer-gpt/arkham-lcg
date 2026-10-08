import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  planRuntimeLoadPathEdits,
  rewriteRuntimeLoadPaths,
} from "../scripts/rules-native-load-paths.mjs";

const toolchain =
  "/Users/runner/work/_temp/chronicle-native-1383926530/toolchain";
const source = "/Users/runner/work/_temp/chronicle-native-1383926530/source";
const base = "/Users/runner/work/_temp/chronicle-native-1383926530/base/game";
const libpq = toolchain + "/postgres/lib/libpq.5.dylib";
const persistent = "@loader_path/../lib/libpq.5.dylib";
const options = {
  toolchainRoots: [toolchain],
  rpathRoots: [toolchain, source, base],
};

function command(kind: number, path: string, reserve = 64) {
  const minimum = kind === 0x8000001c ? 12 : 24;
  const size =
    Math.ceil((minimum + Math.max(Buffer.byteLength(path) + 1, reserve)) / 8) *
    8;
  const bytes = Buffer.alloc(size);
  bytes.writeUInt32LE(kind, 0);
  bytes.writeUInt32LE(size, 4);
  bytes.writeUInt32LE(minimum, 8);
  if (minimum === 24) {
    bytes.writeUInt32LE(123, 12); // Timestamp/version metadata must survive.
    bytes.writeUInt32LE(0x5000e, 16);
    bytes.writeUInt32LE(0x50000, 20);
  }
  bytes.write(path, minimum, "utf8");
  return bytes;
}

function executable(commands: Buffer[]) {
  const header = Buffer.alloc(32);
  header.writeUInt32LE(0xfeedfacf, 0);
  header.writeUInt32LE(0x0100000c, 4);
  header.writeUInt32LE(2, 12);
  header.writeUInt32LE(commands.length, 16);
  header.writeUInt32LE(
    commands.reduce((total, bytes) => total + bytes.length, 0),
    20,
  );
  return Buffer.concat([header, ...commands, Buffer.alloc(64, 0xa5)]);
}

function plan(input: Buffer, selected = options) {
  return planRuntimeLoadPathEdits(
    input.subarray(0, 32),
    input.subarray(32, 32 + input.readUInt32LE(20)),
    selected,
  );
}

test("hosted ARM64 imports and bounded cache RPATHs use only fixed slots and retain other executable bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chronicle-macho-slots-"));
  try {
    const path = join(directory, "engine");
    const input = executable([
      command(0xc, libpq),
      command(0xc, "/usr/lib/libSystem.B.dylib"),
      command(0x8000001c, toolchain + "/stack-root/cache"),
      command(0x8000001c, source + "/backend/.chronicle-stack-work"),
      command(0x8000001c, base + "/lib"),
      command(0x8000001c, "/unapproved/external/search"),
      command(
        0x80000018,
        "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation",
      ),
    ]);
    const before = Buffer.from(input);
    const expected = plan(input);
    assert.deepEqual(input, before, "planning must not mutate any input");
    assert.equal(expected.edits.length, 4);
    await writeFile(path, input);
    const actual = await rewriteRuntimeLoadPaths(path, options);
    assert.deepEqual(actual, expected);
    const result = await readFile(path);
    assert.equal(
      result.length,
      before.length,
      "load commands/segments must never move",
    );
    for (let i = 0; i < result.length; i++)
      if (
        !actual.edits.some(
          (edit) => i >= edit.offset && i < edit.offset + edit.length,
        )
      )
        assert.equal(result[i], before[i], `non-path byte ${i} changed`);
    for (const edit of actual.edits) {
      const slot = result.subarray(edit.offset, edit.offset + edit.length);
      assert.equal(slot.toString("utf8", 0, slot.indexOf(0)), edit.replacement);
      assert.ok(
        slot
          .subarray(Buffer.byteLength(edit.replacement))
          .every((byte) => byte === 0),
      );
    }
    const rewritten = plan(result);
    assert.equal(
      rewritten.edits.length,
      0,
      "an already persistent import remains intact",
    );
    assert.ok(
      rewritten.rpaths.includes("/unapproved/external/search"),
      "unknown RPATH must remain for exporter rejection",
    );
    assert.ok(rewritten.dependencies.includes("/usr/lib/libSystem.B.dylib"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("only the configured and canonical root aliases or explicit padded @rpath libpq import are eligible", () => {
  const configured = "/tmp/chronicle-build-toolchain";
  const canonical = "/private/tmp/chronicle-build-toolchain";
  const aliases = {
    toolchainRoots: [configured, canonical],
    rpathRoots: [configured, canonical],
  };
  for (const path of [
    configured + "/postgres/lib/libpq.5.dylib",
    canonical + "/postgres/lib/libpq.5.dylib",
    "@rpath/libpq.5.dylib",
  ])
    assert.equal(
      plan(executable([command(0xc, path)]), aliases).edits[0].replacement,
      persistent,
    );
  for (const path of [
    "/Users/other/libpq.5.dylib",
    "/tmp/other/libpq.5.dylib",
    configured + "-other/postgres/lib/libpq.5.dylib",
    configured + "/postgres/lib/../lib/libpq.5.dylib",
    "@rpath/unapproved/libpq.5.dylib",
  ])
    assert.throws(
      () => plan(executable([command(0xc, path)]), aliases),
      /Unrecognized libpq import/,
    );
});

test("libpq must be exactly one strong import, never a dylib identity or duplicate/foreign registration", () => {
  for (const commands of [
    [command(0xc, "/usr/lib/libSystem.B.dylib")],
    [command(0xd, libpq)],
    [command(0xc, libpq), command(0xc, libpq)],
    [command(0x80000018, libpq)],
    [command(0xc, libpq), command(0xc, "/unapproved/libpq.dylib")],
  ])
    assert.throws(
      () => plan(executable(commands)),
      /exactly one|Unrecognized libpq import/,
    );
  assert.throws(
    () =>
      plan(
        executable([
          command(0xc, libpq),
          command(0xc, toolchain + "/ghc/lib/private.dylib"),
        ]),
      ),
    /non-libpq import/,
  );
});

test("thin executable headers and the whole load-command table reject wrong architecture, invalid sizes, offsets and termination", () => {
  const valid = executable([command(0xc, libpq)]);
  for (const [offset, value] of [
    [0, 0xcafebabe],
    [4, 0x01000007],
    [12, 6],
    [16, 0],
    [16, 4097],
    [20, 1024 * 1024 + 8],
    [36, 9],
    [40, 12],
  ]) {
    const input = Buffer.from(valid);
    input.writeUInt32LE(value, offset);
    assert.throws(() => plan(input), /Mach-O|arm64/);
  }
  assert.throws(
    () => planRuntimeLoadPathEdits(Buffer.alloc(8), Buffer.alloc(0), options),
    /thin/,
  );
  assert.throws(
    () =>
      planRuntimeLoadPathEdits(
        valid.subarray(0, 32),
        valid.subarray(32, 40),
        options,
      ),
    /Truncated/,
  );
  const unterminated = command(0xc, libpq);
  unterminated.fill(0xff, unterminated.readUInt32LE(8));
  assert.throws(
    () =>
      plan(
        executable([unterminated, command(0xc, "/usr/lib/libSystem.B.dylib")]),
      ),
    /Unterminated/,
  );
  const extra = Buffer.from(valid);
  extra.writeUInt32LE(extra.readUInt32LE(20) + 8, 20);
  assert.throws(() => plan(extra), /complete table/);
});

test("late invalid registrations, escaping RPATHs, short slots and truncation never write an earlier validated edit", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "chronicle-macho-no-partial-write-"),
  );
  try {
    const path = join(directory, "engine");
    const cases = [
      executable([
        command(0x8000001c, toolchain + "/cache"),
        command(0xc, libpq),
        command(0xc, libpq),
      ]),
      executable([
        command(0xc, libpq),
        command(0x8000001c, toolchain + "/../outside"),
      ]),
      executable([
        command(0x8000001c, toolchain + "/cache"),
        command(0xc, "@rpath/libpq.5.dylib", 1),
      ]),
      executable([
        command(0xc, libpq),
        command(0xc, "/unapproved/libpq.5.dylib"),
      ]),
      executable([command(0x8000001c, toolchain + "/cache")]),
      executable([command(0xc, libpq)]).subarray(0, 50),
    ];
    for (const input of cases) {
      await writeFile(path, input);
      await assert.rejects(
        rewriteRuntimeLoadPaths(path, options),
        /libpq|RPATH|slot|Truncated/,
      );
      assert.deepEqual(
        await readFile(path),
        input,
        "a rejected file must be byte-identical",
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("toolchain/RPATH authorization requires explicit normalized bounded roots", () => {
  const valid = executable([command(0xc, libpq)]);
  for (const roots of [
    [],
    ["/"],
    ["relative"],
    [toolchain + "/../other"],
    [toolchain + "\n"],
  ])
    assert.throws(
      () => plan(valid, { toolchainRoots: roots, rpathRoots: roots }),
      /roots|root/,
    );
});

test("the real checksum-pinned ARM64 psql header fits its exact private libpq replacement without moving commands", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/macos-pinned-psql-load-commands.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    fixture.baseArchiveSha256,
    "29061cbdb683cc7b98f56fc45cb64fbc3762e5a21796406c429a936033bacf39",
  );
  assert.equal(
    fixture.sourceBinarySha256,
    "98c2a47910c7420c38a6a18459be308696512341bfd520d7a7be3a26c7625bb6",
  );
  const header = Buffer.from(fixture.headerHex, "hex");
  const commands = Buffer.from(fixture.commandsHex, "hex");
  const before = Buffer.from(commands);
  const result = planRuntimeLoadPathEdits(header, commands, {
    toolchainRoots: [fixture.toolchainRoot],
  });
  assert.deepEqual(commands, before);
  assert.equal(result.edits.length, 1);
  assert.equal(
    result.edits[0].original,
    fixture.toolchainRoot + "/postgres/lib/libpq.5.dylib",
  );
  assert.equal(result.edits[0].replacement, persistent);
  assert.ok(Buffer.byteLength(persistent) + 1 <= result.edits[0].length);
  assert.ok(result.dependencies.includes("/usr/lib/libSystem.B.dylib"));
});
