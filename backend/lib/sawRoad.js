import { osrmDrivingRoute } from './osrm.js';
import {
  computeAssignedSawRoute,
  computeCollectorSawPriority,
} from './sawCollectionData.js';

function finiteCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stopFromRow(row) {
  const lat = finiteCoord(row.cust_lat ?? row.latitude);
  const lng = finiteCoord(row.cust_lon ?? row.longitude);
  if (lat == null || lng == null) return null;
  const rank = row.rank == null || row.rank === '' ? null : Number(row.rank);
  const score = row.score == null || row.score === '' ? null : Number(row.score);
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.customer_name || 'Customer';
  return {
    customerId: Number(row.customer_id),
    customerName: name,
    lat,
    lng,
    rank: Number.isFinite(rank) ? rank : null,
    score: Number.isFinite(score) ? score : null,
  };
}

/**
 * Road geometry for one collector's SAW order on a date.
 * Assigned customers are used when the branch manager scheduled them.
 * Otherwise the road follows the eligible SAW ranking.
 */
export async function buildCollectorSawRoad(pool, {
  collectorId,
  collectorName,
  branchId,
  scheduledDate,
}) {
  const assigned = await computeAssignedSawRoute(pool, {
    collectorId,
    branchId,
    scheduledDate,
    asOfDate: scheduledDate,
  });

  let rows = assigned.ranked;
  let listSource = 'assigned';
  if (!rows.length) {
    const full = await computeCollectorSawPriority(pool, {
      collectorId,
      branchId,
      asOfDate: scheduledDate,
    });
    rows = full.ranked;
    listSource = 'saw';
  }

  const stops = rows
    .map(stopFromRow)
    .filter(Boolean)
    .sort((a, b) => (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY)
      || a.customerId - b.customerId);

  if (!stops.length || branchId == null) return null;

  const branchRes = await pool.query(
    `SELECT name, latitude::float AS latitude, longitude::float AS longitude
     FROM branches WHERE id = $1`,
    [branchId]
  );
  const depot = branchRes.rows[0];
  const depotLat = finiteCoord(depot?.latitude);
  const depotLng = finiteCoord(depot?.longitude);
  if (depotLat == null || depotLng == null) return null;

  const waypoints = [
    [depotLng, depotLat],
    ...stops.map((stop) => [stop.lng, stop.lat]),
  ];

  let positions;
  let distanceKm = null;
  let durationMin = null;
  let provider = 'osrm';
  try {
    const road = await Promise.race([
      osrmDrivingRoute(waypoints),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OSRM timeout')), 8000);
      }),
    ]);
    positions = road.positions?.length ? road.positions : waypoints.map(([lng, lat]) => [lat, lng]);
    distanceKm = road.distanceKm;
    durationMin = road.durationMin;
    if (!road.positions?.length) provider = 'straight-line-fallback';
  } catch {
    positions = waypoints.map(([lng, lat]) => [lat, lng]);
    provider = 'straight-line-fallback';
  }

  return {
    collectorId: Number(collectorId),
    collectorName: collectorName || `Collector #${collectorId}`,
    branchId: Number(branchId),
    listSource,
    scheduledDate,
    provider,
    distanceKm,
    durationMin,
    positions,
    depot: { name: depot.name, lat: depotLat, lng: depotLng },
    stops,
  };
}
