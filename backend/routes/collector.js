import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { insertUserNotification } from '../lib/creditInvestigationNotifications.js';
import { flagCustomerForCreditReview } from '../lib/creditRecommendations.js';
import {
  computeCollectorSawPriority,
  computeAssignedSawRoute,
  mapSawPriorityRow,
  persistSawResults,
} from '../lib/sawCollectionData.js';
import { osrmDrivingRoute, osrmDrivingTable, osrmDrivingTrip } from '../lib/osrm.js';
import { nearestNeighborOrder, optimizePriorityAwareRoute, sortStopsBySaw } from '../lib/routeOrder.js';
import { manilaDateString } from '../lib/sawCollection.js';
import {
  applyCollectionPayment,
  assertCollectorCustomerAccess,
  assertCollectorPublishedVisit,
  manilaNow,
} from '../lib/collectionPayment.js';
import { notifyCustomerPaymentEvent } from '../lib/customerNotifications.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';

const router = express.Router();

const COLLECTOR_NORMAL_ACTIVITIES = [
  'Collection',
  'Partial Collection',
  'Promise to Pay',
  'Customer Not Available',
  'Follow-up',
];
const COLLECTOR_INCIDENT_ACTIVITIES = [
  'Payment Dispute',
  'Customer Refused',
  'Safety / Aggression',
  'Location Issue',
];
const COLLECTOR_ACTIVITY_TYPES = [...COLLECTOR_NORMAL_ACTIVITIES, ...COLLECTOR_INCIDENT_ACTIVITIES];
const COLLECTOR_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const COLLECTOR_INCIDENT_SET = new Set(COLLECTOR_INCIDENT_ACTIVITIES);

const COLLECTOR_FAR_SELECT = `
  far.report_id,
  far.visit_id,
  far.customer_id,
  far.activity_type,
  far.severity,
  far.remarks,
  far.sync_status,
  far.photo,
  far.created_at,
  fv.scheduled_date,
  fv.visit_type,
  fv.status AS visit_status,
  fv.visit_outcome,
  COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
  COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Collector') AS collector_name
`;

function isIncidentActivity(activityType) {
  return COLLECTOR_INCIDENT_SET.has(String(activityType || '').trim());
}

function normalizeCollectorSeverity(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = COLLECTOR_SEVERITIES.find((s) => s.toLowerCase() === text.toLowerCase());
  return match || null;
}

function mapIncidentSeverity(severity) {
  const value = String(severity || 'Medium').toLowerCase();
  if (value === 'critical' || value === 'high') return 'Critical';
  if (value === 'low') return 'Informational';
  return 'Warning';
}

// All routes here require the collector role
router.use(requireRole(['collector']));

function parseScheduledDate(value) {
  if (value == null || String(value).trim() === '') return manilaDateString();
  const text = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return text;
}

