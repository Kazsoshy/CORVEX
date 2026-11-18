/**
 * Smoke checks for BM Approval Center UX helpers + candidate profile endpoint wiring.
 * Usage: node scripts/test_approval_center_ux_smoke.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import { getIdentityVerificationById } from '../lib/customerIdentityVerification.js';
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

  const ticket = await pool.query(
    `SELECT verification_id, branch_id, match_candidates_json
     FROM customer_identity_verifications
     WHERE status IN ('Pending', 'Needs Evidence')
     ORDER BY verification_id DESC
     LIMIT 1`
  );
  if (!ticket.rows.length) {
    check('pending identity ticket available for candidate smoke', true, 'skipped — none pending');
  } else {
    const row = await getIdentityVerificationById(pool, ticket.rows[0].verification_id);
    const candidates = row.match_candidates_json || [];
    check('getIdentityVerificationById returns ticket', Boolean(row?.verification_id));
    check('ticket has candidates array', Array.isArray(candidates));
    if (candidates[0]?.customer_id) {
      const cust = await pool.query(
        `SELECT customer_id, contact_phone, branch_id FROM customers WHERE customer_id = $1`,
        [candidates[0].customer_id]
      );
      check(
        'candidate customer exists for profile endpoint',
        cust.rows.length === 1,
        `customer=${candidates[0].customer_id}`
      );
      check('maskPhone works', Boolean(maskPhone(cust.rows[0]?.contact_phone || '09171234567')));
    } else {
      check('candidate customer exists for profile endpoint', true, 'skipped — empty candidates');
    }
  }
} finally {
  await pool.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nPassed: ${results.length - failed.length}/${results.length}`);
if (failed.length) process.exit(1);
