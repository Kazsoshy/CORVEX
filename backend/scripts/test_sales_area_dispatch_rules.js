/**
 * Smoke checks for sales area dispatch rules.
 * Usage: node backend/scripts/test_sales_area_dispatch_rules.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import { findAreaAssignmentConflicts, normalizeAreaName } from '../lib/salesAreaAssignments.js';
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

  const idx = await pool.query(`
    SELECT indexname FROM pg_indexes
    WHERE indexname IN ('uq_sales_area_territory_day', 'uq_sales_area_agent_name_day')
    ORDER BY 1
  `);
  assert(idx.rows.length === 2, 'unique indexes missing');
  results.push(['unique_indexes', 'PASS']);

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
    // Ensure a seed assignment for conflict detection if none exists for a distinct name.
    const probeName = `QA Probe Area ${Date.now()}`;
    const insert = await pool.query(
      `INSERT INTO sales_area_assignments (
         branch_id, sales_agent_id, territory_id, area_name, coverage_notes,
         work_date, status, latitude, longitude, radius_meters
       ) VALUES ($1, $2, NULL, $3, 'probe', $4::date, 'Assigned', NULL, NULL, 800)
       RETURNING assignment_id`,
      [agent.branch_id, agent.id, probeName, today]
    );
    const conflictSameName = await findAreaAssignmentConflicts(pool, {
      branchId: agent.branch_id,
      salesAgentId: agent.id,
      workDate: today,
      areaName: probeName,
    });
    assert(conflictSameName.conflicts.some((c) => c.code === 'same_agent_same_area_name'), 'same area name not blocked');
    results.push(['same_agent_same_area_name', 'PASS']);

    if (agents.rows.length >= 2 && Number(agents.rows[1].branch_id) === Number(agent.branch_id)) {
      const other = agents.rows[1];
      // Create territory assignment for agent if missing today.
      const existingTerr = await pool.query(
        `SELECT assignment_id FROM sales_area_assignments
         WHERE territory_id = $1 AND work_date = $2::date
         LIMIT 1`,
        [t.territory_id, today]
      );
      let terrAssignmentId = existingTerr.rows[0]?.assignment_id;
      if (!terrAssignmentId) {
        const created = await pool.query(
          `INSERT INTO sales_area_assignments (
             branch_id, sales_agent_id, territory_id, area_name, work_date, status, radius_meters
           ) VALUES ($1, $2, $3, $4, $5::date, 'Assigned', 800)
           RETURNING assignment_id`,
          [agent.branch_id, agent.id, t.territory_id, t.territory_name, today]
        );
        terrAssignmentId = created.rows[0].assignment_id;
      }
      const conflictTerritory = await findAreaAssignmentConflicts(pool, {
        branchId: agent.branch_id,
        salesAgentId: other.id,
        workDate: today,
        territoryId: t.territory_id,
        areaName: `${t.territory_name} Alt`,
      });
      assert(
        conflictTerritory.conflicts.some((c) => c.code === 'other_agent_same_territory' || c.code === 'same_agent_same_territory'),
        'same territory same day not blocked across agents'
      );
      results.push(['other_agent_same_territory', 'PASS', `assignment=${terrAssignmentId}`]);
    } else {
      results.push(['other_agent_same_territory', 'SKIP', 'need 2 sales agents in one branch']);
    }

    await pool.query(`DELETE FROM sales_area_assignments WHERE assignment_id = $1`, [insert.rows[0].assignment_id]);
  } else {
    results.push(['same_agent_same_area_name', 'SKIP', 'no territory']);
    results.push(['other_agent_same_territory', 'SKIP', 'no territory']);
  }

  // Cross-branch customer ownership leak check
  const leak = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM customers c
    JOIN users u ON u.id = c.assigned_sales_agent_id
    WHERE c.branch_id IS DISTINCT FROM u.branch_id
  `);
  results.push(['cross_branch_sales_ownership', Number(leak.rows[0].n) === 0 ? 'PASS' : 'WARN', `count=${leak.rows[0].n}`]);

  console.log(JSON.stringify({ today, results }, null, 2));
}

main()
  .catch((err) => {
    console.error('FAILED', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
