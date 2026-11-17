import express from 'express';
import { allow, isUnscoped, ROLE_SETS } from '../middleware/auth.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';
import { OVERDUE_CUSTOMER_SQL as OVERDUE_CUSTOMER } from '../lib/customerStanding.js';
import { geocodeBarangay, reverseGeocodeLatLng } from '../lib/barangayGeocode.js';
import { loadCreditPolicies } from '../lib/creditPolicies.js';

const router = express.Router();
router.use(allow(ROLE_SETS.territoryRead, ROLE_SETS.territoryWrite));

const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 20000;
const DEFAULT_RADIUS_M = 800;
const TERRITORY_POLICY_KEY = 'territory_policies';

const DEFAULT_TERRITORY_POLICY = {
  inactivityDays: 90,
  usageSignals: {
    assignments: true,
    sales: true,
    collections: true,
    customerActivity: true,
  },
  blockers: {
    activeCustomers: true,
    overdueBalances: true,
    openAssignments: true,
  },
  mode: 'off',
  notifyBranchManager: true,
  preserveHistory: true,
};

function parseOptionalNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function parseCoord(value, label) {
  if (value == null || value === '') return { ok: false, message: `${label} is required.` };
  const n = Number(value);
  if (!Number.isFinite(n)) return { ok: false, message: `${label} must be a valid number.` };
  return { ok: true, value: n };
}

function parseRadius(value, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) return { ok: false, message: 'Operational zone radius is required.' };
    return { ok: true, value: null };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, message: 'Operational zone radius must be a whole number of meters.' };
  }
  if (n < MIN_RADIUS_M || n > MAX_RADIUS_M) {
    return { ok: false, message: `Operational zone radius must be between ${MIN_RADIUS_M} and ${MAX_RADIUS_M} meters.` };
  }
  return { ok: true, value: n };
}

function normalizeStatus(value) {
  if (value == null || value === '') return { ok: true, value: 'Active' };
  const status = String(value).trim();
  if (status !== 'Active' && status !== 'Inactive') {
    return { ok: false, message: 'Status must be Active or Inactive.' };
  }
  return { ok: true, value: status };
}

function trimOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

async function loadTerritoryPolicy(pool) {
  const result = await pool.query(
    `SELECT setting_value FROM system_settings WHERE setting_key = $1`,
    [TERRITORY_POLICY_KEY]
  );
  if (!result.rows.length) return { ...DEFAULT_TERRITORY_POLICY };
  try {
    const parsed = JSON.parse(result.rows[0].setting_value || '{}');
    return {
      ...DEFAULT_TERRITORY_POLICY,
      ...parsed,
      usageSignals: { ...DEFAULT_TERRITORY_POLICY.usageSignals, ...(parsed.usageSignals || {}) },
      blockers: { ...DEFAULT_TERRITORY_POLICY.blockers, ...(parsed.blockers || {}) },
      preserveHistory: true,
    };
  } catch {
    return { ...DEFAULT_TERRITORY_POLICY };
  }
}

