import type { TripLeg, TripStop } from "./tripData";

export function routeDataSignature(legs: TripLeg[], selectedStopId: string, lookup: Map<string, TripStop>) {
  const legSignature = legs
    .map((leg) => {
      const from = lookup.get(leg.from);
      const to = lookup.get(leg.to);
      return [
        leg.id,
        leg.mode,
        leg.from,
        leg.to,
        from?.coordinates[0].toFixed(5) ?? "",
        from?.coordinates[1].toFixed(5) ?? "",
        to?.coordinates[0].toFixed(5) ?? "",
        to?.coordinates[1].toFixed(5) ?? "",
      ].join(":");
    })
    .join("|");

  return `${selectedStopId}|${legSignature}`;
}
