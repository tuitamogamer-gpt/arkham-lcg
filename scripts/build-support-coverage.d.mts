import type {
  SupportCoverage,
  CoverageProvenance,
} from "../src/game/supportCoverage";
export function coverageProvenance(
  path: string,
  project: string,
  sha256: string,
): CoverageProvenance;
export function declaredBuilders(
  text: string,
  kind: string,
): { name: string; code?: string }[];
export function catalogRegistryCoverage(
  cards: {
    code: string;
    type_code: string;
    hidden?: boolean;
    miniature?: boolean;
    encounter_code?: string;
  }[],
  registry?: { supportedCardCodes: string[] } | null,
): Pick<
  SupportCoverage["catalog"],
  | "visibleNonMiniNonKeyRecords"
  | "capturedRegistryCodeMatches"
  | "capturedRegistryCodeMismatches"
  | "unmatchedPlayerDeckDefinitions"
>;
export function legalAttemptCoverage(
  report: any,
  identity: any,
  provenance: CoverageProvenance,
): SupportCoverage["evidence"]["legalAttempts"][number];
export function focusedBehaviorCoverage(
  proof: any,
  manifest: any,
  provenance: CoverageProvenance,
): SupportCoverage["evidence"]["focusedNativeTests"];
export function buildSupportCoverage(input?: {
  project?: string;
  source?: string;
  registryFile?: string;
  nativeQaManifestFile?: string;
  legalReportFiles?: string[];
  destination?: string;
}): Promise<SupportCoverage>;
