export function assertAddOnlyResumeBaseline(previous: any, current: any, expectedSha256: string): Record<string, number>;
export function assertEpicResumeStates(input: {
  states: {gameId: string; snapshot: any; resolution?: number}[]; validatedWinningReadGameIds: string[]; winningResolution: 1 | 4;
}): void;
export function epicReadResolution(question: any, scenarioKind: "labyrinth" | "machinations"): number | undefined;
export function captureEpicStoppedStates(input: {
  participants: any[]; previousStates?: any[]; capture: (participant: any) => Promise<any>;
}): Promise<{states: any[]; errors: {gameId: string; group?: string; message: string}[]; current: boolean}>;
export function selectSuccessfulInvestigationChoice(input: {
  snapshot: any; question: any;
}): {choice: any; reason: string} | undefined;
export function assertOfferedAnswer(
  reply: any,
  question: any,
  participant: any,
): void;
export function assertLabyrinthResumeRoster(input: {
  games: any[]; stoppedStates: any[]; eventId: string;
}): void;
export function assertMachinationsResumeRoster(input: {
  games: any[]; stoppedStates: any[]; eventId: string;
}): void;
export function assertLegalMutation(input: {
  path: string;
  method: string;
  body: any;
  participants: any[];
  importedDecks: Set<string>;
  question?: any;
}): string;
