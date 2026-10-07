export function externalCardImage(
  url: string,
): { code: string; url: string } | null;
export function installEpicArtworkCapture(page: any): Promise<void>;
export function classifyEpicArtworkEvidence(options: any): {
  documentId: string | number;
  documentNonce: string | null;
  evidence: any[];
  classifiedErrorIndexes: number[];
  classifiedFailureIndexes: number[];
};
export function verifyEpicArtwork(
  page: any,
  options: any,
): Promise<ReturnType<typeof classifyEpicArtworkEvidence>>;
export function replaceEpicArtworkIndexes(options: any): void;
