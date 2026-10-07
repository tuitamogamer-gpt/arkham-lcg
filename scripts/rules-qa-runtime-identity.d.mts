export const nativeQaKind: "chronicle-linux-native-qa";
export function qaFileSha256(path: string): Promise<string>;
export function verifyNativeQaManifest(
  path: string,
): Promise<Record<string, unknown>>;
export function acceptanceManifest(
  path: string,
): Promise<Record<string, unknown>>;
