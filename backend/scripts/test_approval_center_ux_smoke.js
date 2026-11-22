/**
 * Smoke checks for BM Approval Center UX helpers (branch resolution + masking).
 * Identity verification tickets are no longer part of Approval Center.
 * Usage: node scripts/test_approval_center_ux_smoke.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import { maskPhone } from '../lib/customerDuplicateLookup.js';

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

function getUserBranchId(user) {
  const raw = user?.branchId ?? user?.branch_id ?? user?.branch?.id ?? null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

try {
  check('session branch.id resolves', getUserBranchId({ branch: { id: 7 } }) === 7);
  check('session branchId resolves', getUserBranchId({ branchId: 3 }) === 3);
  check('missing branch returns null', getUserBranchId({}) == null);
  check('maskPhone works', Boolean(maskPhone('09171234567')));

  const pendingLegacy = await pool.query(
    `SELECT customer_id FROM customers
     WHERE status = 'Pending Identity Review'
     ORDER BY customer_id DESC
     LIMIT 1`
  );
  check(
    'legacy Pending Identity Review query runs',
    true,
    pendingLegacy.rows.length
      ? `customer=${pendingLegacy.rows[0].customer_id}`
      : 'none pending'
  );
} finally {
  await pool.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nPassed: ${results.length - failed.length}/${results.length}`);
if (failed.length) process.exit(1);
