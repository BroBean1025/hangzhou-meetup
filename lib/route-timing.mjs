// Prefix times belong to this exact itinerary, never a separate shortest route.
export function stationDepartures(legs, accessSeconds) {
  if (!Number.isFinite(accessSeconds) || accessSeconds < 0) return [];
  let elapsed = accessSeconds;
  const departures = [];
  for (const leg of legs) {
    if (!Number.isFinite(leg.seconds) || leg.seconds < 0) return [];
    if (leg.kind === 'ride') {
      const ids = leg.station_ids ?? [];
      const offsets = leg.station_offsets_seconds;
      for (let i = 0; i < ids.length - 1; i++) {
        const offset = i === 0 ? 0 : offsets?.[i];
        if (Number.isFinite(offset) && offset >= 0 && offset <= leg.seconds) {
          departures.push({station_id:ids[i],next_station_id:ids[i+1],line_id:leg.line_id,elapsed_seconds:elapsed+offset});
        }
      }
    }
    elapsed += leg.seconds; // Includes ordinary and cross-station transfers once.
  }
  return departures;
}