async function dependencyCounts(pool, territoryId) {
  const [customers, overdue, openAssignments] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::INT AS count
       FROM customers c
       WHERE c.territory_id = $1 AND c.status = 'Active'`,
      [territoryId]
    ),
    pool.query(
      `SELECT COUNT(*)::INT AS count
       FROM customers c
       WHERE c.territory_id = $1
         AND c.status = 'Active'
         AND ${OVERDUE_CUSTOMER}`,
      [territoryId]
    ),
    pool.query(
      `SELECT COUNT(*)::INT AS count
       FROM sales_area_assignments saa
       WHERE saa.territory_id = $1
         AND saa.status IN ('Assigned', 'In Progress')
         AND saa.work_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date`,
      [territoryId]
    ),
  ]);
  return {
    activeCustomers: Number(customers.rows[0]?.count) || 0,
    overdueCustomers: Number(overdue.rows[0]?.count) || 0,
    openAssignments: Number(openAssignments.rows[0]?.count) || 0,
  };
}

async function validateTerritoryPayload(client, body, { user, existing = null }) {
  const territoryName = typeof body.territory_name === 'string' ? body.territory_name.trim() : '';
  if (!territoryName) {
    return { ok: false, status: 400, message: 'Territory name is required.' };
  }

  const finalBranchId = isUnscoped(user)
    ? (body.branch_id != null && body.branch_id !== ''
      ? Number(body.branch_id)
      : existing?.branch_id)
    : user.branchId;

  if (!finalBranchId || !Number.isFinite(Number(finalBranchId))) {
    return { ok: false, status: 400, message: 'branch_id is required.' };
  }
  if (!isUnscoped(user) && existing && Number(existing.branch_id) !== Number(user.branchId)) {
    return { ok: false, status: 403, message: 'Access denied: you can only access data for your assigned branch.' };
  }
  if (!isUnscoped(user) && body.branch_id != null && Number(body.branch_id) !== Number(user.branchId)) {
    return { ok: false, status: 403, message: 'Branch Managers cannot move a territory to another branch.' };
  }

  const statusResult = normalizeStatus(body.status);
  if (!statusResult.ok) return { ok: false, status: 400, message: statusResult.message };
  const status = statusResult.value;

  const barangayName = trimOrNull(body.barangay_name);
  const barangayCode = trimOrNull(body.barangay_code);
  const municipalityName = trimOrNull(body.municipality_name);
  const provinceName = trimOrNull(body.province_name);

  const latResult = parseCoord(body.latitude, 'Latitude');
  const lngResult = parseCoord(body.longitude, 'Longitude');
  const radiusResult = parseRadius(body.radius_meters, { required: false });
  if (!radiusResult.ok) return { ok: false, status: 400, message: radiusResult.message };

  if (status === 'Active') {
    if (!barangayName) {
      return { ok: false, status: 400, message: 'Barangay is required for an Active territory.' };
    }
    if (!latResult.ok) return { ok: false, status: 400, message: latResult.message };
    if (!lngResult.ok) return { ok: false, status: 400, message: lngResult.message };
    if (latResult.value < -90 || latResult.value > 90) {
      return { ok: false, status: 400, message: 'Latitude must be between -90 and 90.' };
    }
    if (lngResult.value < -180 || lngResult.value > 180) {
      return { ok: false, status: 400, message: 'Longitude must be between -180 and 180.' };
    }
  } else {
    if (body.latitude != null && body.latitude !== '' && !latResult.ok) {
      return { ok: false, status: 400, message: latResult.message };
    }
    if (body.longitude != null && body.longitude !== '' && !lngResult.ok) {
      return { ok: false, status: 400, message: lngResult.message };
    }
  }

  if (status === 'Active') {
    const dupName = await client.query(
      `SELECT territory_id
       FROM territories
       WHERE branch_id = $1
         AND lower(btrim(territory_name)) = lower(btrim($2))
         AND COALESCE(status, 'Active') = 'Active'
         AND ($3::INT IS NULL OR territory_id <> $3)
       LIMIT 1`,
      [Number(finalBranchId), territoryName, existing?.territory_id ?? null]
    );
    if (dupName.rows.length) {
      return {
        ok: false,
        status: 409,
        message: 'An Active territory with this name already exists in the branch.',
      };
    }

    if (barangayCode || barangayName) {
      const dupBarangay = await client.query(
        `SELECT territory_id, territory_name
         FROM territories
         WHERE branch_id = $1
           AND COALESCE(status, 'Active') = 'Active'
           AND ($2::INT IS NULL OR territory_id <> $2)
           AND (
             ($3::text IS NOT NULL AND barangay_code IS NOT NULL AND barangay_code = $3)
             OR (
               lower(btrim(COALESCE(barangay_name, ''))) = lower(btrim($4))
               AND lower(btrim(COALESCE(municipality_name, ''))) = lower(btrim(COALESCE($5, '')))
             )
           )
         LIMIT 1`,
        [
          Number(finalBranchId),
          existing?.territory_id ?? null,
          barangayCode,
          barangayName || '',
          municipalityName || '',
        ]
      );
      if (dupBarangay.rows.length) {
        return {
          ok: false,
          status: 409,
          message: `An Active territory already covers this barangay (${dupBarangay.rows[0].territory_name}). Deactivate it first or pick a different barangay.`,
        };
      }
    }
  }

  const coverage = body.coverage_area !== undefined
    ? trimOrNull(body.coverage_area)
    : (body.notes !== undefined ? trimOrNull(body.notes) : undefined);

  return {
    ok: true,
    value: {
      territory_name: territoryName,
      branch_id: Number(finalBranchId),
      status,
      latitude: latResult.ok ? latResult.value : null,
      longitude: lngResult.ok ? lngResult.value : null,
      radius_meters: radiusResult.value != null ? radiusResult.value : DEFAULT_RADIUS_M,
      barangay_code: barangayCode,
      barangay_name: barangayName,
      municipality_name: municipalityName,
      province_name: provinceName,
      coverage_area: coverage,
    },
  };
}

// GET /api/territories/policies — OM territory lifecycle policy
router.get('/policies', async (req, res) => {
  try {
    if (!ROLE_SETS.territoryWrite.includes(req.currentUser.roleSlug)
      && !isUnscoped(req.currentUser)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const policy = await loadTerritoryPolicy(req.app.locals.pool);
    return res.status(200).json({ success: true, data: policy });
  } catch (err) {
    console.error('[Territories] GET /policies error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load territory policies.' });
  }
});

// PUT /api/territories/policies
router.put('/policies', async (req, res) => {
  try {
    if (!isUnscoped(req.currentUser)) {
      return res.status(403).json({
        success: false,
        message: 'Only Operating Manager or Super Admin can change territory policies.',
      });
    }
    const pool = req.app.locals.pool;
    const current = await loadTerritoryPolicy(pool);
    const body = req.body || {};
    const inactivityDays = Number(body.inactivityDays ?? current.inactivityDays);
    if (!Number.isInteger(inactivityDays) || inactivityDays < 1 || inactivityDays > 3650) {
      return res.status(400).json({ success: false, message: 'inactivityDays must be an integer between 1 and 3650.' });
    }
    const mode = String(body.mode || current.mode || 'off');
    if (!['off', 'flag_for_review', 'auto_deactivate'].includes(mode)) {
      return res.status(400).json({ success: false, message: 'Invalid policy mode.' });
    }
    const next = {
      inactivityDays,
      usageSignals: {
        ...DEFAULT_TERRITORY_POLICY.usageSignals,
        ...(current.usageSignals || {}),
        ...(body.usageSignals || {}),
      },
      blockers: {
        ...DEFAULT_TERRITORY_POLICY.blockers,
        ...(current.blockers || {}),
        ...(body.blockers || {}),
      },
      mode,
      notifyBranchManager: body.notifyBranchManager != null
        ? Boolean(body.notifyBranchManager)
        : Boolean(current.notifyBranchManager),
      preserveHistory: true,
    };

    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (setting_key) DO UPDATE
         SET setting_value = EXCLUDED.setting_value,
             updated_at = CURRENT_TIMESTAMP`,
      [TERRITORY_POLICY_KEY, JSON.stringify(next)]
    );

    await writeAuditFromReq(pool, req, {
      module: 'Territories',
      activity: 'Update Territory Policy',
      action: 'Update Territory Policy',
      description: `Territory policy mode set to ${next.mode}; inactivityDays=${next.inactivityDays}.`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: 'system_settings:territory_policies',
    });

    return res.status(200).json({ success: true, data: next, message: 'Territory policy saved.' });
  } catch (err) {
    console.error('[Territories] PUT /policies error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save territory policies.' });
  }
});

