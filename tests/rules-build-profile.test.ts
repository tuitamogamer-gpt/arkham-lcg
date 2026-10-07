import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const build = resolve("scripts/build-rules-runtime.mjs");

async function rejectedBeforeRestoration(
  args: string[],
  message: RegExp,
  nodeArgs: string[] = [],
) {
  const directory = await mkdtemp(join(tmpdir(), "chronicle-build-profile-"));
  try {
    await assert.rejects(
      execute(process.execPath, [...nodeArgs, build, ...args], {
        env: {
          ...process.env,
          ARKHAM_RULES_SOURCE: join(directory, "source"),
          ARKHAM_RULES_TOOLCHAIN: join(directory, "toolchain"),
        },
        timeout: 5000,
      }),
      (error: unknown) => {
        assert.match((error as Error & { stderr: string }).stderr, message);
        return true;
      },
    );
    assert.deepEqual(
      await readdir(directory),
      [],
      "rejected build must not restore source or toolchain",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a private compilation check cannot prepare or publish runtime capabilities", async () => {
  for (const mode of [
    "--prepare-only",
    "--package-built",
    "--publish-candidate",
  ])
    await rejectedBeforeRestoration(
      ["--compile-only", mode],
      /cannot prepare, recover or publish/,
    );
});

test(
  "Linux native builds require the compilation-only profile before restoration",
  {
    skip: process.platform !== "linux" || process.arch !== "x64",
  },
  async () => {
    await rejectedBeforeRestoration(
      ["--with-epic-machinations", "--test"],
      /Linux native builds require --compile-only/,
    );
    await rejectedBeforeRestoration(
      ["--publish-candidate", "/missing/.candidate-123"],
      /Publishing a signed runtime requires macOS/,
    );
  },
);

test("unsupported native platforms reject before restoring source or clearing proof", async () => {
  for (const [platform, arch] of [
    ["linux", "arm64"],
    ["darwin", "x64"],
    ["win32", "x64"],
  ]) {
    const preload =
      "data:text/javascript," +
      encodeURIComponent(
        `Object.defineProperty(process, "platform", {value: ${JSON.stringify(platform)}});` +
          `Object.defineProperty(process, "arch", {value: ${JSON.stringify(arch)}});`,
      );
    await rejectedBeforeRestoration(
      ["--compile-only"],
      /Native compilation supports macOS Apple Silicon and Linux x86_64/,
      ["--import", preload],
    );
  }
});

test("coordinator checks require their real suites and cannot prepare runtime capabilities", async () => {
  await rejectedBeforeRestoration(
    ["--coordinator-tests"],
    /requires an Epic extension selection/,
  );
  await rejectedBeforeRestoration(
    ["--coordinator-tests", "--with-epic-machinations", "--direct-objects"],
    /cannot combine/,
  );
  for (const mode of [
    "--prepare-only",
    "--package-built",
    "--publish-candidate",
  ])
    await rejectedBeforeRestoration(
      ["--coordinator-tests", "--with-epic-machinations", mode],
      /cannot prepare, recover or publish/,
    );
});
