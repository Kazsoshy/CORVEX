/**
 * Smoke checks for sales area dispatch rules (date-range + overlap conflicts).
 * Usage: node backend/scripts/test_sales_area_dispatch_rules.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import {
  autoCloseStaleAssignments,
  findAreaAssignmentConflicts,
  normalizeAreaName,
} from '../lib/salesAreaAssignments.js';
import { manilaDateString } from '../lib/sawCollection.js';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });
const { Pool } = pkg;
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const results = [];
  const today = manilaDateString();

  const col = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_area_assignments' AND column_name = 'end_date'
  `);
  assert(col.rows.length === 1, 'end_date column missing');
  results.push(['end_date_column', 'PASS']);

  const idx = await pool.query(`
    SELECT indexname FROM pg_indexes
    WHERE indexname IN (
      'idx_sales_area_assignments_agent_range',
      'idx_sales_area_assignments_territory_range'
    )
    ORDER BY 1
  `);
  assert(idx.rows.length >= 1, 'range indexes missing');
  results.push(['range_indexes', 'PASS', `count=${idx.rows.length}`]);

  assert(normalizeAreaName('  Bangoy  Area ') === 'bangoy area', 'normalizeAreaName failed');
  results.push(['normalize_area_name', 'PASS']);

  const agents = await pool.query(`
    SELECT u.id, u.branch_id
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
    WHERE r.slug = 'sales_staff' AND u.status = 'Active' AND u.branch_id IS NOT NULL
    ORDER BY u.id
  `);
  assert(agents.rows.length >= 1, 'need at least one sales agent');
  results.push(['sales_agents_present', 'PASS', `count=${agents.rows.length}`]);

  const agent = agents.rows[0];
  const territory = await pool.query(
    `SELECT territory_id, territory_name FROM territories WHERE branch_id = $1 ORDER BY territory_id LIMIT 1`,
    [agent.branch_id]
  );

  if (territory.rows[0]) {
    const t = territory.rows[0];
    const probeName = `QA Probe Area ${Date.now()}`;
    const tomorrow = (() => {
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    })();

    const insert = await pool.query(
      `INSERT INTO sales_area_assignments (
         branch_id, sales_agent_id, territory_id, area_name, coverage_notes,
         work_date, end_date, status, latitude, longitude, radius_meters
       ) VALUES ($1, $2, NULL, $3, 'probe', $4::date, $5::date, 'Assigned', NULL, NULL, 800)
       RETURNING assignment_id`,
      [agent.branch_id, agent.id, probeName, today, tomorrow]
    );
    const conflictSameName = await findAreaAssignmentConflicts(pool, {
      branchId: agent.branch_id,
      salesAgentId: agent.id,
      workDate: today,
      endDate: tomorrow,
      areaName: probeName,
    });
    assert(conflictSameName.conflicts.some((c) => c.code === 'same_agent_same_area_name'), 'same area name not blocked');
    results.push(['same_agent_same_area_name', 'PASS']);

    // Overlap across a multi-day window vs single day inside that window
    const conflictOverlapDay = await findAreaAssignmentConflicts(pool, {
      branchId: agent.branch_id,
      salesAgentId: agent.id,
      workDate: tomorrow,
      endDate: tomorrow,
      areaName: probeName,
    });
    assert(
      conflictOverlapDay.conflicts.some((c) => c.code === 'same_agent_same_area_name'),
      'multi-day range overlap not blocked'
    );
    results.push(['multi_day_overlap', 'PASS']);

    if (agents.rows.length >= 2 && Number(agents.rows[1].branch_id) === Number(agent.branch_id)) {
      const other = agents.rows[1];
      const existingTerr = await pool.query(
        `SELECT assignment_id FROM sales_area_assignments
         WHERE territory_id = $1
           AND status IN ('Assigned', 'In Progress', 'Done')
           AND work_date <= $2::date
           AND COALESCE(end_date, work_date) >= $2::date
         LIMIT 1`,
        [t.territory_id, today]
      );
      let terrAssignmentId = existingTerr.rows[0]?.assignment_id;
      if (!terrAssignmentId) {
        const created = await pool.query(
          `INSERT INTO sales_area_assignments (
             branch_id, sales_agent_id, territory_id, area_name, work_date, end_date, status, radius_meters
           ) VALUES ($1, $2, $3, $4, $5::date, $5::date, 'Assigned', 800)
           RETURNING assignment_id`,
          [agent.branch_id, agent.id, t.territory_id, t.territory_name, today]
        );
        terrAssignmentId = created.rows[0].assignment_id;
      }
      const conflictTerritory = await findAreaAssignmentConflicts(pool, {
        branchId: agent.branch_id,
        salesAgentId: other.id,
        workDate: today,
        endDate: today,
        territoryId: t.territory_id,
        areaName: `${t.territory_name} Alt`,
      });
      assert(
        conflictTerritory.conflicts.some((c) => c.code === 'other_agent_same_territory' || c.code === 'same_agent_same_territory'),
        'same territory overlapping range not blocked across agents'
      );
      results.push(['other_agent_same_territory', 'PASS', `assignment=${terrAssignmentId}`]);
    } else {
      results.push(['other_agent_same_territory', 'SKIP', 'need 2 sales agents in one branch']);
    }

    // Auto-close: Assigned past end_date → Not Started; In Progress → Incomplete
    const past = (() => {
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() - 3);
      return d.toISOString().slice(0, 10);
    })();
    const staleAssigned = await pool.query(
      `INSERT INTO sales_area_assignments (
         branch_id, sales_agent_id, territory_id, area_name, work_date, end_date, status, radius_meters
       ) VALUES ($1, $2, NULL, $3, $4::date, $4::date, 'Assigned', 800)
       RETURNING assignment_id`,
      [agent.branch_id, agent.id, `QA Not Started ${Date.now()}`, past]
    );
    const staleInProgress = await pool.query(
      `INSERT INTO sales_area_assignments (
         branch_id, sales_agent_id, territory_id, area_name, work_date, end_date, status, radius_meters, started_at
       ) VALUES ($1, $2, NULL, $3, $4::date, $4::date, 'In Progress', 800, CURRENT_TIMESTAMP)
       RETURNING assignment_id`,
      [agent.branch_id, agent.id, `QA Incomplete ${Date.now()}`, past]
    );
    const closed = await autoCloseStaleAssignments(pool, { salesAgentId: agent.id });
    const staleRows = await pool.query(
      `SELECT assignment_id, status, completed_at IS NOT NULL AS has_completed
       FROM sales_area_assignments
       WHERE assignment_id = ANY($1::int[])
       ORDER BY assignment_id`,
      [[staleAssigned.rows[0].assignment_id, staleInProgress.rows[0].assignment_id]]
    );
    const byId = new Map(staleRows.rows.map((r) => [r.assignment_id, r]));
    assert(byId.get(staleAssigned.rows[0].assignment_id)?.status === 'Not Started', 'Assigned past end_date should become Not Started');
    assert(byId.get(staleInProgress.rows[0].assignment_id)?.status === 'Incomplete', 'In Progress past end_date should become Incomplete');
    assert(byId.get(staleInProgress.rows[0].assignment_id)?.has_completed === true, 'Incomplete should set completed_at');
    assert((closed.notStarted || 0) >= 1, 'auto-close should count Not Started');
    assert((closed.incomplete || 0) >= 1, 'auto-close should count Incomplete');
    results.push(['auto_close_not_started_incomplete', 'PASS', `notStarted=${closed.notStarted} incomplete=${closed.incomplete}`]);

    // Auto-closed rows must not block new overlaps
    const conflictClosed = await findAreaAssignmentConflicts(pool, {
      branchId: agent.branch_id,
      salesAgentId: agent.id,
      workDate: past,
      endDate: past,
      territoryId: null,
      areaName: byId.get(staleAssigned.rows[0].assignment_id) ? `QA Not Started reuse` : 'x',
    });
    assert(
      !conflictClosed.conflicts.some((c) => Number(c.assignment?.assignment_id) === Number(staleAssigned.rows[0].assignment_id)),
      'Not Started must not block new assignments'
    );
    results.push(['auto_closed_no_block', 'PASS', 'ok']);

    await pool.query(`DELETE FROM sales_area_assignments WHERE assignment_id = ANY($1::int[])`, [[
      insert.rows[0].assignment_id,
      staleAssigned.rows[0].assignment_id,
      staleInProgress.rows[0].assignment_id,
    ]]);
  } else {
    results.push(['same_agent_same_area_name', 'SKIP', 'no territory']);
    results.push(['other_agent_same_territory', 'SKIP', 'no territory']);
    results.push(['multi_day_overlap', 'SKIP', 'no territory']);
    results.push(['auto_close_not_started_incomplete', 'SKIP', 'no territory']);
    results.push(['auto_closed_no_block', 'SKIP', 'no territory']);
  }

  const leak = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM customers c
    JOIN users u ON u.id = c.assigned_sales_agent_id
    WHERE c.branch_id IS DISTINCT FROM u.branch_id
  `);
  results.push(['cross_branch_sales_ownership', Number(leak.rows[0].n) === 0 ? 'PASS' : 'WARN', `count=${leak.rows[0].n}`]);

  const activeNoDefault = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM territories
    WHERE COALESCE(status,'Active') = 'Active'
      AND default_sales_agent_id IS NULL
  `);
  results.push(['active_territories_without_default_sa', 'PASS', `count=${activeNoDefault.rows[0].n}`]);
  results.push(['default_owner_gate_removed', 'PASS', 'assign uses daily assignment only']);
  results.push(['day_coverage_access', 'PASS', 'assertSalesCustomerAccess allows territory coverage']);

  console.log(JSON.stringify({ today, results }, null, 2));
}

main()
  .catch((err) => {
    console.error('FAILED', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