async function handleGeocode(req, res) {
  try {
    // Sales agents need forward geocode for address search during registration.
    if (!ROLE_SETS.territoryRead.includes(req.currentUser.roleSlug)
      && !isUnscoped(req.currentUser)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const query = String(req.query.q || req.query.query || req.query.barangay_name || '').trim();
    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query is required.' });
    }
    const result = await geocodeBarangay({
      barangayCode: req.query.barangay_code,
      barangayName: query,
      municipalityName: req.query.municipality_name || req.query.city || 'Davao City',
      provinceName: req.query.province_name || req.query.province || 'Davao del Sur',
    });
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'No geocode match found. Place the map pin manually.',
      });
    }
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[Territories] geocode error:', err.message);
    return res.status(502).json({
      success: false,
      message: 'Geocoding service unavailable. Place the map pin manually.',
    });
  }
}

// Dedicated paths so these never collide with /:id
router.get('/geo/lookup', handleGeocode);
router.get('/geocode', handleGeocode);

router.get('/geo/reverse', async (req, res) => {
  try {
    const lat = Number(req.query.lat ?? req.query.latitude);
    const lng = Number(req.query.lng ?? req.query.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, message: 'lat and lng are required.' });
    }
    const result = await reverseGeocodeLatLng(lat, lng);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'No reverse-geocode match. Enter address fields manually.',
      });
    }
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[Territories] reverse geocode error:', err.message);
    return res.status(502).json({
      success: false,
      message: 'Reverse geocoding unavailable. Enter address fields manually.',
    });
  }
});

