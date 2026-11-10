import express from 'express';
import { allow, isUnscoped, ROLE_SETS } from '../middleware/auth.js';
import { AUDIT_STATUS, writeAuditFromReq } from '../lib/auditLog.js';

const router = express.Router();
router.use(allow(ROLE_SETS.territoryRead, ROLE_SETS.territoryWrite));

const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 20000;
const DEFAULT_RADIUS_M = 800;

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

function parseRadius(value) {
  if (value == null || value === '') return { ok: true, value: DEFAULT_RADIUS_M };
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, message: 'Coverage radius must be a whole number of meters.' };
  }
  if (n < MIN_RADIUS_M || n > MAX_RADIUS_M) {
    return { ok: false, message: `Coverage radius must be between ${MIN_RADIUS_M} and ${MAX_RADIUS_M} meters.` };
  }
  return { ok: true, value: n };
}

function normalizeStatus(value, { required = false } = {}) {
  if (value == null || value === '') {
    return required ? { ok: false, message: 'Status is required.' } : { ok: true, value: 'Active' };
  }
  const status = String(value).trim();
  if (status !== 'Active' && status !== 'Inactive') {
    return { ok: false, message: 'Status must be Active or Inactive.' };
  }
  return { ok: true, value: status };
}

async function assertBranchStaff(client, {
  userId,
  branchId,
  expectedSlug,
  label,
}) {
  if (userId == null) return { ok: false, message: `${label} is required for an Active territory.` };
  const result = await client.query(
    `SELECT u.id, u.branch_id, u.status, r.slug AS role_slug
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.id = $1`,
    [Number(userId)]
  );
  if (!result.rows.length) {
    return { ok: false, message: `${label} was not found.` };
  }
  const row = result.rows[0];
  if (String(row.status) !== 'Active') {
    return { ok: false, message: `${label} must be an active employee.` };
  }
  if (Number(row.branch_id) !== Number(branchId)) {
    return { ok: false, message: `${label} must belong to the same branch as the territory.` };
  }
  if (row.role_slug !== expectedSlug) {
    return { ok: false, message: `${label} must have the ${expectedSlug === 'sales_staff' ? 'Sales Agent' : 'Collector'} role.` };
  }
  return { ok: true, value: Number(row.id) };
}

