interface BarkhamInvestigatorState {
  cardCode: string;
  meta?: unknown;
}

// The marker follows Kate's serialized state, including after save/reload.
export function chronicleSniffedLocation(
  investigators: Record<string, BarkhamInvestigatorState>,
  locationId: string,
): boolean {
  return Object.values(investigators).some((investigator) => {
    if (investigator.cardCode.replace(/^c/, "") !== ":barkham:004") return false;
    if (!investigator.meta || typeof investigator.meta !== "object") return false;
    const locations = (investigator.meta as { sniffedLocations?: unknown })
      .sniffedLocations;
    return Array.isArray(locations) && locations.includes(locationId);
  });
}
