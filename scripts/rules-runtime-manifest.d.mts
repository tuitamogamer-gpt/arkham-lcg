export interface DerivedRuntimeManifest {
  schema: number;
  kind: string;
  upstreamRevision: string;
  extensions: string[];
  binarySha256: string;
  frontendSourceHash: string;
  extensionSourceSha256: string;
  extensionSourceHashes?: Record<string, string>;
  presentationSha256?: string;
}
export function extensionSourceHash(path: string): Promise<string>;
export function verifyDerivedRuntime(
  runtime: string,
  extension?: string,
): Promise<DerivedRuntimeManifest | null>;
