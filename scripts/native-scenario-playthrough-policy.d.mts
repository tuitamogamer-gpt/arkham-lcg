export function assertOfferedAnswer(
  reply: any,
  question: any,
  participant: any,
): void;
export function assertLabyrinthResumeRoster(input: {
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
