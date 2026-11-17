/**
 * Smoke checks for SA FAR one-per-assignment workflow.
 * Usage: node backend/scripts/test_sa_far_assignment_workflow.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import {
  SALES_ASSIGNMENT_OUTCOMES,
  isFarEditableNow,
  farEditableUntilDate,
  hasFarPhotoEvidence,
  validateSalesFarEvidence,
} from '../lib/fieldActivityReports.js';

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

  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'field_activity_reports'
      AND column_name IN (
        'review_status', 'revision_history_json', 'photo_exception_reason',
        'is_superseded', 'superseded_by', 'edit_reopened_until', 'updated_at'
      )
    ORDER BY 1
  `);
  assert(cols.rows.length === 7, `FAR review columns missing: ${cols.rows.map((r) => r.column_name).join(',')}`);
  results.push(['far_review_columns', 'PASS', `count=${cols.rows.length}`]);

  const uniq = await pool.query(`
    SELECT indexname FROM pg_indexes
    WHERE indexname = 'uq_far_one_active_per_assignment'
  `);
  assert(uniq.rows.length === 1, 'unique active FAR index missing');
  results.push(['unique_active_far_index', 'PASS']);

  const dupes = await pool.query(`
    SELECT assignment_id, COUNT(*)::int AS c
    FROM field_activity_reports
    WHERE assignment_id IS NOT NULL AND COALESCE(is_superseded, FALSE) = FALSE
    GROUP BY assignment_id
    HAVING COUNT(*) > 1
  `);
  assert(dupes.rows.length === 0, `active duplicate FARs remain: ${JSON.stringify(dupes.rows)}`);
  results.push(['no_active_duplicates', 'PASS']);

  assert(SALES_ASSIGNMENT_OUTCOMES.length === 5, 'expected 5 assignment outcomes');
  results.push(['assignment_outcomes', 'PASS']);

  const until = farEditableUntilDate('2026-11-13', '2026-11-13');
  assert(until instanceof Date && Number.isFinite(until.getTime()), 'editable until date failed');
  assert(
    isFarEditableNow({ workDate: '2099-01-01', endDate: '2099-01-01' }),
    'future coverage should be editable'
  );
  assert(
    !isFarEditableNow({ workDate: '2020-01-01', endDate: '2020-01-01' }),
    'past coverage should not be editable without reopen'
  );
  assert(
    isFarEditableNow({
      workDate: '2020-01-01',
      endDate: '2020-01-01',
      editReopenedUntil: new Date(Date.now() + 60_000).toISOString(),
    }),
    'reopen window should allow edit'
  );
  results.push(['deadline_helpers', 'PASS']);

  const evidenceOk = validateSalesFarEvidence({
    photo: null,
    photoExceptionReason: 'Camera unavailable in field',
  });
  assert(evidenceOk.ok, 'photo exception should validate');
  assert(hasFarPhotoEvidence(null, 'Camera unavailable'), 'hasFarPhotoEvidence exception');
  const evidenceBad = validateSalesFarEvidence({ photo: null, photoExceptionReason: '' });
  assert(!evidenceBad.ok, 'empty evidence should fail');
  results.push(['photo_exception_validation', 'PASS']);

  const agents = await pool.query(`
    SELECT u.id
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
    WHERE r.slug = 'sales_staff' AND u.status = 'Active'
    ORDER BY u.id
    LIMIT 1
  `);
  if (agents.rows[0]) {
    const agentId = agents.rows[0].id;
    const open = await pool.query(
      `SELECT assignment_id, status
       FROM sales_area_assignments
       WHERE sales_agent_id = $1 AND status = 'In Progress'
       ORDER BY assignment_id DESC
       LIMIT 1`,
      [agentId]
    );
    if (open.rows[0]) {
      const assignmentId = open.rows[0].assignment_id;
      const far = await pool.query(
        `SELECT report_id FROM field_activity_reports
         WHERE assignment_id = $1 AND COALESCE(is_superseded, FALSE) = FALSE`,
        [assignmentId]
      );
      results.push([
        'in_progress_assignment_sample',
        'PASS',
        `assignment=${assignmentId} far_count=${far.rows.length}`,
      ]);
    } else {
      results.push(['in_progress_assignment_sample', 'SKIP', 'no In Progress assignment']);
    }
  } else {
    results.push(['in_progress_assignment_sample', 'SKIP', 'no sales agent']);
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
