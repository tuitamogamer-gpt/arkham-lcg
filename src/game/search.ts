/** Match words independently, ignoring accents and punctuation in catalog text. */
export function searchWords(value: string): string[] {
  return (
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || []
  );
}

export function matchesSearch(text: string, query: string): boolean {
  const normalized = searchWords(text).join(" ");
  return searchWords(query).every((word) => normalized.includes(word));
}
