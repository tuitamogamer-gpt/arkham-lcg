import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createBuildSpaceGuard, runWithBuildSpace } from "../scripts/rules-build-space.mjs";

test("native build checks each volume and the nearest existing ancestor before a child starts", async () => {
  const inspected: string[] = [];
  const check = createBuildSpaceGuard(["/project", "/cache/missing"], 2, async (path: string) => {
    inspected.push(path);
    if (path === "/cache/missing") throw Object.assign(new Error("missing"), { code: "ENOENT" });
    return { bavail: path === "/cache" ? 1 : 3, bsize: 1024 ** 3 };
  });
  let spawned = false;
  await assert.rejects(runWithBuildSpace(process.execPath, [], {}, check, {
    spawnChild: () => { spawned = true; throw new Error("must not spawn"); },
  }), /1\.00 GiB available at \/cache; preserve at least 2 GiB/);
  assert.deepEqual(inspected, ["/project", "/cache/missing", "/cache"]);
  assert.equal(spawned, false);
});

test("native build rejects invalid disk reserves", () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 33])
    assert.throws(() => createBuildSpaceGuard(["/project"], value), /reserve from 1 through 32/);
});

test("low space terminates a running native command that ignores SIGTERM", { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "chronicle-build-space-"));
  const ready = join(directory, "ready");
  let childPid: number | undefined;
  const stopped = new Error("disk reserve reached");
  const notifications: Error[] = [];
  try {
    await assert.rejects(runWithBuildSpace(process.execPath, ["--input-type=module", "-e", `
      import { writeFileSync } from "node:fs";
      process.on("SIGTERM", () => {});
      writeFileSync(${JSON.stringify(ready)}, "ready");
      setInterval(() => {}, 1000);
    `], { stdio: "ignore" }, async () => {
      if (await readFile(ready, "utf8").catch(() => "")) throw stopped;
    }, {
      pollIntervalMs: 10,
      killGraceMs: 30,
      spawnChild: (...args: Parameters<typeof spawn>) => {
        const child = spawn(...args);
        childPid = child.pid;
        return child;
      },
      onLowDisk: (error: Error) => notifications.push(error),
    }), (error: Error) => error === stopped);
    assert.deepEqual(notifications, [stopped]);
    assert.ok(childPid);
    assert.throws(() => process.kill(childPid!, 0), { code: "ESRCH" });
  } finally {
    if (childPid) {
      try { process.kill(-childPid, "SIGKILL"); } catch {}
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("low space still kills compiler descendants after their parent exits", { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "chronicle-build-descendant-"));
  const ready = join(directory, "ready");
  let descendantPid: number | undefined;
  try {
    await assert.rejects(runWithBuildSpace(process.execPath, ["--input-type=module", "-e", `
      import { spawn } from "node:child_process";
      spawn(process.execPath, ["--input-type=module", "-e", ${JSON.stringify(`
        import { writeFileSync } from "node:fs";
        process.on("SIGTERM", () => {});
        writeFileSync(${JSON.stringify(ready)}, String(process.pid));
        setInterval(() => {}, 1000);
      `)}], { stdio: "ignore" });
      setInterval(() => {}, 1000);
    `], { stdio: "ignore" }, async () => {
      const value = await readFile(ready, "utf8").catch(() => "");
      if (value) {
        descendantPid = Number(value);
        throw new Error("descendant disk reserve reached");
      }
    }, { pollIntervalMs: 10, killGraceMs: 30, onLowDisk: () => {} }), /descendant disk reserve reached/);
    await delay(100);
    assert.ok(descendantPid);
    try {
      process.kill(descendantPid, 0);
      // Container PID 1 may not reap an orphan after SIGKILL. A zombie has
      // exited and cannot compile or write, even though its PID still exists.
      assert.equal(process.platform, "linux", "the compiler descendant must exit");
      const status = await readFile(`/proc/${descendantPid}/status`, "utf8");
      assert.match(status, /^State:\s+Z\b/m, "the compiler descendant must not still run");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Linux may reap the orphan between the PID probe and the status read.
      if (code !== "ESRCH" && !(process.platform === "linux" && code === "ENOENT")) throw error;
    }
  } finally {
    if (descendantPid) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("interrupting the native build forwards cancellation and removes its signal handlers", { timeout: 10000 }, async () => {
  const before = process.listenerCount("SIGTERM");
  let childPid: number | undefined;
  try {
    await assert.rejects(runWithBuildSpace(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    }, async () => {}, {
      killGraceMs: 30,
      spawnChild: (...args: Parameters<typeof spawn>) => {
        const child = spawn(...args);
        childPid = child.pid;
        setTimeout(() => process.emit("SIGTERM"), 30);
        return child;
      },
    }), /interrupted \(SIGTERM\); compiled cache is retained/);
    assert.equal(process.listenerCount("SIGTERM"), before);
    assert.ok(childPid);
    assert.throws(() => process.kill(childPid!, 0), { code: "ESRCH" });
  } finally {
    if (childPid) {
      try { process.kill(-childPid, "SIGKILL"); } catch {}
    }
  }
});
