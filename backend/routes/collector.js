import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { insertUserNotification, notifyCreditInvestigationSubmitted } from '../lib/creditInvestigationNotifications.js';
import {
  computeCollectorSawPriority,
  computeAssignedSawRoute,
  mapSawPriorityRow,
  persistSawResults,
} from '../lib/sawCollectionData.js';
import { osrmDrivingRoute, osrmDrivingTrip } from '../lib/osrm.js';
import { nearestNeighborOrder, sortStopsBySaw } from '../lib/routeOrder.js';

const router = express.Router();

function manilaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

async function assertCollectorCustomerAccess(pool, user, customerId) {
  const result = await pool.query(
    `SELECT customer_id, branch_id, first_name, last_name FROM customers WHERE customer_id = $1`,
    [customerId]
  );
  if (!result.rows.length) return { ok: false, status: 404, message: 'Customer not found.' };
  const row = result.rows[0];
  if (user.branchId != null && row.branch_id !== user.branchId) {
    return { ok: false, status: 403, message: 'Customer is outside your branch.' };
  }
  return { ok: true, row };
}

async function nextReceiptNumber(client) {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;
  const r = await client.query(
    `SELECT receipt_number FROM collection_payment
     WHERE receipt_number LIKE $1
     ORDER BY collectionpayment_id DESC LIMIT 1`,
    [`${prefix}%`]
  );
  let seq = 1;
  if (r.rows.length) {
    const tail = r.rows[0].receipt_number.split('-').pop();
    seq = (Number(tail) || 0) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function resolvePaymentMethodId(client, methodName) {
  const aliases = { 'Mobile Money': 'GCash' };
  const lookup = aliases[String(methodName || '').trim()] || String(methodName || 'Cash').trim();
  const r = await client.query(
    `SELECT payment_method_id FROM payment_methods
     WHERE LOWER(method_name) = LOWER($1) AND status = 'Active' LIMIT 1`,
    [lookup]
  );
  if (r.rows.length) return r.rows[0].payment_method_id;
  const cash = await client.query(
    `SELECT payment_method_id FROM payment_methods WHERE method_name = 'Cash' LIMIT 1`
  );
  return cash.rows[0]?.payment_method_id || 1;
}

function mapIncidentSeverity(severity) {
  const s = String(severity || 'Medium').toLowerCase();
  if (s === 'critical' || s === 'high') return 'Critical';
  if (s === 'low') return 'Informational';
  return 'Warning';
}

// All routes here require the collector role
router.use(requireRole(['collector']));

// GET /api/collector/saw-priority — today's BM-assigned customers, SAW-ordered (sawmodel.ipynb)
router.get('/saw-priority', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const branchId = req.currentUser.branchId;
  const persist = req.query.persist === 'true' || req.query.persist === '1';
  const fullList = req.query.full === 'true' || req.query.full === '1';

  try {
    let asOf;
    let ranked;
    let stats;
    let assignmentMode = false;
    let scheduledDate;

    if (fullList) {
      ({ asOf, ranked, stats } = await computeCollectorSawPriority(pool, {
        collectorId: userId,
        branchId,
      }));
    } else {
      ({
        asOf,
        ranked,
        stats,
        assignmentMode,
        scheduledDate,
      } = await computeAssignedSawRoute(pool, {
        collectorId: userId,
        branchId,
      }));
    }

    if (persist && ranked.length) {
      await persistSawResults(pool, ranked);
    }

    return res.status(200).json({
      success: true,
      data: ranked.map(mapSawPriorityRow),
      meta: {
        asOf,
        stats,
        persisted: Boolean(persist && ranked.length),
        assignmentMode,
        scheduledDate,
      },
    });
  } catch (error) {
    console.error('[Collector] GET /saw-priority error:', error);
    return res.status(500).json({ success: false, message: 'Failed to compute SAW priority list.' });
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
 * Body: { order_mode: 'saw' | 'travel', stops: [{ id, latitude, longitude, rank?, ... }] }
 * SAW = collection priority order on roads; travel = OSRM trip optimization (minimize driving).
 */
router.post('/route/driving', async (req, res) => {
  const pool = req.app.locals.pool;
  const branchId = req.currentUser.branchId;
  const orderMode = req.body?.order_mode === 'travel' ? 'travel' : 'saw';
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
      rank: Number(s.rank) || null,
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

    const depotPoint = { lat: depot.latitude, lon: depot.longitude };
    let orderedStops;
    let optimizer = orderMode;

    if (orderMode === 'saw') {
      orderedStops = sortStopsBySaw(stops);
    } else {
      orderedStops = nearestNeighborOrder(depotPoint, stops);
    }

    const depotLonLat = [depot.longitude, depot.latitude];
    const stopLonLat = orderedStops.map((s) => [s.lon, s.lat]);
    let waypointsLonLat = [depotLonLat, ...stopLonLat];
    let osrmResult;
    let osrmError = null;

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
          : await osrmDrivingRoute([depotLonLat, ...orderedStops.map((s) => [s.lon, s.lat])]);
        optimizer = 'travel';
      } else {
        osrmResult = await osrmDrivingRoute(waypointsLonLat);
        optimizer = orderMode;
      }
    } catch (err) {
      osrmError = err.message || 'OSRM unavailable';
      osrmResult = {
        positions: waypointsLonLat.map(([lon, lat]) => [lat, lon]),
        distanceKm: null,
        durationMin: null,
      };
    }

    const orderedWithIndex = orderedStops.map((stop, i) => ({
      ...stop,
      routeIndex: i + 1,
      sawRank: stop.rank,
    }));

    return res.status(200).json({
      success: true,
      data: {
        orderMode: optimizer,
        depot: {
          name: depot.name,
          address: depot.address,
          latitude: depot.latitude,
          longitude: depot.longitude,
        },
        orderedStops: orderedWithIndex,
        road: {
          positions: osrmResult.positions || [],
          distanceKm: osrmResult.distanceKm,
          durationMin: osrmResult.durationMin,
          provider: osrmError ? 'straight-line-fallback' : 'osrm',
          error: osrmError,
        },
        legend: {
          saw:
            'SAW order: visit higher collection-priority customers first (balance, overdue, straight-line distance). Roads follow this sequence.',
          travel:
            'Travel order: OSRM minimizes driving time between stops. Collection priority (SAW rank) may differ.',
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
    COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
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
    cp.created_at,
    cp.updated_at
  FROM collection_payment cp
  JOIN customers c   ON c.customer_id = cp.customer_id
  JOIN users u       ON u.id          = cp.collector_id
  JOIN branches b    ON b.id          = cp.branch_id
  LEFT JOIN payment_methods pm ON pm.payment_method_id = cp.payment_method_id
  LEFT JOIN digital_receipts dr ON dr.collection_id = cp.collectionpayment_id
`;

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

    return res.status(200).json({ success: true, data: result.rows[0] });
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
// GET /api/collector/field-reports
// ──────────────────────────────────────────────────────────────────────────────
router.get('/field-reports', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;

  try {
    const result = await pool.query(
      `SELECT
         far.report_id,
         far.visit_id,
         far.activity_type,
         far.remarks,
         far.sync_status,
         far.photo,
         far.created_at,
         fv.scheduled_date,
         fv.visit_type,
         fv.status AS visit_status,
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name
       FROM field_activity_reports far
       JOIN field_visits fv ON fv.visit_id = far.visit_id
       JOIN customers c ON c.customer_id = fv.customer_id
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
// POST /api/collector/field-reports
// ──────────────────────────────────────────────────────────────────────────────
router.post('/field-reports', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const { visit_id, activity_type, remarks, photo } = req.body;
  const photoValue = typeof photo === 'string' ? photo.trim() : '';

  if (!visit_id || !activity_type || !String(remarks || '').trim()) {
    return res.status(400).json({
      success: false,
      message: 'visit_id, activity_type, and remarks are required.',
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
      `SELECT visit_id FROM field_visits WHERE visit_id = $1 AND user_id = $2`,
      [Number(visit_id), userId]
    );

    if (!visitCheck.rows.length) {
      return res.status(404).json({ success: false, message: 'Visit not found for this collector.' });
    }

    const result = await pool.query(
      `INSERT INTO field_activity_reports (visit_id, user_id, activity_type, remarks, photo, sync_status)
       VALUES ($1, $2, $3, $4, $5, 'Pending')
       RETURNING report_id, visit_id, activity_type, remarks, photo, sync_status, created_at`,
      [Number(visit_id), userId, String(activity_type).trim(), String(remarks).trim(), photoValue]
    );

    return res.status(201).json({
      success: true,
      message: 'Field activity report submitted to Operating Manager.',
      data: result.rows[0],
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
// Returns a single digital receipt by receipts_id.
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
         COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name,
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

    return res.status(200).json({ success: true, data: result.rows[0] });
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
      `SELECT dr.receipt_number, cp.amount, c.user_id AS customer_user_id,
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

// GET /api/collector/dashboard
router.get('/dashboard', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.currentUser.id;
  const branchId = req.currentUser.branchId;
  const { date } = manilaNow();

  try {
    const [todayPayments, visits, recentPayments, recentReports] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS total
         FROM collection_payment
         WHERE collector_id = $1 AND payment_date = $2::date AND status = 'Completed'`,
        [userId, date]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed
         FROM field_visits fv
         WHERE fv.user_id = $1
           AND (fv.scheduled_date = CURRENT_DATE OR (fv.status = 'Pending' AND fv.scheduled_date <= CURRENT_DATE))`,
        [userId]
      ),
      pool.query(
        `${COLLECTION_PAYMENT_SELECT}
         WHERE cp.collector_id = $1
         ORDER BY cp.payment_date DESC, cp.payment_time DESC, cp.collectionpayment_id DESC
         LIMIT 5`,
        [userId]
      ),
      pool.query(
        `SELECT report_id, activity_type, remarks, created_at, customer_name
         FROM (
           SELECT far.report_id, far.activity_type, far.remarks, far.created_at,
                  COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.last_name), ''), 'Customer') AS customer_name
           FROM field_activity_reports far
           JOIN field_visits fv ON fv.visit_id = far.visit_id
           JOIN customers c ON c.customer_id = fv.customer_id
           WHERE far.user_id = $1
           ORDER BY far.created_at DESC
           LIMIT 5
         ) sub`,
        [userId]
      ),
    ]);

    const visitRow = visits.rows[0] || { total: 0, completed: 0 };
    const routeTotal = visitRow.total || 0;
    const routeCompleted = visitRow.completed || 0;
    const routeProgress = routeTotal > 0 ? Math.round((routeCompleted / routeTotal) * 100) : 0;

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          collectionsToday: Number(todayPayments.rows[0]?.count || 0),
          amountCollectedToday: Number(todayPayments.rows[0]?.total || 0),
          routeStopsTotal: routeTotal,
          routeStopsCompleted: routeCompleted,
          routeProgressPercent: routeProgress,
          branchId,
        },
        recentCollections: recentPayments.rows,
        recentFieldReports: recentReports.rows,
      },
    });
  } catch (error) {
    console.error('[Collector] GET /dashboard error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
});

// GET /api/collector/payment-methods
router.get('/payment-methods', async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const result = await pool.query(
      `SELECT payment_method_id, method_name FROM payment_methods WHERE status = 'Active' ORDER BY method_name`
    );
    return res.status(200).json({ success: true, data: result.rows });
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
  const generateReceipt = req.body.generate_receipt !== false;
  const notes = req.body.notes ? String(req.body.notes).trim() : null;
  const paymentMethodName = req.body.payment_method || 'Cash';

  if (!Number.isFinite(customerId) || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Valid customer_id and amount are required.' });
  }
  if (user.branchId == null) {
    return res.status(403).json({ success: false, message: 'No branch assigned.' });
  }

  const access = await assertCollectorCustomerAccess(pool, user, customerId);
  if (!access.ok) {
    return res.status(access.status).json({ success: false, message: access.message });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const balRow = await client.query(
      `SELECT outstanding_balance FROM customer_activity WHERE customer_id = $1 FOR UPDATE`,
      [customerId]
    );
    const previousBalance = Number(balRow.rows[0]?.outstanding_balance || 0);
    if (previousBalance <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Customer has no outstanding balance to collect.' });
    }
    if (amount > previousBalance) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Amount exceeds outstanding balance (${previousBalance}).`,
      });
    }

    const paymentMethodId = await resolvePaymentMethodId(client, paymentMethodName);
    const receiptNumber = await nextReceiptNumber(client);
    const { date, time } = manilaNow();

    const paymentInsert = await client.query(
      `INSERT INTO collection_payment (
         receipt_number, customer_id, collector_id, branch_id, amount,
         payment_method_id, payment_date, payment_time, status, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::time, 'Completed', $9)
       RETURNING collectionpayment_id, receipt_number, amount, payment_date, payment_time, status`,
      [
        receiptNumber,
        customerId,
        user.id,
        user.branchId,
        amount,
        paymentMethodId,
        date,
        time,
        notes,
      ]
    );
    const payment = paymentInsert.rows[0];
    const collectionId = payment.collectionpayment_id;
    const remainingBalance = Math.max(0, previousBalance - amount);
    const paymentStatus = remainingBalance === 0 && previousBalance > 0 ? 'Paid' : 'Partial';

    if (balRow.rows.length) {
      await client.query(
        `UPDATE customer_activity
         SET outstanding_balance = $1, last_collection_date = $2::date, updated_at = NOW()
         WHERE customer_id = $3`,
        [remainingBalance, date, customerId]
      );
    } else {
      await client.query(
        `INSERT INTO customer_activity (customer_id, outstanding_balance, purchase_volume, last_collection_date)
         VALUES ($1, $2, 0, $3::date)`,
        [customerId, remainingBalance, date]
      );
    }

    await client.query(
      `INSERT INTO credit_history (
         customer_id, collection_id, previous_balance, payment_amount, remaining_balance,
         payment_status, transaction_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date)`,
      [customerId, collectionId, previousBalance, amount, remainingBalance, paymentStatus, date]
    );

    let receiptsId = null;
    if (generateReceipt) {
      const dr = await client.query(
        `INSERT INTO digital_receipts (collection_id, receipt_number, receipt_date, generated_by)
         VALUES ($1, $2, ($3::date + $4::time)::timestamp, $5)
         RETURNING receipts_id`,
        [collectionId, receiptNumber, date, time, user.id]
      );
      receiptsId = dr.rows[0].receipts_id;
    }

    await client.query(
      `UPDATE field_visits
       SET status = 'Completed'
       WHERE user_id = $1 AND customer_id = $2
         AND scheduled_date <= CURRENT_DATE
         AND status <> 'Completed'`,
      [user.id, customerId]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: generateReceipt ? 'Collection logged and receipt generated.' : 'Collection logged.',
      data: {
        ...payment,
        customer_id: customerId,
        receipts_id: receiptsId,
        remaining_balance: remainingBalance,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Collector] POST /payments error:', error);
    return res.status(500).json({ success: false, message: 'Failed to log collection.' });
  } finally {
    client.release();
  }
});

// POST /api/collector/credit-investigations
router.post('/credit-investigations', async (req, res) => {
  const pool = req.app.locals.pool;
  const user = req.currentUser;
  const customerId = Number(req.body.customer_id);
  const {
    purpose,
    monthly_income: monthlyIncome,
    business_type: businessType,
    references_summary: referencesSummary,
    form_remarks: formRemarks,
  } = req.body;

  if (!Number.isFinite(customerId)) {
    return res.status(400).json({ success: false, message: 'Customer is required.' });
  }
  if (!String(purpose || '').trim()) {
    return res.status(400).json({ success: false, message: 'Purpose is required.' });
  }

  const access = await assertCollectorCustomerAccess(pool, user, customerId);
  if (!access.ok) {
    return res.status(access.status).json({ success: false, message: access.message });
  }

  try {
    const customerName = `${access.row.first_name || ''} ${access.row.last_name || ''}`.trim() || 'Customer';
    const submitterMeta = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(full_name), ''), email) AS display_name FROM users WHERE id = $1`,
      [user.id]
    );
    const submitterName = submitterMeta.rows[0]?.display_name || 'Collector';

    const result = await pool.query(
      `INSERT INTO credit_investigations (
         customer_id, branch_id, submitted_by, status, purpose, monthly_income,
         business_type, references_summary, form_remarks
       ) VALUES ($1, $2, $3, 'Pending', $4, $5, $6, $7, $8)
       RETURNING ci_id, status, created_at`,
      [
        customerId,
        access.row.branch_id,
        user.id,
        String(purpose).trim(),
        Number(monthlyIncome) || 0,
        businessType ? String(businessType).trim() : null,
        referencesSummary ? String(referencesSummary).trim() : null,
        formRemarks ? String(formRemarks).trim() : null,
      ]
    );

    const ciId = result.rows[0].ci_id;
    await notifyCreditInvestigationSubmitted(pool, {
      branchId: access.row.branch_id,
      ciId,
      customerName,
      submitterName,
    });

    return res.status(201).json({
      success: true,
      message: 'Credit investigation submitted for branch approval.',
      data: { ...result.rows[0], customer_id: customerId, customer_name: customerName },
    });
  } catch (error) {
    console.error('[Collector] POST /credit-investigations error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit credit investigation.' });
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
    const result = await pool.query(
      `INSERT INTO operational_alerts (branch_id, alert_type, severity, title, message, status)
       VALUES ($1, 'Field Incident', $2, $3, $4, 'Open')
       RETURNING alert_id, title, status, created_at`,
      [branchId, mapIncidentSeverity(severity), title, messageParts.join('\n')]
    );

    return res.status(201).json({
      success: true,
      message: 'Incident report sent to operating manager.',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('[Collector] POST /incidents error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit incident report.' });
  }
});

export default router;
