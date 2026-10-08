export type RuntimeLoadPathOptions = {
  toolchainRoots: string[];
  rpathRoots?: string[];
};
export type RuntimeLoadPathPlan = {
  edits: Array<{
    offset: number;
    length: number;
    original: string;
    replacement: string;
    kind: "rpath" | "dylib";
  }>;
  dependencies: string[];
  rpaths: string[];
};
export function planRuntimeLoadPathEdits(
  header: Buffer,
  commands: Buffer,
  options: RuntimeLoadPathOptions,
): RuntimeLoadPathPlan;
export function rewriteRuntimeLoadPaths(
  path: string,
  options: RuntimeLoadPathOptions,
): Promise<RuntimeLoadPathPlan>;