// GET /api/collector/saw-priority — Published route stops for a chosen date,
// ordered by Priority-Aware Route Optimization while preserving original SAW scores & rankings.
// Pass ?full=true only for auditing/reporting of the full SAW candidate ranking.
router.get('/saw-priority', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const branchId = req.currentUser.branchId;
  const persist = req.query.persist === 'true' || req.query.persist === '1';
  const fullList = req.query.full === 'true' || req.query.full === '1';
  const scheduledDate = parseScheduledDate(req.query.date || req.query.scheduled_date);
  if (!scheduledDate) {
    return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD.' });
  }

  try {
    let asOf;
    let ranked;
    let stats;
    let assignmentMode = true;
    let listSource = 'assigned';
    let published = false;

    if (fullList) {
      ({ asOf, ranked, stats } = await computeCollectorSawPriority(pool, {
        collectorId: userId,
        branchId,
        asOfDate: scheduledDate,
      }));
      assignmentMode = false;
      listSource = 'saw';
      published = false;
    } else {
      const assigned = await computeAssignedSawRoute(pool, {
        collectorId: userId,
        branchId,
        scheduledDate,
        asOfDate: scheduledDate,
      });
      ({ asOf, ranked, stats } = assigned);
      assignmentMode = true;
      published = Boolean(assigned.published && assigned.ranked.length > 0);
      listSource = published ? 'assigned' : 'unassigned';
    }

    const todayCollectedRes = await pool.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS total
       FROM collection_payment
       WHERE collector_id = $1
         AND payment_date = $2::date
         AND status IN ('Completed', 'Pending')`,
      [userId, scheduledDate]
    );
    const amountCollectedToday = Number(todayCollectedRes.rows[0]?.total || 0);
    const collectionsCountToday = Number(todayCollectedRes.rows[0]?.count || 0);

    const persisted = Boolean(persist && ranked.length && scheduledDate === manilaDateString());
    if (persisted) {
      await persistSawResults(pool, ranked);
    }

    return res.status(200).json({
      success: true,
      data: ranked.map(mapSawPriorityRow),
      meta: {
        asOf,
        stats,
        persisted,
        assignmentMode,
        published,
        listSource,
        scheduledDate,
        amountCollectedToday,
        collectionsCountToday,
      },
    });
  } catch (error) {
    console.error('[Collector] GET /saw-priority error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load today\'s route.' });
  }
});

// POST /api/collector/saw/recompute — recompute and save to saw_results
router.post('/saw/recompute', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const branchId = req.currentUser.branchId;

  try {
    const { asOf, ranked, stats } = await computeCollectorSawPriority(pool, {
      collectorId: userId,
      branchId,
    });
    const saved = ranked.length ? await persistSawResults(pool, ranked) : 0;

    return res.status(200).json({
      success: true,
      message: saved
        ? `SAW priority updated for ${saved} customer(s).`
        : 'No eligible customers for SAW ranking.',
      data: ranked.map(mapSawPriorityRow),
      meta: { asOf, stats, saved },
    });
  } catch (error) {
    console.error('[Collector] POST /saw/recompute error:', error);
    return res.status(500).json({ success: false, message: 'Failed to recompute SAW results.' });
  }
});

// GET /api/collector/route/depot — branch start point for road routing
router.get('/route/depot', async (req, res) => {
  const pool = req.app.locals.pool;
  const branchId = req.currentUser.branchId;
  if (branchId == null) {
    return res.status(400).json({ success: false, message: 'Collector is not assigned to a branch.' });
  }
  try {
    const result = await pool.query(
      `SELECT id, name, address, latitude::float AS latitude, longitude::float AS longitude
       FROM branches WHERE id = $1`,
      [branchId]
    );
    const row = result.rows[0];
    if (!row?.latitude || !row?.longitude) {
      return res.status(404).json({ success: false, message: 'Branch location not configured.' });
    }
    return res.status(200).json({
      success: true,
      data: {
        branchId: row.id,
        name: row.name,
        address: row.address,
        latitude: row.latitude,
        longitude: row.longitude,
      },
    });
  } catch (error) {
    console.error('[Collector] GET /route/depot error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load branch depot.' });
  }
});

/**
 * POST /api/collector/route/driving
 * Produces ONE recommended route combining SAW collection priority with road-network travel efficiency.
 * Preserves original SAW score and ranking (`sawRank`, `sawScore`) separately from `routeIndex`.
 */
router.post('/route/driving', async (req, res) => {
  const pool = req.app.locals.pool;
  const branchId = req.currentUser.branchId;
  const requestedMode = req.body?.order_mode;
  const orderMode =
    requestedMode === 'travel' || requestedMode === 'saw'
      ? requestedMode
      : 'recommended';
  const rawStops = Array.isArray(req.body?.stops) ? req.body.stops : [];

  if (!rawStops.length) {
    return res.status(400).json({ success: false, message: 'Provide at least one stop.' });
  }

  const stops = rawStops
    .map((s) => ({
      ...s,
      id: String(s.id ?? s.customer_id ?? ''),
      lat: Number(s.latitude),
      lon: Number(s.longitude),
      rank: Number(s.rank ?? s.sawRank) || null,
      score: s.saw_score ?? s.sawScore ?? s.score ?? null,
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));

  if (!stops.length) {
    return res.status(400).json({ success: false, message: 'Stops need valid coordinates.' });
  }

  try {
    const branchRes = await pool.query(
      `SELECT name, address, latitude::float AS latitude, longitude::float AS longitude
       FROM branches WHERE id = $1`,
      [branchId]
    );
    const depot = branchRes.rows[0];
    if (!depot?.latitude || !depot?.longitude) {
      return res.status(400).json({ success: false, message: 'Branch depot coordinates missing.' });
    }

    // Use collector starting coordinates when provided, else branch depot
    const originLat = Number(req.body?.origin?.latitude);
    const originLon = Number(req.body?.origin?.longitude);
    const startPoint =
      Number.isFinite(originLat) && Number.isFinite(originLon)
        ? { lat: originLat, lon: originLon, name: 'Current Location', address: 'Collector GPS' }
        : { lat: depot.latitude, lon: depot.longitude, name: depot.name, address: depot.address };

    let orderedStops;
    let optimizer = orderMode;
    let osrmError = null;
    let osrmResult = null;
    const startLonLat = [startPoint.lon, startPoint.lat];

    if (orderMode === 'recommended') {
      let costMatrix = null;
      let distanceMatrixKm = null;
      let durationMatrixMin = null;
      if (stops.length >= 2) {
        try {
          const table = await Promise.race([
            osrmDrivingTable([startLonLat, ...stops.map((s) => [s.lon, s.lat])]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('OSRM table timeout')), 4500)),
          ]);
          costMatrix = table.durationsMin;
          distanceMatrixKm = table.distancesKm;
          durationMatrixMin = table.durationsMin;
        } catch {
          /* fall back to haversine matrix inside optimizePriorityAwareRoute */
        }
      }
      orderedStops = optimizePriorityAwareRoute({
        depot: startPoint,
        stops,
        costMatrix,
        distanceMatrixKm,
        durationMatrixMin,
      });
    } else if (orderMode === 'saw') {
      orderedStops = sortStopsBySaw(stops);
    } else {
      orderedStops = nearestNeighborOrder(startPoint, stops);
    }

    const stopLonLat = orderedStops.map((s) => [s.lon, s.lat]);
    const waypointsLonLat = [startLonLat, ...stopLonLat];

    try {
      if (orderMode === 'travel' && stopLonLat.length >= 2) {
        const trip = await osrmDrivingTrip(waypointsLonLat, { roundtrip: false, destination: 'any' });
        if (trip.waypoints?.length > 1) {
          const reordered = [...trip.waypoints]
            .map((wp, inputIndex) => ({ inputIndex, order: wp.waypoint_index ?? inputIndex }))
            .sort((a, b) => a.order - b.order)
            .filter((w) => w.inputIndex > 0)
            .map((w) => orderedStops[w.inputIndex - 1]);
          if (reordered.length === orderedStops.length) {
            orderedStops = reordered;
          }
        }
        osrmResult = trip.positions?.length
          ? trip
          : await osrmDrivingRoute([startLonLat, ...orderedStops.map((s) => [s.lon, s.lat])]);
        optimizer = 'travel';
      } else {
        osrmResult = await Promise.race([
          osrmDrivingRoute(waypointsLonLat),
          new Promise((_, reject) => setTimeout(() => reject(new Error('OSRM route timeout')), 6000)),
        ]);
      }
    } catch (err) {
      osrmError = err.message || 'Road network unavailable';
      osrmResult = {
        positions: waypointsLonLat.map(([lon, lat]) => [lat, lon]),
        distanceKm: null,
        durationMin: null,
      };
    }

    const orderedWithIndex = orderedStops.map((stop, i) => ({
      ...stop,
      routeIndex: i + 1,
      route_sequence: i + 1,
      sawRank: stop.rank ?? stop.sawRank ?? null,
      sawScore: stop.score ?? stop.sawScore ?? null,
    }));

    return res.status(200).json({
      success: true,
      data: {
        orderMode: optimizer,
        depot: {
          name: startPoint.name,
          address: startPoint.address,
          latitude: startPoint.lat,
          longitude: startPoint.lon,
        },
        orderedStops: orderedWithIndex,
        road: {
          positions: osrmResult.positions || [],
          distanceKm: osrmResult.distanceKm,
          durationMin: osrmResult.durationMin,
          provider: osrmError ? 'straight-line-fallback' : 'osrm',
          error: osrmError,
        },
      },
    });
  } catch (error) {
    console.error('[Collector] POST /route/driving error:', error);
    return res.status(500).json({ success: false, message: 'Failed to build driving route.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/payments
// Returns all collection_payment rows for the logged-in collector.
// ──────────────────────────────────────────────────────────────────────────────
const COLLECTION_PAYMENT_SELECT = `
  SELECT
    cp.collectionpayment_id,
    cp.customer_id,
    c.customer_code,
    COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name,
    cp.collector_id,
    COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Collector') AS collector_name,
    cp.branch_id,
    b.name AS branch_name,
    cp.payment_method_id,
    COALESCE(pm.method_name, '—') AS payment_method,
    dr.receipts_id,
    COALESCE(dr.receipt_number, cp.receipt_number) AS receipt_number,
    cp.amount,
    cp.payment_date,
    cp.payment_time,
    cp.status,
    cp.notes,
    cp.reference_number,
    cp.created_at,
    cp.updated_at
  FROM collection_payment cp
  JOIN customers c   ON c.customer_id = cp.customer_id
  JOIN users u       ON u.id          = cp.collector_id
  JOIN branches b    ON b.id          = cp.branch_id
  LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
  LEFT JOIN digital_receipts dr ON dr.collection_id = cp.collectionpayment_id
`;

async function loadPaymentAllocations(pool, collectionPaymentId) {
  try {
    const result = await pool.query(
      `SELECT
         ch.credit_id,
         ch.sales_id,
         si.invoice_number,
         ch.payment_amount::float AS applied_amount,
         ch.previous_balance::float AS previous_balance,
         ch.remaining_balance::float AS remaining_balance,
         ch.payment_status
       FROM credit_history ch
       LEFT JOIN sales_invoices si ON si.sales_invoices_id = ch.sales_id
       WHERE ch.collection_id = $1
       ORDER BY ch.credit_id ASC`,
      [collectionPaymentId]
    );
    return result.rows;
  } catch {
    return [];
  }
}

function summarizeBalances(allocations) {
  if (!allocations.length) {
    return { previous_balance: null, remaining_balance: null };
  }
  return {
    previous_balance: Number(allocations[0].previous_balance),
    remaining_balance: Number(allocations[allocations.length - 1].remaining_balance),
  };
}

router.get('/payments', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `${COLLECTION_PAYMENT_SELECT}
       WHERE cp.collector_id = $1
       ORDER BY cp.payment_date DESC, cp.payment_time DESC, cp.collectionpayment_id DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('[Collector] GET /payments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch collection payments',
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/payments/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/payments/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, message: 'Invalid payment ID.' });
  }

  try {
    const result = await pool.query(
      `${COLLECTION_PAYMENT_SELECT}
       WHERE cp.collectionpayment_id = $1 AND cp.collector_id = $2`,
      [id, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Collection payment not found.' });
    }

    const payment = result.rows[0];
    const allocations = await loadPaymentAllocations(pool, payment.collectionpayment_id);
    const balances = summarizeBalances(allocations);

    return res.status(200).json({
      success: true,
      data: {
        ...payment,
        previous_balance: balances.previous_balance,
        remaining_balance: balances.remaining_balance,
        allocations,
      },
    });
  } catch (error) {
    console.error('[Collector] GET /payments/:id error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch collection payment',
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/field-visits/today
// ──────────────────────────────────────────────────────────────────────────────
router.get('/field-visits/today', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `SELECT
         fv.visit_id,
         fv.customer_id,
         fv.visit_type,
         fv.scheduled_date,
         fv.status,
         fv.visit_outcome,
         fv.visit_remarks,
         fv.visited_at,
         fv.updated_at,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name
       FROM field_visits fv
       JOIN customers c ON c.customer_id = fv.customer_id
       WHERE fv.user_id = $1
         AND (
           fv.scheduled_date = CURRENT_DATE
           OR (fv.status = 'Pending' AND fv.scheduled_date <= CURRENT_DATE)
         )
       ORDER BY fv.scheduled_date DESC, fv.status DESC, fv.visit_id ASC`,
      [userId]
    );

    return res.status(200).json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('[Collector] GET /field-visits/today error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch today\'s visits.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/collector/field-visits/outcome
// Records a visit completion outcome (e.g. No Payment, Customer Unavailable,
// Rescheduled, Other) separately from visit status (Pending / Completed).
// ──────────────────────────────────────────────────────────────────────────────
const VALID_VISIT_OUTCOMES = new Set([
  'Collected',
  'No Payment',
  'Customer Unavailable',
  'Rescheduled',
  'Other',
]);

router.post('/field-visits/outcome', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const visitId = req.body.visit_id != null ? Number(req.body.visit_id) : null;
  const customerId = req.body.customer_id != null ? Number(req.body.customer_id) : null;
  const scheduledDate = parseScheduledDate(req.body.scheduled_date) || manilaDateString();
  const outcome = String(req.body.outcome || '').trim();
  const remarks = req.body.remarks != null ? String(req.body.remarks).trim() : '';

  if (!VALID_VISIT_OUTCOMES.has(outcome)) {
    return res.status(400).json({
      success: false,
      message: 'Select a valid visit outcome (Collected, No Payment, Customer Unavailable, Rescheduled, or Other).',
    });
  }
  if (outcome === 'Other' && !remarks) {
    return res.status(400).json({
      success: false,
      message: 'Remarks are required when selecting Other as the visit outcome.',
    });
  }

  try {
    let visitRow = null;
    if (Number.isFinite(visitId) && visitId > 0) {
      const r = await pool.query(
        `SELECT visit_id, customer_id, status, visit_outcome, scheduled_date::text AS scheduled_date
         FROM field_visits
         WHERE visit_id = $1 AND user_id = $2
         LIMIT 1`,
        [visitId, userId]
      );
      visitRow = r.rows[0] || null;
    } else if (Number.isFinite(customerId) && customerId > 0) {
      const r = await pool.query(
        `SELECT visit_id, customer_id, status, visit_outcome, scheduled_date::text AS scheduled_date
         FROM field_visits
         WHERE user_id = $1 AND customer_id = $2 AND visit_type = 'Collection'
           AND scheduled_date = $3::date
         ORDER BY visit_id DESC
         LIMIT 1`,
        [userId, customerId, scheduledDate]
      );
      visitRow = r.rows[0] || null;
    }

    if (!visitRow) {
      return res.status(404).json({
        success: false,
        message: 'Assigned visit not found for this customer on the selected route date.',
      });
    }

    if (visitRow.status === 'Completed' && visitRow.visit_outcome) {
      return res.status(409).json({
        success: false,
        message: `This visit is already marked Completed (${visitRow.visit_outcome}).`,
      });
    }

    const updated = await pool.query(
      `UPDATE field_visits
       SET status = 'Completed',
           visit_outcome = $2,
           visit_remarks = $3,
           visited_at = COALESCE(visited_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE visit_id = $1
       RETURNING visit_id, customer_id, scheduled_date::text AS scheduled_date, status, visit_outcome, visit_remarks, visited_at`,
      [visitRow.visit_id, outcome, remarks || null]
    );

    return res.status(200).json({
      success: true,
      message: `Visit marked Completed (${outcome}).`,
      data: updated.rows[0],
    });
  } catch (error) {
    console.error('[Collector] POST /field-visits/outcome error:', error);
    return res.status(500).json({ success: false, message: 'Failed to record visit outcome.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/field-reports
// ──────────────────────────────────────────────────────────────────────────────
router.get('/field-reports', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `SELECT ${COLLECTOR_FAR_SELECT}
       FROM field_activity_reports far
       LEFT JOIN field_visits fv ON fv.visit_id = far.visit_id
       LEFT JOIN customers c ON c.customer_id = COALESCE(far.customer_id, fv.customer_id)
       LEFT JOIN users u ON u.id = far.user_id
       WHERE far.user_id = $1
       ORDER BY far.created_at DESC
       LIMIT 100`,
      [userId]
    );

    return res.status(200).json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('[Collector] GET /field-reports error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch field activity reports.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/field-reports/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/field-reports/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const reportId = Number(req.params.id);

  if (!Number.isFinite(reportId) || reportId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid report id.' });
  }

  try {
    const result = await pool.query(
      `SELECT ${COLLECTOR_FAR_SELECT}
       FROM field_activity_reports far
       LEFT JOIN field_visits fv ON fv.visit_id = far.visit_id
       LEFT JOIN customers c ON c.customer_id = COALESCE(far.customer_id, fv.customer_id)
       LEFT JOIN users u ON u.id = far.user_id
       WHERE far.report_id = $1 AND far.user_id = $2`,
      [reportId, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[Collector] GET /field-reports/:id error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch field activity report.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/collector/field-reports
// ──────────────────────────────────────────────────────────────────────────────
router.post('/field-reports', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const { visit_id, activity_type, remarks, photo, severity } = req.body;
  const photoValue = typeof photo === 'string' ? photo.trim() : '';
  const activity = String(activity_type || '').trim();
  const remarksText = String(remarks || '').trim();

  if (!visit_id || !activity || !remarksText) {
    return res.status(400).json({
      success: false,
      message: 'visit_id, activity_type, and remarks are required.',
    });
  }

  if (!COLLECTOR_ACTIVITY_TYPES.includes(activity)) {
    return res.status(400).json({
      success: false,
      message: 'activity_type is not a supported collector outcome.',
    });
  }

  if (remarksText.length > 4000) {
    return res.status(400).json({
      success: false,
      message: 'remarks must be 4000 characters or fewer.',
    });
  }

  const incident = isIncidentActivity(activity);
  const normalizedSeverity = normalizeCollectorSeverity(severity);
  if (incident && !normalizedSeverity) {
    return res.status(400).json({
      success: false,
      message: 'severity is required for incident/issue activities.',
    });
  }
  if (!incident && severity != null && String(severity).trim() !== '') {
    return res.status(400).json({
      success: false,
      message: 'severity is only allowed for incident/issue activities.',
    });
  }

  if (!photoValue) {
    return res.status(400).json({
      success: false,
      message: 'photo is required.',
    });
  }

  if (!photoValue.startsWith('data:image/')) {
    return res.status(400).json({
      success: false,
      message: 'photo must be a valid image upload.',
    });
  }

  if (photoValue.length > 900_000) {
    return res.status(400).json({
      success: false,
      message: 'photo is too large. Use a smaller image.',
    });
  }

  try {
    const visitCheck = await pool.query(
      `SELECT visit_id, customer_id
       FROM field_visits
       WHERE visit_id = $1 AND user_id = $2`,
      [Number(visit_id), userId]
    );

    if (!visitCheck.rows.length) {
      return res.status(404).json({ success: false, message: 'Visit not found for this collector.' });
    }

    const customerId = visitCheck.rows[0].customer_id;
    const result = await pool.query(
      `INSERT INTO field_activity_reports
         (visit_id, customer_id, user_id, activity_type, severity, remarks, photo, sync_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Synced')
       RETURNING report_id, visit_id, customer_id, activity_type, severity, remarks, photo, sync_status, created_at`,
      [
        Number(visit_id),
        customerId,
        userId,
        activity,
        incident ? normalizedSeverity : null,
        remarksText,
        photoValue,
      ]
    );

    const report = result.rows[0];

    // Exception-desk alert for field incidents (deduped by report id).
    if (incident && req.currentUser?.branchId != null) {
      try {
        const { upsertOpenOperationalAlert } = await import('../lib/operationalAlerts.js');
        const customerLabel = customerId ? `Customer #${customerId}` : 'Customer';
        await upsertOpenOperationalAlert(pool, {
          branchId: req.currentUser.branchId,
          alertType: 'Field Incident',
          severity: mapIncidentSeverity(normalizedSeverity),
          title: `Field incident: ${activity}`,
          message: [
            remarksText,
            `Activity: ${activity}`,
            `Severity: ${normalizedSeverity}`,
            customerId ? `Customer ID: ${customerId}` : null,
            `Report #${report.report_id}`,
          ].filter(Boolean).join('\n'),
          sourceKey: `far:${report.report_id}`,
          entityType: 'field_report',
          entityId: report.report_id,
          linkPath: `field-activity-reports/${report.report_id}`,
        });
      } catch (alertErr) {
        console.error('[Collector] FAR operational alert:', alertErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Field activity report submitted successfully. Your Branch Manager can now review this report.',
      data: report,
    });
  } catch (error) {
    console.error('[Collector] POST /field-reports error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit field activity report.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/receipts
// Returns all digital_receipts for the logged-in collector with full joins.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/receipts', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `SELECT
         dr.receipts_id,
         dr.collection_id,
         cp.receipt_number       AS collection_receipt_number,
         dr.receipt_number,
         dr.receipt_date,
         dr.generated_by,
         COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Collector') AS generated_by_name,
         cp.amount,
         cp.payment_date,
         cp.payment_time,
         cp.status               AS payment_status,
         cp.customer_id,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
         b.name                  AS branch_name,
         COALESCE(pm.method_name, '—') AS payment_method
       FROM digital_receipts dr
       JOIN collection_payment cp ON cp.collectionpayment_id = dr.collection_id
       JOIN users u               ON u.id                    = dr.generated_by
       JOIN customers c           ON c.customer_id           = cp.customer_id
       JOIN branches b            ON b.id                    = cp.branch_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id  = cp.payment_method_id
       WHERE dr.generated_by = $1
       ORDER BY dr.receipt_date DESC, dr.receipts_id DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('[Collector] GET /receipts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch digital receipts',
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/collector/receipts/:id
// Returns a single ipt by receipts_id.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/receipts/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, message: 'Invalid receipt ID.' });
  }

  try {
    const result = await pool.query(
      `SELECT
         dr.receipts_id,
         dr.collection_id,
         dr.receipt_number,
         dr.receipt_date,
         dr.generated_by,
         COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Collector') AS generated_by_name,
         cp.amount,
         cp.payment_date,
         cp.payment_time,
         cp.status               AS payment_status,
         cp.notes,
         cp.customer_id,
         c.customer_code,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name,
         c.address               AS customer_address,
         c.contact_phone         AS customer_phone,
         c.contact_person_phone  AS customer_contact_phone,
         b.name                  AS branch_name,
         COALESCE(pm.method_name, '—') AS payment_method
       FROM digital_receipts dr
       JOIN collection_payment cp ON cp.collectionpayment_id = dr.collection_id
       JOIN users u               ON u.id                    = dr.generated_by
       JOIN customers c           ON c.customer_id           = cp.customer_id
       JOIN branches b            ON b.id                    = cp.branch_id
       LEFT JOIN payment_methods pm ON pm.payment_method_id  = cp.payment_method_id
       WHERE dr.receipts_id = $1
         AND dr.generated_by = $2`,
      [id, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }

    const receipt = result.rows[0];
    const allocations = await loadPaymentAllocations(pool, receipt.collection_id);
    const balances = summarizeBalances(allocations);

    return res.status(200).json({
      success: true,
      data: {
        ...receipt,
        previous_balance: balances.previous_balance,
        remaining_balance: balances.remaining_balance,
        allocations,
      },
    });
  } catch (error) {
    console.error('[Collector] GET /receipts/:id error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch receipt',
    });
  }
});

router.post('/receipts/:id/send', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, message: 'Invalid receipt ID.' });
  }
  try {
    const result = await pool.query(
      `SELECT dr.receipt_number, cp.amount, cp.status AS payment_status,
              c.user_id AS customer_user_id,
              COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name
       FROM digital_receipts dr
       JOIN collection_payment cp ON cp.collectionpayment_id = dr.collection_id
       JOIN customers c ON c.customer_id = cp.customer_id
       WHERE dr.receipts_id = $1 AND dr.generated_by = $2`,
      [id, userId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }
    const receipt = result.rows[0];
    if (String(receipt.payment_status || '') !== 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'Only completed payments can be sent to the customer.',
      });
    }
    if (!receipt.customer_user_id) {
      return res.status(400).json({
        success: false,
        message: `${receipt.customer_name} does not have a portal account, so the receipt cannot be sent.`,
      });
    }
    await insertUserNotification(pool, {
      userId: receipt.customer_user_id,
      title: `Receipt ${receipt.receipt_number}`,
      message: `Your collector sent receipt ${receipt.receipt_number} for PHP ${Number(receipt.amount).toFixed(2)}. Open Digital Receipts to view it.`,
      category: 'Receipt',
    });
    return res.status(200).json({
      success: true,
      message: `Receipt ${receipt.receipt_number} sent to ${receipt.customer_name}.`,
    });
  } catch (error) {
    console.error('[Collector] POST /receipts/:id/send error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send receipt.' });
  }
});

const UNSUCCESSFUL_VISIT_OUTCOMES = [
  'No Payment',
  'Customer Unavailable',
  'Rescheduled',
  'Other',
];
const UNSUCCESSFUL_FAR_ACTIVITIES = [
  'Customer Not Available',
  'Payment Dispute',
  'Customer Refused',
  'Safety / Aggression',
  'Location Issue',
];

// GET /api/collector/dashboard
router.get('/dashboard', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const branchId = req.currentUser.branchId;
  const { date } = manilaNow();

  try {
    const [
      todayPayments,
      visits,
      issueVisits,
      recentPayments,
      recentReports,
      nextStopRes,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS total
         FROM collection_payment
         WHERE collector_id = $1
           AND payment_date = $2::date
           AND status = 'Completed'`,
        [userId, date]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed,
           COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'Completed')::int AS remaining
         FROM field_visits fv
         WHERE fv.user_id = $1
           AND fv.visit_type = 'Collection'
           AND fv.scheduled_date = $2::date`,
        [userId, date]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT fv.visit_id)::int AS count
         FROM field_visits fv
         LEFT JOIN field_activity_reports far
           ON far.visit_id = fv.visit_id
          AND far.user_id = fv.user_id
         WHERE fv.user_id = $1
           AND fv.visit_type = 'Collection'
           AND fv.scheduled_date = $2::date
           AND (
             fv.visit_outcome = ANY($3::text[])
             OR far.activity_type = ANY($4::text[])
           )`,
        [userId, date, UNSUCCESSFUL_VISIT_OUTCOMES, UNSUCCESSFUL_FAR_ACTIVITIES]
      ),
      pool.query(
        `${COLLECTION_PAYMENT_SELECT}
         WHERE cp.collector_id = $1
         ORDER BY
           CASE WHEN cp.payment_date = $2::date THEN 0 ELSE 1 END,
           cp.payment_date DESC,
           cp.payment_time DESC,
           cp.collectionpayment_id DESC
         LIMIT 5`,
        [userId, date]
      ),
      pool.query(
        `SELECT
           far.report_id,
           far.activity_type,
           far.severity,
           far.remarks,
           far.created_at,
           COALESCE(far.customer_id, fv.customer_id) AS customer_id,
           c.customer_code,
           COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name
         FROM field_activity_reports far
         LEFT JOIN field_visits fv ON fv.visit_id = far.visit_id
         LEFT JOIN customers c ON c.customer_id = COALESCE(far.customer_id, fv.customer_id)
         WHERE far.user_id = $1
         ORDER BY far.created_at DESC
         LIMIT 5`,
        [userId]
      ),
      pool.query(
        `SELECT
           fv.visit_id,
           fv.customer_id,
           fv.status,
           fv.visit_outcome,
           fv.scheduled_date::text AS scheduled_date,
           c.customer_code,
           COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), 'Customer') AS customer_name,
           c.address,
           c.contact_phone,
           COALESCE(ca.outstanding_balance, 0)::float AS outstanding_balance,
           (
             SELECT TO_CHAR(MIN(si.due_date), 'YYYY-MM-DD')
             FROM sales_invoices si
             LEFT JOIN (
               SELECT sales_id, COALESCE(SUM(payment_amount), 0) AS paid
               FROM credit_history WHERE sales_id IS NOT NULL GROUP BY sales_id
             ) ip ON ip.sales_id = si.sales_invoices_id
             WHERE si.customer_id = c.customer_id
               AND si.status IN ('Confirmed', 'Pending Review')
               AND si.due_date IS NOT NULL
               AND COALESCE(ip.paid, 0) < si.total_amount
           ) AS earliest_due_date
         FROM field_visits fv
         JOIN customers c ON c.customer_id = fv.customer_id
         LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
         WHERE fv.user_id = $1
           AND fv.visit_type = 'Collection'
           AND fv.scheduled_date = $2::date
           AND fv.status IS DISTINCT FROM 'Completed'
         ORDER BY fv.visit_id ASC
         LIMIT 1`,
        [userId, date]
      ),
    ]);

    const visitRow = visits.rows[0] || { total: 0, completed: 0, remaining: 0 };
    const routeTotal = Number(visitRow.total || 0);
    const routeCompleted = Number(visitRow.completed || 0);
    const routeRemaining = Number(visitRow.remaining || Math.max(0, routeTotal - routeCompleted));
    const routeProgress = routeTotal > 0 ? Math.round((routeCompleted / routeTotal) * 100) : 0;
    const routePublished = routeTotal > 0;

    let nextStop = null;
    if (nextStopRes.rows[0]) {
      const row = nextStopRes.rows[0];
      const outstanding = Number(row.outstanding_balance) || 0;
      let daysOverdue = 0;
      if (outstanding > 0 && row.earliest_due_date) {
        const asOf = new Date(`${date}T12:00:00`);
        const due = new Date(`${String(row.earliest_due_date).slice(0, 10)}T12:00:00`);
        daysOverdue = Math.max(0, Math.floor((asOf - due) / 86400000));
      }
      nextStop = {
        visit_id: row.visit_id,
        customer_id: row.customer_id,
        customer_code: row.customer_code || null,
        customer_name: row.customer_name,
        address: row.address || null,
        contact_phone: row.contact_phone || null,
        status: row.status,
        visit_outcome: row.visit_outcome || null,
        outstanding_balance: outstanding,
        days_overdue: daysOverdue,
        scheduled_date: row.scheduled_date,
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          date,
          collectionsToday: Number(todayPayments.rows[0]?.count || 0),
          amountCollectedToday: Number(todayPayments.rows[0]?.total || 0),
          routePublished,
          routeStopsTotal: routeTotal,
          routeStopsCompleted: routeCompleted,
          routeStopsRemaining: routeRemaining,
          routeProgressPercent: routeProgress,
          unsuccessfulVisitsToday: Number(issueVisits.rows[0]?.count || 0),
          branchId,
        },
        nextStop,
        recentCollections: recentPayments.rows,
        recentFieldReports: recentReports.rows,
      },
    });
  } catch (error) {
    console.error('[Collector] GET /dashboard error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
});

// GET /api/collector/payment-methods — restricted to Cash and GCash for collectors
router.get('/payment-methods', async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const result = await pool.query(
      `SELECT payment_method_id, method_name
       FROM payment_methods
       WHERE status = 'Active'
         AND LOWER(method_name) IN ('cash', 'gcash')
       ORDER BY CASE WHEN LOWER(method_name) = 'cash' THEN 0 ELSE 1 END, method_name`
    );
    const rows = result.rows.length
      ? result.rows
      : [
          { payment_method_id: 1, method_name: 'Cash' },
          { payment_method_id: 2, method_name: 'GCash' },
        ];
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('[Collector] GET /payment-methods error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load payment methods.' });
  }
});

// POST /api/collector/payments — log collection + balance + optional digital receipt
router.post('/payments', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const customerId = Number(req.body.customer_id);
  const amount = Number(req.body.amount);

  if (!Number.isFinite(customerId) || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Valid customer_id and amount greater than zero are required.' });
  }
  if (user.branchId == null) {
    return res.status(403).json({ success: false, message: 'No branch assigned.' });
  }

  const access = await assertCollectorCustomerAccess(pool, user, customerId);
  if (!access.ok) {
    return res.status(access.status).json({ success: false, message: access.message });
  }

  const visitGate = await assertCollectorPublishedVisit(
    pool,
    user,
    customerId,
    req.body.visit_id ?? req.body.visitId ?? null
  );
  if (!visitGate.ok) {
    return res.status(visitGate.status).json({ success: false, message: visitGate.message });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const applied = await applyCollectionPayment(
      client,
      user,
      { ...req.body, visit_id: visitGate.visit?.visit_id },
      req.ip
    );
    await client.query('COMMIT');
    await notifyCustomerPaymentEvent(pool, {
      customerId: applied.customerId,
      receiptNumber: applied.payment?.receipt_number,
      amount: applied.payment?.amount,
      kind: 'submitted',
    });

    return res.status(201).json({
      success: true,
      message: applied.receiptsId
        ? `Collection recorded (${applied.payment.receipt_number}). Digital receipt generated.`
        : `Collection recorded (${applied.payment.receipt_number}).`,
      data: {
        ...applied.payment,
        customer_id: applied.customerId,
        receipts_id: applied.receiptsId,
        previous_balance: applied.previousBalance,
        remaining_balance: applied.remainingBalance,
      },
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* transaction already finished */ }
    if (error.status || error.conflict) {
      return res.status(error.status || 409).json({
        success: false,
        message: error.message,
        conflict: Boolean(error.conflict),
      });
    }
    console.error('[Collector] POST /payments error:', error);
    return res.status(500).json({ success: false, message: 'Failed to log collection.' });
  } finally {
    client.release();
  }
});

// POST /api/collector/credit-investigations — full CI submission is Sales-only.
router.post('/credit-investigations', async (_req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Collectors cannot submit formal credit investigations. Use Flag for Credit Review instead.',
  });
});

// POST /api/collector/credit-review-flags — recommendation only, not a formal CI.
router.post('/credit-review-flags', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const user = req.currentUser;
    const customerId = Number(req.body.customer_id);
    const reason = req.body.reason || req.body.purpose;
    const observation = req.body.observation || req.body.field_observation || null;
    const note = req.body.note || req.body.form_remarks || null;
    const photoUrl = req.body.photo_url || req.body.photoUrl || null;

    if (!Number.isFinite(customerId)) {
      return res.status(400).json({ success: false, message: 'Customer is required.' });
    }
    if (!String(reason || '').trim()) {
      return res.status(400).json({ success: false, message: 'A flag reason is required.' });
    }

    const access = await assertCollectorCustomerAccess(client, user, customerId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    await client.query('BEGIN');
    const flagged = await flagCustomerForCreditReview(client, {
      customerId,
      branchId: access.row.branch_id,
      flaggedBy: user.id,
      reason,
      observation,
      note,
      photoUrl,
    });
    await client.query('COMMIT');

    const customerName = `${access.row.first_name || ''} ${access.row.last_name || ''}`.trim() || 'Customer';
    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Collections',
      activity: 'Flag Credit Review',
      action: 'Flag Credit Review',
      description: `Flagged ${customerName} for credit review: ${String(reason).trim()}`,
      status: flagged.created ? AUDIT_STATUS.CREATED : AUDIT_STATUS.UPDATED,
      affectedRecord: `credit_recommendation:${flagged.row.recommendation_id}`,
    });

    // Notify branch managers / ops and assigned sales agent.
    try {
      const recipients = await req.app.locals.pool.query(
        `SELECT DISTINCT u.id
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.status = 'Active'
           AND r.slug IN ('branch_manager', 'operating_manager')
           AND (r.slug = 'operating_manager' OR u.branch_id = $1)`,
        [access.row.branch_id]
      );
      for (const recipient of recipients.rows) {
        await insertUserNotification(req.app.locals.pool, {
          userId: recipient.id,
          title: 'Collector credit-review flag',
          message: `${customerName}: ${String(reason).trim()}. Open Credit Investigation → Recommended Customers.`,
          category: 'CI',
        });
      }
      const salesAgent = await req.app.locals.pool.query(
        `SELECT assigned_sales_agent_id FROM customers WHERE customer_id = $1`,
        [customerId]
      );
      const salesAgentId = salesAgent.rows[0]?.assigned_sales_agent_id;
      if (salesAgentId) {
        await insertUserNotification(req.app.locals.pool, {
          userId: salesAgentId,
          title: 'Collector flagged customer for credit review',
          message: `${customerName}: ${String(reason).trim()}. Review under Credit Reviews → Recommended.`,
          category: 'CI',
        });
      }
    } catch (notifyErr) {
      console.error('[Collector] credit-review-flag notify:', notifyErr.message);
    }

    return res.status(flagged.created ? 201 : 200).json({
      success: true,
      message: flagged.created
        ? 'Customer flagged for credit review. Branch Manager and Sales can review the recommendation.'
        : 'Credit-review flag updated.',
      data: {
        recommendation_id: flagged.row.recommendation_id,
        customer_id: customerId,
        customer_name: customerName,
        status: flagged.row.status,
        recommendation_type: flagged.row.recommendation_type,
      },
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('[Collector] POST /credit-review-flags error:', error);
    return res.status(500).json({ success: false, message: 'Failed to flag customer for credit review.' });
  } finally {
    client.release();
  }
});

// POST /api/collector/incidents — operational alert for OM / branch ops
router.post('/incidents', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const customerId = req.body.customer_id != null ? Number(req.body.customer_id) : null;
  const {
    incident_type: incidentType,
    description,
    location,
    severity,
    gps,
  } = req.body;

  if (!String(incidentType || '').trim() || !String(description || '').trim() || !String(severity || '').trim()) {
    return res.status(400).json({
      success: false,
      message: 'incident_type, description, and severity are required.',
    });
  }

  if (customerId != null && Number.isFinite(customerId)) {
    const access = await assertCollectorCustomerAccess(pool, user, customerId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }
  }

  const branchId = user.branchId;
  if (branchId == null) {
    return res.status(403).json({ success: false, message: 'No branch assigned.' });
  }

  const title = `Field incident: ${String(incidentType).trim()}`;
  const messageParts = [
    String(description).trim(),
    location ? `Location: ${String(location).trim()}` : null,
    gps ? `GPS: ${String(gps).trim()}` : null,
    customerId ? `Customer ID: ${customerId}` : null,
  ].filter(Boolean);

  try {
    const { upsertOpenOperationalAlert } = await import('../lib/operationalAlerts.js');
    const sourceKey = customerId
      ? `incident:${branchId}:${customerId}:${String(incidentType).trim().slice(0, 40)}`
      : `incident:${branchId}:${user.id}:${Date.now()}`;
    const { row, created } = await upsertOpenOperationalAlert(pool, {
      branchId,
      alertType: 'Field Incident',
      severity: mapIncidentSeverity(severity),
      title,
      message: messageParts.join('\n'),
      sourceKey,
      entityType: customerId ? 'customer' : 'other',
      entityId: customerId || null,
      linkPath: customerId ? `customers/${customerId}` : 'field-activity-reports',
    });

    await writeAuditFromReq(pool, req, {
      module: 'Collections',
      activity: 'Report Incident',
      action: 'Report Incident',
      description: `Reported field incident: ${String(incidentType).trim()}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `alert:${row.alert_id}`,
    });

    return res.status(created ? 201 : 200).json({
      success: true,
      message: created
        ? 'Incident report sent to branch exception desk.'
        : 'Matching open incident alert updated.',
      data: row,
    });
  } catch (error) {
    console.error('[Collector] POST /incidents error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit incident report.' });
  }
});

export default router;
