/**
 * SAW (Simple Additive Weighting) — collection visit priority.
 * Matches sawmodel.ipynb: balance 0.40, days overdue 0.30, distance 0.30.
 */

const WEIGHT_BALANCE = 0.4;
const WEIGHT_DAYS = 0.3;
const WEIGHT_DISTANCE = 0.3;
const EARTH_RADIUS_KM = 6371;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

/** Haversine distance in km (branch → customer). */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const p1 = (Number(lat1) * Math.PI) / 180;
  const p2 = (Number(lat2) * Math.PI) / 180;
  const dlat = p2 - p1;
  const dlon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;
  const a = Math.sin(dlat / 2) ** 2
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dlon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function manilaDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
}

export function daysOverdueFromDueDate(asOfDateStr, dueDate) {
  if (!dueDate) return 0;
  const asOf = new Date(`${asOfDateStr}T12:00:00`);
  const due = new Date(dueDate);
  const diff = Math.floor((asOf - due) / 86400000);
  return Math.max(0, diff);
}

/** One row per customer — earliest due_date (notebook groupby). */
export function dedupeEarliestDue(rows) {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.due_date) - new Date(b.due_date) || Number(a.customer_id) - Number(b.customer_id)
  );
  const seen = new Map();
  for (const row of sorted) {
    const id = Number(row.customer_id);
    if (!seen.has(id)) seen.set(id, row);
  }
  return [...seen.values()];
}

/**
 * @param {Array<{ customer_id, outstanding_balance, days_overdue, distance_km }>} rows
 */
export function computeSawScores(rows) {
  if (!rows.length) return [];

  const maxBalance = Math.max(...rows.map((r) => Number(r.outstanding_balance) || 0), 0);
  const maxDays = Math.max(...rows.map((r) => Number(r.days_overdue) || 0), 0);
  const distances = rows.map((r) => Number(r.distance_km)).filter((d) => d > 0);
  const minDist = distances.length ? Math.min(...distances) : 0;

  const scored = rows.map((row) => {
    const balance_norm = maxBalance > 0
      ? round2(Number(row.outstanding_balance) / maxBalance)
      : 0;
    const days_norm = maxDays > 0
      ? round2(Number(row.days_overdue) / maxDays)
      : 0;
    const dist = Number(row.distance_km);
    const distance_norm = dist > 0 && minDist > 0
      ? round2(minDist / dist)
      : 0;
    const score = round3(
      WEIGHT_BALANCE * balance_norm
      + WEIGHT_DAYS * days_norm
      + WEIGHT_DISTANCE * distance_norm
    );
    return {
      ...row,
      balance_norm,
      days_norm,
      distance_norm,
      score,
    };
  });

  scored.sort(
    (a, b) => b.score - a.score
      || Number(a.customer_id) - Number(b.customer_id)
  );
  return scored.map((row, index) => ({ ...row, rank: index + 1 }));
}

/**
 * Full notebook pipeline on eligible invoice-level rows.
 */
export function runSawPipeline(eligibleRows, { asOfDate } = {}) {
  const asOf = asOfDate || manilaDateString();
  const deduped = dedupeEarliestDue(eligibleRows);

  const withFeatures = deduped.map((row) => ({
    ...row,
    days_overdue: daysOverdueFromDueDate(asOf, row.due_date),
    distance_km: round3(
      haversineKm(row.branch_lat, row.branch_lon, row.cust_lat, row.cust_lon)
    ),
  }));

  const kept = withFeatures.filter((r) => r.distance_km > 0);
  const scored = computeSawScores(kept);
  const meta = new Map(kept.map((k) => [Number(k.customer_id), k]));

  return scored.map((s) => ({
    ...meta.get(Number(s.customer_id)),
    ...s,
    generated_at: asOf,
  }));
}

/** Filter raw rows like the notebook (before feature engineering). */
export function filterEligibleRows(rows, collectorId) {
  const cid = Number(collectorId);
  return rows.filter((row) => {
    if (String(row.status) !== 'Active') return false;
    if (Number(row.outstanding_balance) <= 0) return false;
    if (Number(row.collector_id) !== cid) return false;
    const inv = String(row.invoice_status || row.invoices_status || '');
    if (!['Unpaid', 'Partial'].includes(inv)) return false;
    if (!row.due_date) return false;
    if (row.cust_lat == null || row.cust_lon == null) return false;
    if (row.branch_lat == null || row.branch_lon == null) return false;
    return true;
  });
}
