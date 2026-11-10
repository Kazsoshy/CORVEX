/**
 * Smoke checks for BM Branch Activity helpers.
 * Run: node backend/scripts/test_branch_activity_audit.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import {
  formatBranchActivityLabel,
  listBranchActivity,
  BM_ACTIVITY_MODULE_GROUPS,
} from '../lib/branchActivityAudit.js';
import { writeAuditLog, AUDIT_STATUS } from '../lib/auditLog.js';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });
const { Pool } = pkg;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(formatBranchActivityLabel({ activity: 'Collection reversed' }) === 'Collection Reversed', 'reverse label');
assert(formatBranchActivityLabel({ activity: 'Approve Invoice' }) === 'Invoice Approved', 'invoice label');
assert(BM_ACTIVITY_MODULE_GROUPS.credit.label === 'Credit Approvals', 'credit group');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corvex',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

async function main() {
  const branch = await pool.query(
    `SELECT id FROM branches WHERE COALESCE(status, 'Active') = 'Active' ORDER BY id LIMIT 1`
  );
  const branchId = branch.rows[0]?.id;
  assert(branchId, 'no branch');

  // OM-style actor (null branch) writing an audit for this branch.
  await writeAuditLog(pool, {
    userId: null,
    userName: 'Smoke OM Actor',
    roleName: 'Operating Manager',
    module: 'Credit Approvals',
    activity: 'Credit Approved',
    action: 'Credit Approved',
    description: 'Smoke OM approval affecting branch.',
    status: AUDIT_STATUS.APPROVED,
    affectedRecord: null,
    branchId,
    ipAddress: '127.0.0.1',
  });

  const rows = await listBranchActivity(pool, {
    branchId,
    moduleGroup: 'credit',
    search: 'Smoke OM Actor',
    limit: 20,
  });
  assert(rows.some((r) => String(r.user_name).includes('Smoke OM Actor')), 'OM action visible to branch');

  // Actor-branch fallback should not be required when branch_id is set.
  const all = await listBranchActivity(pool, { branchId, moduleGroup: 'all', limit: 50 });
  assert(Array.isArray(all), 'list all');

  console.log(JSON.stringify({
    ok: true,
    branchId,
    creditHits: rows.length,
    allHits: all.length,
  }, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error('FAIL', err.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