router.get('/geo/suggest-territory', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const lat = Number(req.query.lat ?? req.query.latitude);
    const lng = Number(req.query.lng ?? req.query.longitude);
    const barangay = String(req.query.barangay || req.query.address_barangay || '').trim();
    const branchId = isUnscoped(user)
      ? (req.query.branch_id ? Number(req.query.branch_id) : null)
      : user.branchId;

    if (!branchId) {
      return res.status(400).json({ success: false, message: 'branch_id is required.' });
    }

    const policies = await loadCreditPolicies(pool);
    const buffer = Number(policies.territory_buffer_meters) || 250;

    const territories = await pool.query(
      `SELECT territory_id, territory_name, barangay_name, barangay_code,
              latitude::float AS latitude, longitude::float AS longitude,
              COALESCE(radius_meters, 800) AS radius_meters, status
       FROM territories
       WHERE branch_id = $1
         AND COALESCE(status, 'Active') = 'Active'`,
      [branchId]
    );

    let byBarangay = null;
    if (barangay) {
      byBarangay = territories.rows.find((t) => (
        String(t.barangay_name || '').toLowerCase() === barangay.toLowerCase()
      )) || null;
    }

    let nearest = null;
    let classification = 'unknown';
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const scored = territories.rows
        .filter((t) => Number.isFinite(Number(t.latitude)) && Number.isFinite(Number(t.longitude)))
        .map((t) => {
          const toRad = (d) => (Number(d) * Math.PI) / 180;
          const R = 6371000;
          const dLat = toRad(Number(t.latitude) - lat);
          const dLon = toRad(Number(t.longitude) - lng);
          const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat)) * Math.cos(toRad(Number(t.latitude))) * Math.sin(dLon / 2) ** 2;
          const distance = 2 * R * Math.asin(Math.sqrt(a));
          const radius = Number(t.radius_meters) || 800;
          return { ...t, distance_meters: Math.round(distance), radius_meters: radius };
        })
        .sort((a, b) => a.distance_meters - b.distance_meters);
      nearest = scored[0] || null;
      if (nearest) {
        if (nearest.distance_meters <= nearest.radius_meters) classification = 'inside';
        else if (nearest.distance_meters <= nearest.radius_meters + buffer) classification = 'near';
        else classification = 'outside';
      }
    } else if (byBarangay) {
      classification = 'barangay_match';
    }

    // Coordinates are the authoritative signal when a pin is available.
    // A same-name barangay can exist in multiple places and must not override
    // the actual customer location.
    const suggested = Number.isFinite(lat) && Number.isFinite(lng)
      ? nearest
      : byBarangay;

    return res.status(200).json({
      success: true,
      data: {
        suggested_territory_id: suggested?.territory_id || null,
        suggested_territory_name: suggested?.territory_name || null,
        classification,
        buffer_meters: buffer,
        nearest: nearest ? {
          territory_id: nearest.territory_id,
          territory_name: nearest.territory_name,
          distance_meters: nearest.distance_meters,
          radius_meters: nearest.radius_meters,
        } : null,
        barangay_match: byBarangay ? {
          territory_id: byBarangay.territory_id,
          territory_name: byBarangay.territory_name,
        } : null,
      },
    });
  } catch (err) {
    console.error('[Territories] suggest-territory error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to suggest territory.' });
  }
});

// GET /api/territories/assignable-users — retained for other consumers
router.get('/assignable-users', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const roleFilter = String(req.query.role || '').trim();
    const conditions = [`u.status = 'Active'`];
    const params = [];

    if (roleFilter === 'sales_staff' || roleFilter === 'collector') {
      params.push(roleFilter);
      conditions.push(`r.slug = $${params.length}`);
    } else {
      conditions.push(`r.slug IN ('sales_staff', 'collector', 'branch_manager')`);
    }

    if (!isUnscoped(user)) {
      if (user.branchId == null) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: no branch is assigned to this account.',
        });
      }
      params.push(user.branchId);
      conditions.push(`u.branch_id = $${params.length}`);
    } else if (req.query.branch_id) {
      params.push(Number(req.query.branch_id));
      conditions.push(`u.branch_id = $${params.length}`);
    }

    const result = await pool.query(
      `SELECT u.id, u.branch_id, r.slug AS role_slug,
              NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name)), '') AS full_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY full_name`,
      params
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Territories] GET /assignable-users error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load assignable users.' });
  }
});

