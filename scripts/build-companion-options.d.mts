export interface PlayOptionStatus {
  beta?: true;
  alpha?: true;
}
export interface ExtractedPlayOptions {
  sourceRevision: string;
  campaigns: (PlayOptionStatus & {
    id: string;
    name: string;
    returnTo?: PlayOptionStatus & { id: string };
    variants?: { key: string }[];
  })[];
  scenarios: (PlayOptionStatus & {
    id: string;
    name: string;
    campaign?: string;
    variant?: string;
    standaloneDifficulties?: string[];
  })[];
}
export function buildCompanionOptions(
  source: string,
  destination?: string,
  options?: {
    extensionScenarios?: {
      id: string;
      name: string;
      campaign?: string;
      beta?: boolean;
      alpha?: boolean;
      standaloneDifficulties?: string[];
    }[];
  },
): Promise<ExtractedPlayOptions>;