async function syncTerritoryAssignments(client, territoryId, salesAgentId, collectorId) {
  await client.query(`DELETE FROM territory_assignments WHERE territory_id = $1`, [territoryId]);
  const ids = [...new Set([salesAgentId, collectorId].filter((id) => id != null))];
  for (const uid of ids) {
    const role = await client.query(`SELECT role_id FROM users WHERE id = $1`, [uid]);
    await client.query(
      `INSERT INTO territory_assignments (territory_id, user_id, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (territory_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [territoryId, uid, role.rows[0]?.role_id ?? null]
    );
  }
}

function personNameSql(alias) {
  return `NULLIF(TRIM(CONCAT_WS(' ', ${alias}.first_name, ${alias}.middle_name, ${alias}.last_name)), '')`;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/territories/assignable-users
// ──────────────────────────────────────────────────────────────────────────────
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
      `SELECT
         u.id AS user_id,
         u.first_name,
         u.middle_name,
         u.last_name,
         u.branch_id,
         r.role_name,
         r.slug AS role_slug
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.first_name, u.last_name`,
      params
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Territories] GET /assignable-users error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch assignable users.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/territories
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { branch_id, search, status } = req.query;
    const user = req.currentUser;

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
    } else if (branch_id) {
      conditions.push(`t.branch_id = $${pIdx++}`);
      params.push(Number(branch_id));
    }

    if (!status || String(status).toLowerCase() === 'active') {
      conditions.push(`COALESCE(t.status, 'Active') = 'Active'`);
    } else if (String(status).toLowerCase() === 'inactive') {
      conditions.push(`COALESCE(t.status, 'Active') = 'Inactive'`);
    } else if (String(status).toLowerCase() !== 'all') {
      conditions.push(`COALESCE(t.status, 'Active') = $${pIdx++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(t.territory_name ILIKE $${pIdx} OR COALESCE(t.coverage_area, '') ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         t.territory_id,
         t.territory_name,
         t.branch_id,
         b.name AS branch_name,
         t.assigned_user,
         ${personNameSql('u')} AS assigned_user_name,
         r.role_name,
         t.coverage_area,
         COALESCE(t.status, 'Active') AS status,
         t.latitude::FLOAT AS latitude,
         t.longitude::FLOAT AS longitude,
         COALESCE(t.radius_meters, ${DEFAULT_RADIUS_M}) AS radius_meters,
         t.default_sales_agent_id,
         ${personNameSql('sa')} AS default_sales_agent_name,
         t.default_collector_id,
         ${personNameSql('col')} AS default_collector_name,
         COUNT(DISTINCT c.customer_id)::INT AS customer_count,
         CASE
           WHEN t.latitude IS NOT NULL AND t.longitude IS NOT NULL THEN 'Pin Set'
           ELSE 'Missing'
         END AS map_location,
         COALESCE(
           JSON_AGG(
             DISTINCT JSONB_BUILD_OBJECT(
               'user_id', ta.user_id,
               'user_name', ${personNameSql('u2')},
               'role_name', r2.role_name,
               'role_slug', r2.slug
             )
           ) FILTER (WHERE ta.user_id IS NOT NULL),
           '[]'
         ) AS assigned_users
       FROM territories t
       LEFT JOIN branches b ON b.id = t.branch_id
       LEFT JOIN users u ON u.id = t.assigned_user
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN users sa ON sa.id = t.default_sales_agent_id
       LEFT JOIN users col ON col.id = t.default_collector_id
       LEFT JOIN territory_assignments ta ON t.territory_id = ta.territory_id
       LEFT JOIN users u2 ON u2.id = ta.user_id
       LEFT JOIN roles r2 ON r2.role_id = u2.role_id
       LEFT JOIN customers c ON c.territory_id = t.territory_id AND c.branch_id = t.branch_id
       ${where}
       GROUP BY
         t.territory_id, t.territory_name, t.branch_id, b.name, t.assigned_user,
         u.first_name, u.middle_name, u.last_name, r.role_name, t.coverage_area, t.status,
         t.latitude, t.longitude, t.radius_meters, t.default_sales_agent_id,
         sa.first_name, sa.middle_name, sa.last_name, t.default_collector_id,
         col.first_name, col.middle_name, col.last_name
       ORDER BY t.territory_name`,
      params
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error('[Territories] GET / error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch territories.' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/territories/:id
// ──────────────────────────────────────────────────────────────────────────────
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
         t.default_sales_agent_id,
         ${personNameSql('sa')} AS default_sales_agent_name,
         t.default_collector_id,
         ${personNameSql('col')} AS default_collector_name,
         COUNT(DISTINCT c.customer_id)::INT AS customer_count
       FROM territories t
       LEFT JOIN branches b ON b.id = t.branch_id
       LEFT JOIN users sa ON sa.id = t.default_sales_agent_id
       LEFT JOIN users col ON col.id = t.default_collector_id
       LEFT JOIN customers c ON c.territory_id = t.territory_id AND c.branch_id = t.branch_id
       WHERE t.territory_id = $1
       GROUP BY
         t.territory_id, b.name,
         sa.first_name, sa.middle_name, sa.last_name,
         col.first_name, col.middle_name, col.last_name`,
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

  const statusResult = normalizeStatus(body.status, { required: body.status !== undefined });
  if (!statusResult.ok) return { ok: false, status: 400, message: statusResult.message };
  const status = statusResult.value;

  const latResult = parseCoord(body.latitude, 'Latitude');
  const lngResult = parseCoord(body.longitude, 'Longitude');
  const radiusResult = parseRadius(body.radius_meters);

  if (status === 'Active') {
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
  if (!radiusResult.ok) return { ok: false, status: 400, message: radiusResult.message };

  const salesAgentRaw = body.default_sales_agent_id !== undefined
    ? parseOptionalNumber(body.default_sales_agent_id)
    : (existing?.default_sales_agent_id ?? null);
  const collectorRaw = body.default_collector_id !== undefined
    ? parseOptionalNumber(body.default_collector_id)
    : (existing?.default_collector_id ?? null);

  if (Number.isNaN(salesAgentRaw) || Number.isNaN(collectorRaw)) {
    return { ok: false, status: 400, message: 'Default personnel ids must be valid numbers.' };
  }

  let defaultSalesAgentId = salesAgentRaw;
  let defaultCollectorId = collectorRaw;

  if (status === 'Active') {
    const saCheck = await assertBranchStaff(client, {
      userId: defaultSalesAgentId,
      branchId: finalBranchId,
      expectedSlug: 'sales_staff',
      label: 'Default Sales Agent',
    });
    if (!saCheck.ok) return { ok: false, status: 400, message: saCheck.message };
    defaultSalesAgentId = saCheck.value;

    const colCheck = await assertBranchStaff(client, {
      userId: defaultCollectorId,
      branchId: finalBranchId,
      expectedSlug: 'collector',
      label: 'Default Collector',
    });
    if (!colCheck.ok) return { ok: false, status: 400, message: colCheck.message };
    defaultCollectorId = colCheck.value;
  } else {
    if (defaultSalesAgentId != null) {
      const saCheck = await assertBranchStaff(client, {
        userId: defaultSalesAgentId,
        branchId: finalBranchId,
        expectedSlug: 'sales_staff',
        label: 'Default Sales Agent',
      });
      if (!saCheck.ok) return { ok: false, status: 400, message: saCheck.message };
      defaultSalesAgentId = saCheck.value;
    }
    if (defaultCollectorId != null) {
      const colCheck = await assertBranchStaff(client, {
        userId: defaultCollectorId,
        branchId: finalBranchId,
        expectedSlug: 'collector',
        label: 'Default Collector',
      });
      if (!colCheck.ok) return { ok: false, status: 400, message: colCheck.message };
      defaultCollectorId = colCheck.value;
    }
  }

  const dup = await client.query(
    `SELECT territory_id
     FROM territories
     WHERE branch_id = $1
       AND lower(btrim(territory_name)) = lower(btrim($2))
       AND COALESCE(status, 'Active') = 'Active'
       AND ($3::INT IS NULL OR territory_id <> $3)
     LIMIT 1`,
    [Number(finalBranchId), territoryName, existing?.territory_id ?? null]
  );
  if (dup.rows.length && status === 'Active') {
    return {
      ok: false,
      status: 409,
      message: 'An Active territory with this name already exists in the branch.',
    };
  }

  return {
    ok: true,
    value: {
      territory_name: territoryName,
      branch_id: Number(finalBranchId),
      status,
      latitude: latResult.ok ? latResult.value : null,
      longitude: lngResult.ok ? lngResult.value : null,
      radius_meters: radiusResult.value,
      default_sales_agent_id: defaultSalesAgentId,
      default_collector_id: defaultCollectorId,
      coverage_area: typeof body.coverage_area === 'string' ? (body.coverage_area.trim() || null) : (body.notes != null ? String(body.notes).trim() || null : undefined),
      notes: typeof body.notes === 'string' ? (body.notes.trim() || null) : undefined,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/territories
// ──────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    await client.query('BEGIN');
    const validated = await validateTerritoryPayload(client, req.body, { user: req.currentUser });
    if (!validated.ok) {
      await client.query('ROLLBACK');
      return res.status(validated.status).json({ success: false, message: validated.message });
    }

    const payload = validated.value;
    const notes = payload.notes !== undefined ? payload.notes : payload.coverage_area;

    const result = await client.query(
      `INSERT INTO territories (
         territory_name, branch_id, assigned_user, coverage_area, status,
         latitude, longitude, radius_meters,
         default_sales_agent_id, default_collector_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING territory_id, territory_name, branch_id, assigned_user, coverage_area,
                 status, latitude, longitude, radius_meters,
                 default_sales_agent_id, default_collector_id`,
      [
        payload.territory_name,
        payload.branch_id,
        payload.default_collector_id || payload.default_sales_agent_id || null,
        notes ?? null,
        payload.status,
        payload.latitude,
        payload.longitude,
        payload.radius_meters,
        payload.default_sales_agent_id,
        payload.default_collector_id,
      ]
    );

    const created = result.rows[0];
    await syncTerritoryAssignments(
      client,
      created.territory_id,
      payload.default_sales_agent_id,
      payload.default_collector_id
    );

    await client.query('COMMIT');

    await writeAuditFromReq(req.app.locals.pool, req, {
      module: 'Territories',
      activity: 'Create Territory',
      action: 'Create Territory',
      description: `Created territory ${payload.territory_name}.`,
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

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/territories/:id
// ──────────────────────────────────────────────────────────────────────────────
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
              default_sales_agent_id, default_collector_id
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

    const mergedBody = {
      territory_name: req.body.territory_name !== undefined ? req.body.territory_name : existing.territory_name,
      branch_id: req.body.branch_id !== undefined ? req.body.branch_id : existing.branch_id,
      status: req.body.status !== undefined ? req.body.status : existing.status,
      latitude: req.body.latitude !== undefined ? req.body.latitude : existing.latitude,
      longitude: req.body.longitude !== undefined ? req.body.longitude : existing.longitude,
      radius_meters: req.body.radius_meters !== undefined ? req.body.radius_meters : existing.radius_meters,
      default_sales_agent_id: req.body.default_sales_agent_id !== undefined
        ? req.body.default_sales_agent_id
        : existing.default_sales_agent_id,
      default_collector_id: req.body.default_collector_id !== undefined
        ? req.body.default_collector_id
        : existing.default_collector_id,
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
    const notes = payload.notes !== undefined ? payload.notes : payload.coverage_area;

    const result = await client.query(
      `UPDATE territories SET
         territory_name = $1,
         branch_id = $2,
         assigned_user = $3,
         coverage_area = $4,
         status = $5,
         latitude = $6,
         longitude = $7,
         radius_meters = $8,
         default_sales_agent_id = $9,
         default_collector_id = $10,
         updated_at = CURRENT_TIMESTAMP
       WHERE territory_id = $11
       RETURNING territory_id, territory_name, branch_id, assigned_user, coverage_area,
                 status, latitude, longitude, radius_meters,
                 default_sales_agent_id, default_collector_id`,
      [
        payload.territory_name,
        payload.branch_id,
        payload.default_collector_id || payload.default_sales_agent_id || null,
        notes ?? null,
        payload.status,
        payload.latitude,
        payload.longitude,
        payload.radius_meters,
        payload.default_sales_agent_id,
        payload.default_collector_id,
        territoryId,
      ]
    );

    await syncTerritoryAssignments(
      client,
      territoryId,
      payload.default_sales_agent_id,
      payload.default_collector_id
    );

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

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/territories/:id  — Soft archive (status = Inactive)
// ──────────────────────────────────────────────────────────────────────────────
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

    await pool.query(
      `UPDATE territories
       SET status = 'Inactive', updated_at = CURRENT_TIMESTAMP
       WHERE territory_id = $1`,
      [territoryId]
    );

    await writeAuditFromReq(pool, req, {
      module: 'Territories',
      activity: 'Archive Territory',
      action: 'Archive Territory',
      description: `Deactivated territory #${territoryId} (${existing.rows[0].territory_name}). Record preserved.`,
      status: AUDIT_STATUS.ARCHIVED,
      affectedRecord: `territory:${territoryId}`,
    });

    return res.status(200).json({
      success: true,
      message: 'Territory deactivated. Historical customer and assignment records are preserved.',
    });
  } catch (err) {
    console.error('[Territories] DELETE /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to deactivate territory.' });
  }
});

export default router;
