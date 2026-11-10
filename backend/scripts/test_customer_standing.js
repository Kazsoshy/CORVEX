/**
 * Verify shared overdue SQL and standing flags.
 * Run: node backend/scripts/test_customer_standing.js
 */
import dotenv from 'dotenv';
import path from 'path';
import pkg from 'pg';
import {
  OVERDUE_CUSTOMER_SQL,
  paymentStandingFromFlags,
} from '../lib/customerStanding.js';

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
  assert(paymentStandingFromFlags({ outstandingBalance: 0, hasOverdueInvoice: false }) === 'Current', 'zero balance');
  assert(paymentStandingFromFlags({ outstandingBalance: 100, hasOverdueInvoice: false }) === 'Has Balance', 'future balance');
  assert(paymentStandingFromFlags({ outstandingBalance: 100, hasOverdueInvoice: true }) === 'Overdue', 'overdue');
  assert(paymentStandingFromFlags({ outstandingBalance: 0, hasOverdueInvoice: true }) === 'Current', 'paid but flag ignored when zero');

  const sample = await pool.query(`
    SELECT c.customer_id,
           COALESCE(ca.outstanding_balance, 0)::float AS balance,
           (${OVERDUE_CUSTOMER_SQL}) AS has_overdue
    FROM customers c
    LEFT JOIN customer_activity ca ON ca.customer_id = c.customer_id
    WHERE c.status = 'Active'
    ORDER BY c.customer_id
    LIMIT 50
  `);

  let hasBalanceNotOverdue = 0;
  let overdue = 0;
  let current = 0;
  for (const row of sample.rows) {
    const standing = paymentStandingFromFlags({
      outstandingBalance: row.balance,
      hasOverdueInvoice: row.has_overdue,
    });
    if (standing === 'Has Balance') {
      assert(row.balance > 0 && !row.has_overdue, `Has Balance invariant failed for ${row.customer_id}`);
      hasBalanceNotOverdue += 1;
    } else if (standing === 'Overdue') {
      assert(row.has_overdue, `Overdue invariant failed for ${row.customer_id}`);
      overdue += 1;
    } else {
      assert(row.balance <= 0, `Current invariant failed for ${row.customer_id}`);
      current += 1;
    }
  }

  console.log(JSON.stringify({
    unit: 'PASS',
    sample: sample.rows.length,
    current,
    hasBalanceNotOverdue,
    overdue,
  }, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error('FAIL', err.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
