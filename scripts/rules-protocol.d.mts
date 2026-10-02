export function engineCardCode(code: string): string;
export function catalogCardCode(code: string): string;
export function engineDeckList<
  T extends {
    investigator_code: string;
    slots: Record<string, number>;
    sideSlots?: Record<string, number>;
    meta?: string | Record<string, string>;
  },
>(deck: T): Omit<T, "meta"> & { meta?: string };
