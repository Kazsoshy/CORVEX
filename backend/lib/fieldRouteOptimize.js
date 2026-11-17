import { osrmDrivingRoute, osrmDrivingTable } from './osrm.js';
import { nearestNeighborOrder, optimizePriorityAwareRoute } from './routeOrder.js';

/**
 * Optimize a field visit sequence without SAW scores.
 * Uses OSRM road table when available; falls back to haversine nearest-neighbor.
 * @param {{ lat: number, lng: number }} start
 * @param {Array<{ id: string|number, lat: number, lng: number, label?: string }>} stops
 */
export async function optimizeFieldStops(start, stops = []) {
  const validStops = (stops || []).filter((s) => (
    Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng))
    && !(Number(s.lat) === 0 && Number(s.lng) === 0)
  )).map((s) => ({
    ...s,
    id: s.id,
    label: s.label || s.customer_name || null,
    lat: Number(s.lat),
    lon: Number(s.lng),
    lng: Number(s.lng),
    score: 1,
    rank: 1,
  }));

  if (!validStops.length) {
    return {
      provider: 'none',
      ordered: [],
      polyline: [],
      distanceKm: 0,
      durationMin: 0,
    };
  }

  const startLat = Number(start?.lat);
  const startLng = Number(start?.lng);
  const hasStart = Number.isFinite(startLat) && Number.isFinite(startLng)
    && !(startLat === 0 && startLng === 0);

  const depot = hasStart
    ? { lat: startLat, lon: startLng }
    : { lat: validStops[0].lat, lon: validStops[0].lon };

  let provider = 'haversine-fallback';
  let ordered = nearestNeighborOrder(depot, validStops);
  let polyline = [];
  let distanceKm = 0;
  let durationMin = 0;

  let costMatrix = null;
  let distanceMatrixKm = null;
  let durationMatrixMin = null;

  try {
    const waypointsLonLat = [
      [depot.lon, depot.lat],
      ...validStops.map((s) => [s.lon, s.lat]),
    ];
    if (waypointsLonLat.length >= 2) {
      const table = await Promise.race([
        osrmDrivingTable(waypointsLonLat),
        new Promise((_, reject) => setTimeout(() => reject(new Error('OSRM table timeout')), 4500)),
      ]);
      costMatrix = table.durationsMin;
      distanceMatrixKm = table.distancesKm;
      durationMatrixMin = table.durationsMin;
      provider = 'osrm';
    }
  } catch {
    /* keep haversine */
  }

  ordered = optimizePriorityAwareRoute({
    depot,
    stops: validStops,
    costMatrix,
    distanceMatrixKm,
    durationMatrixMin,
    priorityLambda: 0.2,
  });

  try {
    const routeWaypoints = [
      [depot.lon, depot.lat],
      ...ordered.map((s) => [Number(s.lon ?? s.lng), Number(s.lat)]),
    ];
    const route = await Promise.race([
      osrmDrivingRoute(routeWaypoints),
      new Promise((_, reject) => setTimeout(() => reject(new Error('OSRM route timeout')), 6000)),
    ]);
    polyline = route?.positions || [];
    distanceKm = route?.distanceKm || 0;
    durationMin = route?.durationMin || 0;
    if (polyline.length) provider = provider === 'haversine-fallback' ? 'osrm-route-only' : 'osrm';
  } catch {
    polyline = [
      [depot.lat, depot.lon],
      ...ordered.map((s) => [Number(s.lat), Number(s.lon ?? s.lng)]),
    ];
    if (provider === 'osrm') provider = 'osrm-order-haversine-path';
  }

  return {
    provider,
    ordered: ordered.map((row, index) => ({
      id: row.id,
      label: row.label || row.customer_name || `Stop ${index + 1}`,
      lat: Number(row.lat),
      lng: Number(row.lon ?? row.lng),
      sequence: index + 1,
    })),
    polyline,
    distanceKm,
    durationMin,
  };
}