// GET /api/territories
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const { status = 'Active', search = '', branch_id: branchId, sort = 'name', order = 'asc' } = req.query;
    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (!isUnscoped(user)) {
      if (user.branchId == null) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: no branch is assigned to this account.',
        });
      }
      conditions.push(`t.branch_id = $${pIdx++}`);
      params.push(user.branchId);
    } else if (branchId) {
      conditions.push(`t.branch_id = $${pIdx++}`);
      params.push(Number(branchId));
    }

    if (String(status).toLowerCase() === 'inactive') {
      conditions.push(`COALESCE(t.status, 'Active') = 'Inactive'`);
    } else if (String(status).toLowerCase() !== 'all') {
      conditions.push(`COALESCE(t.status, 'Active') = $${pIdx++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(
        t.territory_name ILIKE $${pIdx}
        OR COALESCE(t.coverage_area, '') ILIKE $${pIdx}
        OR COALESCE(t.barangay_name, '') ILIKE $${pIdx}
        OR COALESCE(t.municipality_name, '') ILIKE $${pIdx}
      )`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortKey = String(sort).toLowerCase();
    const sortDir = String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const orderSql = sortKey === 'barangay'
      ? `LOWER(COALESCE(t.barangay_name, '')) ${sortDir}, LOWER(t.territory_name) ASC`
      : sortKey === 'customers'
        ? `COUNT(DISTINCT c.customer_id) ${sortDir}, LOWER(t.territory_name) ASC`
        : sortKey === 'overdue'
          ? `COUNT(DISTINCT c.customer_id) FILTER (WHERE ${OVERDUE_CUSTOMER}) ${sortDir}, LOWER(t.territory_name) ASC`
          : `LOWER(t.territory_name) ${sortDir}`;

    const result = await pool.query(
      `SELECT
         t.territory_id,
         t.territory_name,
         t.branch_id,
         b.name AS branch_name,
         t.coverage_area,
         COALESCE(t.status, 'Active') AS status,
         t.latitude::FLOAT AS latitude,
         t.longitude::FLOAT AS longitude,
         COALESCE(t.radius_meters, ${DEFAULT_RADIUS_M}) AS radius_meters,
         t.barangay_code,
         t.barangay_name,
         t.municipality_name,
         t.province_name,
         COUNT(DISTINCT c.customer_id)::INT AS customer_count,
         COUNT(DISTINCT c.customer_id) FILTER (WHERE ${OVERDUE_CUSTOMER})::INT AS overdue_customer_count,
         CASE
           WHEN t.latitude IS NOT NULL AND t.longitude IS NOT NULL THEN 'Pin Set'
           ELSE 'Missing'
         END AS map_location
       FROM territories t
       LEFT JOIN branches b ON b.id = t.branch_id
       LEFT JOIN customers c ON c.territory_id = t.territory_id AND c.branch_id = t.branch_id
       ${where}
       GROUP BY
         t.territory_id, t.territory_name, t.branch_id, b.name, t.coverage_area, t.status,
         t.latitude, t.longitude, t.radius_meters, t.barangay_code, t.barangay_name,
         t.municipality_name, t.province_name
       ORDER BY ${orderSql}`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Territories] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch territories.' });
  }
});

// Numeric id only — prevents /geocode (and similar) from being parsed as an id.
// GET /api/territories/:id/dependencies — for deactivate modal
router.get('/:id/dependencies', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const territoryId = Number(req.params.id);
    if (!Number.isFinite(territoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid territory id.' });
    }
    const existing = await pool.query(
      `SELECT territory_id, territory_name, branch_id, COALESCE(status, 'Active') AS status
       FROM territories WHERE territory_id = $1`,
      [territoryId]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Territory not found.' });
    }
    if (!isUnscoped(user) && Number(existing.rows[0].branch_id) !== Number(user.branchId)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const deps = await dependencyCounts(pool, territoryId);
    return res.status(200).json({
      success: true,
      data: {
        territoryId,
        territoryName: existing.rows[0].territory_name,
        status: existing.rows[0].status,
        ...deps,
      },
    });
  } catch (err) {
    console.error('[Territories] GET /:id/dependencies error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load dependencies.' });
  }
});

