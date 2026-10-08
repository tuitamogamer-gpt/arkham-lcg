export const baseArchiveSha256: string;
export function assertNativePackageProof(manifest: unknown, proof: unknown, driverSha256: string): void;
export function immutablePackageInput(root: string, selectedPath: string, kind: "directory" | "file"): Promise<string>;
export function materializePackageTree(source: string, target: string, approvedRoot?: string | string[], ancestors?: Set<string>): Promise<void>;
export function machoKind(header: Buffer): "arm64" | null;
export function machoLoadCommands(output: string): { dependencies: string[]; rpaths: string[]; installId: string | null };
export function baseDependencyReplacement(binaryPath: string, dependency: string): { target: string; replacement: string } | null;
export function baseInstallIdReplacement(binaryPath: string, installId: string, originalHashes: Map<string, string>): { canonical: string; replacement: string; originalSha256: string; canonicalOriginalSha256: string } | null;
