/** Nearest-neighbor visit order from depot (fallback when OSRM trip unavailable). */
export function nearestNeighborOrder(depot, stops) {
  const remaining = stops.map((s, i) => ({ ...s, _idx: i }));
  const ordered = [];
  let current = depot;

  while (remaining.length) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = haversineKm(current.lat, current.lon, remaining[i].lat, remaining[i].lon);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    const next = remaining.splice(best, 1)[0];
    ordered.push(next);
    current = { lat: next.lat, lon: next.lon };
  }
  return ordered;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dlat = p2 - p1;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dlat / 2) ** 2
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** SAW rank order (1 = highest priority). */
export function sortStopsBySaw(stops) {
  return [...stops].sort(
    (a, b) => (Number(a.rank) || 999) - (Number(b.rank) || 999)
      || String(a.id).localeCompare(String(b.id))
  );
}
