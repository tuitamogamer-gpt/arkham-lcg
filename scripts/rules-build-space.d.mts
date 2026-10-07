import type { ChildProcess, SpawnOptions } from "node:child_process";

export function createBuildSpaceGuard(
  paths: string[],
  reserveGiB?: number,
  inspect?: (path: string) => Promise<{ bavail: number; bsize: number }>,
): () => Promise<void>;

export function runWithBuildSpace(
  command: string,
  args: readonly string[],
  spawnOptions: SpawnOptions,
  checkSpace: () => Promise<void>,
  options?: {
    pollIntervalMs?: number;
    killGraceMs?: number;
    spawnChild?: (
      command: string,
      args: readonly string[],
      options: SpawnOptions,
    ) => ChildProcess;
    onLowDisk?: (error: Error) => void;
  },
): Promise<void>;
