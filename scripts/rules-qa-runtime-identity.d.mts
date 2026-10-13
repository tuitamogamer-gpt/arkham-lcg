export const nativeQaKind: "chronicle-linux-native-qa";
export function nativeAggregateExtensions(selected: string[]): string[];
export function nativeAggregateTestDriver(selected: string[]): string;
export function qaFileSha256(path: string): Promise<string>;
export function verifyNativeQaManifest(
  path: string,
): Promise<Record<string, unknown>>;
export function acceptanceManifest(
  path: string,
): Promise<Record<string, unknown>>;
