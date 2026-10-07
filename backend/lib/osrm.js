/**
 * OSRM (Open Source Routing Machine) — road geometry and driving distance.
 * Default: public demo server; override with OSRM_BASE_URL in .env for self-hosted OSRM.
 */

const DEFAULT_BASE = 'https://router.project-osrm.org';

function baseUrl() {
  const raw = (process.env.OSRM_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  return raw;
}

function coordPair(lon, lat) {
  return `${Number(lon).toFixed(6)},${Number(lat).toFixed(6)}`;
}

/** @param {Array<[number, number]>} waypointsLonLat */
function coordinatesPath(waypointsLonLat) {
  return waypointsLonLat.map(([lon, lat]) => coordPair(lon, lat)).join(';');
}

function geoJsonToLeafletPositions(geometry) {
  if (!geometry?.coordinates?.length) return [];
  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

/**
 * Driving route through waypoints in fixed order (SAW visit sequence).
 * @returns {Promise<{ positions, distanceKm, durationMin } | null>}
 */
export async function osrmDrivingRoute(waypointsLonLat) {
  if (!waypointsLonLat || waypointsLonLat.length < 2) {
    return { positions: [], distanceKm: 0, durationMin: 0 };
  }

  const url =
    `${baseUrl()}/route/v1/driving/${coordinatesPath(waypointsLonLat)}` +
    '?overview=full&geometries=geojson&steps=false';

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`OSRM route HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.[0]) {
    throw new Error(json.message || 'OSRM route failed');
  }

  const route = json.routes[0];
  return {
    positions: geoJsonToLeafletPositions(route.geometry),
    distanceKm: round1(route.distance / 1000),
    durationMin: round1(route.duration / 60),
  };
}

/**
 * OSRM Trip — reorders intermediate stops to reduce driving time (travel objective).
 * First waypoint should be depot (branch); does not return to depot unless roundtrip.
 * @returns {Promise<{ visitOrder: number[], positions, distanceKm, durationMin } | null>}
 *   visitOrder — indices into input waypointsLonLat (excluding depot-only semantics)
 */
export async function osrmDrivingTrip(waypointsLonLat, { roundtrip = false, destination = 'any' } = {}) {
  if (!waypointsLonLat || waypointsLonLat.length < 2) {
    return { visitOrder: [0], waypoints: [], positions: [], distanceKm: 0, durationMin: 0 };
  }

  const url =
    `${baseUrl()}/trip/v1/driving/${coordinatesPath(waypointsLonLat)}` +
    `?source=first&destination=${destination}&roundtrip=${roundtrip ? 'true' : 'false'}` +
    '&overview=full&geometries=geojson';

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`OSRM trip HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.code !== 'Ok' || !json.trips?.[0]) {
    throw new Error(json.message || 'OSRM trip failed');
  }

  const trip = json.trips[0];

  return {
    waypoints: json.waypoints || [],
    positions: geoJsonToLeafletPositions(trip.geometry),
    distanceKm: round1(trip.distance / 1000),
    durationMin: round1(trip.duration / 60),
  };
}
