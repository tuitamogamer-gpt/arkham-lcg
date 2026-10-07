import { spawn } from "node:child_process";
import { statfs } from "node:fs/promises";
import { dirname } from "node:path";

export function createBuildSpaceGuard(paths, reserveGiB = 1, inspect = statfs) {
  if (!Number.isFinite(reserveGiB) || reserveGiB < 1 || reserveGiB > 32)
    throw new Error("ARKHAM_RULES_DISK_RESERVE_GIB must be a reserve from 1 through 32 GiB.");
  const reserveBytes = reserveGiB * 1024 ** 3;
  return async function requireBuildSpace() {
    for (const target of new Set(paths)) {
      let path = target;
      let filesystem;
      for (;;) {
        try {
          filesystem = await inspect(path);
          break;
        } catch (error) {
          if (error.code !== "ENOENT" || dirname(path) === path) throw error;
          path = dirname(path);
        }
      }
      const available = filesystem.bavail * filesystem.bsize;
      if (available < reserveBytes)
        throw new Error(
          `Native build stopped with ${(available / 1024 ** 3).toFixed(2)} GiB available at ${path}; preserve at least ${reserveGiB} GiB free. Existing runtime, saves and compiled cache are retained.`,
        );
    }
  };
}

export async function runWithBuildSpace(command, args, spawnOptions, checkSpace, {
  pollIntervalMs = 2000,
  killGraceMs = 10000,
  spawnChild = spawn,
  onLowDisk = (error) => console.error(error.message),
} = {}) {
  await checkSpace();
  return new Promise((resolvePromise, reject) => {
    const child = spawnChild(command, args, { ...spawnOptions, detached: true });
    let spaceError;
    let interruptionError;
    let checkingSpace = false;
    let killTimer;
    let finished = false;
    function terminateGroup(signal) {
      try { process.kill(-child.pid, signal); }
      catch (error) { if (error.code !== "ESRCH") child.kill(signal); }
    }
    function interrupt(signal) {
      if (finished || interruptionError || spaceError) return;
      interruptionError = new Error(`${command} interrupted (${signal}); compiled cache is retained.`);
      terminateGroup(signal);
      killTimer = setTimeout(() => terminateGroup("SIGKILL"), killGraceMs);
    }
    const onInterrupt = () => interrupt("SIGINT");
    const onTerminate = () => interrupt("SIGTERM");
    process.on("SIGINT", onInterrupt);
    process.on("SIGTERM", onTerminate);
    const spaceTimer = setInterval(async () => {
      if (checkingSpace || spaceError || interruptionError) return;
      checkingSpace = true;
      try { await checkSpace(); }
      catch (error) {
        if (finished) return;
        spaceError = error;
        onLowDisk(error);
        terminateGroup("SIGTERM");
        // Keep this timer alive even if the parent command exits first: an
        // uncooperative compiler descendant may still own the process group.
        killTimer = setTimeout(() => terminateGroup("SIGKILL"), killGraceMs);
      } finally { checkingSpace = false; }
    }, pollIntervalMs);
    spaceTimer.unref();
    function cleanTimers() {
      finished = true;
      clearInterval(spaceTimer);
      process.removeListener("SIGINT", onInterrupt);
      process.removeListener("SIGTERM", onTerminate);
      if (!spaceError && !interruptionError) clearTimeout(killTimer);
    }
    child.on("error", (error) => { cleanTimers(); reject(error); });
    child.on("exit", (code, signal) => {
      cleanTimers();
      if (spaceError) reject(spaceError);
      else if (interruptionError) reject(interruptionError);
      else if (code === 0) resolvePromise();
      else reject(new Error(`${command} failed (${signal || code}).`));
    });
  });
}
