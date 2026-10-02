export const presentationRevision: string;
export function readLocaleTree(frontend: string): Promise<Record<string, unknown>>;
export function buildCompanionPresentation(source: string, destination: string): Promise<{
  sourceRevision: string;
  strings: Record<string, string>;
  scenarioSettings: Record<string, unknown[]>;
  campaignSettings: Record<string, unknown[]>;
  sideStories: unknown[];
}>;
