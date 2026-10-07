export interface EpicReadyStatus {
  eventId: string;
  readyMask: number;
  requiredMask: number;
  timerStartedAt: number;
  groupReady: boolean;
  ready: boolean;
}
export interface BoundEpicSeat {
  gameId: string;
  eventId: string;
  ordinal: number;
}
export function nativeEpicSetupComplete(snapshot: unknown): boolean;
export function requireEpicReadySeat(seat: BoundEpicSeat | null, gameId: string): BoundEpicSeat;
export function epicReadyStatus(event: unknown, seat: BoundEpicSeat): EpicReadyStatus;
export function companionEpicReady(
  seat: BoundEpicSeat | null,
  gameId: string,
  method: string,
  engine: (path: string, body: unknown, method: string) => Promise<unknown>,
): Promise<EpicReadyStatus>;
