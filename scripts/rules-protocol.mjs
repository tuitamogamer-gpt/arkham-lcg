/** Original Chronicle boundary for namespaced extension cards. */
export function engineCardCode(code) {
  return typeof code === "string"
    ? code.replace(/^barkham-(\d{3})$/, ":barkham:$1")
    : code;
}

export function catalogCardCode(code) {
  return typeof code === "string"
    ? code
        .replace(/^c(?=[:\d])/, "")
        .replace(/^:barkham:(\d{3})$/, "barkham-$1")
    : code;
}

/** Preserve printing identity, side decks and choices at the API boundary. */
export function engineDeckList(deck) {
  const slots = (value) =>
    Object.fromEntries(
      Object.entries(value || {}).map(([code, count]) => [
        engineCardCode(code),
        count,
      ]),
    );
  let meta = deck.meta;
  if (typeof meta === "string") meta = JSON.parse(meta);
  if (meta) {
    meta = { ...meta };
    for (const key of ["alternate_front", "alternate_back"])
      if (meta[key]) meta[key] = engineCardCode(meta[key]);
  }
  return {
    ...deck,
    investigator_code: engineCardCode(deck.investigator_code),
    slots: slots(deck.slots),
    ...(deck.sideSlots ? { sideSlots: slots(deck.sideSlots) } : {}),
    ...(meta ? { meta: JSON.stringify(meta) } : {}),
  };
}