// GET /api/territories/:id
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const territoryId = Number(req.params.id);
    if (!Number.isFinite(territoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid territory id.' });
    }

    const result = await pool.query(
      `SELECT
         t.territory_id,
         t.territory_name,
         t.branch_id,
         b.name AS branch_name,
         t.coverage_area,
         COALESCE(t.status, 'Active') AS status,
         t.latitude::FLOAT AS latitude,
         t.longitude::FLOAT AS longitude,
         COALESCE(t.radius_meters, ${DEFAULT_RADIUS_M}) AS radius_meters,
         t.barangay_code,
         t.barangay_name,
         t.municipality_name,
         t.province_name,
         COUNT(DISTINCT c.customer_id)::INT AS customer_count,
         COUNT(DISTINCT c.customer_id) FILTER (WHERE ${OVERDUE_CUSTOMER})::INT AS overdue_customer_count
       FROM territories t
       LEFT JOIN branches b ON b.id = t.branch_id
       LEFT JOIN customers c ON c.territory_id = t.territory_id AND c.branch_id = t.branch_id
       WHERE t.territory_id = $1
       GROUP BY t.territory_id, b.name`,
      [territoryId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Territory not found.' });
    }

    const row = result.rows[0];
    if (!isUnscoped(user) && Number(row.branch_id) !== Number(user.branchId)) {
      return res.status(403).json({ success: false, message: 'Access denied: you can only access data for your assigned branch.' });
    }

    return res.status(200).json({ success: true, data: row });
  } catch (err) {
    console.error('[Territories] GET /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch territory.' });
  }
});

// POST /api/territories
router.post('/', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    await client.query('BEGIN');
    const body = { ...req.body, status: 'Active' };
    const validated = await validateTerritoryPayload(client, body, { user: req.currentUser });
    if (!validated.ok) {
      await client.query('ROLLBACK');
      return res.status(validated.status).json({ success: false, message: validated.message });
    }

    const payload = validated.value;
    const result = await client.query(
      `INSERT INTO territories (
         territory_name, branch_id, assigned_user, coverage_area, status,
         latitude, longitude, radius_meters,
         default_sales_agent_id, default_collector_id,
         barangay_code, barangay_name, municipality_name, province_name
       ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,NULL,NULL,$8,$9,$10,$11)
       RETURNING territory_id, territory_name, branch_id, coverage_area,
                 status, latitude, longitude, radius_meters,
                 barangay_code, barangay_name, municipality_name, province_name`,
      [
        payload.territory_name,
        payload.branch_id,
        payload.coverage_area ?? null,
        payload.status,
        payload.latitude,
        payload.longitude,
        payload.radius_meters,
        payload.barangay_code,
        payload.barangay_name,
        payload.municipality_name,
        payload.province_name,
      ]
    );

    await client.query('COMMIT');
    const created = result.rows[0];

    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Territories',
      activity: 'Create Territory',
      action: 'Create Territory',
      description: `Created territory ${payload.territory_name}${payload.barangay_name ? ` (${payload.barangay_name})` : ''}.`,
      status: AUDIT_STATUS.CREATED,
      affectedRecord: `territory:${created.territory_id}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Territory created successfully.',
      data: created,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[Territories] POST / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create territory.' });
  } finally {
    client.release();
  }
});

// PUT /api/territories/:id
router.put('/:id', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const territoryId = Number(req.params.id);
    if (!Number.isFinite(territoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid territory id.' });
    }

    await client.query('BEGIN');
    const existingResult = await client.query(
      `SELECT territory_id, branch_id, territory_name, coverage_area, status,
              latitude, longitude, radius_meters,
              barangay_code, barangay_name, municipality_name, province_name
       FROM territories
       WHERE territory_id = $1
       FOR UPDATE`,
      [territoryId]
    );
    if (!existingResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Territory not found.' });
    }
    const existing = existingResult.rows[0];

    if (!isUnscoped(req.currentUser) && Number(existing.branch_id) !== Number(req.currentUser.branchId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Access denied: you can only access data for your assigned branch.' });
    }

    // Edit keeps current status unless soft-deactivate endpoint is used.
    const mergedBody = {
      territory_name: req.body.territory_name !== undefined ? req.body.territory_name : existing.territory_name,
      branch_id: req.body.branch_id !== undefined ? req.body.branch_id : existing.branch_id,
      status: existing.status || 'Active',
      latitude: req.body.latitude !== undefined ? req.body.latitude : existing.latitude,
      longitude: req.body.longitude !== undefined ? req.body.longitude : existing.longitude,
      radius_meters: req.body.radius_meters !== undefined ? req.body.radius_meters : existing.radius_meters,
      barangay_code: req.body.barangay_code !== undefined ? req.body.barangay_code : existing.barangay_code,
      barangay_name: req.body.barangay_name !== undefined ? req.body.barangay_name : existing.barangay_name,
      municipality_name: req.body.municipality_name !== undefined ? req.body.municipality_name : existing.municipality_name,
      province_name: req.body.province_name !== undefined ? req.body.province_name : existing.province_name,
      coverage_area: req.body.coverage_area !== undefined
        ? req.body.coverage_area
        : (req.body.notes !== undefined ? req.body.notes : existing.coverage_area),
      notes: req.body.notes,
    };

    const validated = await validateTerritoryPayload(client, mergedBody, {
      user: req.currentUser,
      existing,
    });
    if (!validated.ok) {
      await client.query('ROLLBACK');
      return res.status(validated.status).json({ success: false, message: validated.message });
    }

    const payload = validated.value;
    const result = await client.query(
      `UPDATE territories SET
         territory_name = $1,
         branch_id = $2,
         assigned_user = NULL,
         coverage_area = $3,
         status = $4,
         latitude = $5,
         longitude = $6,
         radius_meters = $7,
         default_sales_agent_id = NULL,
         default_collector_id = NULL,
         barangay_code = $8,
         barangay_name = $9,
         municipality_name = $10,
         province_name = $11,
         updated_at = CURRENT_TIMESTAMP
       WHERE territory_id = $12
       RETURNING territory_id, territory_name, branch_id, coverage_area,
                 status, latitude, longitude, radius_meters,
                 barangay_code, barangay_name, municipality_name, province_name`,
      [
        payload.territory_name,
        payload.branch_id,
        payload.coverage_area ?? null,
        payload.status,
        payload.latitude,
        payload.longitude,
        payload.radius_meters,
        payload.barangay_code,
        payload.barangay_name,
        payload.municipality_name,
        payload.province_name,
        territoryId,
      ]
    );

    await client.query(`DELETE FROM territory_assignments WHERE territory_id = $1`, [territoryId]);
    await client.query('COMMIT');

    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Territories',
      activity: 'Edit Territory',
      action: 'Edit Territory',
      description: `Edited territory #${territoryId} (${payload.territory_name}).`,
      status: AUDIT_STATUS.UPDATED,
      affectedRecord: `territory:${territoryId}`,
    });

    return res.status(200).json({
      success: true,
      message: 'Territory updated successfully.',
      data: result.rows[0],
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[Territories] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update territory.' });
  } finally {
    client.release();
  }
});

