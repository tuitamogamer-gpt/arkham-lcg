// Tindalos's Epic location definition already names the revealed `b` printing.
// Its other printed face is 87005. A suffix alone is not a face indicator:
// letter-disambiguated acts such as 03276b have a distinct 03276bb reverse.
export function reverseCardPrinting(art, cardType) {
  if (
    art === "87005b" &&
    (cardType === "LocationType" || cardType === "location")
  )
    return "87005";
  return `${art}b`;
}

export function nativeCardArtworkPath(definition, reverse = false) {
  if (reverse && definition.customBack) return `backs/${definition.customBack}`;
  const art = reverse
    ? reverseCardPrinting(definition.art, definition.cardType)
    : definition.art;
  return `cards/${art}.avif`;
}
