/** Counts and recorded evidence, never an executable-capability allowlist. */
export interface CoverageProvenance {
  path: string;
  sha256: string;
}
export interface CoveragePlayMode {
  id: string;
  name: string;
  campaign?: string;
  variant?: string;
  beta?: true;
  alpha?: true;
  sourceBuilderDeclared: boolean;
}
export interface SupportCoverage {
  schemaVersion: 1;
  sourceRevision: string;
  catalog: {
    revision: string;
    cardDefinitions: number;
    products: number;
    visibleNonMiniNonKeyRecords: number;
    capturedRegistryCodeMatches: number | null;
    capturedRegistryCodeMismatches: number | null;
    unmatchedPlayerDeckDefinitions: number | null;
  };
  core: {
    scenarios: { id: string; name: string }[];
    investigatorCodes: string[];
    reachableScriptedCardCodes: string[];
    scope: string;
  };
  native: {
    declaredBuilders: Record<string, number>;
    sourceFiles: number;
    sourceSha256: string;
    campaignRegistryKeys: number;
    playModeCount: number;
    uniqueScenarioIds: number;
    campaigns: { id: string; name: string; beta?: true; alpha?: true }[];
    scenarios: CoveragePlayMode[];
    scenarioAliases: [string, string][];
  };
  evidence: {
    registry: null | {
      provenance: CoverageProvenance;
      scope: string;
      platform: string;
      recordedReady: boolean;
      binarySha256: string;
      extensionSourceSha256: string;
      supportedCodeAliases: number;
      investigatorCodes: number;
      scenarioReferenceCodes: number;
    };
    focusedNativeTests: null | {
      provenance: CoverageProvenance;
      examples: number;
      failures: 0;
      platform: string;
      verifiedAt: string;
      binarySha256: string;
      extensionSourceSha256: string;
      scope: string;
    };
    legalAttempts: {
      provenance: CoverageProvenance;
      scenario: string;
      passed: boolean;
      reportedWholeScenarioCompleted: boolean;
      wholeScenarioCompleted: boolean;
      status:
        | "incomplete"
        | "reported-complete"
        | "not-legal-proof"
        | "completion-unverified";
      setupOnly: boolean;
      identityMatches: boolean;
      observedNativeResolution: number | null;
      nativeGameEnded: boolean;
    }[];
    installation: {
      packaged: false;
      installed: false;
      capabilityCertified: false;
      scope: string;
    };
  };
  provenance: CoverageProvenance[];
  limitations: string[];
}