// DELETE /api/territories/:id — Soft archive
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const user = req.currentUser;
    const territoryId = Number(req.params.id);

    const existing = await pool.query(
      `SELECT branch_id, COALESCE(status, 'Active') AS status, territory_name
       FROM territories WHERE territory_id = $1`,
      [territoryId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Territory not found.' });
    }

    if (!isUnscoped(user) && Number(existing.rows[0].branch_id) !== Number(user.branchId)) {
      return res.status(403).json({ success: false, message: 'Access denied: you can only access data for your assigned branch.' });
    }
    if (existing.rows[0].status === 'Inactive') {
      return res.status(400).json({ success: false, message: 'Territory is already inactive.' });
    }

    const deps = await dependencyCounts(pool, territoryId);

    await pool.query(
      `UPDATE territories
       SET status = 'Inactive',
           default_sales_agent_id = NULL,
           default_collector_id = NULL,
           assigned_user = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE territory_id = $1`,
      [territoryId]
    );

    await writeAuditFromReq(pool, req, {
      module: 'Territories',
      activity: 'Archive Territory',
      action: 'Archive Territory',
      description: `Deactivated territory #${territoryId} (${existing.rows[0].territory_name}). Record preserved. activeCustomers=${deps.activeCustomers}, overdue=${deps.overdueCustomers}, openAssignments=${deps.openAssignments}.`,
      status: AUDIT_STATUS.ARCHIVED,
      affectedRecord: `territory:${territoryId}`,
    });

    return res.status(200).json({
      success: true,
      message: 'Territory deactivated. Historical customer and assignment records are preserved.',
      data: { dependencies: deps },
    });
  } catch (err) {
    console.error('[Territories] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to deactivate territory.' });
  }
});

export default router;
