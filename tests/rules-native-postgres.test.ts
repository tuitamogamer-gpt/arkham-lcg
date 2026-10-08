import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { postgresConfigureEnvironment, postgresSnprintfSource } from "../scripts/rules-native-postgres.mjs";

const execute = promisify(execFile);
// The pinned 14.15 fallback, following an SDK declaration that the target
// cannot call. A plain configure-cache override still collides with this name.
const source = `#include <assert.h>
#include <string.h>
extern char *strchrnul(const char *s, int c) __attribute__((unavailable));
#ifndef HAVE_STRCHRNUL

static inline const char *
strchrnul(const char *s, int c)
{
  while (*s != '\\0' && *s != c)
    s++;
  return s;
}
#endif
int main(void) {
  const char *s = "abc%def";
  assert(strchrnul(s, '%') == s + 3);
  assert(strchrnul(s, '?') == s + 7);
  assert(strchrnul(s, '\\0') == s + 7);
  assert(strchrnul(s, 'a') == s);
  assert(strchrnul("", '%')[0] == '\\0');
  return 0;
}
`;

test("macOS PostgreSQL selects its local fallback without changing compiler flags or the OS minimum", () => {
  const original = { PATH: "/private/compiler", CFLAGS: "-O2 -Werror", MACOSX_DEPLOYMENT_TARGET: "15.0", ac_cv_func_strchrnul: "yes" };
  const darwin = postgresConfigureEnvironment(original, "darwin");
  assert.deepEqual(darwin, { ...original, ac_cv_func_strchrnul: "no" });
  assert.equal(original.ac_cv_func_strchrnul, "yes");
  assert.deepEqual(postgresConfigureEnvironment(original, "linux"), original);
  assert.equal(postgresSnprintfSource(source, "linux"), source);
});

test("the macOS fallback compiles and runs with an unavailable conflicting SDK declaration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chronicle-postgres-sdk-"));
  try {
    const input = join(directory, "snprintf.c");
    const output = join(directory, "snprintf");
    const args = ["-std=c99", "-Wall", "-Wextra", "-Werror", input, "-o", output];
    await writeFile(input, source);
    await assert.rejects(execute("cc", args), /conflicting|redefinition|static declaration/i);
    await writeFile(input, postgresSnprintfSource(source, "darwin"));
    await execute("cc", args);
    await execute(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the macOS patch is idempotent and refuses changed pinned fallback definitions", () => {
  const patched = postgresSnprintfSource(source, "darwin");
  assert.equal(postgresSnprintfSource(patched, "darwin"), patched);
  for (const changed of ["", source.replace("strchrnul(const char *s, int c)\n{", "strchrnul(const char *s, long c)\n{"), source + source, source + patched])
    assert.throws(() => postgresSnprintfSource(changed, "darwin"), /Pinned PostgreSQL snprintf fallback differs/);
});
